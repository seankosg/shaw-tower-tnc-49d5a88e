import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Supabase client BEFORE importing the module under test so that the
// module captures our mock when it evaluates.
const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: any[]) => rpcMock(...args) },
}));

import {
  buildSubcontractorIssueAssignments,
  compareIssueNoAsc,
  detectIssueNoSortDirection,
} from '@/contexts/DefectImportContext';
import type { ParsedDefectRow } from '@/lib/defect-parser';

type RowOverrides = Partial<ParsedDefectRow> & { issue_no: string; rawRowNo: number };

function makeRow(overrides: RowOverrides): ParsedDefectRow {
  return {
    rawRowNo: overrides.rawRowNo,
    id: overrides.id ?? null,
    issue_no: overrides.issue_no,
    subcontractor_issue_no: overrides.subcontractor_issue_no ?? null,
    subcontractor_issue_source: overrides.subcontractor_issue_source ?? null,
    main_trade: overrides.main_trade ?? null,
    sub_trade: overrides.sub_trade ?? null,
    trade_detail: overrides.trade_detail ?? null,
    area_raw: overrides.area_raw ?? null,
    area_type: overrides.area_type ?? null,
    area_level: overrides.area_level ?? null,
    area_location: overrides.area_location ?? null,
    description: overrides.description ?? null,
    defect_type: overrides.defect_type ?? null,
    status: overrides.status ?? null,
    priority: overrides.priority ?? null,
    team: overrides.team ?? null,
    subcontractor_name: overrides.subcontractor_name ?? null,
    subsub_name: overrides.subsub_name ?? null,
    hdec_pic_name: overrides.hdec_pic_name ?? null,
    hdec_eng_name: overrides.hdec_eng_name ?? null,
    captured_by_name: overrides.captured_by_name ?? null,
    planned_start_date: overrides.planned_start_date ?? null,
    planned_completion_date: overrides.planned_completion_date ?? null,
    planned_closure_date: overrides.planned_closure_date ?? null,
    actual_start_date: overrides.actual_start_date ?? null,
    actual_completion_date: overrides.actual_completion_date ?? null,
    actual_closure_date: overrides.actual_closure_date ?? null,
    planned_progress_pct: overrides.planned_progress_pct ?? null,
    actual_progress_pct: overrides.actual_progress_pct ?? null,
    completion_status: overrides.completion_status ?? null,
    closure_status: overrides.closure_status ?? null,
    remarks: overrides.remarks ?? null,
    hdec_comments: overrides.hdec_comments ?? null,
    aconex_comments: overrides.aconex_comments ?? null,
    work_type: overrides.work_type ?? null,
    raw_payload: overrides.raw_payload ?? {},
    custom_payload: overrides.custom_payload ?? {},
    custom_field_errors: overrides.custom_field_errors ?? [],
  };
}

const PROJECT = '00000000-0000-0000-0000-000000000001';

function emptyRegistry() {
  return {
    masters: [
      { name: 'Acme Builders', type: 'sub', parent_subcontractor_id: null, owner_code: 'ABC' },
      { name: 'Xerox Works', type: 'sub', parent_subcontractor_id: null, owner_code: 'XYZ' },
    ],
  };
}

/** Configure the rpc mock to behave like the real RPCs:
 *  - allot_subcontractor_issue_no: returns N consecutive integers starting at the
 *    current per-owner counter, then advances it.
 *  - bump_subcontractor_issue_counter: lifts the per-owner counter to max(current, used+1). */
function installRpcMock(seed: Record<string, number> = {}) {
  const counters = new Map<string, number>();
  for (const [owner, next] of Object.entries(seed)) counters.set(owner, next);
  rpcMock.mockImplementation(async (fn: string, args: any) => {
    const owner = String(args._owner_code ?? '').toUpperCase() || 'UNASSIGNED';
    if (fn === 'allot_subcontractor_issue_no') {
      const start = counters.get(owner) ?? 1;
      const count = Number(args._count ?? 1);
      counters.set(owner, start + count);
      const out = Array.from({ length: count }, (_, i) => start + i);
      return { data: out, error: null };
    }
    if (fn === 'bump_subcontractor_issue_counter') {
      const used = Number(args._used_seq ?? 0);
      const current = counters.get(owner) ?? 1;
      const next = Math.max(current, used + 1);
      counters.set(owner, next);
      return { data: next, error: null };
    }
    throw new Error(`Unexpected RPC: ${fn}`);
  });
}

beforeEach(() => { rpcMock.mockReset(); });
afterEach(() => { rpcMock.mockReset(); });

describe('compareIssueNoAsc', () => {
  it('uses numeric sort so 2 < 10', () => {
    expect(compareIssueNoAsc('2', '10')).toBeLessThan(0);
    expect(compareIssueNoAsc('D-2', 'D-10')).toBeLessThan(0);
  });
  it('sorts empty values to the end', () => {
    expect(compareIssueNoAsc('', 'A')).toBeGreaterThan(0);
    expect(compareIssueNoAsc('A', '')).toBeLessThan(0);
  });
});

