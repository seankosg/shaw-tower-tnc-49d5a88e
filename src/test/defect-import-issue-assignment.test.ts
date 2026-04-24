import { describe, expect, it } from 'vitest';
import {
  buildSubcontractorIssueAssignments,
  compareIssueNoAsc,
  detectIssueNoSortDirection,
} from '@/pages/DefectImportPage';
import type { ParsedDefectRow } from '@/lib/defect-parser';

type RowOverrides = Partial<ParsedDefectRow> & { issue_no: string; rawRowNo: number };

function makeRow(overrides: RowOverrides): ParsedDefectRow {
  return {
    rawRowNo: overrides.rawRowNo,
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
    work_type: overrides.work_type ?? null,
    raw_payload: overrides.raw_payload ?? {},
  };
}

function emptyRegistry(seedSeq: Record<string, number> = {}) {
  return {
    existingKeys: new Set<string>(),
    reservedKeys: new Set<string>(),
    nextSeqByOwner: new Map<string, number>(Object.entries(seedSeq)),
    masters: [
      { name: 'Acme Builders', type: 'sub', parent_subcontractor_id: null, owner_code: 'ABC' },
      { name: 'Xerox Works', type: 'sub', parent_subcontractor_id: null, owner_code: 'XYZ' },
    ],
  };
}

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
    expect(detectIssueNoSortDirection([
      { issue_no: '1001' }, { issue_no: '1002' }, { issue_no: '1003' },
    ])).toBe('asc');
  });

  it('detects descending', () => {
    expect(detectIssueNoSortDirection([
      { issue_no: '1005' }, { issue_no: '1004' }, { issue_no: '1003' },
    ])).toBe('desc');
  });

  it('handles natural numeric order (D-10, D-2, D-1 → desc)', () => {
    expect(detectIssueNoSortDirection([
      { issue_no: 'D-10' }, { issue_no: 'D-2' }, { issue_no: 'D-1' },
    ])).toBe('desc');
  });

  it('returns asc when only one row', () => {
    expect(detectIssueNoSortDirection([{ issue_no: '1' }])).toBe('asc');
  });

  it('uses majority direction for mixed input', () => {
    // 3 desc pairs, 1 asc pair → desc
    expect(detectIssueNoSortDirection([
      { issue_no: '1010' }, { issue_no: '1009' }, { issue_no: '1008' }, { issue_no: '1007' }, { issue_no: '1008' },
    ])).toBe('desc');
  });
});

