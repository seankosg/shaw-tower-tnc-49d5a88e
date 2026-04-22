import { describe, expect, it } from 'vitest';
import { aggregatePlanActualByGroup, type SubtestForDashboard } from '@/lib/dashboard-utils';
import { getStagePlannedDate } from '@/lib/stage-metrics';

const makeSubtest = (id: string, patch: Partial<SubtestForDashboard>): SubtestForDashboard => ({
  id,
  item_no: id,
  mos_code: 'MOS',
  system_id: 'sys-a',
  subcontractor_name: null,
  subsub_name: null,
  hdec_pic_name: null,
  t1_status: 'Planned',
  t2_status: 'Planned',
  t1_planned_date: null,
  t1_actual_date: null,
  t2_planned_date: null,
  t2_actual_date: null,
  pred_status: null,
  pred_planned_date: null,
  pred_actual_date: null,
  predecessor_status_raw: null,
  team: null,
  ...patch,
});

describe('Plan vs Actual stage date aggregation', () => {
  it('maps each stage to its own planned date field', () => {
    const row = makeSubtest('mapping', {
      pred_planned_date: '2026-04-20',
      t1_planned_date: '2026-04-21',
      t2_planned_date: '2026-04-22',
    });

    expect(getStagePlannedDate(row, 'pred')).toBe('2026-04-20');
    expect(getStagePlannedDate(row, 't1')).toBe('2026-04-21');
    expect(getStagePlannedDate(row, 't2')).toBe('2026-04-22');
  });

  it('counts Data Date Plan and Today Plan separately per stage', () => {
    const rows = aggregatePlanActualByGroup([
      makeSubtest('pred-data-date', { pred_status: 'Planned', pred_planned_date: '2026-04-21' }),
      makeSubtest('pred-today', { pred_status: 'Planned', pred_planned_date: '2026-04-22' }),
      makeSubtest('t1-data-date', { t1_planned_date: '2026-04-21' }),
      makeSubtest('t1-today', { t1_planned_date: '2026-04-22' }),
      makeSubtest('t2-data-date', { t2_planned_date: '2026-04-21' }),
      makeSubtest('t2-today', { t2_planned_date: '2026-04-22' }),
    ], '2026-04-22', '2026-04-21', s => s.system_id, k => k);

    const row = rows[0];
    expect(row.predecessor.dataDatePlan).toBe(1);
    expect(row.predecessor.todayPlan).toBe(1);
    expect(row.t1.dataDatePlan).toBe(1);
    expect(row.t1.todayPlan).toBe(1);
    expect(row.t2.dataDatePlan).toBe(1);
    expect(row.t2.todayPlan).toBe(1);
  });

  it('counts Today Delay only for items planned today and not done', () => {
    const rows = aggregatePlanActualByGroup([
      makeSubtest('t1-past-open', { t1_status: 'Planned', t1_planned_date: '2026-04-19' }),
      makeSubtest('t1-today-open', { t1_status: 'Planned', t1_planned_date: '2026-04-22' }),
      makeSubtest('t1-today-done', { t1_status: 'Done', t1_planned_date: '2026-04-22', t1_actual_date: '2026-04-22' }),
    ], '2026-04-22', '2026-04-21', s => s.system_id, k => k);

    const row = rows[0];
    expect(row.t1.todayPlan).toBe(2);
    expect(row.t1.todayDelay).toBe(1);
    expect(row.t1.dataDateDelay).toBe(1);
  });

  it('keeps Today Delay at zero when Today Plan is zero', () => {
    const rows = aggregatePlanActualByGroup([
      makeSubtest('t1-past-open-1', { t1_status: 'Planned', t1_planned_date: '2026-04-19' }),
      makeSubtest('t1-past-open-2', { t1_status: 'Planned', t1_planned_date: '2026-04-20' }),
    ], '2026-04-22', '2026-04-21', s => s.system_id, k => k);

    const row = rows[0];
    expect(row.t1.todayPlan).toBe(0);
    expect(row.t1.todayDelay).toBe(0);
    expect(row.t1.dataDateDelay).toBe(2);
  });
});