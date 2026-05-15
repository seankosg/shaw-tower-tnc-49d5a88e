
CREATE TYPE public.punch_gate_status AS ENUM ('not_required','pending','approved');
CREATE TYPE public.punch_procurement_status AS ENUM ('not_required','pending','partially_secured','secured');
CREATE TYPE public.punch_health_status AS ENUM ('ahead','on_track','behind','critical');

CREATE TABLE public.punch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  item_no text,
  category1 text,
  category2 text,
  category3 text,
  critical_level text,
  subcontractor_name text,
  subsub_name text,
  hdec_pic_name text,
  hdec_eng_name text,
  outstanding_work text NOT NULL,
  level text,
  location text,
  team public.team_type,
  main_trade text,
  sub_trade text,
  work_type text,
  planned_start_date date,
  planned_completion_date date,
  actual_start_date date,
  actual_completion_date date,
  actual_progress_pct numeric,
  completion_status text,
  remarks text,
  planned_progress_pct numeric,
  progress_variance_pct numeric,
  data_date date,
  health_status public.punch_health_status,
  weight numeric NOT NULL DEFAULT 1,
  material_approval_status public.punch_gate_status NOT NULL DEFAULT 'pending',
  material_approval_date date,
  material_procurement_status public.punch_procurement_status NOT NULL DEFAULT 'pending',
  material_procurement_date date,
  drawing_approval_status public.punch_gate_status NOT NULL DEFAULT 'pending',
  drawing_approval_date date,
  mos_approval_status public.punch_gate_status NOT NULL DEFAULT 'pending',
  mos_approval_date date,
  pre_engineering_ready boolean NOT NULL DEFAULT false,
  pre_engineering_blockers text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1,
  data_source_type text,
  source_upload_id uuid,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX idx_punch_items_project ON public.punch_items(project_id) WHERE is_active;
CREATE INDEX idx_punch_items_team ON public.punch_items(team) WHERE is_active;
CREATE INDEX idx_punch_items_status ON public.punch_items(completion_status) WHERE is_active;
CREATE INDEX idx_punch_items_health ON public.punch_items(health_status) WHERE is_active;
CREATE INDEX idx_punch_items_critical ON public.punch_items(critical_level) WHERE is_active;
CREATE UNIQUE INDEX idx_punch_items_dedup
  ON public.punch_items(project_id, COALESCE(item_no,''), outstanding_work, COALESCE(location,''))
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.punch_compute_derived()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  blockers text[] := '{}';
  v numeric;
BEGIN
  IF NEW.material_approval_status NOT IN ('approved','not_required') THEN
    blockers := array_append(blockers, 'Material Approval');
  END IF;
  IF NEW.material_procurement_status NOT IN ('secured','not_required') THEN
    blockers := array_append(blockers, 'Material Procurement');
  END IF;
  IF NEW.drawing_approval_status NOT IN ('approved','not_required') THEN
    blockers := array_append(blockers, 'Drawing Approval');
  END IF;
  IF NEW.mos_approval_status NOT IN ('approved','not_required') THEN
    blockers := array_append(blockers, 'MOS Approval');
  END IF;
  NEW.pre_engineering_blockers := blockers;
  NEW.pre_engineering_ready := array_length(blockers,1) IS NULL;

  IF NEW.actual_progress_pct IS NOT NULL AND NEW.planned_progress_pct IS NOT NULL THEN
    v := NEW.actual_progress_pct - NEW.planned_progress_pct;
    NEW.progress_variance_pct := v;
    IF v >= 5 THEN NEW.health_status := 'ahead';
    ELSIF v > -5 THEN NEW.health_status := 'on_track';
    ELSIF v > -15 THEN NEW.health_status := 'behind';
    ELSE NEW.health_status := 'critical';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_punch_items_derived
BEFORE INSERT OR UPDATE ON public.punch_items
FOR EACH ROW EXECUTE FUNCTION public.punch_compute_derived();

CREATE TABLE public.punch_upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_file_name text NOT NULL,
  status public.upload_status NOT NULL DEFAULT 'pending',
  data_date date,
  total_rows integer DEFAULT 0,
  processed_rows integer DEFAULT 0,
  success_rows integer DEFAULT 0,
  skipped_rows integer DEFAULT 0,
  rejected_rows integer DEFAULT 0,
  note text,
  rolled_back_at timestamptz,
  rolled_back_by uuid,
  rollback_force boolean
);

CREATE TABLE public.punch_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punch_id uuid NOT NULL,
  upload_id uuid,
  changed_field text NOT NULL,
  old_value text,
  new_value text,
  change_source text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_punch_change_log_punch ON public.punch_change_log(punch_id, changed_at DESC);

