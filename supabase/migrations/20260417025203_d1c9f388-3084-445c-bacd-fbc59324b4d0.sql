
-- ============================================================
-- 1. user_type enum 신규
-- ============================================================
CREATE TYPE public.user_type AS ENUM ('subcontractor','hdec','pm_pd','admin');

-- ============================================================
-- 2. app_role enum 교체 (기존 의존 함수/정책 임시 제거 후 재생성)
-- ============================================================

-- 2-1. 기존 함수 의존하는 RLS 정책 제거 (재생성 위해)
DROP POLICY IF EXISTS "Admins can manage field config" ON public.field_config;
DROP POLICY IF EXISTS "Admins can manage projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can insert subtests" ON public.subtests;
DROP POLICY IF EXISTS "Admins can delete subtests" ON public.subtests;
DROP POLICY IF EXISTS "Users can update permitted subtests" ON public.subtests;
DROP POLICY IF EXISTS "Admins can manage aliases" ON public.system_alias_map;
DROP POLICY IF EXISTS "Admins can manage systems" ON public.system_master;
DROP POLICY IF EXISTS "Admins can manage tests" ON public.tests;
DROP POLICY IF EXISTS "Admins can manage uploads" ON public.upload_batches;
DROP POLICY IF EXISTS "Admins can delete upload batches" ON public.upload_batches;
DROP POLICY IF EXISTS "Authenticated can insert upload logs" ON public.upload_row_logs;
DROP POLICY IF EXISTS "Admins can delete upload logs" ON public.upload_row_logs;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own permissions" ON public.user_system_permissions;
DROP POLICY IF EXISTS "Admins can manage permissions" ON public.user_system_permissions;

-- 2-2. 기존 함수 제거 (enum 변경 위해)
DROP FUNCTION IF EXISTS public.is_admin_or_superuser(uuid);
DROP FUNCTION IF EXISTS public.has_any_role(uuid, app_role[]);
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);
DROP FUNCTION IF EXISTS public.has_system_permission(uuid, uuid, uuid, text);

-- 2-3. enum 교체
ALTER TYPE public.app_role RENAME TO app_role_old;
CREATE TYPE public.app_role AS ENUM ('guest','super_guest','user','senior_user','superuser','admin');

-- 2-4. user_roles.role 컬럼 매핑
ALTER TABLE public.user_roles ADD COLUMN role_new public.app_role;
UPDATE public.user_roles SET role_new = CASE role::text
  WHEN 'subcontractor' THEN 'user'::public.app_role
  WHEN 'hdec_engineer' THEN 'user'::public.app_role
  WHEN 'manager' THEN 'senior_user'::public.app_role
  WHEN 'superuser' THEN 'superuser'::public.app_role
  WHEN 'admin' THEN 'admin'::public.app_role
  ELSE 'user'::public.app_role
END;
ALTER TABLE public.user_roles DROP COLUMN role;
ALTER TABLE public.user_roles RENAME COLUMN role_new TO role;
ALTER TABLE public.user_roles ALTER COLUMN role SET NOT NULL;

-- 2-5. field_config 배열 컬럼 매핑
ALTER TABLE public.field_config ADD COLUMN visible_to_roles_new public.app_role[] DEFAULT '{}';
ALTER TABLE public.field_config ADD COLUMN editable_to_roles_new public.app_role[] DEFAULT '{}';

UPDATE public.field_config SET visible_to_roles_new = (
  SELECT COALESCE(array_agg(
    CASE r::text
      WHEN 'subcontractor' THEN 'user'::public.app_role
      WHEN 'hdec_engineer' THEN 'user'::public.app_role
      WHEN 'manager' THEN 'senior_user'::public.app_role
      WHEN 'superuser' THEN 'superuser'::public.app_role
      WHEN 'admin' THEN 'admin'::public.app_role
      ELSE 'user'::public.app_role
    END
  ), '{}'::public.app_role[])
  FROM unnest(visible_to_roles) AS r
);

UPDATE public.field_config SET editable_to_roles_new = (
  SELECT COALESCE(array_agg(
    CASE r::text
      WHEN 'subcontractor' THEN 'user'::public.app_role
      WHEN 'hdec_engineer' THEN 'user'::public.app_role
      WHEN 'manager' THEN 'senior_user'::public.app_role
      WHEN 'superuser' THEN 'superuser'::public.app_role
      WHEN 'admin' THEN 'admin'::public.app_role
      ELSE 'user'::public.app_role
    END
  ), '{}'::public.app_role[])
  FROM unnest(editable_to_roles) AS r
);

ALTER TABLE public.field_config DROP COLUMN visible_to_roles;
ALTER TABLE public.field_config DROP COLUMN editable_to_roles;
ALTER TABLE public.field_config RENAME COLUMN visible_to_roles_new TO visible_to_roles;
ALTER TABLE public.field_config RENAME COLUMN editable_to_roles_new TO editable_to_roles;

-- 2-6. 기존 enum 삭제
DROP TYPE public.app_role_old;

