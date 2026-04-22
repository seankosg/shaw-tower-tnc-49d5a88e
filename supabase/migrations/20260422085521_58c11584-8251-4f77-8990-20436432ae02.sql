CREATE TABLE public.schedule_change_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id UUID NOT NULL,
  subtest_id UUID NOT NULL,
  project_id UUID NOT NULL,
  system_id UUID NOT NULL,
  item_no TEXT NOT NULL,
  mos_code TEXT NOT NULL,
  subtest_code TEXT,
  raw_row_no INTEGER,
  pred_old_date DATE,
  pred_new_date DATE,
  pred_diff_days INTEGER,
  pred_prev_gap_days INTEGER,
  pred_cur_gap_days INTEGER,
  t1_old_date DATE,
  t1_new_date DATE,
  t1_diff_days INTEGER,
  t1_prev_gap_days INTEGER,
  t1_cur_gap_days INTEGER,
  t2_old_date DATE,
  t2_new_date DATE,
  t2_diff_days INTEGER,
  t2_prev_gap_days INTEGER,
  t2_cur_gap_days INTEGER,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_change_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read schedule change audit"
ON public.schedule_change_audit
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Import owners can insert schedule change audit"
ON public.schedule_change_audit
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    EXISTS (
      SELECT 1
      FROM public.upload_batches ub
      WHERE ub.id = schedule_change_audit.upload_id
        AND ub.uploaded_by = auth.uid()
    )
    OR public.is_admin_or_superuser(auth.uid())
  )
);

CREATE POLICY "Admins can manage schedule change audit"
ON public.schedule_change_audit
FOR ALL
TO authenticated
USING (public.is_admin_or_superuser(auth.uid()))
WITH CHECK (public.is_admin_or_superuser(auth.uid()));

CREATE INDEX idx_schedule_change_audit_upload_id ON public.schedule_change_audit(upload_id);
CREATE INDEX idx_schedule_change_audit_subtest_id ON public.schedule_change_audit(subtest_id);
CREATE INDEX idx_schedule_change_audit_created_at ON public.schedule_change_audit(created_at DESC);
CREATE INDEX idx_schedule_change_audit_project_system ON public.schedule_change_audit(project_id, system_id);