CREATE TABLE public.punch_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punch_id uuid NOT NULL,
  parent_comment_id uuid,
  author_user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'comment',
  message text NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_punch_comments_punch ON public.punch_comments(punch_id, created_at DESC);

CREATE TABLE public.punch_comment_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punch_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(punch_id, user_id)
);

CREATE TABLE public.punch_daily_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  punch_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  planned_progress_pct numeric,
  actual_progress_pct numeric,
  variance_pct numeric,
  health_status public.punch_health_status,
  completion_status text,
  pre_engineering_ready boolean,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(punch_id, snapshot_date)
);

ALTER TABLE public.punch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_comment_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read punch"
ON public.punch_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Privileged can insert punch"
ON public.punch_items FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'superuser'::app_role,'senior_user'::app_role,'user'::app_role])
  OR (has_role(auth.uid(),'d_superuser'::app_role) AND user_team_matches(auth.uid(), team))
);

CREATE POLICY "Privileged can update punch"
ON public.punch_items FOR UPDATE TO authenticated
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'superuser'::app_role,'senior_user'::app_role,'user'::app_role])
  OR (has_role(auth.uid(),'d_superuser'::app_role) AND user_team_matches(auth.uid(), team))
)
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['admin'::app_role,'superuser'::app_role,'senior_user'::app_role,'user'::app_role])
  OR (has_role(auth.uid(),'d_superuser'::app_role) AND user_team_matches(auth.uid(), team))
);

CREATE POLICY "Privileged can delete punch"
ON public.punch_items FOR DELETE TO authenticated
USING (can_write_for_team(auth.uid(), team));

CREATE POLICY "Anyone can read punch uploads" ON public.punch_upload_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert punch uploads" ON public.punch_upload_batches FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());
CREATE POLICY "Upload owners can update punch uploads" ON public.punch_upload_batches FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR is_admin_or_superuser(auth.uid()))
  WITH CHECK (uploaded_by = auth.uid() OR is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can delete punch uploads" ON public.punch_upload_batches FOR DELETE TO authenticated USING (is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read punch change logs" ON public.punch_change_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert punch change logs" ON public.punch_change_log FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid() OR is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read punch comments" ON public.punch_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert own punch comments" ON public.punch_comments FOR INSERT TO authenticated WITH CHECK (author_user_id = auth.uid());
CREATE POLICY "Authors can update own punch comments" ON public.punch_comments FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid() OR is_admin_or_superuser(auth.uid()))
  WITH CHECK (author_user_id = auth.uid() OR is_admin_or_superuser(auth.uid()));
CREATE POLICY "Authors can delete own punch comments" ON public.punch_comments FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR is_admin_or_superuser(auth.uid()));

CREATE POLICY "Users can read own punch comment reads" ON public.punch_comment_reads FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own punch comment reads" ON public.punch_comment_reads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own punch comment reads" ON public.punch_comment_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone can read punch daily snapshots" ON public.punch_daily_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert punch daily snapshots" ON public.punch_daily_snapshots FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() OR is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can delete punch daily snapshots" ON public.punch_daily_snapshots FOR DELETE TO authenticated USING (is_admin_or_superuser(auth.uid()));

ALTER TABLE public.import_header_mappings DROP CONSTRAINT IF EXISTS import_header_mappings_module_check;
ALTER TABLE public.import_header_mappings ADD CONSTRAINT import_header_mappings_module_check
  CHECK (module = ANY (ARRAY['tnc'::text,'defect'::text,'docs'::text,'punch'::text]));
ALTER TABLE public.import_header_mappings DROP CONSTRAINT IF EXISTS import_header_mappings_submodule_check;
ALTER TABLE public.import_header_mappings ADD CONSTRAINT import_header_mappings_submodule_check
  CHECK (
    (module = 'docs' AND sub_module IS NOT NULL AND sub_module <> '')
    OR (module IN ('tnc','defect','punch') AND sub_module IS NULL)
  );

ALTER TABLE public.custom_field_definitions DROP CONSTRAINT IF EXISTS custom_field_definitions_module_check;
ALTER TABLE public.custom_field_definitions ADD CONSTRAINT custom_field_definitions_module_check
  CHECK (module = ANY (ARRAY['tnc'::text,'defect'::text,'docs'::text,'punch'::text]));
ALTER TABLE public.custom_field_definitions DROP CONSTRAINT IF EXISTS custom_field_definitions_submodule_check;
ALTER TABLE public.custom_field_definitions ADD CONSTRAINT custom_field_definitions_submodule_check
  CHECK (
    (module = 'docs' AND sub_module IS NOT NULL AND sub_module <> '')
    OR (module IN ('tnc','defect','punch') AND sub_module IS NULL)
  );

