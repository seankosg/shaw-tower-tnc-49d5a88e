
ALTER TABLE public.import_header_mappings DISABLE TRIGGER trg_protect_system_header_mappings;

UPDATE public.import_header_mappings
SET target_field = 'current_status',
    is_active = true,
    is_system = true,
    note = 'System: row-level Aconex status (redirected from legacy aconex_status)',
    updated_at = now()
WHERE module='docs' AND sub_module='as_built'
  AND header_alias IN ('status','aconex status');

ALTER TABLE public.import_header_mappings ENABLE TRIGGER trg_protect_system_header_mappings;
