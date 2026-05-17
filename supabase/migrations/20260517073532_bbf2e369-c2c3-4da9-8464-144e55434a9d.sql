CREATE TABLE public.custom_slides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  spec jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_slides_select_authenticated"
  ON public.custom_slides FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "custom_slides_insert_dsuper_plus"
  ON public.custom_slides FOR INSERT
  TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'd_superuser'::public.app_role)
    OR public.has_role(auth.uid(), 'superuser'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "custom_slides_update_admin_only"
  ON public.custom_slides FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "custom_slides_delete_admin_only"
  ON public.custom_slides FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_custom_slides_updated_at
  BEFORE UPDATE ON public.custom_slides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_custom_slides_key ON public.custom_slides(key);