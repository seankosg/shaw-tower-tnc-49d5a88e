-- 1) Defect comment summary: per-type counts + last activity
DROP FUNCTION IF EXISTS public.get_defect_comment_summary(uuid[]);
CREATE OR REPLACE FUNCTION public.get_defect_comment_summary(_defect_ids uuid[])
RETURNS TABLE (
  defect_id uuid,
  comment_count integer,
  has_unread boolean,
  instruction_count integer,
  comment_count_only integer,
  reply_count integer,
  last_activity_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      c.defect_id,
      c.id,
      c.type,
      c.parent_comment_id,
      c.created_at,
      c.updated_at
    FROM public.defect_comments c
    WHERE c.defect_id = ANY(_defect_ids)
  ),
  reads AS (
    SELECT defect_id, last_read_at
    FROM public.defect_comment_reads
    WHERE user_id = auth.uid()
      AND defect_id = ANY(_defect_ids)
  )
  SELECT
    b.defect_id,
    COUNT(*)::int AS comment_count,
    bool_or(
      GREATEST(b.created_at, COALESCE(b.updated_at, b.created_at))
        > COALESCE((SELECT last_read_at FROM reads r WHERE r.defect_id = b.defect_id), 'epoch'::timestamptz)
    ) AS has_unread,
    COUNT(*) FILTER (WHERE b.type = 'instruction')::int AS instruction_count,
    COUNT(*) FILTER (WHERE b.type = 'comment' AND b.parent_comment_id IS NULL)::int AS comment_count_only,
    COUNT(*) FILTER (WHERE b.type = 'reply' OR b.parent_comment_id IS NOT NULL)::int AS reply_count,
    MAX(GREATEST(b.created_at, COALESCE(b.updated_at, b.created_at))) AS last_activity_at
  FROM base b
  GROUP BY b.defect_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_defect_comment_summary(uuid[]) TO authenticated;

-- 2) Subtest comment summary: per-type counts + last activity
DROP FUNCTION IF EXISTS public.get_subtest_comment_summary(uuid[]);
CREATE OR REPLACE FUNCTION public.get_subtest_comment_summary(_subtest_ids uuid[])
RETURNS TABLE (
  subtest_id uuid,
  comment_count integer,
  has_unread boolean,
  instruction_count integer,
  comment_count_only integer,
  reply_count integer,
  last_activity_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      c.subtest_id,
      c.id,
      c.type,
      c.parent_comment_id,
      c.created_at,
      c.updated_at
    FROM public.subtest_comments c
    WHERE c.subtest_id = ANY(_subtest_ids)
  ),
  reads AS (
    SELECT subtest_id, last_read_at
    FROM public.subtest_comment_reads
    WHERE user_id = auth.uid()
      AND subtest_id = ANY(_subtest_ids)
  )
  SELECT
    b.subtest_id,
    COUNT(*)::int AS comment_count,
    bool_or(
      GREATEST(b.created_at, COALESCE(b.updated_at, b.created_at))
        > COALESCE((SELECT last_read_at FROM reads r WHERE r.subtest_id = b.subtest_id), 'epoch'::timestamptz)
    ) AS has_unread,
    COUNT(*) FILTER (WHERE b.type = 'instruction')::int AS instruction_count,
    COUNT(*) FILTER (WHERE b.type = 'comment' AND b.parent_comment_id IS NULL)::int AS comment_count_only,
    COUNT(*) FILTER (WHERE b.type = 'reply' OR b.parent_comment_id IS NOT NULL)::int AS reply_count,
    MAX(GREATEST(b.created_at, COALESCE(b.updated_at, b.created_at))) AS last_activity_at
  FROM base b
  GROUP BY b.subtest_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_subtest_comment_summary(uuid[]) TO authenticated;

-- 3) Seed virtual meta fields into defect_field_config
INSERT INTO public.defect_field_config (field_name, display_name, source_origin, is_enabled, is_required, sort_order)
VALUES
  ('_meta_instruction_count', 'Instructions', 'system', true,  false, 9100),
  ('_meta_comment_count',     'Comments',     'system', true,  false, 9110),
  ('_meta_reply_count',       'Replies',      'system', false, false, 9120),
  ('_meta_last_activity_at',  'Last Activity','system', false, false, 9130)
ON CONFLICT (field_name) DO NOTHING;

-- 4) Seed virtual meta fields into field_config (T&C)
INSERT INTO public.field_config (field_name, display_name, is_enabled, is_required, sort_order)
VALUES
  ('_meta_instruction_count', 'Instructions',  true,  false, 9100),
  ('_meta_comment_count',     'Comments',      true,  false, 9110),
  ('_meta_reply_count',       'Replies',       false, false, 9120),
  ('_meta_last_activity_at',  'Last Activity', false, false, 9130)
ON CONFLICT (field_name) DO NOTHING;