-- Token-based area parser implemented in PL/pgSQL, mirroring src/lib/defect-parser.ts
-- (parseArea + canonicalLevel + isLevelToken). Used to backfill existing rows.

CREATE OR REPLACE FUNCTION public._is_level_token(v text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR btrim(v) = '' THEN false
    ELSE btrim(v) ~* '^(level\s*-?\s*\d+[a-z]?|lvl\s*-?\s*\d+[a-z]?|l\s*\d+[a-z]?|b\s*\d+|basement(\s*\d+)?|roof(\s|$).*|rf|ground(\s+floor)?|gf|mezzanine(\s*\d*)?|attic|penthouse|ph)$'
  END;
$$;

CREATE OR REPLACE FUNCTION public._canonical_level(v text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text := btrim(coalesce(v, ''));
  m text[];
BEGIN
  IF t = '' THEN RETURN NULL; END IF;
  -- numeric level forms: Level/Lvl/L  N[suffix]
  m := regexp_match(t, '^(?:level|lvl|l)\s*-?\s*(\d+)([a-z]?)$', 'i');
  IF m IS NOT NULL THEN
    RETURN 'Level ' || lpad(m[1], 2, '0') || upper(coalesce(m[2], ''));
  END IF;
  -- basement code: B<n>
  m := regexp_match(t, '^b\s*(\d+)$', 'i');
  IF m IS NOT NULL THEN
    RETURN 'B' || m[1];
  END IF;
  -- title-case named levels
  RETURN initcap(regexp_replace(t, '\s+', ' ', 'g'));
END;
$$;

CREATE OR REPLACE FUNCTION public._compare_key(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(regexp_replace(coalesce(v, ''), '\s+', ' ', 'g')));
$$;

CREATE OR REPLACE FUNCTION public._parse_area(area text)
RETURNS TABLE(area_type text, area_level text, area_location text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  trimmed text[] := ARRAY[]::text[];
  p text;
  level_idx int := 0;
  level_canonical text;
  type_val text;
  tail text[] := ARRAY[]::text[];
  loc_val text;
BEGIN
  IF area IS NULL OR btrim(area) = '' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  parts := string_to_array(area, '>');
  FOREACH p IN ARRAY parts LOOP
    p := btrim(p);
    IF p <> '' THEN
      trimmed := array_append(trimmed, p);
    END IF;
  END LOOP;

  IF array_length(trimmed, 1) IS NULL THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- find first level token
  FOR i IN 1 .. array_length(trimmed, 1) LOOP
    IF public._is_level_token(trimmed[i]) THEN
      level_idx := i;
      EXIT;
    END IF;
  END LOOP;

  IF level_idx > 0 THEN
    level_canonical := public._canonical_level(trimmed[level_idx]);
    IF level_idx > 1 THEN
      type_val := trimmed[level_idx - 1];
    ELSE
      type_val := trimmed[1];
    END IF;
    -- tail = parts after level, excluding any other level tokens or duplicates of the canonical level
    IF level_idx < array_length(trimmed, 1) THEN
      FOR i IN (level_idx + 1) .. array_length(trimmed, 1) LOOP
        IF NOT public._is_level_token(trimmed[i])
           AND public._compare_key(trimmed[i]) <> public._compare_key(level_canonical) THEN
          tail := array_append(tail, trimmed[i]);
        END IF;
      END LOOP;
    END IF;
    IF array_length(tail, 1) IS NULL THEN
      loc_val := NULL;
    ELSE
      loc_val := array_to_string(tail, ' > ');
    END IF;
    RETURN QUERY SELECT type_val, level_canonical, loc_val;
    RETURN;
  END IF;

  -- no level token detected — keep type, no level, location = remaining
  IF array_length(trimmed, 1) = 1 THEN
    RETURN QUERY SELECT trimmed[1], NULL::text, NULL::text;
    RETURN;
  END IF;

  DECLARE
    useful text[];
    loc text;
  BEGIN
    IF array_length(trimmed, 1) >= 4 THEN
      useful := trimmed[2:array_length(trimmed, 1)];
    ELSE
      useful := trimmed;
    END IF;
    type_val := useful[1];
    IF array_length(useful, 1) > 1 THEN
      loc := array_to_string(useful[2:array_length(useful, 1)], ' > ');
    ELSE
      loc := NULL;
    END IF;
    RETURN QUERY SELECT type_val, NULL::text, loc;
    RETURN;
  END;
END;
$$;