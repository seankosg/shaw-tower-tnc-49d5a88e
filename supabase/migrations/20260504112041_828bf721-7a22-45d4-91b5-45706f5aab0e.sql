
ALTER TABLE public.docs_drawings ADD COLUMN IF NOT EXISTS trade text;

UPDATE public.docs_drawings
SET trade = CASE
  WHEN sheet_name IS NULL OR btrim(sheet_name) = '' THEN NULL
  WHEN upper(sheet_name) ~ 'FIRE|FP-|FP_' THEN 'Fire Protection'
  WHEN upper(sheet_name) ~ 'HVAC|AIR-COND|AC-|VENT' THEN 'HVAC'
  WHEN upper(sheet_name) ~ 'MECH|MEC-|MEC_|ME-|ME_' THEN 'Mechanical'
  WHEN upper(sheet_name) ~ 'ELEC|ELE-|ELE_|EL-|EL_|POWER|LIGHTING' THEN 'Electrical'
  WHEN upper(sheet_name) ~ 'PLUMB|PLU-|PLU_|WATER|DRAIN|SANIT' THEN 'Plumbing'
  WHEN upper(sheet_name) ~ 'STRUCT|STR-|STR_|STEEL|CONC-|REBAR' THEN 'Structure'
  WHEN upper(sheet_name) ~ 'ARCH|ARC-|ARC_|AR-|AR_' THEN 'Architecture'
  WHEN upper(sheet_name) ~ 'CIVIL|CIV-|CIV_' THEN 'Civil'
  WHEN upper(sheet_name) ~ 'LAND|LSC-|LSC_' THEN 'Landscape'
  WHEN upper(sheet_name) ~ 'INT-|INT_|INTERIOR|FFE' THEN 'Interior'
  ELSE 'Other'
END
WHERE trade IS NULL;

INSERT INTO public.docs_field_config (field_name, display_name, source_origin, sort_order, is_required, is_enabled, visible_to_roles, editable_to_roles, original_header)
SELECT 'trade', 'Trade', 'system', 5, false, true, '{}'::app_role[], '{}'::app_role[], 'Trade'
WHERE NOT EXISTS (SELECT 1 FROM public.docs_field_config WHERE field_name = 'trade');

INSERT INTO public.import_header_mappings (module, sub_module, header_alias, target_field, is_active, is_system, note)
SELECT 'docs', 'as_built', alias, 'trade', true, false, 'Auto-added for trade column'
FROM (VALUES ('trade'), ('work category'), ('category'), ('discipline category'), ('trade category')) AS t(alias)
WHERE NOT EXISTS (
  SELECT 1 FROM public.import_header_mappings m
  WHERE m.module = 'docs' AND m.sub_module = 'as_built'
    AND lower(m.header_alias) = lower(t.alias) AND m.target_field = 'trade'
);

INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('header_mappings_version', to_jsonb(extract(epoch from now())::bigint), now())
ON CONFLICT (key) DO UPDATE SET
  value = to_jsonb(extract(epoch from now())::bigint),
  updated_at = now();
