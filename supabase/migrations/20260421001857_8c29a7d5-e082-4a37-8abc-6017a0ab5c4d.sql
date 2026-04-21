
-- 1. Snapshot table for backup/restore
CREATE TABLE public.database_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_name text NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  snapshot_data jsonb NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  note text
);

ALTER TABLE public.database_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage snapshots" ON public.database_snapshots
  FOR ALL TO authenticated
  USING (is_admin_or_superuser(auth.uid()))
  WITH CHECK (is_admin_or_superuser(auth.uid()));

-- 2. Add data_date to upload_batches
ALTER TABLE public.upload_batches ADD COLUMN data_date date;
