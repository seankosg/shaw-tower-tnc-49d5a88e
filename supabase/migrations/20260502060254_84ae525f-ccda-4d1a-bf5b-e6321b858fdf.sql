-- 1) Add UPDATE policy mirror for soft-delete on subtests is already covered by existing UPDATE policy on subtests. We rely on it.
-- (defect_items already has UPDATE policy via can_update_defect / role-based fallback)

-- 2) Preview cascade impact for subtests
CREATE OR REPLACE FUNCTION public.preview_delete_subtests_cascade(_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtests int := 0;
  v_comments int := 0;
  v_comment_reads int := 0;
  v_change_log int := 0;
  v_audit int := 0;
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('subtests',0,'comments',0,'comment_reads',0,'change_log',0,'schedule_audit',0);
  END IF;

  SELECT count(*) INTO v_subtests FROM public.subtests WHERE id = ANY(_ids);
  SELECT count(*) INTO v_comments FROM public.subtest_comments WHERE subtest_id = ANY(_ids);
  SELECT count(*) INTO v_comment_reads FROM public.subtest_comment_reads WHERE subtest_id = ANY(_ids);
  SELECT count(*) INTO v_change_log FROM public.subtest_change_log WHERE subtest_id = ANY(_ids);
  SELECT count(*) INTO v_audit FROM public.schedule_change_audit WHERE subtest_id = ANY(_ids);

  RETURN jsonb_build_object(
    'subtests', v_subtests,
    'comments', v_comments,
    'comment_reads', v_comment_reads,
    'change_log', v_change_log,
    'schedule_audit', v_audit
  );
END;
$$;

-- 3) Preview cascade impact for defects
CREATE OR REPLACE FUNCTION public.preview_delete_defects_cascade(_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_defects int := 0;
  v_comments int := 0;
  v_comment_reads int := 0;
  v_change_log int := 0;
  v_audit int := 0;
  v_snapshots int := 0;
  v_sc_history int := 0;
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('defects',0,'comments',0,'comment_reads',0,'change_log',0,'schedule_audit',0,'daily_snapshots',0,'sc_no_history',0);
  END IF;

  SELECT count(*) INTO v_defects FROM public.defect_items WHERE id = ANY(_ids);
  SELECT count(*) INTO v_comments FROM public.defect_comments WHERE defect_id = ANY(_ids);
  SELECT count(*) INTO v_comment_reads FROM public.defect_comment_reads WHERE defect_id = ANY(_ids);
  SELECT count(*) INTO v_change_log FROM public.defect_change_log WHERE defect_id = ANY(_ids);
  SELECT count(*) INTO v_audit FROM public.defect_schedule_change_audit WHERE defect_id = ANY(_ids);
  SELECT count(*) INTO v_snapshots FROM public.defect_daily_snapshots WHERE defect_id = ANY(_ids);
  SELECT count(*) INTO v_sc_history FROM public.sc_no_history WHERE defect_id = ANY(_ids);

  RETURN jsonb_build_object(
    'defects', v_defects,
    'comments', v_comments,
    'comment_reads', v_comment_reads,
    'change_log', v_change_log,
    'schedule_audit', v_audit,
    'daily_snapshots', v_snapshots,
    'sc_no_history', v_sc_history
  );
END;
$$;

-- 4) Hard delete for subtests (admin/superuser only)
CREATE OR REPLACE FUNCTION public.delete_subtests_cascade(_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted int := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_superuser(v_uid) THEN
    RAISE EXCEPTION 'Only admin or superuser can permanently delete subtests';
  END IF;

  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;

  DELETE FROM public.subtest_comment_reads WHERE subtest_id = ANY(_ids);
  DELETE FROM public.subtest_comments WHERE subtest_id = ANY(_ids);
  DELETE FROM public.subtest_change_log WHERE subtest_id = ANY(_ids);
  DELETE FROM public.schedule_change_audit WHERE subtest_id = ANY(_ids);
  WITH d AS (DELETE FROM public.subtests WHERE id = ANY(_ids) RETURNING 1)
  SELECT count(*) INTO v_deleted FROM d;

  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;

-- 5) Hard delete for defects (admin/superuser only)
CREATE OR REPLACE FUNCTION public.delete_defects_cascade(_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted int := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_superuser(v_uid) THEN
    RAISE EXCEPTION 'Only admin or superuser can permanently delete defects';
  END IF;

  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted', 0);
  END IF;

  DELETE FROM public.defect_comment_reads WHERE defect_id = ANY(_ids);
  DELETE FROM public.defect_comments WHERE defect_id = ANY(_ids);
  DELETE FROM public.defect_change_log WHERE defect_id = ANY(_ids);
  DELETE FROM public.defect_schedule_change_audit WHERE defect_id = ANY(_ids);
  DELETE FROM public.defect_daily_snapshots WHERE defect_id = ANY(_ids);
  DELETE FROM public.sc_no_history WHERE defect_id = ANY(_ids);
  WITH d AS (DELETE FROM public.defect_items WHERE id = ANY(_ids) RETURNING 1)
  SELECT count(*) INTO v_deleted FROM d;

  RETURN jsonb_build_object('deleted', v_deleted);
END;
$$;
