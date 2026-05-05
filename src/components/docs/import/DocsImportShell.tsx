import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, Lock, AlertTriangle, Info, Settings, Settings2,
} from 'lucide-react';
import { DocsColumnSelect } from '@/components/docs/import/DocsColumnSelect';
import type { DocsSubModule as DocsFieldSubModule } from '@/hooks/useDocsFieldConfig';
import { useModuleStatus } from '@/contexts/ModuleStatusContext';
import { useAuth } from '@/contexts/AuthContext';
import type {
  DocsFileStatus,
  DocsImportContextValue,
} from '@/contexts/docs-import/types';

const statusBadge: Record<DocsFileStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-muted text-muted-foreground' },
  parsing: { label: 'Parsing', cls: 'bg-muted text-muted-foreground' },
  ready: { label: 'Ready', cls: 'bg-primary/10 text-primary' },
  processing: { label: 'Processing', cls: 'bg-muted text-muted-foreground' },
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  failed: { label: 'Failed', cls: 'bg-destructive/10 text-destructive' },
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocsImportShellProps {
  title: string;
  description: string;
  importer: DocsImportContextValue<any>;
  /** When true, all controls are disabled — used when another sub-module is mid-import. */
  externallyBusy?: boolean;
  /** Pre-import notice (e.g. OMM Resubmission auto-trigger explainer). */
  infoBanner?: string;
}

