
-- 1. Create report_status enum
CREATE TYPE public.report_status AS ENUM
  ('Planned', 'Submitted', 'Under Review', 'Approved', 'Returned');

-- 2. Rename existing r1_status (text) to r1_report_ref to preserve 1,114 reference numbers
ALTER TABLE public.subtests RENAME COLUMN r1_status TO r1_report_ref;

-- 3. Drop empty r2_status (text) column
ALTER TABLE public.subtests DROP COLUMN r2_status;

-- 4. Add new R1/R2 columns
ALTER TABLE public.subtests
  ADD COLUMN r1_status public.report_status,
  ADD COLUMN r1_target_submission_date date,
  ADD COLUMN r1_actual_submission_date date,
  ADD COLUMN r2_status public.report_status,
  ADD COLUMN r2_target_submission_date date,
  ADD COLUMN r2_actual_submission_date date,
  ADD COLUMN r2_target_approval_date date,
  ADD COLUMN r2_actual_approval_date date;

-- 5. Business-day helper: add N days, skipping Sundays; if result lands on Sunday, push to Monday
CREATE OR REPLACE FUNCTION public.add_business_days_no_sun(_start date, _days int)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d date := _start;
  remaining int := _days;
BEGIN
  IF _start IS NULL THEN
    RETURN NULL;
  END IF;
  WHILE remaining > 0 LOOP
    d := d + 1;
    IF EXTRACT(DOW FROM d) <> 0 THEN
      remaining := remaining - 1;
    END IF;
  END LOOP;
  -- Safety: if final day is Sunday (only when _days=0 and _start is Saturday → result still Sunday is impossible from above loop; included for completeness)
  IF EXTRACT(DOW FROM d) = 0 THEN
    d := d + 1;
  END IF;
  RETURN d;
END;
$$;

-- 6. Register new fields in field_config
INSERT INTO public.field_config (field_name, display_name, is_enabled, is_required, sort_order)
VALUES
  ('r1_status', 'R1 Status', true, false, 250),
  ('r1_target_submission_date', 'R1 Target Submission Date', true, false, 260),
  ('r1_actual_submission_date', 'R1 Actual Submission Date', true, false, 270),
  ('r1_report_ref', 'R1 Aconex Ref', true, false, 280),
  ('r2_status', 'R2 Status', true, false, 290),
  ('r2_target_submission_date', 'R2 Target Submission Date', true, false, 300),
  ('r2_actual_submission_date', 'R2 Actual Submission Date', true, false, 310),
  ('r2_target_approval_date', 'R2 Target Approval Date', true, false, 320),
  ('r2_actual_approval_date', 'R2 Actual Approval Date', true, false, 330)
ON CONFLICT (field_name) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      sort_order = EXCLUDED.sort_order,
      is_enabled = EXCLUDED.is_enabled;

-- Update old r1_status row in field_config (if it exists with that name) — already renamed, but field_config row may still reference 'r1_status' as the ref column. Delete legacy row if its display_name is "R1 Status" and field_name is the new r1_report_ref; we already inserted r1_report_ref above. Clean up duplicate referencing old text column behavior:
-- (ON CONFLICT above handled re-mapping)
