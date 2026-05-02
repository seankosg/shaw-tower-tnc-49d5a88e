-- Drop the global unique constraint on subtest_id (root cause of import 23505 errors)
ALTER TABLE public.subtests DROP CONSTRAINT IF EXISTS subtests_subtest_id_key;

-- Replace with a project-scoped partial unique index (active rows only)
CREATE UNIQUE INDEX IF NOT EXISTS subtests_project_subtest_id_active_key
  ON public.subtests (project_id, subtest_id)
  WHERE is_active = true;