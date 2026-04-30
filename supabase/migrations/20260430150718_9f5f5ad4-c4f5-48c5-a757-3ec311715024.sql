-- ============================================================
-- Custom Field Definitions: admin-managed user-defined fields
-- mapped from Excel headers and stored in JSONB payloads.
-- ============================================================

-- 1) custom_payload column on subtests (defect already has raw_payload)
ALTER TABLE public.subtests
  ADD COLUMN IF NOT EXISTS custom_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.defect_items
  ADD COLUMN IF NOT EXISTS custom_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) custom_field_definitions table
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL CHECK (module IN ('tnc','defect')),
  field_name text NOT NULL,
  display_name text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('text','number','date','boolean')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_field_definitions_unique UNIQUE (module, field_name)
);

ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read custom field definitions" ON public.custom_field_definitions;
CREATE POLICY "Anyone can read custom field definitions"
  ON public.custom_field_definitions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage custom field definitions" ON public.custom_field_definitions;
CREATE POLICY "Admins can manage custom field definitions"
  ON public.custom_field_definitions FOR ALL
  TO authenticated
  USING (is_admin_or_superuser(auth.uid()))
  WITH CHECK (is_admin_or_superuser(auth.uid()));

-- 3) Reserved field names (system fields that custom fields must not collide with)
CREATE OR REPLACE FUNCTION public.is_reserved_custom_field(_module text, _field_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _field_name = ANY (
    CASE _module
      WHEN 'tnc' THEN ARRAY[
        'id','project_id','system_id','test_id','item_no','mos_code','mos_sequence','subtest_id',
        'team','level','equipment','description',
        't1_planned_date','t1_actual_date','t1_status',
        't2_planned_date','t2_actual_date','t2_status',
        'pred_planned_date','pred_actual_date','pred_status','predecessor_status_raw',
        'r1_status','r1_report_ref','r1_target_submission_date','r1_actual_submission_date',
        'r2_status','r2_target_submission_date','r2_actual_submission_date',
        'r2_target_approval_date','r2_actual_approval_date',
        'aconex_ref_no','remarks','punchlist_comments',
        'subcontractor_name','subsub_name','hdec_pic_name',
        'data_source_type','source_upload_id','is_active','row_version','updated_at','updated_by',
        'custom_payload','source','system'
      ]
      WHEN 'defect' THEN ARRAY[
        'id','project_id','issue_no','subcontractor_issue_no','subcontractor_issue_source',
        'main_trade','sub_trade','trade_detail','area_raw','area_type','area_level','area_location',
        'description','defect_type','status','priority','team',
        'subcontractor_name','subsub_name','hdec_pic_name','hdec_eng_name',
        'planned_start_date','planned_completion_date','planned_closure_date',
        'actual_start_date','actual_completion_date','actual_closure_date',
        'planned_progress_pct','actual_progress_pct','completion_status','closure_status',
        'remarks','hdec_comments','aconex_comments','work_type',
        'raw_payload','custom_payload','data_source_type','source_upload_id',
        'classification_source','classified_at','is_active','row_version','updated_at','updated_by'
      ]
      ELSE ARRAY[]::text[]
    END
  );
$$;

-- 4) Validation trigger for custom_field_definitions
CREATE OR REPLACE FUNCTION public.validate_custom_field_definition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_data boolean;
BEGIN
  -- field_name format: snake_case lowercase, must start with letter
  IF NEW.field_name !~ '^[a-z][a-z0-9_]{0,49}$' THEN
    RAISE EXCEPTION 'Invalid field_name "%": must be lowercase snake_case starting with a letter (a-z, 0-9, _)', NEW.field_name;
  END IF;

  -- block reserved names
  IF public.is_reserved_custom_field(NEW.module, NEW.field_name) THEN
    RAISE EXCEPTION 'Field name "%" is reserved by the system for module %', NEW.field_name, NEW.module;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.field_name <> OLD.field_name THEN
      RAISE EXCEPTION 'field_name is immutable (was "%", got "%")', OLD.field_name, NEW.field_name;
    END IF;
    IF NEW.module <> OLD.module THEN
      RAISE EXCEPTION 'module is immutable (was "%", got "%")', OLD.module, NEW.module;
    END IF;
    -- block data_type change when payload data already exists
    IF NEW.data_type <> OLD.data_type THEN
      IF NEW.module = 'tnc' THEN
        SELECT EXISTS (
          SELECT 1 FROM public.subtests
          WHERE custom_payload ? OLD.field_name
          LIMIT 1
        ) INTO _has_data;
      ELSE
        SELECT EXISTS (
          SELECT 1 FROM public.defect_items
          WHERE custom_payload ? OLD.field_name
          LIMIT 1
        ) INTO _has_data;
      END IF;
      IF _has_data THEN
        RAISE EXCEPTION 'Cannot change data_type of "%": existing data found. Disable the field instead.', OLD.field_name;
      END IF;
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_custom_field_definition ON public.custom_field_definitions;
CREATE TRIGGER trg_validate_custom_field_definition
  BEFORE INSERT OR UPDATE ON public.custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.validate_custom_field_definition();

