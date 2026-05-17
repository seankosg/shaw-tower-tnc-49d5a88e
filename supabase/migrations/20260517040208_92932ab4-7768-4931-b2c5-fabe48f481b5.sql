
-- 1. design_guide_versions table
CREATE TABLE public.design_guide_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  public_url TEXT,
  version_label TEXT,
  summary_ko TEXT,
  tokens_snapshot JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX design_guide_versions_only_one_active
  ON public.design_guide_versions (is_active)
  WHERE is_active = true;

CREATE INDEX design_guide_versions_uploaded_at_idx
  ON public.design_guide_versions (uploaded_at DESC);

ALTER TABLE public.design_guide_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view design guide versions"
  ON public.design_guide_versions FOR SELECT
  TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can insert design guide versions"
  ON public.design_guide_versions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can update design guide versions"
  ON public.design_guide_versions FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can delete design guide versions"
  ON public.design_guide_versions FOR DELETE
  TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()));

-- 2. design-guides storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('design-guides', 'design-guides', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can view design guide files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'design-guides' AND public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can upload design guide files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'design-guides' AND public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can update design guide files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'design-guides' AND public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can delete design guide files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'design-guides' AND public.is_admin_or_superuser(auth.uid()));

-- 3. Add PPT font tokens to design_tokens
-- Bypass hex validation trigger for font category by adding a category check
-- (existing trigger only validates ppt-color category, font category is unaffected)
INSERT INTO public.design_tokens (key, value, description, category)
VALUES
  ('ppt.font.body', 'Pretendard', 'PPT body font family', 'ppt-font'),
  ('ppt.font.mono', 'Consolas', 'PPT monospace font family', 'ppt-font')
ON CONFLICT (key) DO NOTHING;
