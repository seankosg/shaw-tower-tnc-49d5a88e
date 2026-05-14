import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Camera, Upload, Loader2, CheckCircle2, AlertCircle, X, Eye, Sparkles, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  callPhotoOcr,
  compressForOcr,
  cropFromDataUrl,
  decideUpdate,
  fetchActiveProjectId,
  fetchExistingDefects,
  applyOnePhotoOcrUpdate,
  createPhotoOcrBatch,
  finalizePhotoOcrBatch,
  type DecisionKind,
  type ExistingDefectMin,
  type OcrGroup,
} from '@/lib/defect-photo-ocr';
import { supabase } from '@/integrations/supabase/client';

type Phase = 'upload' | 'parsing' | 'review' | 'applying' | 'done';

interface PhotoFile {
  id: string;
  file: File;
  thumbDataUrl: string;       // small thumbnail (for the file row)
  fullDataUrl: string;        // compressed full image (for OCR + crops)
  status: 'pending' | 'parsing' | 'parsed' | 'failed';
  error?: string;
  groups?: OcrGroup[];        // raw model output
}

interface ReviewItem {
  rowKey: string;             // unique
  fileId: string;
  fileName: string;
  group: OcrGroup;
  cropDataUrl: string | null; // bbox crop, lazy-built
  // After matching:
  decision: DecisionKind;
  decisionReason: string;
  existing: ExistingDefectMin | null;
  // User edits:
  editedIssueNo: string;
  excluded: boolean;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return Math.random().toString(36).slice(2, 11);
}

