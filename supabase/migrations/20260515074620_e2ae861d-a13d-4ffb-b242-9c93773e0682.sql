CREATE TABLE public.punch_upload_row_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id uuid NOT NULL,
  raw_row_no integer,
  item_no text,
  action_taken public.action_taken,
  reason_code text,
  reason_detail text,
  processed_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_punch_upload_row_logs_upload ON public.punch_upload_row_logs(upload_id);
CREATE INDEX idx_punch_upload_row_logs_action ON public.punch_upload_row_logs(upload_id, action_taken);

ALTER TABLE public.punch_upload_row_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read punch upload logs"
ON public.punch_upload_row_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Upload owners can insert punch upload logs"
ON public.punch_upload_row_logs FOR INSERT TO authenticated
WITH CHECK (
  (EXISTS (SELECT 1 FROM punch_upload_batches b WHERE b.id = punch_upload_row_logs.upload_id AND b.uploaded_by = auth.uid()))
  OR is_admin_or_superuser(auth.uid())
);

CREATE POLICY "Admins can delete punch upload logs"
ON public.punch_upload_row_logs FOR DELETE TO authenticated
USING (is_admin_or_superuser(auth.uid()));