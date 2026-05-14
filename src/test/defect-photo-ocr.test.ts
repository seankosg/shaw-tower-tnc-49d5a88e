import { describe, it, expect } from 'vitest';
import { decideUpdate, mergeAconexComment, VERIFIED_BY_HDEC, type ExistingDefectMin } from '@/lib/defect-photo-ocr';

const base: ExistingDefectMin = {
  id: 'x', issue_no: '5426', team: 'Elec',
  actual_start_date: null, actual_completion_date: null, aconex_comments: null,
  row_version: 1, project_id: 'p',
};

describe('mergeAconexComment', () => {
  it('returns plain phrase when empty', () => {
    expect(mergeAconexComment(null, '2026-05-14')).toBe(VERIFIED_BY_HDEC);
    expect(mergeAconexComment('', '2026-05-14')).toBe(VERIFIED_BY_HDEC);
  });
  it('does not double-append same exact phrase', () => {
    expect(mergeAconexComment(VERIFIED_BY_HDEC, '2026-05-14')).toBe(VERIFIED_BY_HDEC);
  });
  it('appends with date stamp when prior content exists', () => {
    expect(mergeAconexComment('Initial review', '2026-05-14')).toBe('Initial review\n[2026-05-14] Verified by HDEC');
  });
  it('does not duplicate same dated stamp', () => {
    const once = mergeAconexComment('Initial review', '2026-05-14');
    expect(mergeAconexComment(once, '2026-05-14')).toBe(once);
  });
});

describe('decideUpdate', () => {
  it('not_found when DB row missing', () => {
    expect(decideUpdate(null, '2026-05-14', 1).kind).toBe('not_found');
  });
  it('skip_completed when actual_completion_date already set', () => {
    expect(decideUpdate({ ...base, actual_completion_date: '2026-05-10' }, '2026-05-14', 1).kind).toBe('skip_completed');
  });
  it('needs_review when confidence below threshold', () => {
    expect(decideUpdate(base, '2026-05-14', 0.5).kind).toBe('needs_review');
  });
  it('update keeps existing actual_start when present', () => {
    const r = decideUpdate({ ...base, actual_start_date: '2026-05-01' }, '2026-05-14', 0.9);
    expect(r.kind).toBe('update');
    expect(r.payload?.actual_start_date).toBe('2026-05-01');
    expect(r.payload?.actual_completion_date).toBe('2026-05-14');
    expect(r.payload?.aconex_comments).toBe(VERIFIED_BY_HDEC);
  });
  it('update fills actual_start with dataDate when missing', () => {
    const r = decideUpdate(base, '2026-05-14', 1);
    expect(r.payload?.actual_start_date).toBe('2026-05-14');
  });
});
