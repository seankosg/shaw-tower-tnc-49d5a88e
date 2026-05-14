CREATE INDEX IF NOT EXISTS idx_defect_items_updated_at_active
  ON public.defect_items (updated_at DESC)
  WHERE is_active = true;