CREATE TABLE IF NOT EXISTS public.defect_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  issue_no text NOT NULL,
  subcontractor_issue_no text,
  subcontractor_issue_source text,
  main_trade text,
  sub_trade text,
  trade_detail text,
  area_raw text,
  area_type text,
  area_level text,
  area_location text,
  description text,
  defect_type text,
  status text,
  priority text,
  team public.team_type,
  subcontractor_name text,
  subsub_name text,
  hdec_pic_name text,
  planned_date date,
  target_date date,
  actual_progress_pct numeric,
  closed_date date,
  closure_status text,
  remarks text,
  hdec_comments text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_upload_id uuid,
  data_source_type text,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  row_version integer NOT NULL DEFAULT 1,
  CONSTRAINT defect_items_issue_no_key UNIQUE (issue_no)
);

CREATE TABLE IF NOT EXISTS public.defect_field_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name text NOT NULL UNIQUE,
  original_header text,
  display_name text NOT NULL,
  source_origin text NOT NULL DEFAULT 'system',
  is_enabled boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  visible_to_roles public.app_role[] DEFAULT '{}'::public.app_role[],
  editable_to_roles public.app_role[] DEFAULT '{}'::public.app_role[]
);

CREATE TABLE IF NOT EXISTS public.defect_upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  uploaded_file_name text NOT NULL,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  status public.upload_status NOT NULL DEFAULT 'pending',
  data_date date,
  total_rows integer DEFAULT 0,
  processed_rows integer DEFAULT 0,
  success_rows integer DEFAULT 0,
  skipped_rows integer DEFAULT 0,
  rejected_rows integer DEFAULT 0,
  note text
);

CREATE TABLE IF NOT EXISTS public.defect_upload_row_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL,
  raw_row_no integer,
  issue_no text,
  action_taken public.action_taken,
  reason_code text,
  reason_detail text,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.defect_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defect_id uuid NOT NULL,
  changed_field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_source text,
  upload_id uuid
);

CREATE TABLE IF NOT EXISTS public.defect_daily_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  defect_id uuid NOT NULL,
  issue_no text NOT NULL,
  planned_date date,
  actual_progress_pct numeric,
  closure_status text,
  closed_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.defect_schedule_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid,
  defect_id uuid NOT NULL,
  project_id uuid,
  issue_no text NOT NULL,
  subcontractor_issue_no text,
  raw_row_no integer,
  planned_old_date date,
  planned_new_date date,
  planned_diff_days integer,
  target_old_date date,
  target_new_date date,
  target_diff_days integer,
  closed_old_date date,
  closed_new_date date,
  closed_diff_days integer,
  progress_old_pct numeric,
  progress_new_pct numeric,
  progress_diff_pct numeric,
  closure_status_old text,
  closure_status_new text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  change_source text
);

CREATE INDEX IF NOT EXISTS idx_defect_items_issue_no ON public.defect_items(issue_no);
CREATE INDEX IF NOT EXISTS idx_defect_items_area ON public.defect_items(area_type, area_level, area_location);
CREATE INDEX IF NOT EXISTS idx_defect_items_team ON public.defect_items(team);
CREATE INDEX IF NOT EXISTS idx_defect_schedule_change_audit_created_at ON public.defect_schedule_change_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_defect_schedule_change_audit_defect_id ON public.defect_schedule_change_audit(defect_id);

