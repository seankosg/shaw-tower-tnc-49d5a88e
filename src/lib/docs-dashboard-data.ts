// Aggregation helpers for the Docs Management Dashboard.
// Loads ABD / OMM / Spare Part rows in parallel and derives KPI / risk / trend buckets.

import { supabase } from '@/integrations/supabase/client';
import { computeRisk, type RiskLevel } from '@/lib/docs-risk';
import { computeOMMStatus } from '@/lib/docs-omm-status';
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
  risk: Record<RiskLevel, number>;
  /** date(YYYY-MM-DD) -> approved count (for trend) */
  approvedByDay: Map<string, number>;
  /** Top-5 overdue items for detail card */
  topOverdue: Array<{ id: string; label: string; daysLate: number }>;
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
  risk: { green: 0, amber: 0, red: 0 },
  approvedByDay: new Map(),
  topOverdue: [],
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
            'sub1_planned_date, sub3_planned_date, sub3_approval_date, ' +
            'discipline, current_status, raw_payload, custom_payload',
        )
        .eq('sub_module', 'as_built')
        .eq('is_active', true),
    ),
    fetchAll(() =>
      supabase
        .from('docs_omm')
        .select(
          'id, sn, contract_doc, project_id, draft_actual_date, submission_actual_date, ' +
            'approved_date, submission_target_date, draft_target_date, hdec_pic_name, ' +
            'subcontractor_name, trade',
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

  const abdRes = { data: abdRows };
  const ommRes = { data: ommRows };
  const sparePartRes = { data: sparePartRows };

  const scDateMap: Record<string, string> = {};
  for (const s of settingsRes.data ?? []) {
    const projectId = s.key.replace('docs_sc_date_', '');
    if (typeof s.value === 'string') scDateMap[projectId] = s.value;
  }
  let leadDays = leadDaysFallback;
  for (const s of leadRes.data ?? []) {
    if (s.key === 'docs_lead_days_as_built' && typeof s.value === 'number') leadDays = s.value;
  }

  // ── ABD
  const abd = emptyStats('abd');
  for (const row of (abdRes.data ?? []) as any[]) {
    abd.total++;
    const submitted = !!row.is_submitted;
    if (submitted) abd.submitted++;
    else abd.pending++;

    // Risk uses SC date + lead
    const sc = scDateMap[row.project_id];
    const r = computeRisk(submitted, sc, leadDays, asOf);
    abd.risk[r]++;

    // Overdue: not submitted and sub1_planned_date < asOf
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
      });
    }

    // Approval trend
    const approved = safeIso(row.approved_date) ?? safeIso(row.sub3_approval_date);
    if (approved) {
      const k = format(approved, 'yyyy-MM-dd');
      abd.approvedByDay.set(k, (abd.approvedByDay.get(k) ?? 0) + 1);
    }

    // Cross-cut (ABD has no subcontractor/pic columns directly — pull from raw_payload)
    const payload = (row.raw_payload ?? {}) as Record<string, any>;
    const sub = payload.subcontractor_name ?? payload.subcontractor ?? row.discipline ?? null;
    const pic = payload.hdec_pic_name ?? payload.hdec_pic ?? null;
    const trade = payload.trade ?? row.discipline ?? null;
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

  // ── OMM
  const omm = emptyStats('omm');
  for (const row of (ommRes.data ?? []) as any[]) {
    omm.total++;
    const status = computeOMMStatus(row);
    const submitted = status === 'Approved';
    if (submitted) omm.submitted++;
    else omm.pending++;

    // OMM has no SC-based risk yet — derive from submission_target vs asOf
    const target = safeIso(row.submission_target_date) ?? safeIso(row.draft_target_date);
    let r: RiskLevel = 'green';
    if (!submitted && target) {
      const days = differenceInDays(target, asOf);
      if (days < 0) r = 'red';
      else if (days < 7) r = 'amber';
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
        label: `${row.sn ?? '—'}${row.contract_doc ? ' — ' + row.contract_doc : ''}`,
        daysLate,
      });
    }

    const approved = safeIso(row.approved_date);
    if (approved) {
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
  }
  omm.topOverdue.sort((a, b) => b.daysLate - a.daysLate);
  omm.topOverdue = omm.topOverdue.slice(0, 5);

  // ── Spare Part (no due dates → no overdue / trend; use status normalisation for submitted)
  const sp = emptyStats('spare_part');
  for (const row of (sparePartRes.data ?? []) as any[]) {
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

  // Warranty placeholder
  const warranty = emptyStats('warranty');

  return { abd, omm, spare_part: sp, warranty, scDateMap, leadDays };
}

// ── Trend helpers ────────────────────────────────────────────────
export type TrendGranularity = 'day' | 'week' | 'month';

export interface TrendPoint {
  bucket: string; // ISO date of bucket start
  label: string;
  abd: number;
  omm: number;
  spare_part: number;
  warranty: number;
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

  const fmt = granularity === 'month' ? 'MMM yyyy' : granularity === 'week' ? 'MMM dd' : 'MMM dd';

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
      spare_part: sumModule(data.spare_part, b, next),
      warranty: 0,
    };
  });
}

export const MODULE_META: Record<DocsModuleId, { label: string; short: string; route: string }> = {
  abd: { label: 'As-Built Drawings', short: 'ABD', route: '/docs/abd' },
  omm: { label: 'O&M Manuals', short: 'OMM', route: '/docs/omm' },
  spare_part: { label: 'Spare Parts', short: 'Spare Part', route: '/docs/spare-part' },
  warranty: { label: 'Warranty', short: 'Warranty', route: '/docs/warranty' },
};
