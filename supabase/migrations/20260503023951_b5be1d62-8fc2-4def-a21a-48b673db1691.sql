
ALTER TABLE public.docs_drawings
  ADD COLUMN IF NOT EXISTS subcontractor_name text,
  ADD COLUMN IF NOT EXISTS sub1_actual_response_date date,
  ADD COLUMN IF NOT EXISTS sub2_actual_response_date date,
  ADD COLUMN IF NOT EXISTS sub3_actual_response_date date;

TRUNCATE TABLE public.docs_change_log RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.docs_drawings RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.docs_upload_batches RESTART IDENTITY CASCADE;

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('docs_standard_response_lead_days', to_jsonb(7), now())
ON CONFLICT (key) DO NOTHING;

UPDATE public.docs_field_config SET display_name = 'Cycle 1 Planned Response' WHERE field_name = 'sub1_approval_date';
UPDATE public.docs_field_config SET display_name = 'Cycle 2 Planned Response' WHERE field_name = 'sub2_approval_date';
UPDATE public.docs_field_config SET display_name = 'Cycle 3 Planned Response' WHERE field_name = 'sub3_approval_date';

INSERT INTO public.docs_field_config
  (field_name, display_name, source_origin, sort_order, is_enabled,
   visible_to_roles, editable_to_roles)
VALUES
  ('subcontractor_name',          'Subcontractor',              'system', 12, true,
    ARRAY['admin','superuser','senior_user','user','guest','super_guest']::app_role[],
    ARRAY['admin','superuser','senior_user','user']::app_role[]),
  ('sub1_actual_response_date',   'Cycle 1 Actual Response',    'system', 41, true,
    ARRAY['admin','superuser','senior_user','user','guest','super_guest']::app_role[],
    ARRAY['admin','superuser','senior_user','user']::app_role[]),
  ('sub2_actual_response_date',   'Cycle 2 Actual Response',    'system', 51, true,
    ARRAY['admin','superuser','senior_user','user','guest','super_guest']::app_role[],
    ARRAY['admin','superuser','senior_user','user']::app_role[]),
  ('sub3_actual_response_date',   'Cycle 3 Actual Response',    'system', 61, true,
    ARRAY['admin','superuser','senior_user','user','guest','super_guest']::app_role[],
    ARRAY['admin','superuser','senior_user','user']::app_role[])
ON CONFLICT (field_name) DO NOTHING;
