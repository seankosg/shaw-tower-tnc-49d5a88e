
REVOKE EXECUTE ON FUNCTION public.add_punch_subtask(uuid, public.subtask_stage_enum, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.override_summary_field(uuid, text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.revert_summary_field(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.migrate_existing_punch_to_groups(uuid, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.punch_recalc_summary(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.punch_depth_guard() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.punch_rollup_trigger() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.punch_auto_demote_trigger() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.add_punch_subtask(uuid, public.subtask_stage_enum, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.override_summary_field(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_summary_field(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_existing_punch_to_groups(uuid, boolean) TO authenticated;
