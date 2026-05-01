
-- 1. Add sub_module column to import_header_mappings
ALTER TABLE public.import_header_mappings
  ADD COLUMN IF NOT EXISTS sub_module text;

-- 2. Add sub_module column to custom_field_definitions
ALTER TABLE public.custom_field_definitions
  ADD COLUMN IF NOT EXISTS sub_module text;

-- 3. Replace module CHECK constraint to allow 'docs'
ALTER TABLE public.import_header_mappings
  DROP CONSTRAINT IF EXISTS import_header_mappings_module_check;
ALTER TABLE public.import_header_mappings
  ADD CONSTRAINT import_header_mappings_module_check
  CHECK (module = ANY (ARRAY['tnc'::text, 'defect'::text, 'docs'::text]));

ALTER TABLE public.custom_field_definitions
  DROP CONSTRAINT IF EXISTS custom_field_definitions_module_check;
ALTER TABLE public.custom_field_definitions
  ADD CONSTRAINT custom_field_definitions_module_check
  CHECK (module = ANY (ARRAY['tnc'::text, 'defect'::text, 'docs'::text]));

-- 4. Enforce that docs requires sub_module, and tnc/defect must NOT have one
ALTER TABLE public.import_header_mappings
  DROP CONSTRAINT IF EXISTS import_header_mappings_submodule_check;
ALTER TABLE public.import_header_mappings
  ADD CONSTRAINT import_header_mappings_submodule_check
  CHECK (
    (module = 'docs' AND sub_module IS NOT NULL AND sub_module <> '')
    OR (module IN ('tnc','defect') AND sub_module IS NULL)
  );

ALTER TABLE public.custom_field_definitions
  DROP CONSTRAINT IF EXISTS custom_field_definitions_submodule_check;
ALTER TABLE public.custom_field_definitions
  ADD CONSTRAINT custom_field_definitions_submodule_check
  CHECK (
    (module = 'docs' AND sub_module IS NOT NULL AND sub_module <> '')
    OR (module IN ('tnc','defect') AND sub_module IS NULL)
  );

-- 5. Replace unique constraints to include sub_module
ALTER TABLE public.import_header_mappings
  DROP CONSTRAINT IF EXISTS import_header_mappings_unique;
CREATE UNIQUE INDEX IF NOT EXISTS import_header_mappings_unique
  ON public.import_header_mappings (module, COALESCE(sub_module, ''), header_alias);

ALTER TABLE public.custom_field_definitions
  DROP CONSTRAINT IF EXISTS custom_field_definitions_unique;
CREATE UNIQUE INDEX IF NOT EXISTS custom_field_definitions_unique
  ON public.custom_field_definitions (module, COALESCE(sub_module, ''), field_name);

-- 6. Update module+active index to include sub_module
DROP INDEX IF EXISTS public.idx_import_header_mappings_module_active;
CREATE INDEX idx_import_header_mappings_module_active
  ON public.import_header_mappings (module, sub_module, is_active);

-- 7. Update validate_header_mapping_target trigger to be sub_module aware
CREATE OR REPLACE FUNCTION public.validate_header_mapping_target()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
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
      WHERE module = NEW.module
        AND COALESCE(sub_module,'') = COALESCE(NEW.sub_module,'')
        AND field_name = _custom_name
        AND is_active = true
    ) INTO _exists;
    IF NOT _exists THEN
      RAISE EXCEPTION 'Custom field "%/%/%" does not exist or is inactive',
        NEW.module, COALESCE(NEW.sub_module,''), _custom_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
