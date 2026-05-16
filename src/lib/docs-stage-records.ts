// Normalizes ABD / OMM / Warranty rows into a flat stage-record array so the
// Document Executive Dashboard can apply consistent overdue / at-risk /
// progress logic across all three document modules.
//
// One source row generates multiple stage records (one per workflow milestone).

import { differenceInDays, isAfter, parseISO, isValid, startOfDay } from 'date-fns';
import { classifyWarrantyStageState } from '@/lib/docs-warranty-status';
import { computeOmmStatus } from '@/lib/docs-omm-status';
import { procurementProgressLevel, procurementProgressLabel } from '@/lib/spare-part-utils';

export type DocModule = 'abd' | 'omm' | 'warranty' | 'spare_part';

export interface DocsStageRecord {
  /** uuid of the source row */
  item_id: string;
  document_type: DocModule;
  document_no: string;
  title: string;

  trade: string | null;
  team: string | null;
  subcontractor: string | null;
  hdec_pic: string | null;
  hdec_eng: string | null;

  /** human-readable current stage of the row (not this milestone) */
  current_stage: string;

  /** stable key for this milestone (ex 'abd.sub1_submission') */
  stage_key: string;
  /** display label (ex '1st Submission') */
  stage_label: string;
  /** ordering inside the module */
  stage_order: number;

  planned_date: string | null;
  actual_date: string | null;

  /** true when the milestone is completed */
  is_done: boolean;
  /** true when planned < today and not done */
  is_overdue: boolean;
  /** positive number of days overdue (0 if not overdue) */
  delay_days: number;

  /** raw row reference for quick navigation */
  detail_route: string;
}

export interface StageDefinition {
  key: string;
  label: string;
  order: number;
}

export const ABD_STAGE_DEFS: StageDefinition[] = [
  { key: 'abd.sub1_submission', label: '1st Submission', order: 1 },
  { key: 'abd.sub1_review',     label: '1st Review',     order: 2 },
  { key: 'abd.sub2_submission', label: '2nd Submission', order: 3 },
  { key: 'abd.sub2_review',     label: '2nd Review',     order: 4 },
  { key: 'abd.sub3_submission', label: '3rd Submission', order: 5 },
  { key: 'abd.sub3_review',     label: '3rd Review',     order: 6 },
  { key: 'abd.approved',        label: 'Approved',       order: 7 },
];

export const OMM_STAGE_DEFS: StageDefinition[] = [
  { key: 'omm.sub1_submission', label: '1st Submission', order: 1 },
  { key: 'omm.sub1_review',     label: '1st Status',     order: 2 },
  { key: 'omm.sub2_submission', label: '2nd Submission', order: 3 },
  { key: 'omm.sub2_review',     label: '2nd Response',   order: 4 },
  { key: 'omm.sub3_submission', label: '3rd Submission', order: 5 },
  { key: 'omm.sub3_review',     label: '3rd Response',   order: 6 },
  { key: 'omm.final_submission',label: 'Final Submission', order: 7 },
  { key: 'omm.final_approval',  label: 'Final Approval',   order: 8 },
];

/**
 * Visible Stage Progress cards for OMM Executive Dashboard.
 * Excludes 1st Submission (replaced by Sub1 Status card), 2nd Response
 * (replaced by Sub2 Status card), and 3rd cycle cards.
 */
export const OMM_VISIBLE_STAGE_KEYS = new Set<string>([
  'omm.sub2_submission',
  'omm.final_submission',
  'omm.final_approval',
]);

export interface OmmSubStatusBuckets {
  A: number;
  B: number;
  C: number;
  UR: number;
  TBS: number;
  total: number;
}
export type OmmSub1StatusBuckets = OmmSubStatusBuckets;
export type OmmSub2StatusBuckets = OmmSubStatusBuckets;
export type OmmStatusBucketKey = 'A' | 'B' | 'C' | 'UR' | 'TBS';

/**
 * "Submission이 실제로 일어났을 신호"가 있는지 판단.
 * sub1_actual_date 컬럼이 비어 있어도 다음 중 하나라도 참이면 제출이 있었다고 본다:
 *   - 응답 상태(A/B/C)가 부여됨
 *   - 응답 일자가 기록됨
 *   - 후속 사이클(다음 단계)의 planned/actual 일자가 존재
 */
function hasImplicitSubmission(
  row: any,
  respKey: string,
  respDateKey: string,
  nextSignalKeys: string[],
): boolean {
  const s = String(row?.[respKey] ?? '').trim().toUpperCase();
  if (s === 'A' || s === 'B' || s === 'C') return true;
  if (row?.[respDateKey]) return true;
  for (const k of nextSignalKeys) {
    if (row?.[k]) return true;
  }
  return false;
}

