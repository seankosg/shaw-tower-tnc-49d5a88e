
-- 1. Extend subcontractor_master with ACRA columns
ALTER TABLE public.subcontractor_master
  ADD COLUMN IF NOT EXISTS acra_no text,
  ADD COLUMN IF NOT EXISTS acra_registered_address text,
  ADD COLUMN IF NOT EXISTS director_1_name text,
  ADD COLUMN IF NOT EXISTS director_2_name text,
  ADD COLUMN IF NOT EXISTS secretary_name text,
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date;

-- 2. warranty (main table)
CREATE TABLE IF NOT EXISTS public.warranty (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  item_no text NOT NULL,
  category text,
  sub_category text,
  warranted_item text,
  subcontractor_name_raw text,
  subcontractor_id uuid REFERENCES public.subcontractor_master(id) ON DELETE SET NULL,
  source_row_position integer,
  row_hash text,
  sc_target_date date,
  internal_target_date date,
  stage1_date date, stage2_date date, stage3_date date,
  stage4_date date, stage5_date date, stage6_date date,
  stage7_date date, stage8_date date, stage9_date date,
  witness_director text,
  witness_secretary text,
  validation_acra boolean NOT NULL DEFAULT false,
  validation_signature boolean NOT NULL DEFAULT false,
  validation_witness boolean NOT NULL DEFAULT false,
  validation_seal boolean NOT NULL DEFAULT false,
  validation_date boolean NOT NULL DEFAULT false,
  validation_pass boolean NOT NULL DEFAULT false,
  remarks text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_upload_id uuid,
  data_source_type text,
  is_active boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT warranty_project_item_unique UNIQUE (project_id, item_no)
);
CREATE INDEX IF NOT EXISTS idx_warranty_project ON public.warranty(project_id);
CREATE INDEX IF NOT EXISTS idx_warranty_subcontractor ON public.warranty(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_warranty_row_hash ON public.warranty(row_hash);
CREATE INDEX IF NOT EXISTS idx_warranty_active ON public.warranty(is_active) WHERE is_active = true;

ALTER TABLE public.warranty ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read warranty" ON public.warranty FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert warranty" ON public.warranty FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superuser'::app_role, 'senior_user'::app_role, 'user'::app_role]));
CREATE POLICY "Users can update warranty" ON public.warranty FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superuser'::app_role, 'senior_user'::app_role, 'user'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superuser'::app_role, 'senior_user'::app_role, 'user'::app_role]));
CREATE POLICY "Admins can delete warranty" ON public.warranty FOR DELETE TO authenticated
  USING (is_admin_or_superuser(auth.uid()));

-- 3. warranty_discussion
CREATE TABLE IF NOT EXISTS public.warranty_discussion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  warranty_id uuid NOT NULL REFERENCES public.warranty(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  discussion_type text,
  discussion_date date,
  content text,
  author text,
  sort_order integer NOT NULL DEFAULT 0,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_upload_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX IF NOT EXISTS idx_warranty_discussion_warranty ON public.warranty_discussion(warranty_id);
CREATE INDEX IF NOT EXISTS idx_warranty_discussion_project ON public.warranty_discussion(project_id);

ALTER TABLE public.warranty_discussion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read warranty_discussion" ON public.warranty_discussion FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert warranty_discussion" ON public.warranty_discussion FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superuser'::app_role, 'senior_user'::app_role, 'user'::app_role]));
CREATE POLICY "Users can update warranty_discussion" ON public.warranty_discussion FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superuser'::app_role, 'senior_user'::app_role, 'user'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superuser'::app_role, 'senior_user'::app_role, 'user'::app_role]));
CREATE POLICY "Admins can delete warranty_discussion" ON public.warranty_discussion FOR DELETE TO authenticated
  USING (is_admin_or_superuser(auth.uid()));

