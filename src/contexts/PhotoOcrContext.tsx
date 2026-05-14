import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  callPhotoOcr,
  callPhotoOcrCrop,
  captionLocOf,
  compressForOcr,
  cropFromDataUrl,
  computeGroupBands,
  decideUpdate,
  fetchActiveProjectId,
  fetchExistingDefects,
  applyOnePhotoOcrUpdate,
  createPhotoOcrBatch,
  finalizePhotoOcrBatch,
  shouldAdoptPass2,
  type DecisionKind,
  type ExistingDefectMin,
  type OcrGroup,
} from '@/lib/defect-photo-ocr';

export type Phase = 'upload' | 'parsing' | 'review' | 'applying' | 'done';

export interface PhotoFile {
  id: string;
  file: File;
  thumbDataUrl: string;
  fullDataUrl: string;
  status: 'pending' | 'parsing' | 'parsed' | 'failed';
  error?: string;
  groups?: OcrGroup[];
}

export interface ReviewItem {
  rowKey: string;
  fileId: string;
  fileName: string;
  group: OcrGroup;
  cropDataUrl: string | null;
  decision: DecisionKind;
  decisionReason: string;
  existing: ExistingDefectMin | null;
  editedIssueNo: string;
  excluded: boolean;
}

export interface PhotoOcrSummary {
  updated: number;
  skipped: number;
  notFound: number;
  failed: number;
  rejectedBlocks: number;
}

interface PhotoOcrContextValue {
  dataDate: string;
  setDataDate: (v: string) => void;
  phase: Phase;
  files: PhotoFile[];
  reviewItems: ReviewItem[];
  parseProgress: { done: number; total: number };
  applyProgress: { done: number; total: number };
  summary: PhotoOcrSummary | null;
  previewItem: ReviewItem | null;
  setPreviewItem: (it: ReviewItem | null) => void;
  applicableItems: ReviewItem[];
  addFiles: (incoming: File[]) => Promise<void>;
  removeFile: (id: string) => void;
  clearAll: () => void;
  runParse: () => Promise<void>;
  runApply: () => Promise<void>;
  reMatchOne: (rowKey: string, newIssueNo: string) => Promise<void>;
  updateItem: (rowKey: string, patch: Partial<ReviewItem>) => void;
  isBusy: boolean;
}

const PhotoOcrContext = createContext<PhotoOcrContextValue | null>(null);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function uid() {
  return Math.random().toString(36).slice(2, 11);
}

