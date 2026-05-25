-- 1) created_by 컬럼
ALTER TABLE public.punch_items
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_punch_items_created_by ON public.punch_items(created_by);

-- 2) RLS: UPDATE / DELETE 정책에 작성자 OR 절 추가
DROP POLICY IF EXISTS "Privileged can update punch" ON public.punch_items;
CREATE POLICY "Privileged can update punch" ON public.punch_items
  FOR UPDATE
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::public.app_role[])
    OR (public.has_role(auth.uid(), 'd_superuser'::public.app_role) AND public.user_team_matches(auth.uid(), team))
    OR (created_by IS NOT NULL AND created_by = auth.uid())
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::public.app_role[])
    OR (public.has_role(auth.uid(), 'd_superuser'::public.app_role) AND public.user_team_matches(auth.uid(), team))
    OR (created_by IS NOT NULL AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "Privileged can delete punch" ON public.punch_items;
CREATE POLICY "Privileged can delete punch" ON public.punch_items
  FOR DELETE
  USING (
    public.can_write_for_team(auth.uid(), team)
    OR (created_by IS NOT NULL AND created_by = auth.uid())
  );

-- 3) add_punch_subtask RPC: created_by 기록
CREATE OR REPLACE FUNCTION public.add_punch_subtask(p_parent_id uuid, p_stage subtask_stage_enum, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF NOT (
    public.has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::public.app_role[])
    OR (
      public.has_role(auth.uid(),'d_superuser'::public.app_role)
      AND public.user_team_matches(auth.uid(), v_parent.team)
    )
    OR (v_parent.created_by IS NOT NULL AND v_parent.created_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

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
      data_date, raw_payload, custom_payload, updated_by, created_by
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
      v_parent.data_date, v_parent.raw_payload, v_parent.custom_payload, auth.uid(), auth.uid()
    ) RETURNING id INTO v_first_child_id;

    UPDATE public.punch_items SET is_summary = true WHERE id = v_parent.id;
  END IF;

  SELECT COUNT(*) INTO v_child_count FROM public.punch_items WHERE parent_id = p_parent_id;

  INSERT INTO public.punch_items (
    project_id, item_no, parent_id, is_summary, subtask_stage,
    outstanding_work, location, team, main_trade, sub_trade, work_type,
    subcontractor_name, subsub_name, hdec_pic_name, hdec_eng_name,
    planned_start_date, planned_completion_date,
    weight, remarks, raw_payload, custom_payload, updated_by, created_by
  ) VALUES (
    v_parent.project_id,
    v_parent.item_no || '.' || (v_child_count + 1)::text,
    p_parent_id,
    false,
    p_stage,
    COALESCE(p_payload->>'outstanding_work', v_parent.outstanding_work),
    COALESCE(p_payload->>'location', v_parent.location),
    COALESCE(NULLIF(p_payload->>'team','')::public.team_type, v_parent.team),
    COALESCE(p_payload->>'main_trade', v_parent.main_trade),
    COALESCE(p_payload->>'sub_trade', v_parent.sub_trade),
    COALESCE(p_payload->>'work_type', v_parent.work_type),
    COALESCE(p_payload->>'subcontractor_name', v_parent.subcontractor_name),
    COALESCE(p_payload->>'subsub_name', v_parent.subsub_name),
    COALESCE(p_payload->>'hdec_pic_name', v_parent.hdec_pic_name),
    COALESCE(p_payload->>'hdec_eng_name', v_parent.hdec_eng_name),
    NULLIF(p_payload->>'planned_start_date','')::date,
    NULLIF(p_payload->>'planned_completion_date','')::date,
    COALESCE(NULLIF(p_payload->>'weight','')::numeric, 1),
    p_payload->>'remarks',
    '{}'::jsonb, '{}'::jsonb, auth.uid(), auth.uid()
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;