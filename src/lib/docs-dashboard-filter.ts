// Helpers for applying Document Executive Dashboard URL params on the
// individual Raw Data pages.

import {
  buildAbdStageRecords, buildOmmStageRecords, buildWarrantyStageRecords,
  buildSparePartStageRecords,
  asOfStartOfDay, ALL_STAGE_DEFS, classifyAbdRowBucket,
  classifyOmmSub1Status, classifyOmmSub2Status,
  bucketDelayDays, isDueThisWeek, computeDataQualityIssues,
  type DocModule,
} from '@/lib/docs-stage-records';
import { resolveTrade } from '@/lib/docs-trade';
import { isOverdueSparePart, procurementProgressLevel } from '@/lib/spare-part-utils';
import { normalizeSparePartStatus } from '@/lib/docs-spare-part-status';

export interface DashboardFilterParams {
  status?: string | null;   // 'completed' | 'short' | 'pending' | 'ordered' | 'stock' | 'unknown'
  overdue?: string | null;  // '1'
  stage?: string | null;
  team?: string | null;
  trade?: string | null;
  bucket?: string | null;
  sub1_status?: string | null;
  sub2_status?: string | null;
  // Extended filters
  subcontractor?: string | null;
  hdec_pic?: string | null;
  due_this_week?: string | null; // '1'
  delay_bucket?: string | null;  // '0-7' | '8-14' | '15-30' | '30+'
  dq?: string | null;            // data quality issue key
  // Spare-part specific
  po_status?: string | null;
  eta_missing?: string | null;       // '1' | 'true'
  po_pending?: string | null;        // '1' | 'true'
  delivery_pending?: string | null;  // '1' | 'true'
}

export function readDashboardFilterParams(sp: URLSearchParams): DashboardFilterParams {
  return {
    status: sp.get('status'),
    overdue: sp.get('overdue'),
    stage: sp.get('stage'),
    team: sp.get('team'),
    trade: sp.get('trade'),
    bucket: sp.get('bucket'),
    sub1_status: sp.get('sub1_status'),
    sub2_status: sp.get('sub2_status'),
    subcontractor: sp.get('subcontractor'),
    hdec_pic: sp.get('hdec_pic'),
    due_this_week: sp.get('due_this_week'),
    delay_bucket: sp.get('delay_bucket'),
    dq: sp.get('dq'),
    po_status: sp.get('po_status'),
    eta_missing: sp.get('eta_missing'),
    po_pending: sp.get('po_pending'),
    delivery_pending: sp.get('delivery_pending'),
  };
}

export function hasAnyDashboardFilter(p: DashboardFilterParams): boolean {
  return !!(p.status || p.overdue || p.stage || p.team || p.trade || p.bucket
    || p.sub1_status || p.sub2_status
    || p.subcontractor || p.hdec_pic || p.due_this_week || p.delay_bucket || p.dq
    || p.po_status || p.eta_missing || p.po_pending || p.delivery_pending);
}

const BUILDERS: Record<DocModule, (rows: any[], asOf: Date) => any[]> = {
  abd: buildAbdStageRecords,
  omm: buildOmmStageRecords,
  warranty: buildWarrantyStageRecords,
  spare_part: buildSparePartStageRecords,
};

/**
 * Compute the set of row IDs that satisfy the dashboard filter.
 */