const SUB1_NEXT_SIGNALS = ['sub2_planned_date', 'sub2_actual_date'];
const SUB2_NEXT_SIGNALS = [
  'sub3_planned_date',
  'sub3_actual_date',
  'final_planned_date',
  'final_actual_date',
];

function classifyStatus(
  row: any,
  actualKey: string,
  respKey: string,
  respDateKey: string,
  nextSignalKeys: string[],
): OmmStatusBucketKey {
  const hasActual = !!row?.[actualKey];
  if (!hasActual && !hasImplicitSubmission(row, respKey, respDateKey, nextSignalKeys)) {
    return 'TBS';
  }
  const s = String(row?.[respKey] ?? '').trim().toUpperCase();
  if (s === 'A' || s === 'B' || s === 'C') return s;
  return 'UR';
}

/**
 * Determines which cycle a row is *currently* in. Each row is in exactly one
 * cycle, so dashboard cards driven by this function never double-count rows.
 *
 * Mirrors the branching of `computeOmmStatus` in `docs-omm-status.ts`:
 * receiving an A/B/C response on a cycle closes that cycle and advances the
 * row to the next stage (A → Final, B/C → next sub).
 */
export type OmmCurrentCycle = 'sub1' | 'sub2' | 'sub3' | 'final' | 'closed' | 'rejected';

const upper = (v: any) => String(v ?? '').trim().toUpperCase();

export function currentOmmCycle(row: any): OmmCurrentCycle {
  const fRes = upper(row?.final_response_status);
  if (fRes === 'A') return 'closed';
  if (fRes === 'B' || fRes === 'C') return 'rejected';
  if (row?.final_actual_date || row?.final_planned_date) return 'final';

  const s3Res = upper(row?.sub3_response_status);
  if (s3Res === 'A' || s3Res === 'B' || s3Res === 'C') return 'final';
  if (row?.sub3_actual_date || row?.sub3_planned_date) return 'sub3';

  const s2Res = upper(row?.sub2_response_status);
  if (s2Res === 'A') return 'final';
  if (s2Res === 'B' || s2Res === 'C') return 'sub3';
  if (row?.sub2_actual_date || row?.sub2_planned_date) return 'sub2';

  const s1Res = upper(row?.sub1_response_status);
  if (s1Res === 'A') return 'final';
  if (s1Res === 'B' || s1Res === 'C') return 'sub2';

  return 'sub1';
}

function computeBuckets(
  rows: any[],
  cycleFilter: OmmCurrentCycle,
  actualKey: string,
  respKey: string,
  respDateKey: string,
  nextSignalKeys: string[],
): OmmSubStatusBuckets {
  const out: OmmSubStatusBuckets = { A: 0, B: 0, C: 0, UR: 0, TBS: 0, total: 0 };
  for (const r of rows) {
    if (currentOmmCycle(r) !== cycleFilter) continue;
    out.total++;
    const bucket = classifyStatus(r, actualKey, respKey, respDateKey, nextSignalKeys);
    out[bucket]++;
  }
  return out;
}

export function computeOmmSub1StatusBuckets(rows: any[]): OmmSub1StatusBuckets {
  return computeBuckets(rows, 'sub1', 'sub1_actual_date', 'sub1_response_status', 'sub1_response_date', SUB1_NEXT_SIGNALS);
}
export function computeOmmSub2StatusBuckets(rows: any[]): OmmSub2StatusBuckets {
  return computeBuckets(rows, 'sub2', 'sub2_actual_date', 'sub2_response_status', 'sub2_response_actual_date', SUB2_NEXT_SIGNALS);
}

/**
 * Returns null when the row is not currently in the Sub1 cycle, so dashboard
 * filter / drill-down logic can exclude it from the Sub1 Status bucket.
 */
export function classifyOmmSub1Status(row: any): OmmStatusBucketKey | null {
  if (currentOmmCycle(row) !== 'sub1') return null;
  return classifyStatus(row, 'sub1_actual_date', 'sub1_response_status', 'sub1_response_date', SUB1_NEXT_SIGNALS);
}
export function classifyOmmSub2Status(row: any): OmmStatusBucketKey | null {
  if (currentOmmCycle(row) !== 'sub2') return null;
  return classifyStatus(row, 'sub2_actual_date', 'sub2_response_status', 'sub2_response_actual_date', SUB2_NEXT_SIGNALS);
}