-- 4. warranty_upload_batches
CREATE TABLE IF NOT EXISTS public.warranty_upload_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid,
  uploaded_file_name text NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  data_date date,
  status upload_status NOT NULL DEFAULT 'pending'::upload_status,
  total_rows integer DEFAULT 0,
  processed_rows integer DEFAULT 0,
  success_rows integer DEFAULT 0,
  skipped_rows integer DEFAULT 0,
  rejected_rows integer DEFAULT 0,
  note text,
  rolled_back_at timestamptz,
  rolled_back_by uuid,
  rollback_force boolean
);
ALTER TABLE public.warranty_upload_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read warranty uploads" ON public.warranty_upload_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert warranty uploads" ON public.warranty_upload_batches FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "Upload owners can update warranty uploads" ON public.warranty_upload_batches FOR UPDATE TO authenticated
  USING ((uploaded_by = auth.uid()) OR is_admin_or_superuser(auth.uid()))
  WITH CHECK ((uploaded_by = auth.uid()) OR is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can delete warranty uploads" ON public.warranty_upload_batches FOR DELETE TO authenticated
  USING (is_admin_or_superuser(auth.uid()));

-- 5. warranty_upload_row_logs (uses existing action_taken type)
CREATE TABLE IF NOT EXISTS public.warranty_upload_row_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id uuid NOT NULL REFERENCES public.warranty_upload_batches(id) ON DELETE CASCADE,
  raw_row_no integer,
  item_no text,
  action_taken public.action_taken,
  reason_code text,
  reason_detail text,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.warranty_upload_row_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read warranty upload logs" ON public.warranty_upload_row_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Upload owners can insert warranty upload logs" ON public.warranty_upload_row_logs FOR INSERT TO authenticated
  WITH CHECK (
    (EXISTS (SELECT 1 FROM warranty_upload_batches b WHERE b.id = upload_id AND b.uploaded_by = auth.uid()))
    OR is_admin_or_superuser(auth.uid())
  );
CREATE POLICY "Admins can delete warranty upload logs" ON public.warranty_upload_row_logs FOR DELETE TO authenticated
  USING (is_admin_or_superuser(auth.uid()));

-- 6. warranty_change_log
CREATE TABLE IF NOT EXISTS public.warranty_change_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  warranty_id uuid NOT NULL,
  changed_field text NOT NULL,
  old_value text,
  new_value text,
  change_source text,
  upload_id uuid,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warranty_change_log_warranty ON public.warranty_change_log(warranty_id);
ALTER TABLE public.warranty_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read warranty change logs" ON public.warranty_change_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert warranty change logs" ON public.warranty_change_log FOR INSERT TO authenticated
  WITH CHECK ((changed_by = auth.uid()) OR is_admin_or_superuser(auth.uid()));

-- 7. warranty_acra_conflict_queue
CREATE TABLE IF NOT EXISTS public.warranty_acra_conflict_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subcontractor_id uuid NOT NULL REFERENCES public.subcontractor_master(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  existing_value text,
  incoming_value text,
  source_upload_id uuid,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warranty_acra_conflict_unresolved
  ON public.warranty_acra_conflict_queue(resolved) WHERE resolved = false;
ALTER TABLE public.warranty_acra_conflict_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage acra conflict queue" ON public.warranty_acra_conflict_queue FOR ALL TO authenticated
  USING (is_admin_or_superuser(auth.uid())) WITH CHECK (is_admin_or_superuser(auth.uid()));

-- 8. Triggers
CREATE OR REPLACE FUNCTION public.warranty_compute_internal_target()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _lead_days integer := 27;
  _setting jsonb;
BEGIN
  SELECT value INTO _setting FROM public.app_settings WHERE key = 'warranty_lead_days';
  IF _setting IS NOT NULL THEN
    BEGIN
      _lead_days := COALESCE(_setting::text::integer, 27);
    EXCEPTION WHEN others THEN
      _lead_days := 27;
    END;
  END IF;
  IF NEW.sc_target_date IS NOT NULL THEN
    NEW.internal_target_date := NEW.sc_target_date - _lead_days;
  ELSE
    NEW.internal_target_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.warranty_compute_validation_pass()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.validation_pass := COALESCE(NEW.validation_acra, false)
    AND COALESCE(NEW.validation_signature, false)
    AND COALESCE(NEW.validation_witness, false)
    AND COALESCE(NEW.validation_seal, false)
    AND COALESCE(NEW.validation_date, false);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.warranty_compute_row_hash()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.row_hash := md5(coalesce(NEW.source_row_position::text, '') || '|' || coalesce(NEW.warranted_item, ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_warranty_internal_target
  BEFORE INSERT OR UPDATE OF sc_target_date ON public.warranty
  FOR EACH ROW EXECUTE FUNCTION public.warranty_compute_internal_target();

CREATE TRIGGER trg_warranty_validation_pass
  BEFORE INSERT OR UPDATE OF validation_acra, validation_signature, validation_witness, validation_seal, validation_date
  ON public.warranty FOR EACH ROW EXECUTE FUNCTION public.warranty_compute_validation_pass();

CREATE TRIGGER trg_warranty_row_hash
  BEFORE INSERT OR UPDATE OF source_row_position, warranted_item ON public.warranty
  FOR EACH ROW EXECUTE FUNCTION public.warranty_compute_row_hash();

CREATE TRIGGER trg_warranty_updated_at
  BEFORE UPDATE ON public.warranty
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_warranty_discussion_updated_at
  BEFORE UPDATE ON public.warranty_discussion
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. App settings seed
INSERT INTO public.app_settings (key, value, updated_at)
VALUES
  ('warranty_lead_days', '27'::jsonb, now()),
  ('warranty_module_config', '{
    "stages": [
      {"n": 1, "name": "Draft Prepared"},
      {"n": 2, "name": "HDEC Internal Review"},
      {"n": 3, "name": "Sent to Subcontractor"},
      {"n": 4, "name": "Subcontractor Signed"},
      {"n": 5, "name": "Witness Confirmed"},
      {"n": 6, "name": "Notarisation"},
      {"n": 7, "name": "HDEC Final Review"},
      {"n": 8, "name": "Submitted to Client"},
      {"n": 9, "name": "Client Acceptance"}
    ],
    "validation_fields": ["acra", "signature", "witness", "seal", "date"]
  }'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
