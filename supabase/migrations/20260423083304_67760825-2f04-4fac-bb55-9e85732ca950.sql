ALTER TABLE public.subcontractor_master
ADD COLUMN IF NOT EXISTS owner_code text;

CREATE OR REPLACE FUNCTION public.normalize_owner_code(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(upper(regexp_replace(coalesce(_value, ''), '[^A-Za-z0-9]+', '', 'g')), '')
$$;

CREATE OR REPLACE FUNCTION public.suggest_owner_code(_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  cleaned text;
  token text;
  code text := '';
BEGIN
  cleaned := upper(regexp_replace(coalesce(_name, ''), '[^A-Za-z0-9 ]+', ' ', 'g'));
  cleaned := regexp_replace(cleaned, '\s+', ' ', 'g');

  FOREACH token IN ARRAY regexp_split_to_array(trim(cleaned), ' ') LOOP
    IF token NOT IN ('CO','LTD','INC','CORP','CORPORATION','COMPANY','LLC','GROUP','ENG','ENGINEERING','THE','AND') THEN
      code := code || token;
    END IF;
    EXIT WHEN length(code) >= 12;
  END LOOP;

  IF code = '' THEN
    code := regexp_replace(cleaned, '[^A-Z0-9]+', '', 'g');
  END IF;

  code := left(code, 12);
  IF length(code) < 2 THEN
    code := 'UNASSIGNED';
  END IF;

  RETURN code;
END;
$$;

WITH ranked AS (
  SELECT
    id,
    public.suggest_owner_code(name) AS base_code,
    row_number() OVER (PARTITION BY public.suggest_owner_code(name) ORDER BY created_at, id) AS rn
  FROM public.subcontractor_master
  WHERE owner_code IS NULL OR trim(owner_code) = ''
)
UPDATE public.subcontractor_master sm
SET owner_code = CASE
  WHEN ranked.rn = 1 THEN ranked.base_code
  ELSE left(ranked.base_code, greatest(2, 12 - length(ranked.rn::text))) || ranked.rn::text
END
FROM ranked
WHERE sm.id = ranked.id;

UPDATE public.subcontractor_master
SET owner_code = public.normalize_owner_code(owner_code)
WHERE owner_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subcontractor_master_owner_code_unique
ON public.subcontractor_master (lower(trim(owner_code)))
WHERE owner_code IS NOT NULL
  AND trim(owner_code) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS defect_items_subcontractor_issue_unique
ON public.defect_items (
  coalesce(project_id::text, ''),
  lower(trim(subcontractor_issue_no))
)
WHERE subcontractor_issue_no IS NOT NULL
  AND trim(subcontractor_issue_no) <> ''
  AND is_active = true;