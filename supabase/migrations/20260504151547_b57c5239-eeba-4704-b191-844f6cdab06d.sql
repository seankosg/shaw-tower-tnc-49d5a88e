
-- ============================================================
-- Phase 1 (retry): Docs sub-modules (OMM + Spare Part) tables
-- ============================================================

-- 0. Pre-step: docs_field_config sub_module + composite unique
ALTER TABLE public.docs_field_config
  ADD COLUMN IF NOT EXISTS sub_module text NOT NULL DEFAULT 'as_built';

-- Drop old unique on (field_name) if it exists
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'public.docs_field_config'::regclass
    AND contype = 'u'
    AND conname = 'docs_field_config_field_name_key';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.docs_field_config DROP CONSTRAINT %I', c_name);
  END IF;
END$$;

-- New composite unique
ALTER TABLE public.docs_field_config
  ADD CONSTRAINT docs_field_config_sub_module_field_name_key UNIQUE (sub_module, field_name);

CREATE INDEX IF NOT EXISTS idx_docs_field_config_sub_module ON public.docs_field_config(sub_module);

-- 1. docs_omm table
CREATE TABLE public.docs_omm (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  sn text,
  category text,
  contract_doc text,
  work_trade_material text,
  contractor_supplier text,
  draft_section text,
  draft_target_date date,
  draft_actual_date date,
  submission_target_date date,
  submission_actual_date date,
  approved_date date,
  remarks text,
  softcopy_required text,
  hardcopy_required text,
  hdec_pic_name text,
  hdec_eng_name text,
  subcontractor_name text,
  team team_type,
  trade text,
  data_source_type text,
  source_upload_id uuid,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1,
  row_no integer,
  sheet_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX idx_docs_omm_project ON public.docs_omm(project_id) WHERE is_active = true;
CREATE INDEX idx_docs_omm_category ON public.docs_omm(category) WHERE is_active = true;
CREATE INDEX idx_docs_omm_contractor ON public.docs_omm(contractor_supplier) WHERE is_active = true;
CREATE INDEX idx_docs_omm_upload ON public.docs_omm(source_upload_id);

ALTER TABLE public.docs_omm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read docs omm"
  ON public.docs_omm FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert docs omm"
  ON public.docs_omm FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[]));
CREATE POLICY "Users can update docs omm"
  ON public.docs_omm FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[]));
CREATE POLICY "Admins can delete docs omm"
  ON public.docs_omm FOR DELETE TO authenticated
  USING (is_admin_or_superuser(auth.uid()));

CREATE TRIGGER update_docs_omm_updated_at
  BEFORE UPDATE ON public.docs_omm
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. docs_spare_part table
CREATE TABLE public.docs_spare_part (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  sn text,
  category text,
  parent_item text,
  material text,
  spec_ref text,
  spares_requirements text,
  unit text,
  spares_quantity text,
  storage_area_required text,
  status text,
  remarks text,
  hdec_pic_name text,
  hdec_eng_name text,
  subcontractor_name text,
  team team_type,
  trade text,
  data_source_type text,
  source_upload_id uuid,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1,
  row_no integer,
  sheet_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX idx_docs_spare_part_project ON public.docs_spare_part(project_id) WHERE is_active = true;
CREATE INDEX idx_docs_spare_part_category ON public.docs_spare_part(category) WHERE is_active = true;
CREATE INDEX idx_docs_spare_part_status ON public.docs_spare_part(status) WHERE is_active = true;
CREATE INDEX idx_docs_spare_part_upload ON public.docs_spare_part(source_upload_id);

ALTER TABLE public.docs_spare_part ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read docs spare part"
  ON public.docs_spare_part FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert docs spare part"
  ON public.docs_spare_part FOR INSERT TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[]));
CREATE POLICY "Users can update docs spare part"
  ON public.docs_spare_part FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::app_role[]));
CREATE POLICY "Admins can delete docs spare part"
  ON public.docs_spare_part FOR DELETE TO authenticated
  USING (is_admin_or_superuser(auth.uid()));

CREATE TRIGGER update_docs_spare_part_updated_at
  BEFORE UPDATE ON public.docs_spare_part
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. docs_change_log: add sub_module + record_id
ALTER TABLE public.docs_change_log
  ADD COLUMN IF NOT EXISTS sub_module text NOT NULL DEFAULT 'as_built',
  ADD COLUMN IF NOT EXISTS record_id uuid;

ALTER TABLE public.docs_change_log
  ALTER COLUMN drawing_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_docs_change_log_record ON public.docs_change_log(record_id);
CREATE INDEX IF NOT EXISTS idx_docs_change_log_sub_module ON public.docs_change_log(sub_module);

-- 4. Seed OMM field config
INSERT INTO public.docs_field_config (field_name, display_name, sort_order, is_enabled, is_required, source_origin, sub_module)
VALUES
  ('sn',                       'S/N',                    10, true, false, 'system', 'omm'),
  ('category',                 'Category',               20, true, false, 'system', 'omm'),
  ('contract_doc',             'Contract Doc',           30, true, false, 'system', 'omm'),
  ('work_trade_material',      'Work / Trade / Material',40, true, true,  'system', 'omm'),
  ('contractor_supplier',      'Contractor / Supplier',  50, true, false, 'system', 'omm'),
  ('draft_section',            'Draft Section',          60, true, false, 'system', 'omm'),
  ('draft_target_date',        'Draft Target',           70, true, false, 'system', 'omm'),
  ('draft_actual_date',        'Draft Actual',           80, true, false, 'system', 'omm'),
  ('submission_target_date',   'Submission Target',      90, true, false, 'system', 'omm'),
  ('submission_actual_date',   'Submission Actual',     100, true, false, 'system', 'omm'),
  ('approved_date',            'Approved',              110, true, false, 'system', 'omm'),
  ('remarks',                  'Remarks',               120, true, false, 'system', 'omm'),
  ('softcopy_required',        'Softcopy Required',     130, false,false, 'system', 'omm'),
  ('hardcopy_required',        'Hardcopy Required',     140, false,false, 'system', 'omm'),
  ('hdec_pic_name',            'HDEC PIC',              150, true, false, 'system', 'omm');

-- 5. Seed Spare Part field config
INSERT INTO public.docs_field_config (field_name, display_name, sort_order, is_enabled, is_required, source_origin, sub_module)
VALUES
  ('sn',                       'S/N',                    10, true, false, 'system', 'spare_part'),
  ('category',                 'Category',               20, true, false, 'system', 'spare_part'),
  ('parent_item',              'Parent Item',            30, true, false, 'system', 'spare_part'),
  ('material',                 'Material',               40, true, true,  'system', 'spare_part'),
  ('spec_ref',                 'Spec Ref',               50, true, false, 'system', 'spare_part'),
  ('spares_requirements',      'Spares Requirements',    60, true, false, 'system', 'spare_part'),
  ('unit',                     'Unit',                   70, true, false, 'system', 'spare_part'),
  ('spares_quantity',          'Quantity',               80, true, false, 'system', 'spare_part'),
  ('storage_area_required',    'Storage Area',           90, true, false, 'system', 'spare_part'),
  ('status',                   'Status',                100, true, false, 'system', 'spare_part'),
  ('remarks',                  'Remarks',               110, true, false, 'system', 'spare_part'),
  ('hdec_pic_name',            'HDEC PIC',              120, true, false, 'system', 'spare_part');
