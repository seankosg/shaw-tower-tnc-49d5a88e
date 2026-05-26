-- Auto-sync is_summary with parent_id (standalone = summary)
CREATE OR REPLACE FUNCTION public.punch_items_sync_is_summary()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.is_summary := (NEW.parent_id IS NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS punch_items_sync_is_summary ON public.punch_items;
CREATE TRIGGER punch_items_sync_is_summary
BEFORE INSERT OR UPDATE OF parent_id
ON public.punch_items
FOR EACH ROW
EXECUTE FUNCTION public.punch_items_sync_is_summary();

-- One-time normalization: promote all standalone rows to Summary
UPDATE public.punch_items
SET is_summary = true
WHERE parent_id IS NULL
  AND (is_summary IS NULL OR is_summary = false);