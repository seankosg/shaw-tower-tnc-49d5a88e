-- 1) 더 이상 필요 없는 RPC / 헬퍼 제거
DROP FUNCTION IF EXISTS public.set_allow_actual_today(boolean);
DROP FUNCTION IF EXISTS public._actual_date_ceiling(date);

-- 2) Defect 트리거: MAX(Data Date, SGT 오늘) 까지 허용
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
  ceiling_date := GREATEST(latest_data_date, ((now() AT TIME ZONE 'Asia/Singapore'))::date);

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

-- 3) Subtest 트리거: MAX(Data Date, SGT 오늘) 까지 허용
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
  ceiling_date := GREATEST(latest_data_date, ((now() AT TIME ZONE 'Asia/Singapore'))::date);

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