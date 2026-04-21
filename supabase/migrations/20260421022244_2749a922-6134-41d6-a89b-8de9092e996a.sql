
-- 1. Add 'subsub' to user_type enum
ALTER TYPE public.user_type ADD VALUE IF NOT EXISTS 'subsub';

-- 2. Update can_view_subtest to handle subsub type
CREATE OR REPLACE FUNCTION public.can_view_subtest(_user_id uuid, _subcontractor_name text, _subsub_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_type text;
  _profile_sub text;
  _profile_subsub text;
BEGIN
  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN true;
  END IF;

  SELECT user_type, subcontractor_name, subsub_name
  INTO _user_type, _profile_sub, _profile_subsub
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1;

  IF _user_type IN ('hdec', 'pm_pd', 'admin') THEN
    RETURN true;
  END IF;

  IF _user_type IN ('subcontractor', 'subsub') THEN
    IF _profile_subsub IS NOT NULL AND _profile_subsub <> '' THEN
      RETURN lower(trim(_subsub_name)) = lower(trim(_profile_subsub));
    END IF;
    IF _profile_sub IS NOT NULL AND _profile_sub <> '' THEN
      RETURN lower(trim(_subcontractor_name)) = lower(trim(_profile_sub));
    END IF;
  END IF;

  RETURN false;
END;
$function$;

-- 3. Update can_edit_subtest to handle subsub type
CREATE OR REPLACE FUNCTION public.can_edit_subtest(_user_id uuid, _project_id uuid, _system_id uuid, _subcontractor_name text, _subsub_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_type text;
  _profile_sub text;
  _profile_subsub text;
BEGIN
  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN true;
  END IF;

  IF NOT public.has_system_permission(_user_id, _project_id, _system_id, 'edit') THEN
    RETURN false;
  END IF;

  SELECT user_type, subcontractor_name, subsub_name
  INTO _user_type, _profile_sub, _profile_subsub
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1;

  IF _user_type IN ('hdec', 'pm_pd', 'admin') THEN
    RETURN true;
  END IF;

  IF _user_type IN ('subcontractor', 'subsub') THEN
    IF _profile_subsub IS NOT NULL AND _profile_subsub <> '' THEN
      RETURN lower(trim(_subsub_name)) = lower(trim(_profile_subsub));
    END IF;
    IF _profile_sub IS NOT NULL AND _profile_sub <> '' THEN
      RETURN lower(trim(_subcontractor_name)) = lower(trim(_profile_sub));
    END IF;
  END IF;

  RETURN false;
END;
$function$;
