CREATE OR REPLACE FUNCTION public.enforce_subtest_actual_date_not_after_data_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  latest_data_date date;
BEGIN
  SELECT MAX(data_date) INTO latest_data_date FROM public.upload_batches;

  IF latest_data_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.t1_actual_date IS NOT NULL AND NEW.t1_actual_date > latest_data_date THEN
    RAISE EXCEPTION 't1_actual_date (%) cannot be later than Data Date (%)', NEW.t1_actual_date, latest_data_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.t2_actual_date IS NOT NULL AND NEW.t2_actual_date > latest_data_date THEN
    RAISE EXCEPTION 't2_actual_date (%) cannot be later than Data Date (%)', NEW.t2_actual_date, latest_data_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.pred_actual_date IS NOT NULL AND NEW.pred_actual_date > latest_data_date THEN
    RAISE EXCEPTION 'pred_actual_date (%) cannot be later than Data Date (%)', NEW.pred_actual_date, latest_data_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.r1_actual_submission_date IS NOT NULL AND NEW.r1_actual_submission_date > latest_data_date THEN
    RAISE EXCEPTION 'r1_actual_submission_date (%) cannot be later than Data Date (%)', NEW.r1_actual_submission_date, latest_data_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.r2_actual_submission_date IS NOT NULL AND NEW.r2_actual_submission_date > latest_data_date THEN
    RAISE EXCEPTION 'r2_actual_submission_date (%) cannot be later than Data Date (%)', NEW.r2_actual_submission_date, latest_data_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.r2_actual_approval_date IS NOT NULL AND NEW.r2_actual_approval_date > latest_data_date THEN
    RAISE EXCEPTION 'r2_actual_approval_date (%) cannot be later than Data Date (%)', NEW.r2_actual_approval_date, latest_data_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_subtest_actual_date_not_after_data_date ON public.subtests;

CREATE TRIGGER trg_enforce_subtest_actual_date_not_after_data_date
BEFORE INSERT OR UPDATE ON public.subtests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_subtest_actual_date_not_after_data_date();