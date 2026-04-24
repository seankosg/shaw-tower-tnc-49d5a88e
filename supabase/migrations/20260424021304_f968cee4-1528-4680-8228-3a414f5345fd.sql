
-- =========================================
-- 1. defect_items: drop old, add new
-- =========================================
ALTER TABLE public.defect_items
  DROP COLUMN IF EXISTS planned_date,
  DROP COLUMN IF EXISTS target_date,
  DROP COLUMN IF EXISTS closed_date,
  DROP COLUMN IF EXISTS actual_date,
  DROP COLUMN IF EXISTS closure_status;

ALTER TABLE public.defect_items
  ADD COLUMN planned_start_date date,
  ADD COLUMN planned_completion_date date,
  ADD COLUMN planned_closure_date date,
  ADD COLUMN actual_start_date date,
  ADD COLUMN actual_completion_date date,
  ADD COLUMN actual_closure_date date,
  ADD COLUMN planned_progress_pct numeric,
  ADD COLUMN completion_status text,
  ADD COLUMN closure_status text;

-- =========================================
-- 2. defect_daily_snapshots: drop old, add new
-- =========================================
ALTER TABLE public.defect_daily_snapshots
  DROP COLUMN IF EXISTS planned_date,
  DROP COLUMN IF EXISTS closed_date;

ALTER TABLE public.defect_daily_snapshots
  ADD COLUMN planned_completion_date date,
  ADD COLUMN actual_completion_date date,
  ADD COLUMN planned_closure_date date,
  ADD COLUMN actual_closure_date date,
  ADD COLUMN planned_progress_pct numeric,
  ADD COLUMN completion_status text;
-- closure_status, actual_progress_pct 는 기존에 이미 존재

-- =========================================
-- 3. defect_schedule_change_audit: drop old, add new
-- =========================================
ALTER TABLE public.defect_schedule_change_audit
  DROP COLUMN IF EXISTS planned_old_date,
  DROP COLUMN IF EXISTS planned_new_date,
  DROP COLUMN IF EXISTS planned_diff_days,
  DROP COLUMN IF EXISTS target_old_date,
  DROP COLUMN IF EXISTS target_new_date,
  DROP COLUMN IF EXISTS target_diff_days,
  DROP COLUMN IF EXISTS closed_old_date,
  DROP COLUMN IF EXISTS closed_new_date,
  DROP COLUMN IF EXISTS closed_diff_days;

ALTER TABLE public.defect_schedule_change_audit
  ADD COLUMN planned_start_old_date date,
  ADD COLUMN planned_start_new_date date,
  ADD COLUMN planned_start_diff_days integer,
  ADD COLUMN planned_completion_old_date date,
  ADD COLUMN planned_completion_new_date date,
  ADD COLUMN planned_completion_diff_days integer,
  ADD COLUMN planned_closure_old_date date,
  ADD COLUMN planned_closure_new_date date,
  ADD COLUMN planned_closure_diff_days integer,
  ADD COLUMN actual_start_old_date date,
  ADD COLUMN actual_start_new_date date,
  ADD COLUMN actual_start_diff_days integer,
  ADD COLUMN actual_completion_old_date date,
  ADD COLUMN actual_completion_new_date date,
  ADD COLUMN actual_completion_diff_days integer,
  ADD COLUMN actual_closure_old_date date,
  ADD COLUMN actual_closure_new_date date,
  ADD COLUMN actual_closure_diff_days integer,
  ADD COLUMN planned_progress_old_pct numeric,
  ADD COLUMN planned_progress_new_pct numeric,
  ADD COLUMN planned_progress_diff_pct numeric,
  ADD COLUMN completion_status_old text,
  ADD COLUMN completion_status_new text;
-- progress_old_pct/new_pct/diff_pct, closure_status_old/new 는 기존 유지

-- =========================================
-- 4. Helpful indexes for new date columns
-- =========================================
CREATE INDEX IF NOT EXISTS idx_defect_items_planned_completion ON public.defect_items(planned_completion_date);
CREATE INDEX IF NOT EXISTS idx_defect_items_planned_closure ON public.defect_items(planned_closure_date);
CREATE INDEX IF NOT EXISTS idx_defect_items_actual_completion ON public.defect_items(actual_completion_date);
CREATE INDEX IF NOT EXISTS idx_defect_items_actual_closure ON public.defect_items(actual_closure_date);
CREATE INDEX IF NOT EXISTS idx_defect_items_completion_status ON public.defect_items(completion_status);
CREATE INDEX IF NOT EXISTS idx_defect_items_closure_status ON public.defect_items(closure_status);
