
-- Security definer function to check subtest visibility
CREATE OR REPLACE FUNCTION public.can_view_subtest(
  _user_id uuid,
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
  -- admins/superusers see everything
  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN true;
  END IF;

  SELECT user_type, subcontractor_name, subsub_name
  INTO _user_type, _profile_sub, _profile_subsub
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1;

  -- hdec, pm_pd, admin user types see everything
  IF _user_type IN ('hdec', 'pm_pd', 'admin') THEN
    RETURN true;
  END IF;

  -- subcontractor: match by subcontractor_name or subsub_name
  IF _user_type = 'subcontractor' THEN
    -- if user has subsub_name, match on subsub
    IF _profile_subsub IS NOT NULL AND _profile_subsub <> '' THEN
      RETURN lower(trim(_subsub_name)) = lower(trim(_profile_subsub));
    END IF;
    -- otherwise match on subcontractor_name
    IF _profile_sub IS NOT NULL AND _profile_sub <> '' THEN
      RETURN lower(trim(_subcontractor_name)) = lower(trim(_profile_sub));
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Replace the open SELECT policy with the restricted one
DROP POLICY IF EXISTS "Anyone can read subtests" ON public.subtests;

CREATE POLICY "Authenticated can read subtests"
ON public.subtests FOR SELECT TO authenticated
USING (
  public.can_view_subtest(auth.uid(), subcontractor_name, subsub_name)
);
