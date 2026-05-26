INSERT INTO public.punch_field_config (field_name, display_name, original_header, sort_order, is_enabled, is_required, source_origin)
VALUES ('progress_icon', 'Progress', 'Progress', 16, true, false, 'system')
ON CONFLICT (field_name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    original_header = EXCLUDED.original_header,
    sort_order = EXCLUDED.sort_order,
    is_enabled = EXCLUDED.is_enabled,
    source_origin = EXCLUDED.source_origin;