describe('buildSubcontractorIssueAssignments', () => {
  it('assigns ascending sequences in row order when import is ascending', () => {
    const rows = [
      makeRow({ rawRowNo: 2, issue_no: '1001', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 3, issue_no: '1002', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 4, issue_no: '1003', subcontractor_name: 'Acme Builders' }),
    ];
    const assignments = buildSubcontractorIssueAssignments(rows, null, emptyRegistry(), new Map());
    expect(assignments.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00001');
    expect(assignments.get(3)?.subcontractor_issue_no).toBe('SC-ABC-00002');
    expect(assignments.get(4)?.subcontractor_issue_no).toBe('SC-ABC-00003');
  });

  it('assigns SEQ by Issue No ascending even when import file is descending', () => {
    const rows = [
      makeRow({ rawRowNo: 2, issue_no: '1005', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 3, issue_no: '1004', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 4, issue_no: '1003', subcontractor_name: 'Acme Builders' }),
    ];
    const assignments = buildSubcontractorIssueAssignments(rows, null, emptyRegistry(), new Map());
    // Lowest Issue No (1003 → row 4) should always get the lowest SEQ
    expect(assignments.get(4)?.subcontractor_issue_no).toBe('SC-ABC-00001');
    expect(assignments.get(3)?.subcontractor_issue_no).toBe('SC-ABC-00002');
    expect(assignments.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00003');
  });

  it('handles natural sort with descending alphanumeric Issue No', () => {
    const rows = [
      makeRow({ rawRowNo: 2, issue_no: 'D-10', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 3, issue_no: 'D-2', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 4, issue_no: 'D-1', subcontractor_name: 'Acme Builders' }),
    ];
    const assignments = buildSubcontractorIssueAssignments(rows, null, emptyRegistry(), new Map());
    // D-1 < D-2 < D-10 (natural numeric sort)
    expect(assignments.get(4)?.subcontractor_issue_no).toBe('SC-ABC-00001');
    expect(assignments.get(3)?.subcontractor_issue_no).toBe('SC-ABC-00002');
    expect(assignments.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00003');
  });

  it('keeps owner-code sequences independent and ordered by Issue No asc', () => {
    const rows = [
      makeRow({ rawRowNo: 2, issue_no: '1005', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 3, issue_no: '1004', subcontractor_name: 'Xerox Works' }),
      makeRow({ rawRowNo: 4, issue_no: '1003', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 5, issue_no: '1002', subcontractor_name: 'Xerox Works' }),
    ];
    const assignments = buildSubcontractorIssueAssignments(rows, null, emptyRegistry(), new Map());
    // ABC: 1003 < 1005 → row 4 = 00001, row 2 = 00002
    expect(assignments.get(4)?.subcontractor_issue_no).toBe('SC-ABC-00001');
    expect(assignments.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00002');
    // XYZ: 1002 < 1004 → row 5 = 00001, row 3 = 00002
    expect(assignments.get(5)?.subcontractor_issue_no).toBe('SC-XYZ-00001');
    expect(assignments.get(3)?.subcontractor_issue_no).toBe('SC-XYZ-00002');
  });

  it('starts from existing DB max sequence + 1, lowest Issue No first', () => {
    const rows = [
      makeRow({ rawRowNo: 2, issue_no: '1003', subcontractor_name: 'Acme Builders' }),
      makeRow({ rawRowNo: 3, issue_no: '1002', subcontractor_name: 'Acme Builders' }),
    ];
    const assignments = buildSubcontractorIssueAssignments(rows, null, emptyRegistry({ ABC: 28 }), new Map());
    // 1002 < 1003, so row 3 = 00028 (next from existing max 27 + 1), row 2 = 00029
    expect(assignments.get(3)?.subcontractor_issue_no).toBe('SC-ABC-00028');
    expect(assignments.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00029');
  });

  it('preserves existing defect subcontractor_issue_no', () => {
    const rows = [
      makeRow({ rawRowNo: 2, issue_no: '1003', subcontractor_name: 'Acme Builders' }),
    ];
    const existingByIssueNo = new Map<string, any>([
      ['1003', { subcontractor_issue_no: 'SC-ABC-00099', subcontractor_issue_source: 'auto_generated' }],
    ]);
    const assignments = buildSubcontractorIssueAssignments(rows, null, emptyRegistry(), existingByIssueNo);
    expect(assignments.get(2)?.subcontractor_issue_no).toBe('SC-ABC-00099');
    expect(assignments.get(2)?.subcontractor_issue_source).toBe('auto_generated');
  });

  it('preserves imported subcontractor_issue_no when present in Excel', () => {
    const rows = [
      makeRow({
        rawRowNo: 2,
        issue_no: '1003',
        subcontractor_issue_no: 'SC-ABC-09999',
        subcontractor_name: 'Acme Builders',
      }),
    ];
    const assignments = buildSubcontractorIssueAssignments(rows, null, emptyRegistry(), new Map());
    expect(assignments.get(2)?.subcontractor_issue_no).toBe('SC-ABC-09999');
    expect(assignments.get(2)?.subcontractor_issue_source).toBe('imported');
    expect(assignments.get(2)?.duplicate).toBe(false);
  });

  it('flags imported subcontractor_issue_no as duplicate when it collides with existing DB values', () => {
    const rows = [
      makeRow({
        rawRowNo: 2,
        issue_no: '1003',
        subcontractor_issue_no: 'SC-ABC-00001',
        subcontractor_name: 'Acme Builders',
      }),
    ];
    const registry = emptyRegistry();
    registry.existingKeys.add('::sc-abc-00001');
    const assignments = buildSubcontractorIssueAssignments(rows, null, registry, new Map());
    expect(assignments.get(2)?.duplicate).toBe(true);
  });
});
