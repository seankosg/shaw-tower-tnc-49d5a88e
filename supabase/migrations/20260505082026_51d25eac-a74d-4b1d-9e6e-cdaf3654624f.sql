
-- 1) 누락 필드 추가 (display_name 등은 기본값, is_enabled=true)
INSERT INTO public.docs_field_config
  (sub_module, field_name, display_name, is_enabled, is_required, source_origin, sort_order)
VALUES
  ('omm', 'cycle_progress', 'Progress', true, false, 'system', 5),
  ('omm', 'team',           'Team',     true, false, 'system', 25)
ON CONFLICT DO NOTHING;

-- 2) sort_order 재정렬 (display_name / is_enabled 는 기존값 유지)
UPDATE public.docs_field_config SET sort_order = 5   WHERE sub_module='omm' AND field_name='cycle_progress';
UPDATE public.docs_field_config SET sort_order = 10  WHERE sub_module='omm' AND field_name='sn';
UPDATE public.docs_field_config SET sort_order = 20  WHERE sub_module='omm' AND field_name='category_group';
UPDATE public.docs_field_config SET sort_order = 25  WHERE sub_module='omm' AND field_name='team';
UPDATE public.docs_field_config SET sort_order = 30  WHERE sub_module='omm' AND field_name='category';
UPDATE public.docs_field_config SET sort_order = 40  WHERE sub_module='omm' AND field_name='section';
UPDATE public.docs_field_config SET sort_order = 50  WHERE sub_module='omm' AND field_name='work_trade_material';
UPDATE public.docs_field_config SET sort_order = 60  WHERE sub_module='omm' AND field_name='subcontractor_name';
UPDATE public.docs_field_config SET sort_order = 70  WHERE sub_module='omm' AND field_name='hdec_pic_name';
UPDATE public.docs_field_config SET sort_order = 80  WHERE sub_module='omm' AND field_name='hdec_eng_name';
UPDATE public.docs_field_config SET sort_order = 90  WHERE sub_module='omm' AND field_name='training_required';
UPDATE public.docs_field_config SET sort_order = 100 WHERE sub_module='omm' AND field_name='instruction_date';
UPDATE public.docs_field_config SET sort_order = 110 WHERE sub_module='omm' AND field_name='pdf_required_qty';
UPDATE public.docs_field_config SET sort_order = 120 WHERE sub_module='omm' AND field_name='pdf_actual_qty';
UPDATE public.docs_field_config SET sort_order = 130 WHERE sub_module='omm' AND field_name='hardcopy_required_qty';
UPDATE public.docs_field_config SET sort_order = 140 WHERE sub_module='omm' AND field_name='hardcopy_actual_qty';
UPDATE public.docs_field_config SET sort_order = 150 WHERE sub_module='omm' AND field_name='draft_planned_date';
UPDATE public.docs_field_config SET sort_order = 160 WHERE sub_module='omm' AND field_name='draft_actual_date';
UPDATE public.docs_field_config SET sort_order = 170 WHERE sub_module='omm' AND field_name='draft_response_date';
UPDATE public.docs_field_config SET sort_order = 180 WHERE sub_module='omm' AND field_name='draft_response_status';
UPDATE public.docs_field_config SET sort_order = 190 WHERE sub_module='omm' AND field_name='final_planned_date';
UPDATE public.docs_field_config SET sort_order = 200 WHERE sub_module='omm' AND field_name='final_actual_date';
UPDATE public.docs_field_config SET sort_order = 210 WHERE sub_module='omm' AND field_name='final_response_planned_date';
UPDATE public.docs_field_config SET sort_order = 220 WHERE sub_module='omm' AND field_name='final_response_actual_date';
UPDATE public.docs_field_config SET sort_order = 230 WHERE sub_module='omm' AND field_name='final_response_status';
UPDATE public.docs_field_config SET sort_order = 240 WHERE sub_module='omm' AND field_name='current_stage';
UPDATE public.docs_field_config SET sort_order = 250 WHERE sub_module='omm' AND field_name='current_status';
UPDATE public.docs_field_config SET sort_order = 260 WHERE sub_module='omm' AND field_name='remarks';
