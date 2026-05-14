import { describe, it, expect } from 'vitest';
import {
  simulateTncStageAt,
  buildTncSimulationSeries,
  type SimOptions,
} from '@/lib/tnc-simulation';
import type { SubtestForDashboard } from '@/lib/dashboard-utils';

function mk(over: Partial<SubtestForDashboard>): SubtestForDashboard {
  return {
    id: 'x',
    item_no: 'I',
    mos_code: 'M',
    system_id: 's',
    subcontractor_name: null,
    subsub_name: null,
    hdec_pic_name: null,
    t1_status: null,
    t2_status: null,
    t1_planned_date: null,
    t1_actual_date: null,
    t2_planned_date: null,
    t2_actual_date: null,
    pred_status: null,
    pred_planned_date: null,
    pred_actual_date: null,
    team: null,
    r1_status: null,
    r1_target_submission_date: null,
    r1_actual_submission_date: null,
    r2_status: null,
    r2_target_submission_date: null,
    r2_actual_submission_date: null,
    r2_target_approval_date: null,
    r2_actual_approval_date: null,
    ...over,
  };
}

const optsOpt = (dataDate = '2026-01-01'): SimOptions => ({ mode: 'optimistic', dataDate });

describe('simulateTncStageAt — T1', () => {
  const items: SubtestForDashboard[] = [
    mk({ id: '1', t1_planned_date: '2026-01-05', t1_actual_date: '2026-01-04', t1_status: 'Done' as any }),
    mk({ id: '2', t1_planned_date: '2026-02-10' }),
    mk({ id: '3', t1_planned_date: '2026-04-01' }),
    mk({ id: '4' }),
  ];

  it('counts done + forecast at target', () => {
    const r = simulateTncStageAt(items, 't1', '2026-03-01', optsOpt());
    expect(r.total).toBe(4);
    expect(r.doneActual).toBe(1);
    expect(r.forecast).toBe(1);
    expect(r.predicted).toBe(2);
    expect(r.planOnly).toBe(2);
    expect(r.noPlan).toBe(1);
    expect(r.predictedPct).toBe(50);
  });

  it('handles empty population safely', () => {
    const r = simulateTncStageAt([], 't1', '2026-03-01', optsOpt());
    expect(r.total).toBe(0);
    expect(r.predictedPct).toBe(0);
  });
});

describe('Delay handling modes — R2A', () => {
  // 1 delayed item: planned in past, not done
  const items: SubtestForDashboard[] = [
    mk({ id: 'd1', r2_target_approval_date: '2026-01-10' }),
  ];
  const dataDate = '2026-02-01';
  const target = '2026-02-15';

  it('A optimistic: delayed item still counted in forecast at original planned date', () => {
    const r = simulateTncStageAt(items, 'r2a', target, { mode: 'optimistic', dataDate });
    expect(r.delayedCount).toBe(1);
    expect(r.forecast).toBe(1);
  });

  it('C penalty: delayed item excluded from forecast', () => {
    const r = simulateTncStageAt(items, 'r2a', target, { mode: 'penalty', dataDate });
    expect(r.delayedCount).toBe(1);
    expect(r.forecast).toBe(0);
    expect(r.predicted).toBe(0);
  });
});

describe('buildTncSimulationSeries', () => {
  it('produces one point per day in range and splits past/future', () => {
    const items = [mk({
      t2_planned_date: '2026-01-03',
      t2_actual_date: '2026-01-02',
      t2_status: 'Done' as any,
    })];
    const pts = buildTncSimulationSeries(items, '2026-01-01', '2026-01-04', '2026-01-02', optsOpt('2026-01-02'));
    expect(pts.length).toBe(4);
    expect(pts[0].date).toBe('2026-01-01');
    expect(pts[1].t2_actual).toBe(100);
    expect(pts[1].t2_predicted).toBeNull();
    expect(pts[3].t2_predicted).toBe(100);
    expect(pts[3].t2_actual).toBeNull();
  });
});

describe('B1 — status done without actual date', () => {
  it('counts R1 Under Review (no actual_submission_date) toward Done now', () => {
    const items: SubtestForDashboard[] = [
      mk({ id: '1', r1_status: 'Under Review' as any, r1_target_submission_date: '2026-01-10' }),
    ];
    const r = simulateTncStageAt(items, 'r1', '2026-02-01', optsOpt('2026-01-15'));
    expect(r.doneActual).toBe(1);
    expect(r.predicted).toBe(1);
    expect(r.forecast).toBe(0);
  });

  it('does not count when target < dataDate (effective date = dataDate)', () => {
    const items: SubtestForDashboard[] = [
      mk({ id: '1', r1_status: 'Under Review' as any }),
    ];
    const r = simulateTncStageAt(items, 'r1', '2026-01-10', optsOpt('2026-01-15'));
    expect(r.doneActual).toBe(0);
  });
});

describe('B3 — sequential guard', () => {
  const orphanT2 = mk({
    id: 'orphan',
    t2_planned_date: '2026-01-05',
    t2_actual_date: '2026-01-04',
    t2_status: 'Done' as any,
    // T1 missing entirely
  });

  it('default (no enforce): orphan T2 counted as done', () => {
    const r = simulateTncStageAt([orphanT2], 't2', '2026-02-01', optsOpt());
    expect(r.doneActual).toBe(1);
  });

  it('enforceSequential: orphan T2 NOT counted as done', () => {
    const r = simulateTncStageAt([orphanT2], 't2', '2026-02-01',
      { ...optsOpt(), enforceSequential: true });
    expect(r.doneActual).toBe(0);
  });
});
