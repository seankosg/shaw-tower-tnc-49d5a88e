import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1) Get active version
const { data: ver, error: e1 } = await sb
  .from('code_file_versions')
  .select('*')
  .eq('file_name', 'ppt-builder.ts')
  .eq('is_active', true)
  .maybeSingle();
if (e1) throw e1;
console.log('active:', ver.storage_path, 'uploaded_at:', ver.uploaded_at);

// 2) Download
const { data: blob, error: e2 } = await sb.storage.from('code-files').download(ver.storage_path);
if (e2) throw e2;
const storageText = await blob.text();
const srcText = readFileSync('src/lib/ppt-builder.ts', 'utf8');

const h = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
console.log('storage lines:', storageText.split('\n').length, 'hash:', h(storageText));
console.log('src     lines:', srcText.split('\n').length,     'hash:', h(srcText));
console.log('identical:', storageText === srcText);
