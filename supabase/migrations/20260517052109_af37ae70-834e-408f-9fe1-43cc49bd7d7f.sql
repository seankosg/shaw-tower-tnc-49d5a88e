
-- Storage bucket for editable code files
INSERT INTO storage.buckets (id, name, public)
VALUES ('code-files', 'code-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: admin/superuser only
CREATE POLICY "code-files admin select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'code-files' AND public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "code-files admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'code-files' AND public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "code-files admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'code-files' AND public.is_admin_or_superuser(auth.uid()))
  WITH CHECK (bucket_id = 'code-files' AND public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "code-files admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'code-files' AND public.is_admin_or_superuser(auth.uid()));

-- Version history table
CREATE TABLE public.code_file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  change_summary_ko text,
  instruction text,
  is_active boolean NOT NULL DEFAULT false,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX code_file_versions_one_active
  ON public.code_file_versions (file_name)
  WHERE is_active = true;

CREATE INDEX code_file_versions_uploaded_at_idx
  ON public.code_file_versions (file_name, uploaded_at DESC);

ALTER TABLE public.code_file_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "code_file_versions admin select"
  ON public.code_file_versions FOR SELECT TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "code_file_versions admin insert"
  ON public.code_file_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "code_file_versions admin update"
  ON public.code_file_versions FOR UPDATE TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()))
  WITH CHECK (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "code_file_versions admin delete"
  ON public.code_file_versions FOR DELETE TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()));
