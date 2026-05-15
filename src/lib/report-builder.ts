// Markdown status report builder.
// Aggregates per-module data directly from the backend and produces a
// structured Markdown document suitable for handing to an external LLM.

import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isValid } from 'date-fns';
import {
  simulateAllTncStages,
  type TncSimStage,
  type DelayMode,
} from '@/lib/tnc-simulation';
import { simulateAllDefectStages } from '@/lib/defect-simulation';
import type { SubtestForDashboard } from '@/lib/dashboard-utils';
import type { DefectItem } from '@/lib/defect-utils';
import type { DefectScheduleStage } from '@/lib/defect-schedule-utils';
import { TNC_RAW_DATA_GUIDE_MD } from '@/lib/tnc-raw-data-guide';

export type ReportModule = 'tnc' | 'defect' | 'docs' | 'punch';
export type ReportSection = 'dashboard' | 'progress' | 'simulation' | 'snapshots';

export interface ReportOptions {
  modules: ReportModule[];
  sections: ReportSection[];
  snapshotDates: string[]; // YYYY-MM-DD
  mcDate?: string;         // default 2026-06-15
  /** Delay handling for snapshot Predicted % (mirrors Simulation tab). Default 'penalty'. */
  delayMode?: DelayMode;
  /** Override Data Date (YYYY-MM-DD). When omitted, latest completed batch date is used. */
  dataDate?: string;
  /** Append the T&C Raw Data Business Guide as Appendix A. Default true when T&C module selected. */
  includeTncGuide?: boolean;
}

// ---------- helpers ----------
const MC_DEFAULT = '2026-06-15';

function pct(n: number, d: number): string {
  if (!d) return '0.0%';
  return ((n / d) * 100).toFixed(1) + '%';
}

function safeDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try { const d = parseISO(s); return isValid(d) ? d : null; } catch { return null; }
}

function isOnOrBefore(actual: string | null | undefined, snapshot: string): boolean {
  if (!actual) return false;
  return actual <= snapshot;
}

// ---------- T&C ----------
async function fetchTnc(): Promise<SubtestForDashboard[]> {
  const out: SubtestForDashboard[] = [];
  let from = 0; const size = 1000;
  while (true) {
    const { data, error } = await (supabase as any)
      .from('subtests')
      .select('*')
      .eq('is_active', true)
      .range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as SubtestForDashboard[]));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

