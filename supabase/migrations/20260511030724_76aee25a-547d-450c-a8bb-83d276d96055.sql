
ALTER TABLE public.docs_omm
  ADD COLUMN IF NOT EXISTS sub1_planned_date date,
  ADD COLUMN IF NOT EXISTS sub1_actual_date date,
  ADD COLUMN IF NOT EXISTS sub1_response_date date,
  ADD COLUMN IF NOT EXISTS sub1_response_status text,
  ADD COLUMN IF NOT EXISTS sub2_planned_date date,
  ADD COLUMN IF NOT EXISTS sub2_actual_date date,
  ADD COLUMN IF NOT EXISTS sub2_response_planned_date date,
  ADD COLUMN IF NOT EXISTS sub2_response_actual_date date,
  ADD COLUMN IF NOT EXISTS sub2_response_status text,
  ADD COLUMN IF NOT EXISTS sub3_planned_date date,
  ADD COLUMN IF NOT EXISTS sub3_actual_date date,
  ADD COLUMN IF NOT EXISTS sub3_response_planned_date date,
  ADD COLUMN IF NOT EXISTS sub3_response_actual_date date,
  ADD COLUMN IF NOT EXISTS sub3_response_status text;

COMMENT ON COLUMN public.docs_omm.draft_planned_date IS 'DEPRECATED: use sub1_planned_date';
COMMENT ON COLUMN public.docs_omm.draft_actual_date IS 'DEPRECATED: use sub1_actual_date';
COMMENT ON COLUMN public.docs_omm.draft_response_date IS 'DEPRECATED: use sub1_response_date';
COMMENT ON COLUMN public.docs_omm.draft_response_status IS 'DEPRECATED: use sub1_response_status';

UPDATE public.docs_field_config
SET is_enabled = false
WHERE sub_module = 'omm'
  AND field_name IN ('draft_planned_date','draft_actual_date','draft_response_date','draft_response_status');

INSERT INTO public.docs_field_config (sub_module, field_name, display_name, original_header, is_enabled, is_required, sort_order, source_origin)
VALUES
  ('omm','sub1_planned_date','1st Submission Planned','1st Submission Planned',true,false,165,'system'),
  ('omm','sub1_actual_date','1st Submission Actual','1st Submission Actual',true,false,166,'system'),
  ('omm','sub1_response_date','1st Response Date by PQ','1st Response Date by PQ',true,false,167,'system'),
  ('omm','sub1_response_status','1st Response Status','1st Response Status',true,false,168,'system'),
  ('omm','sub2_planned_date','2nd Planned Submission','2nd Planned Submission',true,false,169,'system'),
  ('omm','sub2_actual_date','2nd Actual Submission','2nd Actual submission',true,false,170,'system'),
  ('omm','sub2_response_planned_date','2nd Planned Response','2nd Planned Response',true,false,171,'system'),
  ('omm','sub2_response_actual_date','2nd Actual Response','2nd Actual Response',true,false,172,'system'),
  ('omm','sub2_response_status','2nd Response Status','2nd Response Status',true,false,173,'system'),
  ('omm','sub3_planned_date','3rd Planned Submission','3rd Planned Submission',true,false,174,'system'),
  ('omm','sub3_actual_date','3rd Actual Submission','3rd Actual submission',true,false,175,'system'),
  ('omm','sub3_response_planned_date','3rd Planned Response','3rd Planned Response',true,false,176,'system'),
  ('omm','sub3_response_actual_date','3rd Actual Response','3rd Actual Response',true,false,177,'system'),
  ('omm','sub3_response_status','3rd Response Status','3rd Response Status',true,false,178,'system')
ON CONFLICT DO NOTHING;

INSERT INTO public.import_header_mappings (module, sub_module, header_alias, target_field, is_active, is_system)
VALUES
  ('docs','omm','1st submission planned','sub1_planned_date',true,true),
  ('docs','omm','1st sub planned','sub1_planned_date',true,true),
  ('docs','omm','sub1 planned','sub1_planned_date',true,true),
  ('docs','omm','1st submission actual','sub1_actual_date',true,true),
  ('docs','omm','1st sub actual','sub1_actual_date',true,true),
  ('docs','omm','sub1 actual','sub1_actual_date',true,true),
  ('docs','omm','1st response date by pq','sub1_response_date',true,true),
  ('docs','omm','1st response date','sub1_response_date',true,true),
  ('docs','omm','sub1 response date','sub1_response_date',true,true),
  ('docs','omm','1st response status','sub1_response_status',true,true),
  ('docs','omm','sub1 response status','sub1_response_status',true,true),
  ('docs','omm','2nd planned submission','sub2_planned_date',true,true),
  ('docs','omm','2nd submission planned','sub2_planned_date',true,true),
  ('docs','omm','sub2 planned','sub2_planned_date',true,true),
  ('docs','omm','2nd actual submission','sub2_actual_date',true,true),
  ('docs','omm','2nd submission actual','sub2_actual_date',true,true),
  ('docs','omm','sub2 actual','sub2_actual_date',true,true),
  ('docs','omm','2nd planned response','sub2_response_planned_date',true,true),
  ('docs','omm','2nd response planned','sub2_response_planned_date',true,true),
  ('docs','omm','sub2 response planned','sub2_response_planned_date',true,true),
  ('docs','omm','2nd actual response','sub2_response_actual_date',true,true),
  ('docs','omm','2nd response actual','sub2_response_actual_date',true,true),
  ('docs','omm','sub2 response actual','sub2_response_actual_date',true,true),
  ('docs','omm','2nd response status','sub2_response_status',true,true),
  ('docs','omm','sub2 response status','sub2_response_status',true,true),
  ('docs','omm','3rd planned submission','sub3_planned_date',true,true),
  ('docs','omm','3rd submission planned','sub3_planned_date',true,true),
  ('docs','omm','sub3 planned','sub3_planned_date',true,true),
  ('docs','omm','3rd actual submission','sub3_actual_date',true,true),
  ('docs','omm','3rd submission actual','sub3_actual_date',true,true),
  ('docs','omm','sub3 actual','sub3_actual_date',true,true),
  ('docs','omm','3rd planned response','sub3_response_planned_date',true,true),
  ('docs','omm','3rd response planned','sub3_response_planned_date',true,true),
  ('docs','omm','sub3 response planned','sub3_response_planned_date',true,true),
  ('docs','omm','3rd actual response','sub3_response_actual_date',true,true),
  ('docs','omm','3rd response actual','sub3_response_actual_date',true,true),
  ('docs','omm','sub3 response actual','sub3_response_actual_date',true,true),
  ('docs','omm','3rd response status','sub3_response_status',true,true),
  ('docs','omm','sub3 response status','sub3_response_status',true,true),
  ('docs','omm','stage','skip',true,true)
ON CONFLICT DO NOTHING;
