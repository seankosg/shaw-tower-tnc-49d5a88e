-- =====================================================
-- P1~P4: SC번호 발번 SSOT 마이그레이션
-- =====================================================

-- ---------- A. 카운터 테이블 ----------
CREATE TABLE IF NOT EXISTS public.subcontractor_issue_counters (
  project_id  uuid NOT NULL,
  owner_code  text NOT NULL,
  next_seq    integer NOT NULL DEFAULT 1,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, owner_code)
);

ALTER TABLE public.subcontractor_issue_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read issue counters"
  ON public.subcontractor_issue_counters
  FOR SELECT
  TO authenticated
  USING (true);

-- (INSERT/UPDATE/DELETE는 SECURITY DEFINER RPC를 통해서만 수행)

-- ---------- B. 원자 발번 RPC ----------
CREATE OR REPLACE FUNCTION public.allot_subcontractor_issue_no(
  _project_id uuid,
  _owner_code text,
  _count integer DEFAULT 1
) RETURNS integer[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm_owner text;
  _start integer;
  _result integer[];
  i integer;
BEGIN
  IF _project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required';
  END IF;
  IF _count IS NULL OR _count < 1 THEN
    RAISE EXCEPTION 'count must be >= 1';
  END IF;

  _norm_owner := upper(coalesce(nullif(btrim(_owner_code), ''), 'UNASSIGNED'));

  INSERT INTO public.subcontractor_issue_counters (project_id, owner_code, next_seq, updated_at)
  VALUES (_project_id, _norm_owner, _count + 1, now())
  ON CONFLICT (project_id, owner_code) DO UPDATE
    SET next_seq   = public.subcontractor_issue_counters.next_seq + _count,
        updated_at = now()
  RETURNING (next_seq - _count) INTO _start;

  _result := ARRAY[]::integer[];
  FOR i IN 0.._count - 1 LOOP
    _result := _result || (_start + i);
  END LOOP;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.allot_subcontractor_issue_no(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allot_subcontractor_issue_no(uuid, text, integer) TO authenticated;

-- 카운터를 수동입력 SC번호로 끌어올림
CREATE OR REPLACE FUNCTION public.bump_subcontractor_issue_counter(
  _project_id uuid,
  _owner_code text,
  _used_seq integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm_owner text;
  _new_next integer;
BEGIN
  IF _project_id IS NULL OR _used_seq IS NULL OR _used_seq < 1 THEN
    RETURN NULL;
  END IF;

  _norm_owner := upper(coalesce(nullif(btrim(_owner_code), ''), 'UNASSIGNED'));

  INSERT INTO public.subcontractor_issue_counters (project_id, owner_code, next_seq, updated_at)
  VALUES (_project_id, _norm_owner, _used_seq + 1, now())
  ON CONFLICT (project_id, owner_code) DO UPDATE
    SET next_seq   = GREATEST(public.subcontractor_issue_counters.next_seq, _used_seq + 1),
        updated_at = now()
  RETURNING next_seq INTO _new_next;

  RETURN _new_next;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_subcontractor_issue_counter(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_subcontractor_issue_counter(uuid, text, integer) TO authenticated;

-- ---------- C. project_id 기본값 트리거 ----------
CREATE OR REPLACE FUNCTION public.fn_defect_items_default_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active_count integer;
  _only_id uuid;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*), max(id)
  INTO _active_count, _only_id
  FROM public.projects
  WHERE is_active = true;

  IF _active_count = 1 THEN
    NEW.project_id := _only_id;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'project_id is required (no single active project to default to)';
END;
$$;

DROP TRIGGER IF EXISTS trg_defect_items_default_project ON public.defect_items;
CREATE TRIGGER trg_defect_items_default_project
  BEFORE INSERT ON public.defect_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_defect_items_default_project();

-- ---------- D. 백필 → NOT NULL → 인덱스 단순화 ----------
UPDATE public.defect_items
SET project_id = (SELECT id FROM public.projects WHERE is_active = true LIMIT 1)
WHERE project_id IS NULL
  AND (SELECT count(*) FROM public.projects WHERE is_active = true) = 1;

ALTER TABLE public.defect_items
  ALTER COLUMN project_id SET NOT NULL;

DROP INDEX IF EXISTS public.defect_items_subcontractor_issue_unique;
CREATE UNIQUE INDEX defect_items_subcontractor_issue_unique
  ON public.defect_items (project_id, lower(btrim(subcontractor_issue_no)))
  WHERE subcontractor_issue_no IS NOT NULL
    AND btrim(subcontractor_issue_no) <> ''
    AND is_active = true;

-- ---------- E. owner_code 정규화 트리거 ----------
CREATE OR REPLACE FUNCTION public.fn_subcontractor_master_normalize_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_code IS NOT NULL THEN
    NEW.owner_code := upper(btrim(NEW.owner_code));
    IF NEW.owner_code = '' THEN NEW.owner_code := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subcontractor_master_norm_owner ON public.subcontractor_master;
CREATE TRIGGER trg_subcontractor_master_norm_owner
  BEFORE INSERT OR UPDATE ON public.subcontractor_master
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_subcontractor_master_normalize_owner();

-- ---------- F. 카운터 시드 (기존 SC번호 → 카운터 동기화) ----------
INSERT INTO public.subcontractor_issue_counters (project_id, owner_code, next_seq, updated_at)
SELECT
  d.project_id,
  upper(m[1]) AS owner_code,
  MAX(m[2]::integer) + 1 AS next_seq,
  now()
FROM public.defect_items d
CROSS JOIN LATERAL regexp_match(coalesce(btrim(d.subcontractor_issue_no), ''), '^SC-([A-Z0-9]+)-(\d+)$', 'i') AS m
WHERE d.is_active = true
  AND d.subcontractor_issue_no IS NOT NULL
  AND m IS NOT NULL
GROUP BY d.project_id, upper(m[1])
ON CONFLICT (project_id, owner_code) DO UPDATE
  SET next_seq = GREATEST(public.subcontractor_issue_counters.next_seq, EXCLUDED.next_seq),
      updated_at = now();