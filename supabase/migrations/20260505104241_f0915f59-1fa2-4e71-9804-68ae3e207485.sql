-- =========================================================================
-- 1. DROP LEGACY WARRANTY OBJECTS (all empty) and clear seed mappings
-- =========================================================================
DROP TABLE IF EXISTS public.warranty_upload_row_logs CASCADE;
DROP TABLE IF EXISTS public.warranty_upload_batches CASCADE;
DROP TABLE IF EXISTS public.warranty_change_log CASCADE;
DROP TABLE IF EXISTS public.warranty_discussion CASCADE;
DROP TABLE IF EXISTS public.warranty_acra_conflict_queue CASCADE;
DROP TABLE IF EXISTS public.warranty CASCADE;

-- Temporarily disable system-mapping protection trigger to clear obsolete seed
ALTER TABLE public.import_header_mappings DISABLE TRIGGER USER;
DELETE FROM public.import_header_mappings WHERE module = 'docs' AND sub_module = 'warranty';
ALTER TABLE public.import_header_mappings ENABLE TRIGGER USER;

-- =========================================================================
-- 2. ENUM: warranty_status
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warranty_status') THEN
    CREATE TYPE public.warranty_status AS ENUM ('A','B','C','UR','WIP','Planned');
  END IF;
END $$;

-- =========================================================================
-- 3. SUBCONTRACTOR INFORMATION MASTER (shared across modules)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.subcontractor_info_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid NOT NULL UNIQUE REFERENCES public.subcontractor_master(id) ON DELETE CASCADE,
  acra_reg_no text,
  acra_address text,
  acra_info_verified boolean NOT NULL DEFAULT false,
  default_director_1 text,
  default_director_2 text,
  default_witness text,
  last_subcontract_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.subcontractor_info_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "info master readable by authenticated"
  ON public.subcontractor_info_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "info master admin write"
  ON public.subcontractor_info_master FOR ALL TO authenticated
  USING (
    public.is_admin_or_superuser(auth.uid())
    OR public.has_role(auth.uid(), 'd_superuser'::public.app_role)
  )
  WITH CHECK (
    public.is_admin_or_superuser(auth.uid())
    OR public.has_role(auth.uid(), 'd_superuser'::public.app_role)
  );

CREATE TRIGGER trg_subcontractor_info_master_touch
  BEFORE UPDATE ON public.subcontractor_info_master
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 4. WARRANTY ITEMS (main)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.warranty_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_no integer NOT NULL,

  category text,
  warranted_item text,
  team text,
  warranty_period_years integer,
  contract_spec_ref text,

  subcontractor_name text,
  subcontractor_id uuid REFERENCES public.subcontractor_master(id) ON DELETE SET NULL,
  subsub_name text,
  hdec_pic_name text,
  hdec_eng_name text,

  r_works_description text,
  r_acra_reg_no text,
  r_acra_address text,
  r_subcontract_date date,
  r_brief_description text,
  r_director_1 text,
  r_director_2 text,
  r_witness text,
  acra_info_status text,

  draft_planned_date date,
  draft_actual_date date,
  draft_response_planned_date date,
  draft_response_actual_date date,
  draft_status public.warranty_status,

  subcon_signing_planned_date date,
  subcon_signing_actual_date date,
  subcon_signing_status public.warranty_status,

  hdec_signing_planned_date date,
  hdec_signing_actual_date date,
  hdec_signing_status public.warranty_status,

  final_planned_date date,
  final_actual_date date,
  final_status public.warranty_status,

  current_stage text,
  current_status text,

  parent_id uuid REFERENCES public.warranty_items(id) ON DELETE CASCADE,
  is_resubmission boolean NOT NULL DEFAULT false,
  resubmission_seq integer NOT NULL DEFAULT 0,

  remarks text,
  custom_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_source_type text,
  source_upload_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE UNIQUE INDEX warranty_items_project_itemno_active_uidx
  ON public.warranty_items (project_id, item_no)
  WHERE is_active = true AND parent_id IS NULL;

