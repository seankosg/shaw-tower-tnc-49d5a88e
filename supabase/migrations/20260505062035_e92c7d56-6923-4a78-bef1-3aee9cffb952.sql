
-- =========================================================
-- Helper functions
-- =========================================================
CREATE OR REPLACE FUNCTION public.user_team_matches(_user_id uuid, _team public.team_type)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND is_active = true
      AND team IS NOT NULL
      AND team = _team
  )
$$;

CREATE OR REPLACE FUNCTION public.can_write_for_team(_user_id uuid, _team public.team_type)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_admin_or_superuser(_user_id)
      OR (public.has_role(_user_id, 'd_superuser'::public.app_role)
          AND _team IS NOT NULL
          AND public.user_team_matches(_user_id, _team))
$$;

-- =========================================================
-- Extend edit-scope helpers: d_superuser → 'full' on own-team
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_defect_edit_scope(_user_id uuid, _defect_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d record;
  prof record;
BEGIN
  IF _user_id IS NULL OR _defect_id IS NULL THEN
    RETURN 'none';
  END IF;

  SELECT subcontractor_name, subsub_name, hdec_pic_name, team
  INTO d
  FROM public.defect_items
  WHERE id = _defect_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'none';
  END IF;

  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN 'full';
  END IF;

  SELECT user_type, subcontractor_name, subsub_name, hdec_pic_name, team
  INTO prof
  FROM public.profiles
  WHERE user_id = _user_id AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'none';
  END IF;

  -- D.Super User: full edit on own-team rows
  IF public.has_role(_user_id, 'd_superuser'::public.app_role)
    AND d.team IS NOT NULL
    AND prof.team IS NOT NULL
    AND d.team = prof.team THEN
    RETURN 'full';
  END IF;

  IF public.has_role(_user_id, 'senior_user'::public.app_role)
    AND d.team IS NOT NULL
    AND prof.team IS NOT NULL
    AND d.team = prof.team THEN
    RETURN 'team';
  END IF;

  IF prof.user_type = 'hdec'
    AND prof.hdec_pic_name IS NOT NULL
    AND trim(prof.hdec_pic_name) <> ''
    AND lower(trim(coalesce(d.hdec_pic_name, ''))) = lower(trim(prof.hdec_pic_name)) THEN
    RETURN 'assigned';
  END IF;

  IF prof.user_type = 'subcontractor'
    AND prof.subcontractor_name IS NOT NULL
    AND trim(prof.subcontractor_name) <> ''
    AND lower(trim(coalesce(d.subcontractor_name, ''))) = lower(trim(prof.subcontractor_name)) THEN
    RETURN 'assigned';
  END IF;

  IF prof.user_type = 'subsub'
    AND prof.subsub_name IS NOT NULL
    AND trim(prof.subsub_name) <> ''
    AND lower(trim(coalesce(d.subsub_name, ''))) = lower(trim(prof.subsub_name)) THEN
    RETURN 'assigned';
  END IF;

  RETURN 'none';
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_subtest_edit_scope(_user_id uuid, _subtest_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- D.Super User: full edit on own-team rows
  IF public.has_role(_user_id, 'd_superuser'::public.app_role)
    AND st.team IS NOT NULL
    AND prof.team IS NOT NULL
    AND st.team = prof.team THEN
    RETURN 'full';
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
$function$;

-- =========================================================
-- Comment-modify helpers: d_superuser can modify on own-team
-- =========================================================
CREATE OR REPLACE FUNCTION public.can_modify_defect_comment(_user_id uuid, _comment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  d_team public.team_type;
  prof_team public.team_type;
BEGIN
  IF _user_id IS NULL OR _comment_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT defect_id, author_user_id
  INTO c
  FROM public.defect_comments
  WHERE id = _comment_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF c.author_user_id = _user_id THEN
    RETURN true;
  END IF;

  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN true;
  END IF;

  IF public.has_role(_user_id, 'd_superuser'::public.app_role)
     OR public.has_role(_user_id, 'senior_user'::public.app_role) THEN
    SELECT team INTO d_team FROM public.defect_items WHERE id = c.defect_id LIMIT 1;
    SELECT team INTO prof_team FROM public.profiles WHERE user_id = _user_id LIMIT 1;
    IF d_team IS NOT NULL AND prof_team IS NOT NULL AND d_team = prof_team THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_modify_subtest_comment(_user_id uuid, _comment_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  s_team public.team_type;
  prof_team public.team_type;
BEGIN
  IF _user_id IS NULL OR _comment_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT subtest_id, author_user_id
  INTO c
  FROM public.subtest_comments
  WHERE id = _comment_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF c.author_user_id = _user_id THEN
    RETURN true;
  END IF;

  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN true;
  END IF;

  IF public.has_role(_user_id, 'd_superuser'::public.app_role)
     OR public.has_role(_user_id, 'senior_user'::public.app_role) THEN
    SELECT team INTO s_team FROM public.subtests WHERE id = c.subtest_id LIMIT 1;
    SELECT team INTO prof_team FROM public.profiles WHERE user_id = _user_id LIMIT 1;
    IF s_team IS NOT NULL AND prof_team IS NOT NULL AND s_team = prof_team THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$function$;

-- =========================================================
-- RLS policies: defect_items
-- =========================================================
DROP POLICY IF EXISTS "Admins can delete defects" ON public.defect_items;
CREATE POLICY "Privileged can delete defects"
ON public.defect_items
FOR DELETE TO authenticated
USING (public.can_write_for_team(auth.uid(), team));

DROP POLICY IF EXISTS "Admins and senior users can insert defects" ON public.defect_items;
CREATE POLICY "Privileged can insert defects"
ON public.defect_items
FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
);

DROP POLICY IF EXISTS "Users can update permitted defects" ON public.defect_items;
CREATE POLICY "Users can update permitted defects"
ON public.defect_items
FOR UPDATE TO authenticated
USING (
  can_update_defect(auth.uid(), id)
  OR has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
)
WITH CHECK (
  can_update_defect(auth.uid(), id)
  OR has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
);

-- =========================================================
-- RLS policies: docs_drawings
-- =========================================================
DROP POLICY IF EXISTS "Admins can delete docs drawings" ON public.docs_drawings;
CREATE POLICY "Privileged can delete docs drawings"
ON public.docs_drawings
FOR DELETE TO authenticated
USING (public.can_write_for_team(auth.uid(), team));

DROP POLICY IF EXISTS "Users can insert docs drawings" ON public.docs_drawings;
CREATE POLICY "Users can insert docs drawings"
ON public.docs_drawings
FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
);

DROP POLICY IF EXISTS "Users can update docs drawings" ON public.docs_drawings;
CREATE POLICY "Users can update docs drawings"
ON public.docs_drawings
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
);

-- =========================================================
-- RLS policies: docs_omm
-- =========================================================
DROP POLICY IF EXISTS "Admins can delete docs omm" ON public.docs_omm;
CREATE POLICY "Privileged can delete docs omm"
ON public.docs_omm
FOR DELETE TO authenticated
USING (public.can_write_for_team(auth.uid(), team));

DROP POLICY IF EXISTS "Users can insert docs omm" ON public.docs_omm;
CREATE POLICY "Users can insert docs omm"
ON public.docs_omm
FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
);

