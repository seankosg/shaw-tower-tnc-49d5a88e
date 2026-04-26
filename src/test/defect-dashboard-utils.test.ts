import { describe, expect, it } from 'vitest';
import {
  aggregateDefectPlanActualByGroup,
  type DefectForDashboard,
} from '@/lib/defect-dashboard-utils';

const makeDefect = (id: string, patch: Partial<DefectForDashboard>): DefectForDashboard => ({
  id,
  project_id: null,
  issue_no: id,
  subcontractor_issue_no: null,
  subcontractor_issue_source: null,
  main_trade: null,
  sub_trade: null,
  trade_detail: null,
  area_raw: null,
  area_type: null,
  area_level: null,
  area_location: null,
  description: null,
  defect_type: null,
  status: null,
  priority: null,
  team: 'TEAM-A',
  subcontractor_name: null,
  subsub_name: null,
  hdec_pic_name: null,
  hdec_eng_name: null,
  planned_start_date: null,
  planned_completion_date: null,
  planned_closure_date: null,
  actual_start_date: null,
  actual_completion_date: null,
  actual_closure_date: null,
  planned_progress_pct: null,
  actual_progress_pct: null,
  completion_status: null,
  closure_status: null,
  remarks: null,
  hdec_comments: null,
  work_type: null,
  classification_source: null,
  classified_at: null,
  source_upload_id: null,
  data_source_type: null,
  is_active: true,
  updated_by: null,
  updated_at: '2026-04-25T00:00:00Z',
  row_version: 1,
  ...patch,
});

describe('Defect Plan vs Actual — Data Date Delay', () => {
  it('counts only items planned exactly on Data Date and not done (completion stage)', () => {
    // Mirrors user-reported scenario:
    // - planned_completion_date 2026-04-24 (open) — should NOT count
    // - planned_completion_date 2026-04-25 (open) — SHOULD count
    // Data Date = 2026-04-25
    const rows = aggregateDefectPlanActualByGroup(
      [
        makeDefect('def-024', { planned_completion_date: '2026-04-24' }),
        makeDefect('def-025', { planned_completion_date: '2026-04-25' }),
      ],
      '2026-04-26',
      '2026-04-25',
      (d) => d.team ?? '',
      (k) => k,
    );

    const m = rows[0].completion;
    expect(m.dataDatePlan).toBe(1);
    expect(m.dataDateActual).toBe(0);
    expect(m.dataDateDelay).toBe(1);
    // |Δ| == dataDateDelay
    expect(Math.abs(m.dataDateActual - m.dataDatePlan)).toBe(m.dataDateDelay);
  });

  it('excludes items already done on Data Date from delay count', () => {
    const rows = aggregateDefectPlanActualByGroup(
      [
        makeDefect('def-open', { planned_completion_date: '2026-04-25' }),
        makeDefect('def-done', {
          planned_completion_date: '2026-04-25',
          actual_completion_date: '2026-04-25',
          actual_progress_pct: 100,
        }),
      ],
      '2026-04-26',
      '2026-04-25',
      (d) => d.team ?? '',
      (k) => k,
    );

    const m = rows[0].completion;
    expect(m.dataDatePlan).toBe(2);
    expect(m.dataDateActual).toBe(1);
    expect(m.dataDateDelay).toBe(1);
    expect(Math.abs(m.dataDateActual - m.dataDatePlan)).toBe(m.dataDateDelay);
  });

  it('applies the same day-specific rule to closure stage', () => {
    const rows = aggregateDefectPlanActualByGroup(
      [
        makeDefect('cl-024', { planned_closure_date: '2026-04-24' }),
        makeDefect('cl-025', { planned_closure_date: '2026-04-25' }),
      ],
      '2026-04-26',
      '2026-04-25',
      (d) => d.team ?? '',
      (k) => k,
    );

    const m = rows[0].closure;
    expect(m.dataDatePlan).toBe(1);
    expect(m.dataDateActual).toBe(0);
    expect(m.dataDateDelay).toBe(1);
  });
});
