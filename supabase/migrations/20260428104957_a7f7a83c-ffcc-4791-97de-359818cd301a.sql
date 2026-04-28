ALTER TABLE public.defect_items DISABLE TRIGGER USER;

UPDATE public.defect_items
SET is_active = true,
    updated_at = now()
WHERE issue_no IN ('986','1111','1749','1758','1848','1858','1859')
  AND is_active = false;

ALTER TABLE public.defect_items ENABLE TRIGGER USER;