/** Resolve effective Data Date: explicit override → latest completed T&C batch → today. */
async function resolveTncDataDate(override?: string): Promise<string> {
  if (override) return override;
  const { data } = await (supabase as any)
    .from('upload_batches')
    .select('data_date')
    .eq('status', 'completed')
    .not('data_date', 'is', null)
    .order('data_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.data_date as string | undefined) ?? format(new Date(), 'yyyy-MM-dd');
}

function tncCurrentCounts(rows: SubtestForDashboard[]) {
  const total = rows.length;
  const t1 = rows.filter(r => !!(r as any).t1_actual_date).length;
  const t2 = rows.filter(r => !!(r as any).t2_actual_date).length;
  const r2s = rows.filter(r => !!(r as any).r2_actual_submission_date).length;
  return { total, t1, t2, r2s };
}

function buildTncSection(rows: SubtestForDashboard[], opts: ReportOptions, dataDate: string): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const cur = tncCurrentCounts(rows);
  const planned = {
    t1: rows.filter(r => isOnOrBefore((r as any).t1_planned_date, today)).length,
    t2: rows.filter(r => isOnOrBefore((r as any).t2_planned_date, today)).length,
    r2s: rows.filter(r => isOnOrBefore((r as any).r2_target_submission_date, today)).length,
  };
  const mode: DelayMode = opts.delayMode ?? 'penalty';
  const modeLabel = mode === 'penalty' ? 'Worst Case' : 'Best Case';
  const lines: string[] = [];
  lines.push('## 1. T&C Management');
  if (opts.sections.includes('dashboard')) {
    lines.push('### 1.1 Dashboard');
    lines.push(`- Total subtests (active): **${cur.total}**`);
    lines.push(`- T1 completed: ${cur.t1} (${pct(cur.t1, cur.total)})`);
    lines.push(`- T2 completed: ${cur.t2} (${pct(cur.t2, cur.total)})`);
    lines.push(`- R2S completed: ${cur.r2s} (${pct(cur.r2s, cur.total)})`);
    lines.push('');
  }
  if (opts.sections.includes('progress')) {
    lines.push('### 1.2 Progress (Stages: T1 Internal Test, T2 Official Test, R2S Report Submission)');
    lines.push('| Stage | Planned to date | Actual to date | Actual % | Gap (Actual − Planned) |');
    lines.push('|-------|-----------------|----------------|----------|------------------------|');
    lines.push(`| T1 Internal Test | ${planned.t1} | ${cur.t1} | ${pct(cur.t1, cur.total)} | ${cur.t1 - planned.t1} |`);
    lines.push(`| T2 Official Test | ${planned.t2} | ${cur.t2} | ${pct(cur.t2, cur.total)} | ${cur.t2 - planned.t2} |`);
    lines.push(`| R2S Report Submission | ${planned.r2s} | ${cur.r2s} | ${pct(cur.r2s, cur.total)} | ${cur.r2s - planned.r2s} |`);
    lines.push('');
  }
  if (opts.sections.includes('simulation')) {
    lines.push('### 1.3 Simulation (vs Project Completion ' + (opts.mcDate ?? MC_DEFAULT) + ')');
    const mc = opts.mcDate ?? MC_DEFAULT;
    const remT2 = cur.total - cur.t2;
    const remR2S = cur.total - cur.r2s;
    const days = Math.max(1, Math.ceil((+new Date(mc) - Date.now()) / 86400000));
    lines.push(`- Days remaining to PC: **${days}**`);
    lines.push(`- T2 remaining: ${remT2} → required pace: ${(remT2 / days).toFixed(2)} / day`);
    lines.push(`- R2S remaining: ${remR2S} → required pace: ${(remR2S / days).toFixed(2)} / day`);
    lines.push('');
  }
  if (opts.sections.includes('snapshots')) {
    lines.push('### 1.4 Stage Progress Snapshots');
    lines.push(`_Computed via Simulation engine — mode: **${modeLabel}**, data date: **${dataDate}**, sequential: enforced._`);
    lines.push('| Date | T1 Predicted % (Actual %) | T2 Predicted % (Actual %) | R2S Predicted % (Actual %) |');
    lines.push('|------|---------------------------|---------------------------|----------------------------|');
    const stages: TncSimStage[] = ['t1', 't2', 'r2s'];
    for (const d of opts.snapshotDates) {
      const r = simulateAllTncStages(rows, d, { mode, dataDate, enforceSequential: true }, stages);
      const cell = (s: TncSimStage) => `${r[s].predictedPct.toFixed(1)}% (${r[s].actualPct.toFixed(1)}%)`;
      lines.push(`| ${d} | ${cell('t1')} | ${cell('t2')} | ${cell('r2s')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
async function fetchDefects(): Promise<DefectItem[]> {
  const out: DefectItem[] = [];
  let from = 0; const size = 1000;
  while (true) {
    const { data, error } = await (supabase as any)
      .from('defect_items')
      .select('*')
      .eq('is_active', true)
      .range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as DefectItem[]));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

/** Resolve effective Data Date for Defect: explicit override → latest completed defect batch → today. */
async function resolveDefectDataDate(override?: string): Promise<string> {
  if (override) return override;
  const { data } = await (supabase as any)
    .from('defect_upload_batches')
    .select('data_date')
    .eq('status', 'completed')
    .not('data_date', 'is', null)
    .order('data_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.data_date as string | undefined) ?? format(new Date(), 'yyyy-MM-dd');
}

function defectCurrentCounts(rows: DefectItem[]) {
  const total = rows.length;
  const completion = rows.filter(r => !!(r as any).actual_completion_date).length;
  const closure = rows.filter(r => !!(r as any).actual_closure_date).length;
  return { total, completion, closure };
}

function buildDefectSection(rows: DefectItem[], opts: ReportOptions, dataDate: string): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const cur = defectCurrentCounts(rows);
  const planned = {
    completion: rows.filter(r => isOnOrBefore((r as any).planned_completion_date, today)).length,
    closure: rows.filter(r => isOnOrBefore((r as any).planned_closure_date, today)).length,
  };
  const mode: DelayMode = opts.delayMode ?? 'penalty';
  const modeLabel = mode === 'penalty' ? 'Worst Case' : 'Best Case';
  const lines: string[] = [];
  lines.push('## 2. Defect Management');
  if (opts.sections.includes('dashboard')) {
    lines.push('### 2.1 Dashboard');
    lines.push(`- Total defects (active): **${cur.total}**`);
    lines.push(`- Completion done: ${cur.completion} (${pct(cur.completion, cur.total)})`);
    lines.push(`- Closure done: ${cur.closure} (${pct(cur.closure, cur.total)})`);
    lines.push('');
  }
  if (opts.sections.includes('progress')) {
    lines.push('### 2.2 Progress (Stages: Completion, Closure)');
    lines.push('| Stage | Planned to date | Actual to date | Actual % | Gap |');
    lines.push('|-------|-----------------|----------------|----------|-----|');
    lines.push(`| Completion | ${planned.completion} | ${cur.completion} | ${pct(cur.completion, cur.total)} | ${cur.completion - planned.completion} |`);
    lines.push(`| Closure | ${planned.closure} | ${cur.closure} | ${pct(cur.closure, cur.total)} | ${cur.closure - planned.closure} |`);
    lines.push('');
  }
  if (opts.sections.includes('simulation')) {
    const mc = opts.mcDate ?? MC_DEFAULT;
    const days = Math.max(1, Math.ceil((+new Date(mc) - Date.now()) / 86400000));
    lines.push('### 2.3 Simulation (vs PC ' + mc + ')');
    lines.push(`- Days remaining: **${days}**`);
    lines.push(`- Completion remaining: ${cur.total - cur.completion} → required: ${((cur.total - cur.completion) / days).toFixed(2)} / day`);
    lines.push(`- Closure remaining: ${cur.total - cur.closure} → required: ${((cur.total - cur.closure) / days).toFixed(2)} / day`);
    lines.push('');
  }
  if (opts.sections.includes('snapshots')) {
    lines.push('### 2.4 Stage Progress Snapshots');
    lines.push(`_Computed via Simulation engine — mode: **${modeLabel}**, data date: **${dataDate}**._`);
    lines.push('| Date | Start Predicted % (Actual %) | Completion Predicted % (Actual %) | Closure Predicted % (Actual %) |');
    lines.push('|------|------------------------------|-----------------------------------|--------------------------------|');
    const stages: DefectScheduleStage[] = ['start', 'completion', 'closure'];
    for (const d of opts.snapshotDates) {
      const r = simulateAllDefectStages(rows, d, { mode, dataDate }, stages);
      const cell = (s: DefectScheduleStage) => `${r[s].predictedPct.toFixed(1)}% (${r[s].actualPct.toFixed(1)}%)`;
      lines.push(`| ${d} | ${cell('start')} | ${cell('completion')} | ${cell('closure')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------- Punch ----------
interface PunchRow {
  actual_completion_date: string | null;
  planned_completion_date: string | null;
  completion_status: string | null;
}

async function fetchPunch(): Promise<PunchRow[]> {
  const out: PunchRow[] = [];
  let from = 0; const size = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('punch_items')
      .select('actual_completion_date,planned_completion_date,completion_status')
      .eq('is_active', true)
      .range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as PunchRow[]));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

function punchSnapshot(rows: PunchRow[], snap: string) {
  const total = rows.length;
  const completion = rows.filter(r => isOnOrBefore(r.actual_completion_date, snap)).length;
  return { total, completion };
}

function buildPunchSection(rows: PunchRow[], opts: ReportOptions): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const cur = punchSnapshot(rows, today);
  const planned = rows.filter(r => isOnOrBefore(r.planned_completion_date, today)).length;
  const lines: string[] = [];
  lines.push('## 4. Punch Management');
  if (opts.sections.includes('dashboard')) {
    lines.push('### 4.1 Dashboard');
    lines.push(`- Total punch items (active): **${cur.total}**`);
    lines.push(`- Completion done: ${cur.completion} (${pct(cur.completion, cur.total)})`);
    lines.push('');
  }
  if (opts.sections.includes('progress')) {
    lines.push('### 4.2 Progress (Stage: Completion)');
    lines.push('| Stage | Planned to date | Actual to date | Actual % | Gap |');
    lines.push('|-------|-----------------|----------------|----------|-----|');
    lines.push(`| Completion | ${planned} | ${cur.completion} | ${pct(cur.completion, cur.total)} | ${cur.completion - planned} |`);
    lines.push('');
  }
  if (opts.sections.includes('simulation')) {
    const mc = opts.mcDate ?? MC_DEFAULT;
    const days = Math.max(1, Math.ceil((+new Date(mc) - Date.now()) / 86400000));
    lines.push('### 4.3 Simulation (vs PC ' + mc + ')');
    lines.push(`- Days remaining: **${days}**`);
    lines.push(`- Completion remaining: ${cur.total - cur.completion} → required: ${((cur.total - cur.completion) / days).toFixed(2)} / day`);
    lines.push('');
  }
  if (opts.sections.includes('snapshots')) {
    lines.push('### 4.4 Stage Progress Snapshots');
    lines.push('| Date | Completion % |');
    lines.push('|------|--------------|');
    for (const d of opts.snapshotDates) {
      const s = punchSnapshot(rows, d);
      lines.push(`| ${d} | ${pct(s.completion, s.total)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ---------- Docs ----------
interface AbdRow {
  sub1_submission_date: string | null;
  sub1_approval_date: string | null;
  sub2_submission_date: string | null;
  sub2_approval_date: string | null;
  sub3_submission_date: string | null;
  sub3_approval_date: string | null;
  sub1_planned_date: string | null;
  sub2_planned_date: string | null;
  sub3_planned_date: string | null;
  approved_date: string | null;
  current_status: string | null;
}
interface OmmRow {
  sub1_actual_date: string | null;
  sub2_actual_date: string | null;
  sub3_actual_date: string | null;
  final_actual_date: string | null;
  final_response_actual_date: string | null;
  draft_actual_date: string | null;
}
interface WarrantyRow {
  draft_actual_date: string | null;
  subcon_signing_actual_date: string | null;
  hdec_signing_actual_date: string | null;
  final_actual_date: string | null;
}
interface SparePartRow {
  actual_confirm_date: string | null;
  actual_po_date: string | null;
  actual_delivery_date: string | null;
}

async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  let from = 0; const size = 1000;
  while (true) {
    let q: any = supabase.from(table as any).select(columns).eq('is_active', true);
    if (filter) q = filter(q);
    q = q.range(from, from + size - 1);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

async function buildDocsSection(opts: ReportOptions): Promise<string> {
  const lines: string[] = [];
  lines.push('## 3. Docs Management');

  // ABD
  const abd = await fetchAll<AbdRow>(
    'docs_drawings',
    'sub1_submission_date,sub1_approval_date,sub2_submission_date,sub2_approval_date,sub3_submission_date,sub3_approval_date,sub1_planned_date,sub2_planned_date,sub3_planned_date,approved_date,current_status',
    (q) => q.eq('sub_module', 'as_built'),
  );
  lines.push('### 3.1 ABD (As-Built Drawings)');
  lines.push(`- Total: **${abd.length}**`);
  if (opts.sections.includes('snapshots')) {
    lines.push('| Date | Sub1 Sub % | Sub1 Apv % | Sub2 Sub % | Sub2 Apv % | Sub3 Sub % | Sub3 Apv % | Approved % |');
    lines.push('|------|-----------|-----------|-----------|-----------|-----------|-----------|-----------|');
    for (const d of opts.snapshotDates) {
      const t = abd.length;
      const c = (k: keyof AbdRow) => abd.filter(r => isOnOrBefore(r[k] as string | null, d)).length;
      lines.push(`| ${d} | ${pct(c('sub1_submission_date'), t)} | ${pct(c('sub1_approval_date'), t)} | ${pct(c('sub2_submission_date'), t)} | ${pct(c('sub2_approval_date'), t)} | ${pct(c('sub3_submission_date'), t)} | ${pct(c('sub3_approval_date'), t)} | ${pct(c('approved_date'), t)} |`);
    }
  }
  lines.push('');

  // OMM
  const omm = await fetchAll<OmmRow>(
    'docs_omm',
    'sub1_actual_date,sub2_actual_date,sub3_actual_date,final_actual_date,final_response_actual_date,draft_actual_date',
  );
  lines.push('### 3.2 OMM (Operation & Maintenance Manual)');
  lines.push(`- Total: **${omm.length}**`);
  if (opts.sections.includes('snapshots')) {
    lines.push('| Date | Draft % | Sub1 % | Sub2 % | Sub3 % | Final Sub % | Final Apv % |');
    lines.push('|------|---------|--------|--------|--------|-------------|-------------|');
    for (const d of opts.snapshotDates) {
      const t = omm.length;
      const c = (k: keyof OmmRow) => omm.filter(r => isOnOrBefore(r[k] as string | null, d)).length;
      lines.push(`| ${d} | ${pct(c('draft_actual_date'), t)} | ${pct(c('sub1_actual_date'), t)} | ${pct(c('sub2_actual_date'), t)} | ${pct(c('sub3_actual_date'), t)} | ${pct(c('final_actual_date'), t)} | ${pct(c('final_response_actual_date'), t)} |`);
    }
  }
  lines.push('');

  // Warranty
  const warr = await fetchAll<WarrantyRow>(
    'warranty_items',
    'draft_actual_date,subcon_signing_actual_date,hdec_signing_actual_date,final_actual_date',
  );
  lines.push('### 3.3 Warranty Deeds');
  lines.push(`- Total: **${warr.length}**`);
  if (opts.sections.includes('snapshots')) {
    lines.push('| Date | Draft % | Subcon Sign % | HDEC Sign % | Final % |');
    lines.push('|------|---------|---------------|-------------|---------|');
    for (const d of opts.snapshotDates) {
      const t = warr.length;
      const c = (k: keyof WarrantyRow) => warr.filter(r => isOnOrBefore(r[k] as string | null, d)).length;
      lines.push(`| ${d} | ${pct(c('draft_actual_date'), t)} | ${pct(c('subcon_signing_actual_date'), t)} | ${pct(c('hdec_signing_actual_date'), t)} | ${pct(c('final_actual_date'), t)} |`);
    }
  }
  lines.push('');

  // Spare Part
  const sp = await fetchAll<SparePartRow>(
    'docs_spare_part',
    'actual_confirm_date,actual_po_date,actual_delivery_date',
  );
  lines.push('### 3.4 Spare Part');
  lines.push(`- Total: **${sp.length}**`);
  if (opts.sections.includes('snapshots')) {
    lines.push('| Date | Confirm % | PO % | Delivery % |');
    lines.push('|------|-----------|------|------------|');
    for (const d of opts.snapshotDates) {
      const t = sp.length;
      const c = (k: keyof SparePartRow) => sp.filter(r => isOnOrBefore(r[k] as string | null, d)).length;
      lines.push(`| ${d} | ${pct(c('actual_confirm_date'), t)} | ${pct(c('actual_po_date'), t)} | ${pct(c('actual_delivery_date'), t)} |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

// ---------- public ----------
export async function buildReportMarkdown(opts: ReportOptions): Promise<string> {
  const mode: DelayMode = opts.delayMode ?? 'penalty';
  const modeLabel = mode === 'penalty' ? 'Worst Case' : 'Best Case';

  // Resolve data dates upfront (used in head + per-module snapshots)
  const needsTncDate = opts.modules.includes('tnc');
  const needsDefectDate = opts.modules.includes('defect');
  const [tncDataDate, defectDataDate] = await Promise.all([
    needsTncDate ? resolveTncDataDate(opts.dataDate) : Promise.resolve(opts.dataDate ?? ''),
    needsDefectDate ? resolveDefectDataDate(opts.dataDate) : Promise.resolve(opts.dataDate ?? ''),
  ]);

  const head: string[] = [];
  head.push('# SHAW Project — Status Report');
  head.push(`_Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')} (SGT)_`);
  head.push(`_Project Completion D-Day: ${opts.mcDate ?? MC_DEFAULT}_`);
  head.push(`_Snapshot dates: ${opts.snapshotDates.join(', ') || '(none)'}_`);
  head.push(`_Snapshot delay mode: **${modeLabel}**_`);
  if (needsTncDate) head.push(`_T&C data date: ${tncDataDate}_`);
  if (needsDefectDate) head.push(`_Defect data date: ${defectDataDate}_`);
  const includeGuide = needsTncDate && opts.includeTncGuide !== false;
  if (includeGuide) head.push(`_T&C guide: included (Appendix A)_`);
  head.push('');

  const parts: string[] = [head.join('\n')];

  if (opts.modules.includes('tnc')) {
    const rows = await fetchTnc();
    parts.push(buildTncSection(rows, opts, tncDataDate));
  }
  if (opts.modules.includes('defect')) {
    const rows = await fetchDefects();
    parts.push(buildDefectSection(rows, opts, defectDataDate));
  }
  if (opts.modules.includes('docs')) {
    parts.push(await buildDocsSection(opts));
  }
  if (opts.modules.includes('punch')) {
    const rows = await fetchPunch();
    parts.push(buildPunchSection(rows, opts));
  }

  if (includeGuide) parts.push(TNC_RAW_DATA_GUIDE_MD);

  return parts.join('\n');
}
