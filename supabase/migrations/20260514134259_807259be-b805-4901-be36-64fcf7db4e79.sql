ALTER TABLE public.docs_spare_part ADD COLUMN IF NOT EXISTS item_no integer;

UPDATE public.import_header_mappings
   SET target_field = 'item_no',
       note = 'Row index column from system export — stored as item_no',
       updated_at = now()
 WHERE module='docs' AND sub_module='spare_part' AND header_alias='item no';

UPDATE public.app_settings
   SET value = to_jsonb(COALESCE((value)::text::int, 0) + 1)
 WHERE key = 'header_mappings_version';