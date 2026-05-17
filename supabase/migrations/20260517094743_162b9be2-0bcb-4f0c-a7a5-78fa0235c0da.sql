
-- Helper: senior_user or higher (senior_user, d_superuser, superuser, admin)
CREATE OR REPLACE FUNCTION public.is_senior_or_above(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_any_role(_user_id, ARRAY['senior_user','d_superuser','superuser','admin']::public.app_role[])
$$;

-- ─────────────────────────────────────────
-- design_tokens: open INSERT/UPDATE/DELETE to senior_user+
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "design_tokens_insert_admin" ON public.design_tokens;
DROP POLICY IF EXISTS "design_tokens_update_admin" ON public.design_tokens;
DROP POLICY IF EXISTS "design_tokens_delete_admin" ON public.design_tokens;

CREATE POLICY "design_tokens_insert_senior_plus" ON public.design_tokens
  FOR INSERT TO authenticated
  WITH CHECK (public.is_senior_or_above(auth.uid()));

CREATE POLICY "design_tokens_update_senior_plus" ON public.design_tokens
  FOR UPDATE TO authenticated
  USING (public.is_senior_or_above(auth.uid()))
  WITH CHECK (public.is_senior_or_above(auth.uid()));

CREATE POLICY "design_tokens_delete_senior_plus" ON public.design_tokens
  FOR DELETE TO authenticated
  USING (public.is_senior_or_above(auth.uid()));

-- ─────────────────────────────────────────
-- slide_text_overrides: senior_user+ for writes
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert slide text overrides" ON public.slide_text_overrides;
DROP POLICY IF EXISTS "Admins can update slide text overrides" ON public.slide_text_overrides;
DROP POLICY IF EXISTS "Admins can delete slide text overrides" ON public.slide_text_overrides;

CREATE POLICY "slide_text_overrides_insert_senior_plus" ON public.slide_text_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public.is_senior_or_above(auth.uid()));

CREATE POLICY "slide_text_overrides_update_senior_plus" ON public.slide_text_overrides
  FOR UPDATE TO authenticated
  USING (public.is_senior_or_above(auth.uid()))
  WITH CHECK (public.is_senior_or_above(auth.uid()));

CREATE POLICY "slide_text_overrides_delete_senior_plus" ON public.slide_text_overrides
  FOR DELETE TO authenticated
  USING (public.is_senior_or_above(auth.uid()));

-- ─────────────────────────────────────────
-- ppt_slide_config: senior_user+ for writes
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can insert ppt_slide_config" ON public.ppt_slide_config;
DROP POLICY IF EXISTS "Admins can update ppt_slide_config" ON public.ppt_slide_config;
DROP POLICY IF EXISTS "Admins can delete ppt_slide_config" ON public.ppt_slide_config;

CREATE POLICY "ppt_slide_config_insert_senior_plus" ON public.ppt_slide_config
  FOR INSERT TO authenticated
  WITH CHECK (public.is_senior_or_above(auth.uid()));

CREATE POLICY "ppt_slide_config_update_senior_plus" ON public.ppt_slide_config
  FOR UPDATE TO authenticated
  USING (public.is_senior_or_above(auth.uid()))
  WITH CHECK (public.is_senior_or_above(auth.uid()));

CREATE POLICY "ppt_slide_config_delete_senior_plus" ON public.ppt_slide_config
  FOR DELETE TO authenticated
  USING (public.is_senior_or_above(auth.uid()));

-- ─────────────────────────────────────────
-- custom_slides: open UPDATE/DELETE to senior_user+ (INSERT already d_superuser+)
-- ─────────────────────────────────────────
DROP POLICY IF EXISTS "custom_slides_update_admin_only" ON public.custom_slides;
DROP POLICY IF EXISTS "custom_slides_delete_admin_only" ON public.custom_slides;
DROP POLICY IF EXISTS "custom_slides_insert_dsuper_plus" ON public.custom_slides;

CREATE POLICY "custom_slides_insert_senior_plus" ON public.custom_slides
  FOR INSERT TO authenticated
  WITH CHECK (public.is_senior_or_above(auth.uid()));

CREATE POLICY "custom_slides_update_senior_plus" ON public.custom_slides
  FOR UPDATE TO authenticated
  USING (public.is_senior_or_above(auth.uid()))
  WITH CHECK (public.is_senior_or_above(auth.uid()));

CREATE POLICY "custom_slides_delete_senior_plus" ON public.custom_slides
  FOR DELETE TO authenticated
  USING (public.is_senior_or_above(auth.uid()));

-- ─────────────────────────────────────────
-- NEW TABLE: slide_display_options
-- Per-slide display options (chart type, visibility toggles, etc.)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.slide_display_options (
  id         uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_key  text NOT NULL UNIQUE,
  options    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.slide_display_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slide_display_options_select_authenticated"
  ON public.slide_display_options
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "slide_display_options_insert_senior_plus"
  ON public.slide_display_options
  FOR INSERT TO authenticated
  WITH CHECK (public.is_senior_or_above(auth.uid()));

CREATE POLICY "slide_display_options_update_senior_plus"
  ON public.slide_display_options
  FOR UPDATE TO authenticated
  USING (public.is_senior_or_above(auth.uid()))
  WITH CHECK (public.is_senior_or_above(auth.uid()));

CREATE POLICY "slide_display_options_delete_senior_plus"
  ON public.slide_display_options
  FOR DELETE TO authenticated
  USING (public.is_senior_or_above(auth.uid()));

CREATE TRIGGER trg_slide_display_options_updated_at
  BEFORE UPDATE ON public.slide_display_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
