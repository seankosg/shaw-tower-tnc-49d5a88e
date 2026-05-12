import { describe, it, expect } from 'vitest';
import { simulateDefectStageAt, buildDefectSimulationSeries } from '@/lib/defect-simulation';
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

describe('simulateDefectStageAt', () => {
  const items: DefectItem[] = [
    // already completed before target
    mk({ id: '1', planned_completion_date: '2026-01-05', actual_completion_date: '2026-01-04' }),
    // planned in future ≤ target → forecast counts
    mk({ id: '2', planned_completion_date: '2026-02-10' }),
    // planned beyond target → not counted
    mk({ id: '3', planned_completion_date: '2026-04-01' }),
    // no planned date → noPlan
    mk({ id: '4' }),
  ];

  it('counts done + forecast for completion stage at target', () => {
    const r = simulateDefectStageAt(items, 'completion', '2026-03-01');
    expect(r.total).toBe(4);
    expect(r.doneActual).toBe(1);
    expect(r.forecast).toBe(1);
    expect(r.predicted).toBe(2);
    expect(r.planOnly).toBe(2); // items 1 and 2
    expect(r.noPlan).toBe(1);
    expect(r.predictedPct).toBe(50);
  });

  it('handles empty population safely', () => {
    const r = simulateDefectStageAt([], 'completion', '2026-03-01');
    expect(r.total).toBe(0);
    expect(r.predictedPct).toBe(0);
  });
});

describe('buildDefectSimulationSeries', () => {
  it('produces one point per day in range and splits past/future', () => {
    const items = [mk({ planned_completion_date: '2026-01-03', actual_completion_date: '2026-01-02' })];
    const pts = buildDefectSimulationSeries(items, '2026-01-01', '2026-01-04', '2026-01-02');
    expect(pts.length).toBe(4);
    expect(pts[0].date).toBe('2026-01-01');
    // past day: actual present, predicted null
    expect(pts[1].completion_actual).toBe(100);
    expect(pts[1].completion_predicted).toBeNull();
    // future day: predicted present, actual null
    expect(pts[3].completion_predicted).toBe(100);
    expect(pts[3].completion_actual).toBeNull();
  });
});
