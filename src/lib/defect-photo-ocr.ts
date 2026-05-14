// Photo OCR helpers — pure logic + Supabase glue.
// Pure functions (decideUpdate, mergeAconexComment) are exported for unit tests.
import { supabase } from '@/integrations/supabase/client';

export type DecisionKind =
  | 'update'           // will write
  | 'skip_completed'   // already has actual_completion_date
  | 'not_found'        // issue_no not in DB
  | 'needs_review';    // OCR low confidence

export interface ExistingDefectMin {
  id: string;
  issue_no: string;
  team: string | null;
  actual_start_date: string | null;
  actual_completion_date: string | null;
  aconex_comments: string | null;
  row_version: number;
  project_id: string;
}

export interface UpdatePayload {
  actual_start_date: string;
  actual_completion_date: string;
  aconex_comments: string;
}

export const VERIFIED_BY_HDEC = 'Verified by HDEC';

/**
 * Append `Verified by HDEC` to existing aconex_comments without losing prior content.
 * - empty / null  -> "Verified by HDEC"
 * - existing      -> "<existing>\n[YYYY-MM-DD] Verified by HDEC"
 * - already contains today's verified line -> unchanged
 */
export function mergeAconexComment(existing: string | null | undefined, dataDate: string): string {
  const ex = (existing ?? '').trim();
  const stamp = `[${dataDate}] ${VERIFIED_BY_HDEC}`;
  if (!ex) return VERIFIED_BY_HDEC;
  if (ex === VERIFIED_BY_HDEC) return ex; // exact match — don't double-append
  if (ex.includes(stamp)) return ex;
  return `${ex}\n${stamp}`;
}

/**
 * Decide what to do for one OCR'd issue against the DB.
 */
export function decideUpdate(
  existing: ExistingDefectMin | null,
  dataDate: string,
  confidence: number,
  confidenceThreshold = 0.7,
): { kind: DecisionKind; payload?: UpdatePayload; reason?: string } {
  if (!existing) {
    return { kind: 'not_found', reason: 'Issue No not found in current project' };
  }
  if (existing.actual_completion_date) {
    return { kind: 'skip_completed', reason: `Already completed on ${existing.actual_completion_date}` };
  }
  if (confidence < confidenceThreshold) {
    return { kind: 'needs_review', reason: `Low OCR confidence (${(confidence * 100).toFixed(0)}%)` };
  }
  return {
    kind: 'update',
    payload: {
      actual_start_date: dataDate, // Photo OCR always sets start = data date
      actual_completion_date: dataDate,
      aconex_comments: mergeAconexComment(existing.aconex_comments, dataDate),
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                          Supabase-backed helpers                           */
/* -------------------------------------------------------------------------- */

export interface OcrGroup {
  issue_no: string;
  caption_raw: string;
  sender: string | null;
  timestamp_text: string | null;
  confidence: number;
  /** Vertical center (0..1) of the numeric caption text. May be null on older responses. */
  caption_y_normalized: number | null;
  notes?: string | null;
}

export interface OcrEdgeResponse {
  groups: OcrGroup[];
  rejected_blocks: { reason: string; y_range?: [number, number] }[];
  model: string;
}

export interface GroupBand {
  yTop: number;
  yBottom: number;
}

/**
 * Photos sit ABOVE their numeric caption in WhatsApp screenshots. So each band's
 * bottom edge is just above the caption text, and the top edge extends upward
 * until it hits the previous caption (or a max photo-height).
 *
 * - yBottom[i] = captionY[i] - gap                                 (just above the number)
 * - yTop[i]    = max(prevCaptionY + gap, yBottom - maxPhotoHeight) (just below the previous number, or up to maxPhotoHeight)
 * - For the first group, yTop = max(0, yBottom - maxPhotoHeight).
 * - Enforces a minimum band height so coincident captions still produce a usable crop.
 */
export function computeGroupBands(captionYs: Array<number | null | undefined>): GroupBand[] {
  const gap = 0.012;          // skip the caption text itself (text height ~0.02)
  const maxPhotoHeight = 0.4; // a single photo block rarely exceeds 40% of a tall screenshot
  const minHeight = 0.05;

  const indexed = captionYs.map((y, i) => ({
    i,
    y: typeof y === 'number' && isFinite(y) ? Math.max(0, Math.min(1, y)) : null,
  }));
  const valid = indexed.filter((p) => p.y !== null) as { i: number; y: number }[];
  valid.sort((a, b) => a.y - b.y);

  const bandsByIndex: GroupBand[] = new Array(captionYs.length).fill(null).map(() => ({ yTop: 0, yBottom: 1 }));

  for (let k = 0; k < valid.length; k += 1) {
    const cur = valid[k];
    const prevY = k > 0 ? valid[k - 1].y : null;
    const yBottom = Math.max(0, Math.min(1, cur.y - gap));
    const lowerBoundFromPrev = prevY === null ? 0 : prevY + gap;
    let yTop = Math.max(lowerBoundFromPrev, yBottom - maxPhotoHeight, 0);
    if (yBottom - yTop < minHeight) {
      yTop = Math.max(0, yBottom - minHeight);
    }
    bandsByIndex[cur.i] = { yTop, yBottom };
  }
  return bandsByIndex;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

/** Downscale to max 1600px on longest side & re-encode to JPEG (quality 0.85) to keep payload small. */
export async function compressForOcr(file: File, maxDim = 1600): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('Image decode failed (HEIC is not supported in browsers; convert to JPG/PNG).'));
    img.src = dataUrl;
  });
  // Tall WhatsApp screenshots: keep ratio, scale longest side to maxDim.
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Crop a sub-rect of the original image (normalized coords) and return dataURL — for review thumbnails. */
export async function cropFromDataUrl(
  dataUrl: string,
  bbox: { x: number; y: number; w: number; h: number },
): Promise<string> {
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('decode failed'));
    img.src = dataUrl;
  });
  const x = Math.max(0, Math.floor(bbox.x * img.naturalWidth));
  const y = Math.max(0, Math.floor(bbox.y * img.naturalHeight));
  const w = Math.max(1, Math.floor(bbox.w * img.naturalWidth));
  const h = Math.max(1, Math.floor(bbox.h * img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.8);
}

