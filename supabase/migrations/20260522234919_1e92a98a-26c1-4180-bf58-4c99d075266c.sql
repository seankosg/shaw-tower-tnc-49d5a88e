
-- 1) Fix function search_path mutable warnings
ALTER FUNCTION public.is_reserved_custom_field(text, text) SET search_path = public;
ALTER FUNCTION public.warranty_compute_row_hash() SET search_path = public;
ALTER FUNCTION public.warranty_compute_validation_pass() SET search_path = public;

-- 2) Replace always-true RLS policies on warranty log tables
DROP POLICY IF EXISTS "warranty_change_log insert by authenticated" ON public.warranty_change_log;
CREATE POLICY "warranty_change_log insert by authenticated"
  ON public.warranty_change_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "warranty_upload_row_logs insert by authenticated" ON public.warranty_upload_row_logs;
CREATE POLICY "warranty_upload_row_logs insert by authenticated"
  ON public.warranty_upload_row_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3) Revoke EXECUTE from anon and authenticated on trigger-only SECURITY DEFINER functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_function_result(p.oid) = 'trigger'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 4) Revoke EXECUTE from anon on non-trigger SECURITY DEFINER functions
--    (keeps authenticated access for RPC/RLS usage)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND pg_get_function_result(p.oid) <> 'trigger'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;
