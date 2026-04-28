-- RPC wrappers that set the per-transaction GUC and then perform the update
-- in the SAME statement-batch so the trigger sees the flag.

CREATE OR REPLACE FUNCTION public.update_defect_with_today_allowed(
  _id uuid,
  _patch jsonb
)
RETURNS public.defect_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.defect_items;
  _allowed_keys text[] := ARRAY[
    'actual_start_date','actual_completion_date','actual_closure_date',
    'completion_status','closure_status',
    'actual_progress','remarks','work_type','captured_on',
    'start_date','finish_date','actual_finish_date','planned_progress',
    'item_description','subcontractor_name','subsub_name','hdec_pic_name',
    'team','area','area_type','area_level','area_location','priority',
    'category','sub_category','root_cause','corrective_action','severity',
    'status','data_source_type','row_version','updated_by'
  ];
  _set_sql text := '';
  _key text;
  _val jsonb;
  _first boolean := true;
BEGIN
  IF _id IS NULL OR _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'Invalid arguments';
  END IF;

  PERFORM set_config('app.allow_actual_today', 'on', true);

  FOR _key, _val IN SELECT * FROM jsonb_each(_patch) LOOP
    IF NOT (_key = ANY(_allowed_keys)) THEN
      CONTINUE;
    END IF;
    IF NOT _first THEN _set_sql := _set_sql || ', '; END IF;
    _set_sql := _set_sql || format('%I = ($1->>%L)::text', _key, _key);
    _first := false;
  END LOOP;

  IF _first THEN
    SELECT * INTO _row FROM public.defect_items WHERE id = _id;
    RETURN _row;
  END IF;

  EXECUTE format(
    'UPDATE public.defect_items SET %s, updated_at = now() WHERE id = $2 RETURNING *',
    _set_sql
  ) INTO _row USING _patch, _id;

  RETURN _row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_defect_with_today_allowed(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_defect_with_today_allowed(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_subtest_with_today_allowed(
  _id uuid,
  _patch jsonb
)
RETURNS public.subtests
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.subtests;
  _allowed_keys text[] := ARRAY[
    't1_actual_date','t2_actual_date','pred_actual_date',
    'r1_actual_submission_date','r2_actual_submission_date','r2_actual_approval_date',
    't1_status','t2_status','pred_status','r1_status','r2_status',
    't1_planned_date','t2_planned_date','pred_planned_date',
    'r1_target_submission_date','r2_target_submission_date','r2_target_approval_date',
    'r1_report_ref','aconex_ref_no','predecessor_status_raw',
    'subcontractor_name','subsub_name','hdec_pic_name','team',
    'description','equipment','remarks','data_source_type','row_version','updated_by'
  ];
  _set_sql text := '';
  _key text;
  _val jsonb;
  _first boolean := true;
BEGIN
  IF _id IS NULL OR _patch IS NULL OR jsonb_typeof(_patch) <> 'object' THEN
    RAISE EXCEPTION 'Invalid arguments';
  END IF;

  PERFORM set_config('app.allow_actual_today', 'on', true);

  FOR _key, _val IN SELECT * FROM jsonb_each(_patch) LOOP
    IF NOT (_key = ANY(_allowed_keys)) THEN
      CONTINUE;
    END IF;
    IF NOT _first THEN _set_sql := _set_sql || ', '; END IF;
    _set_sql := _set_sql || format('%I = ($1->>%L)::text', _key, _key);
    _first := false;
  END LOOP;

  IF _first THEN
    SELECT * INTO _row FROM public.subtests WHERE id = _id;
    RETURN _row;
  END IF;

  EXECUTE format(
    'UPDATE public.subtests SET %s, updated_at = now() WHERE id = $2 RETURNING *',
    _set_sql
  ) INTO _row USING _patch, _id;

  RETURN _row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_subtest_with_today_allowed(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_subtest_with_today_allowed(uuid, jsonb) TO authenticated;