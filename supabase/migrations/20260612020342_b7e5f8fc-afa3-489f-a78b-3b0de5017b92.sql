ALTER TABLE public.defect_items
  ADD COLUMN IF NOT EXISTS priority_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hdec_verification_locked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_defect_items_priority_locked
  ON public.defect_items (priority_locked) WHERE priority_locked = true;
CREATE INDEX IF NOT EXISTS idx_defect_items_hdec_verification_locked
  ON public.defect_items (hdec_verification_locked) WHERE hdec_verification_locked = true;