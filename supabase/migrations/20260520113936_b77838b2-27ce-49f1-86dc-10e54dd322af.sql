ALTER TABLE public.defect_items ADD COLUMN IF NOT EXISTS captured_by_name TEXT;
CREATE INDEX IF NOT EXISTS idx_defect_items_captured_by_name ON public.defect_items(captured_by_name);

ALTER TABLE public.defect_items DISABLE TRIGGER USER;

UPDATE public.defect_items
SET captured_by_name = NULLIF(TRIM(raw_payload->>'Captured by'), '')
WHERE captured_by_name IS NULL
  AND raw_payload ? 'Captured by';

ALTER TABLE public.defect_items ENABLE TRIGGER USER;

DELETE FROM public.defect_field_config WHERE field_name = 'payload_captured_by';

INSERT INTO public.defect_field_config (field_name, display_name, is_enabled, is_required, sort_order, original_header, source_origin)
SELECT 'captured_by_name', 'Captured By', true, false,
       COALESCE((SELECT sort_order FROM public.defect_field_config WHERE field_name = 'hdec_eng_name'), 200) + 1,
       'Captured by', 'aconex'
WHERE NOT EXISTS (SELECT 1 FROM public.defect_field_config WHERE field_name = 'captured_by_name');