
ALTER TABLE public.defect_items
  ADD COLUMN IF NOT EXISTS is_post_csc boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_defect_post_csc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_post_csc := (
    (COALESCE(NEW.created_at, now()) AT TIME ZONE 'Asia/Singapore')::date >= DATE '2026-06-26'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_defect_set_post_csc ON public.defect_items;
CREATE TRIGGER trg_defect_set_post_csc
BEFORE INSERT OR UPDATE OF created_at ON public.defect_items
FOR EACH ROW EXECUTE FUNCTION public.set_defect_post_csc();

-- backfill: bypass user validation trigger during one-off maintenance
ALTER TABLE public.defect_items DISABLE TRIGGER USER;
ALTER TABLE public.defect_items ENABLE TRIGGER trg_defect_set_post_csc;

UPDATE public.defect_items
SET is_post_csc = true
WHERE (created_at AT TIME ZONE 'Asia/Singapore')::date >= DATE '2026-06-26'
  AND is_post_csc = false;

ALTER TABLE public.defect_items ENABLE TRIGGER USER;

CREATE INDEX IF NOT EXISTS idx_defect_items_post_csc
  ON public.defect_items (is_post_csc, is_active);
