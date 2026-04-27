-- Seed module status flags
INSERT INTO public.app_settings (key, value)
VALUES
  ('module_tnc_status', '{"enabled": true}'::jsonb),
  ('module_defect_status', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Tighten RLS: module status keys can only be changed by admin (not superuser)
DROP POLICY IF EXISTS "Admins can manage app settings" ON public.app_settings;

CREATE POLICY "Module keys admin only, others admin or superuser"
ON public.app_settings
FOR ALL TO authenticated
USING (
  CASE
    WHEN key IN ('module_tnc_status', 'module_defect_status')
      THEN public.has_role(auth.uid(), 'admin'::public.app_role)
    ELSE public.is_admin_or_superuser(auth.uid())
  END
)
WITH CHECK (
  CASE
    WHEN key IN ('module_tnc_status', 'module_defect_status')
      THEN public.has_role(auth.uid(), 'admin'::public.app_role)
    ELSE public.is_admin_or_superuser(auth.uid())
  END
);