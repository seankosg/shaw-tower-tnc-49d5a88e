/**
 * Auto-fill DDN inputs from raw data (Puretech scope only) for a given entry_date.
 *
 * Hook: useDdnAutoFill(entryDate) → { data: AutoFillResult, refetch, isFetching }
 *
 * All raw queries strictly filter `subcontractor_name IN PT_NAMES` so sub-subs
 * (which inherit the parent name) are included while non-Puretech work is excluded.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PT_NAMES } from './pt-filter';
import { RTO_TRADE_MAP } from './auto-fill-trade-map';
import { summarizeSystems, summarizeSystemNames, type SystemRow } from './system-summary';
import type { AutoMap, AutoFillResult } from './auto-fill-types';

const PT = PT_NAMES as readonly string[];

// ---------- 1. Planned Tests (Pred / T1 / T2 / R1S / R2S + delayed) ----------

async function fetchPlannedTests(D: string, map: AutoMap, errs: string[]) {
  // Counts: fetch all rows once, count in client (Supabase JS has no FILTER aggregate).
  // Volume is bounded by Puretech subtests; OK.
  const { data, error } = await supabase
    .from('subtests')
    .select('id, system_id, level, pred_planned_date, pred_actual_date, pred_status, t1_planned_date, t1_actual_date, t1_status, t2_planned_date, t2_actual_date, t2_status, r1_target_submission_date, r1_actual_submission_date, r1_status, r2_target_submission_date, r2_actual_submission_date, r2_status')
    .eq('is_active', true)
    .in('subcontractor_name', PT);
  if (error) { errs.push(`subtests: ${error.message}`); return; }
  const rows = data ?? [];

  // Load system_master once for system names
  const sysIds = Array.from(new Set(rows.map((r) => r.system_id).filter(Boolean) as string[]));
  let sysName = new Map<string, string>();
  if (sysIds.length) {
    const { data: sm } = await supabase
      .from('system_master').select('id, system_name_std, system_code').in('id', sysIds);
    for (const s of sm ?? []) {
      const nm = (s.system_name_std as string | null) || (s.system_code as string | null) || '';
      sysName.set(s.id as string, nm);
    }
  }
  const sysOf = (id: string | null): string => (id ? sysName.get(id) ?? '' : '');

  type Stage = 'pred' | 't1' | 't2' | 'r1s' | 'r2s';
  const stageRows = (stage: Stage) => {
    const planK = stage === 'r1s' ? 'r1_target_submission_date'
                : stage === 'r2s' ? 'r2_target_submission_date'
                : `${stage}_planned_date` as const;
    const actK = stage === 'r1s' ? 'r1_actual_submission_date'
                : stage === 'r2s' ? 'r2_actual_submission_date'
                : `${stage}_actual_date` as const;
    const statusK = stage === 'r1s' ? 'r1_status'
                  : stage === 'r2s' ? 'r2_status'
                  : `${stage}_status` as const;
    const doneVals = stage === 'r1s' || stage === 'r2s'
      ? new Set(['Submitted', 'Approved'])
      : new Set(['Done']);

    const planned = rows.filter((r) => (r as Record<string, unknown>)[planK] === D);
    const actual = rows.filter((r) =>
      (r as Record<string, unknown>)[actK] === D &&
      doneVals.has((r as Record<string, unknown>)[statusK] as string));
    return { planned, actual };
  };

  const stages: Stage[] = ['pred', 't1', 't2', 'r1s', 'r2s'];
  for (const s of stages) {
    const { planned, actual } = stageRows(s);
    const sysRows: SystemRow[] = planned.map((r) => ({
      system: sysOf(r.system_id as string | null),
      level: (r.level as string | null) ?? null,
    }));
    map[`planned_tests.${s}_plan`] = { value: planned.length, source: 'subtests', note: `${s.toUpperCase()} planned on ${D}` };
    map[`planned_tests.${s}_actual`] = { value: actual.length, source: 'subtests', note: `${s.toUpperCase()} done on ${D}` };
    if (sysRows.length) {
      map[`planned_tests.${s}_systems`] = {
        value: summarizeSystemNames(sysRows),
        source: 'subtests',
        note: `${s.toUpperCase()} systems from ${sysRows.length} subtest(s)`,
      };
    }
  }

  // Delayed items: planned before D but not done as of D — group by system
  const isOverdue = (planDate: unknown, actDate: unknown, status: unknown) => {
    if (!planDate || typeof planDate !== 'string') return false;
    if (planDate >= D) return false;
    if (status === 'Done') return false;
    return true;
  };
  const delayedSysRows: SystemRow[] = [];
  for (const r of rows) {
    const overdueT1 = isOverdue(r.t1_planned_date, r.t1_actual_date, r.t1_status);
    const overdueT2 = isOverdue(r.t2_planned_date, r.t2_actual_date, r.t2_status);
    if (overdueT1 || overdueT2) {
      delayedSysRows.push({ system: sysOf(r.system_id as string | null), level: (r.level as string | null) ?? null });
    }
  }
  if (delayedSysRows.length) {
    // Group by system and produce one repeatable item per system
    const bySys = new Map<string, SystemRow[]>();
    for (const r of delayedSysRows) {
      const k = r.system || '(unknown)';
      const arr = bySys.get(k) ?? [];
      arr.push(r);
      bySys.set(k, arr);
    }
    const items = Array.from(bySys.entries()).map(([sys, list]) => ({
      name: summarizeSystemNames(list) || sys,
      reasons: ['delay'],
    }));
    map['planned_tests.delayed_items'] = {
      value: items,
      source: 'subtests',
      note: `${delayedSysRows.length} overdue subtest(s) across ${bySys.size} system(s)`,
    };
  }
}

// ---------- 2. Defects (sec3) ----------

async function fetchDefects(D: string, map: AutoMap, errs: string[]) {
  const { data, error } = await supabase
    .from('defect_items')
    .select('id, status, actual_closure_date, created_at, updated_at, is_active')
    .in('subcontractor_name', PT);
  if (error) { errs.push(`defect_items: ${error.message}`); return; }
  const rows = data ?? [];
  const open = rows.filter((r) => r.is_active && r.status === 'Open').length;
  const closedToday = rows.filter((r) => r.actual_closure_date === D
    || (r.status === 'Closed' && typeof r.updated_at === 'string' && r.updated_at.slice(0, 10) === D)).length;
  const newToday = rows.filter((r) => r.is_active && typeof r.created_at === 'string' && r.created_at.slice(0, 10) === D).length;
  map['sec3.def_open']         = { value: open, source: 'defect_items', note: 'Open defects (active)' };
  map['sec3.def_closed_today'] = { value: closedToday, source: 'defect_items', note: `Closed on ${D}` };
  map['sec3.def_new_today']    = { value: newToday, source: 'defect_items', note: `Created on ${D}` };
}

// ---------- 3. T&C Reject (sec3) ----------

async function fetchTcReject(D: string, map: AutoMap, errs: string[]) {
  const dayStart = `${D}T00:00:00.000Z`;
  const dayEnd = `${D}T23:59:59.999Z`;
  const { data, error } = await supabase
    .from('subtest_change_log')
    .select('subtest_id, changed_field, new_value, changed_at, subtests!inner(system_id, level, remarks, subcontractor_name)')
    .gte('changed_at', dayStart)
    .lte('changed_at', dayEnd)
    .in('changed_field', ['t1_status', 't2_status', 'r1_status', 'r2_status'])
    .eq('new_value', 'Returned');
  if (error) { errs.push(`subtest_change_log: ${error.message}`); return; }
  type Row = { subtest_id: string; new_value: string; subtests: { system_id: string | null; level: string | null; remarks: string | null; subcontractor_name: string | null } };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => PT.includes(r.subtests?.subcontractor_name ?? ''));
  if (rows.length === 0) {
    map['sec3.tc_reject'] = { value: 'N', source: 'subtest_change_log', note: 'No T&C rejects on this date' };
    return;
  }
  map['sec3.tc_reject'] = { value: 'Y', source: 'subtest_change_log', note: `${rows.length} T&C reject(s) on ${D}` };
  // Resolve system names
  const sysIds = Array.from(new Set(rows.map((r) => r.subtests?.system_id).filter(Boolean) as string[]));
  const sysName = new Map<string, string>();
  if (sysIds.length) {
    const { data: sm } = await supabase
      .from('system_master').select('id, system_name_std, system_code').in('id', sysIds);
    for (const s of sm ?? []) {
      const nm = (s.system_name_std as string | null) || (s.system_code as string | null) || '';
      sysName.set(s.id as string, nm);
    }
  }
  const sysRows: SystemRow[] = rows.map((r) => ({
    system: r.subtests?.system_id ? sysName.get(r.subtests.system_id) ?? '' : '',
    level: r.subtests?.level ?? null,
  }));
  map['sec3.tc_reject_system'] = { value: summarizeSystemNames(sysRows), source: 'subtest_change_log', note: 'Systems with returned reports' };
  const firstReason = rows.find((r) => r.subtests?.remarks)?.subtests?.remarks;
  if (firstReason) {
    map['sec3.tc_reject_reason'] = { value: firstReason, source: 'subtest_change_log', note: 'First subtest remarks (most recent)' };
  }
}

// ---------- 4. Substantial Completion (sec4) ----------

async function fetchSubstantial(D: string, map: AutoMap, errs: string[]) {
  // 4a. As-Built
  const { data: dw, error: e1 } = await supabase
    .from('docs_drawings')
    .select('sub_module, discipline, approved_date')
    .eq('is_active', true)
    .in('subcontractor_name', PT);
  if (e1) errs.push(`docs_drawings: ${e1.message}`);
  else {
    const ab = (dw ?? []).filter((r) => r.sub_module === 'as_built' && /^elec/i.test(String(r.discipline ?? '')));
    const cum = ab.filter((r) => r.approved_date && (r.approved_date as string) <= D).length;
    const today = ab.filter((r) => r.approved_date === D).length;
    map['sec4.asbuilt_cum']   = { value: cum, source: 'docs_drawings', note: 'As-Built ELEC approved cumulative' };
    map['sec4.asbuilt_today'] = { value: today, source: 'docs_drawings', note: `As-Built ELEC approved on ${D}` };
  }

  // 4b/4c. O&M
  const { data: omm, error: e2 } = await supabase
    .from('docs_omm')
    .select('trade, category_group, sub1_actual_date, sub2_actual_date, sub3_actual_date, final_actual_date, is_resubmission, updated_at')
    .eq('is_active', true)
    .in('subcontractor_name', PT);
  if (e2) errs.push(`docs_omm: ${e2.message}`);
  else {
    const elecHit = (omm ?? []).some((r) =>
      (/^elec/i.test(String(r.trade ?? '')) || /^elec/i.test(String(r.category_group ?? ''))) &&
      (r.sub2_actual_date === D || r.sub3_actual_date === D ||
        (r.is_resubmission && typeof r.updated_at === 'string' && r.updated_at.slice(0, 10) === D))
    );
    map['sec4.om_elec'] = { value: elecHit ? 'Y' : 'N', source: 'docs_omm', note: 'O&M ELEC resubmission on this date' };

    const elvHit = (omm ?? []).some((r) =>
      (String(r.trade ?? '') === 'ELV' || /^elv/i.test(String(r.category_group ?? ''))) &&
      (r.sub1_actual_date === D || r.sub2_actual_date === D || r.final_actual_date === D)
    );
    map['sec4.om_elv'] = { value: elvHit ? 'Y' : 'N', source: 'docs_omm', note: 'O&M ELV submission on this date' };
  }

  // 4d. Warranty (own table: warranty_items)
  const { data: wr, error: e3 } = await supabase
    .from('warranty_items')
    .select('final_actual_date, hdec_signing_actual_date, subcon_signing_actual_date')
    .eq('is_active', true)
    .in('subcontractor_name', PT);
  if (e3) errs.push(`warranty_items: ${e3.message}`);
  else {
    const hit = (wr ?? []).some((r) =>
      r.final_actual_date === D || r.hdec_signing_actual_date === D || r.subcon_signing_actual_date === D
    );
    map['sec4.warranty'] = { value: hit ? 'Y' : 'N', source: 'warranty_items', note: 'Warranty signing activity on this date' };
  }
}

// ---------- 5. RTO outstanding (sec6) ----------

async function fetchRto(_D: string, map: AutoMap, errs: string[]) {
  const { data, error } = await supabase
    .from('punch_items')
    .select('main_trade, sub_trade, outstanding_work, completion_status')
    .eq('is_active', true)
    .in('subcontractor_name', PT)
    .neq('completion_status', 'Closed');
  if (error) { errs.push(`punch_items: ${error.message}`); return; }
  const rows = data ?? [];
  for (const [fieldKey, f] of Object.entries(RTO_TRADE_MAP)) {
    const matched = rows.filter((r) => {
      if (String(r.main_trade ?? '') !== f.mainTrade) return false;
      if (!f.keyword) return true;
      const kw = f.keyword.toLowerCase();
      const desc = String(r.outstanding_work ?? '').toLowerCase();
      const sub = String(r.sub_trade ?? '').toLowerCase();
      return desc.includes(kw) || sub.includes(kw);
    });
    map[fieldKey] = { value: matched.length, source: 'punch_items', note: `Outstanding ${f.mainTrade}${f.keyword ? ` / ${f.keyword}` : ''}` };
  }
}

// ---------- Main hook ----------

export async function buildAutoFill(entryDate: string): Promise<AutoFillResult> {
  const map: AutoMap = {};
  const errors: string[] = [];
  await Promise.all([
    fetchPlannedTests(entryDate, map, errors),
    fetchDefects(entryDate, map, errors),
    fetchTcReject(entryDate, map, errors),
    fetchSubstantial(entryDate, map, errors),
    fetchRto(entryDate, map, errors),
  ]);
  return { map, fetchedAt: new Date().toISOString(), errors };
}

export function useDdnAutoFill(entryDate: string) {
  return useQuery({
    queryKey: ['ddn-auto-fill', entryDate],
    enabled: Boolean(entryDate),
    staleTime: 30_000,
    queryFn: () => buildAutoFill(entryDate),
  });
}
