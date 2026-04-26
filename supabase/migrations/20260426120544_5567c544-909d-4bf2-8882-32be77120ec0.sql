-- Auto-normalize R1/R2 status when actual dates are present but status is NULL.
-- Existing status values are never overwritten.

CREATE OR REPLACE FUNCTION public.normalize_report_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- R1: actual submission date present but status NULL → 'Submitted'
  IF NEW.r1_actual_submission_date IS NOT NULL AND NEW.r1_status IS NULL THEN
    NEW.r1_status := 'Submitted'::public.report_status;
  END IF;

  -- R2: approval date wins over submission date; never overwrite existing status
  IF NEW.r2_status IS NULL THEN
    IF NEW.r2_actual_approval_date IS NOT NULL THEN
      NEW.r2_status := 'Approved'::public.report_status;
    ELSIF NEW.r2_actual_submission_date IS NOT NULL THEN
      NEW.r2_status := 'Submitted'::public.report_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_report_status ON public.subtests;

CREATE TRIGGER trg_normalize_report_status
BEFORE INSERT OR UPDATE OF
  r1_status, r1_actual_submission_date,
  r2_status, r2_actual_submission_date, r2_actual_approval_date
ON public.subtests
FOR EACH ROW
EXECUTE FUNCTION public.normalize_report_status();

-- One-off backfill (safe: only fills NULL statuses)
UPDATE public.subtests
SET r1_status = 'Submitted'::public.report_status
WHERE r1_actual_submission_date IS NOT NULL
  AND r1_status IS NULL
  AND is_active = true;

UPDATE public.subtests
SET r2_status = 'Approved'::public.report_status
WHERE r2_actual_approval_date IS NOT NULL
  AND r2_status IS NULL
  AND is_active = true;

UPDATE public.subtests
SET r2_status = 'Submitted'::public.report_status
WHERE r2_actual_submission_date IS NOT NULL
  AND r2_actual_approval_date IS NULL
  AND r2_status IS NULL
  AND is_active = true;