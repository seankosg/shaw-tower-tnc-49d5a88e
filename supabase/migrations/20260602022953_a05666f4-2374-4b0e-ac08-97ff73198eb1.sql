
-- 1) 알림 로그 테이블
CREATE TABLE IF NOT EXISTS public.backup_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_log_id uuid REFERENCES public.backup_run_log(id) ON DELETE SET NULL,
  level text NOT NULL CHECK (level IN ('info','success','warning','error')),
  title text NOT NULL,
  message text,
  webhook_status text,
  webhook_error text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_notifications TO authenticated;
GRANT ALL ON public.backup_notifications TO service_role;

ALTER TABLE public.backup_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view backup notifications"
ON public.backup_notifications FOR SELECT TO authenticated
USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins delete backup notifications"
ON public.backup_notifications FOR DELETE TO authenticated
USING (public.is_admin_or_superuser(auth.uid()));

CREATE INDEX IF NOT EXISTS backup_notifications_created_idx
  ON public.backup_notifications (created_at DESC);

-- 2) 기본 알림 설정값 (없을 때만)
INSERT INTO public.app_settings (key, value)
VALUES (
  'backup_notifications',
  jsonb_build_object(
    'on_success', true,
    'on_warning', true,
    'on_failure', true,
    'in_app', true,
    'webhook_url', null
  )
)
ON CONFLICT (key) DO NOTHING;

-- 3) 기존 backup_schedule 값에 frequency / weekday 키 보강 (없는 경우만)
UPDATE public.app_settings
SET value = value
  || jsonb_build_object(
       'frequency', COALESCE(value->>'frequency', 'daily'),
       'weekday',   COALESCE((value->>'weekday')::int, 1)
     ),
    updated_at = now()
WHERE key = 'backup_schedule';