export function computeDashboardFilteredIds(
  module: DocModule,
  rows: any[],
  params: DashboardFilterParams,
  asOf: Date = new Date(),
): Set<string> | null {
  if (!hasAnyDashboardFilter(params)) return null;
  const records = BUILDERS[module](rows, asOfStartOfDay(asOf));
  const lastKey = ALL_STAGE_DEFS[module].at(-1)!.key;

  const byItem = new Map<string, typeof records>();
  for (const r of records) {
    const arr = byItem.get(r.item_id) ?? [];
    arr.push(r);
    byItem.set(r.item_id, arr);
  }

  const tradeById = new Map<string, string>();
  if (module === 'abd' && params.trade) {
    for (const r of rows) {
      const t = resolveTrade(r as any);
      tradeById.set(r.id, t === '—' ? '' : (t as string));
    }
  }

  const bucketById = new Map<string, string>();
  if (module === 'abd' && params.bucket) {
    for (const r of rows) bucketById.set(r.id, classifyAbdRowBucket(r));
  }

  const ommSub1ById = new Map<string, string | null>();
  if (module === 'omm' && params.sub1_status) {
    for (const r of rows) ommSub1ById.set(r.id, classifyOmmSub1Status(r));
  }
  const ommSub2ById = new Map<string, string | null>();
  if (module === 'omm' && params.sub2_status) {
    for (const r of rows) ommSub2ById.set(r.id, classifyOmmSub2Status(r));
  }

  const dueThisWeekIds = params.due_this_week === '1' ? isDueThisWeek(records, asOf) : null;

  // Max delay per item for delay_bucket filter
  const maxDelayByItem = new Map<string, number>();
  if (params.delay_bucket) {
    for (const r of records) {
      if (!r.is_overdue) continue;
      const cur = maxDelayByItem.get(r.item_id) ?? 0;
      if (r.delay_days > cur) maxDelayByItem.set(r.item_id, r.delay_days);
    }
  }

  // Data quality ids
  const dqIds = new Set<string>();
  if (params.dq) {
    const issues = computeDataQualityIssues(records, {
      abd: module === 'abd' ? rows : [],
      omm: module === 'omm' ? rows : [],
      warranty: module === 'warranty' ? rows : [],
    });
    for (const it of issues) {
      if (it.key === params.dq) for (const id of it.ids) dqIds.add(id);
    }
  }

  const out = new Set<string>();
  for (const [id, recs] of byItem) {
    if (params.team) {
      const teamMatch = recs.some((r: any) => (r.team ?? '') === params.team);
      if (!teamMatch) continue;
    }
    if (params.subcontractor) {
      const ok = recs.some((r: any) => (r.subcontractor ?? '') === params.subcontractor);
      if (!ok) continue;
    }
    if (params.hdec_pic) {
      const ok = recs.some((r: any) => (r.hdec_pic ?? '') === params.hdec_pic);
      if (!ok) continue;
    }
    if (module === 'abd' && params.trade) {
      if ((tradeById.get(id) ?? '') !== params.trade) continue;
    }
    if (module === 'abd' && params.bucket) {
      const b = bucketById.get(id) ?? '';
      const want = params.bucket;
      if (want === 'submission_required') {
        if (b !== 'sub1_required' && b !== 'sub2_required' && b !== 'sub3_required') continue;
      } else if (want === 'done') {
        if (b !== 'approved' && b !== 'under_review') continue;
      } else if (b !== want) {
        continue;
      }
    }
    if (module === 'omm' && params.sub1_status) {
      const v = ommSub1ById.get(id);
      if (v == null || v !== params.sub1_status) continue;
    }
    if (module === 'omm' && params.sub2_status) {
      const v = ommSub2ById.get(id);
      if (v == null || v !== params.sub2_status) continue;
    }
    if (params.status === 'completed') {
      const ok = recs.some((r: any) => r.stage_key === lastKey && r.is_done);
      if (!ok) continue;
    }
    if (params.overdue === '1') {
      const ok = recs.some((r: any) => r.is_overdue);
      if (!ok) continue;
    }
    if (params.stage) {
      const stageRec = recs.find((r: any) => r.stage_key === params.stage);
      if (!stageRec) continue;
      if (stageRec.is_done) continue;
    }
    if (dueThisWeekIds && !dueThisWeekIds.has(id)) continue;
    if (params.delay_bucket) {
      const d = maxDelayByItem.get(id) ?? 0;
      const b = bucketDelayDays(d);
      if (b !== params.delay_bucket) continue;
    }
    if (params.dq && !dqIds.has(id)) continue;
    out.add(id);
  }
  return out;
}

const ABD_BUCKET_LABEL: Record<string, string> = {
  approved: 'Approved',
  under_review: 'Under Review',
  done: 'Done (Approved + Under Review)',
  submission_required: 'Submission Required',
  sub1_required: '1st Submission Required',
  sub2_required: '2nd Submission Required',
  sub3_required: '3rd Submission Required',
};

const DQ_LABEL: Record<string, string> = {
  missing_planned: 'Missing planned date',
  missing_actual: 'Missing actual date',
  missing_subcontractor: 'Missing subcontractor',
  missing_hdec_pic: 'Missing HDEC PIC',
  inconsistent_stage: 'Inconsistent stage data',
};

export function dashboardFilterLabel(module: DocModule, p: DashboardFilterParams): string | null {
  const parts: string[] = [];
  if (p.status === 'completed') parts.push('Completed');
  if (p.overdue === '1') parts.push('Overdue');
  if (p.due_this_week === '1') parts.push('Due This Week');
  if (p.delay_bucket) parts.push(`Delay ${p.delay_bucket}d`);
  if (p.stage) {
    const def = ALL_STAGE_DEFS[module].find((d) => d.key === p.stage);
    parts.push(`Stage: ${def?.label ?? p.stage}`);
  }
  if (p.bucket) parts.push(ABD_BUCKET_LABEL[p.bucket] ?? p.bucket);
  if (p.team) parts.push(`Team: ${p.team}`);
  if (p.trade) parts.push(`Trade: ${p.trade}`);
  if (p.subcontractor) parts.push(`Subcon: ${p.subcontractor}`);
  if (p.hdec_pic) parts.push(`PIC: ${p.hdec_pic}`);
  if (p.sub1_status) parts.push(`1st Status: ${p.sub1_status}`);
  if (p.sub2_status) parts.push(`2nd Status: ${p.sub2_status}`);
  if (p.dq) parts.push(`Data Quality: ${DQ_LABEL[p.dq] ?? p.dq}`);
  return parts.length ? parts.join(' · ') : null;
}
