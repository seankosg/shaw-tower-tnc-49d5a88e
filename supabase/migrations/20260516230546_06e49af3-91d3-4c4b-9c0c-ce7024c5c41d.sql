-- Canonical "active subtests" view for all statistics / dashboard / report
-- consumers. Hides soft-deleted rows (is_active=false) so future code that
-- queries `subtests_active` cannot accidentally include them.
--
-- The view runs with `security_invoker = true` so it respects the caller's
-- RLS context against the base `subtests` table (no privilege escalation).
CREATE OR REPLACE VIEW public.subtests_active
WITH (security_invoker = true)
AS
SELECT *
FROM public.subtests
WHERE is_active = true;

COMMENT ON VIEW public.subtests_active IS
  'Active subtests only (is_active = true). Use for all statistics, dashboards, simulations, and reports. Inactive rows are soft-deleted and must be excluded from population counts. See .lovable/plan.md (Option B).';