CREATE INDEX warranty_items_project_idx ON public.warranty_items (project_id);
CREATE INDEX warranty_items_subcontractor_idx ON public.warranty_items (subcontractor_id);
CREATE INDEX warranty_items_parent_idx ON public.warranty_items (parent_id);
CREATE INDEX warranty_items_active_idx ON public.warranty_items (is_active);

ALTER TABLE public.warranty_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warranty_items readable by authenticated"
  ON public.warranty_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "warranty_items admin write"
  ON public.warranty_items FOR ALL TO authenticated
  USING (
    public.is_admin_or_superuser(auth.uid())
    OR public.has_role(auth.uid(), 'd_superuser'::public.app_role)
    OR public.has_role(auth.uid(), 'senior_user'::public.app_role)
  )
  WITH CHECK (
    public.is_admin_or_superuser(auth.uid())
    OR public.has_role(auth.uid(), 'd_superuser'::public.app_role)
    OR public.has_role(auth.uid(), 'senior_user'::public.app_role)
  );

-- =========================================================================
-- 5. WARRANTY THREADS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.warranty_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_item_id uuid NOT NULL REFERENCES public.warranty_items(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  thread_date date,
  thread_label text NOT NULL,
  action_party text,
  content text,
  sort_order integer NOT NULL DEFAULT 0,
  source_upload_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (warranty_item_id, thread_label)
);

CREATE INDEX warranty_threads_item_idx ON public.warranty_threads (warranty_item_id, sort_order);

ALTER TABLE public.warranty_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warranty_threads readable by authenticated"
  ON public.warranty_threads FOR SELECT TO authenticated USING (true);
CREATE POLICY "warranty_threads write"
  ON public.warranty_threads FOR ALL TO authenticated
  USING (
    public.is_admin_or_superuser(auth.uid())
    OR public.has_role(auth.uid(), 'd_superuser'::public.app_role)
    OR public.has_role(auth.uid(), 'senior_user'::public.app_role)
  )
  WITH CHECK (
    public.is_admin_or_superuser(auth.uid())
    OR public.has_role(auth.uid(), 'd_superuser'::public.app_role)
    OR public.has_role(auth.uid(), 'senior_user'::public.app_role)
  );

CREATE TRIGGER trg_warranty_threads_touch
  BEFORE UPDATE ON public.warranty_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 6. CHANGE LOG
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.warranty_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_item_id uuid NOT NULL REFERENCES public.warranty_items(id) ON DELETE CASCADE,
  changed_field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_source public.change_source DEFAULT 'app_direct_input',
  upload_id uuid
);

CREATE INDEX warranty_change_log_item_idx ON public.warranty_change_log (warranty_item_id, changed_at DESC);
CREATE INDEX warranty_change_log_upload_idx ON public.warranty_change_log (upload_id);

ALTER TABLE public.warranty_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warranty_change_log readable by authenticated"
  ON public.warranty_change_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "warranty_change_log insert by authenticated"
  ON public.warranty_change_log FOR INSERT TO authenticated WITH CHECK (true);

-- =========================================================================
-- 7. UPLOAD BATCHES + ROW LOGS
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.warranty_upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  source_filename text,
  data_date date,
  total_rows integer,
  processed_rows integer,
  inserted_rows integer,
  updated_rows integer,
  rejected_rows integer,
  note text
);

ALTER TABLE public.warranty_upload_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warranty_upload_batches readable by authenticated"
  ON public.warranty_upload_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "warranty_upload_batches admin write"
  ON public.warranty_upload_batches FOR ALL TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()) OR public.has_role(auth.uid(),'d_superuser'::public.app_role))
  WITH CHECK (public.is_admin_or_superuser(auth.uid()) OR public.has_role(auth.uid(),'d_superuser'::public.app_role));

CREATE TABLE IF NOT EXISTS public.warranty_upload_row_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.warranty_upload_batches(id) ON DELETE CASCADE,
  row_no integer,
  item_no integer,
  status text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX warranty_upload_row_logs_upload_idx ON public.warranty_upload_row_logs (upload_id);

