# Schedule Revision: T2→R1, R1→R2 successor mapping

## Status: Implemented (Option B — full range)

### Changes
1. **`schedule_change_audit` table** — added 9 columns:
   - `r1_old_date`, `r1_new_date`, `r1_diff_days`, `r1_prev_gap_days`, `r1_cur_gap_days`
   - `r2s_old_date`, `r2s_new_date`, `r2s_diff_days`, `r2s_prev_gap_days` (R2 Sub is the last tracked stage → no Cur.Gap)

2. **`src/lib/schedule-change-utils.ts`** — extended `Stage` to include `r1` and `r2s`, extended `PlannedDates` with R1/R2 target submission fields, and updated successor mapping:
   - Pred → T1
   - T1 → T2
   - T2 → R1 Target Submission
   - R1 → R2 Target Submission
   - R2 Sub → (final, no successor)

3. **`src/contexts/ImportContext.tsx`** — Existing select now loads R1/R2 target submission dates; `buildScheduleChangeImpact()` receives them; audit insert payload writes the new R1/R2 columns; subtest_change_log entries now also recorded for R1/R2 target submission changes.

4. **`src/pages/ScheduleRevisionPage.tsx`** — Added R1 Sub and R2 Sub stage column groups (R2 Sub omits Cur.Gap), updated header description and table min width.
