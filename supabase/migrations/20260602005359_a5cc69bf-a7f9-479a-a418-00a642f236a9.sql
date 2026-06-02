-- ========== Backup hardening (A: schema DDL, B: auth.identities, C: consistency markers) ==========

-- (C) Snapshot/txn markers for consistency reporting
CREATE OR REPLACE FUNCTION public.backup_consistency_marker()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'captured_at', now(),
    'txid', txid_current(),
    'snapshot_id', pg_export_snapshot(),
    'xmin', (SELECT backend_xmin FROM pg_stat_activity WHERE pid = pg_backend_pid())
  );
$$;

REVOKE ALL ON FUNCTION public.backup_consistency_marker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backup_consistency_marker() TO service_role;

-- (B) Dump auth.identities — only id+user_id+provider+identity_data+timestamps (no secret tokens)
CREATE OR REPLACE FUNCTION public.dump_auth_identities()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
    SELECT jsonb_build_object(
      'id', i.id::text,
      'user_id', i.user_id::text,
      'provider', i.provider,
      'provider_id', i.provider_id,
      'identity_data', i.identity_data,
      'email', i.email,
      'last_sign_in_at', i.last_sign_in_at,
      'created_at', i.created_at,
      'updated_at', i.updated_at
    )
    FROM auth.identities i;
END;
$$;

REVOKE ALL ON FUNCTION public.dump_auth_identities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dump_auth_identities() TO service_role;

