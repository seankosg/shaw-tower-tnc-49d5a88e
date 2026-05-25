CREATE OR REPLACE FUNCTION public.punch_recalc_summary(p_summary_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_mat_app text;
  v_mat_proc text;
  v_drw text;
  v_mos text;
BEGIN
  SELECT is_summary, COALESCE(override_fields,'{}'::jsonb)
    INTO v_is_summary, v_overrides
    FROM public.punch_items
   WHERE id = p_summary_id;

  IF NOT v_is_summary THEN
    RETURN;
  END IF;

  SELECT COUNT(*)
    INTO v_kid_cnt
    FROM public.punch_items
   WHERE parent_id = p_summary_id;

  IF v_kid_cnt = 0 THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(weight),0),
    CASE WHEN SUM(weight) > 0 THEN SUM(COALESCE(actual_progress_pct,0) * weight) / SUM(weight) ELSE 0 END,
    CASE WHEN SUM(weight) > 0 THEN SUM(COALESCE(planned_progress_pct,0) * weight) / SUM(weight) ELSE 0 END,
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
    WHEN v_variance >= 5 THEN 'ahead'::public.punch_health_status
    WHEN v_variance > -5 THEN 'on_track'::public.punch_health_status
    WHEN v_variance > -15 THEN 'behind'::public.punch_health_status
    ELSE 'critical'::public.punch_health_status
  END;

  SELECT jsonb_object_agg(stage, payload) INTO v_stage_status
  FROM (
    SELECT s.stage::text AS stage,
      jsonb_build_object(
        'count', COUNT(c.id),
        'done', COUNT(c.id) FILTER (WHERE COALESCE(c.actual_progress_pct,0) >= 100),
        'pct', CASE WHEN SUM(c.weight) > 0
                    THEN ROUND(SUM(COALESCE(c.actual_progress_pct,0) * c.weight) / SUM(c.weight), 2)
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
      ON c.parent_id = p_summary_id
     AND c.subtask_stage = s.stage
    GROUP BY s.stage
  ) t;

  SELECT
    CASE
      WHEN BOOL_AND(material_approval_status = 'not_required') THEN 'not_required'
      WHEN BOOL_AND(material_approval_status IN ('approved', 'not_required'))
        AND BOOL_OR(material_approval_status = 'approved') THEN 'approved'
      ELSE 'pending'
    END,
    CASE
      WHEN BOOL_AND(material_procurement_status = 'not_required') THEN 'not_required'
      WHEN BOOL_AND(material_procurement_status IN ('secured', 'not_required'))
        AND BOOL_OR(material_procurement_status = 'secured') THEN 'secured'
      WHEN BOOL_OR(material_procurement_status = 'partially_secured')
        OR (BOOL_OR(material_procurement_status = 'secured') AND BOOL_OR(material_procurement_status = 'pending')) THEN 'partially_secured'
      ELSE 'pending'
    END,
    CASE
      WHEN BOOL_AND(drawing_approval_status = 'not_required') THEN 'not_required'
      WHEN BOOL_AND(drawing_approval_status IN ('approved', 'not_required'))
        AND BOOL_OR(drawing_approval_status = 'approved') THEN 'approved'
      ELSE 'pending'
    END,
    CASE
      WHEN BOOL_AND(mos_approval_status = 'not_required') THEN 'not_required'
      WHEN BOOL_AND(mos_approval_status IN ('approved', 'not_required'))
        AND BOOL_OR(mos_approval_status = 'approved') THEN 'approved'
      ELSE 'pending'
    END
  INTO v_mat_app, v_mat_proc, v_drw, v_mos
  FROM public.punch_items
  WHERE parent_id = p_summary_id;

  UPDATE public.punch_items
     SET actual_progress_pct = CASE WHEN v_overrides ? 'actual_progress_pct' THEN actual_progress_pct ELSE ROUND(v_actual, 2) END,
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