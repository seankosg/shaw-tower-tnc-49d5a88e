
-- 1) Backup run log table for visibility into auto/manual backup runs
CREATE TABLE IF NOT EXISTS public.backup_run_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_type TEXT NOT NULL,
  status TEXT NOT NULL,
  folder TEXT,
  message TEXT,
  total_rows BIGINT,
  total_tables INT,
  triggered_by UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

GRANT SELECT ON public.backup_run_log TO authenticated;
GRANT ALL ON public.backup_run_log TO service_role;

ALTER TABLE public.backup_run_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view backup run log" ON public.backup_run_log;
CREATE POLICY "Admins view backup run log"
ON public.backup_run_log
FOR SELECT
TO authenticated
USING (public.is_admin_or_superuser(auth.uid()));

CREATE INDEX IF NOT EXISTS backup_run_log_started_at_idx
  ON public.backup_run_log (started_at DESC);

-- 2) Schedule preference in app_settings (read by edge function + UI)
INSERT INTO public.app_settings (key, value)
VALUES ('backup_schedule', '{"enabled": true, "hour_sgt": 23, "minute": 50}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3) RPC for admins to enable/disable scheduled auto backups
CREATE OR REPLACE FUNCTION public.set_backup_enabled(_enabled BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_value JSONB;
BEGIN
  IF NOT public.is_admin_or_superuser(auth.uid()) THEN
    RAISE EXCEPTION 'Admin required';
  END IF;

  UPDATE public.app_settings
  SET value = jsonb_set(
        COALESCE(value, '{"hour_sgt":23,"minute":50}'::jsonb),
        '{enabled}',
        to_jsonb(_enabled)
      ),
      updated_at = now()
  WHERE key = 'backup_schedule'
  RETURNING value INTO _new_value;

  IF _new_value IS NULL THEN
    INSERT INTO public.app_settings (key, value)
    VALUES ('backup_schedule',
            jsonb_build_object('enabled', _enabled, 'hour_sgt', 23, 'minute', 50))
    RETURNING value INTO _new_value;
  END IF;

  RETURN _new_value;
END;
$$;

REVOKE ALL ON FUNCTION public.set_backup_enabled(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_backup_enabled(BOOLEAN) TO authenticated;

-- 4) RPC to fetch backup status snapshot for the UI in one round trip
CREATE OR REPLACE FUNCTION public.get_backup_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
             started_at, finished_at
      FROM public.backup_run_log
      WHERE status = 'success'
      ORDER BY started_at DESC
      LIMIT 1
    ) r;

  SELECT to_jsonb(r) INTO _last_run
    FROM (
      SELECT id, snapshot_type, status, folder, message, total_rows, total_tables,
             started_at, updated_at, finished_at
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
$$;

REVOKE ALL ON FUNCTION public.get_backup_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_backup_status() TO authenticated;
