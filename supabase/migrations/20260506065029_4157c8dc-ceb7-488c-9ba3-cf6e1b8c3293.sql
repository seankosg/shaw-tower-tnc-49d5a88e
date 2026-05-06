DO $$
BEGIN
  -- Disable the responsibility-update guard for this maintenance run
  ALTER TABLE public.defect_items DISABLE TRIGGER USER;
END $$;

UPDATE public.defect_items
   SET closure_status = 'Done', updated_at = now()
 WHERE actual_closure_date IS NOT NULL
   AND (closure_status IS NULL OR closure_status <> 'Done');

UPDATE public.defect_items
   SET closure_status = 'InD', updated_at = now()
 WHERE LOWER(TRIM(status)) = 'in dispute'
   AND actual_closure_date IS NULL
   AND (closure_status IS NULL OR closure_status <> 'InD');

DO $$
BEGIN
  ALTER TABLE public.defect_items ENABLE TRIGGER USER;
END $$;