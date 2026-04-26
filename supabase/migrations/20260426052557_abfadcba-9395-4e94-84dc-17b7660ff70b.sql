DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subtest_comments_subtest_id_fkey') THEN
    ALTER TABLE public.subtest_comments
      ADD CONSTRAINT subtest_comments_subtest_id_fkey
        FOREIGN KEY (subtest_id) REFERENCES public.subtests(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subtest_comments_parent_comment_id_fkey') THEN
    ALTER TABLE public.subtest_comments
      ADD CONSTRAINT subtest_comments_parent_comment_id_fkey
        FOREIGN KEY (parent_comment_id) REFERENCES public.subtest_comments(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subtest_comment_reads_subtest_id_fkey') THEN
    ALTER TABLE public.subtest_comment_reads
      ADD CONSTRAINT subtest_comment_reads_subtest_id_fkey
        FOREIGN KEY (subtest_id) REFERENCES public.subtests(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.subtest_comments
  ADD COLUMN IF NOT EXISTS recipients text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.defect_comments
  ADD COLUMN IF NOT EXISTS recipients text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_subtest_comments_recipients ON public.subtest_comments USING GIN (recipients);
CREATE INDEX IF NOT EXISTS idx_defect_comments_recipients ON public.defect_comments USING GIN (recipients);