-- Enforce: actual_*_date must not be later than the latest data_date in defect_upload_batches.
-- This is a system-wide guard so every write path (UI, import, bulk edit, SQL) is consistent.

CREATE OR REPLACE FUNCTION public.enforce_actual_date_not_after_data_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest_data_date date;
BEGIN
  SELECT MAX(data_date) INTO latest_data_date FROM public.defect_upload_batches;

  -- If no batches yet, allow writes (nothing to compare against).
  IF latest_data_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.actual_start_date IS NOT NULL AND NEW.actual_start_date > latest_data_date THEN
    RAISE EXCEPTION 'actual_start_date (%) cannot be later than Data Date (%)', NEW.actual_start_date, latest_data_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.actual_completion_date IS NOT NULL AND NEW.actual_completion_date > latest_data_date THEN
    RAISE EXCEPTION 'actual_completion_date (%) cannot be later than Data Date (%)', NEW.actual_completion_date, latest_data_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.actual_closure_date IS NOT NULL AND NEW.actual_closure_date > latest_data_date THEN
    RAISE EXCEPTION 'actual_closure_date (%) cannot be later than Data Date (%)', NEW.actual_closure_date, latest_data_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_actual_date_not_after_data_date ON public.defect_items;

CREATE TRIGGER trg_enforce_actual_date_not_after_data_date
BEFORE INSERT OR UPDATE OF actual_start_date, actual_completion_date, actual_closure_date
ON public.defect_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_actual_date_not_after_data_date();