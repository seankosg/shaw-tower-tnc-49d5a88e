CREATE TABLE public.sc_no_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  defect_id uuid NOT NULL,
  issue_no text NOT NULL,
  old_subcontractor_issue_no text,
  new_subcontractor_issue_no text,
  old_subcontractor_name text,
  new_subcontractor_name text,
  old_owner_code text,
  new_owner_code text,
  reason text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sc_no_history_defect_id_changed_at
  ON public.sc_no_history (defect_id, changed_at DESC);

ALTER TABLE public.sc_no_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sc no history"
ON public.sc_no_history
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert sc no history"
ON public.sc_no_history
FOR INSERT
TO authenticated
WITH CHECK (changed_by = auth.uid() OR public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can update sc no history"
ON public.sc_no_history
FOR UPDATE
TO authenticated
USING (public.is_admin_or_superuser(auth.uid()))
WITH CHECK (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Admins can delete sc no history"
ON public.sc_no_history
FOR DELETE
TO authenticated
USING (public.is_admin_or_superuser(auth.uid()));