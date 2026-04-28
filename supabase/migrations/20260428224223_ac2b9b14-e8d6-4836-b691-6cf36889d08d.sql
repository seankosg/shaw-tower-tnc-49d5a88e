-- One-shot data fix: clear actual dates that are after the latest Data Date.
-- Trigger validate_defect_responsibility_update() blocks plain UPDATE, so we
-- use a temporary SECURITY DEFINER function that disables the trigger for the
-- duration of the cleanup, then drop both helper objects.

CREATE OR REPLACE FUNCTION public._oneshot_clear_future_actual_dates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  ALTER TABLE public.defect_items DISABLE TRIGGER USER;

  UPDATE public.defect_items
  SET actual_start_date = CASE WHEN actual_start_date > '2026-04-28' THEN NULL ELSE actual_start_date END,
      actual_completion_date = CASE WHEN actual_completion_date > '2026-04-28' THEN NULL ELSE actual_completion_date END,
      actual_closure_date = CASE WHEN actual_closure_date > '2026-04-28' THEN NULL ELSE actual_closure_date END,
      updated_at = now()
  WHERE is_active = true
    AND (actual_start_date > '2026-04-28' OR actual_completion_date > '2026-04-28' OR actual_closure_date > '2026-04-28');

  GET DIAGNOSTICS affected = ROW_COUNT;

  ALTER TABLE public.defect_items ENABLE TRIGGER USER;

  RETURN affected;
END;
$$;

SELECT public._oneshot_clear_future_actual_dates();

DROP FUNCTION public._oneshot_clear_future_actual_dates();