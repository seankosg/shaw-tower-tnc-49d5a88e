
-- ============================================================
-- 1. ENUM
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.subtask_stage_enum AS ENUM ('pre_engineering','physical_work','inspection');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- 2. COLUMNS
-- ============================================================
ALTER TABLE public.punch_items
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.punch_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_summary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subtask_stage public.subtask_stage_enum,
  ADD COLUMN IF NOT EXISTS stage_status jsonb,
  ADD COLUMN IF NOT EXISTS override_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_punch_items_parent_id ON public.punch_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_punch_items_is_summary ON public.punch_items(is_summary) WHERE is_summary = true;

-- non-summary rows must have empty override_fields
ALTER TABLE public.punch_items DROP CONSTRAINT IF EXISTS chk_punch_override_only_summary;
ALTER TABLE public.punch_items ADD CONSTRAINT chk_punch_override_only_summary
  CHECK (is_summary OR override_fields = '{}'::jsonb);

-- ============================================================
-- 3. DEPTH GUARD (max 2 levels)
-- ============================================================
CREATE OR REPLACE FUNCTION public.punch_depth_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent_parent uuid;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'punch_items: parent_id cannot reference self';
    END IF;
    SELECT parent_id INTO v_parent_parent FROM public.punch_items WHERE id = NEW.parent_id;
    IF v_parent_parent IS NOT NULL THEN
      RAISE EXCEPTION 'punch_items: maximum hierarchy depth is 2 (no grandchildren allowed)';
    END IF;
    IF NEW.is_summary THEN
      RAISE EXCEPTION 'punch_items: a row with parent_id cannot be a summary';
    END IF;
    IF NEW.subtask_stage IS NULL THEN
      RAISE EXCEPTION 'punch_items: subtask_stage is required for child rows';
    END IF;
  ELSE
    IF NEW.subtask_stage IS NOT NULL THEN
      RAISE EXCEPTION 'punch_items: subtask_stage must be NULL for non-child rows';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_punch_depth_guard ON public.punch_items;
CREATE TRIGGER trg_punch_depth_guard
  BEFORE INSERT OR UPDATE ON public.punch_items
  FOR EACH ROW EXECUTE FUNCTION public.punch_depth_guard();