export const WARRANTY_STAGE_DEFS: StageDefinition[] = [
  { key: 'warranty.draft',        label: 'Draft',         order: 1 },
  { key: 'warranty.subcon_sign',  label: 'Subcon Sign',   order: 2 },
  { key: 'warranty.hdec_sign',    label: 'HDEC Sign',     order: 3 },
  { key: 'warranty.final',        label: 'Final',         order: 4 },
];

export const SPARE_PART_STAGE_DEFS: StageDefinition[] = [
  { key: 'spare_part.confirm',   label: 'Confirm',            order: 1 },
  { key: 'spare_part.direction', label: 'Direction to Subcon',order: 2 },
  { key: 'spare_part.po',        label: 'PO Issued',          order: 3 },
  { key: 'spare_part.eta',       label: 'ETA Confirmed',      order: 4 },
  { key: 'spare_part.delivered', label: 'Delivered',          order: 5 },
];

export const ALL_STAGE_DEFS: Record<DocModule, StageDefinition[]> = {
  abd: ABD_STAGE_DEFS,
  omm: OMM_STAGE_DEFS,
  warranty: WARRANTY_STAGE_DEFS,
  spare_part: SPARE_PART_STAGE_DEFS,
};

export const MODULE_LABEL: Record<DocModule, string> = {
  abd: 'As-Built Drawings',
  omm: 'Operation & Maintenance Manual',
  warranty: 'Warranty Deeds',
  spare_part: 'Spare Parts',
};

export const MODULE_RAW_ROUTE: Record<DocModule, string> = {
  abd: '/docs/abd',
  omm: '/docs/omm',
  warranty: '/docs/warranty',
  spare_part: '/docs/spare-part',
};

function safeDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  try {
    const dt = parseISO(d);
    return isValid(dt) ? dt : null;
  } catch {
    return null;
  }
}

function classifyStage(
  planned: string | null,
  _actual: string | null,
  isDone: boolean,
  asOf: Date,
): { is_overdue: boolean; delay_days: number } {
  if (isDone) return { is_overdue: false, delay_days: 0 };
  const p = safeDate(planned);
  if (!p) return { is_overdue: false, delay_days: 0 };
  if (isAfter(asOf, p)) {
    return { is_overdue: true, delay_days: differenceInDays(asOf, p) };
  }
  return { is_overdue: false, delay_days: 0 };
}

