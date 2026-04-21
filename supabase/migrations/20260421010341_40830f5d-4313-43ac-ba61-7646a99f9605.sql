
-- DROP 17 anon policies
DROP POLICY IF EXISTS "Anon can read projects" ON public.projects;
DROP POLICY IF EXISTS "Anon can insert change logs" ON public.subtest_change_log;
DROP POLICY IF EXISTS "Anon can read change logs" ON public.subtest_change_log;
DROP POLICY IF EXISTS "Anon can insert subtests" ON public.subtests;
DROP POLICY IF EXISTS "Anon can read subtests" ON public.subtests;
DROP POLICY IF EXISTS "Anon can update subtests" ON public.subtests;
DROP POLICY IF EXISTS "DEV anon can delete subtests" ON public.subtests;
DROP POLICY IF EXISTS "Anon can read aliases" ON public.system_alias_map;
DROP POLICY IF EXISTS "Anon can insert systems" ON public.system_master;
DROP POLICY IF EXISTS "Anon can read systems" ON public.system_master;
DROP POLICY IF EXISTS "Anon can insert uploads" ON public.upload_batches;
DROP POLICY IF EXISTS "Anon can read uploads" ON public.upload_batches;
DROP POLICY IF EXISTS "Anon can update uploads" ON public.upload_batches;
DROP POLICY IF EXISTS "DEV anon can delete upload batches" ON public.upload_batches;
DROP POLICY IF EXISTS "Anon can insert upload logs" ON public.upload_row_logs;
DROP POLICY IF EXISTS "Anon can read upload logs" ON public.upload_row_logs;
DROP POLICY IF EXISTS "DEV anon can delete upload row logs" ON public.upload_row_logs;

-- ADD authenticated policies for import pipeline
CREATE POLICY "Authenticated can insert systems"
ON public.system_master FOR INSERT TO authenticated
WITH CHECK (is_admin_or_superuser(auth.uid()));

CREATE POLICY "Authenticated can insert subcontractors"
ON public.subcontractor_master FOR INSERT TO authenticated
WITH CHECK (is_admin_or_superuser(auth.uid()));

CREATE POLICY "Authenticated can insert hdec pics"
ON public.hdec_pic_master FOR INSERT TO authenticated
WITH CHECK (is_admin_or_superuser(auth.uid()));

CREATE POLICY "Authenticated can update own uploads"
ON public.upload_batches FOR UPDATE TO authenticated
USING (uploaded_by = auth.uid() OR is_admin_or_superuser(auth.uid()));
