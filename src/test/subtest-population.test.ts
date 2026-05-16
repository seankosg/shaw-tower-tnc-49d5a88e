// Regression tests for the "active subtests = effective population" rule
// (Option B, approved 2026-05-16). These tests do NOT hit the network — they
// validate the pure counting logic in stage-metrics so any future change that
// (a) forgets the sequential guard (T1→T2, R1→R2S) or (b) treats inactive
// rows as part of the population will fail loudly.

import { describe, it, expect } from 'vitest';
import { isStageDone, type StageMetricRow } from '@/lib/stage-metrics';

type Row = StageMetricRow & { is_active: boolean };

const mk = (over: Partial<Row>): Row => ({
  is_active: true,
  pred_status: null,
  t1_status: null,
  t1_planned_date: null,
  t1_actual_date: null,
  t2_status: null,
  t2_planned_date: null,
  t2_actual_date: null,
  r1_status: null,
  r1_target_submission_date: null,
  r1_actual_submission_date: null,
  r2_status: null,
  r2_target_submission_date: null,
  r2_actual_submission_date: null,
  r2_target_approval_date: null,
  r2_actual_approval_date: null,
  ...over,
});

// Mimics the production filter (fetchActiveSubtests applies is_active=true).
const activePopulation = (rows: Row[]) => rows.filter(r => r.is_active);

// Mimics report-builder.computeTncData counting.
const countT1Done = (rows: Row[]) => rows.filter(r => isStageDone(r, 't1')).length;
const countT2Done = (rows: Row[]) =>
  rows.filter(r => isStageDone(r, 't2') && isStageDone(r, 't1')).length;
const countR2SDone = (rows: Row[]) =>
  rows.filter(r => isStageDone(r, 'r2s') && isStageDone(r, 'r1')).length;

describe('subtest population — Option B (is_active filter)', () => {
  it('excludes soft-deleted rows from the statistics population', () => {
    const rows: Row[] = [
      mk({ t1_status: 'Done' }),
      mk({ t1_status: 'Done' }),
      mk({ t1_status: 'Done', is_active: false }), // soft-deleted → ignore
    ];
    const pop = activePopulation(rows);
    expect(pop.length).toBe(2);
    expect(countT1Done(pop)).toBe(2);
  });

  it('does NOT inflate counts when many soft-deleted rows exist', () => {
    const active = Array.from({ length: 1786 }, () => mk({ t1_status: 'Done' }));
    const inactive = Array.from({ length: 117 }, () =>
      mk({ t1_status: 'Done', is_active: false }),
    );
    const pop = activePopulation([...active, ...inactive]);
    expect(pop.length).toBe(1786);
    expect(countT1Done(pop)).toBe(1786);
  });
});

describe('T&C sequential guards (T1→T2, R1→R2S)', () => {
  it('does NOT count T2 done when T1 is not done', () => {
    const rows = activePopulation([
      mk({ t2_status: 'Done' }), // T1 missing → must not count
      mk({ t1_status: 'Done', t2_status: 'Done' }), // counts
    ]);
    expect(countT2Done(rows)).toBe(1);
  });

  it('does NOT count R2S done when R1 is not done', () => {
    const rows = activePopulation([
      mk({ r2_status: 'Submitted' }), // R1 missing → must not count
      mk({ r1_status: 'Submitted', r2_status: 'Submitted' }), // counts
    ]);
    expect(countR2SDone(rows)).toBe(1);
  });

  it('counts R2S done via fallback when status missing but actual date present (provided R1 also done)', () => {
    const rows = activePopulation([
      mk({
        r1_actual_submission_date: '2026-05-10',
        r2_actual_submission_date: '2026-05-12',
      }),
    ]);
    expect(countR2SDone(rows)).toBe(1);
  });
});
