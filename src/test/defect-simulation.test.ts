import { describe, it, expect } from 'vitest';
import {
  simulateDefectStageAt,
  buildDefectSimulationSeries,
  type SimOptions,
} from '@/lib/defect-simulation';
import type { DefectItem } from '@/lib/defect-utils';

function mk(over: Partial<DefectItem>): DefectItem {
  return {
    id: 'x', project_id: null, issue_no: 'I',
    subcontractor_issue_no: null, subcontractor_issue_source: null,
    main_trade: null, sub_trade: null, trade_detail: null,
    area_raw: null, area_type: null, area_level: null, area_location: null,
    description: null, defect_type: null, status: null, priority: null, team: null,
    subcontractor_name: null, subsub_name: null, hdec_pic_name: null, hdec_eng_name: null,
    planned_start_date: null, planned_completion_date: null, planned_closure_date: null,
    actual_start_date: null, actual_completion_date: null, actual_closure_date: null,
    planned_progress_pct: null, actual_progress_pct: null,
    completion_status: null, closure_status: null,
    remarks: null, hdec_comments: null, aconex_comments: null,
    work_type: null, classification_source: null, classified_at: null,
    source_upload_id: null, data_source_type: null, is_active: true,
    updated_by: null, updated_at: '2026-01-01', row_version: 1,
    ...over,
  };
}

const optsOpt = (dataDate = '2026-01-01'): SimOptions => ({ mode: 'optimistic', dataDate });

describe('simulateDefectStageAt', () => {
  const items: DefectItem[] = [
    mk({ id: '1', planned_completion_date: '2026-01-05', actual_completion_date: '2026-01-04' }),
    mk({ id: '2', planned_completion_date: '2026-02-10' }),
    mk({ id: '3', planned_completion_date: '2026-04-01' }),
    mk({ id: '4' }),
  ];

  it('counts done + forecast for completion stage at target', () => {
    const r = simulateDefectStageAt(items, 'completion', '2026-03-01', optsOpt());
    expect(r.total).toBe(4);
    expect(r.doneActual).toBe(1);
    expect(r.forecast).toBe(1);
    expect(r.predicted).toBe(2);
    expect(r.planOnly).toBe(2);
    expect(r.noPlan).toBe(1);
    expect(r.predictedPct).toBe(50);
  });

  it('handles empty population safely', () => {
    const r = simulateDefectStageAt([], 'completion', '2026-03-01', optsOpt());
    expect(r.total).toBe(0);
    expect(r.predictedPct).toBe(0);
  });

  it('cascade fallback: completion-done item with no actual_start_date counts in start.doneActual', () => {
    const items: DefectItem[] = [
      mk({ id: 'c1', actual_completion_date: '2026-01-10' }),
    ];
    const r = simulateDefectStageAt(items, 'start', '2026-02-01', optsOpt());
    expect(r.doneActual).toBe(1);
    expect(r.forecast).toBe(0);
  });

  it('cascade fallback: closure-done item with no start/completion actual counts in both', () => {
    const items: DefectItem[] = [
      mk({ id: 'cl1', actual_closure_date: '2026-01-15' }),
    ];
    const rs = simulateDefectStageAt(items, 'start', '2026-02-01', optsOpt());
    const rc = simulateDefectStageAt(items, 'completion', '2026-02-01', optsOpt());
    const rcl = simulateDefectStageAt(items, 'closure', '2026-02-01', optsOpt());
    expect(rs.doneActual).toBe(1);
    expect(rc.doneActual).toBe(1);
    expect(rcl.doneActual).toBe(1);
  });

  it('done by progress_pct alone (no actual dates) stays out of doneActual', () => {
    const items: DefectItem[] = [
      mk({ id: 'p1', actual_progress_pct: 100, planned_completion_date: '2026-02-20' }),
    ];
    const r = simulateDefectStageAt(items, 'completion', '2026-02-01', optsOpt());
    expect(r.doneActual).toBe(0);
    expect(r.forecast).toBe(0);
  });
});

describe('Delay handling modes', () => {
  // 1 delayed item: planned in past, not done
  const items: DefectItem[] = [
    mk({ id: 'd1', planned_completion_date: '2026-01-10' }),
  ];
  const dataDate = '2026-02-01';
  const target = '2026-02-15';

  it('A optimistic: delayed item still counted in forecast at original planned date', () => {
    const r = simulateDefectStageAt(items, 'completion', target, { mode: 'optimistic', dataDate });
    expect(r.delayedCount).toBe(1);
    expect(r.forecast).toBe(1);
  });

  it('B shift-today: delayed item counted in forecast (target ≥ dataDate)', () => {
    const r = simulateDefectStageAt(items, 'completion', target, { mode: 'shift-today', dataDate });
    expect(r.delayedCount).toBe(1);
    expect(r.forecast).toBe(1);
  });

  it('B shift-today: delayed item NOT counted when target < dataDate', () => {
    const r = simulateDefectStageAt(items, 'completion', '2026-01-20', { mode: 'shift-today', dataDate });
    expect(r.forecast).toBe(0);
  });

  it('C penalty: delayed item excluded from forecast', () => {
    const r = simulateDefectStageAt(items, 'completion', target, { mode: 'penalty', dataDate });
    expect(r.delayedCount).toBe(1);
    expect(r.forecast).toBe(0);
    expect(r.predicted).toBe(0);
  });

  it('D learned: lag shifts effective date forward', () => {
    // lag 10d → ef = 2026-01-10 + 10 = 2026-01-20, target=2026-02-15 → counted
    const r1 = simulateDefectStageAt(items, 'completion', target,
      { mode: 'learned', dataDate, lagDays: { completion: 10 } });
    expect(r1.forecast).toBe(1);
    // big lag pushes ef beyond target → not counted
    const r2 = simulateDefectStageAt(items, 'completion', target,
      { mode: 'learned', dataDate, lagDays: { completion: 90 } });
    expect(r2.forecast).toBe(0);
  });
});

describe('buildDefectSimulationSeries', () => {
  it('produces one point per day in range and splits past/future', () => {
    const items = [mk({ planned_completion_date: '2026-01-03', actual_completion_date: '2026-01-02' })];
    const pts = buildDefectSimulationSeries(items, '2026-01-01', '2026-01-04', '2026-01-02', optsOpt('2026-01-02'));
    expect(pts.length).toBe(4);
    expect(pts[0].date).toBe('2026-01-01');
    expect(pts[1].completion_actual).toBe(100);
    expect(pts[1].completion_predicted).toBeNull();
    expect(pts[3].completion_predicted).toBe(100);
    expect(pts[3].completion_actual).toBeNull();
  });
});
