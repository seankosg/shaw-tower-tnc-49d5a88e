
DO $$
BEGIN
  -- Log changes first
  INSERT INTO public.defect_change_log (defect_id, changed_field, old_value, new_value, change_source, changed_by)
  SELECT id, 'actual_start_date', NULL, actual_completion_date::text, 'one_time_migration', NULL
  FROM public.defect_items
  WHERE actual_completion_date IS NOT NULL
    AND actual_start_date IS NULL
    AND is_active = true;

  -- Bypass responsibility-validation trigger for this admin-level backfill
  ALTER TABLE public.defect_items DISABLE TRIGGER USER;

  UPDATE public.defect_items
  SET actual_start_date = actual_completion_date,
      updated_at = now()
  WHERE actual_completion_date IS NOT NULL
    AND actual_start_date IS NULL
    AND is_active = true;

  ALTER TABLE public.defect_items ENABLE TRIGGER USER;
END $$;
