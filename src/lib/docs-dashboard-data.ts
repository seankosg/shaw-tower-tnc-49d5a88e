// Aggregation helpers for the Docs Management Dashboard.
// Loads ABD / OMM / Spare Part rows in parallel and derives KPI / risk / trend buckets.

import { supabase } from '@/integrations/supabase/client';
import { computeRisk, type RiskLevel } from '@/lib/docs-risk';
import { computeOmmStatus, computeOmmStage, copyAlertState, type OMMStatus } from '@/lib/docs-omm-status';
import { normalizeSparePartStatus } from '@/lib/docs-spare-part-status';
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  format,
  differenceInDays,
  parseISO,
  subDays,
  subMonths,
  isAfter,
  isValid,
} from 'date-fns';

export type DocsModuleId = 'abd' | 'omm' | 'spare_part' | 'warranty';

export interface ModuleStats {
  module: DocsModuleId;
  total: number;
  submitted: number;
  pending: number;
  overdue: number;
  /** rows currently waiting on counterpart response (Draft/Final Under Review for OMM, Sub-N submitted but not approved for ABD) */
  awaitingResponse: number;
  /** rows untouched / pending start for > 14 days (stuck) */
  stuck: number;
  risk: Record<RiskLevel, number>;
  /** date(YYYY-MM-DD) -> approved count (for trend) */
  approvedByDay: Map<string, number>;
  /** Top-5 overdue items for detail card */
  topOverdue: Array<{ id: string; label: string; daysLate: number; pic?: string | null }>;
  /** Top-5 stuck items for the Attention tab (no progress for > 14d) */
  topStuck: Array<{ id: string; label: string; daysIdle: number; pic?: string | null }>;
  /** Top-5 awaiting response items */
  topAwaiting: Array<{ id: string; label: string; daysWaiting: number; pic?: string | null; stageHint?: string }>;
  /** Stage distribution — semantics depend on module */
  stageCounts: Record<string, number>;
  /** OMM-only: how many rows are short on PDF copies */
  copyShortfall?: number;
  /** Cross-cut: subcontractor / pic / trade -> {pending, overdue, total, submitted} */
  bySubcontractor: Map<string, CrossCutCell>;
  byPic: Map<string, CrossCutCell>;
  byTrade: Map<string, CrossCutCell>;
}

export interface CrossCutCell {
  total: number;
  submitted: number;
  pending: number;
  overdue: number;
}

export interface DashboardData {
  abd: ModuleStats;
  omm: ModuleStats;
  spare_part: ModuleStats;
  warranty: ModuleStats; // placeholder
  scDateMap: Record<string, string>;
  leadDays: number;
}

const emptyCell = (): CrossCutCell => ({ total: 0, submitted: 0, pending: 0, overdue: 0 });

const emptyStats = (module: DocsModuleId): ModuleStats => ({
  module,
  total: 0,
  submitted: 0,
  pending: 0,
  overdue: 0,
  awaitingResponse: 0,
  stuck: 0,
  risk: { green: 0, amber: 0, red: 0 },
  approvedByDay: new Map(),
  topOverdue: [],
  topStuck: [],
  topAwaiting: [],
  stageCounts: {},
  bySubcontractor: new Map(),
  byPic: new Map(),
  byTrade: new Map(),
});

function bumpCell(map: Map<string, CrossCutCell>, key: string | null | undefined, patch: Partial<CrossCutCell>) {
  const k = (key ?? '').trim() || '— Unassigned';
  const cur = map.get(k) ?? emptyCell();
  cur.total += patch.total ?? 0;
  cur.submitted += patch.submitted ?? 0;
  cur.pending += patch.pending ?? 0;
  cur.overdue += patch.overdue ?? 0;
  map.set(k, cur);
}

function safeIso(d: string | null | undefined): Date | null {
  if (!d) return null;
  try {
    const dt = parseISO(d);
    return isValid(dt) ? dt : null;
  } catch {
    return null;
  }
}

function bumpStage(stats: ModuleStats, stage: string) {
  stats.stageCounts[stage] = (stats.stageCounts[stage] ?? 0) + 1;
}