-- ============================================================
-- 4. ROLLUP — recalculate parent from children, skip override keys
-- ============================================================
CREATE OR REPLACE FUNCTION public.punch_recalc_summary(p_summary_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_overrides jsonb;
  v_is_summary boolean;
  v_total_weight numeric;
  v_actual numeric;
  v_planned numeric;
  v_min_planned_start date;
  v_max_planned_end date;
  v_min_actual_start date;
  v_max_actual_end date;
  v_health public.punch_health_status;
  v_variance numeric;
  v_pre_ready boolean;
  v_stage_status jsonb;
  v_kid_cnt int;
  -- gate aggregation
  v_mat_app text; v_mat_proc text; v_drw text; v_mos text;
BEGIN
  SELECT is_summary, COALESCE(override_fields,'{}'::jsonb)
    INTO v_is_summary, v_overrides
    FROM public.punch_items WHERE id = p_summary_id;

  IF NOT v_is_summary THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_kid_cnt FROM public.punch_items WHERE parent_id = p_summary_id;
  IF v_kid_cnt = 0 THEN
    -- auto-demote handled elsewhere
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(weight),0),
    CASE WHEN SUM(weight) > 0 THEN SUM(COALESCE(actual_progress_pct,0)*weight)/SUM(weight) ELSE 0 END,
    CASE WHEN SUM(weight) > 0 THEN SUM(COALESCE(planned_progress_pct,0)*weight)/SUM(weight) ELSE 0 END,
    MIN(planned_start_date),
    MAX(planned_completion_date),
    MIN(actual_start_date),
    CASE WHEN BOOL_AND(actual_completion_date IS NOT NULL) THEN MAX(actual_completion_date) END,
    BOOL_AND(pre_engineering_ready)
  INTO v_total_weight, v_actual, v_planned, v_min_planned_start, v_max_planned_end,
       v_min_actual_start, v_max_actual_end, v_pre_ready
  FROM public.punch_items
  WHERE parent_id = p_summary_id;

  v_variance := COALESCE(v_actual,0) - COALESCE(v_planned,0);

  v_health := CASE
    WHEN v_variance >= 0 THEN 'on_track'::public.punch_health_status
    WHEN v_variance >= -10 THEN 'at_risk'::public.punch_health_status
    ELSE 'behind'::public.punch_health_status
  END;

  -- 3-stage status JSON
  SELECT jsonb_object_agg(stage, payload) INTO v_stage_status
  FROM (
    SELECT s.stage::text AS stage,
      jsonb_build_object(
        'count', COUNT(c.id),
        'done', COUNT(c.id) FILTER (WHERE COALESCE(c.actual_progress_pct,0) >= 100),
        'pct', CASE WHEN SUM(c.weight) > 0
                    THEN ROUND(SUM(COALESCE(c.actual_progress_pct,0)*c.weight)/SUM(c.weight), 2)
                    ELSE 0 END,
        'status', CASE
          WHEN COUNT(c.id) = 0 THEN 'not_started'
          WHEN COUNT(c.id) FILTER (WHERE COALESCE(c.actual_progress_pct,0) >= 100) = COUNT(c.id) THEN 'done'
          WHEN COUNT(c.id) FILTER (WHERE COALESCE(c.actual_progress_pct,0) > 0) > 0 THEN 'in_progress'
          ELSE 'not_started'
        END
      ) AS payload
    FROM (VALUES ('pre_engineering'::public.subtask_stage_enum),
                 ('physical_work'::public.subtask_stage_enum),
                 ('inspection'::public.subtask_stage_enum)) s(stage)
    LEFT JOIN public.punch_items c
      ON c.parent_id = p_summary_id AND c.subtask_stage = s.stage
    GROUP BY s.stage
  ) t;

  -- aggregate gate status (worst-case = pending wins until all approved)
  SELECT
    CASE WHEN BOOL_AND(material_approval_status = 'approved') THEN 'approved'
         WHEN BOOL_OR(material_approval_status = 'rejected') THEN 'rejected'
         ELSE 'pending' END,
    CASE WHEN BOOL_AND(material_procurement_status = 'delivered') THEN 'delivered'
         WHEN BOOL_OR(material_procurement_status = 'in_progress') THEN 'in_progress'
         ELSE 'pending' END,
    CASE WHEN BOOL_AND(drawing_approval_status = 'approved') THEN 'approved'
         WHEN BOOL_OR(drawing_approval_status = 'rejected') THEN 'rejected'
         ELSE 'pending' END,
    CASE WHEN BOOL_AND(mos_approval_status = 'approved') THEN 'approved'
         WHEN BOOL_OR(mos_approval_status = 'rejected') THEN 'rejected'
         ELSE 'pending' END
  INTO v_mat_app, v_mat_proc, v_drw, v_mos
  FROM public.punch_items WHERE parent_id = p_summary_id;

  UPDATE public.punch_items SET
    actual_progress_pct = CASE WHEN v_overrides ? 'actual_progress_pct' THEN actual_progress_pct ELSE ROUND(v_actual, 2) END,
    planned_progress_pct = CASE WHEN v_overrides ? 'planned_progress_pct' THEN planned_progress_pct ELSE ROUND(v_planned, 2) END,
    progress_variance_pct = CASE WHEN v_overrides ? 'progress_variance_pct' THEN progress_variance_pct ELSE ROUND(v_variance, 2) END,
    health_status = CASE WHEN v_overrides ? 'health_status' THEN health_status ELSE v_health END,
    planned_start_date = CASE WHEN v_overrides ? 'planned_start_date' THEN planned_start_date ELSE v_min_planned_start END,
    planned_completion_date = CASE WHEN v_overrides ? 'planned_completion_date' THEN planned_completion_date ELSE v_max_planned_end END,
    actual_start_date = CASE WHEN v_overrides ? 'actual_start_date' THEN actual_start_date ELSE v_min_actual_start END,
    actual_completion_date = CASE WHEN v_overrides ? 'actual_completion_date' THEN actual_completion_date ELSE v_max_actual_end END,
    pre_engineering_ready = CASE WHEN v_overrides ? 'pre_engineering_ready' THEN pre_engineering_ready ELSE COALESCE(v_pre_ready,false) END,
    stage_status = CASE WHEN v_overrides ? 'stage_status' THEN stage_status ELSE v_stage_status END,
    material_approval_status = CASE WHEN v_overrides ? 'material_approval_status' THEN material_approval_status ELSE v_mat_app::public.punch_gate_status END,
    material_procurement_status = CASE WHEN v_overrides ? 'material_procurement_status' THEN material_procurement_status ELSE v_mat_proc::public.punch_procurement_status END,
    drawing_approval_status = CASE WHEN v_overrides ? 'drawing_approval_status' THEN drawing_approval_status ELSE v_drw::public.punch_gate_status END,
    mos_approval_status = CASE WHEN v_overrides ? 'mos_approval_status' THEN mos_approval_status ELSE v_mos::public.punch_gate_status END,
    updated_at = now()
  WHERE id = p_summary_id;