DROP POLICY IF EXISTS "Users can update docs omm" ON public.docs_omm;
CREATE POLICY "Users can update docs omm"
ON public.docs_omm
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
);

-- =========================================================
-- RLS policies: docs_spare_part
-- =========================================================
DROP POLICY IF EXISTS "Admins can delete docs spare part" ON public.docs_spare_part;
CREATE POLICY "Privileged can delete docs spare part"
ON public.docs_spare_part
FOR DELETE TO authenticated
USING (public.can_write_for_team(auth.uid(), team));

DROP POLICY IF EXISTS "Users can insert docs spare part" ON public.docs_spare_part;
CREATE POLICY "Users can insert docs spare part"
ON public.docs_spare_part
FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
);

DROP POLICY IF EXISTS "Users can update docs spare part" ON public.docs_spare_part;
CREATE POLICY "Users can update docs spare part"
ON public.docs_spare_part
FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[])
  OR (public.has_role(auth.uid(), 'd_superuser'::app_role)
      AND public.user_team_matches(auth.uid(), team))
);

-- =========================================================
-- RLS policies: subtests (extend delete to allow d_superuser on own team)
-- =========================================================
DROP POLICY IF EXISTS "Authorized can delete subtests" ON public.subtests;
CREATE POLICY "Authorized can delete subtests"
ON public.subtests
FOR DELETE TO authenticated
USING (
  is_admin_or_superuser(auth.uid())
  OR (has_any_role(auth.uid(), ARRAY['senior_user'::app_role])
      AND has_system_permission(auth.uid(), project_id, system_id, 'edit'))
  OR (has_role(auth.uid(), 'senior_user'::app_role)
      AND team IS NOT NULL
      AND team = get_user_team(auth.uid()))
  OR (has_role(auth.uid(), 'd_superuser'::app_role)
      AND team IS NOT NULL
      AND team = get_user_team(auth.uid()))
);
