
-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE public.app_role AS ENUM ('subcontractor', 'hdec_engineer', 'manager', 'superuser', 'admin');
CREATE TYPE public.tc_status AS ENUM ('Planned', 'WIP', 'Done', 'Hold');
CREATE TYPE public.data_source AS ENUM ('legacy_import_inherited', 'app_direct_input', 'mobile_input', 'standard_import', 'admin_edit');
CREATE TYPE public.change_source AS ENUM ('app_direct_input', 'mobile_input', 'excel_import', 'admin_edit');
CREATE TYPE public.import_type AS ENUM ('legacy', 'standard');
CREATE TYPE public.upload_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE public.action_taken AS ENUM ('inserted', 'updated', 'skipped', 'rejected');

-- =============================================
-- A. MASTER TABLES
-- =============================================

CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_code TEXT NOT NULL UNIQUE,
  project_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.system_master (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_code TEXT NOT NULL,
  system_name_std TEXT,
  discipline TEXT,
  is_auto_created BOOLEAN NOT NULL DEFAULT false,
  auto_created_at TIMESTAMPTZ,
  auto_created_by UUID,
  requires_admin_review BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, system_code)
);

CREATE TABLE public.system_alias_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  system_id UUID NOT NULL REFERENCES public.system_master(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, alias_name)
);

-- =============================================
-- B. CORE BUSINESS TABLES
-- =============================================

CREATE TABLE public.tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_id UUID NOT NULL REFERENCES public.system_master(id) ON DELETE CASCADE,
  item_no TEXT NOT NULL,
  level TEXT,
  equipment TEXT,
  description TEXT,
  source_seed_row_no INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, system_id, item_no)
);

CREATE TABLE public.subtests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_id UUID NOT NULL REFERENCES public.system_master(id) ON DELETE CASCADE,
  test_id UUID REFERENCES public.tests(id) ON DELETE SET NULL,
  item_no TEXT NOT NULL,
  mos_code TEXT NOT NULL,
  mos_sequence INTEGER,
  subtest_id TEXT NOT NULL UNIQUE,
  level TEXT,
  equipment TEXT,
  description TEXT,
  t1_planned_date DATE,
  t1_actual_date DATE,
  t1_status public.tc_status,
  t2_planned_date DATE,
  t2_actual_date DATE,
  t2_status public.tc_status,
  r1_status TEXT,
  aconex_ref_no TEXT,
  r2_status TEXT,
  remarks TEXT,
  punchlist_comments TEXT,
  source_upload_id UUID,
  data_source_type public.data_source,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(project_id, system_id, item_no, mos_code)
);

-- =============================================
-- C. USER / PERMISSION TABLES
-- =============================================

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);

CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_system_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  system_id UUID NOT NULL REFERENCES public.system_master(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_import BOOLEAN NOT NULL DEFAULT false,
  can_create_key BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  granted_by UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, project_id, system_id)
);

-- =============================================
-- D. IMPORT / FILE TRACKING TABLES
-- =============================================

CREATE TABLE public.upload_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_file_name TEXT NOT NULL,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_type TEXT,
  import_type public.import_type,
  template_version TEXT,
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  rejected_rows INTEGER DEFAULT 0,
  status public.upload_status NOT NULL DEFAULT 'pending',
  note TEXT
);

CREATE TABLE public.upload_row_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id UUID NOT NULL REFERENCES public.upload_batches(id) ON DELETE CASCADE,
  raw_row_no INTEGER,
  raw_system_name TEXT,
  mapped_system_id UUID,
  item_no TEXT,
  mos_code TEXT,
  action_taken public.action_taken,
  reason_code TEXT,
  reason_detail TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- E. AUDIT TABLES
-- =============================================

CREATE TABLE public.subtest_change_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subtest_id UUID NOT NULL REFERENCES public.subtests(id) ON DELETE CASCADE,
  changed_field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_source public.change_source,
  upload_id UUID
);

-- =============================================
-- F. UI / FIELD CONFIGURATION
-- =============================================

CREATE TABLE public.field_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_required BOOLEAN NOT NULL DEFAULT false,
  visible_to_roles public.app_role[] DEFAULT '{}',
  editable_to_roles public.app_role[] DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_subtests_project ON public.subtests(project_id);
CREATE INDEX idx_subtests_system ON public.subtests(system_id);
CREATE INDEX idx_subtests_item_no ON public.subtests(item_no);
CREATE INDEX idx_subtests_t1_status ON public.subtests(t1_status);
CREATE INDEX idx_subtests_t2_status ON public.subtests(t2_status);
CREATE INDEX idx_subtests_updated_at ON public.subtests(updated_at);
CREATE INDEX idx_change_log_subtest ON public.subtest_change_log(subtest_id);
CREATE INDEX idx_change_log_changed_at ON public.subtest_change_log(changed_at);
CREATE INDEX idx_system_master_project ON public.system_master(project_id);
CREATE INDEX idx_upload_row_logs_upload ON public.upload_row_logs(upload_id);

