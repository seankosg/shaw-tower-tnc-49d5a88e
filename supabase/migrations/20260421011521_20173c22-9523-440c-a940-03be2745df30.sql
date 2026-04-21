
-- Helper: check if user can edit a specific subtest row
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
SET search_path = public
AS $$
DECLARE
  _user_type text;
  _profile_sub text;
  _profile_subsub text;
BEGIN
  -- admins/superusers can edit everything
  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN true;
  END IF;

  -- must have system-level edit permission
  IF NOT public.has_system_permission(_user_id, _project_id, _system_id, 'edit') THEN
    RETURN false;
  END IF;

  SELECT user_type, subcontractor_name, subsub_name
  INTO _user_type, _profile_sub, _profile_subsub
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1;

  -- hdec/pm_pd/admin user types: system permission is enough
  IF _user_type IN ('hdec', 'pm_pd', 'admin') THEN
    RETURN true;
  END IF;

  -- subcontractor: must also match PIC
  IF _user_type = 'subcontractor' THEN
    IF _profile_subsub IS NOT NULL AND _profile_subsub <> '' THEN
      RETURN lower(trim(_subsub_name)) = lower(trim(_profile_subsub));
    END IF;
    IF _profile_sub IS NOT NULL AND _profile_sub <> '' THEN
      RETURN lower(trim(_subcontractor_name)) = lower(trim(_profile_sub));
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Replace UPDATE policy
DROP POLICY IF EXISTS "Users can update permitted subtests" ON public.subtests;

CREATE POLICY "Users can update permitted subtests"
ON public.subtests FOR UPDATE TO authenticated
USING (
  public.can_edit_subtest(auth.uid(), project_id, system_id, subcontractor_name, subsub_name)
);

-- Replace DELETE policy: admin/superuser + senior_user with system permission
DROP POLICY IF EXISTS "Admins can delete subtests" ON public.subtests;

CREATE POLICY "Authorized can delete subtests"
ON public.subtests FOR DELETE TO authenticated
USING (
  public.is_admin_or_superuser(auth.uid())
  OR (
    public.has_any_role(auth.uid(), ARRAY['senior_user']::public.app_role[])
    AND public.has_system_permission(auth.uid(), project_id, system_id, 'edit')
  )
);
