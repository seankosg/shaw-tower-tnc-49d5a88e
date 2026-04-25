-- 1. Add hdec_eng_name column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS hdec_eng_name text;

-- 2. Update handle_new_user to also store hdec_eng_name from user metadata
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
  v_hdec_eng_name text;
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
  v_hdec_eng_name := NEW.raw_user_meta_data->>'hdec_eng_name';
  v_must_change := COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true);
  v_team := (NEW.raw_user_meta_data->>'team')::public.team_type;

  INSERT INTO public.profiles (
    user_id, email, name, login_id, user_type,
    subcontractor_name, subsub_name, hdec_pic_name, hdec_eng_name, must_change_password, team
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
    v_hdec_eng_name,
    v_must_change,
    v_team
  );
  RETURN NEW;
END;
$function$;