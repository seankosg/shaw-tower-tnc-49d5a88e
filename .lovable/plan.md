## Goal

Extend the T&C Raw Data **Progress** icon column from the current 3 stages (**Pred → T1 → T2**) to **5 stages** by appending:

- **R1** — Subcontractor submitted report to HDEC (uses `r1_status` / `r1_target_submission_date` / `r1_actual_submission_date`).
- **R2A** — Client approved HDEC's report (uses `r2_status` / `r2_target_approval_date` / `r2_actual_approval_date`).

Per the user's request, only R1 and R2A are added (R2 Submission "R2S" is intentionally skipped — only the final approval matters as the closing milestone).

## Scope

Affects only `src/components/shared/StageProgress.tsx` (shared icon) and its caller `src/pages/SubtestList.tsx` (T&C Raw Data page). Does not touch the Defect equivalent (`DefectStageProgress.tsx`).

## Changes

### 1. `src/components/shared/StageProgress.tsx`

- Extend `StageProgressProps` with optional R1/R2A fields:
  - `r1Status`, `r1ActualSubmissionDate`, `r1TargetSubmissionDate`
  - `r2Status`, `r2ActualApprovalDate`, `r2TargetApprovalDate`
- Pass these into the `StageMetricRow` shape consumed by `isStageDone` / `isStageDelayedAsOf` from `@/lib/stage-metrics` (already supports `r1` and `r2a` stage keys — no library change needed).
- Classify two new pips:
  - **R1**: done when `isR1Done(r1_status)` (Submitted / Under Review / Approved) — already handled in `stage-metrics`.
  - **R2A**: done when `isR2Done(r2_status)` (Approved) — already handled.
  - WIP/Planned/Hold/Empty derived the same way as existing stages.
- Render the row of pips as: `Pred ─ T1 ─ T2 ─ R1 ─ R2A` with the same connector dashes.
- Extend the Tooltip to include R1 and R2A lines (label + actual or planned date via `formatDdMmm`).
- Update `StageProgressLegend` footer text from `Stages: Pred → T1 → T2` to `Stages: Pred → T1 → T2 → R1 → R2A`.
- Keep all new props optional so any other (currently none beyond SubtestList) caller continues to work; missing data renders as the "empty" pip.

### 2. `src/pages/SubtestList.tsx`

- The DB select (line 624) already pulls all needed R1/R2 columns — no query change.
- In the Progress column cell (≈ line 758), pass the additional props:
  ```tsx
  <StageProgress
    /* existing props */
    r1Status={row.original.r1_status}
    r1ActualSubmissionDate={row.original.r1_actual_submission_date}
    r1TargetSubmissionDate={row.original.r1_target_submission_date}
    r2Status={row.original.r2_status}
    r2ActualApprovalDate={row.original.r2_actual_approval_date}
    r2TargetApprovalDate={row.original.r2_target_approval_date}
    asOfDate={dataDate}
  />
  ```
- Optional: extend the `sortingFn` for the Progress column to also weight R1 (8) and R2A (16) so sorting reflects all 5 stages.
- Optional: bump the column `size` slightly (e.g. 110 → 160) to fit two extra pips + connectors comfortably.

### 3. Out of scope

- `DefectStageProgress.tsx` (Defect module) — not requested.
- `stage-metrics.ts` — already contains `r1` / `r2s` / `r2a` logic; no change needed.
- DB schema, imports, edge functions, exports — unaffected.

## Visual Result

```text
Before:  ● ─ ● ─ ◐
         Pred  T1   T2

After:   ● ─ ● ─ ◐ ─ ○ ─ ○
         Pred  T1   T2   R1   R2A
```

Tooltip will list all 5 stages with their actual or planned dates and the "Delay as of" reference date, identical in style to the existing Pred/T1/T2 entries.
