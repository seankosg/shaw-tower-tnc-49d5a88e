
-- DMR (Daily Manpower Report) entries
CREATE TABLE public.dmr_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL,
  team TEXT NOT NULL CHECK (team IN ('Arch','Mech','Elec')),
  trade TEXT,
  subcontractor TEXT NOT NULL,
  workplace TEXT NOT NULL CHECK (workplace IN ('T&C','Defect','Post TOP')),
  manpower INTEGER NOT NULL DEFAULT 0,
  source_image_path TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_date, subcontractor, workplace)
);

CREATE INDEX idx_dmr_entries_date ON public.dmr_entries (report_date DESC);
CREATE INDEX idx_dmr_entries_team ON public.dmr_entries (team);
CREATE INDEX idx_dmr_entries_sub ON public.dmr_entries (subcontractor);

ALTER TABLE public.dmr_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dmr_entries_select_auth"
  ON public.dmr_entries FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "dmr_entries_insert_user"
  ON public.dmr_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'user')
    OR public.has_role(auth.uid(), 'senior_user')
    OR public.has_role(auth.uid(), 'd_superuser')
    OR public.has_role(auth.uid(), 'superuser')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "dmr_entries_update_user"
  ON public.dmr_entries FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'user')
    OR public.has_role(auth.uid(), 'senior_user')
    OR public.has_role(auth.uid(), 'd_superuser')
    OR public.has_role(auth.uid(), 'superuser')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "dmr_entries_delete_senior"
  ON public.dmr_entries FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'senior_user')
    OR public.has_role(auth.uid(), 'd_superuser')
    OR public.has_role(auth.uid(), 'superuser')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER update_dmr_entries_updated_at
  BEFORE UPDATE ON public.dmr_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for source images
INSERT INTO storage.buckets (id, name, public)
VALUES ('dmr-uploads', 'dmr-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "dmr_uploads_select_own_or_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dmr-uploads'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'superuser')
    )
  );

CREATE POLICY "dmr_uploads_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dmr-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "dmr_uploads_delete_own_or_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'dmr-uploads'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );
