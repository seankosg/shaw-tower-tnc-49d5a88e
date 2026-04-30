-- Field-level import log table (shared by T&C and Defect imports)
CREATE TABLE public.import_field_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('tnc','defect')),
  row_log_id uuid,
  raw_row_no integer,
  field_name text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN (
    'applied','unchanged','derived','auto_filled','corrected',
    'skipped_empty','skipped_clear_blocked','skipped_no_permission',
    'rejected_invalid','rejected_conflict','info'
  )),
  raw_value text,
  applied_value text,
  previous_value text,
  reason_code text,
  reason_detail text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_field_logs_upload ON public.import_field_logs(upload_id);
CREATE INDEX idx_import_field_logs_row ON public.import_field_logs(row_log_id);
CREATE INDEX idx_import_field_logs_upload_outcome ON public.import_field_logs(upload_id, outcome);
CREATE INDEX idx_import_field_logs_field ON public.import_field_logs(upload_id, field_name);

ALTER TABLE public.import_field_logs ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read
CREATE POLICY "Anyone can read import field logs"
ON public.import_field_logs
FOR SELECT
TO authenticated
USING (true);

-- Owner of the upload (T&C or Defect batch) or admin can insert
CREATE POLICY "Upload owners can insert import field logs"
ON public.import_field_logs
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin_or_superuser(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.upload_batches ub
    WHERE ub.id = import_field_logs.upload_id AND ub.uploaded_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.defect_upload_batches db
    WHERE db.id = import_field_logs.upload_id AND db.uploaded_by = auth.uid()
  )
);

-- Admin can delete (used by batch cleanup)
CREATE POLICY "Admins can delete import field logs"
ON public.import_field_logs
FOR DELETE
TO authenticated
USING (is_admin_or_superuser(auth.uid()));