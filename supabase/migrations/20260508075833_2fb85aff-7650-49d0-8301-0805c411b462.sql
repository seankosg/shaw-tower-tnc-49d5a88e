
-- Batched edit-scope RPCs: return per-row scope for many ids in a single round trip.
-- Both functions reuse the existing per-row functions to guarantee identical semantics.

CREATE OR REPLACE FUNCTION public.get_subtest_edit_scope_bulk(_user_id uuid, _ids uuid[])
RETURNS TABLE(id uuid, scope text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id, public.get_subtest_edit_scope(_user_id, t.id) AS scope
  FROM unnest(_ids) AS t(id);
$$;

CREATE OR REPLACE FUNCTION public.get_defect_edit_scope_bulk(_user_id uuid, _ids uuid[])
RETURNS TABLE(id uuid, scope text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.id, public.get_defect_edit_scope(_user_id, t.id) AS scope
  FROM unnest(_ids) AS t(id);
$$;

GRANT EXECUTE ON FUNCTION public.get_subtest_edit_scope_bulk(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_defect_edit_scope_bulk(uuid, uuid[]) TO authenticated;