// ─── ABD ─────────────────────────────────────────────────────────────────
export function buildAbdStageRecords(rows: any[], asOf: Date, ): DocsStageRecord[] {
  const out: DocsStageRecord[] = [];
  for (const row of rows) {
    const base = {
      item_id: row.id,
      document_type: 'abd' as const,
      document_no: row.document_no ?? '',
      title: row.title ?? '',
      trade: row.trade ?? row.discipline ?? null,
      team: row.team ?? null,
      subcontractor: row.subcontractor_name ?? null,
      hdec_pic: row.hdec_pic_name ?? null,
      hdec_eng: row.hdec_eng_name ?? null,
      detail_route: `/docs/abd/${row.id}`,
    };

    // Determine row-level current stage.
    // IMPORTANT (planned vs actual): in current data, `approved_date` and `sub1_approval_date`
    // are populated with planned target dates for nearly all rows, so they cannot be treated as
    // real approval signals. Trust only `sub*_approval_status` for review/approval completion.
    const reviewClosed = (s: any) => {
      const v = String(s ?? '').trim().toUpperCase();
      return v === 'A' || v === 'B' || v === 'C';
    };
    const sub1Approved = String(row.sub1_approval_status ?? '').toUpperCase() === 'A';
    const sub2Approved = String(row.sub2_approval_status ?? '').toUpperCase() === 'A';
    const sub3Approved = String(row.sub3_approval_status ?? '').toUpperCase() === 'A';
    const finalApproved = sub1Approved || sub2Approved || sub3Approved;
    const anySubmission = !!row.sub1_submission_date || !!row.sub2_submission_date || !!row.sub3_submission_date;

    let current_stage = 'Planned';
    if (finalApproved) current_stage = 'Approved';
    else if (row.sub3_submission_date) current_stage = 'Under 3rd Review';
    else if (sub2Approved && !row.sub3_submission_date) current_stage = '3rd Submission Required';
    else if (row.sub2_submission_date) current_stage = 'Under 2nd Review';
    else if (sub1Approved && !row.sub2_submission_date) current_stage = '2nd Submission Required';
    else if (row.sub1_submission_date) current_stage = 'Under 1st Review';
    else if (row.sub1_planned_date) current_stage = '1st Submission';

    const sub1ReviewDone = reviewClosed(row.sub1_approval_status);
    const sub2ReviewDone = reviewClosed(row.sub2_approval_status);
    const sub3ReviewDone = reviewClosed(row.sub3_approval_status);

    const stages = [
      { def: ABD_STAGE_DEFS[0], planned: row.sub1_planned_date, actual: row.sub1_submission_date,
        done: !!row.sub1_submission_date },
      { def: ABD_STAGE_DEFS[1], planned: row.sub1_planned_date,
        actual: sub1ReviewDone ? row.sub1_approval_date : null,
        done: sub1ReviewDone },
      { def: ABD_STAGE_DEFS[2], planned: row.sub2_planned_date, actual: row.sub2_submission_date,
        done: !!row.sub2_submission_date,
        applicable: !sub1Approved /* if Sub1 approved, no Sub2 needed */ ? !!row.sub2_planned_date : true },
      { def: ABD_STAGE_DEFS[3], planned: row.sub2_planned_date,
        actual: sub2ReviewDone ? row.sub2_approval_date : null,
        done: sub2ReviewDone,
        applicable: !!row.sub2_submission_date || !!row.sub2_planned_date },
      { def: ABD_STAGE_DEFS[4], planned: row.sub3_planned_date, actual: row.sub3_submission_date,
        done: !!row.sub3_submission_date,
        applicable: !!row.sub3_planned_date || !!row.sub3_submission_date },
      { def: ABD_STAGE_DEFS[5], planned: row.sub3_planned_date,
        actual: sub3ReviewDone ? row.sub3_approval_date : null,
        done: sub3ReviewDone,
        applicable: !!row.sub3_submission_date || !!row.sub3_planned_date },
      { def: ABD_STAGE_DEFS[6], planned: row.sub3_planned_date ?? row.sub2_planned_date ?? row.sub1_planned_date,
        // "Completed" per user definition = Submitted OR Approved (actual signals only).
        actual: finalApproved
          ? (sub3Approved ? row.sub3_approval_date
             : sub2Approved ? row.sub2_approval_date
             : row.sub1_approval_date)
          : null,
        done: finalApproved || anySubmission,
        applicable: true },
    ];

    for (const s of stages) {
      if (s.applicable === false) continue;
      const cls = classifyStage(s.planned ?? null, s.actual ?? null, s.done, asOf);
      out.push({
        ...base,
        current_stage,
        stage_key: s.def.key,
        stage_label: s.def.label,
        stage_order: s.def.order,
        planned_date: s.planned ?? null,
        actual_date: s.actual ?? null,
        is_done: s.done,
        ...cls,
      });
    }
  }
  return out;
}

