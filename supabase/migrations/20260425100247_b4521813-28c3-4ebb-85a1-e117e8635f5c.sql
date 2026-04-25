-- ==============================================================
-- Event Log: senior_user / superuser activity audit
-- ==============================================================

-- 1) Table
CREATE TABLE IF NOT EXISTS public.event_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor_user_id   uuid,
  actor_login_id  text,
  actor_name      text,
  actor_role      text NOT NULL,                 -- 'senior_user' | 'superuser'
  action          text NOT NULL,                 -- 'update' | 'delete' | 'soft_delete'
  table_name      text NOT NULL,
  record_id       text,                          -- text so we can store any PK type
  changed_fields  text[] NOT NULL DEFAULT '{}',  -- list of field names that changed (update only)
  before_data     jsonb,                         -- previous row snapshot of changed fields
  after_data      jsonb,                         -- new row snapshot of changed fields (null for delete)
  summary         text                           -- human-readable label, e.g. "Acme Corp"
);

CREATE INDEX IF NOT EXISTS idx_event_log_occurred_at ON public.event_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_actor       ON public.event_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_event_log_table       ON public.event_log (table_name);
CREATE INDEX IF NOT EXISTS idx_event_log_action      ON public.event_log (action);

-- 2) RLS
ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read event log"   ON public.event_log;
DROP POLICY IF EXISTS "Admins can delete event log" ON public.event_log;

CREATE POLICY "Admins can read event log"
  ON public.event_log FOR SELECT
  TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()));

-- Allow admins to manually delete entries (purge tool)
CREATE POLICY "Admins can delete event log"
  ON public.event_log FOR DELETE
  TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()));

-- No INSERT/UPDATE policies for clients — entries are written by SECURITY DEFINER triggers only.

-- 3) Helper: actor role classification (NULL when not tracked)
CREATE OR REPLACE FUNCTION public._event_log_actor_role(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_super boolean;
  is_senior boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  SELECT public.has_role(_user_id, 'superuser'::public.app_role)   INTO is_super;
  IF is_super THEN RETURN 'superuser'; END IF;
  SELECT public.has_role(_user_id, 'senior_user'::public.app_role) INTO is_senior;
  IF is_senior THEN RETURN 'senior_user'; END IF;
  RETURN NULL;
END;
$$;

-- 4) Generic trigger function. Logs only when actor role is senior_user/superuser.
--    For UPDATE: records only the changed columns (excluding row_version / updated_at noise).
--    For UPDATE with is_active flipping true→false: classified as 'soft_delete'.
--    For DELETE: full row snapshot.
CREATE OR REPLACE FUNCTION public.fn_event_log_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_action text;
  v_record_id text;
  v_changed_fields text[] := '{}';
  v_before jsonb := NULL;
  v_after jsonb := NULL;
  v_summary text := NULL;
  v_old_json jsonb;
  v_new_json jsonb;
  v_key text;
  v_id_col text := COALESCE(TG_ARGV[0], 'id');
  v_summary_col text := TG_ARGV[1];           -- optional column whose value is used as summary
  v_ignore_cols text[] := COALESCE(
    string_to_array(TG_ARGV[2], ','),
    ARRAY['updated_at','row_version','classified_at']
  );
BEGIN
  v_role := public._event_log_actor_role(v_user);
  IF v_role IS NULL THEN
    -- Not a tracked actor — skip entirely (admin / regular user / system)
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_json := to_jsonb(OLD);
    v_new_json := to_jsonb(NEW);

    -- Build list of changed columns (excluding ignored)
    FOR v_key IN SELECT jsonb_object_keys(v_new_json) LOOP
      IF v_key = ANY(v_ignore_cols) THEN CONTINUE; END IF;
      IF v_old_json->v_key IS DISTINCT FROM v_new_json->v_key THEN
        v_changed_fields := array_append(v_changed_fields, v_key);
      END IF;
    END LOOP;

    IF array_length(v_changed_fields, 1) IS NULL THEN
      RETURN NEW;  -- nothing meaningful changed
    END IF;

    -- Classify soft delete (is_active true -> false)
    IF (v_old_json ? 'is_active') AND (v_new_json ? 'is_active')
       AND (v_old_json->>'is_active') = 'true'
       AND (v_new_json->>'is_active') = 'false' THEN
      v_action := 'soft_delete';
    ELSE
      v_action := 'update';
    END IF;

    -- Snapshots restricted to changed fields, keeps payload small
    SELECT jsonb_object_agg(k, v_old_json->k) INTO v_before
      FROM unnest(v_changed_fields) AS k;
    SELECT jsonb_object_agg(k, v_new_json->k) INTO v_after
      FROM unnest(v_changed_fields) AS k;

    v_record_id := v_new_json->>v_id_col;
    IF v_summary_col IS NOT NULL THEN
      v_summary := v_new_json->>v_summary_col;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_old_json := to_jsonb(OLD);
    v_action := 'delete';
    v_before := v_old_json;
    v_record_id := v_old_json->>v_id_col;
    IF v_summary_col IS NOT NULL THEN
      v_summary := v_old_json->>v_summary_col;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.event_log (
    actor_user_id, actor_login_id, actor_name, actor_role,
    action, table_name, record_id,
    changed_fields, before_data, after_data, summary
  )
  SELECT
    v_user,
    p.login_id,
    p.name,
    v_role,
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    v_changed_fields,
    v_before,
    v_after,
    v_summary
  FROM (SELECT login_id, name FROM public.profiles WHERE user_id = v_user LIMIT 1) p
  RIGHT JOIN (SELECT 1) one ON true;  -- ensure single row even when profile missing

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- 5) Attach triggers to tracked tables.
--    Args: id_col, summary_col, comma-separated ignore_cols (or empty for default).

