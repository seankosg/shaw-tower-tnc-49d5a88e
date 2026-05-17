// Code Editor — orchestrates Claude-driven natural-language edits of code files
// stored in the "code-files" private Supabase Storage bucket.

import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'code-files';

export interface CodeFileVersion {
  id: string;
  file_name: string;
  storage_path: string;
  change_summary_ko: string | null;
  instruction: string | null;
  is_active: boolean;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface CodeEditorResult {
  modifiedContent: string;
  changeSummary: string;
}

export async function invokeCodeEditor(input: {
  fileContent: string;
  instruction: string;
  fileType: 'ts' | 'yaml';
}): Promise<CodeEditorResult> {
  const { data, error } = await supabase.functions.invoke('code-editor', { body: input });
  if (error) throw new Error(error.message || 'code-editor invoke failed');
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as CodeEditorResult;
}

export async function downloadActiveCodeFile(fileName: string): Promise<{ content: string; version: CodeFileVersion } | null> {
  const { data: ver, error } = await supabase
    .from('code_file_versions')
    .select('*')
    .eq('file_name', fileName)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!ver) return null;
  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(ver.storage_path);
  if (dlErr || !blob) throw new Error(dlErr?.message ?? 'Download failed');
  return { content: await blob.text(), version: ver as CodeFileVersion };
}

export async function downloadCodeVersion(storagePath: string): Promise<string> {
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !blob) throw new Error(error?.message ?? 'Download failed');
  return await blob.text();
}

export async function listCodeVersions(fileName: string): Promise<CodeFileVersion[]> {
  const { data, error } = await supabase
    .from('code_file_versions')
    .select('*')
    .eq('file_name', fileName)
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CodeFileVersion[];
}

function timestampSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

/**
 * Save a new version of the code file.
 * - Uploads content to history/<fileName>_<timestamp>.<ext>
 * - Deactivates previous active rows for the same file_name
 * - Inserts a new active row pointing at the history path
 */
export async function saveCodeVersion(params: {
  fileName: string;
  content: string;
  changeSummaryKo?: string;
  instruction?: string;
}): Promise<CodeFileVersion> {
  const { fileName, content, changeSummaryKo, instruction } = params;
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  const historyPath = `history/${base}_${timestampSuffix()}${ext}`;

  const blob = new Blob([content], { type: 'text/plain' });

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(historyPath, blob, {
    contentType: 'text/plain',
    upsert: false,
  });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  // Deactivate previous active row(s) for this file
  const { error: deactErr } = await supabase
    .from('code_file_versions')
    .update({ is_active: false })
    .eq('file_name', fileName)
    .eq('is_active', true);
  if (deactErr) throw new Error(`Deactivate failed: ${deactErr.message}`);

  const { data: userData } = await supabase.auth.getUser();
  const { data: inserted, error: insErr } = await supabase
    .from('code_file_versions')
    .insert({
      file_name: fileName,
      storage_path: historyPath,
      change_summary_ko: changeSummaryKo ?? null,
      instruction: instruction ?? null,
      is_active: true,
      uploaded_by: userData.user?.id ?? null,
    })
    .select()
    .single();
  if (insErr) throw new Error(`Insert version failed: ${insErr.message}`);
  return inserted as CodeFileVersion;
}

export async function restoreCodeVersion(versionId: string): Promise<CodeFileVersion> {
  const { data: ver, error } = await supabase
    .from('code_file_versions')
    .select('*')
    .eq('id', versionId)
    .single();
  if (error || !ver) throw new Error(error?.message ?? 'Version not found');
  const v = ver as CodeFileVersion;

  const content = await downloadCodeVersion(v.storage_path);
  return await saveCodeVersion({
    fileName: v.file_name,
    content,
    changeSummaryKo: `이전 버전 (${new Date(v.uploaded_at).toLocaleString()}) 복원`,
    instruction: `Restore from version ${v.id}`,
  });
}
