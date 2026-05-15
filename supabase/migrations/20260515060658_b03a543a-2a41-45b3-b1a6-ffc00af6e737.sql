
-- Punch import rollback RPCs (mirror defect_* pattern)

CREATE OR REPLACE FUNCTION public.preview_rollback_punch_import_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _insert_count int := 0;
  _update_count int := 0;
  _conflict_count int := 0;
BEGIN
  IF NOT public.is_admin_or_superuser(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT count(*) INTO _insert_count
  FROM public.punch_items p
  WHERE p.source_upload_id = _batch_id
    AND p.is_active = true;

  SELECT count(*) INTO _update_count
  FROM public.punch_change_log cl
  JOIN public.punch_items p ON p.id = cl.punch_id
  WHERE cl.upload_id = _batch_id
    AND cl.change_source = 'excel_import'
    AND p.source_upload_id <> _batch_id;

  WITH batch_changes AS (
    SELECT cl.punch_id, cl.changed_field, cl.changed_at
    FROM public.punch_change_log cl
    JOIN public.punch_items p ON p.id = cl.punch_id
    WHERE cl.upload_id = _batch_id
      AND cl.change_source = 'excel_import'
      AND p.source_upload_id <> _batch_id
  ),
  conflicts AS (
    SELECT bc.punch_id, bc.changed_field
    FROM batch_changes bc
    WHERE EXISTS (
      SELECT 1 FROM public.punch_change_log later
      WHERE later.punch_id = bc.punch_id
        AND later.changed_field = bc.changed_field
        AND later.changed_at > bc.changed_at
        AND later.upload_id IS DISTINCT FROM _batch_id
    )
  )
  SELECT count(*) INTO _conflict_count FROM conflicts;

  RETURN jsonb_build_object(
    'insert_count', _insert_count,
    'update_count', _update_count,
    'conflict_count', _conflict_count
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.rollback_punch_import_batch(_batch_id uuid, _force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user uuid := auth.uid();
  _restored int := 0;
  _deleted int := 0;
  _skipped int := 0;
  _rec record;
  _has_later boolean;
BEGIN
  IF NOT public.is_admin_or_superuser(_user) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.punch_upload_batches WHERE id = _batch_id) THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  -- 1. Restore updates
  FOR _rec IN
    SELECT cl.id AS log_id, cl.punch_id, cl.changed_field, cl.old_value, cl.changed_at
    FROM public.punch_change_log cl
    JOIN public.punch_items p ON p.id = cl.punch_id
    WHERE cl.upload_id = _batch_id
      AND cl.change_source = 'excel_import'
      AND p.source_upload_id <> _batch_id
    ORDER BY cl.changed_at ASC
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.punch_change_log later
      WHERE later.punch_id = _rec.punch_id
        AND later.changed_field = _rec.changed_field
        AND later.changed_at > _rec.changed_at
        AND later.upload_id IS DISTINCT FROM _batch_id
    ) INTO _has_later;

    IF _has_later AND NOT _force THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format(
        'UPDATE public.punch_items SET %I = $1, updated_by = $2, updated_at = now(), row_version = row_version + 1 WHERE id = $3',
        _rec.changed_field
      ) USING _rec.old_value, _user, _rec.punch_id;

      INSERT INTO public.punch_change_log (punch_id, changed_field, old_value, new_value, change_source, upload_id, changed_by)
      VALUES (_rec.punch_id, _rec.changed_field, NULL, _rec.old_value, 'rollback', _batch_id, _user);

      _restored := _restored + 1;
    EXCEPTION WHEN others THEN
      _skipped := _skipped + 1;
    END;
  END LOOP;

  -- 2. Soft-delete inserts
  WITH del AS (
    UPDATE public.punch_items
    SET is_active = false, updated_by = _user, updated_at = now(), row_version = row_version + 1
    WHERE source_upload_id = _batch_id AND is_active = true
    RETURNING id
  )
  SELECT count(*) INTO _deleted FROM del;

  -- 3. Mark batch as rolled_back
  UPDATE public.punch_upload_batches
  SET status = 'rolled_back'::public.upload_status,
      rolled_back_at = now(),
      rolled_back_by = _user,
      rollback_force = _force,
      note = COALESCE(note || E'\n', '') || format('Rolled back at %s by %s (force=%s)', now(), _user, _force)
  WHERE id = _batch_id;

  RETURN jsonb_build_object(
    'restored_count', _restored,
    'deleted_count', _deleted,
    'skipped_count', _skipped
  );
END;
$function$;
