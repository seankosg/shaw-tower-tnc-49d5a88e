-- Single-row global PPT slide configuration: ordered list of slide keys + enabled flags.
CREATE TABLE public.ppt_slide_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ppt_slide_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ppt_slide_config"
ON public.ppt_slide_config FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert ppt_slide_config"
ON public.ppt_slide_config FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update ppt_slide_config"
ON public.ppt_slide_config FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete ppt_slide_config"
ON public.ppt_slide_config FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ppt_slide_config_updated_at
BEFORE UPDATE ON public.ppt_slide_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: all 12 slides in default order, all enabled
INSERT INTO public.ppt_slide_config (slides) VALUES (
  '[
    {"key":"cover","enabled":true},
    {"key":"dashboard","enabled":true},
    {"key":"tnc_snapshot","enabled":true},
    {"key":"tnc_scurve","enabled":true},
    {"key":"tnc_forecast","enabled":true},
    {"key":"tnc_action_plan","enabled":true},
    {"key":"defect_snapshot","enabled":true},
    {"key":"defect_scurve","enabled":true},
    {"key":"defect_forecast","enabled":true},
    {"key":"defect_action_plan","enabled":true},
    {"key":"docs_snapshot","enabled":true},
    {"key":"punch_snapshot","enabled":true}
  ]'::jsonb
);