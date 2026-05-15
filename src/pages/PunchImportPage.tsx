import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, Lock, Settings2, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleStatus } from '@/contexts/ModuleStatusContext';
import {
  parsePunchWorkbook, upsertPunchRows,
  type PunchParseResult, type PunchUpsertResult,
} from '@/lib/punch-excel-utils';
import { PunchColumnSelect } from '@/components/import/PunchColumnSelect';

interface QueueItem {
  id: string;
  file: File;
  status: 'pending' | 'parsing' | 'ready' | 'processing' | 'done' | 'failed';
  parsed?: PunchParseResult;
  selectedSheet?: string;
  excludedHeaders: string[];
  result?: PunchUpsertResult;
  error?: string;
}

export default function PunchImportPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const { profile, isAdmin } = useAuth();
  const { punch } = useModuleStatus();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [columnDialogId, setColumnDialogId] = useState<string | null>(null);

  const moduleLocked = !punch.enabled && !isAdmin;

  const addFiles = useCallback(async (files: File[]) => {
    const newItems: QueueItem[] = files.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f, status: 'parsing', excludedHeaders: [],
    }));
    setQueue((q) => [...q, ...newItems]);
    for (const item of newItems) {
      try {
        const parsed = await parsePunchWorkbook(item.file);
        setQueue((q) => q.map((it) => it.id === item.id
          ? { ...it, status: 'ready', parsed, selectedSheet: parsed.sheetName }
          : it));
      } catch (e: any) {
        setQueue((q) => q.map((it) => it.id === item.id
          ? { ...it, status: 'failed', error: e?.message ?? 'Parse failed' }
          : it));
      }
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    if (inputRef.current) inputRef.current.value = '';
  }, [addFiles]);

  const removeFile = (id: string) => setQueue((q) => q.filter((it) => it.id !== id));
  const clearAll = () => setQueue([]);

  const reparseSheet = async (id: string, sheet: string) => {
    const item = queue.find((it) => it.id === id);
    if (!item) return;
    setQueue((q) => q.map((it) => it.id === id ? { ...it, status: 'parsing', selectedSheet: sheet } : it));
    try {
      const parsed = await parsePunchWorkbook(item.file, sheet, { excludedHeaders: item.excludedHeaders });
      setQueue((q) => q.map((it) => it.id === id ? { ...it, status: 'ready', parsed, selectedSheet: sheet } : it));
    } catch (e: any) {
      setQueue((q) => q.map((it) => it.id === id ? { ...it, status: 'failed', error: e?.message } : it));
    }
  };

  const applyExcluded = async (id: string, excluded: string[]) => {
    const item = queue.find((it) => it.id === id);
    if (!item) return;
    setQueue((q) => q.map((it) => it.id === id
      ? { ...it, status: 'parsing', excludedHeaders: excluded }
      : it));
    try {
      const parsed = await parsePunchWorkbook(item.file, item.selectedSheet, { excludedHeaders: excluded });
      setQueue((q) => q.map((it) => it.id === id
        ? { ...it, status: 'ready', parsed, excludedHeaders: excluded }
        : it));
    } catch (e: any) {
      setQueue((q) => q.map((it) => it.id === id
        ? { ...it, status: 'failed', error: e?.message }
        : it));
    }
  };

  const runImport = async () => {
    if (moduleLocked) return;
    setRunning(true);

    const { data: projectsData, error: projErr } = await supabase
      .from('projects').select('id').eq('is_active', true).order('created_at', { ascending: true });
    if (projErr || !projectsData?.length) {
      toast({ title: 'No active project', description: projErr?.message ?? 'Activate a project first.', variant: 'destructive' });
      setRunning(false);
      return;
    }
    const projectId = projectsData[0].id;

    for (const item of queue.filter((it) => it.status === 'ready' && it.parsed)) {
      setQueue((q) => q.map((it) => it.id === item.id ? { ...it, status: 'processing' } : it));

      const { data: batch } = await supabase
        .from('punch_upload_batches')
        .insert({
          project_id: projectId,
          uploaded_file_name: item.file.name,
          uploaded_by: profile?.user_id ?? null,
          status: 'processing',
          total_rows: item.parsed!.rows.length,
        })
        .select('id').maybeSingle();

      const result = await upsertPunchRows(item.parsed!.rows, {
        projectId,
        uploadId: batch?.id ?? null,
        updatedBy: profile?.user_id ?? null,
      });

      // Log parser-level rejections (rows missing required fields)
      if (batch && item.parsed!.errors.length > 0) {
        const rejectionLogs = item.parsed!.errors.map((err) => ({
          upload_id: batch.id,
          raw_row_no: err.rawRowNo ?? null,
          item_no: null,
          action_taken: 'rejected' as const,
          reason_code: 'missing_required_field',
          reason_detail: err.reason,
        }));
        await (supabase as any).from('punch_upload_row_logs').insert(rejectionLogs);
      }

      if (batch) {
        await supabase.from('punch_upload_batches').update({
          status: result.failed > 0 ? 'failed' : 'completed',
          processed_rows: item.parsed!.rows.length,
          success_rows: result.inserted + result.updated,
          rejected_rows: result.failed + item.parsed!.errors.length,
          skipped_rows: result.skipped,
        }).eq('id', batch.id);
      }

      setQueue((q) => q.map((it) => it.id === item.id ? { ...it, status: 'done', result } : it));
    }
    setRunning(false);
    toast({ title: 'Import complete', description: 'See per-file results below.' });
  };

  const readyCount = queue.filter((it) => it.status === 'ready').length;
  const totals = queue.reduce((acc, it) => {
    if (it.result) {
      acc.inserted += it.result.inserted;
      acc.updated += it.result.updated;
      acc.failed += it.result.failed;
    }
    return acc;
  }, { inserted: 0, updated: 0, failed: 0 });

  const dialogItem = columnDialogId ? queue.find((it) => it.id === columnDialogId) : null;
  const fieldByHeader: Record<string, string | null> = dialogItem?.parsed
    ? Object.fromEntries(dialogItem.parsed.headerMap.map((h) => [h.header, h.field?.field ?? null]))
    : {};

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Punch Import</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload Excel files. Existing rows match on Item No within the active project.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/punch/import/logs')}>
            <History className="mr-1.5 h-3.5 w-3.5" />Import Logs
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/punch/raw-data')}>View Raw Data</Button>
        </div>
      </div>

      {!punch.enabled && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {isAdmin
              ? <p className="font-medium">Punch 모듈은 일시 중단 상태이지만 관리자 권한으로 업로드 가능합니다.</p>
              : <p className="font-medium">Punch 모듈이 일시 중단되어 업로드가 잠겼습니다.</p>}
            {punch.reason && <p className="mt-0.5 text-xs opacity-90">사유: {punch.reason}</p>}
          </div>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div
            className="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">Drop Excel files or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">.xlsx, .xls supported (multi-file)</p>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={onSelect} />
          </div>
        </CardContent>
      </Card>

      {queue.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Files ({queue.length})</CardTitle>
                <CardDescription>{readyCount > 0 ? `${readyCount} ready to import` : 'No files ready'}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearAll} disabled={running}>Clear All</Button>
                <Button size="sm" onClick={runImport} disabled={running || readyCount === 0 || moduleLocked}>
                  {running
                    ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Importing…</>
                    : <><Upload className="mr-1.5 h-3.5 w-3.5" />Execute Import ({readyCount})</>}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {queue.map((it) => {
              const matched = it.parsed?.headerMap.filter((h) => h.field).length ?? 0;
              const total = it.parsed?.headerMap.length ?? 0;
              const unmatched = it.parsed?.headerMap.filter((h) => !h.field).map((h) => h.header) ?? [];
              const excludedCount = it.excludedHeaders.length;
              return (
                <div key={it.id} className="rounded-md border p-3">
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="truncate text-sm font-medium">{it.file.name}</span>
                        <Badge variant="outline" className="text-xs">{it.status}</Badge>
                        {it.parsed && <span className="text-xs text-muted-foreground">{it.parsed.rows.length} rows · {matched}/{total} cols mapped{excludedCount > 0 ? ` · ${excludedCount} excluded` : ''}</span>}
                      </div>
                      {it.error && <div className="text-xs text-destructive mt-1">{it.error}</div>}
                      {it.parsed && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {it.parsed.sheetNames.length > 1 && (
                            <>
                              <span className="text-xs text-muted-foreground">Sheet:</span>
                              <Select
                                value={it.selectedSheet}
                                onValueChange={(v) => reparseSheet(it.id, v)}
                                disabled={running || it.status === 'done'}
                              >
                                <SelectTrigger className="h-7 w-[200px] text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {it.parsed.sheetNames.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={running || it.status === 'done' || it.status === 'processing'}
                            onClick={() => setColumnDialogId(it.id)}
                          >
                            <Settings2 className="mr-1 h-3.5 w-3.5" />
                            Configure Columns
                          </Button>
                        </div>
                      )}
                      {unmatched.length > 0 && (
                        <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                          Unmapped columns (will be ignored): {unmatched.join(', ')}
                          {isAdmin && (
                            <>
                              {' '}·{' '}
                              <button
                                className="underline hover:text-amber-900 dark:hover:text-amber-100"
                                onClick={() => navigate('/admin?tab=header-mappings&module=punch')}
                              >
                                Manage in Admin
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {it.parsed && it.parsed.errors.length > 0 && (
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          {it.parsed.errors.length} rows will be rejected (missing required fields).
                        </div>
                      )}
                      {it.result && (
                        <div className="mt-1 text-xs">
                          <span className="text-emerald-700 dark:text-emerald-300">{it.result.inserted} ins</span> ·{' '}
                          <span className="text-blue-700 dark:text-blue-300">{it.result.updated} upd</span>
                          {it.result.failed > 0 && <> · <span className="text-destructive">{it.result.failed} failed</span></>}
                        </div>
                      )}
                    </div>
                    {it.status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    {it.status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive" />}
                    {!running && it.status !== 'processing' && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFile(it.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {(totals.inserted + totals.updated + totals.failed) > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Summary</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <SummaryBox label="Inserted" value={totals.inserted} />
            <SummaryBox label="Updated" value={totals.updated} />
            <SummaryBox label="Failed" value={totals.failed} />
          </CardContent>
        </Card>
      )}

      {dialogItem?.parsed && (
        <PunchColumnSelect
          fileName={dialogItem.file.name}
          headers={dialogItem.parsed.headerMap.map((h) => h.header)}
          samples={dialogItem.parsed.headerSamples}
          fieldByHeader={fieldByHeader}
          defaultExcluded={dialogItem.excludedHeaders}
          open={!!columnDialogId}
          onClose={() => setColumnDialogId(null)}
          onApply={(excluded) => {
            void applyExcluded(dialogItem.id, excluded);
            setColumnDialogId(null);
          }}
        />
      )}
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
