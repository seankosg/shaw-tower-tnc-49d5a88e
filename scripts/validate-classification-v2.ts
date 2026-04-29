/**
 * Read-only audit: run the V2 classifier against every active defect_items row
 * and report cases where the V2 result differs from the value currently stored
 * in the DB. Does NOT modify any data.
 *
 * Usage:
 *   bun run scripts/validate-classification-v2.ts
 *
 * Output:
 *   /mnt/documents/v2-classification-audit.csv  (full diff report)
 *   stdout: summary counts
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { classifyDefectV2, type ClassificationContextV2 } from '../src/lib/defect-classifier';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://cvlabumgabmpjtoryita.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchAllActiveDefects() {
  const all: any[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('defect_items')
      .select('id, issue_no, description, trade_detail, subcontractor_name, subsub_name, main_trade, sub_trade, work_type, classification_source')
      .eq('is_active', true)
      .order('issue_no')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function loadCtx(): Promise<ClassificationContextV2> {
  const [ws, wt, al, ru, fb] = await Promise.all([
    supabase.from('defect_subcontractor_workscope').select('*').eq('is_active', true),
    supabase.from('defect_work_types').select('*').eq('is_active', true),
    supabase.from('defect_classification_alias').select('*').eq('is_active', true),
    supabase.from('defect_classification_rules').select('*').eq('is_active', true),
    supabase.from('defect_discipline_fallback').select('*').eq('is_active', true),
  ]);
  return {
    workscopes: (ws.data ?? []) as any,
    workTypes: (wt.data ?? []) as any,
    aliases: (al.data ?? []) as any,
    legacyRules: (ru.data ?? []) as any,
    legacyFallbacks: (fb.data ?? []) as any,
  };
}

function csvEscape(v: any): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  console.log('Loading classification context...');
  const ctx = await loadCtx();
  console.log(`  workscopes: ${ctx.workscopes.length}, workTypes: ${ctx.workTypes.length}, aliases: ${ctx.aliases.length}, legacyRules: ${ctx.legacyRules.length}, fallbacks: ${ctx.legacyFallbacks.length}`);

  console.log('Fetching active defects...');
  const defects = await fetchAllActiveDefects();
  console.log(`  total: ${defects.length}`);

  let same = 0;
  let diffMain = 0, diffSub = 0, diffWt = 0;
  let v2HasMore = 0; // V2 fills a value the DB has empty
  let v2Empties = 0; // V2 returns empty where DB has a value
  let bothEmpty = 0;

  const rows: string[] = [];
  rows.push(['issue_no','db_main','v2_main','db_sub','v2_sub','db_wt','v2_wt','v2_source','description'].join(','));

  for (const d of defects) {
    const rawLabel = (d.subsub_name && String(d.subsub_name).trim()) || (d.subcontractor_name && String(d.subcontractor_name).trim()) || '';
    const r = classifyDefectV2(
      { description: d.description ?? '', field_discipline: d.trade_detail ?? '', raw_label: rawLabel },
      ctx,
    );
    const dbMain = String(d.main_trade ?? '').trim();
    const dbSub = String(d.sub_trade ?? '').trim();
    const dbWt = String(d.work_type ?? '').trim();
    const v2Main = r.main_trade.trim();
    const v2Sub = r.sub_trade.trim();
    const v2Wt = r.work_type.trim();

    const mDiff = dbMain.toLowerCase() !== v2Main.toLowerCase();
    const sDiff = dbSub.toLowerCase() !== v2Sub.toLowerCase();
    const wDiff = dbWt.toLowerCase() !== v2Wt.toLowerCase();
    if (!mDiff && !sDiff && !wDiff) { same++; continue; }
    if (mDiff) diffMain++;
    if (sDiff) diffSub++;
    if (wDiff) diffWt++;

    const dbAllEmpty = !dbMain && !dbSub && !dbWt;
    const v2AllEmpty = !v2Main && !v2Sub && !v2Wt;
    if (dbAllEmpty && v2AllEmpty) bothEmpty++;
    else if (dbAllEmpty && !v2AllEmpty) v2HasMore++;
    else if (!dbAllEmpty && v2AllEmpty) v2Empties++;

    rows.push([
      csvEscape(d.issue_no),
      csvEscape(dbMain), csvEscape(v2Main),
      csvEscape(dbSub), csvEscape(v2Sub),
      csvEscape(dbWt), csvEscape(v2Wt),
      csvEscape(r.source),
      csvEscape((d.description ?? '').slice(0, 200)),
    ].join(','));
  }

  const outPath = '/mnt/documents/v2-classification-audit.csv';
  writeFileSync(outPath, rows.join('\n'));

  console.log('\n=== V2 Classification Audit Summary ===');
  console.log(`Total defects:                 ${defects.length}`);
  console.log(`Identical to DB:               ${same}  (${((same / defects.length) * 100).toFixed(1)}%)`);
  console.log(`Different (any field):         ${defects.length - same}`);
  console.log(`  main_trade differs:          ${diffMain}`);
  console.log(`  sub_trade differs:           ${diffSub}`);
  console.log(`  work_type differs:           ${diffWt}`);
  console.log(`V2 fills where DB empty:       ${v2HasMore}`);
  console.log(`V2 empty where DB has value:   ${v2Empties}`);
  console.log(`Both empty (still uncl.):      ${bothEmpty}`);
  console.log(`\nReport: ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
