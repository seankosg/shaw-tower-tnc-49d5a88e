# One-Time Migration: T&C Remarks → Comments

Move existing `remarks` content from the `subtests` table into the new `subtest_comments` system as proper threaded comments.

## Scope

- **Source**: `subtests.remarks` (38 active rows with non-empty remarks)
- **Destination**: `subtest_comments` table as `type = 'comment'`
- **One-time only**: Idempotent — safe to re-run without creating duplicates

## Migration Logic

For each active subtest where `remarks` is not null/empty:

1. **Author resolution**:
   - Use `subtests.updated_by` if set (12 rows)
   - Fallback to admin (`5633327d-5c37-4188-b96d-7814bc83ef42`) if null (26 rows)

2. **Duplicate protection**:
   - Skip if a comment with the same trimmed message already exists for that subtest

3. **Insert**:
   - `subtest_id`, `author_user_id`, `message = trim(remarks)`, `type = 'comment'`, `parent_comment_id = NULL`
   - `created_at` = original `subtests.updated_at` (preserves chronological context)

4. **Clear remarks** (optional — included): After successful insert, set `subtests.remarks = NULL` so the data isn't duplicated in two places. The Raw Data view will then show comments as the source of truth.

## Technical Steps

A single SQL migration file:

```sql
-- Insert remarks as comments
INSERT INTO public.subtest_comments
  (subtest_id, author_user_id, message, type, created_at, updated_at)
SELECT
  s.id,
  COALESCE(s.updated_by, '5633327d-5c37-4188-b96d-7814bc83ef42'::uuid),
  trim(s.remarks),
  'comment',
  COALESCE(s.updated_at, now()),
  COALESCE(s.updated_at, now())
FROM public.subtests s
WHERE s.is_active = true
  AND s.remarks IS NOT NULL
  AND trim(s.remarks) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.subtest_comments sc
    WHERE sc.subtest_id = s.id
      AND sc.message = trim(s.remarks)
  );

-- Clear migrated remarks
UPDATE public.subtests
SET remarks = NULL
WHERE is_active = true
  AND remarks IS NOT NULL
  AND trim(remarks) <> '';
```

## Expected Outcome

- ~38 new rows in `subtest_comments`
- 38 rows in `subtests` will have `remarks` cleared
- All comments visible in the new T&C comment UI on the Subtest Detail page
- Comment count badges appear in the Subtest List view

## Confirm Before Proceeding

Do you want to **clear** `subtests.remarks` after migration (recommended, avoids duplicate display), or **keep** the original `remarks` values intact alongside the new comments?