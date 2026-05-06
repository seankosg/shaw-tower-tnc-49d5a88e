CREATE OR REPLACE FUNCTION public.sync_defect_closure_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.actual_closure_date IS NOT NULL THEN
    NEW.closure_status := 'Done';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_defect_closure_status ON public.defect_items;

CREATE TRIGGER trg_sync_defect_closure_status
BEFORE INSERT OR UPDATE OF actual_closure_date, closure_status ON public.defect_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_defect_closure_status();