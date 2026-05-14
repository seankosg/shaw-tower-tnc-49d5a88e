
ALTER TABLE public.docs_spare_part
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS floor_level text,
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS specification text,
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS material_lead_time text,
  ADD COLUMN IF NOT EXISTS planned_confirm_date date,
  ADD COLUMN IF NOT EXISTS actual_confirm_date date,
  ADD COLUMN IF NOT EXISTS direction_to_subcon_date date,
  ADD COLUMN IF NOT EXISTS eta_date date,
  ADD COLUMN IF NOT EXISTS planned_po_date date,
  ADD COLUMN IF NOT EXISTS actual_po_date date,
  ADD COLUMN IF NOT EXISTS po_status text,
  ADD COLUMN IF NOT EXISTS planned_delivery_date date,
  ADD COLUMN IF NOT EXISTS actual_delivery_date date;

CREATE INDEX IF NOT EXISTS idx_docs_spare_part_po_status
  ON public.docs_spare_part (po_status) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_docs_spare_part_eta_date
  ON public.docs_spare_part (eta_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_docs_spare_part_actual_po_date
  ON public.docs_spare_part (actual_po_date) WHERE is_active = true;
