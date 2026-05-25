CREATE OR REPLACE FUNCTION public.punch_depth_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent_parent uuid;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'punch_items: parent_id cannot reference self';
    END IF;
    SELECT parent_id INTO v_parent_parent FROM public.punch_items WHERE id = NEW.parent_id;
    IF v_parent_parent IS NOT NULL THEN
      RAISE EXCEPTION 'punch_items: maximum hierarchy depth is 2 (no grandchildren allowed)';
    END IF;
    IF NEW.is_summary THEN
      RAISE EXCEPTION 'punch_items: a row with parent_id cannot be a summary';
    END IF;
    -- subtask_stage is now optional for child rows (business rule update).
  ELSE
    IF NEW.subtask_stage IS NOT NULL THEN
      RAISE EXCEPTION 'punch_items: subtask_stage must be NULL for non-child rows';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;