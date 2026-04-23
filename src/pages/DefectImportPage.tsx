import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { daysDiff, parseDefectExcel, type ParsedDefectRow } from '@/lib/defect-parser';
import { createDefectMasterEnsurer } from '@/lib/defect-master-autocreate';
import { findSimilarMasterName, masterNameKey } from '@/lib/master-name-match';
import { ALL_TEAMS, TEAM_LABELS, type TeamType } from '@/types/enums';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';

const trackedFields = ['planned_date', 'target_date', 'closed_date', 'actual_progress_pct', 'closure_status'] as const;
type DefectFileStatus = 'pending' | 'parsing' | 'ready' | 'processing' | 'done' | 'failed';

interface DefectImportFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: DefectFileStatus;
  parsed?: ParsedDefectRow[];
  parsedCount: number;
  progress: number;
  error?: string;
  headerCount?: number;
  dataDate?: string;
  team?: TeamType;
  result?: { inserted: number; updated: number; skipped: number; rejected: number };
}

type SimilarDecisionAction = 'use_existing' | 'register_new';
type SimilarMasterDecision = {
  key: string;
  kind: 'subcontractor' | 'subsub';
  importedName: string;
  existingName: string;
  parentName?: string | null;
  score: number;
  action?: SimilarDecisionAction;
};

type MasterNameDecisions = Record<string, SimilarMasterDecision>;

