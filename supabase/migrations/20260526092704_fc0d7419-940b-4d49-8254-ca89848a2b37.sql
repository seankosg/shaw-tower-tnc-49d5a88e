CREATE OR REPLACE FUNCTION public.punch_items_autoset_completion_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.actual_completion_date IS NOT NULL THEN
    NEW.completion_status := 'Done';
  ELSIF (TG_OP = 'UPDATE' AND OLD.actual_completion_date IS NOT NULL
         AND NEW.actual_completion_date IS NULL
         AND NEW.completion_status = 'Done') THEN
    NEW.completion_status := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS punch_items_autoset_completion_status ON public.punch_items;
CREATE TRIGGER punch_items_autoset_completion_status
BEFORE INSERT OR UPDATE OF actual_completion_date, completion_status
ON public.punch_items
FOR EACH ROW
EXECUTE FUNCTION public.punch_items_autoset_completion_status();

UPDATE public.punch_items
SET completion_status = 'Done'
WHERE actual_completion_date IS NOT NULL
  AND (completion_status IS NULL OR completion_status <> 'Done');