CREATE OR REPLACE FUNCTION public.get_defect_edit_scope(_user_id uuid, _defect_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d record;
  prof record;
BEGIN
  IF _user_id IS NULL OR _defect_id IS NULL THEN
    RETURN 'none';
  END IF;

  SELECT subcontractor_name, subsub_name, hdec_pic_name, team
  INTO d
  FROM public.defect_items
  WHERE id = _defect_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'none';
  END IF;

  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN 'full';
  END IF;

  SELECT user_type, subcontractor_name, subsub_name, hdec_pic_name, team
  INTO prof
  FROM public.profiles
  WHERE user_id = _user_id AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'none';
  END IF;

  IF public.has_role(_user_id, 'senior_user'::public.app_role)
    AND d.team IS NOT NULL
    AND prof.team IS NOT NULL
    AND d.team = prof.team THEN
    RETURN 'team';
  END IF;

  IF prof.user_type = 'hdec'
    AND prof.hdec_pic_name IS NOT NULL
    AND trim(prof.hdec_pic_name) <> ''
    AND lower(trim(coalesce(d.hdec_pic_name, ''))) = lower(trim(prof.hdec_pic_name)) THEN
    RETURN 'assigned';
  END IF;

  IF prof.user_type = 'subcontractor'
    AND prof.subcontractor_name IS NOT NULL
    AND trim(prof.subcontractor_name) <> ''
    AND lower(trim(coalesce(d.subcontractor_name, ''))) = lower(trim(prof.subcontractor_name)) THEN
    RETURN 'assigned';
  END IF;

  IF prof.user_type = 'subsub'
    AND prof.subsub_name IS NOT NULL
    AND trim(prof.subsub_name) <> ''
    AND lower(trim(coalesce(d.subsub_name, ''))) = lower(trim(prof.subsub_name)) THEN
    RETURN 'assigned';
  END IF;

  RETURN 'none';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_update_defect(_user_id uuid, _defect_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.get_defect_edit_scope(_user_id, _defect_id) IN ('assigned', 'team', 'full')
$$;

CREATE OR REPLACE FUNCTION public.validate_defect_responsibility_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  scope text;
BEGIN
  scope := public.get_defect_edit_scope(auth.uid(), OLD.id);

  IF scope = 'assigned' AND (
    OLD.subcontractor_name IS DISTINCT FROM NEW.subcontractor_name OR
    OLD.subsub_name IS DISTINCT FROM NEW.subsub_name OR
    OLD.hdec_pic_name IS DISTINCT FROM NEW.hdec_pic_name
  ) THEN
    RAISE EXCEPTION 'You do not have permission to change responsibility fields.';
  END IF;

  IF scope = 'none' AND NOT public.is_admin_or_superuser(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to update this defect item.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER update_defect_items_updated_at
BEFORE UPDATE ON public.defect_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER validate_defect_responsibility_update
BEFORE UPDATE ON public.defect_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_defect_responsibility_update();

ALTER TABLE public.defect_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_field_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_upload_row_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_daily_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defect_schedule_change_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read defects" ON public.defect_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and senior users can insert defects" ON public.defect_items FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::public.app_role[]));
CREATE POLICY "Users can update permitted defects" ON public.defect_items FOR UPDATE TO authenticated USING (public.can_update_defect(auth.uid(), id) OR public.has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::public.app_role[])) WITH CHECK (public.can_update_defect(auth.uid(), id) OR public.has_any_role(auth.uid(), ARRAY['admin','superuser','senior_user','user']::public.app_role[]));
CREATE POLICY "Admins can delete defects" ON public.defect_items FOR DELETE TO authenticated USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read defect field config" ON public.defect_field_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage defect field config" ON public.defect_field_config FOR ALL TO authenticated USING (public.is_admin_or_superuser(auth.uid())) WITH CHECK (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read defect uploads" ON public.defect_upload_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert defect uploads" ON public.defect_upload_batches FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "Upload owners can update defect uploads" ON public.defect_upload_batches FOR UPDATE TO authenticated USING (uploaded_by = auth.uid() OR public.is_admin_or_superuser(auth.uid())) WITH CHECK (uploaded_by = auth.uid() OR public.is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can delete defect uploads" ON public.defect_upload_batches FOR DELETE TO authenticated USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read defect upload logs" ON public.defect_upload_row_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Upload owners can insert defect upload logs" ON public.defect_upload_row_logs FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.defect_upload_batches b WHERE b.id = upload_id AND b.uploaded_by = auth.uid()) OR public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read defect change logs" ON public.defect_change_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert defect change logs" ON public.defect_change_log FOR INSERT TO authenticated WITH CHECK (changed_by = auth.uid() OR public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read defect daily snapshots" ON public.defect_daily_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert defect daily snapshots" ON public.defect_daily_snapshots FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() OR public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read defect schedule audit" ON public.defect_schedule_change_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert defect schedule audit" ON public.defect_schedule_change_audit FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() OR public.is_admin_or_superuser(auth.uid()));

INSERT INTO public.defect_field_config (field_name, original_header, display_name, source_origin, sort_order)
VALUES
  ('issue_no', 'Issue No', 'Issue No', 'system', 10),
  ('subcontractor_issue_no', 'Subcontractor Issue No', 'Subcontractor Issue No', 'system', 20),
  ('area_type', 'Area', 'Type', 'derived', 30),
  ('area_level', 'Area', 'Level', 'derived', 40),
  ('area_location', 'Area', 'Location', 'derived', 50),
  ('main_trade', 'Main Trade', 'Main Trade', 'system', 60),
  ('sub_trade', 'Sub Trade', 'Sub Trade', 'system', 70),
  ('status', 'Status', 'Status', 'system', 80),
  ('planned_date', 'Planned Date', 'Planned Date', 'system', 90),
  ('target_date', 'Target Date', 'Target Date', 'system', 100),
  ('actual_progress_pct', 'Actual Progress %', 'Actual Progress %', 'system', 110),
  ('closure_status', 'Closure Status', 'Closure Status', 'system', 120),
  ('closed_date', 'Closed Date', 'Closed Date', 'system', 130),
  ('subcontractor_name', 'Subcontractor', 'Subcontractor', 'system', 140),
  ('subsub_name', 'Sub-Sub', 'Sub-Sub', 'system', 150),
  ('hdec_pic_name', 'HDEC PIC', 'HDEC PIC', 'system', 160)
ON CONFLICT (field_name) DO NOTHING;