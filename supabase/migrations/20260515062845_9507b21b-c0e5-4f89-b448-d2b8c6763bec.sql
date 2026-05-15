
-- Trigger function: auto-fill expected response date as actual + 7 days when expected is null
CREATE OR REPLACE FUNCTION public.docs_omm_auto_response_planned()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sub2_actual_date IS NOT NULL AND NEW.sub2_response_planned_date IS NULL THEN
    NEW.sub2_response_planned_date := NEW.sub2_actual_date + 7;
  END IF;
  IF NEW.sub3_actual_date IS NOT NULL AND NEW.sub3_response_planned_date IS NULL THEN
    NEW.sub3_response_planned_date := NEW.sub3_actual_date + 7;
  END IF;
  IF NEW.final_actual_date IS NOT NULL AND NEW.final_response_planned_date IS NULL THEN
    NEW.final_response_planned_date := NEW.final_actual_date + 7;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_docs_omm_auto_response_planned ON public.docs_omm;
CREATE TRIGGER trg_docs_omm_auto_response_planned
BEFORE INSERT OR UPDATE ON public.docs_omm
FOR EACH ROW
EXECUTE FUNCTION public.docs_omm_auto_response_planned();

-- One-time backfill for existing rows
UPDATE public.docs_omm
SET sub2_response_planned_date = sub2_actual_date + 7
WHERE sub2_actual_date IS NOT NULL AND sub2_response_planned_date IS NULL;

UPDATE public.docs_omm
SET sub3_response_planned_date = sub3_actual_date + 7
WHERE sub3_actual_date IS NOT NULL AND sub3_response_planned_date IS NULL;

UPDATE public.docs_omm
SET final_response_planned_date = final_actual_date + 7
WHERE final_actual_date IS NOT NULL AND final_response_planned_date IS NULL;