// ─── OMM ─────────────────────────────────────────────────────────────────
export function buildOmmStageRecords(rows: any[], asOf: Date, ): DocsStageRecord[] {
  const out: DocsStageRecord[] = [];
  for (const row of rows) {
    const status = computeOmmStatus(row);
    const base = {
      item_id: row.id,
      document_type: 'omm' as const,
      document_no: row.sn ?? '',
      title: row.category ?? row.work_trade_material ?? '',
      trade: row.trade ?? null,
      team: row.team ?? null,
      subcontractor: row.subcontractor_name ?? null,
      hdec_pic: row.hdec_pic_name ?? null,
      hdec_eng: row.hdec_eng_name ?? null,
      detail_route: `/docs/omm/${row.id}`,
    };
    const current_stage = status;

    const s1Res = String(row.sub1_response_status ?? '').toUpperCase();
    const s2Res = String(row.sub2_response_status ?? '').toUpperCase();
    const s3Res = String(row.sub3_response_status ?? '').toUpperCase();
    const fRes  = String(row.final_response_status ?? '').toUpperCase();
    const sub2Applicable = s1Res === 'B' || s1Res === 'C' || !!row.sub2_planned_date || !!row.sub2_actual_date;
    const sub3Applicable = s2Res === 'B' || s2Res === 'C' || !!row.sub3_planned_date || !!row.sub3_actual_date;

    const stages = [
      { def: OMM_STAGE_DEFS[0], planned: row.sub1_planned_date, actual: row.sub1_actual_date,
        done: !!row.sub1_actual_date, applicable: true },
      { def: OMM_STAGE_DEFS[1], planned: row.sub1_planned_date,
        actual: s1Res === 'A' ? (row.sub1_response_date ?? null) : null,
        done: !!s1Res, applicable: !!row.sub1_actual_date },
      { def: OMM_STAGE_DEFS[2], planned: row.sub2_planned_date, actual: row.sub2_actual_date,
        done: !!row.sub2_actual_date, applicable: sub2Applicable },
      { def: OMM_STAGE_DEFS[3], planned: row.sub2_response_planned_date ?? row.sub2_planned_date,
        actual: s2Res ? (row.sub2_response_actual_date ?? null) : null,
        done: !!s2Res, applicable: sub2Applicable && !!row.sub2_actual_date },
      { def: OMM_STAGE_DEFS[4], planned: row.sub3_planned_date, actual: row.sub3_actual_date,
        done: !!row.sub3_actual_date, applicable: sub3Applicable },
      { def: OMM_STAGE_DEFS[5], planned: row.sub3_response_planned_date ?? row.sub3_planned_date,
        actual: s3Res ? (row.sub3_response_actual_date ?? null) : null,
        done: !!s3Res, applicable: sub3Applicable && !!row.sub3_actual_date },
      { def: OMM_STAGE_DEFS[6], planned: row.final_planned_date, actual: row.final_actual_date,
        done: !!row.final_actual_date, applicable: true },
      { def: OMM_STAGE_DEFS[7], planned: row.final_response_planned_date ?? row.final_planned_date,
        actual: fRes === 'A' ? (row.final_response_actual_date ?? null) : null,
        done: fRes === 'A', applicable: true },
    ];

    for (const s of stages) {
      if ((s as any).applicable === false) continue;
      const cls = classifyStage(s.planned ?? null, s.actual ?? null, s.done, asOf);
      out.push({
        ...base,
        current_stage,
        stage_key: s.def.key,
        stage_label: s.def.label,
        stage_order: s.def.order,
        planned_date: s.planned ?? null,
        actual_date: s.actual ?? null,
        is_done: s.done,
        ...cls,
      });
    }
  }
  return out;
}

// ─── Warranty ────────────────────────────────────────────────────────────
export function buildWarrantyStageRecords(rows: any[], asOf: Date, ): DocsStageRecord[] {
  const out: DocsStageRecord[] = [];
  const asOfIso = asOf.toISOString().slice(0, 10);
  for (const row of rows) {
    const base = {
      item_id: row.id,
      document_type: 'warranty' as const,
      document_no: String(row.item_no ?? ''),
      title: row.warranted_item ?? row.category ?? '',
      trade: row.category ?? null,
      team: row.team ?? null,
      subcontractor: row.subcontractor_name ?? null,
      hdec_pic: row.hdec_pic_name ?? null,
      hdec_eng: row.hdec_eng_name ?? null,
      detail_route: `/docs/warranty/${row.id}`,
    };
    const current_stage = String(row.current_status ?? row.current_stage ?? 'Pending Draft');

    const items = [
      { def: WARRANTY_STAGE_DEFS[0], planned: row.draft_planned_date,         actual: row.draft_actual_date,          key: 'draft' as const },
      { def: WARRANTY_STAGE_DEFS[1], planned: row.subcon_signing_planned_date,actual: row.subcon_signing_actual_date, key: 'subcon' as const },
      { def: WARRANTY_STAGE_DEFS[2], planned: row.hdec_signing_planned_date,  actual: row.hdec_signing_actual_date,   key: 'hdec' as const },
      { def: WARRANTY_STAGE_DEFS[3], planned: row.final_planned_date,         actual: row.final_actual_date,          key: 'final' as const },
    ];

    for (const s of items) {
      const state = classifyWarrantyStageState(row, s.key, asOfIso);
      const isDone = state === 'Done';
      const cls = classifyStage(s.planned ?? null, s.actual ?? null, isDone, asOf);
      out.push({
        ...base,
        current_stage,
        stage_key: s.def.key,
        stage_label: s.def.label,
        stage_order: s.def.order,
        planned_date: s.planned ?? null,
        actual_date: s.actual ?? null,
        is_done: isDone,
        ...cls,
      });
    }
  }
  return out;
}

// ─── Spare Part ──────────────────────────────────────────────────────────
const SPARE_PART_CURRENT_LABEL: Record<number, string> = {
  0: 'Not Started',
  1: 'Confirmed',
  2: 'Directed',
  3: 'PO Issued',
  4: 'ETA Set',
  5: 'Delivered',
};

