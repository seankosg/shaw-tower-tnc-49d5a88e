CREATE OR REPLACE FUNCTION public.delete_defect_import_batch(_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _batch_id IS NULL THEN
    RAISE EXCEPTION 'Batch id is required';
  END IF;

  IF NOT public.is_admin_or_superuser(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to delete this import batch.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.defect_upload_batches WHERE id = _batch_id
  ) THEN
    RAISE EXCEPTION 'Import batch not found.';
  END IF;

  DELETE FROM public.defect_daily_snapshots
  WHERE defect_id IN (
    SELECT id FROM public.defect_items WHERE source_upload_id = _batch_id
  );

  DELETE FROM public.defect_schedule_change_audit WHERE upload_id = _batch_id;
  DELETE FROM public.import_field_logs WHERE upload_id = _batch_id AND kind = 'defect';
  DELETE FROM public.defect_upload_row_logs WHERE upload_id = _batch_id;
  DELETE FROM public.defect_items WHERE source_upload_id = _batch_id;
  DELETE FROM public.defect_upload_batches WHERE id = _batch_id;
END;
$$;