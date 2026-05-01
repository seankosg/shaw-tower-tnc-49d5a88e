-- Deduplicate raw_label first (keep the row with non-null subcontractor_id preferred, then earliest)
WITH ranked AS (
  SELECT id, raw_label,
         ROW_NUMBER() OVER (
           PARTITION BY raw_label
           ORDER BY (subcontractor_id IS NULL), created_at ASC
         ) AS rn
  FROM public.docs_org_alias
)
DELETE FROM public.docs_org_alias
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Add UNIQUE constraint if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'docs_org_alias_raw_label_key'
  ) THEN
    ALTER TABLE public.docs_org_alias
      ADD CONSTRAINT docs_org_alias_raw_label_key UNIQUE (raw_label);
  END IF;
END $$;