-- 1. Add new predecessor normalized columns
ALTER TABLE public.subtests ADD COLUMN IF NOT EXISTS pred_status public.tc_status;
ALTER TABLE public.subtests ADD COLUMN IF NOT EXISTS pred_planned_date date;
ALTER TABLE public.subtests ADD COLUMN IF NOT EXISTS pred_actual_date date;

-- 2. Backfill: parse predecessor_status_raw
-- 2a. Date pattern (YYYY-MM-DD or YYYY/MM/DD) -> pred_planned_date + Planned status
UPDATE public.subtests
SET 
  pred_planned_date = CASE
    WHEN predecessor_status_raw ~ '^\d{4}-\d{1,2}-\d{1,2}$' THEN predecessor_status_raw::date
    WHEN predecessor_status_raw ~ '^\d{4}/\d{1,2}/\d{1,2}$' THEN to_date(predecessor_status_raw, 'YYYY/MM/DD')
    ELSE NULL
  END,
  pred_status = 'Planned'::public.tc_status
WHERE is_active = true
  AND pred_status IS NULL
  AND pred_planned_date IS NULL
  AND predecessor_status_raw IS NOT NULL
  AND (
    predecessor_status_raw ~ '^\d{4}-\d{1,2}-\d{1,2}$'
    OR predecessor_status_raw ~ '^\d{4}/\d{1,2}/\d{1,2}$'
  );

-- 2b. 'done' / '완료' keyword -> Done status with actual date
UPDATE public.subtests
SET
  pred_status = 'Done'::public.tc_status,
  pred_actual_date = COALESCE(
    (t1_actual_date - INTERVAL '1 day')::date,
    (t1_planned_date - INTERVAL '1 day')::date,
    updated_at::date,
    '2026-04-19'::date
  )
WHERE is_active = true
  AND pred_status IS NULL
  AND predecessor_status_raw IS NOT NULL
  AND (
    LOWER(predecessor_status_raw) LIKE '%done%'
    OR LOWER(predecessor_status_raw) LIKE '%complete%'
    OR LOWER(predecessor_status_raw) LIKE '%finished%'
    OR predecessor_status_raw LIKE '%완료%'
  );

-- 3. T1/T2 cutoff-after backfill: Done with NULL actual_date -> use planned_date
UPDATE public.subtests
SET t1_actual_date = t1_planned_date
WHERE is_active = true
  AND t1_status = 'Done'
  AND t1_actual_date IS NULL
  AND t1_planned_date IS NOT NULL;

UPDATE public.subtests
SET t2_actual_date = t2_planned_date
WHERE is_active = true
  AND t2_status = 'Done'
  AND t2_actual_date IS NULL
  AND t2_planned_date IS NOT NULL;

-- 4. Change log entries (bulk)
INSERT INTO public.subtest_change_log (subtest_id, changed_field, old_value, new_value, change_source)
SELECT id, 'pred_status (backfill)', NULL, pred_status::text, 'excel_import'::public.change_source
FROM public.subtests
WHERE pred_status IS NOT NULL;