
-- 1. Schema
ALTER TABLE public.docs_drawings
  ADD COLUMN IF NOT EXISTS sub1_actual_response_date date,
  ADD COLUMN IF NOT EXISTS sub2_actual_response_date date,
  ADD COLUMN IF NOT EXISTS sub3_actual_response_date date,
  ADD COLUMN IF NOT EXISTS subcontractor_name text;

-- 2. Wipe
TRUNCATE TABLE public.docs_change_log RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.docs_upload_row_logs RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.docs_drawings RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.docs_upload_batches RESTART IDENTITY CASCADE;

-- 3. App settings
INSERT INTO public.app_settings (key, value)
VALUES ('docs_standard_response_lead_days', '7'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 4. Field config seeds (use empty role arrays to match existing default-visible pattern)
INSERT INTO public.docs_field_config
  (field_name, display_name, source_origin, sort_order, is_enabled, visible_to_roles, editable_to_roles)
VALUES
  ('subcontractor_name', 'Subcontractor', 'system', 30, true, '{}'::app_role[], '{}'::app_role[]),
  ('sub1_actual_response_date', 'Cycle 1 Actual Response', 'system', 110, true, '{}'::app_role[], '{}'::app_role[]),
  ('sub2_actual_response_date', 'Cycle 2 Actual Response', 'system', 120, true, '{}'::app_role[], '{}'::app_role[]),
  ('sub3_actual_response_date', 'Cycle 3 Actual Response', 'system', 130, true, '{}'::app_role[], '{}'::app_role[])
ON CONFLICT (field_name) DO NOTHING;

UPDATE public.docs_field_config SET display_name = 'Cycle 1 Planned Response' WHERE field_name = 'sub1_approval_date';
UPDATE public.docs_field_config SET display_name = 'Cycle 2 Planned Response' WHERE field_name = 'sub2_approval_date';
UPDATE public.docs_field_config SET display_name = 'Cycle 3 Planned Response' WHERE field_name = 'sub3_approval_date';
UPDATE public.docs_field_config SET display_name = 'Cycle 1 Status (A/B/C)' WHERE field_name = 'sub1_approval_status';
UPDATE public.docs_field_config SET display_name = 'Cycle 2 Status (A/B/C)' WHERE field_name = 'sub2_approval_status';
UPDATE public.docs_field_config SET display_name = 'Cycle 3 Status (A/B/C)' WHERE field_name = 'sub3_approval_status';

-- 5. Header mapping seeds
INSERT INTO public.import_header_mappings (module, sub_module, header_alias, target_field, is_system, is_active)
VALUES
  ('docs', 'as_built', 'sub-contractor', 'subcontractor_name', true, true),
  ('docs', 'as_built', 'sub contractor', 'subcontractor_name', true, true),
  ('docs', 'as_built', 'subcontractor name', 'subcontractor_name', true, true)
ON CONFLICT DO NOTHING;
