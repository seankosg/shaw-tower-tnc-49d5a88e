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

/** Function-targeted TS edit (preferred for large files). */
export async function invokeCodeEditorFunction(input: {
  functionSource: string;
  functionName: string;
  instruction: string;
  fileType?: 'ts';
}): Promise<CodeEditorResult> {
  const { data, error } = await supabase.functions.invoke('code-editor', {
    body: { ...input, fileType: input.fileType ?? 'ts' },
  });
  if (error) throw new Error(error.message || 'code-editor invoke failed');
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as CodeEditorResult;
}

/** Whole-file edit (used for yaml or small files). */
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

// ─────────────────────────────────────────
// Top-level function parser (regex + brace counter, comment/string aware).
// Supports:
//   [export] [async] function NAME(...) { ... }
//   [export] const NAME = [async] (...) => { ... }
//   [export] const NAME = [async] function (...) { ... }
// Only matches declarations that start at column 0 (top-level).
// ─────────────────────────────────────────

export interface FunctionRange {
  name: string;
  kind: 'function' | 'arrow' | 'const-function';
  start: number; // char index in source (inclusive)
  end: number;   // char index in source (exclusive)
  startLine: number; // 1-indexed
  endLine: number;   // 1-indexed
  source: string;    // substring source.slice(start, end)
}

/** Find the matching closing brace for an opening brace at index openIdx.
 *  Skips braces inside line comments, block comments, and string/template literals.
 *  Returns the index AFTER the closing brace, or -1 if not found. */
function findMatchingBraceEnd(src: string, openIdx: number): number {
  let depth = 0;
  let i = openIdx;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    // Line comment
    if (c === '/' && next === '/') {
      const nl = src.indexOf('\n', i + 2);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    // Block comment
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    // String literals
    if (c === '"' || c === "'") {
      i++;
      while (i < n) {
        const cc = src[i];
        if (cc === '\\') { i += 2; continue; }
        if (cc === c) { i++; break; }
        if (cc === '\n') break; // unterminated; bail
        i++;
      }
      continue;
    }
    // Template literal
    if (c === '`') {
      i++;
      while (i < n) {
        const cc = src[i];
        if (cc === '\\') { i += 2; continue; }
        if (cc === '`') { i++; break; }
        if (cc === '$' && src[i + 1] === '{') {
          // Skip nested ${ ... } by recursive brace counting (treat as code).
          i += 2;
          let nestedDepth = 1;
          while (i < n && nestedDepth > 0) {
            const x = src[i];
            if (x === '{') nestedDepth++;
            else if (x === '}') nestedDepth--;
            if (nestedDepth > 0) i++;
          }
          if (i < n) i++; // consume closing }
          continue;
        }
        i++;
      }
      continue;
    }
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') {
      depth--;
      i++;
      if (depth === 0) return i;
      continue;
    }
    i++;
  }
  return -1;
}

function lineOf(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

export function parseTopLevelFunctions(source: string): FunctionRange[] {
  const ranges: FunctionRange[] = [];
  // Match at start of line only (top-level, no indentation).
  // We scan line-by-line for declaration starts, then brace-count for end.
  const re = /^(export\s+)?(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[(<]|^(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*(?:async\s+)?(?:function\s*\*?\s*[(<]|\([^)]*\)\s*(?::\s*[^={]+)?=>\s*\{|[A-Za-z_$][\w$]*\s*=>\s*\{)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const declStart = m.index;
    const name = m[3] || m[5];
    if (!name) continue;
    const isFunctionKw = !!m[3];
    // Find the first opening brace AFTER the declaration line that belongs to the body.
    // For arrow functions our regex ends exactly at `{`; for function/const-function we
    // need to find the first { after the parameter list.
    // Simple approach: start scanning from declStart, skip until first `{` that is at
    // brace-depth 0 considering parentheses/angle brackets in the signature.
    let i = declStart;
    let braceIdx = -1;
    let parenDepth = 0;
    let angleDepth = 0;
    let typeBraceDepth = 0;
    let lastMeaningful = ''; // last non-whitespace, non-comment char seen
    const n = source.length;
    while (i < n) {
      const c = source[i];
      const next = source[i + 1];
      if (c === '/' && next === '/') { const nl = source.indexOf('\n', i + 2); i = nl === -1 ? n : nl + 1; continue; }
      if (c === '/' && next === '*') { const end = source.indexOf('*/', i + 2); i = end === -1 ? n : end + 2; continue; }
      if (c === '"' || c === "'") {
        i++;
        while (i < n) {
          const cc = source[i];
          if (cc === '\\') { i += 2; continue; }
          if (cc === c || cc === '\n') { i++; break; }
          i++;
        }
        lastMeaningful = c;
        continue;
      }
      if (c === '`') {
        i++;
        while (i < n && source[i] !== '`') {
          if (source[i] === '\\') { i += 2; continue; }
          i++;
        }
        if (i < n) i++;
        lastMeaningful = '`';
        continue;
      }
      if (c === '{') {
        // A `{` is a TYPE brace (not the function body) if it's inside parens/angles,
        // or already inside a type-brace, or its preceding meaningful char is one of
        // the type-position tokens: `:`, `|`, `&`, `,`, `<`, `(`.
        const isTypePos = parenDepth > 0 || angleDepth > 0 || typeBraceDepth > 0
          || lastMeaningful === ':' || lastMeaningful === '|' || lastMeaningful === '&'
          || lastMeaningful === ',' || lastMeaningful === '<' || lastMeaningful === '(';
        if (isTypePos) { typeBraceDepth++; lastMeaningful = '{'; i++; continue; }
        braceIdx = i; break;
      }
      if (c === '}') {
        if (typeBraceDepth > 0) typeBraceDepth--;
        lastMeaningful = '}'; i++; continue;
      }
      if (c === '(') { parenDepth++; lastMeaningful = '('; i++; continue; }
      if (c === ')') { parenDepth--; lastMeaningful = ')'; i++; continue; }
      if (c === '<') { angleDepth++; lastMeaningful = '<'; i++; continue; }
      if (c === '>') { angleDepth = Math.max(0, angleDepth - 1); lastMeaningful = '>'; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      lastMeaningful = c;
      i++;
    }
    if (braceIdx === -1) continue;
    const end = findMatchingBraceEnd(source, braceIdx);
    if (end === -1) continue;
    const isArrow = !isFunctionKw && /=>\s*\{$/.test(source.slice(declStart, braceIdx + 1));
    ranges.push({
      name,
      kind: isFunctionKw ? 'function' : (isArrow ? 'arrow' : 'const-function'),
      start: declStart,
      end,
      startLine: lineOf(source, declStart),
      endLine: lineOf(source, end - 1),
      source: source.slice(declStart, end),
    });
    re.lastIndex = end; // continue scanning after this function
  }
  return ranges;
}

export function spliceFunction(
  fullSource: string,
  range: FunctionRange,
  newFunctionSource: string,
): string {
  return fullSource.slice(0, range.start) + newFunctionSource + fullSource.slice(range.end);
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
