
-- Projects: anon read
CREATE POLICY "Anon can read projects" ON public.projects FOR SELECT TO anon USING (true);

-- Subtests: anon read + insert + update
CREATE POLICY "Anon can read subtests" ON public.subtests FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert subtests" ON public.subtests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update subtests" ON public.subtests FOR UPDATE TO anon USING (true);

-- System master: anon read + insert
CREATE POLICY "Anon can read systems" ON public.system_master FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert systems" ON public.system_master FOR INSERT TO anon WITH CHECK (true);

-- System alias map: anon read
CREATE POLICY "Anon can read aliases" ON public.system_alias_map FOR SELECT TO anon USING (true);

-- Upload batches: anon read + insert + update
CREATE POLICY "Anon can read uploads" ON public.upload_batches FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert uploads" ON public.upload_batches FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can update uploads" ON public.upload_batches FOR UPDATE TO anon USING (true);

-- Upload row logs: anon read + insert
CREATE POLICY "Anon can read upload logs" ON public.upload_row_logs FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert upload logs" ON public.upload_row_logs FOR INSERT TO anon WITH CHECK (true);

-- Subtest change log: anon read + insert
CREATE POLICY "Anon can read change logs" ON public.subtest_change_log FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert change logs" ON public.subtest_change_log FOR INSERT TO anon WITH CHECK (true);