-- Defects & subtests (high-volume operational data)
DROP TRIGGER IF EXISTS trg_event_log_defect_items_upd ON public.defect_items;
CREATE TRIGGER trg_event_log_defect_items_upd
  AFTER UPDATE ON public.defect_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'issue_no', '');

DROP TRIGGER IF EXISTS trg_event_log_defect_items_del ON public.defect_items;
CREATE TRIGGER trg_event_log_defect_items_del
  AFTER DELETE ON public.defect_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'issue_no', '');

DROP TRIGGER IF EXISTS trg_event_log_subtests_upd ON public.subtests;
CREATE TRIGGER trg_event_log_subtests_upd
  AFTER UPDATE ON public.subtests
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'item_no', '');

DROP TRIGGER IF EXISTS trg_event_log_subtests_del ON public.subtests;
CREATE TRIGGER trg_event_log_subtests_del
  AFTER DELETE ON public.subtests
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'item_no', '');

-- Master data
DROP TRIGGER IF EXISTS trg_event_log_subcontractor_master_upd ON public.subcontractor_master;
CREATE TRIGGER trg_event_log_subcontractor_master_upd
  AFTER UPDATE ON public.subcontractor_master
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'name', '');

DROP TRIGGER IF EXISTS trg_event_log_subcontractor_master_del ON public.subcontractor_master;
CREATE TRIGGER trg_event_log_subcontractor_master_del
  AFTER DELETE ON public.subcontractor_master
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'name', '');

DROP TRIGGER IF EXISTS trg_event_log_hdec_pic_master_upd ON public.hdec_pic_master;
CREATE TRIGGER trg_event_log_hdec_pic_master_upd
  AFTER UPDATE ON public.hdec_pic_master
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'name', '');

DROP TRIGGER IF EXISTS trg_event_log_hdec_pic_master_del ON public.hdec_pic_master;
CREATE TRIGGER trg_event_log_hdec_pic_master_del
  AFTER DELETE ON public.hdec_pic_master
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'name', '');

DROP TRIGGER IF EXISTS trg_event_log_hdec_eng_master_upd ON public.hdec_eng_master;
CREATE TRIGGER trg_event_log_hdec_eng_master_upd
  AFTER UPDATE ON public.hdec_eng_master
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'name', '');

DROP TRIGGER IF EXISTS trg_event_log_hdec_eng_master_del ON public.hdec_eng_master;
CREATE TRIGGER trg_event_log_hdec_eng_master_del
  AFTER DELETE ON public.hdec_eng_master
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'name', '');

DROP TRIGGER IF EXISTS trg_event_log_system_master_upd ON public.system_master;
CREATE TRIGGER trg_event_log_system_master_upd
  AFTER UPDATE ON public.system_master
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'system_code', '');

DROP TRIGGER IF EXISTS trg_event_log_system_master_del ON public.system_master;
CREATE TRIGGER trg_event_log_system_master_del
  AFTER DELETE ON public.system_master
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'system_code', '');

DROP TRIGGER IF EXISTS trg_event_log_projects_upd ON public.projects;
CREATE TRIGGER trg_event_log_projects_upd
  AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'project_code', '');

DROP TRIGGER IF EXISTS trg_event_log_projects_del ON public.projects;
CREATE TRIGGER trg_event_log_projects_del
  AFTER DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'project_code', '');

-- Users / roles / permissions
DROP TRIGGER IF EXISTS trg_event_log_profiles_upd ON public.profiles;
CREATE TRIGGER trg_event_log_profiles_upd
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('user_id', 'login_id', '');

DROP TRIGGER IF EXISTS trg_event_log_profiles_del ON public.profiles;
CREATE TRIGGER trg_event_log_profiles_del
  AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('user_id', 'login_id', '');

DROP TRIGGER IF EXISTS trg_event_log_user_roles_upd ON public.user_roles;
CREATE TRIGGER trg_event_log_user_roles_upd
  AFTER UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'user_id', '');

DROP TRIGGER IF EXISTS trg_event_log_user_roles_del ON public.user_roles;
CREATE TRIGGER trg_event_log_user_roles_del
  AFTER DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'user_id', '');

DROP TRIGGER IF EXISTS trg_event_log_user_system_permissions_upd ON public.user_system_permissions;
CREATE TRIGGER trg_event_log_user_system_permissions_upd
  AFTER UPDATE ON public.user_system_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'user_id', '');

DROP TRIGGER IF EXISTS trg_event_log_user_system_permissions_del ON public.user_system_permissions;
CREATE TRIGGER trg_event_log_user_system_permissions_del
  AFTER DELETE ON public.user_system_permissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_log_record('id', 'user_id', '');

-- 6) Retention helper (called nightly from pg_cron in a separate insert)
CREATE OR REPLACE FUNCTION public.purge_old_event_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted int;
BEGIN
  WITH d AS (
    DELETE FROM public.event_log WHERE occurred_at < now() - interval '365 days'
    RETURNING 1
  )
  SELECT count(*) INTO deleted FROM d;
  RETURN deleted;
END;
$$;