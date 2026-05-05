CREATE OR REPLACE FUNCTION public._event_log_actor_role(_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_super boolean;
  is_d_super boolean;
  is_senior boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  SELECT public.has_role(_user_id, 'superuser'::public.app_role)   INTO is_super;
  IF is_super THEN RETURN 'superuser'; END IF;
  SELECT public.has_role(_user_id, 'd_superuser'::public.app_role) INTO is_d_super;
  IF is_d_super THEN RETURN 'd_superuser'; END IF;
  SELECT public.has_role(_user_id, 'senior_user'::public.app_role) INTO is_senior;
  IF is_senior THEN RETURN 'senior_user'; END IF;
  RETURN NULL;
END;
$function$;