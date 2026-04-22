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
  _parent_sub_id uuid;
BEGIN
  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN true;
  END IF;

  IF public.has_role(_user_id, 'super_guest'::app_role) THEN
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

  IF _user_type = 'subsub' THEN
    IF _profile_subsub IS NOT NULL AND trim(_profile_subsub) <> '' THEN
      RETURN lower(trim(coalesce(_subsub_name, ''))) = lower(trim(_profile_subsub));
    END IF;
    RETURN false;
  END IF;

  IF _user_type = 'subcontractor' THEN
    IF _profile_sub IS NOT NULL AND trim(_profile_sub) <> '' THEN
      IF lower(trim(coalesce(_subcontractor_name, ''))) = lower(trim(_profile_sub)) THEN
        RETURN true;
      END IF;

      SELECT id
      INTO _parent_sub_id
      FROM public.subcontractor_master
      WHERE type = 'sub'
        AND is_active = true
        AND lower(trim(name)) = lower(trim(_profile_sub))
      LIMIT 1;

      IF _parent_sub_id IS NOT NULL
        AND _subsub_name IS NOT NULL
        AND trim(_subsub_name) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.subcontractor_master child
          WHERE child.type = 'subsub'
            AND child.is_active = true
            AND child.parent_subcontractor_id = _parent_sub_id
            AND lower(trim(child.name)) = lower(trim(_subsub_name))
        ) THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  RETURN false;
END;
$function$;

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
  _parent_sub_id uuid;
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

  IF _user_type = 'subsub' THEN
    IF _profile_subsub IS NOT NULL AND trim(_profile_subsub) <> '' THEN
      RETURN lower(trim(coalesce(_subsub_name, ''))) = lower(trim(_profile_subsub));
    END IF;
    RETURN false;
  END IF;

  IF _user_type = 'subcontractor' THEN
    IF _profile_sub IS NOT NULL AND trim(_profile_sub) <> '' THEN
      IF lower(trim(coalesce(_subcontractor_name, ''))) = lower(trim(_profile_sub)) THEN
        RETURN true;
      END IF;

      SELECT id
      INTO _parent_sub_id
      FROM public.subcontractor_master
      WHERE type = 'sub'
        AND is_active = true
        AND lower(trim(name)) = lower(trim(_profile_sub))
      LIMIT 1;

      IF _parent_sub_id IS NOT NULL
        AND _subsub_name IS NOT NULL
        AND trim(_subsub_name) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.subcontractor_master child
          WHERE child.type = 'subsub'
            AND child.is_active = true
            AND child.parent_subcontractor_id = _parent_sub_id
            AND lower(trim(child.name)) = lower(trim(_subsub_name))
        ) THEN
        RETURN true;
      END IF;
    END IF;
  END IF;

  RETURN false;
END;
$function$;