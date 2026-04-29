CREATE OR REPLACE FUNCTION public.sync_all_subcontractor_counters(_project_id uuid)
RETURNS TABLE(out_owner_code text, out_next_seq int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH used AS (
    SELECT
      upper((regexp_match(di.subcontractor_issue_no, '^SC-([A-Z0-9]+)-'))[1]) AS oc,
      max(((regexp_match(di.subcontractor_issue_no, '^SC-[A-Z0-9]+-(\d+)$'))[1])::int) AS max_used
    FROM public.defect_items di
    WHERE di.is_active = true
      AND di.project_id = _project_id
      AND di.subcontractor_issue_no ~ '^SC-[A-Z0-9]+-\d+$'
    GROUP BY 1
  ),
  upserted AS (
    INSERT INTO public.subcontractor_issue_counters AS c (project_id, owner_code, next_seq, updated_at)
    SELECT _project_id, u.oc, u.max_used + 1, now() FROM used u
    ON CONFLICT (project_id, owner_code) DO UPDATE
      SET next_seq = GREATEST(c.next_seq, EXCLUDED.next_seq),
          updated_at = CASE WHEN EXCLUDED.next_seq > c.next_seq THEN now() ELSE c.updated_at END
    RETURNING c.owner_code AS oc, c.next_seq AS ns
  )
  SELECT u.oc, u.ns FROM upserted u;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_all_subcontractor_counters(uuid) TO authenticated;

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT id FROM public.projects WHERE is_active = true LOOP
    PERFORM public.sync_all_subcontractor_counters(p.id);
  END LOOP;
END $$;