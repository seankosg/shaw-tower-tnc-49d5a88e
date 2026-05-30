
-- 1) Dump auth.users including encrypted_password (service_role only)
CREATE OR REPLACE FUNCTION public.dump_auth_users_with_hash()
RETURNS SETOF jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'phone', u.phone,
    'encrypted_password', u.encrypted_password,
    'email_confirmed_at', u.email_confirmed_at,
    'phone_confirmed_at', u.phone_confirmed_at,
    'confirmed_at', u.confirmed_at,
    'last_sign_in_at', u.last_sign_in_at,
    'raw_user_meta_data', u.raw_user_meta_data,
    'raw_app_meta_data', u.raw_app_meta_data,
    'created_at', u.created_at,
    'updated_at', u.updated_at,
    'banned_until', u.banned_until,
    'is_sso_user', u.is_sso_user,
    'aud', u.aud,
    'role', u.role
  )
  FROM auth.users u
  ORDER BY u.created_at;
$$;

REVOKE ALL ON FUNCTION public.dump_auth_users_with_hash() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dump_auth_users_with_hash() TO service_role;

-- 2) Restore (upsert) a single auth.users row from a JSON blob.
-- Called per-user from the edge function under service_role.
CREATE OR REPLACE FUNCTION public.restore_auth_user(_payload jsonb, _overwrite boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid := (_payload->>'id')::uuid;
  v_exists boolean;
BEGIN
  IF v_id IS NULL THEN
    RETURN 'skipped_no_id';
  END IF;

  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = v_id) INTO v_exists;

  IF NOT v_exists THEN
    INSERT INTO auth.users (
      id, instance_id, email, phone, encrypted_password,
      email_confirmed_at, phone_confirmed_at,
      last_sign_in_at, raw_user_meta_data, raw_app_meta_data,
      created_at, updated_at, banned_until, is_sso_user, aud, role
    ) VALUES (
      v_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      _payload->>'email',
      _payload->>'phone',
      _payload->>'encrypted_password',
      NULLIF(_payload->>'email_confirmed_at','')::timestamptz,
      NULLIF(_payload->>'phone_confirmed_at','')::timestamptz,
      NULLIF(_payload->>'last_sign_in_at','')::timestamptz,
      COALESCE(_payload->'raw_user_meta_data', '{}'::jsonb),
      COALESCE(_payload->'raw_app_meta_data', '{"provider":"email","providers":["email"]}'::jsonb),
      COALESCE(NULLIF(_payload->>'created_at','')::timestamptz, now()),
      COALESCE(NULLIF(_payload->>'updated_at','')::timestamptz, now()),
      NULLIF(_payload->>'banned_until','')::timestamptz,
      COALESCE((_payload->>'is_sso_user')::boolean, false),
      COALESCE(_payload->>'aud','authenticated'),
      COALESCE(_payload->>'role','authenticated')
    );

    -- Add identity row so email login works
    IF _payload->>'email' IS NOT NULL THEN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_id,
        jsonb_build_object('sub', v_id::text, 'email', _payload->>'email', 'email_verified', true),
        'email', v_id::text,
        COALESCE(NULLIF(_payload->>'last_sign_in_at','')::timestamptz, now()),
        now(), now()
      )
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN 'inserted';
  ELSE
    IF _overwrite THEN
      UPDATE auth.users SET
        email = _payload->>'email',
        phone = _payload->>'phone',
        encrypted_password = _payload->>'encrypted_password',
        email_confirmed_at = NULLIF(_payload->>'email_confirmed_at','')::timestamptz,
        raw_user_meta_data = COALESCE(_payload->'raw_user_meta_data', raw_user_meta_data),
        raw_app_meta_data = COALESCE(_payload->'raw_app_meta_data', raw_app_meta_data),
        banned_until = NULLIF(_payload->>'banned_until','')::timestamptz,
        updated_at = now()
      WHERE id = v_id;
      RETURN 'updated';
    END IF;
    RETURN 'kept';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_auth_user(jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_auth_user(jsonb, boolean) TO service_role;

-- 3) Count auth.users (for integrity verification)
CREATE OR REPLACE FUNCTION public.count_auth_users()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$ SELECT count(*)::bigint FROM auth.users $$;

REVOKE ALL ON FUNCTION public.count_auth_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_auth_users() TO service_role;

-- 4) Add tracking columns to backup_run_log and restore_run_log
ALTER TABLE public.backup_run_log
  ADD COLUMN IF NOT EXISTS integrity_report jsonb,
  ADD COLUMN IF NOT EXISTS auth_users_backed_up integer,
  ADD COLUMN IF NOT EXISTS storage_objects_backed_up integer,
  ADD COLUMN IF NOT EXISTS storage_bytes_backed_up bigint;

ALTER TABLE public.restore_run_log
  ADD COLUMN IF NOT EXISTS integrity_report jsonb,
  ADD COLUMN IF NOT EXISTS restored_auth_users integer,
  ADD COLUMN IF NOT EXISTS restored_storage_objects integer;
