-- Case-insensitive unique indexes for master tables
CREATE UNIQUE INDEX IF NOT EXISTS subcontractor_master_ci_unique
  ON public.subcontractor_master (
    type,
    lower(name),
    COALESCE(parent_subcontractor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS hdec_pic_master_ci_unique
  ON public.hdec_pic_master (lower(name)) WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS hdec_eng_master_ci_unique
  ON public.hdec_eng_master (lower(name)) WHERE is_active = true;