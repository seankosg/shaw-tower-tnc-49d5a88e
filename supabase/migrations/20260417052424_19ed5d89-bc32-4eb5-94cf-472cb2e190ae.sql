DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'admin@shaw.local';
  v_password text := 'Sean71';
  v_login_id text := 'admin';
  v_existing_id uuid;
BEGIN
  -- Skip if already exists
  SELECT id INTO v_existing_id FROM auth.users WHERE email = v_email;
  IF v_existing_id IS NOT NULL THEN
    RAISE NOTICE 'Admin user already exists: %', v_existing_id;
    RETURN;
  END IF;

  v_user_id := gen_random_uuid();

  -- Insert into auth.users with bcrypt-hashed password
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'login_id', v_login_id,
      'name', 'Administrator',
      'user_type', 'admin',
      'must_change_password', false
    ),
    now(), now(),
    '', '', '', ''
  );

  -- Identity record (required for email login)
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email',
    v_user_id::text,
    now(), now(), now()
  );

  -- handle_new_user trigger creates profiles row; ensure must_change_password=false
  UPDATE public.profiles
     SET must_change_password = false,
         user_type = 'admin',
         name = 'Administrator',
         login_id = v_login_id
   WHERE user_id = v_user_id;

  -- If profile wasn't auto-created (no trigger on auth.users), insert manually
  INSERT INTO public.profiles (user_id, email, name, login_id, user_type, must_change_password)
  SELECT v_user_id, v_email, 'Administrator', v_login_id, 'admin', false
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_user_id);

  -- Grant admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin'::public.app_role)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Admin user created: %', v_user_id;
END $$;