
-- Seed docs_field_config rows for Warranty sub-module.
-- Idempotent via ON CONFLICT on (sub_module, field_name).

-- Add unique constraint if not present (matches OMM/ABD pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'docs_field_config'
      AND indexname = 'docs_field_config_submodule_field_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.docs_field_config
        ADD CONSTRAINT docs_field_config_submodule_field_unique
        UNIQUE (sub_module, field_name);
    EXCEPTION WHEN duplicate_object THEN
      -- already exists under another name
      NULL;
    END;
  END IF;
END $$;

INSERT INTO public.docs_field_config
  (sub_module, field_name, display_name, sort_order, is_enabled, is_required, source_origin)
VALUES
  ('warranty', 'item_no',                       'No',                       10,  true,  true,  'system'),
  ('warranty', 'category',                      'Category',                 20,  true,  false, 'system'),
  ('warranty', 'warranted_item',                'Warranted Item',           30,  true,  false, 'system'),
  ('warranty', 'team',                          'Team',                     40,  true,  false, 'system'),
  ('warranty', 'subcontractor_name',            'Subcontractor',            50,  true,  false, 'system'),
  ('warranty', 'hdec_pic_name',                 'HDEC PIC',                 60,  true,  false, 'system'),
  ('warranty', 'hdec_eng_name',                 'HDEC ENG',                 70,  true,  false, 'system'),
  ('warranty', 'warranty_period_years',         'Warranty Years',           80,  true,  false, 'system'),
  ('warranty', 'contract_spec_ref',             'Contract Spec Ref',        90,  false, false, 'system'),
  ('warranty', 'cycle_progress',                'Progress',                 100, true,  false, 'system'),
  ('warranty', 'r_subcontract_date',            'Subcontract Date',         110, true,  false, 'system'),
  ('warranty', 'r_works_description',           'Works Description',        120, false, false, 'system'),
  ('warranty', 'r_acra_reg_no',                 'ACRA Reg No',              130, false, false, 'system'),
  ('warranty', 'r_acra_address',                'ACRA Address',             140, false, false, 'system'),
  ('warranty', 'r_brief_description',           'Brief Description',        150, false, false, 'system'),
  ('warranty', 'r_director_1',                  'Director 1',               160, false, false, 'system'),
  ('warranty', 'r_director_2',                  'Director 2',               170, false, false, 'system'),
  ('warranty', 'r_witness',                     'Witness',                  180, false, false, 'system'),
  ('warranty', 'acra_info_status',              'ACRA Info Status',         190, false, false, 'system'),
  ('warranty', 'draft_planned_date',            'Draft Planned',            200, true,  false, 'system'),
  ('warranty', 'draft_actual_date',             'Draft Actual',             210, true,  false, 'system'),
  ('warranty', 'draft_response_planned_date',   'Draft Resp Planned',       220, false, false, 'system'),
  ('warranty', 'draft_response_actual_date',    'Draft Resp Actual',        230, false, false, 'system'),
  ('warranty', 'draft_status',                  'Draft Status',             240, true,  false, 'system'),
  ('warranty', 'subcon_signing_planned_date',   'Subcon Sign Planned',      250, true,  false, 'system'),
  ('warranty', 'subcon_signing_actual_date',    'Subcon Sign Actual',       260, true,  false, 'system'),
  ('warranty', 'subcon_signing_status',         'Subcon Sign Status',       270, true,  false, 'system'),
  ('warranty', 'hdec_signing_planned_date',     'HDEC Sign Planned',        280, true,  false, 'system'),
  ('warranty', 'hdec_signing_actual_date',      'HDEC Sign Actual',         290, true,  false, 'system'),
  ('warranty', 'hdec_signing_status',           'HDEC Sign Status',         300, true,  false, 'system'),
  ('warranty', 'final_planned_date',            'Final Planned',            310, true,  false, 'system'),
  ('warranty', 'final_actual_date',             'Final Actual',             320, true,  false, 'system'),
  ('warranty', 'final_status',                  'Final Status',             330, true,  false, 'system'),
  ('warranty', 'current_stage',                 'Stage',                    340, true,  false, 'system'),
  ('warranty', 'current_status',                'Status',                   350, true,  false, 'system'),
  ('warranty', 'remarks',                       'Remarks',                  360, true,  false, 'system')
ON CONFLICT (sub_module, field_name) DO NOTHING;
