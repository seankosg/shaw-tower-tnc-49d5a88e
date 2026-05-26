
DROP POLICY IF EXISTS "Anyone can read subcontractor master" ON public.subcontractor_master;

CREATE POLICY "Senior and above can read subcontractor master"
ON public.subcontractor_master
FOR SELECT
TO authenticated
USING (public.is_senior_or_above(auth.uid()));
