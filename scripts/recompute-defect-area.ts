/**
 * One-off script: recompute area_type/area_level/area_location for every
 * active defect_items row using the new token-based parseArea() logic.
 *
 * Strategy:
 *  - Load all active rows (id, area_raw, current area_type/level/location).
 *  - Re-run parseArea(area_raw). We do NOT have access to the original
 *    explicit "Level"/"Location" Excel columns here, so reconcileAreaFields
 *    is intentionally NOT applied — we trust area_raw as the single source
 *    of truth for this backfill (which is exactly what was wrong before).
 *  - Compare and update only changed rows.
 *
 * Run with:  bun run scripts/recompute-defect-area.ts
 */
import { createClient } from '@supabase/supabase-js';
import { parseArea } from '../src/lib/defect-parser';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Row {
  id: string;
  area_raw: string | null;
  area_type: string | null;
  area_level: string | null;
  area_location: string | null;
}

async function fetchAll(): Promise<Row[]> {
  const all: Row[] = [];
  const pageSize = 1000;
  let from = 0;
  // Order by id for stable pagination.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from('defect_items')
      .select('id, area_raw, area_type, area_level, area_location')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Row[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

const eq = (a: string | null, b: string | null) => (a ?? '') === (b ?? '');

async function main() {
  console.log('Loading active defect_items …');
  const rows = await fetchAll();
  console.log(`Loaded ${rows.length} rows.`);

  const updates: Array<{ id: string; area_type: string | null; area_level: string | null; area_location: string | null }> = [];
  let unchanged = 0;
  let nullRaw = 0;

  for (const row of rows) {
    if (!row.area_raw) { nullRaw += 1; continue; }
    const parsed = parseArea(row.area_raw);
    if (
      eq(parsed.area_type, row.area_type) &&
      eq(parsed.area_level, row.area_level) &&
      eq(parsed.area_location, row.area_location)
    ) {
      unchanged += 1;
      continue;
    }
    updates.push({ id: row.id, ...parsed });
  }

  console.log(`To update: ${updates.length}  |  unchanged: ${unchanged}  |  null area_raw: ${nullRaw}`);

  // Sample preview
  console.log('\nSample changes (first 10):');
  for (const u of updates.slice(0, 10)) {
    const before = rows.find((r) => r.id === u.id)!;
    console.log(`  raw="${before.area_raw}"`);
    console.log(`    BEFORE  type="${before.area_type}"  level="${before.area_level}"  loc="${before.area_location}"`);
    console.log(`    AFTER   type="${u.area_type}"  level="${u.area_level}"  loc="${u.area_location}"`);
  }

  if (process.env.APPLY !== '1') {
    console.log('\nDRY RUN. Set APPLY=1 to write changes.');
    return;
  }

  console.log('\nApplying updates …');
  let done = 0;
  // Update one row at a time to keep payload small and avoid PostgREST batching surprises.
  for (const u of updates) {
    const { error } = await supabase
      .from('defect_items')
      .update({
        area_type: u.area_type,
        area_level: u.area_level,
        area_location: u.area_location,
      })
      .eq('id', u.id);
    if (error) {
      console.error(`Failed for ${u.id}:`, error.message);
      continue;
    }
    done += 1;
    if (done % 200 === 0) console.log(`  updated ${done}/${updates.length}`);
  }
  console.log(`\nDone. Updated ${done} rows.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
