
-- Create fonts storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fonts', 'fonts', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for fonts bucket
CREATE POLICY "Fonts are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'fonts');

CREATE POLICY "Admins can upload fonts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'fonts' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update fonts"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'fonts' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete fonts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'fonts' AND public.has_role(auth.uid(), 'admin'));

-- font_registry table
CREATE TABLE public.font_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_name TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT 'Regular',
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'mixed' CHECK (language IN ('korean','english','mixed')),
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_name, style)
);

CREATE UNIQUE INDEX font_registry_single_default
  ON public.font_registry ((1)) WHERE is_default = true;

CREATE INDEX font_registry_family_idx ON public.font_registry (family_name);

ALTER TABLE public.font_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read fonts"
ON public.font_registry FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert fonts"
ON public.font_registry FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update fonts"
ON public.font_registry FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete fonts"
ON public.font_registry FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Delete protection for default font
CREATE OR REPLACE FUNCTION public.prevent_default_font_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_default THEN
    RAISE EXCEPTION 'Cannot delete the default font. Set another font as default first.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER prevent_default_font_delete_trigger
BEFORE DELETE ON public.font_registry
FOR EACH ROW
EXECUTE FUNCTION public.prevent_default_font_delete();

-- updated_at trigger
CREATE TRIGGER font_registry_updated_at
BEFORE UPDATE ON public.font_registry
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
