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
  it('single group → band ends just above caption, top capped by maxPhotoHeight', () => {
    const bands = computeGroupBands([0.5]);
    expect(bands).toHaveLength(1);
    expect(bands[0].yBottom).toBeCloseTo(0.488, 5); // 0.5 - 0.012
    expect(bands[0].yTop).toBeCloseTo(0.088, 5);    // yBottom - 0.4
  });

  it('three groups → each band sits between previous caption and current caption', () => {
    const bands = computeGroupBands([0.2, 0.5, 0.8]);
    // first: bottom = 0.188, top = max(0, 0.188 - 0.4) = 0
    expect(bands[0].yBottom).toBeCloseTo(0.188, 5);
    expect(bands[0].yTop).toBeCloseTo(0, 5);
    // middle: bottom = 0.488, top = max(0.2 + 0.012, 0.488 - 0.4) = 0.212
    expect(bands[1].yBottom).toBeCloseTo(0.488, 5);
    expect(bands[1].yTop).toBeCloseTo(0.212, 5);
    // last: bottom = 0.788, top = max(0.5 + 0.012, 0.788 - 0.4) = 0.512
    expect(bands[2].yBottom).toBeCloseTo(0.788, 5);
    expect(bands[2].yTop).toBeCloseTo(0.512, 5);
  });

  it('out-of-order input → bands sorted top-to-bottom but mapped back to original index', () => {
    const bands = computeGroupBands([0.8, 0.2, 0.5]);
    expect(bands[1].yBottom).toBeCloseTo(0.188, 5); // y=0.2 was original idx 1
    expect(bands[0].yBottom).toBeCloseTo(0.788, 5); // y=0.8 was original idx 0
    expect(bands[0].yTop).toBeCloseTo(0.512, 5);
  });

  it('coincident captions → minimum band height enforced', () => {
    const bands = computeGroupBands([0.5, 0.5]);
    for (const b of bands) {
      expect(b.yBottom - b.yTop).toBeGreaterThanOrEqual(0.05 - 1e-9);
    }
  });
});
