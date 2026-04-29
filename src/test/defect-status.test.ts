import { describe, it, expect } from 'vitest';
import { computeCompletionStatus, computeClosureStatus, computeDefectStatuses, isValidDefectStatus, reconcileClosureCompletion, isStatusWorkDone, isStatusClosed } from '@/lib/defect-status';

const base = {
  planned_start_date: null,
  planned_completion_date: null,
  planned_closure_date: null,
  actual_start_date: null,
  actual_completion_date: null,
  actual_closure_date: null,
  planned_progress_pct: null,
  actual_progress_pct: null,
};

describe('isValidDefectStatus', () => {
  it('accepts the four enum values', () => {
    expect(isValidDefectStatus('Planned')).toBe(true);
    expect(isValidDefectStatus('Delay')).toBe(true);
    expect(isValidDefectStatus('Done')).toBe(true);
    expect(isValidDefectStatus('WIP')).toBe(true);
  });
  it('rejects others', () => {
    expect(isValidDefectStatus('done')).toBe(false);
    expect(isValidDefectStatus('Open')).toBe(false);
    expect(isValidDefectStatus(null)).toBe(false);
  });
});

describe('computeCompletionStatus', () => {
  const asOf = '2026-04-24';
  it('returns Done when actual_completion_date present', () => {
    expect(computeCompletionStatus({ ...base, actual_completion_date: '2026-04-20' }, asOf)).toBe('Done');
  });
  it('returns Done when actual_progress_pct >= 100', () => {
    expect(computeCompletionStatus({ ...base, actual_progress_pct: 100 }, asOf)).toBe('Done');
  });
  it('returns Planned before planned_start_date', () => {
    expect(computeCompletionStatus({ ...base, planned_start_date: '2026-05-01' }, asOf)).toBe('Planned');
  });
  it('returns Delay when actual_progress_pct < planned_progress_pct', () => {
    expect(computeCompletionStatus({ ...base, planned_progress_pct: 50, actual_progress_pct: 30 }, asOf)).toBe('Delay');
  });
  it('returns Delay when planned_completion_date is past and not done', () => {
    expect(computeCompletionStatus({ ...base, planned_completion_date: '2026-04-01', actual_progress_pct: 50, planned_progress_pct: 50 }, asOf)).toBe('Delay');
  });
  it('returns WIP when actual_progress_pct > 0 and on track', () => {
    expect(computeCompletionStatus({ ...base, planned_progress_pct: 30, actual_progress_pct: 40, planned_completion_date: '2026-12-01' }, asOf)).toBe('WIP');
  });
  it('returns Planned by default', () => {
    expect(computeCompletionStatus(base, asOf)).toBe('Planned');
  });
});

describe('computeClosureStatus', () => {
  const asOf = '2026-04-24';
  it('returns Done when actual_closure_date present', () => {
    expect(computeClosureStatus({ ...base, actual_closure_date: '2026-04-20' }, asOf, 'Done')).toBe('Done');
  });
  it('returns Done when LL Status === "Closed" even without actual_closure_date', () => {
    expect(computeClosureStatus({ ...base, status: 'Closed' }, asOf, 'Planned')).toBe('Done');
  });
  it('treats Status="Closed" case-insensitively and trims whitespace', () => {
    expect(computeClosureStatus({ ...base, status: 'closed' }, asOf, 'Planned')).toBe('Done');
    expect(computeClosureStatus({ ...base, status: '  CLOSED  ' }, asOf, 'Planned')).toBe('Done');
  });
  it('does not force Done when Status is Open / other', () => {
    expect(computeClosureStatus({ ...base, status: 'Open', planned_closure_date: '2026-12-01' }, asOf, 'WIP')).toBe('Planned');
  });
  it('returns Delay when planned_closure_date is past and no actual', () => {
    expect(computeClosureStatus({ ...base, planned_closure_date: '2026-04-01' }, asOf, 'Done')).toBe('Delay');
  });
  it('returns WIP when completion is Done but no actual_closure_date', () => {
    expect(computeClosureStatus({ ...base, planned_closure_date: '2026-12-01' }, asOf, 'Done')).toBe('WIP');
  });
  it('returns Planned otherwise', () => {
    expect(computeClosureStatus({ ...base, planned_closure_date: '2026-12-01' }, asOf, 'WIP')).toBe('Planned');
  });
});

describe('computeDefectStatuses', () => {
  it('chains completion -> closure correctly', () => {
    const r = computeDefectStatuses({ ...base, actual_progress_pct: 100, planned_closure_date: '2026-12-01' }, '2026-04-24');
    expect(r.completion_status).toBe('Done');
    expect(r.closure_status).toBe('WIP');
  });
});

