-- Allow UI flows to opt-in to "today (SGT)" tolerance for actual_date triggers.
-- The flag is a request-local GUC `app.allow_actual_today`, set via the
-- set_allow_actual_today() RPC right before the UPDATE statement.

CREATE OR REPLACE FUNCTION public.set_allow_actual_today(_allow boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- is_local = true → scoped to current transaction / statement batch only
  PERFORM set_config('app.allow_actual_today', CASE WHEN _allow THEN 'on' ELSE 'off' END, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_allow_actual_today(boolean) TO authenticated;

-- Helper: returns the effective ceiling date for actual_* validation.
-- = MAX(data_date, SGT today) when flag is on, else data_date.
CREATE OR REPLACE FUNCTION public._actual_date_ceiling(_data_date date)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  _allow text;
  _today_sgt date;
BEGIN
  IF _data_date IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    _allow := current_setting('app.allow_actual_today', true);
  EXCEPTION WHEN others THEN
    _allow := NULL;
  END;
  IF _allow IS DISTINCT FROM 'on' THEN
    RETURN _data_date;
  END IF;
  _today_sgt := ((now() AT TIME ZONE 'Asia/Singapore'))::date;
  RETURN GREATEST(_data_date, _today_sgt);
END;
$$;

-- Update defect trigger to use the ceiling helper
CREATE OR REPLACE FUNCTION public.enforce_actual_date_not_after_data_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  latest_data_date date;
  ceiling_date date;
BEGIN
  SELECT MAX(data_date) INTO latest_data_date FROM public.defect_upload_batches;
  IF latest_data_date IS NULL THEN
    RETURN NEW;
  END IF;
  ceiling_date := public._actual_date_ceiling(latest_data_date);

  IF NEW.actual_start_date IS NOT NULL AND NEW.actual_start_date > ceiling_date THEN
    RAISE EXCEPTION 'actual_start_date (%) cannot be later than %', NEW.actual_start_date, ceiling_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.actual_completion_date IS NOT NULL AND NEW.actual_completion_date > ceiling_date THEN
    RAISE EXCEPTION 'actual_completion_date (%) cannot be later than %', NEW.actual_completion_date, ceiling_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.actual_closure_date IS NOT NULL AND NEW.actual_closure_date > ceiling_date THEN
    RAISE EXCEPTION 'actual_closure_date (%) cannot be later than %', NEW.actual_closure_date, ceiling_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Update subtest trigger to use the ceiling helper
CREATE OR REPLACE FUNCTION public.enforce_subtest_actual_date_not_after_data_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  latest_data_date date;
  ceiling_date date;
BEGIN
  SELECT MAX(data_date) INTO latest_data_date FROM public.upload_batches;
  IF latest_data_date IS NULL THEN
    RETURN NEW;
  END IF;
  ceiling_date := public._actual_date_ceiling(latest_data_date);

  IF NEW.t1_actual_date IS NOT NULL AND NEW.t1_actual_date > ceiling_date THEN
    RAISE EXCEPTION 't1_actual_date (%) cannot be later than %', NEW.t1_actual_date, ceiling_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.t2_actual_date IS NOT NULL AND NEW.t2_actual_date > ceiling_date THEN
    RAISE EXCEPTION 't2_actual_date (%) cannot be later than %', NEW.t2_actual_date, ceiling_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.pred_actual_date IS NOT NULL AND NEW.pred_actual_date > ceiling_date THEN
    RAISE EXCEPTION 'pred_actual_date (%) cannot be later than %', NEW.pred_actual_date, ceiling_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.r1_actual_submission_date IS NOT NULL AND NEW.r1_actual_submission_date > ceiling_date THEN
    RAISE EXCEPTION 'r1_actual_submission_date (%) cannot be later than %', NEW.r1_actual_submission_date, ceiling_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.r2_actual_submission_date IS NOT NULL AND NEW.r2_actual_submission_date > ceiling_date THEN
    RAISE EXCEPTION 'r2_actual_submission_date (%) cannot be later than %', NEW.r2_actual_submission_date, ceiling_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.r2_actual_approval_date IS NOT NULL AND NEW.r2_actual_approval_date > ceiling_date THEN
    RAISE EXCEPTION 'r2_actual_approval_date (%) cannot be later than %', NEW.r2_actual_approval_date, ceiling_date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;