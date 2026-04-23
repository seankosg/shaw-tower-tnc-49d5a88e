CREATE POLICY "Admins can delete defect upload logs"
ON public.defect_upload_row_logs
FOR DELETE
TO authenticated
USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can delete defect schedule audit"
ON public.defect_schedule_change_audit
FOR DELETE
TO authenticated
USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can delete defect daily snapshots"
ON public.defect_daily_snapshots
FOR DELETE
TO authenticated
USING (public.is_admin_or_superuser(auth.uid()));