CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_admin_or_superuser(auth.uid()))
WITH CHECK (is_admin_or_superuser(auth.uid()));