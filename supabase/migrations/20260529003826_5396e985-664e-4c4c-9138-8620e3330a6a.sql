ALTER TABLE public.custom_slides
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.custom_slides
  DROP CONSTRAINT IF EXISTS custom_slides_status_check;
ALTER TABLE public.custom_slides
  ADD CONSTRAINT custom_slides_status_check CHECK (status IN ('draft','active'));

CREATE INDEX IF NOT EXISTS idx_custom_slides_status ON public.custom_slides(status);
CREATE INDEX IF NOT EXISTS idx_custom_slides_created_by_status ON public.custom_slides(created_by, status);