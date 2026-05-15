/**
 * Punch (Minor O/S Work) Management — Field Registry (SSOT)
 *
 * Single source of truth for every column in `punch_items`. Drives:
 *   - Raw Data table column generation
 *   - Detail page form
 *   - Export header order
 *   - Import header → field mapping (round-trip guaranteed)
 *
 * `aliases` are normalized (lowercase, alphanumerics only) before lookup, so
 * variants like "Item No.", "ITEM_NO", "Item  No" all resolve to the same field.
 */

export type PunchFieldGroup =
  | 'identity'
  | 'classification'
  | 'people'
  | 'schedule'
  | 'progress'
  | 'pre_engineering'
  | 'meta';

export type PunchDataType = 'text' | 'date' | 'number' | 'pct' | 'enum' | 'bool';

export interface PunchFieldDef {
  field: string;
  exportLabel: string;
  aliases: string[];
  group: PunchFieldGroup;
  dataType: PunchDataType;
  enumValues?: readonly string[];
  /** Derived/computed by DB trigger — exported but ignored on import. */
  readOnly?: boolean;
  required?: boolean;
}

// Enum value sets ----------------------------------------------------------

export const PUNCH_GATE_STATUS = ['not_required', 'pending', 'approved'] as const;
export type PunchGateStatus = (typeof PUNCH_GATE_STATUS)[number];

export const PUNCH_PROCUREMENT_STATUS = [
  'not_required',
  'pending',
  'partially_secured',
  'secured',
] as const;
export type PunchProcurementStatus = (typeof PUNCH_PROCUREMENT_STATUS)[number];

export const PUNCH_HEALTH_STATUS = ['ahead', 'on_track', 'behind', 'critical'] as const;
export type PunchHealthStatus = (typeof PUNCH_HEALTH_STATUS)[number];

export const PUNCH_GATE_LABEL: Record<PunchGateStatus, string> = {
  not_required: 'Not Required',
  pending: 'Pending',
  approved: 'Approved',
};

export const PUNCH_PROCUREMENT_LABEL: Record<PunchProcurementStatus, string> = {
  not_required: 'Not Required',
  pending: 'Pending',
  partially_secured: 'Partially Secured',
  secured: 'Secured',
};

export const PUNCH_HEALTH_LABEL: Record<PunchHealthStatus, string> = {
  ahead: 'Ahead',
  on_track: 'On Track',
  behind: 'Behind',
  critical: 'Critical',
};

// Field definitions --------------------------------------------------------

