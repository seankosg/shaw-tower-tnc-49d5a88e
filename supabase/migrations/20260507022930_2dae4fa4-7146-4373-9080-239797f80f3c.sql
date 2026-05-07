
-- 1. Create db-backups storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('db-backups', 'db-backups', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS for db-backups: admin/superuser only
DROP POLICY IF EXISTS "db_backups_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "db_backups_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "db_backups_admin_delete" ON storage.objects;

CREATE POLICY "db_backups_admin_select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'db-backups' AND public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "db_backups_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'db-backups' AND public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "db_backups_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'db-backups' AND public.is_admin_or_superuser(auth.uid()));

-- 3. Extend database_snapshots schema
ALTER TABLE public.database_snapshots
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS manifest jsonb,
  ADD COLUMN IF NOT EXISTS backup_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.database_snapshots
  ALTER COLUMN snapshot_data DROP NOT NULL;

-- 4. Restore helper RPCs
CREATE OR REPLACE FUNCTION public.restore_truncate_all(_tables text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t text;
  qualified text;
BEGIN
  IF NOT public.is_admin_or_superuser(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: admin or superuser required';
  END IF;

  -- Disable triggers and FK checks for the duration
  PERFORM set_config('session_replication_role', 'replica', true);

  FOREACH t IN ARRAY _tables LOOP
    -- Sanity: only allow public schema, alphanumeric/underscore identifiers
    IF t !~ '^[a-z_][a-z0-9_]*$' THEN
      RAISE EXCEPTION 'invalid table name: %', t;
    END IF;
    qualified := format('public.%I', t);
    EXECUTE format('TRUNCATE TABLE %s CASCADE', qualified);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_insert_rows(_table text, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inserted_count int := 0;
BEGIN
  IF NOT public.is_admin_or_superuser(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: admin or superuser required';
  END IF;

  IF _table !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'invalid table name: %', _table;
  END IF;

  IF _rows IS NULL OR jsonb_array_length(_rows) = 0 THEN
    RETURN 0;
  END IF;

  -- Disable triggers/FK checks for this insert too
  PERFORM set_config('session_replication_role', 'replica', true);

  EXECUTE format(
    'INSERT INTO public.%I SELECT * FROM jsonb_populate_recordset(NULL::public.%I, $1)',
    _table, _table
  ) USING _rows;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_truncate_all(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_insert_rows(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_truncate_all(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_insert_rows(text, jsonb) TO authenticated;
