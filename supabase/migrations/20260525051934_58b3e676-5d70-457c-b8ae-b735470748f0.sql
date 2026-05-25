CREATE OR REPLACE FUNCTION public.migrate_existing_punch_to_groups(p_project_id uuid, p_dry_run boolean DEFAULT true)
RETURNS TABLE(parent_item_no text, child_count int, action text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_parent_id uuid;
  v_first_team text;
BEGIN
  FOR r IN
    SELECT
      regexp_replace(item_no, '\.[^.]+$', '') AS prefix,
      COUNT(*) AS cnt,
      array_agg(id ORDER BY item_no) AS ids
    FROM public.punch_items
    WHERE project_id = p_project_id
      AND parent_id IS NULL
      AND is_summary = false
      AND item_no ~ '\.[^.]+$'
    GROUP BY 1
    HAVING COUNT(*) >= 2
  LOOP
    IF EXISTS (SELECT 1 FROM public.punch_items WHERE project_id = p_project_id AND item_no = r.prefix) THEN
      parent_item_no := r.prefix; child_count := r.cnt; action := 'skipped_prefix_exists'; RETURN NEXT;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      parent_item_no := r.prefix; child_count := r.cnt; action := 'would_group'; RETURN NEXT;
    ELSE
      SELECT team::text INTO v_first_team FROM public.punch_items WHERE id = r.ids[1];
      INSERT INTO public.punch_items (project_id, item_no, is_summary, outstanding_work, team)
      VALUES (p_project_id, r.prefix, true, 'Auto-grouped: ' || r.prefix, v_first_team::team_type)
      RETURNING id INTO v_parent_id;

      UPDATE public.punch_items
        SET parent_id = v_parent_id, subtask_stage = 'physical_work'
        WHERE id = ANY(r.ids);

      parent_item_no := r.prefix; child_count := r.cnt; action := 'grouped'; RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;