
-- Add new columns to subtests
ALTER TABLE public.subtests
  ADD COLUMN predecessor_status_raw text,
  ADD COLUMN subcontractor_name text,
  ADD COLUMN hdec_pic_name text;

-- Add field_config entries for the new fields
INSERT INTO public.field_config (field_name, display_name, sort_order, is_enabled, is_required, visible_to_roles, editable_to_roles)
VALUES
  ('predecessor_status_raw', 'Predecessor Status', 50, true, false, '{subcontractor,hdec_engineer,manager,superuser,admin}'::app_role[], '{hdec_engineer,manager,superuser,admin}'::app_role[]),
  ('subcontractor_name', 'Subcontractor', 51, true, false, '{subcontractor,hdec_engineer,manager,superuser,admin}'::app_role[], '{hdec_engineer,manager,superuser,admin}'::app_role[]),
  ('hdec_pic_name', 'HDEC PIC', 52, true, false, '{subcontractor,hdec_engineer,manager,superuser,admin}'::app_role[], '{hdec_engineer,manager,superuser,admin}'::app_role[]);
