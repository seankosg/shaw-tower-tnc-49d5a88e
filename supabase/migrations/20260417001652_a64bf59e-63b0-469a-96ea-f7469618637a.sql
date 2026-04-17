CREATE POLICY "DEV anon can delete upload batches"
  ON public.upload_batches FOR DELETE TO anon USING (true);

CREATE POLICY "DEV anon can delete upload row logs"
  ON public.upload_row_logs FOR DELETE TO anon USING (true);

CREATE POLICY "DEV anon can delete subtests"
  ON public.subtests FOR DELETE TO anon USING (true);