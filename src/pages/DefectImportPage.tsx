import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, AlertTriangle, Settings2, Lock } from 'lucide-react';
import { useDefectImport, type DefectFileStatus } from '@/contexts/DefectImportContext';
import { ColumnSelectDialog } from '@/components/import/ColumnSelectDialog';
import { useModuleStatus } from '@/contexts/ModuleStatusContext';
import { useAuth } from '@/contexts/AuthContext';

// Re-export pure helpers so existing tests/imports keep working
export { compareIssueNoAsc, detectIssueNoSortDirection, buildSubcontractorIssueAssignments } from '@/contexts/DefectImportContext';
export type { IssueAssignment } from '@/contexts/DefectImportContext';

const statusBadge: Record<DefectFileStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-muted text-muted-foreground' },
  parsing: { label: 'Parsing', cls: 'bg-muted text-muted-foreground' },
  pending_sheet_selection: { label: 'Select Sheet', cls: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-200' },
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

export default function DefectImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    files,
    isRunning,
    similarDecisions,
    addFiles,
    removeFile,
    clearAll,
    setFileDataDate,
    setFileSheet,
    setFileExcludedHeaders,
    startImport,
    setDecisionAction,
    confirmSimilarDecisions,
    cancelSimilarDecisions,
  } = useDefectImport();
  const { defect } = useModuleStatus();
  const { isAdmin } = useAuth();
  const moduleActuallyPaused = !defect.enabled;
  // Administrator bypass: paused module does not lock admin
  const modulePaused = moduleActuallyPaused && !isAdmin;
  const [columnDialogFileId, setColumnDialogFileId] = useState<string | null>(null);
  const columnDialogFile = files.find((f) => f.id === columnDialogFileId) ?? null;

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  }, [addFiles]);

  const onSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files ? Array.from(event.target.files) : []);
    if (inputRef.current) inputRef.current.value = '';
  }, [addFiles]);

  const readyCount = files.filter((file) => file.status === 'ready').length;
  const hasResults = files.some((file) => file.result);
  const totals = files.reduce((acc, file) => {
    if (file.result) {
      acc.inserted += file.result.inserted;
      acc.updated += file.result.updated;
      acc.skipped += file.result.skipped;
      acc.rejected += file.result.rejected;
      acc.teamUnresolved += file.result.teamUnresolved;
      acc.classifiedRule += file.result.classifiedRule;
      acc.classifiedDiscipline += file.result.classifiedDiscipline;
      acc.unclassified += file.result.unclassified;
    }
    return acc;
  }, { inserted: 0, updated: 0, skipped: 0, rejected: 0, teamUnresolved: 0, classifiedRule: 0, classifiedDiscipline: 0, unclassified: 0 });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Import Data</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/defects/import/logs')}>
          View Import Logs
        </Button>
      </div>

      {moduleActuallyPaused && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {isAdmin ? (
              <p className="font-medium">Defect 모듈은 현재 일시 중단 상태이지만, 관리자 권한으로 업로드가 가능합니다.</p>
            ) : (
              <p className="font-medium">Defect 모듈이 일시 중단되어 업로드가 잠겼습니다.</p>
            )}
            {defect.reason && <p className="mt-0.5 text-xs opacity-90">사유: {defect.reason}</p>}
            {!isAdmin && (
              <p className="mt-0.5 text-xs opacity-80">모듈을 재개한 후 업로드하세요. (관리자 전용)</p>
            )}
          </div>
        </div>
      )}

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
                <Button size="sm" onClick={startImport} disabled={isRunning || readyCount === 0 || modulePaused}>
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
                      {file.isReimport && (
                        <Badge variant="outline" className="bg-amber-100 text-amber-900 text-xs">Re-import (Update only)</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {formatSize(file.size)} · Defect Import
                      {file.headerCount != null && ` · ${file.headerCount} headers`}
                      {file.parsedCount > 0 && ` · ${file.parsedCount} rows`}
                      {file.error && <span className="text-destructive"> · {file.error}</span>}
                      {file.result && <span className="ml-1">· {file.result.inserted} ins, {file.result.updated} upd, {file.result.skipped} skp, {file.result.rejected} rej{file.result.teamUnresolved > 0 ? ` · ${file.result.teamUnresolved} team unresolved` : ''}</span>}
                    </div>
                    {file.isReimport && (
                      <div className="mt-1 text-xs text-amber-800">
                        This file was exported in Re-import format. Existing rows will be updated; new rows will not be created.
                      </div>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {file.sheetNames && file.sheetNames.length > 1 && (
                        <>
                          <span className="whitespace-nowrap text-xs text-muted-foreground">Sheet:</span>
                          <Select
                            value={file.selectedSheet || ''}
                            onValueChange={(v) => setFileSheet(file.id, v)}
                            disabled={isRunning || file.status === 'done' || file.status === 'processing'}
                          >
                            <SelectTrigger className="h-7 w-[180px] text-xs">
                              <SelectValue placeholder="Select sheet" />
                            </SelectTrigger>
                            <SelectContent>
                              {file.sheetNames.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
                      <span className="whitespace-nowrap text-xs text-muted-foreground">Data Date:</span>
                      <Input
                        type="date"
                        value={file.dataDate || ''}
                        onChange={(event) => setFileDataDate(file.id, event.target.value)}
                        disabled={isRunning || file.status === 'done' || file.status === 'failed'}
                        className="h-7 w-[150px] text-xs"
                      />
                      {file.availableHeaders && file.availableHeaders.length > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 text-xs"
                          onClick={() => setColumnDialogFileId(file.id)}
                          disabled={isRunning || file.status === 'done' || file.status === 'parsing'}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          Select Columns ({file.availableHeaders.length - (file.excludedHeaders?.length ?? 0)}/{file.availableHeaders.length})
                        </Button>
                      )}
                      <span className="text-xs text-muted-foreground">Team will be resolved from Field Discipline.</span>
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
          <CardContent className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-5">
              <SummaryBox label="Inserted" value={totals.inserted} />
              <SummaryBox label="Updated" value={totals.updated} />
              <SummaryBox label="Skipped" value={totals.skipped} />
              <SummaryBox label="Rejected" value={totals.rejected} />
              <SummaryBox label="Team Unresolved" value={totals.teamUnresolved} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <SummaryBox label="Auto-classified (rule)" value={totals.classifiedRule} onClick={() => navigate('/defects/raw-data?classificationSource=rule')} />
              <SummaryBox label="Auto-classified (discipline)" value={totals.classifiedDiscipline} onClick={() => navigate('/defects/raw-data?classificationSource=discipline')} />
              <SummaryBox label="Unclassified" value={totals.unclassified} onClick={() => navigate('/defects/raw-data?classificationSource=unclassified')} />
            </div>
          </CardContent>
        </Card>
      )}

      {columnDialogFile && columnDialogFile.availableHeaders && (
        <DefectColumnSelect
          fileId={columnDialogFile.id}
          fileName={columnDialogFile.name}
          headers={columnDialogFile.availableHeaders}
          samples={columnDialogFile.headerSamples ?? {}}
          defaultExcluded={columnDialogFile.excludedHeaders ?? []}
          isReimport={!!columnDialogFile.isReimport}
          open={!!columnDialogFileId}
          onClose={() => setColumnDialogFileId(null)}
          onApply={(excluded) => setFileExcludedHeaders(columnDialogFile.id, excluded)}
        />
      )}

      <Dialog open={similarDecisions.length > 0} onOpenChange={(open) => {
        if (!open) cancelSimilarDecisions();
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Possible Existing Subcontractors Found</DialogTitle>
            <DialogDescription>
              Review similar master names before the import creates new subcontractors or users.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <div className="grid grid-cols-[1fr_1fr_220px] gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Imported Name</span>
              <span>Similar Existing Master</span>
              <span>Action</span>
            </div>
            {similarDecisions.map((decision) => (
              <div key={decision.key} className="grid grid-cols-[1fr_1fr_220px] items-center gap-3 border-b px-3 py-3 last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{decision.importedName}</div>
                  <div className="text-xs text-muted-foreground">
                    {decision.kind === 'subsub' ? `Sub-sub · Parent: ${decision.parentName}` : 'Subcontractor'}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{decision.existingName}</div>
                  <div className="text-xs text-muted-foreground">Similarity {Math.round(decision.score * 100)}%</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={decision.action === 'use_existing' ? 'default' : 'outline'}
                    onClick={() => setDecisionAction(decision.key, 'use_existing')}
                  >
                    Use Existing
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={decision.action === 'register_new' ? 'default' : 'outline'}
                    onClick={() => setDecisionAction(decision.key, 'register_new')}
                  >
                    Register New
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelSimilarDecisions}>
              Cancel
            </Button>
            <Button onClick={confirmSimilarDecisions} disabled={similarDecisions.some((decision) => !decision.action) || isRunning}>
              Continue Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryBox({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="rounded-md bg-muted p-3 text-center transition-colors disabled:cursor-default enabled:hover:bg-muted/80"
    >
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </button>
  );
}
