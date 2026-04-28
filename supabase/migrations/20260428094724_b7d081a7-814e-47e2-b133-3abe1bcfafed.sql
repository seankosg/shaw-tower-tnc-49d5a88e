-- Step 1: Sync counters to actual max+1 per (project_id, owner_code) so re-allocations
-- never collide with already-used SC numbers.
WITH used AS (
  SELECT
    project_id,
    upper((regexp_match(subcontractor_issue_no, '^SC-([A-Z0-9]+)-'))[1]) AS owner_code,
    max(((regexp_match(subcontractor_issue_no, '^SC-[A-Z0-9]+-(\d+)$'))[1])::int) AS max_used
  FROM public.defect_items
  WHERE is_active = true
    AND subcontractor_issue_no ~ '^SC-[A-Z0-9]+-\d+$'
  GROUP BY 1, 2
)
INSERT INTO public.subcontractor_issue_counters (project_id, owner_code, next_seq, updated_at)
SELECT project_id, owner_code, max_used + 1, now() FROM used
ON CONFLICT (project_id, owner_code) DO UPDATE
  SET next_seq = GREATEST(public.subcontractor_issue_counters.next_seq, EXCLUDED.next_seq),
      updated_at = now();

-- Step 2: Disable user triggers (responsibility check blocks system-level updates).
ALTER TABLE public.defect_items DISABLE TRIGGER USER;

-- Step 3: Reissue mismatched SC numbers.
DO $$
DECLARE
  rec RECORD;
  new_seq INT;
  new_sc_no TEXT;
  total_done INT := 0;
BEGIN
  FOR rec IN
    WITH targets AS (
      SELECT
        d.id,
        d.project_id,
        d.issue_no,
        d.subcontractor_issue_no AS old_sc,
        d.subcontractor_name,
        d.subsub_name,
        upper((regexp_match(d.subcontractor_issue_no, '^SC-([A-Z0-9]+)-'))[1]) AS old_owner,
        upper(COALESCE(
          (SELECT owner_code FROM public.subcontractor_master m
            WHERE m.is_active AND m.type = 'subsub'
              AND lower(btrim(m.name)) = lower(btrim(d.subsub_name)) LIMIT 1),
          (SELECT owner_code FROM public.subcontractor_master m
            WHERE m.is_active AND (m.type = 'sub' OR m.type IS NULL)
              AND lower(btrim(m.name)) = lower(btrim(d.subcontractor_name)) LIMIT 1),
          'UNASSIGNED'
        )) AS new_owner
      FROM public.defect_items d
      WHERE d.is_active = true
        AND d.subcontractor_issue_no IS NOT NULL
    )
    SELECT *
    FROM targets
    WHERE old_owner IS DISTINCT FROM new_owner
    ORDER BY project_id, new_owner, issue_no
  LOOP
    SELECT (public.allot_subcontractor_issue_no(rec.project_id, rec.new_owner, 1))[1]
      INTO new_seq;
    new_sc_no := 'SC-' || rec.new_owner || '-' || lpad(new_seq::text, 5, '0');

    UPDATE public.defect_items
       SET subcontractor_issue_no = new_sc_no,
           subcontractor_issue_source = 'reissued_migration',
           updated_at = now(),
           row_version = row_version + 1
     WHERE id = rec.id;

    INSERT INTO public.sc_no_history (
      defect_id, issue_no,
      old_subcontractor_issue_no, new_subcontractor_issue_no,
      old_subcontractor_name, new_subcontractor_name,
      old_owner_code, new_owner_code,
      reason, changed_by
    ) VALUES (
      rec.id, rec.issue_no,
      rec.old_sc, new_sc_no,
      NULL, rec.subcontractor_name,
      rec.old_owner, rec.new_owner,
      'one_off_migration_2026_04', NULL
    );

    total_done := total_done + 1;
  END LOOP;

  RAISE NOTICE 'Reissued % defect rows', total_done;
END $$;

-- Step 4: Re-enable triggers.
ALTER TABLE public.defect_items ENABLE TRIGGER USER;