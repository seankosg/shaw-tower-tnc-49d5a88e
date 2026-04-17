CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage app settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (public.is_admin_or_superuser(auth.uid()))
WITH CHECK (public.is_admin_or_superuser(auth.uid()));

INSERT INTO public.app_settings (key, value) VALUES ('at_risk_threshold_days', '2'::jsonb)
ON CONFLICT (key) DO NOTHING;