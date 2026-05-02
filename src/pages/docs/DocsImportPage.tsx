import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, Lock, AlertTriangle } from 'lucide-react';
import { useDocsImport, type DocsFileStatus } from '@/contexts/DocsImportContext';
import { useModuleStatus } from '@/contexts/ModuleStatusContext';
import { useAuth } from '@/contexts/AuthContext';

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

export default function DocsImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { files, isRunning, addFiles, removeFile, clearAll, startImport } = useDocsImport();
  const { docs } = useModuleStatus();
  const { isAdmin } = useAuth();
  const moduleActuallyPaused = !docs.enabled;
  const modulePaused = moduleActuallyPaused && !isAdmin;

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (modulePaused) return;
    addFiles(Array.from(event.dataTransfer.files));
  }, [addFiles, modulePaused]);

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
    }
    return acc;
  }, { inserted: 0, updated: 0, skipped: 0, rejected: 0, unmatched: 0 });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Docs Import — As-Built Drawings</h1>
        <p className="text-sm text-muted-foreground">
          Upload Aconex / register Excel files. All sheets are swept automatically; documents are upserted by Document No.
        </p>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Upload Files</CardTitle>
          <CardDescription>Drag and drop xlsx / xls files, or click to browse. All sheets in each workbook will be parsed.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition ${
              modulePaused ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-primary hover:bg-accent/30'
            }`}
            onClick={() => !modulePaused && inputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Drop Excel files here or click to browse</p>
            <p className="text-xs text-muted-foreground">.xlsx, .xls — multi-sheet supported</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onSelect}
              disabled={modulePaused}
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
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearAll} disabled={isRunning}>Clear all</Button>
              <Button size="sm" onClick={startImport} disabled={isRunning || readyCount === 0 || modulePaused}>
                {isRunning ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Importing…</> : `Start import (${readyCount})`}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {files.map((f) => {
              const badge = statusBadge[f.status];
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
                        {(f.emptyDocNoCount || f.duplicateDocNoCount) ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {f.emptyDocNoCount ? `Empty Document No: ${f.emptyDocNoCount} · ` : ''}
                            {f.duplicateDocNoCount ? `In-file duplicates: ${f.duplicateDocNoCount}` : ''}
                          </p>
                        ) : null}
                        {f.rejectSamples && f.rejectSamples.length > 0 && (
                          <details className="mt-1 text-xs">
                            <summary className="cursor-pointer text-destructive">Show first {f.rejectSamples.length} rejected row(s)</summary>
                            <ul className="mt-1 space-y-1 pl-4">
                              {f.rejectSamples.map((s, i) => (
                                <li key={i} className="font-mono text-[11px]">
                                  row {s.rawRowNo} ({s.documentNo ?? '—'}): {s.reasonDetail}
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
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(f.id)}
                        disabled={isRunning}
                        className="h-7 w-7"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {f.status === 'processing' && (
                    <Progress value={f.progress} className="mt-2 h-1.5" />
                  )}
                  {f.result && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                        <CheckCircle2 className="mr-1 h-3 w-3" />Inserted: {f.result.inserted}
                      </Badge>
                      <Badge variant="outline" className="border-blue-300 text-blue-700">
                        Updated: {f.result.updated}
                      </Badge>
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
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/docs/raw-data')}>
                View Raw Data
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
                Manage in Admin
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
