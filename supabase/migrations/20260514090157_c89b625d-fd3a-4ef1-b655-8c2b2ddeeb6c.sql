
ALTER TABLE public.docs_spare_part 
  ADD COLUMN IF NOT EXISTS sub_category text,
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS sn_outline text;

CREATE INDEX IF NOT EXISTS idx_docs_spare_part_level ON public.docs_spare_part(level) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_docs_spare_part_subcat ON public.docs_spare_part(sub_category) WHERE is_active = true;

INSERT INTO public.docs_field_config (field_name, display_name, sort_order, is_enabled, is_required, source_origin, sub_module)
VALUES
  ('sn_outline',   'S/N Outline',   12, true, false, 'system', 'spare_part'),
  ('level',        'Level',         15, true, false, 'system', 'spare_part'),
  ('sub_category', 'Sub-category',  35, true, false, 'system', 'spare_part')
ON CONFLICT DO NOTHING;
