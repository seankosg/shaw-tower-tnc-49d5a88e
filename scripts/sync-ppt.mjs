// One-off: upload local src/lib/ppt-builder.ts as the new active version
// in the "code-files" storage bucket, deactivating prior active rows.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const FILE = 'ppt-builder.ts';

const src = readFileSync('src/lib/ppt-builder.ts', 'utf8');
const ts = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}`;
const path = `history/ppt-builder_${stamp}_sync.ts`;

const { error: upErr } = await sb.storage.from('code-files').upload(path, new Blob([src], { type: 'text/plain' }), {
  contentType: 'text/plain', upsert: false,
});
if (upErr) throw upErr;

const { error: deErr } = await sb.from('code_file_versions').update({ is_active: false }).eq('file_name', FILE).eq('is_active', true);
if (deErr) throw deErr;

const { data: ins, error: insErr } = await sb.from('code_file_versions').insert({
  file_name: FILE,
  storage_path: path,
  change_summary_ko: '로컬 src/lib/ppt-builder.ts와 동기화 (이전 활성본이 truncated 상태였음)',
  instruction: 'sync from local src',
  is_active: true,
  uploaded_by: null,
}).select().single();
if (insErr) throw insErr;

console.log('synced:', ins.id, path, src.split('\n').length, 'lines');
