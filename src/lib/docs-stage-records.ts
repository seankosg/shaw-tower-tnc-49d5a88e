// Normalizes ABD / OMM / Warranty rows into a flat stage-record array so the
// Document Executive Dashboard can apply consistent overdue / at-risk /
// progress logic across all three document modules.
//
// One source row generates multiple stage records (one per workflow milestone).

import { differenceInDays, isAfter, parseISO, isValid, startOfDay } from 'date-fns';
import { classifyWarrantyStageState } from '@/lib/docs-warranty-status';
import { computeOmmStatus } from '@/lib/docs-omm-status';

export type DocModule = 'abd' | 'omm' | 'warranty';

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
  { key: 'omm.draft_submission', label: 'Draft Submission', order: 1 },
  { key: 'omm.draft_approval',   label: 'Draft Approval',   order: 2 },
  { key: 'omm.final_submission', label: 'Final Submission', order: 3 },
  { key: 'omm.final_approval',   label: 'Final Approval',   order: 4 },
];

export const WARRANTY_STAGE_DEFS: StageDefinition[] = [
  { key: 'warranty.acra',         label: 'ACRA',          order: 1 },
  { key: 'warranty.draft',        label: 'Draft',         order: 2 },
  { key: 'warranty.subcon_sign',  label: 'Subcon Sign',   order: 3 },
  { key: 'warranty.hdec_sign',    label: 'HDEC Sign',     order: 4 },
  { key: 'warranty.final',        label: 'Final',         order: 5 },
];

export const ALL_STAGE_DEFS: Record<DocModule, StageDefinition[]> = {
  abd: ABD_STAGE_DEFS,
  omm: OMM_STAGE_DEFS,
  warranty: WARRANTY_STAGE_DEFS,
};

export const MODULE_LABEL: Record<DocModule, string> = {
  abd: 'As-Built Drawings',
  omm: 'Operation & Maintenance Manual',
  warranty: 'Warranty Deeds',
};

export const MODULE_RAW_ROUTE: Record<DocModule, string> = {
  abd: '/docs/abd',
  omm: '/docs/omm',
  warranty: '/docs/warranty',
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

    // Determine row-level current stage
    const finalApproved = String(row.sub3_approval_status ?? '').toUpperCase() === 'A' || !!row.approved_date;
    const sub2Approved = String(row.sub2_approval_status ?? '').toUpperCase() === 'A';
    const sub1Approved = String(row.sub1_approval_status ?? '').toUpperCase() === 'A';
    let current_stage = 'Planned';
    if (finalApproved) current_stage = 'Approved';
    else if (row.sub3_submission_date) current_stage = 'Under 3rd Review';
    else if (sub2Approved && !row.sub3_submission_date) current_stage = '3rd Submission Required';
    else if (row.sub2_submission_date) current_stage = 'Under 2nd Review';
    else if (sub1Approved && !row.sub2_submission_date) current_stage = '2nd Submission Required';
    else if (row.sub1_submission_date) current_stage = 'Under 1st Review';
    else if (row.sub1_planned_date) current_stage = '1st Submission';

    const stages = [
      { def: ABD_STAGE_DEFS[0], planned: row.sub1_planned_date, actual: row.sub1_submission_date,
        done: !!row.sub1_submission_date },
      { def: ABD_STAGE_DEFS[1], planned: row.sub1_planned_date, actual: row.sub1_approval_date,
        done: !!row.sub1_approval_date },
      { def: ABD_STAGE_DEFS[2], planned: row.sub2_planned_date, actual: row.sub2_submission_date,
        done: !!row.sub2_submission_date,
        applicable: !sub1Approved /* if Sub1 approved, no Sub2 needed */ ? !!row.sub2_planned_date : true },
      { def: ABD_STAGE_DEFS[3], planned: row.sub2_planned_date, actual: row.sub2_approval_date,
        done: !!row.sub2_approval_date,
        applicable: !!row.sub2_submission_date || !!row.sub2_planned_date },
      { def: ABD_STAGE_DEFS[4], planned: row.sub3_planned_date, actual: row.sub3_submission_date,
        done: !!row.sub3_submission_date,
        applicable: !!row.sub3_planned_date || !!row.sub3_submission_date },
      { def: ABD_STAGE_DEFS[5], planned: row.sub3_planned_date, actual: row.sub3_approval_date,
        done: !!row.sub3_approval_date,
        applicable: !!row.sub3_submission_date || !!row.sub3_planned_date },
      { def: ABD_STAGE_DEFS[6], planned: row.sub3_planned_date ?? row.sub2_planned_date ?? row.sub1_planned_date,
        actual: row.approved_date ?? (finalApproved ? row.sub3_approval_date : null),
        done: finalApproved, applicable: true },
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

    const dRes = String(row.draft_response_status ?? '').toUpperCase();
    const fRes = String(row.final_response_status ?? '').toUpperCase();
    const stages = [
      { def: OMM_STAGE_DEFS[0], planned: row.draft_planned_date, actual: row.draft_actual_date,
        done: !!row.draft_actual_date },
      { def: OMM_STAGE_DEFS[1], planned: row.draft_planned_date,
        actual: dRes === 'A' ? (row.draft_response_date ?? null) : null,
        done: dRes === 'A' },
      { def: OMM_STAGE_DEFS[2], planned: row.final_planned_date, actual: row.final_actual_date,
        done: !!row.final_actual_date },
      { def: OMM_STAGE_DEFS[3], planned: row.final_response_planned_date ?? row.final_planned_date,
        actual: fRes === 'A' ? (row.final_response_actual_date ?? null) : null,
        done: fRes === 'A' },
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
      { def: WARRANTY_STAGE_DEFS[0], planned: null,                            actual: row.r_subcontract_date,         key: 'acra' as const },
      { def: WARRANTY_STAGE_DEFS[1], planned: row.draft_planned_date,         actual: row.draft_actual_date,          key: 'draft' as const },
      { def: WARRANTY_STAGE_DEFS[2], planned: row.subcon_signing_planned_date,actual: row.subcon_signing_actual_date, key: 'subcon' as const },
      { def: WARRANTY_STAGE_DEFS[3], planned: row.hdec_signing_planned_date,  actual: row.hdec_signing_actual_date,   key: 'hdec' as const },
      { def: WARRANTY_STAGE_DEFS[4], planned: row.final_planned_date,         actual: row.final_actual_date,          key: 'final' as const },
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

// ─── Aggregate helpers ──────────────────────────────────────────────────
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