export function PhotoOcrProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [dataDate, setDataDate] = useState<string>(todayIso());
  const [phase, setPhase] = useState<Phase>('upload');
  const [files, setFiles] = useState<PhotoFile[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [parseProgress, setParseProgress] = useState({ done: 0, total: 0 });
  const [applyProgress, setApplyProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<PhotoOcrSummary | null>(null);
  const [previewItem, setPreviewItem] = useState<ReviewItem | null>(null);

  const isBusy = phase === 'parsing' || phase === 'applying';

  // Prevent accidental tab close while OCR/Apply runs.
  useEffect(() => {
    if (!isBusy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isBusy]);

  const addFiles = useCallback(async (incoming: File[]) => {
    const accepted = incoming.filter((f) => /^image\/(jpeg|jpg|png|webp)$/i.test(f.type));
    const heicCount = incoming.length - accepted.length;
    if (heicCount > 0) toast.error(`${heicCount} unsupported file(s) skipped (HEIC etc.). Convert to JPG/PNG first.`);
    if (accepted.length === 0) return;
    if (files.length + accepted.length > 30) {
      toast.error('Max 30 screenshots per batch');
      return;
    }
    const created: PhotoFile[] = [];
    for (const f of accepted) {
      try {
        const fullDataUrl = await compressForOcr(f, 1600);
        const thumbDataUrl = await compressForOcr(f, 240);
        created.push({ id: uid(), file: f, fullDataUrl, thumbDataUrl, status: 'pending' });
      } catch (e) {
        toast.error(`Could not read ${f.name}: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }
    setFiles((prev) => [...prev, ...created]);
  }, [files.length]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setFiles([]);
    setReviewItems([]);
    setSummary(null);
    setPhase('upload');
    setParseProgress({ done: 0, total: 0 });
    setApplyProgress({ done: 0, total: 0 });
  }, []);

  const updateItem = useCallback((rowKey: string, patch: Partial<ReviewItem>) => {
    setReviewItems((prev) => prev.map((it) => it.rowKey === rowKey ? { ...it, ...patch } : it));
  }, []);

  const reMatchOne = useCallback(async (rowKey: string, newIssueNo: string) => {
    const projectId = await fetchActiveProjectId();
    if (!projectId) return;
    const map = await fetchExistingDefects(projectId, [newIssueNo]);
    const ex = map.get(newIssueNo) ?? null;
    const d = decideUpdate(ex, dataDate, 1);
    updateItem(rowKey, {
      editedIssueNo: newIssueNo,
      existing: ex,
      decision: d.kind,
      decisionReason: d.reason ?? '',
    });
  }, [dataDate, updateItem]);

  const runParse = useCallback(async () => {
    if (files.length === 0) return;
    setPhase('parsing');
    setParseProgress({ done: 0, total: files.length });
    let totalRejectedBlocks = 0;

    const results: PhotoFile[] = [];
    for (const f of files) {
      setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: 'parsing' } : x));
      try {
        const resp = await callPhotoOcr(f.fullDataUrl);
        totalRejectedBlocks += resp.rejected_blocks?.length ?? 0;
        results.push({ ...f, status: 'parsed', groups: resp.groups });
        setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: 'parsed', groups: resp.groups } : x));
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        const isRate = /rate|429/i.test(msg);
        const isPay = /payment|402/i.test(msg);
        toast.error(isRate ? 'Rate limit hit — wait a moment and re-try.' : isPay ? 'Lovable AI credits exhausted.' : `OCR failed: ${msg}`);
        results.push({ ...f, status: 'failed', error: msg });
        setFiles((prev) => prev.map((x) => x.id === f.id ? { ...x, status: 'failed', error: msg } : x));
      }
      setParseProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    const flat: ReviewItem[] = [];
    for (const f of results) {
      for (const g of f.groups ?? []) {
        flat.push({
          rowKey: `${f.id}_${flat.length}`,
          fileId: f.id,
          fileName: f.file.name,
          group: g,
          cropDataUrl: null,
          decision: 'needs_review',
          decisionReason: 'pending match',
          existing: null,
          editedIssueNo: g.issue_no,
          excluded: false,
        });
      }
    }

    if (flat.length === 0) {
      toast.warning('No issue numbers detected in the uploaded screenshots.');
      setPhase('review');
      setReviewItems([]);
      setSummary({ updated: 0, skipped: 0, notFound: 0, failed: 0, rejectedBlocks: totalRejectedBlocks });
      return;
    }

    try {
      const projectId = await fetchActiveProjectId();
      if (!projectId) {
        toast.error('No active project found.');
        setPhase('upload');
        return;
      }
      const issueNos = flat.map((x) => x.editedIssueNo).filter((s) => s.length > 0);
      const existingMap = await fetchExistingDefects(projectId, issueNos);
      const matched = flat.map((item) => {
        const ex = existingMap.get(item.editedIssueNo) ?? null;
        const d = decideUpdate(ex, dataDate, item.group.confidence);
        return { ...item, existing: ex, decision: d.kind, decisionReason: d.reason ?? '' } satisfies ReviewItem;
      });
      const byFile = new Map<string, ReviewItem[]>();
      for (const it of matched) {
        const arr = byFile.get(it.fileId) ?? [];
        arr.push(it);
        byFile.set(it.fileId, arr);
      }
      for (const [fileId, items] of byFile.entries()) {
        const file = results.find((f) => f.id === fileId);
        if (!file) continue;
        const bands = computeGroupBands(items.map((it) => captionLocOf(it.group)));
        for (let i = 0; i < items.length; i += 1) {
          const band = bands[i];
          let cropUrl: string | null = null;
          try {
            cropUrl = await cropFromDataUrl(file.fullDataUrl, {
              x: 0, y: band.yTop, w: 1, h: Math.max(0.01, band.yBottom - band.yTop),
            });
            items[i].cropDataUrl = cropUrl;
          } catch { /* ignore crop errors */ }

          // Pass 2 — re-OCR each crop to verify the issue_no.
          if (cropUrl) {
            try {
              const verify = await callPhotoOcrCrop(cropUrl);
              const pass1 = items[i].group.issue_no;
              const pass1Conf = items[i].group.confidence;
              const adopt = shouldAdoptPass2(
                { issue_no: pass1, confidence: pass1Conf },
                {
                  issue_no: verify.issue_no,
                  caption_raw: verify.caption_raw,
                  caption_visible: verify.caption_visible,
                  confidence: verify.confidence,
                },
              );
              if (adopt) {
                const newGroup: OcrGroup = {
                  ...items[i].group,
                  issue_no: verify.issue_no,
                  caption_raw: verify.caption_raw || items[i].group.caption_raw,
                  confidence: Math.max(pass1Conf, verify.confidence),
                  notes: pass1 !== verify.issue_no
                    ? `pass1=${pass1 || '-'} → pass2=${verify.issue_no}`
                    : items[i].group.notes ?? null,
                };
                items[i].group = newGroup;
                items[i].editedIssueNo = verify.issue_no;
                // Refresh existing/decision against the corrected number.
                const map = await fetchExistingDefects(projectId, [verify.issue_no]);
                const ex = map.get(verify.issue_no) ?? null;
                const d = decideUpdate(ex, dataDate, newGroup.confidence);
                items[i].existing = ex;
                items[i].decision = d.kind;
                items[i].decisionReason = d.reason ?? '';
              } else if (verify.issue_no && verify.issue_no !== pass1) {
                // Record the disagreement for traceability without overwriting Pass-1.
                items[i].group = {
                  ...items[i].group,
                  notes: `pass2 disagreed (${verify.issue_no}, conf ${(verify.confidence * 100).toFixed(0)}%, caption_visible=${verify.caption_visible ?? 'n/a'}) — kept pass1=${pass1 || '-'}`,
                };
              }
            } catch (e) {
              // Non-fatal: keep Pass-1 result.
              console.warn('Pass2 crop OCR failed', e);
            }
          }
        }
      }
      setReviewItems(matched);
      setSummary({ updated: 0, skipped: 0, notFound: 0, failed: 0, rejectedBlocks: totalRejectedBlocks });
      setPhase('review');
    } catch (e: any) {
      toast.error(`Lookup failed: ${e?.message ?? String(e)}`);
      setPhase('upload');
    }
  }, [files, dataDate]);

  const applicableItems = useMemo(
    () => reviewItems.filter((it) => !it.excluded && it.decision === 'update' && it.existing),
    [reviewItems],
  );

  const runApply = useCallback(async () => {
    if (!user) {
      toast.error('Not signed in');
      return;
    }
    if (applicableItems.length === 0) {
      toast.info('Nothing to apply.');
      return;
    }
    setPhase('applying');
    setApplyProgress({ done: 0, total: applicableItems.length });

    const uploadId = await createPhotoOcrBatch({ userId: user.id, dataDate, totalGroups: applicableItems.length });

    let updated = 0, skipped = 0, failed = 0;
    for (const it of applicableItems) {
      try {
        const res = await applyOnePhotoOcrUpdate({
          existing: it.existing!,
          payload: {
            actual_start_date: it.existing!.actual_start_date ?? dataDate,
            actual_completion_date: dataDate,
            aconex_comments: it.existing!.aconex_comments ?? '',
          },
          uploadId,
          userId: user.id,
          dataDate,
        });
        if (res.status === 'updated') updated += 1;
        else if (res.status === 'skipped') skipped += 1;
        else { failed += 1; toast.error(`Issue ${it.editedIssueNo}: ${res.detail ?? 'failed'}`); }
      } catch (e: any) {
        failed += 1;
        toast.error(`Issue ${it.editedIssueNo}: ${e?.message ?? String(e)}`);
      }
      setApplyProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    try { await supabase.functions.invoke('recompute-defect-status', { body: {} }); } catch { /* non-fatal */ }

    const notFoundCount = reviewItems.filter((it) => it.decision === 'not_found').length;
    const skipPreCount = reviewItems.filter((it) => it.decision === 'skip_completed').length;

    await finalizePhotoOcrBatch(uploadId, {
      success: updated,
      skipped: skipped + skipPreCount,
      rejected: failed + notFoundCount,
      processed: updated + skipped + failed,
      total: reviewItems.length,
    });

    setSummary((s) => ({
      updated,
      skipped: skipped + skipPreCount,
      notFound: notFoundCount,
      failed,
      rejectedBlocks: s?.rejectedBlocks ?? 0,
    }));
    setPhase('done');
    toast.success(`Photo OCR import complete — ${updated} updated`);
  }, [user, applicableItems, dataDate, reviewItems]);

  const value: PhotoOcrContextValue = {
    dataDate, setDataDate,
    phase, files, reviewItems,
    parseProgress, applyProgress,
    summary, previewItem, setPreviewItem,
    applicableItems,
    addFiles, removeFile, clearAll,
    runParse, runApply, reMatchOne, updateItem,
    isBusy,
  };

  return <PhotoOcrContext.Provider value={value}>{children}</PhotoOcrContext.Provider>;
}

export function usePhotoOcr(): PhotoOcrContextValue {
  const ctx = useContext(PhotoOcrContext);
  if (!ctx) throw new Error('usePhotoOcr must be used within PhotoOcrProvider');
  return ctx;
}
