
-- ============ OMM comment modify helper ============
CREATE OR REPLACE FUNCTION public.can_modify_omm_comment(_user_id uuid, _comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c record;
  r_team public.team_type;
  prof_team public.team_type;
BEGIN
  IF _user_id IS NULL OR _comment_id IS NULL THEN RETURN false; END IF;

  SELECT omm_id, author_user_id INTO c
  FROM public.omm_comments WHERE id = _comment_id LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;

  IF c.author_user_id = _user_id THEN RETURN true; END IF;
  IF public.is_admin_or_superuser(_user_id) THEN RETURN true; END IF;

  IF public.has_role(_user_id, 'd_superuser'::public.app_role)
     OR public.has_role(_user_id, 'senior_user'::public.app_role) THEN
    SELECT team INTO r_team FROM public.docs_omm WHERE id = c.omm_id LIMIT 1;
    SELECT team INTO prof_team FROM public.profiles WHERE user_id = _user_id LIMIT 1;
    IF r_team IS NOT NULL AND prof_team IS NOT NULL AND r_team = prof_team THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- ============ Warranty comment modify helper ============
-- warranty_items.team is text (not team_type), so we compare as text.
CREATE OR REPLACE FUNCTION public.can_modify_warranty_comment(_user_id uuid, _comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c record;
  r_team text;
  prof_team text;
BEGIN
  IF _user_id IS NULL OR _comment_id IS NULL THEN RETURN false; END IF;

  SELECT warranty_item_id, author_user_id INTO c
  FROM public.warranty_comments WHERE id = _comment_id LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;

  IF c.author_user_id = _user_id THEN RETURN true; END IF;
  IF public.is_admin_or_superuser(_user_id) THEN RETURN true; END IF;

  IF public.has_role(_user_id, 'd_superuser'::public.app_role)
     OR public.has_role(_user_id, 'senior_user'::public.app_role) THEN
    SELECT team INTO r_team FROM public.warranty_items WHERE id = c.warranty_item_id LIMIT 1;
    SELECT team::text INTO prof_team FROM public.profiles WHERE user_id = _user_id LIMIT 1;
    IF r_team IS NOT NULL AND prof_team IS NOT NULL AND r_team = prof_team THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- ============ Replace OMM comment update/delete policies ============
DROP POLICY IF EXISTS "Authors or admins can update omm comments" ON public.omm_comments;
DROP POLICY IF EXISTS "Authors or admins can delete omm comments" ON public.omm_comments;

CREATE POLICY "Authorized can update omm comments"
ON public.omm_comments FOR UPDATE TO authenticated
USING (public.can_modify_omm_comment(auth.uid(), id))
WITH CHECK (public.can_modify_omm_comment(auth.uid(), id));

CREATE POLICY "Authorized can delete omm comments"
ON public.omm_comments FOR DELETE TO authenticated
USING (public.can_modify_omm_comment(auth.uid(), id));

-- ============ Replace Warranty comment update/delete policies ============
DROP POLICY IF EXISTS "Authors or admins can update warranty comments" ON public.warranty_comments;
DROP POLICY IF EXISTS "Authors or admins can delete warranty comments" ON public.warranty_comments;

CREATE POLICY "Authorized can update warranty comments"
ON public.warranty_comments FOR UPDATE TO authenticated
USING (public.can_modify_warranty_comment(auth.uid(), id))
WITH CHECK (public.can_modify_warranty_comment(auth.uid(), id));

CREATE POLICY "Authorized can delete warranty comments"
ON public.warranty_comments FOR DELETE TO authenticated
USING (public.can_modify_warranty_comment(auth.uid(), id));

-- ============ omm_comment_reads ============
CREATE TABLE IF NOT EXISTS public.omm_comment_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  omm_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, omm_id)
);
ALTER TABLE public.omm_comment_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own omm comment reads"
ON public.omm_comment_reads FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own omm comment reads"
ON public.omm_comment_reads FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own omm comment reads"
ON public.omm_comment_reads FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============ warranty_comment_reads ============
CREATE TABLE IF NOT EXISTS public.warranty_comment_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  warranty_item_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, warranty_item_id)
);
ALTER TABLE public.warranty_comment_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own warranty comment reads"
ON public.warranty_comment_reads FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own warranty comment reads"
ON public.warranty_comment_reads FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own warranty comment reads"
ON public.warranty_comment_reads FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
