REVOKE EXECUTE ON FUNCTION public.purge_old_logs() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_event_log() FROM anon, authenticated;