ALTER TABLE public.defect_items DISABLE TRIGGER validate_defect_responsibility_update;
ALTER TABLE public.defect_items DISABLE TRIGGER trg_enforce_actual_date_not_after_data_date;

DO $$
DECLARE
  _cols text[] := ARRAY[
    'planned_start_date',
    'planned_completion_date',
    'planned_closure_date',
    'actual_start_date',
    'actual_completion_date',
    'actual_closure_date'
  ];
  _col text;
  _rec record;
BEGIN
  FOREACH _col IN ARRAY _cols LOOP
    FOR _rec IN EXECUTE format(
      'SELECT id, %I::text AS old_val, ((%I + INTERVAL ''25 years'')::date)::text AS new_val
       FROM public.defect_items
       WHERE is_active = true
         AND %I BETWEEN ''2001-01-01''::date AND ''2001-12-31''::date',
      _col, _col, _col
    ) LOOP
      INSERT INTO public.defect_change_log
        (defect_id, changed_field, old_value, new_value, change_source, changed_by)
      VALUES
        (_rec.id, _col, _rec.old_val, _rec.new_val, 'data_fix_2001_to_2026', NULL);
    END LOOP;

    EXECUTE format(
      'UPDATE public.defect_items
       SET %I = (%I + INTERVAL ''25 years'')::date
       WHERE is_active = true
         AND %I BETWEEN ''2001-01-01''::date AND ''2001-12-31''::date',
      _col, _col, _col
    );
  END LOOP;
END $$;

WITH today_d AS (SELECT (now() AT TIME ZONE 'Asia/Singapore')::date AS d),
recomputed AS (
  SELECT
    d.id,
    CASE
      WHEN d.actual_completion_date IS NOT NULL
        OR COALESCE(d.actual_progress_pct, 0) >= 100
        OR lower(trim(coalesce(d.status, ''))) IN ('work done', 'closed')
        THEN 'Done'
      WHEN d.planned_start_date IS NOT NULL AND (SELECT d FROM today_d) < d.planned_start_date
        THEN 'Planned'
      WHEN COALESCE(d.actual_progress_pct, 0) < COALESCE(d.planned_progress_pct, 0)
        THEN 'Delay'
      WHEN d.planned_completion_date IS NOT NULL
        AND d.planned_completion_date < (SELECT d FROM today_d)
        AND d.actual_completion_date IS NULL
        THEN 'Delay'
      WHEN COALESCE(d.actual_progress_pct, 0) > 0 THEN 'WIP'
      ELSE 'Planned'
    END AS new_completion
  FROM public.defect_items d
  WHERE d.is_active = true
),
with_closure AS (
  SELECT
    r.id,
    r.new_completion,
    CASE
      WHEN d.actual_closure_date IS NOT NULL THEN 'Done'
      WHEN lower(trim(coalesce(d.status, ''))) = 'closed' THEN 'Done'
      WHEN d.planned_closure_date IS NOT NULL
        AND d.planned_closure_date < (SELECT d FROM today_d)
        THEN 'Delay'
      WHEN r.new_completion = 'Done' AND d.actual_closure_date IS NULL THEN 'WIP'
      ELSE 'Planned'
    END AS new_closure
  FROM recomputed r
  JOIN public.defect_items d ON d.id = r.id
)
UPDATE public.defect_items di
SET completion_status = wc.new_completion,
    closure_status = wc.new_closure
FROM with_closure wc
WHERE di.id = wc.id
  AND (di.completion_status IS DISTINCT FROM wc.new_completion
       OR di.closure_status  IS DISTINCT FROM wc.new_closure);

ALTER TABLE public.defect_items ENABLE TRIGGER validate_defect_responsibility_update;
ALTER TABLE public.defect_items ENABLE TRIGGER trg_enforce_actual_date_not_after_data_date;