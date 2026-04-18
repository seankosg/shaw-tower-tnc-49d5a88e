import { useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useImport, type FileStatus } from '@/contexts/ImportContext';

const statusBadge: Record<FileStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-muted text-muted-foreground' },
  parsing: { label: 'Parsing', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  ready: { label: 'Ready', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  processing: { label: 'Processing', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  done: { label: 'Done', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  failed: { label: 'Failed', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { files, importType, isRunning, setImportType, addFiles, removeFile, clearAll, startImport } = useImport();

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const list = Array.from(e.dataTransfer.files).filter(f => /\.(xlsx|xls)$/i.test(f.name));
    if (list.length) addFiles(list);
  }, [addFiles]);

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (list.length) addFiles(list);
    if (inputRef.current) inputRef.current.value = '';
  }, [addFiles]);

  const readyCount = files.filter(f => f.status === 'ready').length;
  const totals = files.reduce((acc, f) => {
    if (f.result) {
      acc.inserted += f.result.inserted;
      acc.updated += f.result.updated;
      acc.skipped += f.result.skipped;
      acc.rejected += f.result.rejected;
    }
    return acc;
  }, { inserted: 0, updated: 0, skipped: 0, rejected: 0 });
  const hasResults = files.some(f => f.result);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Import Data</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/import/logs')}>
          View Import Logs
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Import Type</CardTitle>
          <CardDescription>
            Legacy: 1 row = 1 Test with MOS-1~5 columns. Standard: 1 row = 1 Subtest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={importType} onValueChange={(v) => setImportType(v as any)} disabled={isRunning}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="legacy">Legacy Import</SelectItem>
              <SelectItem value="standard">Standard Import</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Drop Excel files here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Multiple .xlsx, .xls files supported</p>
            <input
              ref={inputRef}
              id="file-input"
              type="file"
              accept=".xlsx,.xls"
              multiple
              className="hidden"
              onChange={onSelect}
            />
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Selected Files ({files.length})</CardTitle>
                <CardDescription>
                  {readyCount > 0 ? `${readyCount} ready to import` : 'No files ready'}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearAll} disabled={isRunning}>
                  Clear All
                </Button>
                <Button size="sm" onClick={startImport} disabled={isRunning || readyCount === 0}>
                  {isRunning ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Importing...</>
                  ) : (
                    <><Upload className="mr-1.5 h-3.5 w-3.5" /> Execute Import ({readyCount} files)</>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {files.map(f => {
              const sb = statusBadge[f.status];
              return (
                <div key={f.id} className="flex items-center gap-3 rounded-md border p-3">
                  <FileSpreadsheet className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{f.name}</span>
                      <Badge variant="outline" className={`text-xs ${sb.cls}`}>{sb.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatSize(f.size)}
                      {f.parsedCount > 0 && ` · ${f.parsedCount} rows`}
                      {f.error && <span className="text-destructive"> · {f.error}</span>}
                      {f.result && (
                        <span className="ml-1">
                          · {f.result.inserted} ins, {f.result.updated} upd, {f.result.skipped} skp, {f.result.rejected} rej
                        </span>
                      )}
                    </div>
                    {f.status === 'processing' && (
                      <Progress value={f.progress} className="h-1 mt-2" />
                    )}
                  </div>
                  {f.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                  {f.status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
                  {!isRunning && f.status !== 'processing' && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFile(f.id)}>
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
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Import Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-md bg-green-50 dark:bg-green-950">
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">{totals.inserted}</div>
                <div className="text-xs text-muted-foreground">Inserted</div>
              </div>
              <div className="text-center p-3 rounded-md bg-blue-50 dark:bg-blue-950">
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totals.updated}</div>
                <div className="text-xs text-muted-foreground">Updated</div>
              </div>
              <div className="text-center p-3 rounded-md bg-yellow-50 dark:bg-yellow-950">
                <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{totals.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
              <div className="text-center p-3 rounded-md bg-red-50 dark:bg-red-950">
                <div className="text-2xl font-bold text-red-700 dark:text-red-300">{totals.rejected}</div>
                <div className="text-xs text-muted-foreground">Rejected</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