describe('detectIssueNoSortDirection', () => {
  it('detects ascending', () => {
    expect(detectIssueNoSortDirection([{ issue_no: '1001' }, { issue_no: '1002' }, { issue_no: '1003' }])).toBe('asc');
  });
  it('detects descending', () => {
    expect(detectIssueNoSortDirection([{ issue_no: '1005' }, { issue_no: '1004' }, { issue_no: '1003' }])).toBe('desc');
  });
  it('handles natural numeric order (D-10, D-2, D-1 → desc)', () => {
    expect(detectIssueNoSortDirection([{ issue_no: 'D-10' }, { issue_no: 'D-2' }, { issue_no: 'D-1' }])).toBe('desc');
  });
  it('returns asc when only one row', () => {
    expect(detectIssueNoSortDirection([{ issue_no: '1' }])).toBe('asc');
  });
});

describe('buildSubcontractorIssueAssignments (RPC-backed)', () => {
  it('assigns ascending sequences in row order when import is ascending', async () => {
    installRpcMock();
    const rows = [
      makeRow({ rawRowNo: 2, issue_no: '1001', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 3, issue_no: '1002', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 4, issue_no: '1003', subcontractor_name: 'Acme Builders' }),
    ];
    const a = await buildSubcontractorIssueAssignments(rows, PROJECT, emptyRegistry(), new Map());
    expect(a.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00001');
    expect(a.get(3)?.subcontractor_issue_no).toBe('SC-ABC-00002');
    expect(a.get(4)?.subcontractor_issue_no).toBe('SC-ABC-00003');
  });

  it('assigns SEQ by Issue No ascending even when import file is descending', async () => {
    installRpcMock();
    const rows = [
      makeRow({ rawRowNo: 2, issue_no: '1005', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 3, issue_no: '1004', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 4, issue_no: '1003', subcontractor_name: 'Acme Builders' }),
    ];
    const a = await buildSubcontractorIssueAssignments(rows, PROJECT, emptyRegistry(), new Map());
    expect(a.get(4)?.subcontractor_issue_no).toBe('SC-ABC-00001');
    expect(a.get(3)?.subcontractor_issue_no).toBe('SC-ABC-00002');
    expect(a.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00003');
  });

  it('keeps owner-code sequences independent and ordered by Issue No asc', async () => {
    installRpcMock();
    const rows = [
      makeRow({ rawRowNo: 2, issue_no: '1005', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 3, issue_no: '1004', subcontractor_name: 'Xerox Works' }),
      makeRow({ rawRowNo: 4, issue_no: '1003', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 5, issue_no: '1002', subcontractor_name: 'Xerox Works' }),
    ];
    const a = await buildSubcontractorIssueAssignments(rows, PROJECT, emptyRegistry(), new Map());
    expect(a.get(4)?.subcontractor_issue_no).toBe('SC-ABC-00001');
    expect(a.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00002');
    expect(a.get(5)?.subcontractor_issue_no).toBe('SC-XYZ-00001');
    expect(a.get(3)?.subcontractor_issue_no).toBe('SC-XYZ-00002');
  });

  it('starts from existing DB max sequence + 1, lowest Issue No first', async () => {
    installRpcMock({ ABC: 28 });
    const rows = [
      makeRow({ rawRowNo: 2, issue_no: '1003', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 3, issue_no: '1002', subcontractor_name: 'Acme Builders' }),
    ];
    const a = await buildSubcontractorIssueAssignments(rows, PROJECT, emptyRegistry(), new Map());
    expect(a.get(3)?.subcontractor_issue_no).toBe('SC-ABC-00028');
    expect(a.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00029');
  });

  it('preserves existing defect subcontractor_issue_no without invoking RPC', async () => {
    installRpcMock();
    const rows = [
      makeRow({ rawRowNo: 2, issue_no: '1003', subcontractor_name: 'Acme Builders' }),
    ];
    const existingByIssueNo = new Map<string, any>([
      ['1003', { subcontractor_issue_no: 'SC-ABC-00099', subcontractor_issue_source: 'auto_generated' }],
    ]);
    const a = await buildSubcontractorIssueAssignments(rows, PROJECT, emptyRegistry(), existingByIssueNo);
    expect(a.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00099');
    expect(a.get(2)?.subcontractor_issue_source).toBe('auto_generated');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('preserves imported subcontractor_issue_no and bumps the DB counter', async () => {
    installRpcMock();
    const rows = [
      makeRow({
        rawRowNo: 2, issue_no: '1003',
        subcontractor_issue_no: 'SC-ABC-09999',
        subcontractor_name: 'Acme Builders',
      }),
    ];
    const a = await buildSubcontractorIssueAssignments(rows, PROJECT, emptyRegistry(), new Map());
    expect(a.get(2)?.subcontractor_issue_no).toBe('SC-ABC-09999');
    expect(a.get(2)?.subcontractor_issue_source).toBe('imported');
    expect(a.get(2)?.duplicate).toBe(false);
    expect(rpcMock).toHaveBeenCalledWith('bump_subcontractor_issue_counter', expect.objectContaining({
      _project_id: PROJECT, _owner_code: 'ABC', _used_seq: 9999,
    }));
  });

  it('after a manual SC bump, next auto-generated sequence continues from there', async () => {
    installRpcMock();
    const rows = [
      makeRow({
        rawRowNo: 2, issue_no: '1001',
        subcontractor_issue_no: 'SC-ABC-00099',
        subcontractor_name: 'Acme Builders',
      }),
      makeRow({ rawRowNo: 3, issue_no: '1002', subcontractor_name: 'Acme Builders' }),
    ];
    const a = await buildSubcontractorIssueAssignments(rows, PROJECT, emptyRegistry(), new Map());
    expect(a.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00099');
    expect(a.get(3)?.subcontractor_issue_no).toBe('SC-ABC-00100');
  });
});
