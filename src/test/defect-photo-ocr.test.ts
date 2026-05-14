import { describe, it, expect } from 'vitest';
import { decideUpdate, mergeAconexComment, computeGroupBands, VERIFIED_BY_HDEC, type ExistingDefectMin } from '@/lib/defect-photo-ocr';

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

describe('computeGroupBands', () => {
  it('single group → band centered on caption_y', () => {
    const bands = computeGroupBands([0.5]);
    expect(bands).toHaveLength(1);
    expect(bands[0].yTop).toBeCloseTo(0.32, 5); // 0.5 - 0.18
    expect(bands[0].yBottom).toBeCloseTo(0.54, 5); // 0.5 + 0.04
  });

  it('three groups → adjacent bands meet at midpoints, non-overlapping', () => {
    const bands = computeGroupBands([0.2, 0.5, 0.8]);
    expect(bands[0].yTop).toBeCloseTo(0.02, 5); // max(0, 0.2-0.18)
    expect(bands[0].yBottom).toBeCloseTo(0.35, 5); // mid(0.2,0.5)
    expect(bands[1].yTop).toBeCloseTo(0.35, 5);
    expect(bands[1].yBottom).toBeCloseTo(0.65, 5); // mid(0.5,0.8)
    expect(bands[2].yTop).toBeCloseTo(0.65, 5);
    expect(bands[2].yBottom).toBeCloseTo(0.84, 5); // 0.8+0.04
  });

  it('out-of-order input → bands sorted top-to-bottom but mapped back to original index', () => {
    const bands = computeGroupBands([0.8, 0.2, 0.5]);
    // Original index 1 had y=0.2 → first band
    expect(bands[1].yTop).toBeCloseTo(0.02, 5);
    expect(bands[1].yBottom).toBeCloseTo(0.35, 5);
    // Original index 0 had y=0.8 → last band
    expect(bands[0].yTop).toBeCloseTo(0.65, 5);
  });

  it('coincident captions → minimum band height enforced', () => {
    const bands = computeGroupBands([0.5, 0.5]);
    for (const b of bands) {
      expect(b.yBottom - b.yTop).toBeGreaterThanOrEqual(0.04);
    }
  });
});