export async function loadDashboardData(opts: {
  asOf?: Date;
  leadDaysFallback?: number;
}): Promise<DashboardData> {
  const asOf = startOfDay(opts.asOf ?? new Date());
  const leadDaysFallback = opts.leadDaysFallback ?? 30;

  const PAGE = 1000;
  async function fetchAll<T = any>(
    builder: () => any,
  ): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await builder().range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }

  const [abdRows, ommRows, sparePartRows, settingsRes, leadRes] = await Promise.all([
    fetchAll(() =>
      supabase
        .from('docs_drawings')
        .select(
          'id, document_no, title, project_id, is_submitted, submitted_date, approved_date, ' +
            'sub1_planned_date, sub1_submission_date, sub1_approval_date, sub1_approval_status, ' +
            'sub2_planned_date, sub2_submission_date, sub2_approval_date, sub2_approval_status, ' +
            'sub3_planned_date, sub3_submission_date, sub3_approval_date, sub3_approval_status, ' +
            'discipline, current_status, hdec_pic_name, subcontractor_name, trade, ' +
            'created_at, updated_at, raw_payload, custom_payload',
        )
        .eq('sub_module', 'as_built')
        .eq('is_active', true),
    ),
    fetchAll(() =>
      supabase
        .from('docs_omm')
        .select(
          'id, sn, category, category_group, project_id, ' +
            'instruction_date, draft_planned_date, draft_actual_date, ' +
            'draft_response_date, draft_response_status, ' +
            'final_planned_date, final_actual_date, ' +
            'final_response_planned_date, final_response_actual_date, final_response_status, ' +
            'pdf_required_qty, pdf_actual_qty, hardcopy_required_qty, hardcopy_actual_qty, ' +
            'hdec_pic_name, subcontractor_name, trade, current_stage, current_status, ' +
            'created_at, updated_at',
        )
        .eq('is_active', true),
    ),
    fetchAll(() =>
      supabase
        .from('docs_spare_part')
        .select(
          'id, sn, parent_item, project_id, status, hdec_pic_name, subcontractor_name, trade, updated_at',
        )
        .eq('is_active', true),
    ),
    supabase.from('app_settings').select('key, value').like('key', 'docs_sc_date_%'),
    supabase.from('app_settings').select('key, value').like('key', 'docs_lead_days_%'),
  ]);

  const scDateMap: Record<string, string> = {};
  for (const s of settingsRes.data ?? []) {
    const projectId = s.key.replace('docs_sc_date_', '');
    if (typeof s.value === 'string') scDateMap[projectId] = s.value;
  }
  let leadDays = leadDaysFallback;
  for (const s of leadRes.data ?? []) {
    if (s.key === 'docs_lead_days_as_built' && typeof s.value === 'number') leadDays = s.value;
  }

  // ── ABD ────────────────────────────────────────────────────────
  const abd = emptyStats('abd');
  for (const row of abdRows as any[]) {
    abd.total++;
    const submitted = !!row.is_submitted;
    if (submitted) abd.submitted++;
    else abd.pending++;

    // ABD funnel stages: Pending → Sub1 → Sub2 → Sub3 → Approved
    let stage: 'Pending' | 'Sub1' | 'Sub2' | 'Sub3' | 'Approved' = 'Pending';
    if (row.sub3_approval_status?.toString().toUpperCase() === 'A' || row.approved_date) stage = 'Approved';
    else if (row.sub3_submission_date) stage = 'Sub3';
    else if (row.sub2_submission_date) stage = 'Sub2';
    else if (row.sub1_submission_date) stage = 'Sub1';
    bumpStage(abd, stage);

    // Awaiting response = submitted at any sub but not yet approved at that step
    const awaiting =
      (row.sub1_submission_date && !row.sub1_approval_date) ||
      (row.sub2_submission_date && !row.sub2_approval_date) ||
      (row.sub3_submission_date && !row.sub3_approval_date);
    if (awaiting && !submitted) abd.awaitingResponse++;

    // Risk uses SC date + lead
    const sc = scDateMap[row.project_id];
    const r = computeRisk(submitted, sc, leadDays, asOf);
    abd.risk[r]++;

    // Overdue: not submitted and earliest planned date < asOf
    let isOverdue = false;
    let daysLate = 0;
    const due = safeIso(row.sub1_planned_date) ?? safeIso(row.sub3_planned_date);
    if (!submitted && due && isAfter(asOf, due)) {
      isOverdue = true;
      daysLate = differenceInDays(asOf, due);
      abd.overdue++;
      abd.topOverdue.push({
        id: row.id,
        label: `${row.document_no}${row.title ? ' — ' + row.title : ''}`,
        daysLate,
        pic: row.hdec_pic_name,
      });
    }

    // Stuck: no submission yet & created > 14d ago
    const created = safeIso(row.created_at);
    if (!submitted && stage === 'Pending' && created) {
      const idle = differenceInDays(asOf, created);
      if (idle > 14) {
        abd.stuck++;
        abd.topStuck.push({
          id: row.id,
          label: `${row.document_no}${row.title ? ' — ' + row.title : ''}`,
          daysIdle: idle,
          pic: row.hdec_pic_name,
        });
      }
    }

    // Awaiting list
    if (awaiting && !submitted) {
      const submittedDate =
        safeIso(row.sub3_submission_date) ?? safeIso(row.sub2_submission_date) ?? safeIso(row.sub1_submission_date);
      const days = submittedDate ? differenceInDays(asOf, submittedDate) : 0;
      abd.topAwaiting.push({
        id: row.id,
        label: `${row.document_no}${row.title ? ' — ' + row.title : ''}`,
        daysWaiting: days,
        pic: row.hdec_pic_name,
        stageHint: stage,
      });
    }

    // Approval trend
    const approved = safeIso(row.approved_date) ?? safeIso(row.sub3_approval_date);
    if (approved) {
      const k = format(approved, 'yyyy-MM-dd');
      abd.approvedByDay.set(k, (abd.approvedByDay.get(k) ?? 0) + 1);
    }

    // Cross-cut — prefer real columns, fall back to raw_payload / discipline
    const payload = (row.raw_payload ?? {}) as Record<string, any>;
    const sub = row.subcontractor_name ?? payload.subcontractor_name ?? payload.subcontractor ?? row.discipline ?? null;
    const pic = row.hdec_pic_name ?? payload.hdec_pic_name ?? payload.hdec_pic ?? null;
    const trade = row.trade ?? payload.trade ?? row.discipline ?? null;
    const patch = {
      total: 1,
      submitted: submitted ? 1 : 0,
      pending: submitted ? 0 : 1,
      overdue: isOverdue ? 1 : 0,
    };
    bumpCell(abd.bySubcontractor, sub, patch);
    bumpCell(abd.byPic, pic, patch);
    bumpCell(abd.byTrade, trade, patch);
  }
  abd.topOverdue.sort((a, b) => b.daysLate - a.daysLate);
  abd.topOverdue = abd.topOverdue.slice(0, 5);
  abd.topStuck.sort((a, b) => b.daysIdle - a.daysIdle);
  abd.topStuck = abd.topStuck.slice(0, 5);
  abd.topAwaiting.sort((a, b) => b.daysWaiting - a.daysWaiting);
  abd.topAwaiting = abd.topAwaiting.slice(0, 5);

  // ── OMM ────────────────────────────────────────────────────────
  const omm = emptyStats('omm');
  omm.copyShortfall = 0;
  for (const row of ommRows as any[]) {
    omm.total++;
    const status: OMMStatus = computeOmmStatus(row);
    const submitted = status === 'Approved';
    if (submitted) omm.submitted++;
    else omm.pending++;

    bumpStage(omm, status);

    if (status === 'Sub1 Under Review' || status === 'Sub2 Under Review' || status === 'Sub3 Under Review' || status === 'Final Under Review') {
      omm.awaitingResponse++;
    }

    // OMM risk — derive from final response planned vs asOf, considering whether already approved
    const target =
      safeIso(row.final_response_planned_date) ??
      safeIso(row.final_planned_date) ??
      safeIso(row.draft_planned_date);
    let r: RiskLevel = 'green';
    if (!submitted && target) {
      const days = differenceInDays(target, asOf);
      if (days < 0) r = 'red';
      else if (days < 7) r = 'amber';
    } else if (!submitted && !target) {
      // No planned date and not approved → amber by default to surface attention
      r = 'amber';
    }
    omm.risk[r]++;

    let isOverdue = false;
    let daysLate = 0;
    if (!submitted && target && isAfter(asOf, target)) {
      isOverdue = true;
      daysLate = differenceInDays(asOf, target);
      omm.overdue++;
      omm.topOverdue.push({
        id: row.id,
        label: `${row.sn ?? '—'}${row.category ? ' — ' + row.category : ''}`,
        daysLate,
        pic: row.hdec_pic_name,
      });
    }

    // Stuck — Pending Draft > 14d since instruction_date or created_at
    if (status === 'Pending Sub1') {
      const ref = safeIso(row.instruction_date) ?? safeIso(row.created_at);
      if (ref) {
        const idle = differenceInDays(asOf, ref);
        if (idle > 14) {
          omm.stuck++;
          omm.topStuck.push({
            id: row.id,
            label: `${row.sn ?? '—'}${row.category ? ' — ' + row.category : ''}`,
            daysIdle: idle,
            pic: row.hdec_pic_name,
          });
        }
      }
    }

    if (status === 'Draft Under Review' || status === 'Final Under Review') {
      const since =
        status === 'Final Under Review'
          ? safeIso(row.final_actual_date)
          : safeIso(row.draft_actual_date);
      const days = since ? differenceInDays(asOf, since) : 0;
      omm.topAwaiting.push({
        id: row.id,
        label: `${row.sn ?? '—'}${row.category ? ' — ' + row.category : ''}`,
        daysWaiting: days,
        pic: row.hdec_pic_name,
        stageHint: status,
      });
    }

    // Copy shortfall
    if (copyAlertState(row.pdf_required_qty, row.pdf_actual_qty) === 'short') {
      omm.copyShortfall = (omm.copyShortfall ?? 0) + 1;
    }

    const approved = safeIso(row.final_response_actual_date);
    if (approved && submitted) {
      const k = format(approved, 'yyyy-MM-dd');
      omm.approvedByDay.set(k, (omm.approvedByDay.get(k) ?? 0) + 1);
    }

    const patch = {
      total: 1,
      submitted: submitted ? 1 : 0,
      pending: submitted ? 0 : 1,
      overdue: isOverdue ? 1 : 0,
    };
    bumpCell(omm.bySubcontractor, row.subcontractor_name, patch);
    bumpCell(omm.byPic, row.hdec_pic_name, patch);
    bumpCell(omm.byTrade, row.trade, patch);
    void computeOmmStage; // imported for potential future use
  }
  omm.topOverdue.sort((a, b) => b.daysLate - a.daysLate);
  omm.topOverdue = omm.topOverdue.slice(0, 5);
  omm.topStuck.sort((a, b) => b.daysIdle - a.daysIdle);
  omm.topStuck = omm.topStuck.slice(0, 5);
  omm.topAwaiting.sort((a, b) => b.daysWaiting - a.daysWaiting);
  omm.topAwaiting = omm.topAwaiting.slice(0, 5);

  // ── Spare Part ────────────────────────────────────────────────
  const sp = emptyStats('spare_part');
  for (const row of sparePartRows as any[]) {
    sp.total++;
    const norm = normalizeSparePartStatus(row.status);
    const submitted = norm === 'stock' || norm === 'ordered';
    if (submitted) sp.submitted++;
    else sp.pending++;
    const r: RiskLevel = norm === 'short' ? 'red' : norm === 'pending' ? 'amber' : 'green';
    sp.risk[r]++;

    const patch = {
      total: 1,
      submitted: submitted ? 1 : 0,
      pending: submitted ? 0 : 1,
      overdue: 0,
    };
    bumpCell(sp.bySubcontractor, row.subcontractor_name, patch);
    bumpCell(sp.byPic, row.hdec_pic_name, patch);
    bumpCell(sp.byTrade, row.trade, patch);
  }

  const warranty = emptyStats('warranty');

  return { abd, omm, spare_part: sp, warranty, scDateMap, leadDays };
}

