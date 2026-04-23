ALTER TABLE public.defect_items
ADD COLUMN IF NOT EXISTS actual_date date;

UPDATE public.defect_items
SET actual_date = COALESCE(actual_date, closed_date, updated_at::date)
WHERE actual_progress_pct >= 100
  AND actual_date IS NULL;

UPDATE public.defect_items
SET actual_date = NULL
WHERE COALESCE(actual_progress_pct, 0) < 100
  AND actual_date IS NOT NULL;

INSERT INTO public.defect_field_config (field_name, display_name, is_enabled, is_required, sort_order, source_origin)
VALUES ('actual_date', 'Actual Date', true, false, 395, 'system')
ON CONFLICT (field_name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    is_enabled = true,
    sort_order = EXCLUDED.sort_order;