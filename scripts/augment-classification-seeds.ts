/**
 * Seed augmentation: extract frequent (main_trade, sub_trade, work_type) groups
 * from existing defect_items and propose new defect_work_types entries.
 *
 * Strategy:
 *  - Group active defects by (main_trade, sub_trade, work_type) where all 3 set
 *  - Keep groups with >= MIN_COUNT defects
 *  - For each group:
 *      * Extract top-N keywords from descriptions (length >= 4, alpha tokens,
 *        excluding stopwords)
 *      * If a defect_work_types row with the same `name` already exists -> skip
 *        (do not overwrite)
 *      * Otherwise emit an INSERT with default_main_trade/default_sub_trade
 *        and the extracted keywords as desc_keywords
 *  - Output: SQL file at /mnt/documents/v2-seed-augmentation.sql
 *  - Also prints a preview table to stdout (does NOT touch the DB)
 *
 * Usage: bun run scripts/augment-classification-seeds.ts
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://cvlabumgabmpjtoryita.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MIN_COUNT = 10;          // only groups with >= 10 defects
const TOP_KEYWORDS = 8;        // up to 8 keywords per group
const MIN_KW_DOC_FREQ = 3;     // keyword must appear in >=3 descriptions of the group

const STOPWORDS = new Set([
  'the','and','for','with','from','that','this','have','has','will','was','were',
  'are','not','any','all','also','but','can','could','should','would','one','two',
  'into','onto','out','off','over','under','near','some','more','most','other','same',
  'their','them','they','these','those','than','then','when','where','which','what',
  'while','until','about','after','before','above','below','between','through','around',
  'each','very','just','only','being','been','make','made','good','need','please',
  'check','site','area','panel','part','side','use','top','end','new','old',
]);

function tokenize(s: string): string[] {
  return (s ?? '').toLowerCase().match(/[a-z]{4,}/g) ?? [];
}

function topKeywordsForGroup(descriptions: string[]): string[] {
  const docFreq = new Map<string, number>();
  for (const d of descriptions) {
    const seen = new Set<string>();
    for (const tok of tokenize(d)) {
      if (STOPWORDS.has(tok)) continue;
      if (seen.has(tok)) continue;
      seen.add(tok);
      docFreq.set(tok, (docFreq.get(tok) ?? 0) + 1);
    }
  }
  return [...docFreq.entries()]
    .filter(([, c]) => c >= MIN_KW_DOC_FREQ)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_KEYWORDS)
    .map(([k]) => k);
}

function sqlEscape(s: string): string {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function arrLiteral(arr: string[]): string {
  if (!arr.length) return `ARRAY[]::text[]`;
  return `ARRAY[${arr.map(sqlEscape).join(',')}]::text[]`;
}

async function fetchAll() {
  const all: any[] = [];
  let from = 0; const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('defect_items')
      .select('description, main_trade, sub_trade, work_type')
      .eq('is_active', true)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function main() {
  console.log('Fetching defects...');
  const defects = await fetchAll();
  console.log(`  fetched: ${defects.length}`);

  console.log('Fetching existing work_types (to avoid duplicates)...');
  const { data: existingWt } = await supabase.from('defect_work_types').select('name');
  const existingNames = new Set((existingWt ?? []).map((r: any) => String(r.name).toLowerCase().trim()));
  console.log(`  existing work_types: ${existingNames.size}`);

  // Group by (main, sub, wt)
  const groups = new Map<string, { main: string; sub: string; wt: string; descs: string[] }>();
  for (const d of defects) {
    const main = String(d.main_trade ?? '').trim();
    const sub = String(d.sub_trade ?? '').trim();
    const wt = String(d.work_type ?? '').trim();
    if (!main || !sub || !wt) continue;
    const key = `${main}|${sub}|${wt}`;
    if (!groups.has(key)) groups.set(key, { main, sub, wt, descs: [] });
    groups.get(key)!.descs.push(String(d.description ?? ''));
  }

  // Filter & build proposals
  type Proposal = {
    name: string; trade: string; default_main: string; default_sub: string;
    desc_keywords: string[]; cnt: number; status: 'new' | 'exists';
  };
  const proposals: Proposal[] = [];
  for (const g of groups.values()) {
    if (g.descs.length < MIN_COUNT) continue;
    const kws = topKeywordsForGroup(g.descs);
    proposals.push({
      name: g.wt,
      trade: g.main,
      default_main: g.main,
      default_sub: g.sub,
      desc_keywords: kws,
      cnt: g.descs.length,
      status: existingNames.has(g.wt.toLowerCase()) ? 'exists' : 'new',
    });
  }
  proposals.sort((a, b) => b.cnt - a.cnt);

  // Build SQL
  const lines: string[] = [];
  lines.push('-- Auto-generated seed augmentation for defect_work_types');
  lines.push(`-- Generated from active defect_items (>= ${MIN_COUNT} per group)`);
  lines.push(`-- Total groups: ${proposals.length}, new: ${proposals.filter(p => p.status === 'new').length}, existing: ${proposals.filter(p => p.status === 'exists').length}`);
  lines.push('-- Review before executing. Existing work_types are SKIPPED to preserve current behavior.');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  let order = 200; // start match_order after current seeds (which use 100)
  for (const p of proposals) {
    if (p.status === 'exists') {
      lines.push(`-- SKIP (already exists): ${p.name}  [${p.cnt} defects]`);
      continue;
    }
    lines.push(`-- ${p.cnt} defects | ${p.default_main} > ${p.default_sub}`);
    lines.push(
      `INSERT INTO defect_work_types (trade, name, sub_match, desc_keywords, default_main_trade, default_sub_trade, match_order, is_active) VALUES (` +
      `${sqlEscape(p.trade)}, ${sqlEscape(p.name)}, ${arrLiteral([])}, ${arrLiteral(p.desc_keywords)}, ` +
      `${sqlEscape(p.default_main)}, ${sqlEscape(p.default_sub)}, ${order}, true);`
    );
    order++;
    lines.push('');
  }
  lines.push('COMMIT;');

  const outPath = '/mnt/documents/v2-seed-augmentation.sql';
  writeFileSync(outPath, lines.join('\n'));

  // Preview
  console.log('\n=== Top groups (>= ' + MIN_COUNT + ' defects) ===');
  console.log('STATUS  COUNT  MAIN > SUB > WORK_TYPE  [keywords]');
  for (const p of proposals.slice(0, 30)) {
    console.log(
      `${p.status.padEnd(7)} ${String(p.cnt).padStart(4)}  ${p.default_main} > ${p.default_sub} > ${p.name}  [${p.desc_keywords.join(', ')}]`
    );
  }
  console.log('\n=== Summary ===');
  console.log(`Total groups (>=${MIN_COUNT}): ${proposals.length}`);
  console.log(`New (will INSERT):  ${proposals.filter(p => p.status === 'new').length}`);
  console.log(`Existing (SKIP):    ${proposals.filter(p => p.status === 'exists').length}`);
  console.log(`\nSQL: ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
