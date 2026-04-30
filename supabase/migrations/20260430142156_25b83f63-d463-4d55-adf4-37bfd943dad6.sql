-- 1) Auto-fill trigger function
CREATE OR REPLACE FUNCTION public.fn_defect_autofill_planned_closure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.planned_closure_date IS NULL AND NEW.planned_completion_date IS NOT NULL THEN
    NEW.planned_closure_date := public.add_business_days_no_sun(NEW.planned_completion_date, 4);
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Attach BEFORE trigger
DROP TRIGGER IF EXISTS trg_defect_autofill_planned_closure ON public.defect_items;
CREATE TRIGGER trg_defect_autofill_planned_closure
BEFORE INSERT OR UPDATE OF planned_completion_date, planned_closure_date
ON public.defect_items
FOR EACH ROW
EXECUTE FUNCTION public.fn_defect_autofill_planned_closure();

-- 3) Backfill via SECURITY DEFINER function that disables row triggers temporarily
CREATE OR REPLACE FUNCTION public._backfill_defect_planned_closure()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count int;
BEGIN
  ALTER TABLE public.defect_items DISABLE TRIGGER USER;
  -- Re-enable our autofill trigger so backfill uses it (optional; we set value explicitly anyway)
  WITH upd AS (
    UPDATE public.defect_items
    SET planned_closure_date = public.add_business_days_no_sun(planned_completion_date, 4),
        updated_at = now(),
        row_version = row_version + 1
    WHERE is_active = true
      AND planned_closure_date IS NULL
      AND planned_completion_date IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM upd;
  ALTER TABLE public.defect_items ENABLE TRIGGER USER;
  RETURN _count;
END;
$$;

SELECT public._backfill_defect_planned_closure();

DROP FUNCTION public._backfill_defect_planned_closure();