export const PUNCH_FIELDS: PunchFieldDef[] = [
  // identity
  { field: 'item_no', exportLabel: 'Item No', aliases: ['itemno', 'item', 'no', 'sn', 'sno'], group: 'identity', dataType: 'text' },
  { field: 'outstanding_work', exportLabel: 'Outstanding Works', aliases: ['outstandingworks', 'outstandingwork', 'outsandingworks', 'outsandingwork', 'workdescription', 'description', 'punchitem'], group: 'identity', dataType: 'text', required: true },
  { field: 'location', exportLabel: 'Location', aliases: ['location', 'area', 'place'], group: 'identity', dataType: 'text' },
  { field: 'level', exportLabel: 'Level', aliases: ['level', 'floor', 'floorlevel'], group: 'identity', dataType: 'text' },

  // classification
  { field: 'category1', exportLabel: 'Category 1', aliases: ['category1', 'cat1', 'maincategory'], group: 'classification', dataType: 'text' },
  { field: 'category2', exportLabel: 'Category 2', aliases: ['category2', 'cat2', 'subcategory'], group: 'classification', dataType: 'text' },
  { field: 'category3', exportLabel: 'Category 3', aliases: ['category3', 'cat3'], group: 'classification', dataType: 'text' },
  { field: 'critical_level', exportLabel: 'Critical Level', aliases: ['criticallevel', 'priority', 'severity'], group: 'classification', dataType: 'text' },
  { field: 'work_type', exportLabel: 'Work Type', aliases: ['worktype', 'type', 'tradetype'], group: 'classification', dataType: 'text' },
  { field: 'main_trade', exportLabel: 'Main Trade', aliases: ['maintrade', 'trade'], group: 'classification', dataType: 'text' },
  { field: 'sub_trade', exportLabel: 'Sub Trade', aliases: ['subtrade'], group: 'classification', dataType: 'text' },

  // people
  { field: 'team', exportLabel: 'Team', aliases: ['team', 'discipline'], group: 'people', dataType: 'text' },
  { field: 'subcontractor_name', exportLabel: 'Subcontractor', aliases: ['subcontractor', 'subcontractorname', 'subcon', 'company'], group: 'people', dataType: 'text' },
  { field: 'subsub_name', exportLabel: 'Sub-Sub', aliases: ['subsub', 'subsubname', 'subsubcontractor'], group: 'people', dataType: 'text' },
  { field: 'hdec_pic_name', exportLabel: 'HDEC PIC', aliases: ['hdecpic', 'hdecpicname', 'pic', 'picname'], group: 'people', dataType: 'text' },
  { field: 'hdec_eng_name', exportLabel: 'HDEC Engineer', aliases: ['hdeceng', 'hdecengname', 'engineer', 'engname'], group: 'people', dataType: 'text' },

  // schedule
  { field: 'planned_start_date', exportLabel: 'Planned Start', aliases: ['plannedstart', 'plannedstartdate', 'psd'], group: 'schedule', dataType: 'date' },
  { field: 'actual_start_date', exportLabel: 'Actual Start', aliases: ['actualstart', 'actualstartdate', 'asd'], group: 'schedule', dataType: 'date' },
  { field: 'planned_completion_date', exportLabel: 'Planned Completion', aliases: ['plannedcompletion', 'plannedcompletiondate', 'pcd', 'plannedend', 'plannedfinish'], group: 'schedule', dataType: 'date' },
  { field: 'actual_completion_date', exportLabel: 'Actual Completion', aliases: ['actualcompletion', 'actualcompletiondate', 'acd', 'actualend', 'actualfinish'], group: 'schedule', dataType: 'date' },

  // progress
  { field: 'planned_progress_pct', exportLabel: 'Planned %', aliases: ['plannedpct', 'plannedprogress', 'plannedprogresspct', 'targetpct'], group: 'progress', dataType: 'pct', readOnly: true },
  { field: 'actual_progress_pct', exportLabel: 'Actual %', aliases: ['actualpct', 'actualprogress', 'actualprogresspct', 'progress'], group: 'progress', dataType: 'pct' },
  { field: 'progress_variance_pct', exportLabel: 'Variance %', aliases: ['variancepct', 'variance', 'diff', 'difference'], group: 'progress', dataType: 'pct', readOnly: true },
  { field: 'health_status', exportLabel: 'Health', aliases: ['health', 'healthstatus', 'rag'], group: 'progress', dataType: 'enum', enumValues: PUNCH_HEALTH_STATUS, readOnly: true },
  { field: 'completion_status', exportLabel: 'Completion Status', aliases: ['completionstatus', 'status'], group: 'progress', dataType: 'text' },
  { field: 'data_date', exportLabel: 'Data Date', aliases: ['datadate', 'reportdate', 'asofdate'], group: 'progress', dataType: 'date' },
  { field: 'weight', exportLabel: 'Weight', aliases: ['weight', 'wt'], group: 'progress', dataType: 'number' },

  // pre-engineering
  { field: 'material_approval_status', exportLabel: 'Material Approval', aliases: ['materialapproval', 'materialapprovalstatus', 'matlapproval'], group: 'pre_engineering', dataType: 'enum', enumValues: PUNCH_GATE_STATUS },
  { field: 'material_approval_date', exportLabel: 'Material Approval Date', aliases: ['materialapprovaldate'], group: 'pre_engineering', dataType: 'date' },
  { field: 'material_procurement_status', exportLabel: 'Material Procurement', aliases: ['materialprocurement', 'materialprocurementstatus', 'matlprocurement'], group: 'pre_engineering', dataType: 'enum', enumValues: PUNCH_PROCUREMENT_STATUS },
  { field: 'material_procurement_date', exportLabel: 'Material Procurement Date', aliases: ['materialprocurementdate'], group: 'pre_engineering', dataType: 'date' },
  { field: 'drawing_approval_status', exportLabel: 'Drawing Approval', aliases: ['drawingapproval', 'drawingapprovalstatus', 'dwgapproval'], group: 'pre_engineering', dataType: 'enum', enumValues: PUNCH_GATE_STATUS },
  { field: 'drawing_approval_date', exportLabel: 'Drawing Approval Date', aliases: ['drawingapprovaldate'], group: 'pre_engineering', dataType: 'date' },
  { field: 'mos_approval_status', exportLabel: 'MOS Approval', aliases: ['mosapproval', 'mosapprovalstatus'], group: 'pre_engineering', dataType: 'enum', enumValues: PUNCH_GATE_STATUS },
  { field: 'mos_approval_date', exportLabel: 'MOS Approval Date', aliases: ['mosapprovaldate'], group: 'pre_engineering', dataType: 'date' },
  { field: 'pre_engineering_ready', exportLabel: 'Pre-Eng Ready', aliases: ['preengready', 'preengineeringready', 'ready'], group: 'pre_engineering', dataType: 'bool', readOnly: true },
  { field: 'pre_engineering_blockers', exportLabel: 'Pre-Eng Blockers', aliases: ['preengblockers', 'blockers'], group: 'pre_engineering', dataType: 'text', readOnly: true },

  // meta
  { field: 'remarks', exportLabel: 'Remarks', aliases: ['remarks', 'remark', 'note', 'notes', 'comment', 'comments'], group: 'meta', dataType: 'text' },
];

// Lookup helpers -----------------------------------------------------------

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export const PUNCH_FIELDS_BY_NAME: Record<string, PunchFieldDef> = Object.fromEntries(
  PUNCH_FIELDS.map((f) => [f.field, f]),
);

const ALIAS_INDEX = new Map<string, PunchFieldDef>();
for (const f of PUNCH_FIELDS) {
  ALIAS_INDEX.set(norm(f.exportLabel), f);
  ALIAS_INDEX.set(norm(f.field), f);
  for (const a of f.aliases) ALIAS_INDEX.set(norm(a), f);
}

/** Resolve any header string (export label, db column, alias) → field def. */
export function normalizePunchHeader(raw: string | null | undefined): PunchFieldDef | null {
  if (!raw) return null;
  return ALIAS_INDEX.get(norm(raw)) ?? null;
}

/** Group → list of fields, preserving registry order. */
export function getPunchFieldsByGroup(group: PunchFieldGroup): PunchFieldDef[] {
  return PUNCH_FIELDS.filter((f) => f.group === group);
}