END;
$$;

-- AFTER trigger on child changes -> recompute parent
CREATE OR REPLACE FUNCTION public.punch_rollup_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_parent uuid;
  v_new_parent uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_parent := NEW.parent_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_parent := OLD.parent_id;
    v_new_parent := NEW.parent_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_parent := OLD.parent_id;
  END IF;

  IF v_old_parent IS NOT NULL AND v_old_parent IS DISTINCT FROM v_new_parent THEN
    PERFORM public.punch_recalc_summary(v_old_parent);
  END IF;
  IF v_new_parent IS NOT NULL THEN
    PERFORM public.punch_recalc_summary(v_new_parent);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_punch_rollup ON public.punch_items;
CREATE TRIGGER trg_punch_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.punch_items
  FOR EACH ROW EXECUTE FUNCTION public.punch_rollup_trigger();

-- ============================================================
-- 5. AUTO-DEMOTE empty summary
-- ============================================================
CREATE OR REPLACE FUNCTION public.punch_auto_demote_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_cnt int;
BEGIN
  IF OLD.parent_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt FROM public.punch_items WHERE parent_id = OLD.parent_id;
    IF v_cnt = 0 THEN
      UPDATE public.punch_items
        SET is_summary = false,
            stage_status = NULL,
            override_fields = '{}'::jsonb
        WHERE id = OLD.parent_id AND is_summary = true;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_punch_auto_demote ON public.punch_items;
CREATE TRIGGER trg_punch_auto_demote
  AFTER DELETE OR UPDATE OF parent_id ON public.punch_items
  FOR EACH ROW EXECUTE FUNCTION public.punch_auto_demote_trigger();

