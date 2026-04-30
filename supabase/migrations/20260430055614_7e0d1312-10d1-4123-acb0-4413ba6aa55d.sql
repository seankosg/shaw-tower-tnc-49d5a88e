ALTER TABLE public.defect_items DISABLE TRIGGER validate_defect_responsibility_update;
ALTER TABLE public.defect_items DISABLE TRIGGER trg_enforce_actual_date_not_after_data_date;

WITH today_d AS (SELECT (now() AT TIME ZONE 'Asia/Singapore')::date AS d)
UPDATE public.defect_items di
SET planned_progress_pct = sub.new_pct
FROM (
  SELECT
    d.id,
    CASE
      WHEN d.planned_start_date IS NULL OR d.planned_completion_date IS NULL THEN d.planned_progress_pct
      WHEN d.planned_completion_date < d.planned_start_date THEN d.planned_progress_pct
      WHEN (SELECT d FROM today_d) < d.planned_start_date THEN 0
      WHEN d.planned_completion_date = d.planned_start_date THEN 100
      WHEN (SELECT d FROM today_d) > d.planned_completion_date THEN 100
      ELSE round(
        ((SELECT d FROM today_d) - d.planned_start_date)::numeric
        / NULLIF((d.planned_completion_date - d.planned_start_date), 0)::numeric * 100,
        1
      )
    END AS new_pct
  FROM public.defect_items d
  WHERE d.is_active = true
) sub
WHERE di.id = sub.id
  AND di.planned_progress_pct IS DISTINCT FROM sub.new_pct;

ALTER TABLE public.defect_items ENABLE TRIGGER validate_defect_responsibility_update;
ALTER TABLE public.defect_items ENABLE TRIGGER trg_enforce_actual_date_not_after_data_date;