-- Restore one auth.identities row (idempotent upsert; requires referenced auth.users to exist)
CREATE OR REPLACE FUNCTION public.restore_auth_identity(_payload jsonb, _overwrite boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id uuid := (_payload->>'id')::uuid;
  v_user_id uuid := (_payload->>'user_id')::uuid;
  v_provider text := _payload->>'provider';
  v_provider_id text := COALESCE(_payload->>'provider_id', (_payload->>'id'));
  v_exists boolean;
BEGIN
  -- Skip if referenced user doesn't exist (auth.users restore goes first)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RETURN 'skipped_missing_user';
  END IF;

  SELECT EXISTS(SELECT 1 FROM auth.identities WHERE id = v_id) INTO v_exists;
  IF v_exists AND NOT _overwrite THEN
    RETURN 'skipped_exists';
  END IF;

  IF v_exists THEN
    UPDATE auth.identities SET
      user_id = v_user_id,
      provider = v_provider,
      provider_id = v_provider_id,
      identity_data = COALESCE(_payload->'identity_data', identity_data),
      email = COALESCE(_payload->>'email', email),
      last_sign_in_at = COALESCE((_payload->>'last_sign_in_at')::timestamptz, last_sign_in_at),
      updated_at = now()
    WHERE id = v_id;
    RETURN 'updated';
  ELSE
    INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data, email, last_sign_in_at, created_at, updated_at)
    VALUES (
      v_id, v_user_id, v_provider, v_provider_id,
      COALESCE(_payload->'identity_data', '{}'::jsonb),
      _payload->>'email',
      COALESCE((_payload->>'last_sign_in_at')::timestamptz, NULL),
      COALESCE((_payload->>'created_at')::timestamptz, now()),
      COALESCE((_payload->>'updated_at')::timestamptz, now())
    );
    RETURN 'inserted';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN 'error:' || SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_auth_identity(jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_auth_identity(jsonb, boolean) TO service_role;

-- (A) Export public schema DDL as a single SQL text blob suitable for a fresh project bootstrap.
-- Covers: enums/composite types, tables (columns/defaults/nullable),
-- primary/unique/foreign-key/check constraints, indexes, functions, triggers,
-- RLS enable + policies, and GRANTs.
CREATE OR REPLACE FUNCTION public.export_schema_ddl()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_out text := '';
  r record;
BEGIN
  v_out := v_out || E'-- ========================================\n';
  v_out := v_out || E'-- public schema DDL dump\n';
  v_out := v_out || E'-- generated_at: ' || now()::text || E'\n';
  v_out := v_out || E'-- ========================================\n\n';
  v_out := v_out || E'-- NOTE: Apply to an EMPTY public schema. Order matters: types -> tables -> constraints -> indexes -> functions -> triggers -> RLS -> policies -> grants.\n\n';

  -- 1) Custom types (enums)
  v_out := v_out || E'\n-- ===== ENUM TYPES =====\n';
  FOR r IN
    SELECT n.nspname, t.typname,
           string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
    GROUP BY n.nspname, t.typname
    ORDER BY t.typname
  LOOP
    v_out := v_out || format('CREATE TYPE public.%I AS ENUM (%s);' || E'\n', r.typname, r.labels);
  END LOOP;

  -- 2) Tables (columns)
  v_out := v_out || E'\n-- ===== TABLES =====\n';
  FOR r IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    v_out := v_out || format('CREATE TABLE IF NOT EXISTS public.%I (', r.table_name) || E'\n';
    v_out := v_out || (
      SELECT string_agg(
        format('  %I %s%s%s',
          a.attname,
          pg_catalog.format_type(a.atttypid, a.atttypmod),
          CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
          CASE
            WHEN ad.adbin IS NOT NULL
              THEN ' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid)
            ELSE ''
          END
        ),
        E',\n' ORDER BY a.attnum
      )
      FROM pg_attribute a
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      WHERE a.attrelid = ('public.' || quote_ident(r.table_name))::regclass
        AND a.attnum > 0 AND NOT a.attisdropped
    );
    v_out := v_out || E'\n);\n';
  END LOOP;

  -- 3) Constraints (PK, UQ, FK, CHECK)
  v_out := v_out || E'\n-- ===== CONSTRAINTS =====\n';
  FOR r IN
    SELECT n.nspname AS schema, cl.relname AS table_name,
           con.conname, pg_get_constraintdef(con.oid, true) AS def
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
    ORDER BY cl.relname, con.contype, con.conname
  LOOP
    v_out := v_out || format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;' || E'\n',
      r.table_name, r.conname, r.def);
  END LOOP;

  -- 4) Indexes (skip those auto-created by constraints)
  v_out := v_out || E'\n-- ===== INDEXES =====\n';
  FOR r IN
    SELECT i.indexname, i.indexdef
    FROM pg_indexes i
    WHERE i.schemaname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conindid
        WHERE cl.relname = i.indexname
      )
    ORDER BY i.tablename, i.indexname
  LOOP
    v_out := v_out || r.indexdef || E';\n';
  END LOOP;

  -- 5) Functions
  v_out := v_out || E'\n-- ===== FUNCTIONS =====\n';
  FOR r IN
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
    ORDER BY p.proname
  LOOP
    v_out := v_out || r.def || E';\n\n';
  END LOOP;

  -- 6) Triggers
  v_out := v_out || E'\n-- ===== TRIGGERS =====\n';
  FOR r IN
    SELECT t.tgname, pg_get_triggerdef(t.oid, true) AS def
    FROM pg_trigger t
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY cl.relname, t.tgname
  LOOP
    v_out := v_out || r.def || E';\n';
  END LOOP;

  -- 7) RLS enable
  v_out := v_out || E'\n-- ===== ROW LEVEL SECURITY =====\n';
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    ORDER BY c.relname
  LOOP
    v_out := v_out || format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;' || E'\n', r.relname);
  END LOOP;

  -- 8) Policies
  v_out := v_out || E'\n-- ===== POLICIES =====\n';
  FOR r IN
    SELECT pol.polname, c.relname,
           CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                           WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                           ELSE 'ALL' END AS cmd,
           pol.polpermissive,
           pg_get_expr(pol.polqual, pol.polrelid) AS qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check,
           ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(pol.polroles)) AS roles
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    ORDER BY c.relname, pol.polname
  LOOP
    v_out := v_out || format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;' || E'\n',
      r.polname, r.relname,
      CASE WHEN r.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.cmd,
      COALESCE(array_to_string(r.roles, ', '), 'public'),
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END
    );
  END LOOP;

  -- 9) Grants on tables
  v_out := v_out || E'\n-- ===== GRANTS =====\n';
  FOR r IN
    SELECT grantee, table_name, string_agg(privilege_type, ', ') AS privs
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated', 'service_role')
    GROUP BY grantee, table_name
    ORDER BY table_name, grantee
  LOOP
    v_out := v_out || format('GRANT %s ON public.%I TO %I;' || E'\n', r.privs, r.table_name, r.grantee);
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.export_schema_ddl() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_schema_ddl() TO service_role;