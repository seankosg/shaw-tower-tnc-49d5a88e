-- 1. Add new column for Aconex-origin comments
ALTER TABLE public.defect_items ADD COLUMN IF NOT EXISTS aconex_comments text;

-- 2. Register field config (placed just before HDEC Comments at sort_order 325)
INSERT INTO public.defect_field_config (field_name, display_name, source_origin, sort_order, is_enabled, is_required)
VALUES ('aconex_comments', 'Aconex Comments', 'aconex', 325, false, false)
ON CONFLICT DO NOTHING;

-- 3. Backfill historical data from raw_payload
-- 3a. HDEC Comments variants -> hdec_comments (safety net)
UPDATE public.defect_items di
SET hdec_comments = COALESCE(NULLIF(di.hdec_comments, ''), s.v)
FROM (
  SELECT d.id, kv.value AS v
  FROM public.defect_items d, jsonb_each_text(d.raw_payload) kv
  WHERE lower(kv.key) IN ('hdec comments', 'hdec_comments')
    AND kv.value IS NOT NULL AND kv.value <> ''
) s
WHERE di.id = s.id;

-- 3b. Plain "Comments" -> aconex_comments (only when not already set)
UPDATE public.defect_items di
SET aconex_comments = s.v
FROM (
  SELECT d.id, kv.value AS v
  FROM public.defect_items d, jsonb_each_text(d.raw_payload) kv
  WHERE lower(kv.key) = 'comments'
    AND kv.value IS NOT NULL AND kv.value <> ''
) s
WHERE di.id = s.id
  AND (di.aconex_comments IS NULL OR di.aconex_comments = '');