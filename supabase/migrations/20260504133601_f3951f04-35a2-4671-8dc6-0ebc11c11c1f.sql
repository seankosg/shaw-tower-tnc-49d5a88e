ALTER TABLE public.docs_drawings
  ADD COLUMN IF NOT EXISTS team public.team_type;

INSERT INTO public.docs_field_config
  (field_name, display_name, is_enabled, is_required, sort_order, source_origin, visible_to_roles, editable_to_roles)
VALUES
  ('team', 'Team', true, false, 65, 'system',
   ARRAY['guest','super_guest','user','senior_user','superuser','admin']::app_role[],
   ARRAY['user','senior_user','superuser','admin']::app_role[])
ON CONFLICT DO NOTHING;