export async function callPhotoOcr(imageDataUrl: string): Promise<OcrEdgeResponse> {
  const { data, error } = await supabase.functions.invoke('defect-photo-ocr', {
    body: { image_data_url: imageDataUrl },
  });
  if (error) throw error;
  return data as OcrEdgeResponse;
}

export async function fetchActiveProjectId(): Promise<string | null> {
  const { data } = await (supabase as any)
    .from('projects')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1);
  return data?.[0]?.id ?? null;
}

export async function fetchExistingDefects(
  projectId: string,
  issueNos: string[],
): Promise<Map<string, ExistingDefectMin>> {
  const map = new Map<string, ExistingDefectMin>();
  if (issueNos.length === 0) return map;
  const unique = Array.from(new Set(issueNos));
  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await (supabase as any)
      .from('defect_items')
      .select('id, issue_no, team, actual_start_date, actual_completion_date, aconex_comments, row_version, project_id')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .in('issue_no', chunk);
    if (error) throw error;
    for (const row of data ?? []) map.set(String(row.issue_no), row as ExistingDefectMin);
  }
  return map;
}

export interface ApplyResult {
  defectId: string;
  issueNo: string;
  status: 'updated' | 'skipped' | 'failed';
  detail?: string;
}

export async function applyOnePhotoOcrUpdate(args: {
  existing: ExistingDefectMin;
  payload: UpdatePayload;
  uploadId: string | null;
  userId: string;
  dataDate: string;
}): Promise<ApplyResult> {
  const { existing, payload, uploadId, userId, dataDate } = args;
  // Guard: re-check at write-time in case another import completed it concurrently.
  const { data: fresh, error: fetchErr } = await (supabase as any)
    .from('defect_items')
    .select('id, actual_completion_date, actual_start_date, aconex_comments, row_version')
    .eq('id', existing.id)
    .single();
  if (fetchErr) return { defectId: existing.id, issueNo: existing.issue_no, status: 'failed', detail: fetchErr.message };
  if (fresh?.actual_completion_date) {
    return { defectId: existing.id, issueNo: existing.issue_no, status: 'skipped', detail: 'Already completed' };
  }

  const finalPayload = {
    actual_start_date: fresh.actual_start_date ?? dataDate,
    actual_completion_date: dataDate,
    aconex_comments: mergeAconexComment(fresh.aconex_comments, dataDate),
    updated_by: userId,
    row_version: (fresh.row_version ?? 1) + 1,
  };

  const { error: updErr } = await (supabase as any)
    .from('defect_items')
    .update(finalPayload)
    .eq('id', existing.id);
  if (updErr) {
    return { defectId: existing.id, issueNo: existing.issue_no, status: 'failed', detail: updErr.message };
  }

  // Per-field change log (only for fields that actually changed).
  const logRows: any[] = [];
  const fields: { f: keyof typeof finalPayload; oldVal: any }[] = [
    { f: 'actual_start_date', oldVal: fresh.actual_start_date },
    { f: 'actual_completion_date', oldVal: fresh.actual_completion_date },
    { f: 'aconex_comments', oldVal: fresh.aconex_comments },
  ];
  for (const { f, oldVal } of fields) {
    const newVal = (finalPayload as any)[f];
    const a = oldVal == null ? '' : String(oldVal);
    const b = newVal == null ? '' : String(newVal);
    if (a === b) continue;
    logRows.push({
      defect_id: existing.id,
      changed_field: f,
      old_value: a || null,
      new_value: b || null,
      changed_by: userId,
      change_source: 'photo_ocr',
      upload_id: uploadId,
    });
  }
  if (logRows.length > 0) {
    await (supabase as any).from('defect_change_log').insert(logRows);
  }

  return { defectId: existing.id, issueNo: existing.issue_no, status: 'updated' };
}

export async function createPhotoOcrBatch(args: {
  userId: string;
  dataDate: string;
  totalGroups: number;
}): Promise<string | null> {
  const { userId, dataDate, totalGroups } = args;
  const fileName = `photo_ocr_${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const { data, error } = await (supabase as any)
    .from('defect_upload_batches')
    .insert({
      uploaded_file_name: fileName,
      uploaded_by: userId,
      status: 'processing',
      total_rows: totalGroups,
      data_date: dataDate,
      note: 'Photo OCR — WhatsApp screenshot import',
    })
    .select('id')
    .single();
  if (error) {
    console.warn('createPhotoOcrBatch failed:', error);
    return null;
  }
  return data?.id ?? null;
}

export async function finalizePhotoOcrBatch(
  uploadId: string | null,
  stats: { success: number; skipped: number; rejected: number; processed: number; total: number },
) {
  if (!uploadId) return;
  await (supabase as any)
    .from('defect_upload_batches')
    .update({
      status: 'completed',
      success_rows: stats.success,
      skipped_rows: stats.skipped,
      rejected_rows: stats.rejected,
      processed_rows: stats.processed,
      total_rows: stats.total,
    })
    .eq('id', uploadId);
}