ALTER TABLE public.warranty_upload_row_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warranty_upload_row_logs readable by authenticated"
  ON public.warranty_upload_row_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "warranty_upload_row_logs insert by authenticated"
  ON public.warranty_upload_row_logs FOR INSERT TO authenticated WITH CHECK (true);

-- =========================================================================
-- 8. STAGE/STATUS COMPUTATION
-- =========================================================================
CREATE OR REPLACE FUNCTION public.compute_warranty_stage_status(row_data public.warranty_items)
RETURNS TABLE(stage text, status text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF row_data.final_status = 'A' THEN
    RETURN QUERY SELECT 'Closed'::text, 'Approved'::text; RETURN;
  END IF;
  IF row_data.final_actual_date IS NOT NULL AND row_data.final_status IS NULL THEN
    RETURN QUERY SELECT 'Final'::text, 'Final Under Review'::text; RETURN;
  END IF;
  IF row_data.hdec_signing_status = 'A' THEN
    RETURN QUERY SELECT 'Final'::text, 'Pending Final Submission'::text; RETURN;
  END IF;
  IF row_data.hdec_signing_actual_date IS NOT NULL AND row_data.hdec_signing_status IS NULL THEN
    RETURN QUERY SELECT 'HDEC Sign'::text, 'HDEC Signing Under Review'::text; RETURN;
  END IF;
  IF row_data.subcon_signing_status = 'A' THEN
    RETURN QUERY SELECT 'HDEC Sign'::text, 'Pending HDEC Signing'::text; RETURN;
  END IF;
  IF row_data.subcon_signing_actual_date IS NOT NULL AND row_data.subcon_signing_status IS NULL THEN
    RETURN QUERY SELECT 'Subcon Sign'::text, 'Subcon Signing Under Review'::text; RETURN;
  END IF;
  IF row_data.draft_status = 'A' THEN
    RETURN QUERY SELECT 'Subcon Sign'::text, 'Pending Subcon Signing'::text; RETURN;
  END IF;
  IF row_data.draft_actual_date IS NOT NULL AND row_data.draft_status IS NULL THEN
    RETURN QUERY SELECT 'Draft'::text, 'Draft Under Review'::text; RETURN;
  END IF;
  RETURN QUERY SELECT 'Draft'::text, 'Pending Draft'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.warranty_items_status_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  SELECT * INTO s FROM public.compute_warranty_stage_status(NEW);
  NEW.current_stage := s.stage;
  NEW.current_status := s.status;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_warranty_items_status_refresh
  BEFORE INSERT OR UPDATE ON public.warranty_items
  FOR EACH ROW EXECUTE FUNCTION public.warranty_items_status_refresh();

CREATE TRIGGER trg_warranty_items_touch
  BEFORE UPDATE ON public.warranty_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 9. AUTO-RESUBMISSION ON STATUS B/C
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_warranty_resubmission(
  p_parent_id uuid, p_stage text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_row public.warranty_items%ROWTYPE;
  next_seq integer;
  new_id uuid;
  d0 date := CURRENT_DATE;
BEGIN
  SELECT * INTO parent_row FROM public.warranty_items WHERE id = p_parent_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM public.warranty_items
    WHERE parent_id = p_parent_id AND current_stage = p_stage AND is_active = true
  ) THEN
    RETURN NULL;
  END IF;

  next_seq := COALESCE(parent_row.resubmission_seq, 0) + 1;

  INSERT INTO public.warranty_items (
    project_id, item_no, parent_id, is_resubmission, resubmission_seq,
    category, warranted_item, team, warranty_period_years, contract_spec_ref,
    subcontractor_name, subcontractor_id, subsub_name, hdec_pic_name, hdec_eng_name,
    r_works_description, r_acra_reg_no, r_acra_address, r_subcontract_date,
    r_brief_description, r_director_1, r_director_2, r_witness, acra_info_status,
    draft_planned_date, draft_response_planned_date,
    subcon_signing_planned_date, hdec_signing_planned_date, final_planned_date,
    data_source_type, is_active, remarks
  )
  VALUES (
    parent_row.project_id, parent_row.item_no, p_parent_id, true, next_seq,
    parent_row.category, parent_row.warranted_item, parent_row.team,
    parent_row.warranty_period_years, parent_row.contract_spec_ref,
    parent_row.subcontractor_name, parent_row.subcontractor_id, parent_row.subsub_name,
    parent_row.hdec_pic_name, parent_row.hdec_eng_name,
    parent_row.r_works_description, parent_row.r_acra_reg_no, parent_row.r_acra_address,
    parent_row.r_subcontract_date, parent_row.r_brief_description,
    parent_row.r_director_1, parent_row.r_director_2, parent_row.r_witness,
    parent_row.acra_info_status,
    CASE WHEN p_stage = 'Draft' THEN d0 + 3 ELSE NULL END,
    CASE WHEN p_stage = 'Draft' THEN d0 + 10 ELSE NULL END,
    CASE WHEN p_stage = 'Subcon Sign' THEN d0 + 7 ELSE NULL END,
    CASE WHEN p_stage = 'HDEC Sign' THEN d0 + 7 ELSE NULL END,
    CASE WHEN p_stage = 'Final' THEN d0 + 3 ELSE NULL END,
    'auto_resubmission', true,
    'Auto-created on ' || p_stage || ' status ' ||
      CASE p_stage
        WHEN 'Draft' THEN COALESCE(parent_row.draft_status::text,'')
        WHEN 'Subcon Sign' THEN COALESCE(parent_row.subcon_signing_status::text,'')
        WHEN 'HDEC Sign' THEN COALESCE(parent_row.hdec_signing_status::text,'')
        WHEN 'Final' THEN COALESCE(parent_row.final_status::text,'')
      END
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.warranty_items_after_update_resubmit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.draft_status IN ('B','C') AND OLD.draft_status IS DISTINCT FROM NEW.draft_status THEN
    PERFORM public.create_warranty_resubmission(NEW.id, 'Draft');
  END IF;
  IF NEW.subcon_signing_status IN ('B','C') AND OLD.subcon_signing_status IS DISTINCT FROM NEW.subcon_signing_status THEN
    PERFORM public.create_warranty_resubmission(NEW.id, 'Subcon Sign');
  END IF;
  IF NEW.hdec_signing_status IN ('B','C') AND OLD.hdec_signing_status IS DISTINCT FROM NEW.hdec_signing_status THEN
    PERFORM public.create_warranty_resubmission(NEW.id, 'HDEC Sign');
  END IF;
  IF NEW.final_status IN ('B','C') AND OLD.final_status IS DISTINCT FROM NEW.final_status THEN
    PERFORM public.create_warranty_resubmission(NEW.id, 'Final');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_warranty_items_after_update_resubmit
  AFTER UPDATE ON public.warranty_items
  FOR EACH ROW EXECUTE FUNCTION public.warranty_items_after_update_resubmit();

CREATE TRIGGER trg_warranty_items_event_log
  AFTER UPDATE OR DELETE ON public.warranty_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id','warranted_item');

-- =========================================================================
-- 10. CASCADE DELETE RPC
-- =========================================================================
CREATE OR REPLACE FUNCTION public.delete_warranty_cascade(_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted int := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_superuser(v_uid) THEN
    RAISE EXCEPTION 'Only admin or superuser can permanently delete warranty items';
  END IF;
  IF _ids IS NULL OR array_length(_ids,1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;

  DELETE FROM public.warranty_change_log WHERE warranty_item_id = ANY(_ids);
  DELETE FROM public.warranty_threads     WHERE warranty_item_id = ANY(_ids);
  WITH d AS (DELETE FROM public.warranty_items WHERE id = ANY(_ids) RETURNING 1)
  SELECT count(*) INTO v_deleted FROM d;

  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

-- =========================================================================
-- 11. SEED HEADER MAPPINGS
-- =========================================================================
INSERT INTO public.import_header_mappings (module, sub_module, header_alias, target_field, is_system)
VALUES
  ('docs','warranty','No','item_no',true),
  ('docs','warranty','Category','category',true),
  ('docs','warranty','Warranted Item','warranted_item',true),
  ('docs','warranty','Team','team',true),
  ('docs','warranty','HDEC PIC','hdec_pic_name',true),
  ('docs','warranty','HDEC ENG','hdec_eng_name',true),
  ('docs','warranty','Warranty Period Years (*calculated from the Date of Substantial Completion)','warranty_period_years',true),
  ('docs','warranty','Warranty Period Years','warranty_period_years',true),
  ('docs','warranty','Contract Specification Reference','contract_spec_ref',true),
  ('docs','warranty','[R] Description of the Works','r_works_description',true),
  ('docs','warranty','[R] Subcontractor','subcontractor_name',true),
  ('docs','warranty','[R] Subcontractor Company Registration No. in "ACRA"','r_acra_reg_no',true),
  ('docs','warranty','[R] Subcontractor registered office address in "ACRA"','r_acra_address',true),
  ('docs','warranty','[R] Subcontract Contract Date','r_subcontract_date',true),
  ('docs','warranty','[R] Brief Description','r_brief_description',true),
  ('docs','warranty','[R] Subcontractor''s Name of 1st Authorised Director','r_director_1',true),
  ('docs','warranty','[R] Subcontractor''s 2nd Authorised Director / Secretary','r_director_2',true),
  ('docs','warranty','[R] Subcontrator''s Name of Witness (Director/ Company Secretary)','r_witness',true),
  ('docs','warranty','ACRA Info','acra_info_status',true),
  ('docs','warranty','D. Planned Submission','draft_planned_date',true),
  ('docs','warranty','D. Actual Submission','draft_actual_date',true),
  ('docs','warranty','D. Planned Response','draft_response_planned_date',true),
  ('docs','warranty','D. Actual Response','draft_response_actual_date',true),
  ('docs','warranty','D.Status','draft_status',true),
  ('docs','warranty','Subcon Planned Signing','subcon_signing_planned_date',true),
  ('docs','warranty','Subcon Actual Signing','subcon_signing_actual_date',true),
  ('docs','warranty','Subcon Siging Status','subcon_signing_status',true),
  ('docs','warranty','Subcon Signing Status','subcon_signing_status',true),
  ('docs','warranty','HDEC Planned Signing','hdec_signing_planned_date',true),
  ('docs','warranty','HDEC Actual Signing','hdec_signing_actual_date',true),
  ('docs','warranty','HDEC Actual Signing ','hdec_signing_actual_date',true),
  ('docs','warranty','HDEC Siging Status','hdec_signing_status',true),
  ('docs','warranty','HDEC Signing Status','hdec_signing_status',true),
  ('docs','warranty','Final Planned Submission','final_planned_date',true),
  ('docs','warranty','Final Actual Submission','final_actual_date',true),
  ('docs','warranty','Final Status','final_status',true),
  ('docs','warranty','Tread 1. LL remarks (16.7.2025) /HDEC remarks','thread:tread_1',true),
  ('docs','warranty','Tread 2-1. Follow up action as per discussion on 18.9.2025','thread:tread_2_1',true),
  ('docs','warranty','Tread 2-2 Action party','thread:tread_2_2',true),
  ('docs','warranty','Tread 2-3 reply from LL after discussion on 18.9.2025','thread:tread_2_3',true),
  ('docs','warranty','Tread 3-1 Follow up action as per the discussion on 12.11.2025','thread:tread_3_1',true),
  ('docs','warranty','Tread 3-2 Follow up action as per the discussion on 19.11.2025','thread:tread_3_2',true),
  ('docs','warranty','Remarks','remarks',true)
ON CONFLICT (module, COALESCE(sub_module,''), header_alias) DO NOTHING;

-- Bump header mappings version
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('header_mappings_version', to_jsonb(extract(epoch from now())::bigint), now())
ON CONFLICT (key) DO UPDATE SET value = to_jsonb(extract(epoch from now())::bigint), updated_at = now();