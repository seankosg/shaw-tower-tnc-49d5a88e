// Helpers for applying Document Executive Dashboard URL params on the
// individual Raw Data pages. The dashboard cards/stages link with
// `?status=completed`, `?overdue=1`, `?stage=<stage_key>` and optional `?team=<team>`.
//
// Each helper accepts the loaded raw rows for a module and returns the set
// of row IDs that match the given URL parameters, so the Raw Data page can
// pre-filter its table data without touching its existing column filters.

import {
  buildAbdStageRecords, buildOmmStageRecords, buildWarrantyStageRecords,
  asOfStartOfDay, ALL_STAGE_DEFS, type DocModule,
} from '@/lib/docs-stage-records';
import { resolveTrade } from '@/lib/docs-trade';

export interface DashboardFilterParams {
  status?: string | null;   // 'completed'
  overdue?: string | null;  // '1'
  stage?: string | null;    // stage_key (eg 'abd.sub1_submission')
  team?: string | null;
  trade?: string | null;    // ABD only — TradeCategory string
}

export function readDashboardFilterParams(sp: URLSearchParams): DashboardFilterParams {
  return {
    status: sp.get('status'),
    overdue: sp.get('overdue'),
    stage: sp.get('stage'),
    team: sp.get('team'),
    trade: sp.get('trade'),
  };
}

export function hasAnyDashboardFilter(p: DashboardFilterParams): boolean {
  return !!(p.status || p.overdue || p.stage || p.team || p.trade);
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

  const out = new Set<string>();
  for (const [id, recs] of byItem) {
    if (params.team) {
      const teamMatch = recs.some((r: any) => (r.team ?? '') === params.team);
      if (!teamMatch) continue;
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
      // For a stage filter, show rows where the stage is NOT yet done
      // (i.e. work outstanding for that stage) — matches the dashboard
      // intent of "remaining in stage X". Done items aren't actionable.
      if (stageRec.is_done) continue;
    }
    out.add(id);
  }
  return out;
}

export function dashboardFilterLabel(module: DocModule, p: DashboardFilterParams): string | null {
  const parts: string[] = [];
  if (p.status === 'completed') parts.push('Completed');
  if (p.overdue === '1') parts.push('Overdue');
  if (p.stage) {
    const def = ALL_STAGE_DEFS[module].find((d) => d.key === p.stage);
    parts.push(`Stage: ${def?.label ?? p.stage}`);
  }
  if (p.team) parts.push(`Team: ${p.team}`);
  return parts.length ? parts.join(' · ') : null;
}
