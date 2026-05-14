// Helpers for applying Document Executive Dashboard URL params on the
// individual Raw Data pages. The dashboard cards/stages link with
// `?status=completed`, `?overdue=1`, `?stage=<stage_key>` and optional `?team=<team>`.
//
// Each helper accepts the loaded raw rows for a module and returns the set
// of row IDs that match the given URL parameters, so the Raw Data page can
// pre-filter its table data without touching its existing column filters.

import {
  buildAbdStageRecords, buildOmmStageRecords, buildWarrantyStageRecords,
  asOfStartOfDay, ALL_STAGE_DEFS, classifyAbdRowBucket,
  classifyOmmSub1Status, classifyOmmSub2Status,
  type DocModule,
} from '@/lib/docs-stage-records';
import { resolveTrade } from '@/lib/docs-trade';

export interface DashboardFilterParams {
  status?: string | null;   // 'completed'
  overdue?: string | null;  // '1'
  stage?: string | null;    // stage_key (eg 'abd.sub1_submission')
  team?: string | null;
  trade?: string | null;    // ABD only — TradeCategory string
  /** ABD bucket: approved | under_review | submission_required | sub1_required | sub2_required | sub3_required */
  bucket?: string | null;
  /** OMM Sub1 Status bucket: A | B | C | UR | TBS */
  sub1_status?: string | null;
  /** OMM Sub2 Status bucket: A | B | C | UR | TBS */
  sub2_status?: string | null;
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
  };
}

export function hasAnyDashboardFilter(p: DashboardFilterParams): boolean {
  return !!(p.status || p.overdue || p.stage || p.team || p.trade || p.bucket || p.sub1_status || p.sub2_status);
}

const BUILDERS: Record<DocModule, (rows: any[], asOf: Date) => any[]> = {
  abd: buildAbdStageRecords,
  omm: buildOmmStageRecords,
  warranty: buildWarrantyStageRecords,
};

/**
 * Compute the set of row IDs that satisfy the dashboard filter. Returns null
 * when no filter is active (caller should bypass filtering entirely).
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

  // Group by item_id
  const byItem = new Map<string, typeof records>();
  for (const r of records) {
    const arr = byItem.get(r.item_id) ?? [];
    arr.push(r);
    byItem.set(r.item_id, arr);
  }

  // For ABD trade filter, build id -> trade map from raw rows
  const tradeById = new Map<string, string>();
  if (module === 'abd' && params.trade) {
    for (const r of rows) {
      const t = resolveTrade(r as any);
      tradeById.set(r.id, t === '—' ? '' : (t as string));
    }
  }

  // For ABD bucket filter, build id -> bucket map from raw rows (SSOT)
  const bucketById = new Map<string, string>();
  if (module === 'abd' && params.bucket) {
    for (const r of rows) {
      bucketById.set(r.id, classifyAbdRowBucket(r));
    }
  }

  // For OMM sub1_status / sub2_status filter, build id -> bucket map from raw rows.
  // classifyOmm*Status returns null for rows whose current cycle isn't sub1/sub2,
  // ensuring each row is counted only in its active cycle's bucket (no double-counting).
  const ommSub1ById = new Map<string, string | null>();
  if (module === 'omm' && params.sub1_status) {
    for (const r of rows) ommSub1ById.set(r.id, classifyOmmSub1Status(r));
  }
  const ommSub2ById = new Map<string, string | null>();
  if (module === 'omm' && params.sub2_status) {
    for (const r of rows) ommSub2ById.set(r.id, classifyOmmSub2Status(r));
  }

  const out = new Set<string>();
  for (const [id, recs] of byItem) {
    if (params.team) {
      const teamMatch = recs.some((r: any) => (r.team ?? '') === params.team);
      if (!teamMatch) continue;
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
      if ((ommSub1ById.get(id) ?? '') !== params.sub1_status) continue;
    }
    if (module === 'omm' && params.sub2_status) {
      if ((ommSub2ById.get(id) ?? '') !== params.sub2_status) continue;
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

export function dashboardFilterLabel(module: DocModule, p: DashboardFilterParams): string | null {
  const parts: string[] = [];
  if (p.status === 'completed') parts.push('Completed');
  if (p.overdue === '1') parts.push('Overdue');
  if (p.stage) {
    const def = ALL_STAGE_DEFS[module].find((d) => d.key === p.stage);
    parts.push(`Stage: ${def?.label ?? p.stage}`);
  }
  if (p.bucket) parts.push(ABD_BUCKET_LABEL[p.bucket] ?? p.bucket);
  if (p.team) parts.push(`Team: ${p.team}`);
  if (p.trade) parts.push(`Trade: ${p.trade}`);
  if (p.sub1_status) parts.push(`1st Status: ${p.sub1_status}`);
  if (p.sub2_status) parts.push(`2nd Status: ${p.sub2_status}`);
  return parts.length ? parts.join(' · ') : null;
}