export function buildSparePartStageRecords(rows: any[], asOf: Date): DocsStageRecord[] {
  const out: DocsStageRecord[] = [];
  for (const row of rows) {
    const lvl = procurementProgressLevel(row);
    const current_stage = SPARE_PART_CURRENT_LABEL[lvl] ?? procurementProgressLabel(row);
    const base = {
      item_id: row.id,
      document_type: 'spare_part' as const,
      document_no: row.sn ?? (row.item_no != null ? String(row.item_no) : ''),
      title: row.material ?? row.parent_item ?? row.specification ?? '',
      trade: row.trade ?? null,
      team: row.team ?? null,
      subcontractor: row.subcontractor_name ?? null,
      hdec_pic: row.hdec_pic_name ?? null,
      hdec_eng: row.hdec_eng_name ?? null,
      detail_route: `/docs/spare-part/${row.id}`,
    };

    const stages = [
      { def: SPARE_PART_STAGE_DEFS[0], planned: row.planned_confirm_date,        actual: row.actual_confirm_date,
        done: !!row.actual_confirm_date },
      { def: SPARE_PART_STAGE_DEFS[1], planned: null,                            actual: row.direction_to_subcon_date,
        done: !!row.direction_to_subcon_date },
      { def: SPARE_PART_STAGE_DEFS[2], planned: row.planned_po_date,             actual: row.actual_po_date,
        done: !!row.actual_po_date },
      { def: SPARE_PART_STAGE_DEFS[3], planned: row.eta_date,                    actual: row.eta_date,
        done: !!row.eta_date },
      { def: SPARE_PART_STAGE_DEFS[4], planned: row.planned_delivery_date,       actual: row.actual_delivery_date,
        done: !!row.actual_delivery_date },
    ];

    for (const s of stages) {
      const cls = classifyStage(s.planned ?? null, s.actual ?? null, s.done, asOf);
      out.push({
        ...base,
        current_stage,
        stage_key: s.def.key,
        stage_label: s.def.label,
        stage_order: s.def.order,
        planned_date: s.planned ?? null,
        actual_date: s.actual ?? null,
        is_done: s.done,
        ...cls,
      });
    }
  }
  return out;
}
export interface ItemSummary {
  item_id: string;
  document_type: DocModule;
  document_no: string;
  title: string;
  trade: string | null;
  team: string | null;
  subcontractor: string | null;
  hdec_pic: string | null;
  hdec_eng: string | null;
  current_stage: string;
  is_completed: boolean;
  is_overdue: boolean;
  max_delay_days: number;
  overdue_stages: string[];
  detail_route: string;
}

export function summariseByItem(records: DocsStageRecord[]): ItemSummary[] {
  const map = new Map<string, ItemSummary>();
  for (const r of records) {
    let s = map.get(r.item_id);
    if (!s) {
      s = {
        item_id: r.item_id,
        document_type: r.document_type,
        document_no: r.document_no,
        title: r.title,
        trade: r.trade,
        team: r.team,
        subcontractor: r.subcontractor,
        hdec_pic: r.hdec_pic,
        hdec_eng: r.hdec_eng,
        current_stage: r.current_stage,
        is_completed: false,
        is_overdue: false,
        max_delay_days: 0,
        overdue_stages: [],
        detail_route: r.detail_route,
      };
      map.set(r.item_id, s);
    }
    if (r.is_overdue) {
      s.is_overdue = true;
      s.overdue_stages.push(r.stage_label);
      if (r.delay_days > s.max_delay_days) s.max_delay_days = r.delay_days;
    }
    // approval / completed stages: last stage of each module
    const lastKey = ALL_STAGE_DEFS[r.document_type].at(-1)!.key;
    if (r.stage_key === lastKey && r.is_done) s.is_completed = true;
  }
  return Array.from(map.values());
}

export interface StageProgress {
  module: DocModule;
  stage_key: string;
  stage_label: string;
  stage_order: number;
  total: number;
  done: number;
  remaining: number;
  overdue: number;
  progress_pct: number;
}

export function computeStageProgress(records: DocsStageRecord[]): StageProgress[] {
  const map = new Map<string, StageProgress>();
  for (const r of records) {
    let s = map.get(r.stage_key);
    if (!s) {
      s = {
        module: r.document_type,
        stage_key: r.stage_key,
        stage_label: r.stage_label,
        stage_order: r.stage_order,
        total: 0,
        done: 0,
        remaining: 0,
        overdue: 0,
        progress_pct: 0,
      };
      map.set(r.stage_key, s);
    }
    s.total++;
    if (r.is_done) s.done++;
    if (r.is_overdue) s.overdue++;
  }
  for (const s of map.values()) {
    s.remaining = s.total - s.done;
    s.progress_pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.module !== b.module) return a.module.localeCompare(b.module);
    return a.stage_order - b.stage_order;
  });
}

