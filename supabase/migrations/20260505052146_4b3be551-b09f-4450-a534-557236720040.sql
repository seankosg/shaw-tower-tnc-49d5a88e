CREATE OR REPLACE FUNCTION public.delete_docs_import_batch(_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_field_logs int := 0;
  v_row_logs int := 0;
  v_change_logs int := 0;
  v_drawings_unlinked int := 0;
  v_omm_unlinked int := 0;
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

  WITH u AS (UPDATE public.docs_omm SET source_upload_id = NULL WHERE source_upload_id = _batch_id RETURNING 1)
  SELECT count(*) INTO v_omm_unlinked FROM u;

  DELETE FROM public.docs_upload_batches WHERE id = _batch_id;

  RETURN jsonb_build_object(
    'field_logs_deleted', v_field_logs,
    'row_logs_deleted', v_row_logs,
    'change_logs_deleted', v_change_logs,
    'drawings_unlinked', v_drawings_unlinked,
    'omm_unlinked', v_omm_unlinked
  );
END;
$function$;