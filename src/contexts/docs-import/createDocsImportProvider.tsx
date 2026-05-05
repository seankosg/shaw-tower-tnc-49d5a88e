import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  fmtSupabaseError,
  getDefaultProject,
  todayIso,
  writeImportLogs,
} from '@/lib/docs-import-logging';
import type {
  DocsImportContextValue,
  DocsImportFile,
  ImporterAdapter,
} from '@/contexts/docs-import/types';
import { validateDocsHeaders } from '@/lib/docs-import-validation';

interface FactoryArgs<TRow> {
  adapter: ImporterAdapter<TRow>;
}

export function createDocsImportProvider<TRow>(
  args: FactoryArgs<TRow>,
): {
  Provider: (props: { children: ReactNode }) => JSX.Element;
  useImporter: () => DocsImportContextValue<TRow>;
} {
  const { adapter } = args;
  const Ctx = createContext<DocsImportContextValue<TRow> | null>(null);

  function Provider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [files, setFiles] = useState<DocsImportFile<TRow>[]>([]);
    const [isRunning, setIsRunning] = useState(false);

    const parseAndApply = useCallback(async (id: string, file: File, sheets?: string[], excludedHeaders?: string[]) => {
      try {
        const parsed = await adapter.parseFile(file, sheets, { excludedHeaders });
        setFiles((cur) => cur.map((f) => {
          if (f.id !== id) return f;
          const validation = validateDocsHeaders(adapter.subModule, f.fieldByHeader, excludedHeaders ?? f.excludedHeaders);
          return {
            ...f,
            status: 'ready',
            parsed: parsed.rows,
            parsedCount: parsed.rows.length,
            unknownHeaders: parsed.unknownHeaders,
            validationError: validation.error,
          };
        }));
      } catch (error) {
        setFiles((cur) => cur.map((f) => f.id === id ? {
          ...f,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Parse failed',
        } : f));
      }
    }, []);

    const addFiles = useCallback(async (selected: File[]) => {
      const excelFiles = selected.filter((f) => /\.(xlsx|xls)$/i.test(f.name));
      const next: DocsImportFile<TRow>[] = excelFiles.map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        name: file.name,
        size: file.size,
        status: 'parsing',
        progress: 0,
        parsedCount: 0,
        dataDate: adapter.dataDateRequired ? todayIso() : undefined,
      }));
      setFiles((cur) => [...cur, ...next]);
      for (const item of next) {
        try {
          const sheetNames = await adapter.getSheetNames(item.file);
          // Pre-extract headers + sample values for the column-select dialog.
          let availableHeaders: string[] = [];
          let headerSamples: Record<string, unknown> = {};
          let fieldByHeader: Record<string, string | null> = {};
          try {
            const info = await adapter.getHeaderInfo(item.file, sheetNames);
            availableHeaders = info.headers;
            headerSamples = info.samples;
            fieldByHeader = info.fieldByHeader;
          } catch {
            // Non-fatal — column select just won't be available for this file.
          }
          setFiles((cur) => cur.map((f) => f.id === item.id ? {
            ...f, sheetNames, selectedSheets: sheetNames, availableHeaders, headerSamples, fieldByHeader,
          } : f));
          await parseAndApply(item.id, item.file, sheetNames);
        } catch (error) {
          setFiles((cur) => cur.map((f) => f.id === item.id ? {
            ...f,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Failed to read workbook',
          } : f));
        }
      }
    }, [parseAndApply]);

    const removeFile = useCallback((id: string) => setFiles((cur) => cur.filter((f) => f.id !== id)), []);
    const clearAll = useCallback(() => setFiles([]), []);

    const setFileSheets = useCallback(async (id: string, sheets: string[]) => {
      let target: DocsImportFile<TRow> | undefined;
      setFiles((cur) => {
        target = cur.find((f) => f.id === id);
        return cur.map((f) => f.id === id ? { ...f, status: 'parsing', selectedSheets: sheets } : f);
      });
      if (!target) return;
      await parseAndApply(id, target.file, sheets, target.excludedHeaders);
    }, [parseAndApply]);

    const setFileDataDate = useCallback((id: string, dataDate: string) => {
      setFiles((cur) => cur.map((f) => f.id === id ? { ...f, dataDate } : f));
    }, []);

    const setFileExcludedHeaders = useCallback(async (id: string, excluded: string[]) => {
      let target: DocsImportFile<TRow> | undefined;
      setFiles((cur) => {
        target = cur.find((f) => f.id === id);
        return cur.map((f) => f.id === id ? { ...f, status: 'parsing', excludedHeaders: excluded } : f);
      });
      if (!target) return;
      await parseAndApply(id, target.file, target.selectedSheets, excluded);
    }, [parseAndApply]);

    const startImport = useCallback(async () => {
      if (isRunning) return;
      const ready = files.filter((f) => f.status === 'ready' && f.parsed && f.parsed.length > 0);
      if (ready.length === 0) {
        toast({ title: 'Nothing to import', description: 'Please add and parse files first.', variant: 'destructive' });
        return;
      }
      setIsRunning(true);

      let project: { id: string };
      try {
        project = await getDefaultProject();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Project lookup failed';
        toast({ title: 'Project required', description: msg, variant: 'destructive' });
        setFiles((cur) => cur.map((x) => ready.find((r) => r.id === x.id) ? { ...x, status: 'failed', error: msg } : x));
        setIsRunning(false);
        return;
      }

      for (const f of ready) {
        const parsed = f.parsed!;
        // Pre-pass: empty key + in-file duplicates.
        let emptyKey = 0;
        const seen = new Set<string>();
        let dupCount = 0;
        for (const r of parsed) {
          const k = adapter.getRowKey(r);
          const key = k ? String(k).trim() : '';
          if (!key) { emptyKey++; continue; }
          if (seen.has(key)) dupCount++; else seen.add(key);
        }
        setFiles((cur) => cur.map((x) => x.id === f.id ? {
          ...x, status: 'processing', progress: 0,
          emptyKeyCount: emptyKey, duplicateKeyCount: dupCount,
          rejectSamples: [], errorCode: undefined, errorDetails: undefined, errorHint: undefined, error: undefined,
        } : x));

        try {
          // Create batch.
          const batchInsert: any = {
            project_id: project.id,
            sub_module: adapter.subModule,
            uploaded_file_name: f.name,
            uploaded_by: user?.id ?? null,
            total_rows: parsed.length,
            status: 'processing',
          };
          if (adapter.dataDateRequired) batchInsert.data_date = f.dataDate || todayIso();
          const { data: batchData, error: batchErr } = await (supabase as any)
            .from('docs_upload_batches').insert(batchInsert).select('id').single();
          if (batchErr || !batchData) {
            const e = fmtSupabaseError(batchErr);
            throw Object.assign(new Error(`Failed to create upload batch: ${e.message}`), e);
          }
          const batchId = batchData.id as string;

          // Run sub-module-specific upserts.
          const onProgress = (processed: number, total: number) => {
            const pct = Math.round((processed / total) * 100);
            setFiles((cur) => cur.map((x) => x.id === f.id ? { ...x, progress: pct } : x));
          };
          const result = await adapter.upsertWorker(
            { projectId: project.id, batchId, userId: user?.id ?? null, subModule: adapter.subModule },
            parsed,
            onProgress,
          );

          // Write shared logs + finalize batch counters.
          await writeImportLogs(
            { projectId: project.id, batchId, userId: user?.id ?? null, subModule: adapter.subModule },
            result.outcomes,
            {
              totalRows: parsed.length,
              inserted: result.counters.inserted,
              updated: result.counters.updated,
              skipped: result.counters.skipped,
              rejected: result.counters.rejected,
            },
          );

          setFiles((cur) => cur.map((x) => x.id === f.id ? {
            ...x, status: 'done', progress: 100,
            unmatchedOrgs: [...result.counters.unmatchedOrgs],
            rejectSamples: result.rejectSamples,
            result: {
              inserted: result.counters.inserted,
              updated: result.counters.updated,
              skipped: result.counters.skipped,
              rejected: result.counters.rejected,
              unmatchedOrgs: result.counters.unmatchedOrgs.size,
              resubmissionsCreated: result.resubmissionsCreated,
              resubmissionsByStage: result.resubmissionsByStage,
            },
          } : x));
        } catch (error: any) {
          const e = fmtSupabaseError(error);
          setFiles((cur) => cur.map((x) => x.id === f.id ? {
            ...x, status: 'failed',
            error: e.message, errorCode: e.code, errorDetails: e.details, errorHint: e.hint,
          } : x));
        }
      }

      setIsRunning(false);
      toast({ title: 'Import complete', description: `${ready.length} file(s) processed.` });
    }, [files, isRunning, toast, user]);

    const value: DocsImportContextValue<TRow> = {
      subModule: adapter.subModule,
      keyFieldLabel: adapter.keyFieldLabel,
      dataDateRequired: adapter.dataDateRequired,
      rawDataPath: adapter.rawDataPath,
      files, isRunning, addFiles, removeFile, clearAll,
      setFileSheets, setFileDataDate, setFileExcludedHeaders, startImport,
    };

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  function useImporter(): DocsImportContextValue<TRow> {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error(`useImporter for ${adapter.subModule} must be used within its provider`);
    return ctx;
  }

  return { Provider, useImporter };
}