export function asOfStartOfDay(d?: Date): Date {
  return startOfDay(d ?? new Date());
}

// ─── ABD bucket distribution (Raw Data Current Status SSOT) ──────────────
// Buckets are mutually exclusive; sum equals total active ABD rows.
export type AbdBucket = 'approved' | 'under_review' | 'sub1_required' | 'sub2_required' | 'sub3_required';

export interface AbdBucketDistribution {
  total: number;
  approved: number;
  under_review: number;
  submission_required: {
    total: number;
    sub1: number;
    sub2: number;
    sub3: number;
  };
}

/** Classify a single ABD row into one of the 5 mutually-exclusive buckets. */
export function classifyAbdRowBucket(row: any): AbdBucket {
  const norm = (v: any) => String(v ?? '').trim().toUpperCase();
  const s1 = norm(row.sub1_approval_status);
  const s2 = norm(row.sub2_approval_status);
  const s3 = norm(row.sub3_approval_status);
  // Approved: any cycle has status 'A'
  if (s1 === 'A' || s2 === 'A' || s3 === 'A') return 'approved';
  // Under Review: most-advanced submitted cycle has no B/C decision yet
  if (row.sub3_submission_date && s3 !== 'B' && s3 !== 'C') return 'under_review';
  if (s2 === 'B' || s2 === 'C') {
    if (!row.sub3_submission_date) return 'sub3_required';
  }
  if (row.sub2_submission_date && s2 !== 'B' && s2 !== 'C') return 'under_review';
  if (s1 === 'B' || s1 === 'C') {
    if (!row.sub2_submission_date) return 'sub2_required';
  }
  if (row.sub1_submission_date && s1 !== 'B' && s1 !== 'C') return 'under_review';
  return 'sub1_required';
}

export function computeAbdBucketDistribution(rows: any[]): AbdBucketDistribution {
  const dist: AbdBucketDistribution = {
    total: 0,
    approved: 0,
    under_review: 0,
    submission_required: { total: 0, sub1: 0, sub2: 0, sub3: 0 },
  };
  for (const row of rows) {
    dist.total++;
    const b = classifyAbdRowBucket(row);
    if (b === 'approved') dist.approved++;
    else if (b === 'under_review') dist.under_review++;
    else if (b === 'sub1_required') {
      dist.submission_required.sub1++;
      dist.submission_required.total++;
    } else if (b === 'sub2_required') {
      dist.submission_required.sub2++;
      dist.submission_required.total++;
    } else if (b === 'sub3_required') {
      dist.submission_required.sub3++;
      dist.submission_required.total++;
    }
  }
  return dist;
}

// ─── Delay severity buckets ───────────────────────────────────────────────
export type DelayBucketKey = '0-7' | '8-14' | '15-30' | '30+';
export const DELAY_BUCKETS: DelayBucketKey[] = ['0-7', '8-14', '15-30', '30+'];

export function bucketDelayDays(days: number): DelayBucketKey | null {
  if (days <= 0) return null;
  if (days <= 7) return '0-7';
  if (days <= 14) return '8-14';
  if (days <= 30) return '15-30';
  return '30+';
}

export interface DelaySeverityCounts {
  '0-7': number;
  '8-14': number;
  '15-30': number;
  '30+': number;
}

export function computeDelaySeverityBuckets(records: DocsStageRecord[]): DelaySeverityCounts {
  const out: DelaySeverityCounts = { '0-7': 0, '8-14': 0, '15-30': 0, '30+': 0 };
  // item-level: use max delay across stages
  const maxByItem = new Map<string, number>();
  for (const r of records) {
    if (!r.is_overdue) continue;
    const cur = maxByItem.get(r.item_id) ?? 0;
    if (r.delay_days > cur) maxByItem.set(r.item_id, r.delay_days);
  }
  for (const d of maxByItem.values()) {
    const b = bucketDelayDays(d);
    if (b) out[b]++;
  }
  return out;
}

// ─── Due This Week / Critical Delay (item-level extras) ───────────────────
export function isDueThisWeek(records: DocsStageRecord[], asOf: Date = new Date()): Set<string> {
  const start = startOfDay(asOf).getTime();
  const end = start + 7 * 86400000;
  const ids = new Set<string>();
  for (const r of records) {
    if (r.is_done) continue;
    const p = safeDate(r.planned_date);
    if (!p) continue;
    const t = p.getTime();
    if (t >= start && t <= end) ids.add(r.item_id);
  }
  return ids;
}