const statusBadge: Record<DefectFileStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-muted text-muted-foreground' },
  parsing: { label: 'Parsing', cls: 'bg-muted text-muted-foreground' },
  ready: { label: 'Ready', cls: 'bg-primary/10 text-primary' },
  processing: { label: 'Processing', cls: 'bg-muted text-muted-foreground' },
  done: { label: 'Done', cls: 'bg-primary/10 text-primary' },
  failed: { label: 'Failed', cls: 'bg-destructive/10 text-destructive' },
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function changed(a: unknown, b: unknown) {
  return String(a ?? '') !== String(b ?? '');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function DefectImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<DefectImportFile[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [similarDecisions, setSimilarDecisions] = useState<SimilarMasterDecision[]>([]);
  const [pendingImportFiles, setPendingImportFiles] = useState<DefectImportFile[] | null>(null);
  const [confirmedDecisions, setConfirmedDecisions] = useState<MasterNameDecisions>({});

  const parseFiles = useCallback(async (selected: File[]) => {
    const excelFiles = selected.filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    const nextFiles: DefectImportFile[] = excelFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      name: file.name,
      size: file.size,
      status: 'parsing',
      parsedCount: 0,
      progress: 0,
      dataDate: todayIso(),
    }));
    setFiles((current) => [...current, ...nextFiles]);

    for (const item of nextFiles) {
      try {
        const parsed = await parseDefectExcel(item.file);
        setFiles((current) => current.map((file) => file.id === item.id ? {
          ...file,
          status: parsed.rows.length ? 'ready' : 'failed',
          parsed: parsed.rows,
          parsedCount: parsed.rows.length,
          headerCount: parsed.headers.length,
          error: parsed.rows.length ? undefined : 'No defect rows found',
        } : file));
      } catch (error) {
        setFiles((current) => current.map((file) => file.id === item.id ? { ...file, status: 'failed', error: error instanceof Error ? error.message : 'Parse failed' } : file));
      }
    }
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    parseFiles(Array.from(event.dataTransfer.files));
  }, [parseFiles]);

  const onSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    parseFiles(event.target.files ? Array.from(event.target.files) : []);
    if (inputRef.current) inputRef.current.value = '';
  }, [parseFiles]);

  const removeFile = (id: string) => setFiles((current) => current.filter((file) => file.id !== id));
  const clearAll = () => setFiles([]);
  const setFileDataDate = (id: string, dataDate: string) => setFiles((current) => current.map((file) => file.id === id ? { ...file, dataDate } : file));
  const setFileTeam = (id: string, team: TeamType) => setFiles((current) => current.map((file) => file.id === id ? { ...file, team } : file));
  const readyCount = files.filter((file) => file.status === 'ready' && file.team).length;
  const hasResults = files.some((file) => file.result);
  const totals = files.reduce((acc, file) => {
    if (file.result) {
      acc.inserted += file.result.inserted;
      acc.updated += file.result.updated;
      acc.skipped += file.result.skipped;
      acc.rejected += file.result.rejected;
    }
    return acc;
  }, { inserted: 0, updated: 0, skipped: 0, rejected: 0 });

  const applyMasterDecisions = (row: ParsedDefectRow, decisions: MasterNameDecisions): ParsedDefectRow => {
    const subKey = `sub:${masterNameKey(row.subcontractor_name)}`;
    const mappedSub = decisions[subKey]?.action === 'use_existing' ? decisions[subKey].existingName : row.subcontractor_name;
    const subsubKey = `subsub:${masterNameKey(mappedSub)}::${masterNameKey(row.subsub_name)}`;
    const mappedSubsub = decisions[subsubKey]?.action === 'use_existing' ? decisions[subsubKey].existingName : row.subsub_name;

    return {
      ...row,
      subcontractor_name: mappedSub,
      subsub_name: mappedSubsub,
    };
  };

  const preflightSimilarMasterDecisions = async (items: DefectImportFile[]) => {
    const { data } = await (supabase as any)
      .from('subcontractor_master')
      .select('id, name, type, parent_subcontractor_id');
    const masters = (data ?? []) as Array<{ id: string; name: string; type: string; parent_subcontractor_id: string | null }>;
    const subMasters = masters.filter((master) => (master.type ?? 'sub') === 'sub');
    const subIdToName = new Map(subMasters.map((master) => [master.id, master.name]));
    const exactSubs = new Set(subMasters.map((master) => masterNameKey(master.name)));
    const subsubMasters = masters
      .filter((master) => master.type === 'subsub')
      .map((master) => ({ ...master, parentName: master.parent_subcontractor_id ? subIdToName.get(master.parent_subcontractor_id) ?? null : null }));
    const exactSubsubs = new Set(subsubMasters.map((master) => `${masterNameKey(master.parentName)}::${masterNameKey(master.name)}`));
    const decisions = new Map<string, SimilarMasterDecision>();

    for (const item of items) {
      for (const row of item.parsed ?? []) {
        const subName = row.subcontractor_name?.trim();
        if (subName && !exactSubs.has(masterNameKey(subName))) {
          const key = `sub:${masterNameKey(subName)}`;
          const match = findSimilarMasterName(subName, subMasters);
          if (match && !decisions.has(key)) {
            decisions.set(key, { key, kind: 'subcontractor', importedName: subName, existingName: match.candidate.name, score: match.score });
          }
        }

        const parentName = (decisions.get(`sub:${masterNameKey(subName)}`)?.existingName ?? subName)?.trim();
        const subsubName = row.subsub_name?.trim();
        if (parentName && subsubName && !exactSubsubs.has(`${masterNameKey(parentName)}::${masterNameKey(subsubName)}`)) {
          const key = `subsub:${masterNameKey(parentName)}::${masterNameKey(subsubName)}`;
          const candidates = subsubMasters.filter((master) => masterNameKey(master.parentName) === masterNameKey(parentName));
          const match = findSimilarMasterName(subsubName, candidates);
          if (match && !decisions.has(key)) {
            decisions.set(key, { key, kind: 'subsub', importedName: subsubName, existingName: match.candidate.name, parentName, score: match.score });
          }
        }
      }
    }

    return [...decisions.values()];
  };

  const importOneFile = async (item: DefectImportFile, decisions: MasterNameDecisions) => {
    if (!user || !item.parsed) return { inserted: 0, updated: 0, skipped: 0, rejected: 0 };
    const dataDate = item.dataDate || todayIso();
    const masterEnsurer = await createDefectMasterEnsurer(supabase as any);
    const batchRes = await (supabase as any).from('defect_upload_batches').insert({ uploaded_file_name: item.name, uploaded_by: user.id, status: 'processing', total_rows: item.parsed.length, data_date: dataDate }).select('id').single();
    const uploadId = batchRes.data?.id;
    let insertedCount = 0;
    let updatedCount = 0;
    let skipped = 0;
    let rejected = 0;

    for (let index = 0; index < item.parsed.length; index++) {
      const row = applyMasterDecisions(item.parsed[index], decisions);
      setFiles((current) => current.map((file) => file.id === item.id ? { ...file, progress: Math.round(((index + 1) / item.parsed!.length) * 100) } : file));
      if (!row.issue_no) {
        rejected++;
        await (supabase as any).from('defect_upload_row_logs').insert({ upload_id: uploadId, raw_row_no: row.rawRowNo, action_taken: 'rejected', reason_code: 'missing_issue_no', reason_detail: 'Issue No is required' });
        continue;
      }

      await masterEnsurer.ensureForRow(row);

      const existingRes = await (supabase as any).from('defect_items').select('*').eq('issue_no', row.issue_no).maybeSingle();
      const existing = existingRes.data;
      const payload = { ...row, team: item.team || row.team || null, rawRowNo: undefined, source_upload_id: uploadId, data_source_type: 'defect_import', updated_by: user.id, row_version: (existing?.row_version ?? 0) + 1 };

      if (existing) {
        const hasAnyChange = Object.entries(payload).some(([key, value]) => key !== 'raw_payload' && key !== 'row_version' && key !== 'updated_by' && key !== 'source_upload_id' && changed(existing[key], value));
        if (!hasAnyChange) {
          skipped++;
          await (supabase as any).from('defect_upload_row_logs').insert({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'skipped' });
          continue;
        }
        await (supabase as any).from('defect_items').update(payload).eq('id', existing.id);
        for (const field of trackedFields) {
          if (changed(existing[field], (row as any)[field])) {
            await (supabase as any).from('defect_schedule_change_audit').insert({
              upload_id: uploadId, defect_id: existing.id, project_id: existing.project_id, issue_no: row.issue_no, subcontractor_issue_no: row.subcontractor_issue_no, raw_row_no: row.rawRowNo,
              planned_old_date: field === 'planned_date' ? existing.planned_date : null, planned_new_date: field === 'planned_date' ? row.planned_date : null, planned_diff_days: field === 'planned_date' ? daysDiff(existing.planned_date, row.planned_date) : null,
              target_old_date: field === 'target_date' ? existing.target_date : null, target_new_date: field === 'target_date' ? row.target_date : null, target_diff_days: field === 'target_date' ? daysDiff(existing.target_date, row.target_date) : null,
              closed_old_date: field === 'closed_date' ? existing.closed_date : null, closed_new_date: field === 'closed_date' ? row.closed_date : null, closed_diff_days: field === 'closed_date' ? daysDiff(existing.closed_date, row.closed_date) : null,
              progress_old_pct: field === 'actual_progress_pct' ? existing.actual_progress_pct : null, progress_new_pct: field === 'actual_progress_pct' ? row.actual_progress_pct : null, progress_diff_pct: field === 'actual_progress_pct' ? Number(row.actual_progress_pct ?? 0) - Number(existing.actual_progress_pct ?? 0) : null,
              closure_status_old: field === 'closure_status' ? existing.closure_status : null, closure_status_new: field === 'closure_status' ? row.closure_status : null,
              created_by: user.id, change_source: 'excel_import',
            });
          }
        }
        updatedCount++;
        await (supabase as any).from('defect_upload_row_logs').insert({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'updated' });
      } else {
        const inserted = await (supabase as any).from('defect_items').insert(payload).select('id').single();
        insertedCount++;
        await (supabase as any).from('defect_upload_row_logs').insert({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'inserted' });
        if (inserted.data?.id) await (supabase as any).from('defect_daily_snapshots').insert({ defect_id: inserted.data.id, issue_no: row.issue_no, snapshot_date: dataDate, planned_date: row.planned_date, actual_progress_pct: row.actual_progress_pct, closure_status: row.closure_status, closed_date: row.closed_date, created_by: user.id });
      }
    }

    await (supabase as any).from('defect_upload_batches').update({ status: 'completed', processed_rows: item.parsed.length, success_rows: insertedCount + updatedCount, skipped_rows: skipped, rejected_rows: rejected }).eq('id', uploadId);
    if (masterEnsurer.warnings.length > 0) {
      toast({
        title: `${masterEnsurer.warnings.length} master user warning(s)`,
        description: masterEnsurer.warnings.slice(0, 3).join('; ') + (masterEnsurer.warnings.length > 3 ? '...' : ''),
        variant: 'destructive',
      });
    }
    return { inserted: insertedCount, updated: updatedCount, skipped, rejected };
  };

  const runImport = async (items: DefectImportFile[], decisions: MasterNameDecisions) => {
    setIsRunning(true);
    for (const item of items) {
      setFiles((current) => current.map((file) => file.id === item.id ? { ...file, status: 'processing', progress: 0 } : file));
      try {
        const result = await importOneFile(item, decisions);
        setFiles((current) => current.map((file) => file.id === item.id ? { ...file, status: 'done', progress: 100, result } : file));
      } catch (error) {
        setFiles((current) => current.map((file) => file.id === item.id ? { ...file, status: 'failed', error: error instanceof Error ? error.message : 'Import failed' } : file));
      }
    }
    setIsRunning(false);
    toast({ title: 'Defect import complete' });
  };

  const startImport = async () => {
    const readyFiles = files.filter((file) => file.status === 'ready' && file.team);
    setIsRunning(true);
    try {
      const decisions = await preflightSimilarMasterDecisions(readyFiles);
      if (decisions.length > 0) {
        setSimilarDecisions(decisions);
        setPendingImportFiles(readyFiles);
        setIsRunning(false);
        return;
      }
      setIsRunning(false);
      await runImport(readyFiles, confirmedDecisions);
    } catch (error) {
      setIsRunning(false);
      toast({ title: 'Similarity check failed', description: error instanceof Error ? error.message : 'Unable to check master names', variant: 'destructive' });
    }
  };

  const setDecisionAction = (key: string, action: SimilarDecisionAction) => {
    setSimilarDecisions((current) => current.map((decision) => decision.key === key ? { ...decision, action } : decision));
  };

  const confirmSimilarDecisions = async () => {
    if (!pendingImportFiles || similarDecisions.some((decision) => !decision.action)) return;
    const nextDecisions = similarDecisions.reduce<MasterNameDecisions>((acc, decision) => {
      acc[decision.key] = decision;
      return acc;
    }, { ...confirmedDecisions });
    setConfirmedDecisions(nextDecisions);
    setSimilarDecisions([]);
    const items = pendingImportFiles;
    setPendingImportFiles(null);
    await runImport(items, nextDecisions);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Import Data</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/defects/import/logs')}>
          View Import Logs
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div
            className="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50"
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">Drop Excel files here or click to browse</p>
            <p className="mt-1 text-xs text-muted-foreground">Multiple .xlsx, .xls files supported</p>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={onSelect} />
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Selected Files ({files.length})</CardTitle>
                <CardDescription>{readyCount > 0 ? `${readyCount} ready to import` : 'No files ready'}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearAll} disabled={isRunning}>Clear All</Button>
                <Button size="sm" onClick={startImport} disabled={isRunning || readyCount === 0}>
                  {isRunning ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Importing...</> : <><Upload className="mr-1.5 h-3.5 w-3.5" /> Execute Import ({readyCount} files)</>}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.map((file) => {
              const sb = statusBadge[file.status];
              return (
                <div key={file.id} className="flex items-center gap-3 rounded-md border p-3">
                  <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{file.name}</span>
                      <Badge variant="outline" className={`text-xs ${sb.cls}`}>{sb.label}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {formatSize(file.size)} · Defect Import
                      {file.headerCount != null && ` · ${file.headerCount} headers`}
                      {file.parsedCount > 0 && ` · ${file.parsedCount} rows`}
                      {file.error && <span className="text-destructive"> · {file.error}</span>}
                      {file.result && <span className="ml-1">· {file.result.inserted} ins, {file.result.updated} upd, {file.result.skipped} skp, {file.result.rejected} rej</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="whitespace-nowrap text-xs text-muted-foreground">Data Date:</span>
                      <Input
                        type="date"
                        value={file.dataDate || ''}
                        onChange={(event) => setFileDataDate(file.id, event.target.value)}
                        disabled={isRunning || file.status === 'done' || file.status === 'failed'}
                        className="h-7 w-[150px] text-xs"
                      />
                      <span className="whitespace-nowrap text-xs text-muted-foreground">Team:</span>
                      <Select
                        value={file.team || ''}
                        onValueChange={(value) => setFileTeam(file.id, value as TeamType)}
                        disabled={isRunning || file.status === 'done' || file.status === 'failed'}
                      >
                        <SelectTrigger className="h-7 w-[140px] text-xs">
                          <SelectValue placeholder="Select team" />
                        </SelectTrigger>
                        <SelectContent>
                          {ALL_TEAMS.map((team) => (
                            <SelectItem key={team} value={team}>{TEAM_LABELS[team]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {file.status === 'ready' && !file.team && (
                        <span className="text-xs text-destructive">Team is required before import.</span>
                      )}
                    </div>
                    {file.parsed?.some((row) => !row.issue_no) && (
                      <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-border bg-muted px-2 py-1.5">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Rows without Issue No detected.</span>{' '}
                          These rows will be rejected during import.
                        </div>
                      </div>
                    )}
                    {file.status === 'processing' && <Progress value={file.progress} className="mt-2 h-1" />}
                  </div>
                  {file.status === 'done' && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                  {file.status === 'failed' && <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />}
                  {!isRunning && file.status !== 'processing' && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile(file.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {hasResults && !isRunning && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Import Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <SummaryBox label="Inserted" value={totals.inserted} />
              <SummaryBox label="Updated" value={totals.updated} />
              <SummaryBox label="Skipped" value={totals.skipped} />
              <SummaryBox label="Rejected" value={totals.rejected} />
            </div>
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