-- ============================================================
-- 3. 함수 재생성 (신규 enum 기준)
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_superuser(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_role(_user_id, ARRAY['admin','superuser']::public.app_role[])
$$;

CREATE OR REPLACE FUNCTION public.has_system_permission(_user_id uuid, _project_id uuid, _system_id uuid, _permission text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin_or_superuser(_user_id) THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_system_permissions
    WHERE user_id = _user_id AND project_id = _project_id AND system_id = _system_id
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

-- ============================================================
-- 4. RLS 정책 재생성
-- ============================================================
CREATE POLICY "Admins can manage field config" ON public.field_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage projects" ON public.projects FOR ALL TO authenticated USING (is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can insert subtests" ON public.subtests FOR INSERT TO authenticated WITH CHECK (is_admin_or_superuser(auth.uid()) OR has_system_permission(auth.uid(), project_id, system_id, 'create_key'));
CREATE POLICY "Admins can delete subtests" ON public.subtests FOR DELETE TO authenticated USING (is_admin_or_superuser(auth.uid()));
CREATE POLICY "Users can update permitted subtests" ON public.subtests FOR UPDATE TO authenticated USING (has_system_permission(auth.uid(), project_id, system_id, 'edit'));
CREATE POLICY "Admins can manage aliases" ON public.system_alias_map FOR ALL TO authenticated USING (is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can manage systems" ON public.system_master FOR ALL TO authenticated USING (is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can manage tests" ON public.tests FOR ALL TO authenticated USING (is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can manage uploads" ON public.upload_batches FOR ALL TO authenticated USING (is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can delete upload batches" ON public.upload_batches FOR DELETE TO authenticated USING (is_admin_or_superuser(auth.uid()));
CREATE POLICY "Authenticated can insert upload logs" ON public.upload_row_logs FOR INSERT TO authenticated WITH CHECK ((EXISTS (SELECT 1 FROM upload_batches ub WHERE ub.id = upload_row_logs.upload_id AND ub.uploaded_by = auth.uid())) OR is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can delete upload logs" ON public.upload_row_logs FOR DELETE TO authenticated USING (is_admin_or_superuser(auth.uid()));
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can read own permissions" ON public.user_system_permissions FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin_or_superuser(auth.uid()));
CREATE POLICY "Admins can manage permissions" ON public.user_system_permissions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 5. profiles 컬럼 추가
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_type public.user_type NOT NULL DEFAULT 'hdec';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subcontractor_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hdec_pic_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- 기존 profile에 login_id 채우기 (email local-part 사용)
UPDATE public.profiles SET login_id = COALESCE(login_id, split_part(email, '@', 1)) WHERE login_id IS NULL;

ALTER TABLE public.profiles ALTER COLUMN login_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_id_unique ON public.profiles (login_id);

-- 서브콘 1업체 1계정 partial unique
CREATE UNIQUE INDEX IF NOT EXISTS profiles_subcontractor_unique
  ON public.profiles (subcontractor_name)
  WHERE user_type = 'subcontractor' AND subcontractor_name IS NOT NULL;

-- ============================================================
-- 6. handle_new_user 트리거 갱신
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_login_id text;
  v_user_type public.user_type;
  v_subcontractor_name text;
  v_hdec_pic_name text;
  v_must_change boolean;
BEGIN
  v_login_id := COALESCE(
    NEW.raw_user_meta_data->>'login_id',
    split_part(NEW.email, '@', 1)
  );
  v_user_type := COALESCE(
    (NEW.raw_user_meta_data->>'user_type')::public.user_type,
    'hdec'::public.user_type
  );
  v_subcontractor_name := NEW.raw_user_meta_data->>'subcontractor_name';
  v_hdec_pic_name := NEW.raw_user_meta_data->>'hdec_pic_name';
  v_must_change := COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, true);

  INSERT INTO public.profiles (
    user_id, email, name, login_id, user_type,
    subcontractor_name, hdec_pic_name, must_change_password
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', v_login_id),
    v_login_id,
    v_user_type,
    v_subcontractor_name,
    v_hdec_pic_name,
    v_must_change
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 7. Master 테이블 신설
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subcontractor_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hdec_pic_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subcontractor_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hdec_pic_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read subcontractor master" ON public.subcontractor_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage subcontractor master" ON public.subcontractor_master FOR ALL TO authenticated USING (is_admin_or_superuser(auth.uid()));

CREATE POLICY "Anyone can read hdec pic master" ON public.hdec_pic_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage hdec pic master" ON public.hdec_pic_master FOR ALL TO authenticated USING (is_admin_or_superuser(auth.uid()));

-- 기존 subtests에서 distinct 값 자동 시딩
INSERT INTO public.subcontractor_master (name)
SELECT DISTINCT subcontractor_name FROM public.subtests
WHERE subcontractor_name IS NOT NULL AND trim(subcontractor_name) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.hdec_pic_master (name)
SELECT DISTINCT hdec_pic_name FROM public.subtests
WHERE hdec_pic_name IS NOT NULL AND trim(hdec_pic_name) <> ''
ON CONFLICT (name) DO NOTHING;
