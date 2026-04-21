-- Drop the overly permissive self-update policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Re-create with restriction: users can only update their own row,
-- AND cannot change is_active (must remain true) or must_change_password (can only set to false)
CREATE POLICY "Users can update own safe fields" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND is_active = true
  );