// ── Trend helpers ────────────────────────────────────────────────
export type TrendGranularity = 'day' | 'week' | 'month';

export interface TrendPoint {
  bucket: string;
  label: string;
  abd: number;
  omm: number;
}

export function buildTrend(data: DashboardData, granularity: TrendGranularity, asOf: Date = new Date()): TrendPoint[] {
  const buckets: Date[] = [];
  if (granularity === 'day') {
    for (let i = 13; i >= 0; i--) buckets.push(startOfDay(subDays(asOf, i)));
  } else if (granularity === 'week') {
    for (let i = 11; i >= 0; i--) buckets.push(startOfWeek(subDays(asOf, i * 7), { weekStartsOn: 1 }));
  } else {
    for (let i = 5; i >= 0; i--) buckets.push(startOfMonth(subMonths(asOf, i)));
  }

  const fmt = granularity === 'month' ? 'MMM yyyy' : 'MMM dd';

  const sumModule = (m: ModuleStats, bucketStart: Date, nextStart: Date) => {
    let n = 0;
    for (const [k, v] of m.approvedByDay) {
      const d = parseISO(k);
      if (!isAfter(bucketStart, d) && isAfter(nextStart, d)) n += v;
    }
    return n;
  };

  return buckets.map((b, i) => {
    const next = buckets[i + 1] ?? (granularity === 'day'
      ? startOfDay(subDays(asOf, -1))
      : granularity === 'week'
        ? startOfWeek(subDays(asOf, -7), { weekStartsOn: 1 })
        : startOfMonth(subMonths(asOf, -1)));
    return {
      bucket: format(b, 'yyyy-MM-dd'),
      label: format(b, fmt),
      abd: sumModule(data.abd, b, next),
      omm: sumModule(data.omm, b, next),
    };
  });
}

export const MODULE_META: Record<DocsModuleId, { label: string; short: string; route: string; tone: 'primary' | 'accent' | 'muted' }> = {
  abd: { label: 'As-Built Drawings', short: 'ABD', route: '/docs/abd', tone: 'primary' },
  omm: { label: 'O&M Manuals', short: 'OMM', route: '/docs/omm', tone: 'accent' },
  spare_part: { label: 'Spare Parts', short: 'Spare Part', route: '/docs/spare-part', tone: 'muted' },
  warranty: { label: 'Warranty', short: 'Warranty', route: '/docs/warranty', tone: 'muted' },
};

export const ABD_STAGES = ['Pending', 'Sub1', 'Sub2', 'Sub3', 'Approved'] as const;
export const OMM_STAGES: OMMStatus[] = [
  'Pending Draft',
  'Draft Under Review',
  'Pending Final Submission',
  'Final Under Review',
  'Approved',
];
