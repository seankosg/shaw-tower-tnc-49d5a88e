
ALTER TABLE public.database_snapshots ADD COLUMN snapshot_type text NOT NULL DEFAULT 'manual';
