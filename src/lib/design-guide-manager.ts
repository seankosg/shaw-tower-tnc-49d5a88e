// Design Guide Manager — orchestrates YAML upload, Claude analysis, token application, and rollback.

import { supabase } from '@/integrations/supabase/client';
import { invalidatePptColorCache, invalidatePptFontCache, fetchPptColorTokens } from '@/lib/design-tokens';

const BUCKET = 'design-guides';

export interface DesignGuideVersion {
  id: string;
  storage_path: string;
  public_url: string | null;
  version_label: string | null;
  summary_ko: string | null;
  tokens_snapshot: TokenSnapshot;
  is_active: boolean;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface TokenSnapshot {
  colors: Record<string, string>;
  fonts: { body?: string; mono?: string };
}

export interface AnalysisResult {
  summaryKo: string;
  colorTokens: Record<string, string>;
  fontTokens?: { body?: string; mono?: string };
  structuralChanges: string[];
  codeSuggestion?: string;
}

export async function getActiveVersion(): Promise<DesignGuideVersion | null> {
  const { data, error } = await supabase
    .from('design_guide_versions')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    console.error('[design-guide] getActiveVersion error:', error);
    return null;
  }
  return data as unknown as DesignGuideVersion | null;
}

export async function listVersions(): Promise<DesignGuideVersion[]> {
  const { data, error } = await supabase
    .from('design_guide_versions')
    .select('*')
    .order('uploaded_at', { ascending: false });
  if (error) {
    console.error('[design-guide] listVersions error:', error);
    return [];
  }
  return (data ?? []) as unknown as DesignGuideVersion[];
}

export async function downloadYaml(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error(`Failed to download YAML: ${error?.message}`);
  return await data.text();
}

export async function uploadNewYaml(file: File): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${timestamp}-${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: 'text/yaml',
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return path;
}

export async function analyzeYaml(oldYaml: string, newYaml: string): Promise<AnalysisResult> {
  const { data, error } = await supabase.functions.invoke('design-guide-analyze', {
    body: { oldYaml, newYaml },
  });
  if (error) {
    throw new Error(`Analysis failed: ${error.message}`);
  }
  if (data?.error) {
    throw new Error(`Analysis failed: ${data.error}${data.raw ? `\n\nRaw: ${data.raw.slice(0, 500)}` : ''}`);
  }
  return data as AnalysisResult;
}

export async function snapshotCurrentTokens(): Promise<TokenSnapshot> {
  const { data, error } = await supabase
    .from('design_tokens')
    .select('key, value, category')
    .in('category', ['ppt-color', 'ppt-font']);
  if (error) throw new Error(`Snapshot failed: ${error.message}`);

  const snap: TokenSnapshot = { colors: {}, fonts: {} };
  for (const row of data ?? []) {
    if (row.category === 'ppt-color') {
      snap.colors[row.key] = row.value;
    } else if (row.category === 'ppt-font') {
      if (row.key === 'ppt.font.body') snap.fonts.body = row.value;
      if (row.key === 'ppt.font.mono') snap.fonts.mono = row.value;
    }
  }
  return snap;
}

export async function applyTokenChanges(
  colorTokens: Record<string, string>,
  fontTokens?: { body?: string; mono?: string },
): Promise<void> {
  const rows: Array<{ key: string; value: string; category: string; description?: string | null }> = [];

  for (const [key, value] of Object.entries(colorTokens)) {
    const normKey = key.startsWith('ppt.color.') ? key : `ppt.color.${key}`;
    rows.push({ key: normKey, value, category: 'ppt-color' });
  }
  if (fontTokens?.body) {
    rows.push({ key: 'ppt.font.body', value: fontTokens.body, category: 'ppt-font' });
  }
  if (fontTokens?.mono) {
    rows.push({ key: 'ppt.font.mono', value: fontTokens.mono, category: 'ppt-font' });
  }

  if (rows.length === 0) return;

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;

  const payload = rows.map((r) => ({ ...r, updated_by: uid ?? null }));

  const { error } = await supabase
    .from('design_tokens')
    .upsert(payload, { onConflict: 'key' });
  if (error) throw new Error(`Token apply failed: ${error.message}`);

  invalidatePptColorCache();
  invalidatePptFontCache();
}

export async function saveVersion(meta: {
  storage_path: string;
  version_label?: string;
  summary_ko?: string;
}): Promise<DesignGuideVersion> {
  const tokens_snapshot = await snapshotCurrentTokens();
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;

  const { data, error } = await supabase
    .from('design_guide_versions')
    .insert({
      storage_path: meta.storage_path,
      version_label: meta.version_label ?? null,
      summary_ko: meta.summary_ko ?? null,
      tokens_snapshot: tokens_snapshot as never,
      uploaded_by: uid ?? null,
      is_active: false,
    })
    .select()
    .single();
  if (error) throw new Error(`saveVersion failed: ${error.message}`);
  return data as unknown as DesignGuideVersion;
}

export async function setActiveVersion(id: string): Promise<void> {
  // Unique partial index requires deactivating others first
  const { error: deactErr } = await supabase
    .from('design_guide_versions')
    .update({ is_active: false })
    .eq('is_active', true);
  if (deactErr) throw new Error(`Deactivate failed: ${deactErr.message}`);

  const { error: actErr } = await supabase
    .from('design_guide_versions')
    .update({ is_active: true })
    .eq('id', id);
  if (actErr) throw new Error(`Activate failed: ${actErr.message}`);
}

export async function rollbackToVersion(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('design_guide_versions')
    .select('tokens_snapshot')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error(`Rollback fetch failed: ${error?.message}`);

  const snap = data.tokens_snapshot as unknown as TokenSnapshot;
  await applyTokenChanges(snap.colors ?? {}, snap.fonts ?? {});
  await setActiveVersion(id);
}

export { fetchPptColorTokens };
