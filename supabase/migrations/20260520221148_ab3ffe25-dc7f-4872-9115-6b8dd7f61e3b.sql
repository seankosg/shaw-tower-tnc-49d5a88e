
-- R1S / R2S fields for planned_tests section
INSERT INTO public.ddn_fields (section_id, field_key, label_ko, label_en, data_type, unit, required, display_order, width, is_active)
VALUES
  ('planned_tests','planned_tests.r1s_systems','R1S — 시스템·Level','R1S — Systems/Level','text',NULL,false,40,'full',true),
  ('planned_tests','planned_tests.r1s_plan','R1S — 계획 건수','R1S — Planned','number','건',false,41,'third',true),
  ('planned_tests','planned_tests.r1s_actual','R1S — 실적 건수','R1S — Actual','number','건',false,42,'third',true),
  ('planned_tests','planned_tests.r1s_pct','R1S — 달성률','R1S — Achievement','computed','%',false,43,'third',true),
  ('planned_tests','planned_tests.r2s_systems','R2S — 시스템·Level','R2S — Systems/Level','text',NULL,false,50,'full',true),
  ('planned_tests','planned_tests.r2s_plan','R2S — 계획 건수','R2S — Planned','number','건',false,51,'third',true),
  ('planned_tests','planned_tests.r2s_actual','R2S — 실적 건수','R2S — Actual','number','건',false,52,'third',true),
  ('planned_tests','planned_tests.r2s_pct','R2S — 달성률','R2S — Achievement','computed','%',false,53,'third',true)
ON CONFLICT (field_key) DO NOTHING;

-- Shift delayed_items display_order to keep it at the end
UPDATE public.ddn_fields SET display_order = 60 WHERE field_key = 'planned_tests.delayed_items';

-- Mapping rules for R1S / R2S summary lines
INSERT INTO public.ddn_mapping_rules (rule_key, section_id, display_order, condition, template, is_active)
VALUES
  ('pt.r1s_summary','planned_tests', 4,
   '{"op":"gt","field":"planned_tests.r1s_plan","value":0}'::jsonb,
   'R1 report submission for {{planned_tests.r1s_systems}}: {{planned_tests.r1s_actual}}/{{planned_tests.r1s_plan}} submitted ({{computed.planned_tests.r1s_pct}}%).',
   true),
  ('pt.r2s_summary','planned_tests', 5,
   '{"op":"gt","field":"planned_tests.r2s_plan","value":0}'::jsonb,
   'R2 report submission for {{planned_tests.r2s_systems}}: {{planned_tests.r2s_actual}}/{{planned_tests.r2s_plan}} submitted ({{computed.planned_tests.r2s_pct}}%).',
   true)
ON CONFLICT (rule_key) DO NOTHING;
