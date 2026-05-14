DELETE FROM public.import_header_mappings
 WHERE module='docs' AND sub_module='spare_part'
   AND header_alias IN ('item no','s/n outline');

INSERT INTO public.import_header_mappings (module, sub_module, header_alias, target_field, is_system, is_active, note)
VALUES
  ('docs', 'spare_part', 'item no', 'skip', false, true, 'Row index column from system export — always skipped'),
  ('docs', 'spare_part', 's/n outline', 'sn_outline', false, true, 'Round-trip alias for sn_outline');

UPDATE public.app_settings
   SET value = to_jsonb(COALESCE((value)::text::int, 0) + 1)
 WHERE key = 'header_mappings_version';