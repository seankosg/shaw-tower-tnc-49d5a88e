CREATE TABLE public.restore_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid,
  pre_restore_backup_run_id uuid,
  pre_restore_snapshot_id uuid,
  triggered_by uuid,
  status text NOT NULL DEFAULT 'starting',
  message text,
  total_tables int,
  total_rows bigint,
  restored_tables jsonb,
  errors jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.restore_run_log TO authenticated;
GRANT ALL ON public.restore_run_log TO service_role;

ALTER TABLE public.restore_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/super can view restore log"
ON public.restore_run_log FOR SELECT
TO authenticated
USING (public.is_admin_or_superuser(auth.uid()));

CREATE INDEX idx_restore_run_log_started_at ON public.restore_run_log (started_at DESC);