const decisionStyles: Record<DecisionKind, { label: string; cls: string }> = {
  update: { label: 'Will update', cls: 'bg-primary/10 text-primary' },
  skip_completed: { label: 'Skip — already completed', cls: 'bg-muted text-muted-foreground' },
  not_found: { label: 'Not found', cls: 'bg-destructive/10 text-destructive' },
  needs_review: { label: 'Needs review', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100' },
};

export default function PhotoOcrPanel({ disabled }: { disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const [dataDate, setDataDate] = useState<string>(todayIso());
  const [phase, setPhase] = useState<Phase>('upload');
  const [files, setFiles] = useState<PhotoFile[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [parseProgress, setParseProgress] = useState({ done: 0, total: 0 });
  const [applyProgress, setApplyProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<{ updated: number; skipped: number; notFound: number; failed: number; rejectedBlocks: number } | null>(null);

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

  const onSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) await addFiles(Array.from(e.target.files));
    if (inputRef.current) inputRef.current.value = '';
  }, [addFiles]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer?.files) await addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const clearAll = () => {
    setFiles([]);
    setReviewItems([]);
    setSummary(null);
    setPhase('upload');
  };

  /* ----------------------------- PARSE PHASE ----------------------------- */

  const runParse = async () => {
    if (files.length === 0) return;
    setPhase('parsing');
    setParseProgress({ done: 0, total: files.length });
    let totalRejectedBlocks = 0;

    // Sequential to limit Lovable AI rate (model is heavy).
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

    // Build flat review list.
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

    // Match against DB.
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
      // Lazy-build crops (best-effort).
      for (const it of matched) {
        const file = results.find((f) => f.id === it.fileId);
        if (file && it.group.bbox_normalized) {
          try { it.cropDataUrl = await cropFromDataUrl(file.fullDataUrl, it.group.bbox_normalized); } catch { /* ignore */ }
        }
      }
      setReviewItems(matched);
      setSummary({
        updated: 0, skipped: 0, notFound: 0, failed: 0,
        rejectedBlocks: totalRejectedBlocks,
      });
      setPhase('review');
    } catch (e: any) {
      toast.error(`Lookup failed: ${e?.message ?? String(e)}`);
      setPhase('upload');
    }
  };

  /* ------------------------- INLINE REVIEW EDITS ------------------------- */

  const updateItem = (rowKey: string, patch: Partial<ReviewItem>) => {
    setReviewItems((prev) => prev.map((it) => it.rowKey === rowKey ? { ...it, ...patch } : it));
  };

  const reMatchOne = async (rowKey: string, newIssueNo: string) => {
    const projectId = await fetchActiveProjectId();
    if (!projectId) return;
    const map = await fetchExistingDefects(projectId, [newIssueNo]);
    const ex = map.get(newIssueNo) ?? null;
    // After manual edit treat confidence as 1 — user vouched for the value.
    const d = decideUpdate(ex, dataDate, 1);
    updateItem(rowKey, {
      editedIssueNo: newIssueNo,
      existing: ex,
      decision: d.kind,
      decisionReason: d.reason ?? '',
    });
  };

  /* ------------------------------ APPLY PHASE ----------------------------- */

  const applicableItems = useMemo(
    () => reviewItems.filter((it) => !it.excluded && it.decision === 'update' && it.existing),
    [reviewItems],
  );

  const runApply = async () => {
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
            aconex_comments: it.existing!.aconex_comments ?? '', // overwritten inside helper using fresh value
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

    // Recompute downstream statuses (best-effort).
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
  };

  /* -------------------------------- RENDER ------------------------------- */

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4" />
            Photo OCR — WhatsApp Screenshots
          </CardTitle>
          <CardDescription>
            Upload chat screenshots from field staff. Issue numbers below each photo group are extracted automatically.
            Aconex Comments will be set to <span className="font-medium text-foreground">"Verified by HDEC"</span>.
            Photos are processed in memory only and are <span className="font-medium">not stored</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-muted-foreground">Data Date (applied to all):</label>
            <Input
              type="date"
              value={dataDate}
              onChange={(e) => setDataDate(e.target.value)}
              disabled={phase === 'parsing' || phase === 'applying'}
              className="h-8 w-[160px] text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Drop zone */}
      {(phase === 'upload' || phase === 'parsing') && (
        <Card>
          <CardContent className="pt-6">
            <div
              className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50 ${disabled ? 'pointer-events-none opacity-50' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">Drop WhatsApp screenshots here or click to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">JPG / PNG / WEBP — up to 30 files. HEIC not supported.</p>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onSelect} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Files list */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Selected Screenshots ({files.length})</CardTitle>
                <CardDescription>
                  {phase === 'parsing' && `Parsing ${parseProgress.done}/${parseProgress.total}…`}
                  {phase === 'upload' && 'Ready to extract'}
                  {phase !== 'parsing' && phase !== 'upload' && `${files.length} screenshots processed`}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearAll} disabled={phase === 'parsing' || phase === 'applying'}>Clear All</Button>
                {phase === 'upload' && (
                  <Button size="sm" onClick={runParse} disabled={disabled || files.length === 0}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Run OCR ({files.length})
                  </Button>
                )}
              </div>
            </div>
            {phase === 'parsing' && (
              <Progress value={(parseProgress.done / Math.max(1, parseProgress.total)) * 100} className="mt-2 h-1" />
            )}
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((f) => (
              <div key={f.id} className="flex items-start gap-3 rounded-md border p-2">
                <img src={f.thumbDataUrl} alt={f.file.name} className="h-20 w-20 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{f.file.name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {f.status === 'pending' && <Badge variant="outline" className="text-[10px]">Queued</Badge>}
                    {f.status === 'parsing' && <Badge variant="outline" className="text-[10px]"><Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" /> OCR</Badge>}
                    {f.status === 'parsed' && (
                      <Badge variant="outline" className="bg-primary/10 text-primary text-[10px]">
                        <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                        {f.groups?.length ?? 0} groups
                      </Badge>
                    )}
                    {f.status === 'failed' && <Badge variant="outline" className="bg-destructive/10 text-destructive text-[10px]"><AlertCircle className="mr-1 h-2.5 w-2.5" /> failed</Badge>}
                  </div>
                  {f.error && <div className="mt-1 truncate text-[10px] text-destructive">{f.error}</div>}
                </div>
                {phase === 'upload' && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeFile(f.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Review */}
      {(phase === 'review' || phase === 'applying' || phase === 'done') && reviewItems.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Review &amp; Apply</CardTitle>
                <CardDescription>
                  {applicableItems.length} ready · {reviewItems.filter((i) => i.decision === 'skip_completed').length} already done · {reviewItems.filter((i) => i.decision === 'not_found').length} not found · {reviewItems.filter((i) => i.decision === 'needs_review').length} needs review
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {phase === 'review' && (
                  <Button size="sm" onClick={runApply} disabled={disabled || applicableItems.length === 0}>
                    <ChevronRight className="mr-1.5 h-3.5 w-3.5" />
                    Apply Updates ({applicableItems.length})
                  </Button>
                )}
                {phase === 'applying' && (
                  <Button size="sm" disabled>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Applying {applyProgress.done}/{applyProgress.total}
                  </Button>
                )}
              </div>
            </div>
            {phase === 'applying' && (
              <Progress value={(applyProgress.done / Math.max(1, applyProgress.total)) * 100} className="mt-2 h-1" />
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {reviewItems.map((it) => {
              const style = decisionStyles[it.decision];
              return (
                <div key={it.rowKey} className={`flex items-start gap-3 rounded-md border p-2 ${it.excluded ? 'opacity-50' : ''}`}>
                  {it.cropDataUrl ? (
                    <img src={it.cropDataUrl} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                      <Eye className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">Issue No:</span>
                      <Input
                        value={it.editedIssueNo}
                        onChange={(e) => updateItem(it.rowKey, { editedIssueNo: e.target.value.replace(/\D+/g, '') })}
                        onBlur={(e) => {
                          const v = e.target.value.replace(/\D+/g, '');
                          if (v && v !== it.group.issue_no) reMatchOne(it.rowKey, v);
                        }}
                        disabled={phase !== 'review'}
                        className="h-7 w-[110px] font-mono text-xs"
                      />
                      <Badge variant="outline" className={`text-[10px] ${style.cls}`}>{style.label}</Badge>
                      <Badge variant="outline" className="text-[10px]">conf {(it.group.confidence * 100).toFixed(0)}%</Badge>
                      {it.existing?.team && <Badge variant="outline" className="text-[10px]">team {it.existing.team}</Badge>}
                    </div>
                    <div className="mt-1 truncate text-[10px] text-muted-foreground">
                      from {it.fileName}
                      {it.group.timestamp_text ? ` · ${it.group.timestamp_text}` : ''}
                      {it.decisionReason ? ` · ${it.decisionReason}` : ''}
                    </div>
                  </div>
                  {phase === 'review' && (
                    <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => updateItem(it.rowKey, { excluded: !it.excluded })}>
                      {it.excluded ? 'Re-include' : 'Skip'}
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {phase === 'done' && summary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Photo OCR Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-5">
            <SummaryBox label="Updated" value={summary.updated} />
            <SummaryBox label="Skipped (already done)" value={summary.skipped} />
            <SummaryBox label="Not found" value={summary.notFound} />
            <SummaryBox label="Failed" value={summary.failed} />
            <SummaryBox label="Other-sender blocks ignored" value={summary.rejectedBlocks} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted p-3 text-center">
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
