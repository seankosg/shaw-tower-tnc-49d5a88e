
-- One-time data migration runs as superuser; bypass user-permission trigger
ALTER TABLE public.subtests DISABLE TRIGGER USER;

UPDATE public.subtests
SET
  r1_target_submission_date = COALESCE(
    r1_target_submission_date,
    public.add_business_days_no_sun(t2_planned_date, 3)
  ),
  r2_target_submission_date = COALESCE(
    r2_target_submission_date,
    public.add_business_days_no_sun(public.add_business_days_no_sun(t2_planned_date, 3), 3)
  ),
  r2_target_approval_date = COALESCE(
    r2_target_approval_date,
    public.add_business_days_no_sun(
      public.add_business_days_no_sun(public.add_business_days_no_sun(t2_planned_date, 3), 3),
      5
    )
  ),
  r1_status = COALESCE(r1_status, 'Planned'::public.report_status),
  r2_status = COALESCE(r2_status, 'Planned'::public.report_status),
  updated_at = now()
WHERE is_active = true
  AND t2_planned_date IS NOT NULL;

ALTER TABLE public.subtests ENABLE TRIGGER USER;
