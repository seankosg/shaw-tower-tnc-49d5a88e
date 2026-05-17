-- Slide text overrides
CREATE TABLE public.slide_text_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slide_key, field_key)
);

ALTER TABLE public.slide_text_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read slide text overrides"
ON public.slide_text_overrides FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert slide text overrides"
ON public.slide_text_overrides FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update slide text overrides"
ON public.slide_text_overrides FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete slide text overrides"
ON public.slide_text_overrides FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_slide_text_overrides_updated_at
BEFORE UPDATE ON public.slide_text_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();