export function criticalDelayItemIds(records: DocsStageRecord[]): Set<string> {
  const ids = new Set<string>();
  const maxByItem = new Map<string, number>();
  for (const r of records) {
    if (!r.is_overdue) continue;
    const cur = maxByItem.get(r.item_id) ?? 0;
    if (r.delay_days > cur) maxByItem.set(r.item_id, r.delay_days);
  }
  for (const [id, d] of maxByItem) if (d > 30) ids.add(id);
  return ids;
}

// ─── Data Quality issues ──────────────────────────────────────────────────
export type DataQualityKey =
  | 'missing_planned'
  | 'missing_actual'
  | 'missing_subcontractor'
  | 'missing_hdec_pic'
  | 'inconsistent_stage';

export interface DataQualityIssue {
  key: DataQualityKey;
  module: DocModule;
  label: string;
  count: number;
  ids: string[];
}

function pushIssue(map: Map<string, DataQualityIssue>, key: string, init: () => DataQualityIssue, id: string) {
  let v = map.get(key);
  if (!v) { v = init(); map.set(key, v); }
  if (!v.ids.includes(id)) { v.ids.push(id); v.count++; }
}

export function computeDataQualityIssues(
  records: DocsStageRecord[],
  rawByModule: { abd: any[]; omm: any[]; warranty: any[]; spare_part?: any[] },
): DataQualityIssue[] {
  const map = new Map<string, DataQualityIssue>();

  for (const r of records) {
    const k = (key: DataQualityKey) => `${r.document_type}:${key}`;
    const init = (key: DataQualityKey, label: string): (() => DataQualityIssue) =>
      () => ({ key, module: r.document_type, label, count: 0, ids: [] });

    if (!r.is_done && !r.planned_date) {
      pushIssue(map, k('missing_planned'), init('missing_planned', `${MODULE_LABEL[r.document_type]} — Missing planned date`), r.item_id);
    }
    if (r.is_done && !r.actual_date) {
      pushIssue(map, k('missing_actual'), init('missing_actual', `${MODULE_LABEL[r.document_type]} — Completed without actual date`), r.item_id);
    }
    if (!r.subcontractor) {
      pushIssue(map, k('missing_subcontractor'), init('missing_subcontractor', `${MODULE_LABEL[r.document_type]} — Missing subcontractor`), r.item_id);
    }
    if (!r.hdec_pic) {
      pushIssue(map, k('missing_hdec_pic'), init('missing_hdec_pic', `${MODULE_LABEL[r.document_type]} — Missing HDEC PIC`), r.item_id);
    }
  }

  // Inconsistent stage data — per module raw checks
  const addInconsistent = (module: DocModule, id: string) => {
    const key = `${module}:inconsistent_stage`;
    pushIssue(map, key, () => ({
      key: 'inconsistent_stage', module,
      label: `${MODULE_LABEL[module]} — Inconsistent stage data`, count: 0, ids: [],
    }), id);
  };
  for (const row of rawByModule.abd) {
    if (row.sub2_submission_date && !row.sub1_submission_date) addInconsistent('abd', row.id);
    else if (row.sub3_submission_date && !row.sub2_submission_date) addInconsistent('abd', row.id);
    else if (row.sub1_approval_date && !row.sub1_submission_date) addInconsistent('abd', row.id);
  }
  for (const row of rawByModule.omm) {
    if (row.sub2_actual_date && !row.sub1_actual_date) addInconsistent('omm', row.id);
    else if (row.sub3_actual_date && !row.sub2_actual_date) addInconsistent('omm', row.id);
    else if (row.final_actual_date && !row.sub1_actual_date) addInconsistent('omm', row.id);
  }
  for (const row of rawByModule.warranty) {
    if (row.subcon_signing_actual_date && !row.draft_actual_date) addInconsistent('warranty', row.id);
    else if (row.hdec_signing_actual_date && !row.subcon_signing_actual_date) addInconsistent('warranty', row.id);
    else if (row.final_actual_date && !row.hdec_signing_actual_date) addInconsistent('warranty', row.id);
  }
  for (const row of rawByModule.spare_part ?? []) {
    if (row.actual_po_date && !row.actual_confirm_date) addInconsistent('spare_part', row.id);
    else if (row.actual_delivery_date && !row.actual_po_date) addInconsistent('spare_part', row.id);
    else if (row.eta_date && !row.actual_po_date) addInconsistent('spare_part', row.id);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.module !== b.module) return a.module.localeCompare(b.module);
    return a.key.localeCompare(b.key);
  });
}
