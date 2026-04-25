
-- ============================================================
-- T&C: PREVIEW (dry-run)
-- ============================================================
CREATE OR REPLACE FUNCTION public.preview_rollback_upload_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _insert_count int := 0;
  _update_count int := 0;
  _conflict_count int := 0;
  _conflicts jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin_or_superuser(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Inserts: rows whose source_upload_id = batch and have no prior change_log
  -- (we approximate "inserted by this batch" via source_upload_id)
  SELECT count(*) INTO _insert_count
  FROM public.subtests s
  WHERE s.source_upload_id = _batch_id
    AND s.is_active = true;

  -- Updates: change_log rows from this batch where target subtest still exists
  SELECT count(*) INTO _update_count
  FROM public.subtest_change_log cl
  JOIN public.subtests s ON s.id = cl.subtest_id
  WHERE cl.upload_id = _batch_id
    AND cl.change_source = 'excel_import'::public.change_source
    AND s.source_upload_id <> _batch_id;  -- exclude inserts

  -- Conflicts: same field changed AFTER this batch's change
  WITH batch_changes AS (
    SELECT cl.id, cl.subtest_id, cl.changed_field, cl.changed_at
    FROM public.subtest_change_log cl
    JOIN public.subtests s ON s.id = cl.subtest_id
    WHERE cl.upload_id = _batch_id
      AND cl.change_source = 'excel_import'::public.change_source
      AND s.source_upload_id <> _batch_id
  ),
  conflicts AS (
    SELECT bc.subtest_id, bc.changed_field
    FROM batch_changes bc
    WHERE EXISTS (
      SELECT 1 FROM public.subtest_change_log later
      WHERE later.subtest_id = bc.subtest_id
        AND later.changed_field = bc.changed_field
        AND later.changed_at > bc.changed_at
        AND later.upload_id IS DISTINCT FROM _batch_id
    )
  )
  SELECT count(*), COALESCE(jsonb_agg(jsonb_build_object('subtest_id', subtest_id, 'field', changed_field)) FILTER (WHERE true), '[]'::jsonb)
  INTO _conflict_count, _conflicts
  FROM conflicts;

  RETURN jsonb_build_object(
    'insert_count', _insert_count,
    'update_count', _update_count,
    'conflict_count', _conflict_count,
    'conflicts', _conflicts
  );
END;
$$;

-- ============================================================
-- T&C: ROLLBACK
-- ============================================================
CREATE OR REPLACE FUNCTION public.rollback_upload_batch(_batch_id uuid, _force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF NOT EXISTS (SELECT 1 FROM public.upload_batches WHERE id = _batch_id) THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  -- 1. Restore updated fields (process oldest changes first so multiple changes to same field collapse correctly)
  FOR _rec IN
    SELECT cl.id AS log_id, cl.subtest_id, cl.changed_field, cl.old_value, cl.changed_at
    FROM public.subtest_change_log cl
    JOIN public.subtests s ON s.id = cl.subtest_id
    WHERE cl.upload_id = _batch_id
      AND cl.change_source = 'excel_import'::public.change_source
      AND s.source_upload_id <> _batch_id
    ORDER BY cl.changed_at ASC
  LOOP
    -- Conflict check
    SELECT EXISTS (
      SELECT 1 FROM public.subtest_change_log later
      WHERE later.subtest_id = _rec.subtest_id
        AND later.changed_field = _rec.changed_field
        AND later.changed_at > _rec.changed_at
        AND later.upload_id IS DISTINCT FROM _batch_id
    ) INTO _has_later;

    IF _has_later AND NOT _force THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    -- Apply restore via dynamic SQL on subtests
    BEGIN
      EXECUTE format(
        'UPDATE public.subtests SET %I = $1, updated_by = $2, updated_at = now(), row_version = row_version + 1 WHERE id = $3',
        _rec.changed_field
      ) USING _rec.old_value, _user, _rec.subtest_id;

      -- Audit the rollback in change_log
      INSERT INTO public.subtest_change_log (subtest_id, changed_field, old_value, new_value, change_source, upload_id, changed_by)
      VALUES (_rec.subtest_id, _rec.changed_field, NULL, _rec.old_value, 'rollback'::public.change_source, _batch_id, _user);

      _restored := _restored + 1;
    EXCEPTION WHEN others THEN
      _skipped := _skipped + 1;
    END;
  END LOOP;

  -- 2. Soft-delete inserts (rows whose source_upload_id = this batch)
  WITH del AS (
    UPDATE public.subtests
    SET is_active = false, updated_by = _user, updated_at = now(), row_version = row_version + 1
    WHERE source_upload_id = _batch_id AND is_active = true
    RETURNING id
  )
  SELECT count(*) INTO _deleted FROM del;

  -- 3. Clean schedule_change_audit for this batch
  DELETE FROM public.schedule_change_audit WHERE upload_id = _batch_id;

  -- 4. Mark batch as rolled_back
  UPDATE public.upload_batches
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
$$;

-- ============================================================
-- DEFECT: PREVIEW
-- ============================================================
CREATE OR REPLACE FUNCTION public.preview_rollback_defect_import_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _insert_count int := 0;
  _update_count int := 0;
  _conflict_count int := 0;
  _conflicts jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin_or_superuser(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT count(*) INTO _insert_count
  FROM public.defect_items d
  WHERE d.source_upload_id = _batch_id
    AND d.is_active = true;

  SELECT count(*) INTO _update_count
  FROM public.defect_change_log cl
  JOIN public.defect_items d ON d.id = cl.defect_id
  WHERE cl.upload_id = _batch_id
    AND cl.change_source = 'excel_import'
    AND d.source_upload_id <> _batch_id;

  WITH batch_changes AS (
    SELECT cl.defect_id, cl.changed_field, cl.changed_at
    FROM public.defect_change_log cl
    JOIN public.defect_items d ON d.id = cl.defect_id
    WHERE cl.upload_id = _batch_id
      AND cl.change_source = 'excel_import'
      AND d.source_upload_id <> _batch_id
  ),
  conflicts AS (
    SELECT bc.defect_id, bc.changed_field
    FROM batch_changes bc
    WHERE EXISTS (
      SELECT 1 FROM public.defect_change_log later
      WHERE later.defect_id = bc.defect_id
        AND later.changed_field = bc.changed_field
        AND later.changed_at > bc.changed_at
        AND later.upload_id IS DISTINCT FROM _batch_id
    )
  )
  SELECT count(*), COALESCE(jsonb_agg(jsonb_build_object('defect_id', defect_id, 'field', changed_field)) FILTER (WHERE true), '[]'::jsonb)
  INTO _conflict_count, _conflicts
  FROM conflicts;

  RETURN jsonb_build_object(
    'insert_count', _insert_count,
    'update_count', _update_count,
    'conflict_count', _conflict_count,
    'conflicts', _conflicts
  );
END;
$$;

-- ============================================================
-- DEFECT: ROLLBACK
-- ============================================================
CREATE OR REPLACE FUNCTION public.rollback_defect_import_batch(_batch_id uuid, _force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF NOT EXISTS (SELECT 1 FROM public.defect_upload_batches WHERE id = _batch_id) THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  -- 1. Restore updates
  FOR _rec IN
    SELECT cl.id AS log_id, cl.defect_id, cl.changed_field, cl.old_value, cl.changed_at
    FROM public.defect_change_log cl
    JOIN public.defect_items d ON d.id = cl.defect_id
    WHERE cl.upload_id = _batch_id
      AND cl.change_source = 'excel_import'
      AND d.source_upload_id <> _batch_id
    ORDER BY cl.changed_at ASC
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.defect_change_log later
      WHERE later.defect_id = _rec.defect_id
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
        'UPDATE public.defect_items SET %I = $1, updated_by = $2, updated_at = now(), row_version = row_version + 1 WHERE id = $3',
        _rec.changed_field
      ) USING _rec.old_value, _user, _rec.defect_id;

      INSERT INTO public.defect_change_log (defect_id, changed_field, old_value, new_value, change_source, upload_id, changed_by)
      VALUES (_rec.defect_id, _rec.changed_field, NULL, _rec.old_value, 'rollback', _batch_id, _user);

      _restored := _restored + 1;
    EXCEPTION WHEN others THEN
      _skipped := _skipped + 1;
    END;
  END LOOP;

  -- 2. Soft-delete inserts
  WITH del AS (
    UPDATE public.defect_items
    SET is_active = false, updated_by = _user, updated_at = now(), row_version = row_version + 1
    WHERE source_upload_id = _batch_id AND is_active = true
    RETURNING id
  )
  SELECT count(*) INTO _deleted FROM del;

  -- 3. Clean schedule audit and snapshots tied to this batch's inserts
  DELETE FROM public.defect_schedule_change_audit WHERE upload_id = _batch_id;

  -- 4. Mark batch as rolled_back
  UPDATE public.defect_upload_batches
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
$$;
