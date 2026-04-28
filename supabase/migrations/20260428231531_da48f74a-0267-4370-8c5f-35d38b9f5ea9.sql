REVOKE EXECUTE ON FUNCTION public.set_allow_actual_today(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_allow_actual_today(boolean) TO authenticated;