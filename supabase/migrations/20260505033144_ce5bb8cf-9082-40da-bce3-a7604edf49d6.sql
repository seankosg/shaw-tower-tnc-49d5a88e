
DROP FUNCTION IF EXISTS public.add_business_days_no_sun(date, integer);

TRUNCATE TABLE public.docs_omm;

ALTER TABLE public.docs_omm
  DROP COLUMN IF EXISTS contract_doc,
  DROP COLUMN IF EXISTS draft_section,
  DROP COLUMN IF EXISTS draft_target_date,
  DROP COLUMN IF EXISTS submission_target_date,
  DROP COLUMN IF EXISTS submission_actual_date,
  DROP COLUMN IF EXISTS approved_date,
  DROP COLUMN IF EXISTS softcopy_required,
  DROP COLUMN IF EXISTS hardcopy_required,
  DROP COLUMN IF EXISTS contractor_supplier;

ALTER TABLE public.docs_omm
  ADD COLUMN IF NOT EXISTS category_group text,
  ADD COLUMN IF NOT EXISTS section text,
  ADD COLUMN IF NOT EXISTS instruction_date date,
  ADD COLUMN IF NOT EXISTS draft_planned_date date,
  ADD COLUMN IF NOT EXISTS draft_actual_date date,
  ADD COLUMN IF NOT EXISTS pdf_required_qty integer,
  ADD COLUMN IF NOT EXISTS pdf_actual_qty integer,
  ADD COLUMN IF NOT EXISTS hardcopy_required_qty integer,
  ADD COLUMN IF NOT EXISTS hardcopy_actual_qty integer,
  ADD COLUMN IF NOT EXISTS draft_response_date date,
  ADD COLUMN IF NOT EXISTS draft_response_status text,
  ADD COLUMN IF NOT EXISTS final_planned_date date,
  ADD COLUMN IF NOT EXISTS final_actual_date date,
  ADD COLUMN IF NOT EXISTS final_response_planned_date date,
  ADD COLUMN IF NOT EXISTS final_response_actual_date date,
  ADD COLUMN IF NOT EXISTS final_response_status text,
  ADD COLUMN IF NOT EXISTS training_required text,
  ADD COLUMN IF NOT EXISTS subcontractor_id uuid,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.docs_omm(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS resubmission_seq integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_resubmission boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_stage text,
  ADD COLUMN IF NOT EXISTS current_status text;

CREATE INDEX IF NOT EXISTS idx_docs_omm_parent ON public.docs_omm(parent_id);
CREATE INDEX IF NOT EXISTS idx_docs_omm_project_sn ON public.docs_omm(project_id, sn);

DELETE FROM public.docs_field_config WHERE sub_module = 'omm';

INSERT INTO public.docs_field_config (sub_module, field_name, display_name, original_header, sort_order, is_enabled, is_required, source_origin, visible_to_roles, editable_to_roles)
VALUES
  ('omm', 'sn', 'No', 'No', 10, true, true, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'category', 'TEAM', 'TEAM', 20, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'category_group', 'Category', 'Category', 30, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'section', 'Section', 'Section', 40, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'work_trade_material', 'Work Trade / Material', 'Work Trade / Material', 50, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'subcontractor_name', 'Subcontractor', 'Subcontractor', 60, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'hdec_pic_name', 'HDEC PIC', 'HDEC PIC', 70, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'hdec_eng_name', 'HDEC ENG', 'HDEC ENG', 80, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'instruction_date', 'Instruction Date', 'Instruction Date', 90, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'draft_planned_date', 'D. Submission Planned', 'D. Submission Planned Date', 100, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'draft_actual_date', 'D. Submission Actual', 'D. Submission Actual Date', 110, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user,user}'),
  ('omm', 'pdf_required_qty', 'Readible PDF (Req)', 'Readible PDF', 120, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'pdf_actual_qty', 'PDF Check (Actual)', 'PDF Check', 130, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user,user}'),
  ('omm', 'hardcopy_required_qty', 'Hardcopy (Req)', 'Hardcopy', 140, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'hardcopy_actual_qty', 'Hardcopy Check (Actual)', 'Hardcopy Check', 150, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user,user}'),
  ('omm', 'draft_response_date', 'D. Response Date', 'D. Response Date', 160, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'draft_response_status', 'D. Response Status', 'D. Response Status', 170, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'final_planned_date', 'F. Submission Planned', 'F. Submission Planned Date', 180, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'final_actual_date', 'F. Submission Actual', 'F. Submission Actual Date', 190, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user,user}'),
  ('omm', 'final_response_planned_date', 'F. Response Planned', 'F. Response Planned Date', 200, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'final_response_actual_date', 'F. Response Actual', 'F. Actual Respond Date', 210, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'final_response_status', 'F. Response Status', 'F. Response Status', 220, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'training_required', 'Training Required', 'Traning Required', 230, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user}'),
  ('omm', 'remarks', 'Remarks', 'Remark', 240, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{admin,superuser,senior_user,user}'),
  ('omm', 'current_stage', 'Stage', NULL, 250, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{}'),
  ('omm', 'current_status', 'Status', NULL, 260, true, false, 'system', '{admin,superuser,senior_user,user,super_guest,guest}', '{}');

DELETE FROM public.import_header_mappings WHERE module='docs' AND sub_module='omm';

INSERT INTO public.import_header_mappings (module, sub_module, header_alias, target_field, is_system, is_active)
VALUES
  ('docs','omm','no','sn',true,true),
  ('docs','omm','s/n','sn',true,true),
  ('docs','omm','sn','sn',true,true),
  ('docs','omm','team','category',true,true),
  ('docs','omm','category','category_group',true,true),
  ('docs','omm','section','section',true,true),
  ('docs','omm','work trade / material','work_trade_material',true,true),
  ('docs','omm','work trade material','work_trade_material',true,true),
  ('docs','omm','work trade/material','work_trade_material',true,true),
  ('docs','omm','subcontractor','subcontractor_name',true,true),
  ('docs','omm','sub-contractor','subcontractor_name',true,true),
  ('docs','omm','sub contractor','subcontractor_name',true,true),
  ('docs','omm','hdec pic','hdec_pic_name',true,true),
  ('docs','omm','hdec p.i.c','hdec_pic_name',true,true),
  ('docs','omm','hdec p.i.c.','hdec_pic_name',true,true),
  ('docs','omm','hdec eng','hdec_eng_name',true,true),
  ('docs','omm','hdec engineer','hdec_eng_name',true,true),
  ('docs','omm','instruction date','instruction_date',true,true),
  ('docs','omm','d. submission planned date','draft_planned_date',true,true),
  ('docs','omm','d submission planned date','draft_planned_date',true,true),
  ('docs','omm','draft submission planned date','draft_planned_date',true,true),
  ('docs','omm','d. submission actual date','draft_actual_date',true,true),
  ('docs','omm','d submission actual date','draft_actual_date',true,true),
  ('docs','omm','draft submission actual date','draft_actual_date',true,true),
  ('docs','omm','readible pdf','pdf_required_qty',true,true),
  ('docs','omm','readable pdf','pdf_required_qty',true,true),
  ('docs','omm','pdf check','pdf_actual_qty',true,true),
  ('docs','omm','hardcopy','hardcopy_required_qty',true,true),
  ('docs','omm','hard copy','hardcopy_required_qty',true,true),
  ('docs','omm','hardcopy check','hardcopy_actual_qty',true,true),
  ('docs','omm','hard copy check','hardcopy_actual_qty',true,true),
  ('docs','omm','d. response date','draft_response_date',true,true),
  ('docs','omm','d response date','draft_response_date',true,true),
  ('docs','omm','d. response status','draft_response_status',true,true),
  ('docs','omm','d response status','draft_response_status',true,true),
  ('docs','omm','f. submission planned date','final_planned_date',true,true),
  ('docs','omm','f submission planned date','final_planned_date',true,true),
  ('docs','omm','final submission planned date','final_planned_date',true,true),
  ('docs','omm','f. submission actual date','final_actual_date',true,true),
  ('docs','omm','f submission actual date','final_actual_date',true,true),
  ('docs','omm','final submission actual date','final_actual_date',true,true),
  ('docs','omm','f. response planned date','final_response_planned_date',true,true),
  ('docs','omm','f response planned date','final_response_planned_date',true,true),
  ('docs','omm','f. actual respond date','final_response_actual_date',true,true),
  ('docs','omm','f actual respond date','final_response_actual_date',true,true),
  ('docs','omm','f. actual response date','final_response_actual_date',true,true),
  ('docs','omm','f. response status','final_response_status',true,true),
  ('docs','omm','f response status','final_response_status',true,true),
  ('docs','omm','traning required','training_required',true,true),
  ('docs','omm','training required','training_required',true,true),
  ('docs','omm','remark','remarks',true,true),
  ('docs','omm','remarks','remarks',true,true);

CREATE TABLE IF NOT EXISTS public.omm_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  omm_id uuid NOT NULL REFERENCES public.docs_omm(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  parent_comment_id uuid REFERENCES public.omm_comments(id) ON DELETE CASCADE,
  message text NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  type text NOT NULL DEFAULT 'comment',
  edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_omm_comments_omm ON public.omm_comments(omm_id);

ALTER TABLE public.omm_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read omm comments" ON public.omm_comments;
CREATE POLICY "Anyone can read omm comments" ON public.omm_comments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert own omm comments" ON public.omm_comments;
CREATE POLICY "Authenticated can insert own omm comments" ON public.omm_comments
  FOR INSERT TO authenticated WITH CHECK (author_user_id = auth.uid());

DROP POLICY IF EXISTS "Authors or admins can update omm comments" ON public.omm_comments;
CREATE POLICY "Authors or admins can update omm comments" ON public.omm_comments
  FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid() OR is_admin_or_superuser(auth.uid()))
  WITH CHECK (author_user_id = auth.uid() OR is_admin_or_superuser(auth.uid()));

DROP POLICY IF EXISTS "Authors or admins can delete omm comments" ON public.omm_comments;
CREATE POLICY "Authors or admins can delete omm comments" ON public.omm_comments
  FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR is_admin_or_superuser(auth.uid()));

CREATE OR REPLACE FUNCTION public.add_business_days_no_sun(base date, days integer)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cursor_d date := base;
  remaining integer := GREATEST(0, days);
BEGIN
  IF base IS NULL THEN RETURN NULL; END IF;
  WHILE remaining > 0 LOOP
    cursor_d := cursor_d + 1;
    IF EXTRACT(DOW FROM cursor_d) <> 0 THEN
      remaining := remaining - 1;
    END IF;
  END LOOP;
  RETURN cursor_d;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_omm_status(row_data public.docs_omm)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF row_data.final_response_status = 'A' THEN RETURN 'Approved'; END IF;
  IF row_data.final_actual_date IS NOT NULL AND row_data.final_response_status IS NULL THEN RETURN 'Final Under Review'; END IF;
  IF row_data.final_planned_date IS NOT NULL AND row_data.final_actual_date IS NULL THEN RETURN 'Pending Final Submission'; END IF;
  IF row_data.draft_response_status = 'A' THEN RETURN 'Pending Final Submission'; END IF;
  IF row_data.draft_actual_date IS NOT NULL AND row_data.draft_response_status IS NULL THEN RETURN 'Draft Under Review'; END IF;
  RETURN 'Pending Draft';
END;
$$;

CREATE OR REPLACE FUNCTION public.docs_omm_status_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.current_status := compute_omm_status(NEW);
  IF NEW.final_response_status = 'A' THEN
    NEW.current_stage := 'Closed';
  ELSIF NEW.draft_response_status = 'A' OR NEW.final_planned_date IS NOT NULL OR NEW.final_actual_date IS NOT NULL THEN
    NEW.current_stage := 'Final';
  ELSE
    NEW.current_stage := 'Draft';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_docs_omm_status_refresh ON public.docs_omm;
CREATE TRIGGER trg_docs_omm_status_refresh
  BEFORE INSERT OR UPDATE ON public.docs_omm
  FOR EACH ROW EXECUTE FUNCTION public.docs_omm_status_refresh();

CREATE OR REPLACE FUNCTION public.create_omm_resubmission(p_parent_id uuid, p_stage text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_row public.docs_omm%ROWTYPE;
  next_seq integer;
  base_sn text;
  new_sn text;
  d0 date := CURRENT_DATE;
  new_id uuid;
  draft_planned date;
  final_planned date;
  resp_planned date;
BEGIN
  SELECT * INTO parent_row FROM public.docs_omm WHERE id = p_parent_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.docs_omm WHERE parent_id = p_parent_id AND current_stage = p_stage) THEN
    RETURN NULL;
  END IF;
  next_seq := COALESCE(parent_row.resubmission_seq, 0) + 1;
  base_sn := COALESCE(NULLIF(split_part(parent_row.sn, '-', 1), ''), parent_row.sn);
  new_sn := base_sn || '-' || lpad(next_seq::text, 2, '0');
  IF p_stage = 'Draft' THEN
    draft_planned := add_business_days_no_sun(d0, 3);
    resp_planned := add_business_days_no_sun(draft_planned, 7);
  ELSE
    final_planned := add_business_days_no_sun(d0, 3);
    resp_planned := add_business_days_no_sun(final_planned, 7);
  END IF;
  INSERT INTO public.docs_omm (
    project_id, sn, parent_id, is_resubmission, resubmission_seq,
    category, category_group, section, work_trade_material,
    subcontractor_name, subcontractor_id, hdec_pic_name, hdec_eng_name,
    team, trade, pdf_required_qty, hardcopy_required_qty,
    draft_planned_date, final_planned_date, final_response_planned_date,
    current_stage, data_source_type, is_active
  ) VALUES (
    parent_row.project_id, new_sn, p_parent_id, true, next_seq,
    parent_row.category, parent_row.category_group, parent_row.section, parent_row.work_trade_material,
    parent_row.subcontractor_name, parent_row.subcontractor_id, parent_row.hdec_pic_name, parent_row.hdec_eng_name,
    parent_row.team, parent_row.trade, parent_row.pdf_required_qty, parent_row.hardcopy_required_qty,
    draft_planned, final_planned, resp_planned,
    p_stage, 'auto_resubmission', true
  ) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.docs_omm_after_update_resubmit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.draft_response_status IN ('B','C') AND (OLD.draft_response_status IS DISTINCT FROM NEW.draft_response_status) THEN
    PERFORM create_omm_resubmission(NEW.id, 'Draft');
  END IF;
  IF NEW.final_response_status IN ('B','C') AND (OLD.final_response_status IS DISTINCT FROM NEW.final_response_status) THEN
    PERFORM create_omm_resubmission(NEW.id, 'Final');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_docs_omm_resubmit ON public.docs_omm;
CREATE TRIGGER trg_docs_omm_resubmit
  AFTER UPDATE ON public.docs_omm
  FOR EACH ROW EXECUTE FUNCTION public.docs_omm_after_update_resubmit();

INSERT INTO public.app_settings (key, value)
VALUES ('header_mappings_version', to_jsonb(COALESCE((SELECT (value)::int FROM public.app_settings WHERE key='header_mappings_version'), 0) + 1))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