export function DocsImportShell({
  title, description, importer, externallyBusy, infoBanner,
}: DocsImportShellProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [columnDialogFileId, setColumnDialogFileId] = useState<string | null>(null);
  const {
    files, isRunning, addFiles, removeFile, clearAll, startImport, setFileDataDate,
    setFileExcludedHeaders,
    keyFieldLabel, dataDateRequired, rawDataPath, subModule,
  } = importer;
  const { docs } = useModuleStatus();
  const { isAdmin } = useAuth();
  const moduleActuallyPaused = !docs.enabled;
  const modulePaused = moduleActuallyPaused && !isAdmin;
  const blocked = modulePaused || externallyBusy;

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (blocked) return;
    addFiles(Array.from(event.dataTransfer.files));
  }, [addFiles, blocked]);

  const onSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files ? Array.from(event.target.files) : []);
    if (inputRef.current) inputRef.current.value = '';
  }, [addFiles]);

  const readyCount = files.filter((f) => f.status === 'ready').length;
  const hasResults = files.some((f) => f.result);
  const totals = files.reduce((acc, f) => {
    if (f.result) {
      acc.inserted += f.result.inserted;
      acc.updated += f.result.updated;
      acc.skipped += f.result.skipped;
      acc.rejected += f.result.rejected;
      acc.unmatched += f.result.unmatchedOrgs;
      acc.resubmissions += f.result.resubmissionsCreated ?? 0;
      acc.resubDraft += f.result.resubmissionsByStage?.Draft ?? 0;
      acc.resubFinal += f.result.resubmissionsByStage?.Final ?? 0;
    }
    return acc;
  }, { inserted: 0, updated: 0, skipped: 0, rejected: 0, unmatched: 0, resubmissions: 0, resubDraft: 0, resubFinal: 0 });

  const hasUnmappedHeaders = files.some((f) => (f.unknownHeaders?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => navigate(`/docs/import/logs?sub=${subModule}`)}
        >
          View Import Logs
        </Button>
      </div>

      {moduleActuallyPaused && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            {isAdmin ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <Lock className="h-5 w-5 text-amber-600" />}
            <div>
              <p className="font-medium">Docs module is currently disabled.</p>
              <p className="text-muted-foreground">
                {isAdmin
                  ? 'You can import as an administrator. Regular users cannot access this page.'
                  : 'Contact your administrator to enable the Docs module.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {externallyBusy && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-900/10">
          <CardContent className="flex items-center gap-3 p-3 text-xs">
            <Loader2 className="h-4 w-4 animate-spin text-amber-700" />
            <span>Another Docs sub-module import is in progress. Wait for it to finish before starting this one.</span>
          </CardContent>
        </Card>
      )}

      {infoBanner && (
        <Card className="border-blue-300 bg-blue-50/70 dark:bg-blue-900/20">
          <CardContent className="flex items-start gap-3 p-3 text-xs">
            <Info className="mt-0.5 h-4 w-4 text-blue-700" />
            <span>{infoBanner}</span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Upload Files</CardTitle>
          <CardDescription>Drag and drop xlsx / xls files, or click to browse.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition ${
              blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-primary hover:bg-accent/30'
            }`}
            onClick={() => !blocked && inputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Drop Excel files here or click to browse</p>
            <p className="text-xs text-muted-foreground">.xlsx, .xls — multi-sheet supported</p>
            <input
              ref={inputRef} type="file" multiple accept=".xlsx,.xls" className="hidden"
              onChange={onSelect} disabled={blocked}
            />
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">2. Files ({files.length})</CardTitle>
              <CardDescription>{readyCount} ready to import</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasUnmappedHeaders && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => navigate(`/admin?tab=header-mappings&module=docs&sub=${subModule}`)}
                >
                  <Settings className="mr-2 h-3 w-3" />Header Mappings
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={clearAll} disabled={isRunning}>Clear all</Button>
              <Button size="sm" onClick={startImport} disabled={isRunning || readyCount === 0 || blocked}>
                {isRunning ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Importing…</> : `Start import (${readyCount})`}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {files.map((f) => {
              const badge = statusBadge[f.status];
              const emptyKey = f.emptyKeyCount ?? 0;
              const dupKey = f.duplicateKeyCount ?? 0;
              return (
                <div key={f.id} className="rounded border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSize(f.size)}
                          {f.sheetNames && ` · ${f.sheetNames.length} sheet(s): ${f.sheetNames.join(', ')}`}
                          {f.parsedCount > 0 && ` · ${f.parsedCount} rows parsed`}
                        </p>
                        {dataDateRequired && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="whitespace-nowrap text-xs text-muted-foreground">Data Date:</span>
                            <Input
                              type="date" value={f.dataDate || ''}
                              onChange={(e) => setFileDataDate(f.id, e.target.value)}
                              disabled={isRunning || f.status === 'done' || f.status === 'failed'}
                              className="h-7 w-[150px] text-xs"
                            />
                            <span className="text-[11px] text-muted-foreground">Reference "today" for cycle delay calculation.</span>
                          </div>
                        )}
                        {f.availableHeaders && f.availableHeaders.length > 0 && (
                          <div className="mt-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1.5 text-xs"
                              onClick={() => setColumnDialogFileId(f.id)}
                              disabled={isRunning || f.status === 'done' || f.status === 'parsing'}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                              Select Columns ({f.availableHeaders.length - (f.excludedHeaders?.length ?? 0)}/{f.availableHeaders.length})
                            </Button>
                          </div>
                        )}
                        {f.error && (
                          <div className="mt-1 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                            <p className="font-medium">⚠ {f.error}</p>
                            {(f.errorCode || f.errorDetails || f.errorHint) && (
                              <p className="mt-1 font-mono text-[11px] opacity-80">
                                {f.errorCode && <>code: {f.errorCode}<br /></>}
                                {f.errorDetails && <>details: {f.errorDetails}<br /></>}
                                {f.errorHint && <>hint: {f.errorHint}</>}
                              </p>
                            )}
                          </div>
                        )}
                        {f.unknownHeaders && f.unknownHeaders.length > 0 && (
                          <p className="mt-1 text-xs text-amber-600">
                            Unmapped headers: {f.unknownHeaders.slice(0, 5).join(', ')}{f.unknownHeaders.length > 5 ? ` (+${f.unknownHeaders.length - 5})` : ''}
                          </p>
                        )}
                        {(emptyKey > 0 || dupKey > 0) && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {emptyKey > 0 ? `Empty ${keyFieldLabel}: ${emptyKey}` : ''}
                            {emptyKey > 0 && dupKey > 0 ? ' · ' : ''}
                            {dupKey > 0 ? `In-file duplicates: ${dupKey}` : ''}
                          </p>
                        )}
                        {f.rejectSamples && f.rejectSamples.length > 0 && (
                          <details className="mt-1 text-xs">
                            <summary className="cursor-pointer text-destructive">Show first {f.rejectSamples.length} rejected row(s)</summary>
                            <ul className="mt-1 space-y-1 pl-4">
                              {f.rejectSamples.map((s, i) => (
                                <li key={i} className="font-mono text-[11px]">
                                  row {s.rawRowNo} ({s.key ?? '—'}): {s.reasonDetail}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={badge.cls}>{badge.label}</Badge>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => removeFile(f.id)} disabled={isRunning}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {f.status === 'processing' && <Progress value={f.progress} className="mt-2 h-1.5" />}
                  {f.result && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                        <CheckCircle2 className="mr-1 h-3 w-3" />Inserted: {f.result.inserted}
                      </Badge>
                      <Badge variant="outline" className="border-blue-300 text-blue-700">
                        Updated: {f.result.updated}
                      </Badge>
                      {f.result.skipped > 0 && (
                        <Badge variant="outline" className="border-amber-400 text-amber-700">
                          Skipped: {f.result.skipped}
                        </Badge>
                      )}
                      {f.result.rejected > 0 && (
                        <Badge variant="outline" className="border-destructive text-destructive">
                          <AlertCircle className="mr-1 h-3 w-3" />Rejected: {f.result.rejected}
                        </Badge>
                      )}
                      {f.result.unmatchedOrgs > 0 && (
                        <Badge variant="outline" className="border-amber-400 text-amber-700">
                          Unmatched orgs: {f.result.unmatchedOrgs}
                        </Badge>
                      )}
                      {(f.result.resubmissionsCreated ?? 0) > 0 && (
                        <Badge variant="outline" className="border-purple-400 text-purple-700">
                          Resubmissions: {f.result.resubmissionsCreated}
                          {f.result.resubmissionsByStage && (
                            <> (D:{f.result.resubmissionsByStage.Draft} F:{f.result.resubmissionsByStage.Final})</>
                          )}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {hasResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded border p-3">
                <p className="text-xs text-muted-foreground">Inserted</p>
                <p className="text-2xl font-semibold text-emerald-700">{totals.inserted.toLocaleString()}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-muted-foreground">Updated</p>
                <p className="text-2xl font-semibold text-blue-700">{totals.updated.toLocaleString()}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-muted-foreground">Skipped</p>
                <p className="text-2xl font-semibold">{totals.skipped.toLocaleString()}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-muted-foreground">Rejected</p>
                <p className="text-2xl font-semibold text-destructive">{totals.rejected.toLocaleString()}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-muted-foreground">Unmatched orgs</p>
                <p className="text-2xl font-semibold text-amber-700">{totals.unmatched.toLocaleString()}</p>
              </div>
            </div>
            {totals.resubmissions > 0 && (
              <div className="rounded border border-purple-300 bg-purple-50/60 p-3 text-sm dark:bg-purple-900/20">
                <p className="font-medium text-purple-800 dark:text-purple-200">
                  Auto-created {totals.resubmissions} resubmission row(s){' '}
                  (Draft: {totals.resubDraft}, Final: {totals.resubFinal})
                </p>
                <p className="text-xs text-muted-foreground">
                  Triggered automatically when response status changed to B or C during import.
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate(rawDataPath)}>
                View Raw Data
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(`/docs/import/logs?sub=${subModule}`)}>
                View Import Logs
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
