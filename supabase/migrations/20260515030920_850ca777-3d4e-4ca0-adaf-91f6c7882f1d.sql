DROP POLICY IF EXISTS "Module keys admin only, others admin or superuser" ON public.app_settings;

CREATE POLICY "Module keys admin only, others admin or superuser"
ON public.app_settings
AS PERMISSIVE
FOR ALL
TO authenticated
USING (
  CASE
    WHEN key = ANY (ARRAY['module_tnc_status'::text, 'module_defect_status'::text, 'module_docs_status'::text, 'module_punch_status'::text])
      THEN has_role(auth.uid(), 'admin'::app_role)
    ELSE is_admin_or_superuser(auth.uid())
  END
)
WITH CHECK (
  CASE
    WHEN key = ANY (ARRAY['module_tnc_status'::text, 'module_defect_status'::text, 'module_docs_status'::text, 'module_punch_status'::text])
      THEN has_role(auth.uid(), 'admin'::app_role)
    ELSE is_admin_or_superuser(auth.uid())
  END
);