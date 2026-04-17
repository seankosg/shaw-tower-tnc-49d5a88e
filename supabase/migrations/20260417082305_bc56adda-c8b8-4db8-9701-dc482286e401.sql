DROP INDEX IF EXISTS public.profiles_subcontractor_unique;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_subcontractor_subsub_unique
ON public.profiles (subcontractor_name, COALESCE(subsub_name, ''))
WHERE user_type = 'subcontractor'::public.user_type AND subcontractor_name IS NOT NULL;