-- ============================================================
-- 6. ADD SUBTASK RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_punch_subtask(
  p_parent_id uuid,
  p_stage public.subtask_stage_enum,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent public.punch_items%ROWTYPE;
  v_new_id uuid;
  v_first_child_id uuid;
  v_child_count int;
BEGIN
  SELECT * INTO v_parent FROM public.punch_items WHERE id = p_parent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parent not found'; END IF;
  IF v_parent.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add subtask under a child (max 2 levels)';
  END IF;

  -- permission: caller must be allowed to update parent OR insert into target team
  IF NOT (public.has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::public.app_role[])
          OR (public.has_role(auth.uid(),'d_superuser'::public.app_role)
              AND public.user_team_matches(auth.uid(), v_parent.team))) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Promote parent + clone original as first physical_work child if not yet summary
  IF NOT v_parent.is_summary THEN
    INSERT INTO public.punch_items (
      project_id, item_no, parent_id, is_summary, subtask_stage,
      outstanding_work, location, team, main_trade, sub_trade, work_type,
      level, category1, category2, category3, critical_level,
      subcontractor_name, subsub_name, hdec_pic_name, hdec_eng_name,
      planned_start_date, planned_completion_date,
      actual_start_date, actual_completion_date,
      actual_progress_pct, planned_progress_pct, progress_variance_pct,
      health_status, completion_status, remarks, weight,
      material_approval_status, material_approval_date,
      material_procurement_status, material_procurement_date,
      drawing_approval_status, drawing_approval_date,
      mos_approval_status, mos_approval_date,
      pre_engineering_ready, pre_engineering_blockers,
      data_date, raw_payload, custom_payload, updated_by
    ) VALUES (
      v_parent.project_id,
      v_parent.item_no || '.1',
      v_parent.id,
      false,
      'physical_work',
      v_parent.outstanding_work, v_parent.location, v_parent.team,
      v_parent.main_trade, v_parent.sub_trade, v_parent.work_type,
      v_parent.level, v_parent.category1, v_parent.category2, v_parent.category3, v_parent.critical_level,
      v_parent.subcontractor_name, v_parent.subsub_name, v_parent.hdec_pic_name, v_parent.hdec_eng_name,
      v_parent.planned_start_date, v_parent.planned_completion_date,
      v_parent.actual_start_date, v_parent.actual_completion_date,
      v_parent.actual_progress_pct, v_parent.planned_progress_pct, v_parent.progress_variance_pct,
      v_parent.health_status, v_parent.completion_status, v_parent.remarks, 1,
      v_parent.material_approval_status, v_parent.material_approval_date,
      v_parent.material_procurement_status, v_parent.material_procurement_date,
      v_parent.drawing_approval_status, v_parent.drawing_approval_date,
      v_parent.mos_approval_status, v_parent.mos_approval_date,
      v_parent.pre_engineering_ready, v_parent.pre_engineering_blockers,
      v_parent.data_date, v_parent.raw_payload, v_parent.custom_payload, auth.uid()
    ) RETURNING id INTO v_first_child_id;

    UPDATE public.punch_items SET is_summary = true WHERE id = v_parent.id;
  END IF;

  SELECT COUNT(*) INTO v_child_count FROM public.punch_items WHERE parent_id = p_parent_id;

  INSERT INTO public.punch_items (
    project_id, item_no, parent_id, is_summary, subtask_stage,
    outstanding_work, location, team, main_trade, sub_trade, work_type,
    planned_start_date, planned_completion_date,
    weight, remarks, raw_payload, custom_payload, updated_by
  ) VALUES (
    v_parent.project_id,
    v_parent.item_no || '.' || (v_child_count + 1)::text,
    p_parent_id,
    false,
    p_stage,
    COALESCE(p_payload->>'outstanding_work', v_parent.outstanding_work),
    COALESCE(p_payload->>'location', v_parent.location),
    COALESCE((p_payload->>'team')::public.team_enum, v_parent.team),
    COALESCE(p_payload->>'main_trade', v_parent.main_trade),
    p_payload->>'sub_trade',
    COALESCE(p_payload->>'work_type', v_parent.work_type),
    NULLIF(p_payload->>'planned_start_date','')::date,
    NULLIF(p_payload->>'planned_completion_date','')::date,
    COALESCE(NULLIF(p_payload->>'weight','')::numeric, 1),
    p_payload->>'remarks',
    '{}'::jsonb, '{}'::jsonb, auth.uid()
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ============================================================
-- 7. OVERRIDE / REVERT RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.override_summary_field(
  p_summary_id uuid,
  p_field text,
  p_value jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.punch_items%ROWTYPE;
  v_meta jsonb;
  v_sql text;
  v_allowed text[] := ARRAY[
    'actual_progress_pct','planned_progress_pct','progress_variance_pct',
    'planned_start_date','planned_completion_date','actual_start_date','actual_completion_date',
    'health_status','pre_engineering_ready','stage_status',
    'material_approval_status','material_procurement_status','drawing_approval_status','mos_approval_status'
  ];
BEGIN
  IF NOT (p_field = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Field % is not overridable', p_field;
  END IF;

  SELECT * INTO v_row FROM public.punch_items WHERE id = p_summary_id FOR UPDATE;
  IF NOT FOUND OR NOT v_row.is_summary THEN
    RAISE EXCEPTION 'Summary not found';
  END IF;

  IF NOT (public.has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::public.app_role[])
          OR (public.has_role(auth.uid(),'d_superuser'::public.app_role)
              AND public.user_team_matches(auth.uid(), v_row.team))) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_meta := jsonb_build_object(
    'by', auth.uid(),
    'at', now(),
    'value', p_value
  );

  -- update override_fields meta + value
  UPDATE public.punch_items
    SET override_fields = COALESCE(override_fields,'{}'::jsonb) || jsonb_build_object(p_field, v_meta),
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = p_summary_id;

  -- write the actual value into the corresponding column
  v_sql := format('UPDATE public.punch_items SET %I = $1 WHERE id = $2', p_field);

  IF p_field IN ('actual_progress_pct','planned_progress_pct','progress_variance_pct') THEN
    EXECUTE v_sql USING (p_value #>> '{}')::numeric, p_summary_id;
  ELSIF p_field IN ('planned_start_date','planned_completion_date','actual_start_date','actual_completion_date') THEN
    EXECUTE v_sql USING NULLIF(p_value #>> '{}','')::date, p_summary_id;
  ELSIF p_field = 'pre_engineering_ready' THEN
    EXECUTE v_sql USING (p_value #>> '{}')::boolean, p_summary_id;
  ELSIF p_field = 'stage_status' THEN
    EXECUTE v_sql USING p_value, p_summary_id;
  ELSIF p_field = 'health_status' THEN
    EXECUTE v_sql USING (p_value #>> '{}')::public.punch_health_status, p_summary_id;
  ELSIF p_field IN ('material_approval_status','drawing_approval_status','mos_approval_status') THEN
    EXECUTE v_sql USING (p_value #>> '{}')::public.punch_gate_status, p_summary_id;
  ELSIF p_field = 'material_procurement_status' THEN
    EXECUTE v_sql USING (p_value #>> '{}')::public.punch_procurement_status, p_summary_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_summary_field(
  p_summary_id uuid,
  p_field text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.punch_items%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.punch_items WHERE id = p_summary_id FOR UPDATE;
  IF NOT FOUND OR NOT v_row.is_summary THEN
    RAISE EXCEPTION 'Summary not found';
  END IF;

  IF NOT (public.has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::public.app_role[])
          OR (public.has_role(auth.uid(),'d_superuser'::public.app_role)
              AND public.user_team_matches(auth.uid(), v_row.team))) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.punch_items
    SET override_fields = COALESCE(override_fields,'{}'::jsonb) - p_field,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = p_summary_id;

  PERFORM public.punch_recalc_summary(p_summary_id);
END;
$$;

-- ============================================================
-- 8. EXISTING DATA AUTO-GROUP (manual run)
-- Groups rows whose item_no shares a prefix like "A.1.1", "A.1.2" -> parent "A.1"
-- Conservative: only groups when 2+ siblings share the same prefix and prefix
-- itself does not already exist as an item.
-- ============================================================
CREATE OR REPLACE FUNCTION public.migrate_existing_punch_to_groups(p_project_id uuid, p_dry_run boolean DEFAULT true)
RETURNS TABLE(parent_item_no text, child_count int, action text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_parent_id uuid;
BEGIN
  FOR r IN
    SELECT
      regexp_replace(item_no, '\.[^.]+$', '') AS prefix,
      COUNT(*) AS cnt,
      array_agg(id) AS ids,
      MIN(project_id) AS project_id
    FROM public.punch_items
    WHERE project_id = p_project_id
      AND parent_id IS NULL
      AND is_summary = false
      AND item_no ~ '\.[^.]+$'
    GROUP BY 1
    HAVING COUNT(*) >= 2
  LOOP
    -- skip if prefix exists as item
    IF EXISTS (SELECT 1 FROM public.punch_items WHERE project_id = p_project_id AND item_no = r.prefix) THEN
      parent_item_no := r.prefix; child_count := r.cnt; action := 'skipped_prefix_exists'; RETURN NEXT;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      parent_item_no := r.prefix; child_count := r.cnt; action := 'would_group'; RETURN NEXT;
    ELSE
      -- pick first row as basis, promote a NEW summary row
      INSERT INTO public.punch_items (project_id, item_no, is_summary, outstanding_work, team)
      SELECT project_id, r.prefix, true, 'Auto-grouped: ' || r.prefix, team
      FROM public.punch_items WHERE id = r.ids[1]
      RETURNING id INTO v_parent_id;

      UPDATE public.punch_items
        SET parent_id = v_parent_id, subtask_stage = 'physical_work'
        WHERE id = ANY(r.ids);

      parent_item_no := r.prefix; child_count := r.cnt; action := 'grouped'; RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;
