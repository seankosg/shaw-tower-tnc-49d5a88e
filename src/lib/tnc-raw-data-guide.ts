// T&C Raw Data Business Guide — included as an appendix in exported reports.
// Authored as part of the executive guidance handed to the LLM.
export const TNC_RAW_DATA_GUIDE_MD = `## Appendix A — T&C Raw Data Business Guide

### 1. What T&C Raw Data Represents

T&C stands for **Test & Commissioning**. In a construction project, it covers the full process of verifying that completed equipment/systems operate correctly, then formally reporting and obtaining Client approval of those results.

The atomic tracking unit is a **Subtest = \`Item No + MOS Code\`**.

- **Item No**: the test item (e.g. pump start-up test)
- **MOS Code**: Method of Statement code (test procedure number)
- A single Item can be split across multiple MOS, so the pair defines one "discrete test instance."

The business workflow has **5 stages**:

\`\`\`
Predecessor → Pre-Test (T1) → Actual Test (T2) → R1 (Sub→HDEC Report) → Test Report (R2: HDEC→Client)
\`\`\`

---

### 2. Column Meanings

**Identification & Classification**

| Column | Meaning |
|---|---|
| \`item_no\` / \`mos_code\` | Keys defining a Subtest |
| \`system_id\` | Parent System (joined to \`system_master.system_code\`) |
| \`level\` / \`equipment\` / \`description\` | Location / equipment / description |
| \`team\` | Responsible team (Mech / Elec / I&C, etc.) |
| \`subcontractor_name\` / \`subsub_name\` / \`hdec_pic_name\` | Subcontractor / Sub-sub / HDEC PIC |
| \`is_critical\` | Flagged as a critical item (surfaced in the Critical Watchlist) |

**Stage-by-stage Schedule & Status** (each stage carries Planned / Actual / Status)

| Stage | Meaning | Columns |
|---|---|---|
| Pred | Test prerequisites (construction complete, punch cleared, etc.) | \`pred_planned_date\`, \`pred_actual_date\`, \`pred_status\`, \`predecessor_status_raw\` |
| Pre-Test (T1) | Internal test by Subcontractor / HDEC | \`t1_planned_date\`, \`t1_actual_date\`, \`t1_status\` |
| Actual Test (T2) | Official test witnessed by the Client | \`t2_planned_date\`, \`t2_actual_date\`, \`t2_status\` |
| R1 — Sub → HDEC Report | Subcontractor submits the test report to HDEC | \`r1_target_submission_date\`, \`r1_actual_submission_date\`, \`r1_status\` |
| Test Report (R2) | HDEC issues the final Test Report to the Client and obtains approval | \`r2_target_submission_date\`, \`r2_actual_submission_date\`, \`r2_target_approval_date\`, \`r2_actual_approval_date\`, \`r2_status\` |

**Status values**

- Tests (Pred/T1/T2): \`Planned\` / \`WIP\` / \`Done\` / \`Hold\`
- Reports (R1/R2): \`Planned\` / \`Under Review\` / \`Submitted\` / \`Approved\`, etc.

**Done determination rules** (\`stage-metrics.ts\`)

- T1/T2/Pred: \`status === 'Done'\`
- R1: Done if \`status\` is in the Done family, OR if \`status\` is empty but \`actual_submission_date\` is present
- Test Report (R2): Done when \`r2_status\` is \`Submitted\` or higher
- R2 Approval: Done only when \`r2_status === 'Approved'\` (hidden in UI; only the Test Report stage is exposed)

---

### 3. Dashboard Cards — Meaning & Computation

Every figure is anchored to two reference points:

- **Data Date**: the reference date of the most recently imported daily snapshot (\`upload_batches.data_date\`) — basis for Plan/Actual and Overdue judgments
- **Today**: the actual current date — basis for At-Risk judgments

**Tier 1 — Overall Summary (top KPIs)**

| Card | Formula |
|---|---|
| Systems | distinct \`system_id\` count across active subtests |
| Total Subtests | total active Subtests |
| Done | count where \`t2_status === 'Done'\` (T2 completion = the test itself is complete) |
| Progress % | \`Done / Total × 100\` |
| Overdue | \`isOverdue(s, dataDate)\` — any of Pred/T1/T2 with \`planned_date ≤ Data Date\` and not yet Done |
| At-Risk | \`isAtRisk(s, today, threshold)\` — not Overdue, but a Pred/T1/T2 planned date falls within N days from \`today\` (threshold configured in Settings) |

**Tier 2 — Stage Cards (Pred / T1 / T2 / R1 / R2S)**

Each card shows three numbers per stage:

- **Done**: subtests where the stage is Done
- **OD (Overdue)**: \`planned_date ≤ Data Date\` but stage not yet Done
- **%**: \`Done / Total × 100\`

The R2 card uses **R2 Submission (R2S)** (Approval is hidden from the UI).

**Tier 3 — All-Stage Alert Banner**

While Tier 1 Overdue/At-Risk focus on the "test execution" stages (Pred/T1/T2), this banner spans all 5 stages including R1/R2.

- \`overdueCountAll\`: subtests with at least one of the 5 stages Overdue (de-duplicated by subtest)
- \`overdueOccurrencesAll\`: each delayed stage counted separately, so one subtest can contribute multiple times (= sum of OD badges shown on Tier 2 cards)

**Plan vs Actual Breakdown** (System / Subcontractor / Sub-Sub / HDEC PIC / Team tabs)

For each group × each stage, six metrics are produced (\`aggregatePlanActualByGroup\`):

- **cumPlan / cumActual**: cumulative planned / cumulative actual through Data Date
- **dataDatePlan / dataDateActual / dataDateDelay**: planned / actual / delayed exactly on Data Date
- **todayPlan / todayActual / todayDelay**: planned / actual / delayed exactly on today

Reading: a negative cumulative variance (\`cumActual − cumPlan\`) means the group is behind plan. Rows are sorted from worst-behind to best.

**S-Curve**

\`buildSCurve\` produces cumulative planned vs actual curves bucketed by day or week.

- Separate curves for T1 and T2
- Bar chart per bucket decomposes into **Met** (achieved) / **Shortfall** (under-delivered) / **Excess** (over-delivered)
- Future buckets show only the grey "FuturePlan" segment; actuals are null

**Top Overdue (top 10)**

The 10 most-delayed Subtests on Pred/T1/T2 basis. Delay days = \`Data Date − planned_date\` (max across stages).

**Pie Charts**

Distributions of \`t1_status\` and \`t2_status\` split into Done / WIP / Planned / Hold.

**Critical Items Panel**

Subtests flagged \`is_critical = true\`, showing current state (T2 Done → T1 Done → otherwise the live status), together with the user and timestamp that registered the flag.

---

### 4. Relationship to the Progress Page

The Progress page reads the same data but presents it as per-stage timelines and daily trends:

- Per-Subtest comparison of stage planned vs actual
- Stages are sequential (Pred → T1 → T2), so if T2 is Done, T1 and Pred are auto-treated as Done (cascade)
- The Simulation page (\`tnc-simulation.ts\`) forecasts "what % will be complete on a target date" under **Optimistic** or **Penalty** modes — Optimistic assumes delayed items still finish on their original planned date; Penalty excludes delayed items from the forecast

---

In summary, one row of T&C Raw Data = "the 5-stage test & report schedule and actuals for one Subtest", and the Dashboard aggregates this data along five lenses: (1) per-stage completion, (2) plan-vs-actual delay, (3) distribution by responsible party / system, (4) S-Curve trend, and (5) Critical management.
`;
