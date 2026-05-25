
-- 1. ddn_settings: restrict SELECT to senior_user and above
DROP POLICY IF EXISTS "ddn_settings_select" ON public.ddn_settings;
CREATE POLICY "ddn_settings_select_senior_plus"
ON public.ddn_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'senior_user'::public.app_role)
  OR public.has_role(auth.uid(), 'd_superuser'::public.app_role)
  OR public.has_role(auth.uid(), 'superuser'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 2. subcontractor_info_master: restrict SELECT to senior_user and above
DROP POLICY IF EXISTS "info master readable by authenticated" ON public.subcontractor_info_master;
CREATE POLICY "info_master_select_senior_plus"
ON public.subcontractor_info_master
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'senior_user'::public.app_role)
  OR public.has_role(auth.uid(), 'd_superuser'::public.app_role)
  OR public.has_role(auth.uid(), 'superuser'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 3. profiles: restrict SELECT to own profile or senior_user+
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;
CREATE POLICY "Users read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Senior+ can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'senior_user'::public.app_role)
  OR public.has_role(auth.uid(), 'd_superuser'::public.app_role)
  OR public.has_role(auth.uid(), 'superuser'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 4. dmr-uploads storage bucket: add UPDATE policy (own files or admin)
CREATE POLICY "dmr_uploads_update_own_or_admin"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'dmr-uploads'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superuser'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'dmr-uploads'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superuser'::public.app_role)
  )
);