INSERT INTO public.import_header_mappings (module, sub_module, header_alias, target_field, is_system) VALUES
  ('punch', NULL, 'item no','item_no',true),
  ('punch', NULL, 'item_no','item_no',true),
  ('punch', NULL, 'no','item_no',true),
  ('punch', NULL, '번호','item_no',true),
  ('punch', NULL, '구분1','category1',true),
  ('punch', NULL, 'category 1','category1',true),
  ('punch', NULL, '구분2','category2',true),
  ('punch', NULL, 'category 2','category2',true),
  ('punch', NULL, '구분3','category3',true),
  ('punch', NULL, 'category 3','category3',true),
  ('punch', NULL, 'critical level','critical_level',true),
  ('punch', NULL, 'criticality','critical_level',true),
  ('punch', NULL, '중요도','critical_level',true),
  ('punch', NULL, 'subcontractor','subcontractor_name',true),
  ('punch', NULL, 'sub-contractor','subcontractor_name',true),
  ('punch', NULL, 'sub','subcontractor_name',true),
  ('punch', NULL, 'sub-sub','subsub_name',true),
  ('punch', NULL, 'subsub','subsub_name',true),
  ('punch', NULL, 'sub sub','subsub_name',true),
  ('punch', NULL, 'hdec pic','hdec_pic_name',true),
  ('punch', NULL, 'pic','hdec_pic_name',true),
  ('punch', NULL, 'hdec eng','hdec_eng_name',true),
  ('punch', NULL, 'engineer','hdec_eng_name',true),
  ('punch', NULL, 'outstanding works','outstanding_work',true),
  ('punch', NULL, 'outsanding works','outstanding_work',true),
  ('punch', NULL, 'outstanding work','outstanding_work',true),
  ('punch', NULL, 'description','outstanding_work',true),
  ('punch', NULL, 'level','level',true),
  ('punch', NULL, 'floor','level',true),
  ('punch', NULL, 'location','location',true),
  ('punch', NULL, 'area','location',true),
  ('punch', NULL, 'team','team',true),
  ('punch', NULL, 'main trade','main_trade',true),
  ('punch', NULL, 'trade','main_trade',true),
  ('punch', NULL, 'sub trade','sub_trade',true),
  ('punch', NULL, 'work type','work_type',true),
  ('punch', NULL, 'type','work_type',true),
  ('punch', NULL, 'planned start date','planned_start_date',true),
  ('punch', NULL, 'planned start','planned_start_date',true),
  ('punch', NULL, 'planned completion date','planned_completion_date',true),
  ('punch', NULL, 'planned completion','planned_completion_date',true),
  ('punch', NULL, 'planned finish','planned_completion_date',true),
  ('punch', NULL, 'actual start date','actual_start_date',true),
  ('punch', NULL, 'actual start','actual_start_date',true),
  ('punch', NULL, 'actual completion date','actual_completion_date',true),
  ('punch', NULL, 'actual completion','actual_completion_date',true),
  ('punch', NULL, 'actual finish','actual_completion_date',true),
  ('punch', NULL, 'actual progress %','actual_progress_pct',true),
  ('punch', NULL, 'actual progress','actual_progress_pct',true),
  ('punch', NULL, 'progress','actual_progress_pct',true),
  ('punch', NULL, 'planned progress %','planned_progress_pct',true),
  ('punch', NULL, 'planned progress','planned_progress_pct',true),
  ('punch', NULL, 'completion status','completion_status',true),
  ('punch', NULL, 'status','completion_status',true),
  ('punch', NULL, 'material approval','material_approval_status',true),
  ('punch', NULL, 'material approval status','material_approval_status',true),
  ('punch', NULL, 'material approval date','material_approval_date',true),
  ('punch', NULL, 'material procurement','material_procurement_status',true),
  ('punch', NULL, 'material secured','material_procurement_status',true),
  ('punch', NULL, 'procurement','material_procurement_status',true),
  ('punch', NULL, 'material procurement date','material_procurement_date',true),
  ('punch', NULL, 'procurement date','material_procurement_date',true),
  ('punch', NULL, 'drawing approval','drawing_approval_status',true),
  ('punch', NULL, '도면승인','drawing_approval_status',true),
  ('punch', NULL, 'drawing approval date','drawing_approval_date',true),
  ('punch', NULL, 'mos approval','mos_approval_status',true),
  ('punch', NULL, 'mos approval status','mos_approval_status',true),
  ('punch', NULL, 'mos approval date','mos_approval_date',true),
  ('punch', NULL, 'remarks','remarks',true),
  ('punch', NULL, 'remark','remarks',true),
  ('punch', NULL, 'note','remarks',true),
  ('punch', NULL, 'notes','remarks',true)
ON CONFLICT DO NOTHING;

INSERT INTO public.app_settings(key, value)
VALUES ('module_punch_status', '"active"'::jsonb)
ON CONFLICT (key) DO NOTHING;