-- =============================================
-- UPDATED_AT TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_subtests_updated_at
  BEFORE UPDATE ON public.subtests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tests_updated_at
  BEFORE UPDATE ON public.tests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- PROFILE AUTO-CREATE TRIGGER
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- SECURITY DEFINER FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_superuser(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_any_role(_user_id, ARRAY['admin', 'superuser']::public.app_role[])
$$;

CREATE OR REPLACE FUNCTION public.has_system_permission(_user_id UUID, _project_id UUID, _system_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin_or_superuser(_user_id) THEN
    RETURN true;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM public.user_system_permissions
    WHERE user_id = _user_id
      AND project_id = _project_id
      AND system_id = _system_id
      AND CASE _permission
        WHEN 'view' THEN can_view
        WHEN 'edit' THEN can_edit
        WHEN 'import' THEN can_import
        WHEN 'create_key' THEN can_create_key
        WHEN 'export' THEN can_export
        ELSE false
      END
  );
END;
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_alias_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_system_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_row_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtest_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage projects" ON public.projects FOR ALL TO authenticated USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read systems" ON public.system_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage systems" ON public.system_master FOR ALL TO authenticated USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read aliases" ON public.system_alias_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage aliases" ON public.system_alias_map FOR ALL TO authenticated USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read tests" ON public.tests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage tests" ON public.tests FOR ALL TO authenticated USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read subtests" ON public.subtests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update permitted subtests" ON public.subtests FOR UPDATE TO authenticated 
  USING (public.has_system_permission(auth.uid(), project_id, system_id, 'edit'));
CREATE POLICY "Admins can insert subtests" ON public.subtests FOR INSERT TO authenticated 
  WITH CHECK (public.is_admin_or_superuser(auth.uid()) OR public.has_system_permission(auth.uid(), project_id, system_id, 'create_key'));
CREATE POLICY "Admins can delete subtests" ON public.subtests FOR DELETE TO authenticated 
  USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT TO authenticated 
  USING (user_id = auth.uid() OR public.is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "System can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can read own permissions" ON public.user_system_permissions FOR SELECT TO authenticated 
  USING (user_id = auth.uid() OR public.is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can manage permissions" ON public.user_system_permissions FOR ALL TO authenticated 
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read uploads" ON public.upload_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert uploads" ON public.upload_batches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can manage uploads" ON public.upload_batches FOR ALL TO authenticated USING (public.is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read upload logs" ON public.upload_row_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert upload logs" ON public.upload_row_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Anyone can read change logs" ON public.subtest_change_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert change logs" ON public.subtest_change_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Anyone can read field config" ON public.field_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage field config" ON public.field_config FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- SEED DATA
-- =============================================

INSERT INTO public.projects (project_code, project_name) VALUES ('SHAW', 'SHAW Construction Project');

INSERT INTO public.field_config (field_name, display_name, is_enabled, is_required, sort_order, visible_to_roles, editable_to_roles) VALUES
  ('system', 'System', true, true, 1, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"admin"}'),
  ('item_no', 'Item No', true, true, 2, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"admin"}'),
  ('subtest_id', 'Subtest ID', true, true, 3, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{}'),
  ('mos_code', 'MOS Code', true, true, 4, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"admin"}'),
  ('mos_sequence', 'MOS Sequence', true, false, 5, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"manager","superuser","admin"}'),
  ('level', 'Level', true, false, 6, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"hdec_engineer","manager","superuser","admin"}'),
  ('equipment', 'Equipment', true, false, 7, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"hdec_engineer","manager","superuser","admin"}'),
  ('description', 'Description', true, false, 8, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"hdec_engineer","manager","superuser","admin"}'),
  ('t1_planned_date', 'T1 Planned Date', true, false, 9, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"hdec_engineer","manager","superuser","admin"}'),
  ('t1_actual_date', 'T1 Actual Date', true, false, 10, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"subcontractor","hdec_engineer","manager","superuser","admin"}'),
  ('t1_status', 'T1 Status', true, false, 11, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"subcontractor","hdec_engineer","manager","superuser","admin"}'),
  ('t2_planned_date', 'T2 Planned Date', true, false, 12, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"hdec_engineer","manager","superuser","admin"}'),
  ('t2_actual_date', 'T2 Actual Date', true, false, 13, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"subcontractor","hdec_engineer","manager","superuser","admin"}'),
  ('t2_status', 'T2 Status', true, false, 14, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"subcontractor","hdec_engineer","manager","superuser","admin"}'),
  ('r1_status', 'R1 Status', true, false, 15, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"hdec_engineer","manager","superuser","admin"}'),
  ('aconex_ref_no', 'Aconex Ref No', true, false, 16, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"hdec_engineer","manager","superuser","admin"}'),
  ('r2_status', 'R2 Status', true, false, 17, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"hdec_engineer","manager","superuser","admin"}'),
  ('remarks', 'Remarks', true, false, 18, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"subcontractor","hdec_engineer","manager","superuser","admin"}'),
  ('punchlist_comments', 'Punchlist Comments', true, false, 19, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{"hdec_engineer","manager","superuser","admin"}'),
  ('updated_by', 'Updated By', true, false, 20, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{}'),
  ('updated_at', 'Updated At', true, false, 21, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{}'),
  ('source_upload_id', 'Source Upload ID', true, false, 22, '{"manager","superuser","admin"}', '{}'),
  ('data_source_type', 'Data Source', true, false, 23, '{"subcontractor","hdec_engineer","manager","superuser","admin"}', '{}');
