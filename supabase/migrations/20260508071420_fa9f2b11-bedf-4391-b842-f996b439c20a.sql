
ALTER TABLE public.subtests
  ADD COLUMN IF NOT EXISTS critical_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS critical_marked_by uuid,
  ADD COLUMN IF NOT EXISTS critical_marked_by_name text;

ALTER TABLE public.defect_items
  ADD COLUMN IF NOT EXISTS critical_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS critical_marked_by uuid,
  ADD COLUMN IF NOT EXISTS critical_marked_by_name text;

CREATE OR REPLACE FUNCTION public.set_critical_marked_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uname text;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.is_critical = true)
     OR (TG_OP = 'UPDATE' AND NEW.is_critical = true AND COALESCE(OLD.is_critical, false) = false) THEN
    SELECT name INTO uname FROM public.profiles WHERE user_id = uid LIMIT 1;
    NEW.critical_marked_at := now();
    NEW.critical_marked_by := uid;
    NEW.critical_marked_by_name := uname;
  ELSIF TG_OP = 'UPDATE' AND NEW.is_critical = false AND COALESCE(OLD.is_critical, false) = true THEN
    NEW.critical_marked_at := NULL;
    NEW.critical_marked_by := NULL;
    NEW.critical_marked_by_name := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subtests_critical_meta ON public.subtests;
CREATE TRIGGER trg_subtests_critical_meta
BEFORE INSERT OR UPDATE OF is_critical ON public.subtests
FOR EACH ROW EXECUTE FUNCTION public.set_critical_marked_metadata();

DROP TRIGGER IF EXISTS trg_defect_items_critical_meta ON public.defect_items;
CREATE TRIGGER trg_defect_items_critical_meta
BEFORE INSERT OR UPDATE OF is_critical ON public.defect_items
FOR EACH ROW EXECUTE FUNCTION public.set_critical_marked_metadata();
