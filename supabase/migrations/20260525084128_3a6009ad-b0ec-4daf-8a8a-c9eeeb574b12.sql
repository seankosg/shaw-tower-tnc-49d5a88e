-- Function: recompute summary dates from child subtasks
CREATE OR REPLACE FUNCTION public.punch_recompute_summary_dates(p_parent uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_parent IS NULL THEN RETURN; END IF;
  UPDATE public.punch_items p
  SET planned_start_date      = sub.min_ps,
      planned_completion_date = sub.max_pc,
      actual_start_date       = sub.min_as,
      actual_completion_date  = CASE WHEN sub.cnt > 0 AND sub.cnt_ac = sub.cnt
                                     THEN sub.max_ac ELSE NULL END,
      updated_at              = now()
  FROM (
    SELECT
      COUNT(*)                          AS cnt,
      COUNT(actual_completion_date)     AS cnt_ac,
      MIN(planned_start_date)           AS min_ps,
      MAX(planned_completion_date)      AS max_pc,
      MIN(actual_start_date)            AS min_as,
      MAX(actual_completion_date)       AS max_ac
    FROM public.punch_items
    WHERE parent_id = p_parent
  ) sub
  WHERE p.id = p_parent AND p.is_summary = true;
END;
$$;

-- Trigger function
CREATE OR REPLACE FUNCTION public.trg_punch_summary_dates_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NOT NULL THEN
      PERFORM public.punch_recompute_summary_dates(NEW.parent_id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
      PERFORM public.punch_recompute_summary_dates(OLD.parent_id);
      PERFORM public.punch_recompute_summary_dates(NEW.parent_id);
    ELSIF NEW.parent_id IS NOT NULL AND (
        OLD.planned_start_date IS DISTINCT FROM NEW.planned_start_date OR
        OLD.planned_completion_date IS DISTINCT FROM NEW.planned_completion_date OR
        OLD.actual_start_date IS DISTINCT FROM NEW.actual_start_date OR
        OLD.actual_completion_date IS DISTINCT FROM NEW.actual_completion_date
    ) THEN
      PERFORM public.punch_recompute_summary_dates(NEW.parent_id);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.parent_id IS NOT NULL THEN
      PERFORM public.punch_recompute_summary_dates(OLD.parent_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_punch_summary_dates ON public.punch_items;
CREATE TRIGGER trg_punch_summary_dates
AFTER INSERT OR UPDATE OR DELETE ON public.punch_items
FOR EACH ROW EXECUTE FUNCTION public.trg_punch_summary_dates_fn();

-- One-time backfill
WITH agg AS (
  SELECT parent_id,
         COUNT(*) cnt, COUNT(actual_completion_date) cnt_ac,
         MIN(planned_start_date) min_ps, MAX(planned_completion_date) max_pc,
         MIN(actual_start_date) min_as,  MAX(actual_completion_date) max_ac
  FROM public.punch_items WHERE parent_id IS NOT NULL GROUP BY parent_id
)
UPDATE public.punch_items p SET
  planned_start_date = a.min_ps,
  planned_completion_date = a.max_pc,
  actual_start_date  = a.min_as,
  actual_completion_date = CASE WHEN a.cnt > 0 AND a.cnt_ac = a.cnt THEN a.max_ac ELSE NULL END
FROM agg a WHERE p.id = a.parent_id AND p.is_summary = true;