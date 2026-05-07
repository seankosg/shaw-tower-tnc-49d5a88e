
CREATE TABLE public.spare_part_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spare_part_id uuid NOT NULL REFERENCES public.docs_spare_part(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  parent_comment_id uuid REFERENCES public.spare_part_comments(id) ON DELETE CASCADE,
  message text NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}'::text[],
  type text NOT NULL DEFAULT 'comment',
  edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_spare_part_comments_sp ON public.spare_part_comments(spare_part_id);

ALTER TABLE public.spare_part_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read spare part comments"
  ON public.spare_part_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert own spare part comments"
  ON public.spare_part_comments FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid());

CREATE POLICY "Authorized can update spare part comments"
  ON public.spare_part_comments FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid() OR is_admin_or_superuser(auth.uid()))
  WITH CHECK (author_user_id = auth.uid() OR is_admin_or_superuser(auth.uid()));

CREATE POLICY "Authorized can delete spare part comments"
  ON public.spare_part_comments FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR is_admin_or_superuser(auth.uid()));

CREATE TRIGGER trg_spare_part_comments_updated_at
  BEFORE UPDATE ON public.spare_part_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.spare_part_comment_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  spare_part_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, spare_part_id)
);

ALTER TABLE public.spare_part_comment_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own spare part comment reads"
  ON public.spare_part_comment_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own spare part comment reads"
  ON public.spare_part_comment_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own spare part comment reads"
  ON public.spare_part_comment_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
