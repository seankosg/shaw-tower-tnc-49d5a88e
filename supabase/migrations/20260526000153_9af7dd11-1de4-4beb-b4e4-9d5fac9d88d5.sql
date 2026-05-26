
-- 1) Restrict punch_items UPDATE/DELETE policies to authenticated role
DROP POLICY IF EXISTS "Privileged can delete punch" ON public.punch_items;
CREATE POLICY "Privileged can delete punch"
ON public.punch_items
FOR DELETE
TO authenticated
USING (
  can_write_for_team(auth.uid(), team)
  OR ((created_by IS NOT NULL) AND (created_by = auth.uid()))
);

DROP POLICY IF EXISTS "Privileged can update punch" ON public.punch_items;
CREATE POLICY "Privileged can update punch"
ON public.punch_items
FOR UPDATE
TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superuser'::app_role, 'senior_user'::app_role, 'user'::app_role])
  OR (has_role(auth.uid(), 'd_superuser'::app_role) AND user_team_matches(auth.uid(), team))
  OR ((created_by IS NOT NULL) AND (created_by = auth.uid()))
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'superuser'::app_role, 'senior_user'::app_role, 'user'::app_role])
  OR (has_role(auth.uid(), 'd_superuser'::app_role) AND user_team_matches(auth.uid(), team))
  OR ((created_by IS NOT NULL) AND (created_by = auth.uid()))
);

-- 2) Pin search_path on the two trigger functions missing it
ALTER FUNCTION public.punch_auto_demote_trigger() SET search_path = public;
ALTER FUNCTION public.punch_rollup_trigger() SET search_path = public;

-- 3) Revoke anon execute on SECURITY DEFINER helper functions added for summary date recomputation
REVOKE EXECUTE ON FUNCTION public.punch_recompute_summary_dates(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_punch_summary_dates_fn() FROM anon, PUBLIC;
