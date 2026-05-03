-- Widen import_field_logs.kind to allow 'docs', and add RLS owner check for docs uploads
ALTER TABLE public.import_field_logs DROP CONSTRAINT IF EXISTS import_field_logs_kind_check;
ALTER TABLE public.import_field_logs ADD CONSTRAINT import_field_logs_kind_check
  CHECK (kind = ANY (ARRAY['tnc'::text, 'defect'::text, 'docs'::text]));

-- Replace insert policy to also allow docs upload owners
DROP POLICY IF EXISTS "Upload owners can insert import field logs" ON public.import_field_logs;
CREATE POLICY "Upload owners can insert import field logs"
ON public.import_field_logs
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin_or_superuser(auth.uid())
  OR EXISTS (SELECT 1 FROM public.upload_batches ub WHERE ub.id = import_field_logs.upload_id AND ub.uploaded_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.defect_upload_batches db WHERE db.id = import_field_logs.upload_id AND db.uploaded_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.docs_upload_batches dx WHERE dx.id = import_field_logs.upload_id AND dx.uploaded_by = auth.uid())
);

-- Delete a Docs import batch and its associated logs.
-- Note: This does NOT revert data changes in docs_drawings; it only removes
-- the batch metadata + row/field logs. Use this when a batch was a mistake
-- and you want to re-import cleanly. Drawings updated by the batch keep
-- their current values; only their source_upload_id is cleared.
CREATE OR REPLACE FUNCTION public.delete_docs_import_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_field_logs int := 0;
  v_row_logs int := 0;
  v_change_logs int := 0;
  v_drawings_unlinked int := 0;
BEGIN
  IF NOT is_admin_or_superuser(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: admin or superuser required';
  END IF;

  WITH d AS (DELETE FROM public.import_field_logs WHERE upload_id = _batch_id AND kind = 'docs' RETURNING 1)
  SELECT count(*) INTO v_field_logs FROM d;

  WITH d AS (DELETE FROM public.docs_change_log WHERE upload_id = _batch_id RETURNING 1)
  SELECT count(*) INTO v_change_logs FROM d;

  WITH d AS (DELETE FROM public.docs_upload_row_logs WHERE upload_id = _batch_id RETURNING 1)
  SELECT count(*) INTO v_row_logs FROM d;

  WITH u AS (UPDATE public.docs_drawings SET source_upload_id = NULL WHERE source_upload_id = _batch_id RETURNING 1)
  SELECT count(*) INTO v_drawings_unlinked FROM u;

  DELETE FROM public.docs_upload_batches WHERE id = _batch_id;

  RETURN jsonb_build_object(
    'field_logs_deleted', v_field_logs,
    'row_logs_deleted', v_row_logs,
    'change_logs_deleted', v_change_logs,
    'drawings_unlinked', v_drawings_unlinked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_docs_import_batch(uuid) TO authenticated;