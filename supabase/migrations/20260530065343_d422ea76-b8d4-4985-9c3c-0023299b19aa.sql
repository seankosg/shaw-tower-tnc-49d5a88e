
CREATE OR REPLACE FUNCTION public.get_backup_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _schedule JSONB;
  _last_success JSONB;
  _last_run JSONB;
BEGIN
  IF NOT public.is_admin_or_superuser(auth.uid()) THEN
    RAISE EXCEPTION 'Admin required';
  END IF;

  SELECT value INTO _schedule
    FROM public.app_settings WHERE key = 'backup_schedule';

  SELECT to_jsonb(r) INTO _last_success
    FROM (
      SELECT id, snapshot_type, status, folder, message, total_rows, total_tables,
             started_at, finished_at,
             auth_users_backed_up, storage_objects_backed_up, storage_bytes_backed_up,
             integrity_report
      FROM public.backup_run_log
      WHERE status IN ('success','success_with_warnings')
      ORDER BY started_at DESC
      LIMIT 1
    ) r;

  SELECT to_jsonb(r) INTO _last_run
    FROM (
      SELECT id, snapshot_type, status, folder, message, total_rows, total_tables,
             started_at, updated_at, finished_at,
             auth_users_backed_up, storage_objects_backed_up, storage_bytes_backed_up,
             integrity_report
      FROM public.backup_run_log
      ORDER BY started_at DESC
      LIMIT 1
    ) r;

  RETURN jsonb_build_object(
    'schedule', COALESCE(_schedule, '{"enabled":true,"hour_sgt":23,"minute":50}'::jsonb),
    'last_success', _last_success,
    'last_run', _last_run
  );
END;
$function$;
