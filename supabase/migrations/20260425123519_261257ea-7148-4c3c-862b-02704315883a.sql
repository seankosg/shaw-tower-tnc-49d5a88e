-- Subtest comments + reads tables (mirror of defect_comments)

CREATE TABLE public.subtest_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subtest_id uuid NOT NULL,
  parent_comment_id uuid,
  author_user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'comment',
  message text NOT NULL,
  edited boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subtest_comments_type_check CHECK (type IN ('comment','instruction','reply'))
);

CREATE INDEX idx_subtest_comments_subtest_id ON public.subtest_comments(subtest_id);
CREATE INDEX idx_subtest_comments_parent ON public.subtest_comments(parent_comment_id);
CREATE INDEX idx_subtest_comments_created_at ON public.subtest_comments(created_at);

ALTER TABLE public.subtest_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.subtest_comment_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  subtest_id uuid NOT NULL,
  last_read_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subtest_comment_reads_uniq UNIQUE (user_id, subtest_id)
);

CREATE INDEX idx_subtest_comment_reads_user ON public.subtest_comment_reads(user_id);
CREATE INDEX idx_subtest_comment_reads_subtest ON public.subtest_comment_reads(subtest_id);

ALTER TABLE public.subtest_comment_reads ENABLE ROW LEVEL SECURITY;

-- Permission helper (security definer)
CREATE OR REPLACE FUNCTION public.can_modify_subtest_comment(_user_id uuid, _comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  IF public.has_role(_user_id, 'senior_user'::public.app_role) THEN
    SELECT team INTO s_team FROM public.subtests WHERE id = c.subtest_id LIMIT 1;
    SELECT team INTO prof_team FROM public.profiles WHERE user_id = _user_id LIMIT 1;
    IF s_team IS NOT NULL AND prof_team IS NOT NULL AND s_team = prof_team THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- Touch trigger for updated_at + edited flag
CREATE OR REPLACE FUNCTION public.fn_subtest_comments_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND NEW.message IS DISTINCT FROM OLD.message THEN
    NEW.edited = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subtest_comments_touch
BEFORE UPDATE ON public.subtest_comments
FOR EACH ROW
EXECUTE FUNCTION public.fn_subtest_comments_touch();

-- RLS: subtest_comments
CREATE POLICY "Anyone can read subtest comments"
ON public.subtest_comments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert own subtest comments"
ON public.subtest_comments FOR INSERT
TO authenticated
WITH CHECK (author_user_id = auth.uid());

CREATE POLICY "Authorized can update subtest comments"
ON public.subtest_comments FOR UPDATE
TO authenticated
USING (public.can_modify_subtest_comment(auth.uid(), id))
WITH CHECK (public.can_modify_subtest_comment(auth.uid(), id));

CREATE POLICY "Authorized can delete subtest comments"
ON public.subtest_comments FOR DELETE
TO authenticated
USING (public.can_modify_subtest_comment(auth.uid(), id));

-- RLS: subtest_comment_reads
CREATE POLICY "Users can read own subtest comment reads"
ON public.subtest_comment_reads FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own subtest comment reads"
ON public.subtest_comment_reads FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own subtest comment reads"
ON public.subtest_comment_reads FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- RPC: summary for visible rows
CREATE OR REPLACE FUNCTION public.get_subtest_comment_summary(_subtest_ids uuid[])
RETURNS TABLE(subtest_id uuid, comment_count integer, last_comment_at timestamp with time zone, has_unread boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH c AS (
    SELECT sc.subtest_id,
           COUNT(*)::int AS cnt,
           MAX(sc.created_at) AS last_at
    FROM public.subtest_comments sc
    WHERE sc.subtest_id = ANY(_subtest_ids)
    GROUP BY sc.subtest_id
  ),
  r AS (
    SELECT scr.subtest_id, scr.last_read_at
    FROM public.subtest_comment_reads scr
    WHERE scr.user_id = auth.uid()
      AND scr.subtest_id = ANY(_subtest_ids)
  )
  SELECT c.subtest_id,
         c.cnt AS comment_count,
         c.last_at AS last_comment_at,
         (r.last_read_at IS NULL OR c.last_at > r.last_read_at) AS has_unread
  FROM c
  LEFT JOIN r USING (subtest_id);
$$;

-- Realtime
ALTER TABLE public.subtest_comments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subtest_comments;