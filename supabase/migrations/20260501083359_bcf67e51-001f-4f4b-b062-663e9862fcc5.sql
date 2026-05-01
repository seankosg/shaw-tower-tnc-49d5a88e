
-- 1) docs_drawings
CREATE TABLE public.docs_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  sub_module text NOT NULL DEFAULT 'as_built',
  document_no text NOT NULL,
  revision text,
  title text,
  organisation_raw text,
  subcontractor_id uuid,
  discipline text,
  document_type text,
  aconex_status text,
  is_submitted boolean NOT NULL DEFAULT false,
  submitted_date date,
  approved_date date,
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
  CONSTRAINT docs_drawings_unique_doc UNIQUE (project_id, sub_module, document_no)
);
CREATE INDEX idx_docs_drawings_project ON public.docs_drawings(project_id);
CREATE INDEX idx_docs_drawings_sub_module ON public.docs_drawings(sub_module);
CREATE INDEX idx_docs_drawings_subcontractor ON public.docs_drawings(subcontractor_id);
CREATE INDEX idx_docs_drawings_discipline ON public.docs_drawings(discipline);
CREATE INDEX idx_docs_drawings_is_submitted ON public.docs_drawings(is_submitted);
ALTER TABLE public.docs_drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read docs drawings" ON public.docs_drawings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert docs drawings" ON public.docs_drawings FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'superuser'::app_role,'senior_user'::app_role,'user'::app_role]));
CREATE POLICY "Users can update docs drawings" ON public.docs_drawings FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'superuser'::app_role,'senior_user'::app_role,'user'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'superuser'::app_role,'senior_user'::app_role,'user'::app_role]));
CREATE POLICY "Admins can delete docs drawings" ON public.docs_drawings FOR DELETE TO authenticated USING (is_admin_or_superuser(auth.uid()));

-- 2) docs_upload_batches
CREATE TABLE public.docs_upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  sub_module text NOT NULL DEFAULT 'as_built',
  uploaded_file_name text NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  data_date date,
  status upload_status NOT NULL DEFAULT 'pending',
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
CREATE INDEX idx_docs_upload_batches_project ON public.docs_upload_batches(project_id);
CREATE INDEX idx_docs_upload_batches_uploaded_at ON public.docs_upload_batches(uploaded_at DESC);
ALTER TABLE public.docs_upload_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read docs uploads" ON public.docs_upload_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert docs uploads" ON public.docs_upload_batches FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "Upload owners can update docs uploads" ON public.docs_upload_batches FOR UPDATE TO authenticated
  USING ((uploaded_by = auth.uid()) OR is_admin_or_superuser(auth.uid()))
  WITH CHECK ((uploaded_by = auth.uid()) OR is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can delete docs uploads" ON public.docs_upload_batches FOR DELETE TO authenticated USING (is_admin_or_superuser(auth.uid()));

-- 3) docs_upload_row_logs
CREATE TABLE public.docs_upload_row_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL,
  raw_row_no integer,
  document_no text,
  action_taken action_taken,
  reason_code text,
  reason_detail text,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_docs_upload_row_logs_upload ON public.docs_upload_row_logs(upload_id);
ALTER TABLE public.docs_upload_row_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read docs upload logs" ON public.docs_upload_row_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Upload owners can insert docs upload logs" ON public.docs_upload_row_logs FOR INSERT TO authenticated
  WITH CHECK (
    (EXISTS (SELECT 1 FROM docs_upload_batches b WHERE b.id = docs_upload_row_logs.upload_id AND b.uploaded_by = auth.uid()))
    OR is_admin_or_superuser(auth.uid())
  );
CREATE POLICY "Admins can delete docs upload logs" ON public.docs_upload_row_logs FOR DELETE TO authenticated USING (is_admin_or_superuser(auth.uid()));

-- 4) docs_change_log
CREATE TABLE public.docs_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid NOT NULL,
  changed_field text NOT NULL,
  old_value text,
  new_value text,
  change_source text,
  upload_id uuid,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_docs_change_log_drawing ON public.docs_change_log(drawing_id);
CREATE INDEX idx_docs_change_log_upload ON public.docs_change_log(upload_id);
ALTER TABLE public.docs_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read docs change logs" ON public.docs_change_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert docs change logs" ON public.docs_change_log FOR INSERT TO authenticated
  WITH CHECK ((changed_by = auth.uid()) OR is_admin_or_superuser(auth.uid()));

-- 5) docs_org_alias
CREATE TABLE public.docs_org_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_label text NOT NULL,
  subcontractor_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT docs_org_alias_unique_label UNIQUE (raw_label)
);
ALTER TABLE public.docs_org_alias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read docs org alias" ON public.docs_org_alias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage docs org alias" ON public.docs_org_alias FOR ALL TO authenticated
  USING (is_admin_or_superuser(auth.uid())) WITH CHECK (is_admin_or_superuser(auth.uid()));

-- 6) updated_at triggers
CREATE TRIGGER trg_docs_drawings_updated BEFORE UPDATE ON public.docs_drawings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_docs_org_alias_updated BEFORE UPDATE ON public.docs_org_alias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Extend module key whitelist in app_settings RLS
DROP POLICY IF EXISTS "Module keys admin only, others admin or superuser" ON public.app_settings;
CREATE POLICY "Module keys admin only, others admin or superuser"
  ON public.app_settings FOR ALL TO authenticated
  USING (
    CASE
      WHEN key = ANY (ARRAY['module_tnc_status'::text, 'module_defect_status'::text, 'module_docs_status'::text])
        THEN has_role(auth.uid(), 'admin'::app_role)
      ELSE is_admin_or_superuser(auth.uid())
    END
  )
  WITH CHECK (
    CASE
      WHEN key = ANY (ARRAY['module_tnc_status'::text, 'module_defect_status'::text, 'module_docs_status'::text])
        THEN has_role(auth.uid(), 'admin'::app_role)
      ELSE is_admin_or_superuser(auth.uid())
    END
  );

-- 8) Seed default settings
INSERT INTO public.app_settings (key, value, updated_at)
VALUES
  ('module_docs_status', '{"enabled": false, "reason": "준비 중", "message": "Docs Management 모듈은 곧 출시됩니다."}'::jsonb, now()),
  ('docs_lead_days_as_built', '30'::jsonb, now()),
  ('docs_lead_days_omm', '45'::jsonb, now()),
  ('docs_lead_days_warranty', '30'::jsonb, now()),
  ('docs_lead_days_spare', '60'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value, updated_at)
SELECT 'docs_sc_date_' || id::text, '"2026-06-15"'::jsonb, now()
FROM public.projects WHERE project_code = 'SHAW'
ON CONFLICT (key) DO NOTHING;
