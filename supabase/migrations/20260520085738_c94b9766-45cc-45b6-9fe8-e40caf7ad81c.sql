
-- Preview function for OMM rollback
CREATE OR REPLACE FUNCTION public.preview_rollback_docs_omm_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _insert_count int := 0;
  _child_count int := 0;
  _update_count int := 0;
  _conflict_count int := 0;
BEGIN
  IF NOT public.is_admin_or_superuser(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Rows inserted directly by this batch
  SELECT count(*) INTO _insert_count
  FROM public.docs_omm o
  WHERE o.source_upload_id = _batch_id
    AND o.is_active = true;

  -- Auto-resubmission child rows triggered by this batch's updates
  SELECT count(*) INTO _child_count
  FROM public.docs_omm child
  WHERE child.is_active = true
    AND child.parent_id IS NOT NULL
    AND child.data_source_type = 'auto_resubmission'
    AND EXISTS (
      SELECT 1 FROM public.docs_change_log cl
      WHERE cl.upload_id = _batch_id
        AND cl.sub_module = 'omm'
        AND cl.record_id = child.parent_id
        AND cl.changed_field IN ('draft_response_status','final_response_status')
        AND cl.new_value IN ('B','C')
    );

  -- Field updates from this batch on rows NOT inserted by it
  SELECT count(*) INTO _update_count
  FROM public.docs_change_log cl
  JOIN public.docs_omm o ON o.id = cl.record_id
  WHERE cl.upload_id = _batch_id
    AND cl.sub_module = 'omm'
    AND cl.change_source = 'excel_import'
    AND (o.source_upload_id IS DISTINCT FROM _batch_id);

  -- Conflicts: same field changed later by another source
  WITH batch_changes AS (
    SELECT cl.record_id, cl.changed_field, cl.changed_at
    FROM public.docs_change_log cl
    JOIN public.docs_omm o ON o.id = cl.record_id
    WHERE cl.upload_id = _batch_id
      AND cl.sub_module = 'omm'
      AND cl.change_source = 'excel_import'
      AND (o.source_upload_id IS DISTINCT FROM _batch_id)
  )
  SELECT count(*) INTO _conflict_count
  FROM batch_changes bc
  WHERE EXISTS (
    SELECT 1 FROM public.docs_change_log later
    WHERE later.record_id = bc.record_id
      AND later.sub_module = 'omm'
      AND later.changed_field = bc.changed_field
      AND later.changed_at > bc.changed_at
      AND later.upload_id IS DISTINCT FROM _batch_id
  );

  RETURN jsonb_build_object(
    'insert_count', _insert_count + _child_count,
    'update_count', _update_count,
    'conflict_count', _conflict_count
  );
END;
$$;

-- Rollback function for OMM
CREATE OR REPLACE FUNCTION public.rollback_docs_omm_batch(_batch_id uuid, _force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user uuid := auth.uid();
  _restored int := 0;
  _deleted int := 0;
  _skipped int := 0;
  _rec record;
  _has_later boolean;
  _sub text;
BEGIN
  IF NOT public.is_admin_or_superuser(_user) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT sub_module INTO _sub FROM public.docs_upload_batches WHERE id = _batch_id;
  IF _sub IS NULL THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;
  IF _sub <> 'omm' THEN
    RAISE EXCEPTION 'Rollback is only supported for OMM batches (got %)', _sub;
  END IF;

  -- 1. Restore updated fields (oldest first)
  FOR _rec IN
    SELECT cl.id AS log_id, cl.record_id, cl.changed_field, cl.old_value, cl.changed_at
    FROM public.docs_change_log cl
    JOIN public.docs_omm o ON o.id = cl.record_id
    WHERE cl.upload_id = _batch_id
      AND cl.sub_module = 'omm'
      AND cl.change_source = 'excel_import'
      AND (o.source_upload_id IS DISTINCT FROM _batch_id)
    ORDER BY cl.changed_at ASC
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.docs_change_log later
      WHERE later.record_id = _rec.record_id
        AND later.sub_module = 'omm'
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
        'UPDATE public.docs_omm SET %I = $1, updated_by = $2, updated_at = now(), row_version = row_version + 1 WHERE id = $3',
        _rec.changed_field
      ) USING _rec.old_value, _user, _rec.record_id;

      INSERT INTO public.docs_change_log (
        record_id, changed_field, old_value, new_value, change_source, upload_id, sub_module, changed_by
      ) VALUES (
        _rec.record_id, _rec.changed_field, NULL, _rec.old_value, 'rollback', _batch_id, 'omm', _user
      );

      _restored := _restored + 1;
    EXCEPTION WHEN others THEN
      _skipped := _skipped + 1;
    END;
  END LOOP;

  -- 2. Soft-delete auto-resubmission child rows triggered by this batch
  WITH del_child AS (
    UPDATE public.docs_omm child
    SET is_active = false,
        updated_by = _user,
        updated_at = now(),
        row_version = row_version + 1
    WHERE child.is_active = true
      AND child.parent_id IS NOT NULL
      AND child.data_source_type = 'auto_resubmission'
      AND EXISTS (
        SELECT 1 FROM public.docs_change_log cl
        WHERE cl.upload_id = _batch_id
          AND cl.sub_module = 'omm'
          AND cl.record_id = child.parent_id
          AND cl.changed_field IN ('draft_response_status','final_response_status')
          AND cl.new_value IN ('B','C')
      )
    RETURNING id
  )
  SELECT count(*) INTO _deleted FROM del_child;

  -- 3. Soft-delete rows directly inserted by this batch
  WITH del AS (
    UPDATE public.docs_omm
    SET is_active = false,
        updated_by = _user,
        updated_at = now(),
        row_version = row_version + 1
    WHERE source_upload_id = _batch_id
      AND is_active = true
    RETURNING id
  )
  SELECT _deleted + count(*) INTO _deleted FROM del;

  -- 4. Mark batch as rolled_back
  UPDATE public.docs_upload_batches
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
