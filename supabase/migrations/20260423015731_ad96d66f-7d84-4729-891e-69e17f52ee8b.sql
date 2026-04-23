CREATE OR REPLACE FUNCTION public.get_subtest_edit_scope(_user_id uuid, _subtest_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  st record;
  prof record;
  parent_sub_id uuid;
BEGIN
  IF _user_id IS NULL OR _subtest_id IS NULL THEN
    RETURN 'none';
  END IF;

  SELECT project_id, system_id, subcontractor_name, subsub_name, hdec_pic_name, team
  INTO st
  FROM public.subtests
  WHERE id = _subtest_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'none';
  END IF;

  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN 'full';
  END IF;

  IF public.has_system_permission(_user_id, st.project_id, st.system_id, 'edit') THEN
    RETURN 'full';
  END IF;

  SELECT user_type, subcontractor_name, subsub_name, hdec_pic_name, team
  INTO prof
  FROM public.profiles
  WHERE user_id = _user_id
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'none';
  END IF;

  IF public.has_role(_user_id, 'senior_user'::public.app_role)
    AND st.team IS NOT NULL
    AND prof.team IS NOT NULL
    AND st.team = prof.team THEN
    RETURN 'team';
  END IF;

  IF prof.user_type = 'hdec'
    AND prof.hdec_pic_name IS NOT NULL
    AND trim(prof.hdec_pic_name) <> ''
    AND lower(trim(coalesce(st.hdec_pic_name, ''))) = lower(trim(prof.hdec_pic_name)) THEN
    RETURN 'assigned';
  END IF;

  IF prof.user_type = 'subsub'
    AND prof.subsub_name IS NOT NULL
    AND trim(prof.subsub_name) <> ''
    AND lower(trim(coalesce(st.subsub_name, ''))) = lower(trim(prof.subsub_name)) THEN
    RETURN 'assigned';
  END IF;

  IF prof.user_type = 'subcontractor'
    AND prof.subcontractor_name IS NOT NULL
    AND trim(prof.subcontractor_name) <> '' THEN
    IF lower(trim(coalesce(st.subcontractor_name, ''))) = lower(trim(prof.subcontractor_name)) THEN
      RETURN 'assigned';
    END IF;

    SELECT id
    INTO parent_sub_id
    FROM public.subcontractor_master
    WHERE type = 'sub'
      AND is_active = true
      AND lower(trim(name)) = lower(trim(prof.subcontractor_name))
    LIMIT 1;

    IF parent_sub_id IS NOT NULL
      AND st.subsub_name IS NOT NULL
      AND trim(st.subsub_name) <> ''
      AND EXISTS (
        SELECT 1
        FROM public.subcontractor_master child
        WHERE child.type = 'subsub'
          AND child.is_active = true
          AND child.parent_subcontractor_id = parent_sub_id
          AND lower(trim(child.name)) = lower(trim(st.subsub_name))
      ) THEN
      RETURN 'assigned';
    END IF;
  END IF;

  RETURN 'none';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_update_subtest(_user_id uuid, _subtest_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.get_subtest_edit_scope(_user_id, _subtest_id) IN ('assigned', 'team', 'full')
$$;

CREATE OR REPLACE FUNCTION public.can_edit_subtest(
  _user_id uuid,
  _project_id uuid,
  _system_id uuid,
  _subcontractor_name text,
  _subsub_name text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_type text;
  _profile_sub text;
  _profile_subsub text;
  _profile_hdec text;
  _parent_sub_id uuid;
BEGIN
  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN true;
  END IF;

  IF public.has_system_permission(_user_id, _project_id, _system_id, 'edit') THEN
    RETURN true;
  END IF;

  SELECT user_type, subcontractor_name, subsub_name, hdec_pic_name
  INTO _user_type, _profile_sub, _profile_subsub, _profile_hdec
  FROM public.profiles
  WHERE user_id = _user_id
    AND is_active = true
  LIMIT 1;

  IF _user_type = 'subsub' THEN
    RETURN _profile_subsub IS NOT NULL
      AND trim(_profile_subsub) <> ''
      AND lower(trim(coalesce(_subsub_name, ''))) = lower(trim(_profile_subsub));
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

      RETURN _parent_sub_id IS NOT NULL
        AND _subsub_name IS NOT NULL
        AND trim(_subsub_name) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.subcontractor_master child
          WHERE child.type = 'subsub'
            AND child.is_active = true
            AND child.parent_subcontractor_id = _parent_sub_id
            AND lower(trim(child.name)) = lower(trim(_subsub_name))
        );
    END IF;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_subtest_responsibility_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  scope text;
BEGIN
  scope := public.get_subtest_edit_scope(auth.uid(), OLD.id);

  IF scope = 'assigned' AND (
    OLD.subcontractor_name IS DISTINCT FROM NEW.subcontractor_name OR
    OLD.subsub_name IS DISTINCT FROM NEW.subsub_name OR
    OLD.hdec_pic_name IS DISTINCT FROM NEW.hdec_pic_name
  ) THEN
    RAISE EXCEPTION 'You do not have permission to change responsibility fields.';
  END IF;

  IF scope = 'none' THEN
    RAISE EXCEPTION 'You do not have permission to update this subtest.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_subtest_responsibility_update ON public.subtests;
CREATE TRIGGER validate_subtest_responsibility_update
BEFORE UPDATE ON public.subtests
FOR EACH ROW
EXECUTE FUNCTION public.validate_subtest_responsibility_update();

DROP POLICY IF EXISTS "Users can update permitted subtests" ON public.subtests;
CREATE POLICY "Users can update permitted subtests"
ON public.subtests
FOR UPDATE
TO authenticated
USING (public.can_update_subtest(auth.uid(), id))
WITH CHECK (public.can_update_subtest(auth.uid(), id));