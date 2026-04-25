-- =========================================================
-- 1) defect_comments
-- =========================================================
CREATE TABLE public.defect_comments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defect_id         uuid NOT NULL REFERENCES public.defect_items(id) ON DELETE CASCADE,
  parent_comment_id uuid NULL REFERENCES public.defect_comments(id) ON DELETE CASCADE,
  author_user_id    uuid NOT NULL,
  type              text NOT NULL DEFAULT 'comment',
  message           text NOT NULL,
  edited            boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT defect_comments_type_chk CHECK (type IN ('comment','instruction','reply')),
  CONSTRAINT defect_comments_message_chk CHECK (length(btrim(message)) > 0)
);

CREATE INDEX idx_defect_comments_defect_created
  ON public.defect_comments (defect_id, created_at DESC);
CREATE INDEX idx_defect_comments_parent
  ON public.defect_comments (parent_comment_id);
CREATE INDEX idx_defect_comments_author
  ON public.defect_comments (author_user_id);

ALTER TABLE public.defect_comments ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 2) defect_comment_reads (per-user last seen)
-- =========================================================
CREATE TABLE public.defect_comment_reads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  defect_id     uuid NOT NULL REFERENCES public.defect_items(id) ON DELETE CASCADE,
  last_read_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, defect_id)
);

CREATE INDEX idx_defect_comment_reads_user
  ON public.defect_comment_reads (user_id);

ALTER TABLE public.defect_comment_reads ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 3) helper function: can_modify_defect_comment
-- =========================================================
CREATE OR REPLACE FUNCTION public.can_modify_defect_comment(_user_id uuid, _comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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

  IF public.has_role(_user_id, 'senior_user'::public.app_role) THEN
    SELECT team INTO d_team FROM public.defect_items WHERE id = c.defect_id LIMIT 1;
    SELECT team INTO prof_team FROM public.profiles WHERE user_id = _user_id LIMIT 1;
    IF d_team IS NOT NULL AND prof_team IS NOT NULL AND d_team = prof_team THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- =========================================================
-- 4) RLS policies — defect_comments
-- =========================================================
CREATE POLICY "Anyone can read defect comments"
  ON public.defect_comments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert own defect comments"
  ON public.defect_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (author_user_id = auth.uid());

CREATE POLICY "Authorized can update defect comments"
  ON public.defect_comments
  FOR UPDATE
  TO authenticated
  USING (public.can_modify_defect_comment(auth.uid(), id))
  WITH CHECK (public.can_modify_defect_comment(auth.uid(), id));

CREATE POLICY "Authorized can delete defect comments"
  ON public.defect_comments
  FOR DELETE
  TO authenticated
  USING (public.can_modify_defect_comment(auth.uid(), id));

-- =========================================================
-- 5) RLS policies — defect_comment_reads
-- =========================================================
CREATE POLICY "Users can read own defect comment reads"
  ON public.defect_comment_reads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own defect comment reads"
  ON public.defect_comment_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own defect comment reads"
  ON public.defect_comment_reads
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================================
-- 6) trigger — updated_at + edited flag
-- =========================================================
CREATE OR REPLACE FUNCTION public.fn_defect_comments_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND NEW.message IS DISTINCT FROM OLD.message THEN
    NEW.edited = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_defect_comments_touch
BEFORE UPDATE ON public.defect_comments
FOR EACH ROW
EXECUTE FUNCTION public.fn_defect_comments_touch();

-- =========================================================
-- 7) Realtime publication
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.defect_comments;

-- =========================================================
-- 8) summary RPC for Row Data view
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_defect_comment_summary(_defect_ids uuid[])
RETURNS TABLE (
  defect_id uuid,
  comment_count integer,
  last_comment_at timestamptz,
  has_unread boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH c AS (
    SELECT dc.defect_id,
           COUNT(*)::int AS cnt,
           MAX(dc.created_at) AS last_at
    FROM public.defect_comments dc
    WHERE dc.defect_id = ANY(_defect_ids)
    GROUP BY dc.defect_id
  ),
  r AS (
    SELECT dcr.defect_id, dcr.last_read_at
    FROM public.defect_comment_reads dcr
    WHERE dcr.user_id = auth.uid()
      AND dcr.defect_id = ANY(_defect_ids)
  )
  SELECT c.defect_id,
         c.cnt AS comment_count,
         c.last_at AS last_comment_at,
         (r.last_read_at IS NULL OR c.last_at > r.last_read_at) AS has_unread
  FROM c
  LEFT JOIN r USING (defect_id);
$$;