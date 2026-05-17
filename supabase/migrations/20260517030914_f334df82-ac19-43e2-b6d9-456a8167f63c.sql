
CREATE TABLE public.design_tokens (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'ppt-color',
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.design_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "design_tokens_select_authenticated"
ON public.design_tokens FOR SELECT TO authenticated USING (true);

CREATE POLICY "design_tokens_insert_admin"
ON public.design_tokens FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "design_tokens_update_admin"
ON public.design_tokens FOR UPDATE TO authenticated
USING (public.is_admin_or_superuser(auth.uid()))
WITH CHECK (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "design_tokens_delete_admin"
ON public.design_tokens FOR DELETE TO authenticated
USING (public.is_admin_or_superuser(auth.uid()));

CREATE OR REPLACE FUNCTION public.validate_design_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.category = 'ppt-color' AND NEW.value !~ '^[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid hex color "%": must be 6 hex digits without #', NEW.value;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_design_token
BEFORE INSERT OR UPDATE ON public.design_tokens
FOR EACH ROW EXECUTE FUNCTION public.validate_design_token();

INSERT INTO public.design_tokens (key, value, description, category) VALUES
  ('ppt.color.primary', '1E2761', 'Primary brand color (cover bg, headers)', 'ppt-color'),
  ('ppt.color.accent',  '4F46E5', 'Accent color (highlights, chips)',        'ppt-color'),
  ('ppt.color.text',    '1F2937', 'Body text color',                          'ppt-color'),
  ('ppt.color.muted',   '6B7280', 'Muted/secondary text color',               'ppt-color'),
  ('ppt.color.bg_soft', 'F1F5F9', 'Soft card background',                     'ppt-color'),
  ('ppt.color.danger',  'DC2626', 'Negative variance / danger',               'ppt-color'),
  ('ppt.color.ok',      '16A34A', 'Positive variance / success',              'ppt-color');
