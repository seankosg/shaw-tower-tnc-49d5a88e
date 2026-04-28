ALTER TABLE public.schedule_change_audit
  ADD COLUMN IF NOT EXISTS r1_old_date date,
  ADD COLUMN IF NOT EXISTS r1_new_date date,
  ADD COLUMN IF NOT EXISTS r1_diff_days integer,
  ADD COLUMN IF NOT EXISTS r1_prev_gap_days integer,
  ADD COLUMN IF NOT EXISTS r1_cur_gap_days integer,
  ADD COLUMN IF NOT EXISTS r2s_old_date date,
  ADD COLUMN IF NOT EXISTS r2s_new_date date,
  ADD COLUMN IF NOT EXISTS r2s_diff_days integer,
  ADD COLUMN IF NOT EXISTS r2s_prev_gap_days integer;