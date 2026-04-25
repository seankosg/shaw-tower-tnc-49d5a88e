-- One-off backfill: recompute area_type/area_level/area_location from area_raw
-- using the new token-based parser. Done inside a migration so it runs as the
-- DB owner and bypasses the user-facing responsibility-update trigger.

ALTER TABLE public.defect_items DISABLE TRIGGER USER;

WITH src AS (
  SELECT d.id,
         p.area_type     AS new_type,
         p.area_level    AS new_level,
         p.area_location AS new_loc
  FROM public.defect_items d
  CROSS JOIN LATERAL public._parse_area(d.area_raw) p
  WHERE d.is_active = true
    AND d.area_raw IS NOT NULL
    AND (
         coalesce(d.area_type, '')     IS DISTINCT FROM coalesce(p.area_type, '')
      OR coalesce(d.area_level, '')    IS DISTINCT FROM coalesce(p.area_level, '')
      OR coalesce(d.area_location, '') IS DISTINCT FROM coalesce(p.area_location, '')
    )
)
UPDATE public.defect_items d
SET area_type     = s.new_type,
    area_level    = s.new_level,
    area_location = s.new_loc,
    updated_at    = now()
FROM src s
WHERE d.id = s.id;

ALTER TABLE public.defect_items ENABLE TRIGGER USER;