describe('reconcileClosureCompletion', () => {
  const asOf = '2026-04-25';
  const noExcel = { actual_progress_pct: null, actual_completion_date: null };

  it('auto-fixes completion when closure_date triggers Done', () => {
    const r = reconcileClosureCompletion(
      { ...base, actual_closure_date: '2026-04-20' },
      asOf,
      noExcel,
    );
    expect(r.closure_status).toBe('Done');
    expect(r.completion_status).toBe('Done');
    expect(r.patch).toEqual({ actual_completion_date: '2026-04-20', actual_progress_pct: 100 });
  });

  it('uses asOf as completion_date when LL Status="Closed" but no closure_date', () => {
    const r = reconcileClosureCompletion(
      { ...base, status: 'Closed' },
      asOf,
      noExcel,
    );
    expect(r.closure_status).toBe('Done');
    expect(r.completion_status).toBe('Done');
    expect(r.patch?.actual_completion_date).toBe(asOf);
    expect(r.patch?.actual_progress_pct).toBe(100);
  });

  it('skips auto-fix when Excel explicitly provides actual_progress_pct < 100', () => {
    const r = reconcileClosureCompletion(
      { ...base, actual_closure_date: '2026-04-20', actual_progress_pct: 50 },
      asOf,
      { actual_progress_pct: 50, actual_completion_date: null },
    );
    expect(r.closure_status).toBe('Done');
    expect(r.completion_status).not.toBe('Done');
    expect(r.patch).toBeUndefined();
    expect(r.conflict).toBe(true);
  });

  it('skips auto-fix when Excel explicitly provides actual_completion_date but progress < 100', () => {
    // completion_date set + pct=80 → completion is Done by date rule, no conflict path triggered.
    // Real conflict: closure done via LL status="Closed" (no closure_date) but Excel says pct=80, no completion_date.
    const r = reconcileClosureCompletion(
      { ...base, status: 'Closed', actual_progress_pct: 80 },
      asOf,
      { actual_progress_pct: 80, actual_completion_date: null },
    );
    expect(r.closure_status).toBe('Done');
    expect(r.conflict).toBe(true);
    expect(r.patch).toBeUndefined();
  });

  it('does nothing when closure is not Done', () => {
    const r = reconcileClosureCompletion(
      { ...base, planned_closure_date: '2026-12-01' },
      asOf,
      noExcel,
    );
    expect(r.closure_status).not.toBe('Done');
    expect(r.patch).toBeUndefined();
    expect(r.conflict).toBeUndefined();
  });

  it('does nothing when both already Done', () => {
    const r = reconcileClosureCompletion(
      { ...base, actual_closure_date: '2026-04-20', actual_completion_date: '2026-04-15', actual_progress_pct: 100 },
      asOf,
      { actual_progress_pct: 100, actual_completion_date: '2026-04-15' },
    );
    expect(r.completion_status).toBe('Done');
    expect(r.closure_status).toBe('Done');
    expect(r.patch).toBeUndefined();
    expect(r.conflict).toBeUndefined();
  });
});

describe('Aconex Status auto-mapping', () => {
  const asOf = '2026-04-25';
  const noExcel = { actual_progress_pct: null, actual_completion_date: null };

  it('isStatusWorkDone matches case/whitespace insensitively', () => {
    expect(isStatusWorkDone('Work Done')).toBe(true);
    expect(isStatusWorkDone('  work done  ')).toBe(true);
    expect(isStatusWorkDone('WORK DONE')).toBe(true);
    expect(isStatusWorkDone('Open')).toBe(false);
    expect(isStatusWorkDone(null)).toBe(false);
  });

  it('Status="Work Done" → completion=Done even with no actual_completion_date / pct', () => {
    expect(computeCompletionStatus({ ...base, status: 'Work Done' }, asOf)).toBe('Done');
  });

  it('Status="Closed" → completion=Done as well', () => {
    expect(computeCompletionStatus({ ...base, status: 'Closed' }, asOf)).toBe('Done');
  });

  it('Status="Open" → no auto-mapping (falls through to default)', () => {
    expect(computeCompletionStatus({ ...base, status: 'Open' }, asOf)).toBe('Planned');
  });

  it('Status="In dispute" → no auto-mapping', () => {
    expect(computeCompletionStatus({ ...base, status: 'In dispute' }, asOf)).toBe('Planned');
  });

  it('reconcile: Status="Work Done" + no completion data → patches actual_completion_date=asOf, pct=100', () => {
    const r = reconcileClosureCompletion(
      { ...base, status: 'Work Done', planned_closure_date: '2026-12-01' },
      asOf,
      noExcel,
    );
    expect(r.completion_status).toBe('Done');
    expect(r.closure_status).toBe('WIP'); // completion done, no actual_closure_date
    expect(r.patch).toEqual({ actual_completion_date: asOf, actual_progress_pct: 100 });
  });

  it('reconcile: Status="Work Done" but Excel says pct=50 → conflict, no patch', () => {
    const r = reconcileClosureCompletion(
      { ...base, status: 'Work Done', actual_progress_pct: 50 },
      asOf,
      { actual_progress_pct: 50, actual_completion_date: null },
    );
    expect(r.completion_status).toBe('Done');
    expect(r.conflict).toBe(true);
    expect(r.patch).toBeUndefined();
  });

  it('reconcile: Status="Open" → no patch, falls through to existing logic', () => {
    const r = reconcileClosureCompletion(
      { ...base, status: 'Open', planned_closure_date: '2026-12-01' },
      asOf,
      noExcel,
    );
    expect(r.completion_status).toBe('Planned');
    expect(r.closure_status).toBe('Planned');
    expect(r.patch).toBeUndefined();
    expect(r.conflict).toBeUndefined();
  });

  it('reconcile: Status="Work Done" + actual_completion_date already present → no patch needed', () => {
    const r = reconcileClosureCompletion(
      { ...base, status: 'Work Done', actual_completion_date: '2026-04-20' },
      asOf,
      noExcel,
    );
    expect(r.completion_status).toBe('Done');
    expect(r.patch).toBeUndefined();
    expect(r.conflict).toBeUndefined();
  });
});
