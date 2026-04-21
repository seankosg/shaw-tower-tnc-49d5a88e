
-- 1. Add team column to profiles
ALTER TABLE public.profiles
  ADD COLUMN team public.team_type DEFAULT NULL;

-- 2. Update handle_new_user trigger to include team
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_login_id text;
  v_user_type public.user_type;
  v_subcontractor_name text;
  v_subsub_name text;
  v_hdec_pic_name text;
  v_must_change boolean;
  v_team public.team_type;
BEGIN
  v_login_id := COALESCE(
    NEW.raw_user_meta_data->>'login_id',
    split_part(NEW.email, '@', 1)
  );
  v_user_type := COALESCE(
    (NEW.raw_user_meta_data->>'user_type')::public.user_type,
    'hdec'::public.user_type
  );
  v_subcontractor_name := NEW.raw_user_meta_data->>'subcontractor_name';
  v_subsub_name := NEW.raw_user_meta_data->>'subsub_name';
  v_hdec_pic_name := NEW.raw_user_meta_data->>'hdec_pic_name';
  v_must_change := COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true);
  v_team := (NEW.raw_user_meta_data->>'team')::public.team_type;

  INSERT INTO public.profiles (
    user_id, email, name, login_id, user_type,
    subcontractor_name, subsub_name, hdec_pic_name, must_change_password, team
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', v_login_id),
    v_login_id,
    v_user_type,
    v_subcontractor_name,
    v_subsub_name,
    v_hdec_pic_name,
    v_must_change,
    v_team
  );
  RETURN NEW;
END;
$function$;

-- 3. Create a security definer function to get user team (avoids RLS recursion on profiles)
CREATE OR REPLACE FUNCTION public.get_user_team(_user_id uuid)
RETURNS public.team_type
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- 4. Update subtests UPDATE policy: add senior_user + same team
DROP POLICY "Users can update permitted subtests" ON subtests;
CREATE POLICY "Users can update permitted subtests" ON subtests
  FOR UPDATE TO authenticated
  USING (
    can_edit_subtest(auth.uid(), project_id, system_id, subcontractor_name, subsub_name)
    OR (
      has_role(auth.uid(), 'senior_user'::app_role)
      AND team IS NOT NULL
      AND team = get_user_team(auth.uid())
    )
  );

-- 5. Update subtests DELETE policy: add senior_user + same team
DROP POLICY "Authorized can delete subtests" ON subtests;
CREATE POLICY "Authorized can delete subtests" ON subtests
  FOR DELETE TO authenticated
  USING (
    is_admin_or_superuser(auth.uid())
    OR (
      has_any_role(auth.uid(), ARRAY['senior_user'::app_role])
      AND has_system_permission(auth.uid(), project_id, system_id, 'edit'::text)
    )
    OR (
      has_role(auth.uid(), 'senior_user'::app_role)
      AND team IS NOT NULL
      AND team = get_user_team(auth.uid())
    )
  );
