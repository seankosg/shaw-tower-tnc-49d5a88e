INSERT INTO public.subcontractor_master (name, type, is_active)
SELECT 'NEE LEE', 'sub', true
WHERE NOT EXISTS (SELECT 1 FROM public.subcontractor_master WHERE name = 'NEE LEE');