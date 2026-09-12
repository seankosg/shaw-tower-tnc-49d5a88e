CREATE OR REPLACE FUNCTION public.purge_old_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d_import int;
  d_defect int;
  d_event int;
BEGIN
  WITH d AS (
    DELETE FROM public.import_field_logs WHERE created_at < now() - interval '60 days'
    RETURNING 1
  )
  SELECT count(*) INTO d_import FROM d;

  WITH d AS (
    DELETE FROM public.defect_upload_row_logs WHERE processed_at < now() - interval '60 days'
    RETURNING 1
  )
  SELECT count(*) INTO d_defect FROM d;

  WITH d AS (
    DELETE FROM public.event_log WHERE occurred_at < now() - interval '60 days'
    RETURNING 1
  )
  SELECT count(*) INTO d_event FROM d;

  RETURN jsonb_build_object(
    'import_field_logs', d_import,
    'defect_upload_row_logs', d_defect,
    'event_log', d_event
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_old_event_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  result := public.purge_old_logs();
  RETURN COALESCE((result->>'event_log')::int, 0);
END;
$function$;