-- 5) Block delete when data exists (only allow disabling)
CREATE OR REPLACE FUNCTION public.guard_custom_field_definition_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_data boolean;
BEGIN
  IF OLD.module = 'tnc' THEN
    SELECT EXISTS (SELECT 1 FROM public.subtests WHERE custom_payload ? OLD.field_name LIMIT 1) INTO _has_data;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.defect_items WHERE custom_payload ? OLD.field_name LIMIT 1) INTO _has_data;
  END IF;
  IF _has_data THEN
    RAISE EXCEPTION 'Cannot delete custom field "%": data exists. Disable it instead.', OLD.field_name;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_custom_field_definition_delete ON public.custom_field_definitions;
CREATE TRIGGER trg_guard_custom_field_definition_delete
  BEFORE DELETE ON public.custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.guard_custom_field_definition_delete();

-- 6) Bump custom_fields_version in app_settings on any change
CREATE OR REPLACE FUNCTION public.bump_custom_fields_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current bigint;
BEGIN
  SELECT COALESCE((value)::text::bigint, 0) INTO _current
    FROM public.app_settings WHERE key = 'custom_fields_version';
  INSERT INTO public.app_settings (key, value, updated_by, updated_at)
  VALUES ('custom_fields_version', to_jsonb(COALESCE(_current,0) + 1), auth.uid(), now())
  ON CONFLICT (key) DO UPDATE
    SET value = to_jsonb(COALESCE(_current,0) + 1),
        updated_by = auth.uid(),
        updated_at = now();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_custom_fields_version ON public.custom_field_definitions;
CREATE TRIGGER trg_bump_custom_fields_version
  AFTER INSERT OR UPDATE OR DELETE ON public.custom_field_definitions
  FOR EACH STATEMENT EXECUTE FUNCTION public.bump_custom_fields_version();

-- 7) Validate import_header_mappings target_field references for custom: prefix
CREATE OR REPLACE FUNCTION public.validate_header_mapping_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _custom_name text;
  _exists boolean;
BEGIN
  IF NEW.target_field LIKE 'custom:%' THEN
    _custom_name := substring(NEW.target_field FROM 8);
    IF _custom_name IS NULL OR _custom_name = '' THEN
      RAISE EXCEPTION 'Invalid custom mapping target: empty field name';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.custom_field_definitions
      WHERE module = NEW.module AND field_name = _custom_name AND is_active = true
    ) INTO _exists;
    IF NOT _exists THEN
      RAISE EXCEPTION 'Custom field "%:%" does not exist or is inactive', NEW.module, _custom_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_header_mapping_target ON public.import_header_mappings;
CREATE TRIGGER trg_validate_header_mapping_target
  BEFORE INSERT OR UPDATE ON public.import_header_mappings
  FOR EACH ROW EXECUTE FUNCTION public.validate_header_mapping_target();

-- 8) Seed initial version row if missing
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('custom_fields_version', to_jsonb(0), now())
ON CONFLICT (key) DO NOTHING;