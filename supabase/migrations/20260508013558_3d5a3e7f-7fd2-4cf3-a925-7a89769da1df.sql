ALTER TABLE public.subtests ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.defect_items ADD COLUMN IF NOT EXISTS is_critical BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_subtests_is_critical ON public.subtests(is_critical) WHERE is_critical = true;
CREATE INDEX IF NOT EXISTS idx_defect_items_is_critical ON public.defect_items(is_critical) WHERE is_critical = true;