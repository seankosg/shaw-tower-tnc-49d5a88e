-- 1) 두 컬럼 추가
ALTER TABLE public.punch_items
  ADD COLUMN IF NOT EXISTS summary_no text,
  ADD COLUMN IF NOT EXISTS subtask_no text;

-- 2) 동기화 함수
CREATE OR REPLACE FUNCTION public.punch_items_sync_split_nos()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_item text;
BEGIN
  IF NEW.is_summary THEN
    NEW.summary_no := NEW.item_no;
    NEW.subtask_no := 'S';
  ELSE
    IF NEW.parent_id IS NOT NULL THEN
      SELECT item_no INTO parent_item FROM public.punch_items WHERE id = NEW.parent_id;
    END IF;
    NEW.summary_no := COALESCE(parent_item, split_part(COALESCE(NEW.item_no, ''), '.', 1));
    NEW.subtask_no := NEW.item_no;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) 트리거
DROP TRIGGER IF EXISTS trg_punch_items_sync_split_nos ON public.punch_items;
CREATE TRIGGER trg_punch_items_sync_split_nos
BEFORE INSERT OR UPDATE OF item_no, is_summary, parent_id
ON public.punch_items
FOR EACH ROW
EXECUTE FUNCTION public.punch_items_sync_split_nos();

-- 4) 일회 백필
UPDATE public.punch_items
   SET summary_no = item_no, subtask_no = 'S'
 WHERE is_summary;

UPDATE public.punch_items c
   SET summary_no = COALESCE(p.item_no, split_part(COALESCE(c.item_no,''), '.', 1)),
       subtask_no = c.item_no
  FROM public.punch_items p
 WHERE p.id = c.parent_id
   AND NOT c.is_summary;

UPDATE public.punch_items
   SET summary_no = split_part(COALESCE(item_no,''), '.', 1),
       subtask_no = item_no
 WHERE NOT is_summary
   AND summary_no IS NULL;

-- 5) 인덱스
CREATE INDEX IF NOT EXISTS idx_punch_items_summary_no
  ON public.punch_items (project_id, summary_no)
  WHERE is_active;