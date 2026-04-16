
-- Fix overly permissive INSERT policies
DROP POLICY "System can insert profiles" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated 
  WITH CHECK (user_id = auth.uid());

DROP POLICY "Users can insert uploads" ON public.upload_batches;
CREATE POLICY "Authenticated can insert uploads" ON public.upload_batches FOR INSERT TO authenticated 
  WITH CHECK (uploaded_by = auth.uid());

DROP POLICY "Users can insert upload logs" ON public.upload_row_logs;
CREATE POLICY "Authenticated can insert upload logs" ON public.upload_row_logs FOR INSERT TO authenticated 
  WITH CHECK (EXISTS (SELECT 1 FROM public.upload_batches ub WHERE ub.id = upload_id AND ub.uploaded_by = auth.uid()) OR public.is_admin_or_superuser(auth.uid()));

DROP POLICY "Users can insert change logs" ON public.subtest_change_log;
CREATE POLICY "Authenticated can insert change logs" ON public.subtest_change_log FOR INSERT TO authenticated 
  WITH CHECK (changed_by = auth.uid());
