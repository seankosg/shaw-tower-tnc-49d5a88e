CREATE POLICY "Admins can delete upload logs" ON public.upload_row_logs
  FOR DELETE TO authenticated USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can delete upload batches" ON public.upload_batches
  FOR DELETE TO authenticated USING (public.is_admin_or_superuser(auth.uid()));