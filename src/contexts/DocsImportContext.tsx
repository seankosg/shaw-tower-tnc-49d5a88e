import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDocsExcelSheetNames,
  parseDocsExcel,
  type ParsedDocsRow,
} from '@/lib/docs-import-parser';

const CONCURRENCY = 8;

export type DocsFileStatus = 'pending' | 'parsing' | 'ready' | 'processing' | 'done' | 'failed';

export interface DocsRejectSample {
  rawRowNo?: number;
  documentNo?: string;
  reasonCode?: string;
  reasonDetail?: string;
}

export interface DocsImportFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: DocsFileStatus;
  progress: number;
  /** Reference "today" used for cycle delay calculations. Defaults to today; user-editable. */
  dataDate?: string;
  error?: string;
  errorCode?: string;
  errorDetails?: string;
  errorHint?: string;
  parsed?: ParsedDocsRow[];
  parsedCount: number;
  sheetNames?: string[];
  /** User-selected sheets (default = all). */
  selectedSheets?: string[];
  unknownHeaders?: string[];
  unmatchedOrgs?: string[];
  rejectSamples?: DocsRejectSample[];
  emptyDocNoCount?: number;
  duplicateDocNoCount?: number;
  result?: {
    inserted: number;
    updated: number;
    skipped: number;
    rejected: number;
    unmatchedOrgs: number;
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtSupabaseError(err: any): { message: string; code?: string; details?: string; hint?: string } {
  if (!err) return { message: 'Unknown error' };
  if (err instanceof Error) return { message: err.message };
  return {
    message: err.message ?? String(err),
    code: err.code,
    details: err.details,
    hint: err.hint,
  };
}

interface DocsImportContextValue {
  files: DocsImportFile[];
  isRunning: boolean;
  addFiles: (selected: File[]) => Promise<void>;
  removeFile: (id: string) => void;
  clearAll: () => void;
  setFileSheets: (id: string, sheets: string[]) => Promise<void>;
  setFileDataDate: (id: string, dataDate: string) => void;
  startImport: () => Promise<void>;
}

const DocsImportContext = createContext<DocsImportContextValue | null>(null);

export function useDocsImport() {
  const ctx = useContext(DocsImportContext);
  if (!ctx) throw new Error('useDocsImport must be used within DocsImportProvider');
  return ctx;
}

function normalizeOrgKey(value: string | null | undefined): string {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

interface OrgResolverMaps {
  aliasByLabel: Map<string, string | null>;          // raw_label (lower) → subcontractor_id
  subcontractorByName: Map<string, string>;          // name (lower) → subcontractor_id
}

async function buildOrgResolver(): Promise<OrgResolverMaps> {
  const aliasByLabel = new Map<string, string | null>();
  const subcontractorByName = new Map<string, string>();

  const [aliasRes, subRes] = await Promise.all([
    (supabase as any).from('docs_org_alias').select('raw_label, subcontractor_id').eq('is_active', true),
    (supabase as any).from('subcontractor_master').select('id, name').eq('is_active', true),
  ]);

  for (const a of aliasRes.data ?? []) {
    aliasByLabel.set(normalizeOrgKey(a.raw_label), a.subcontractor_id ?? null);
  }
  for (const s of subRes.data ?? []) {
    subcontractorByName.set(normalizeOrgKey(s.name), s.id);
  }
  return { aliasByLabel, subcontractorByName };
}

function resolveSubcontractorId(rawOrg: string | null, maps: OrgResolverMaps): string | null {
  if (!rawOrg) return null;
  const key = normalizeOrgKey(rawOrg);
  if (!key) return null;
  if (maps.aliasByLabel.has(key)) return maps.aliasByLabel.get(key) ?? null;
  if (maps.subcontractorByName.has(key)) return maps.subcontractorByName.get(key) ?? null;
  return null;
}

interface ProjectInfo {
  id: string;
}

async function getDefaultProject(): Promise<ProjectInfo> {
  // Verify the Supabase client actually has an authenticated session.
  // RLS policies on `projects` (and other tables used by the import) require
  // role = authenticated. Without a session, queries silently return 0 rows,
  // which previously surfaced as a misleading "No active project found" error.
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    throw new Error(
      'Not signed in. Please log in (admin/superuser) and retry the import. ' +
      'Background queries to projects/docs tables are blocked by RLS without a session.',
    );
  }

  const { data, error } = await (supabase as any)
    .from('projects')
    .select('id, project_code, project_name')
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Project lookup failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(
      'No active project found. Ask an admin to create/activate a project ' +
      `(signed in as ${session.user?.email ?? 'unknown'}).`,
    );
  }
  if (data.length > 1) {
    throw new Error(`Multiple active projects found (${data.length}). Please configure a default project.`);
  }
  return { id: data[0].id };
}

async function loadExistingDrawings(projectId: string): Promise<Map<string, { id: string; raw_payload: any }>> {
  const map = new Map<string, { id: string; raw_payload: any }>();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await (supabase as any)
      .from('docs_drawings')
      .select('id, document_no, raw_payload')
      .eq('project_id', projectId)
      .eq('sub_module', 'as_built')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      map.set(row.document_no, { id: row.id, raw_payload: row.raw_payload });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

/** Run an array of async jobs with bounded concurrency. */
async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;
  async function pump() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => pump()));
  return results;
}

export function DocsImportProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<DocsImportFile[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const parseAndApply = useCallback(async (id: string, file: File, sheets?: string[]) => {
    try {
      const parsed = await parseDocsExcel(file, sheets);
      setFiles((current) => current.map((f) => f.id === id ? {
        ...f,
        status: 'ready',
        parsed: parsed.rows,
        parsedCount: parsed.rows.length,
        unknownHeaders: parsed.unknownHeaders,
      } : f));
    } catch (error) {
      setFiles((current) => current.map((f) => f.id === id ? {
        ...f,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Parse failed',
      } : f));
    }
  }, []);

  const addFiles = useCallback(async (selected: File[]) => {
    const excelFiles = selected.filter((f) => /\.(xlsx|xls)$/i.test(f.name));
    const next: DocsImportFile[] = excelFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      name: file.name,
      size: file.size,
      status: 'parsing',
      progress: 0,
      parsedCount: 0,
    }));
    setFiles((cur) => [...cur, ...next]);

    for (const item of next) {
      try {
        const sheetNames = await getDocsExcelSheetNames(item.file);
        setFiles((cur) => cur.map((f) => f.id === item.id ? {
          ...f,
          sheetNames,
          selectedSheets: sheetNames,
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
    let target: DocsImportFile | undefined;
    setFiles((cur) => {
      target = cur.find((f) => f.id === id);
      return cur.map((f) => f.id === id ? { ...f, status: 'parsing', selectedSheets: sheets } : f);
    });
    if (!target) return;
    await parseAndApply(id, target.file, sheets);
  }, [parseAndApply]);

  const startImport = useCallback(async () => {
    if (isRunning) return;
    const ready = files.filter((f) => f.status === 'ready' && f.parsed && f.parsed.length > 0);
    if (ready.length === 0) {
      toast({ title: 'Nothing to import', description: 'Please add and parse files first.', variant: 'destructive' });
      return;
    }
    setIsRunning(true);

    let project: ProjectInfo;
    try {
      project = await getDefaultProject();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Project lookup failed';
      toast({ title: 'Project required', description: msg, variant: 'destructive' });
      setFiles((cur) => cur.map((x) => ready.find((r) => r.id === x.id) ? { ...x, status: 'failed', error: msg } : x));
      setIsRunning(false);
      return;
    }

    const orgMaps = await buildOrgResolver();

    for (const f of ready) {
      const emptyDocNo = f.parsed!.filter((r) => !r.document_no || !String(r.document_no).trim()).length;
      const seen = new Set<string>();
      let dupCount = 0;
      for (const r of f.parsed!) {
        const k = String(r.document_no ?? '').trim();
        if (!k) continue;
        if (seen.has(k)) dupCount++;
        else seen.add(k);
      }
      setFiles((cur) => cur.map((x) => x.id === f.id ? {
        ...x, status: 'processing', progress: 0,
        emptyDocNoCount: emptyDocNo, duplicateDocNoCount: dupCount,
        rejectSamples: [], errorCode: undefined, errorDetails: undefined, errorHint: undefined, error: undefined,
      } : x));

      try {
        const existingByDocNo = await loadExistingDrawings(project.id);

        const { data: batchData, error: batchErr } = await (supabase as any)
          .from('docs_upload_batches')
          .insert({
            project_id: project.id,
            sub_module: 'as_built',
            uploaded_file_name: f.name,
            uploaded_by: user?.id ?? null,
            data_date: new Date().toISOString().slice(0, 10),
            total_rows: f.parsed!.length,
            status: 'processing',
          })
          .select('id')
          .single();
        if (batchErr || !batchData) {
          const e = fmtSupabaseError(batchErr);
          throw Object.assign(new Error(`Failed to create upload batch: ${e.message}`), e);
        }
        const batchId = batchData.id as string;

        const counters = { inserted: 0, updated: 0, skipped: 0, rejected: 0, unmatched: new Set<string>() };
        const rowLogs: any[] = [];
        const rejectSamples: DocsRejectSample[] = [];
        let processed = 0;

        await runWithConcurrency(f.parsed!, async (row) => {
          const subId = resolveSubcontractorId(row.organisation_raw, orgMaps);
          if (row.organisation_raw && !subId) counters.unmatched.add(normalizeOrgKey(row.organisation_raw));

          if (!row.document_no || !String(row.document_no).trim()) {
            counters.skipped++;
            rowLogs.push({
              upload_id: batchId, raw_row_no: row.rawRowNo, document_no: null,
              action_taken: 'skipped', reason_code: 'empty_document_no',
              reason_detail: 'Document No is empty',
            });
            processed++;
            return;
          }

          const existing = existingByDocNo.get(row.document_no);
          const payload: Record<string, unknown> = {
            project_id: project.id,
            sub_module: 'as_built',
            document_no: row.document_no,
            revision: row.revision,
            title: row.title,
            organisation_raw: row.organisation_raw,
            subcontractor_id: subId,
            discipline: row.discipline,
            document_type: row.document_type,
            series: row.series,
            level_location: row.level_location,
            sequential_no: row.sequential_no,
            current_status: row.current_status,
            aconex_status: row.aconex_status,
            is_submitted: row.is_submitted,
            submitted_date: row.submitted_date,
            approved_date: row.approved_date,
            sub1_planned_date: row.sub1_planned_date,
            sub1_submission_date: row.sub1_submission_date,
            sub1_approval_date: row.sub1_approval_date,
            sub1_approval_status: row.sub1_approval_status,
            sub2_planned_date: row.sub2_planned_date,
            sub2_submission_date: row.sub2_submission_date,
            sub2_approval_date: row.sub2_approval_date,
            sub2_approval_status: row.sub2_approval_status,
            sub3_planned_date: row.sub3_planned_date,
            sub3_submission_date: row.sub3_submission_date,
            sub3_approval_date: row.sub3_approval_date,
            sub3_approval_status: row.sub3_approval_status,
            transmittal_number: row.transmittal_number,
            transmittal_due_date: row.transmittal_due_date,
            days_due: row.days_due,
            sheet_name: row.sheetName,
            row_no: row.rawRowNo,
            remarks: row.remarks,
            hdec_pic_name: row.hdec_pic_name,
            hdec_eng_name: row.hdec_eng_name,
            subcontractor_name: row.subcontractor_name,
            raw_payload: row.raw_payload,
            source_upload_id: batchId,
            data_source_type: 'excel_import',
            updated_by: user?.id ?? null,
          };

          try {
            if (existing) {
              const { error } = await (supabase as any)
                .from('docs_drawings')
                .update(payload)
                .eq('id', existing.id);
              if (error) throw error;
              counters.updated++;
              rowLogs.push({ upload_id: batchId, raw_row_no: row.rawRowNo, document_no: row.document_no, action_taken: 'updated' });
            } else {
              const { error } = await (supabase as any)
                .from('docs_drawings')
                .insert(payload);
              if (error) throw error;
              counters.inserted++;
              rowLogs.push({ upload_id: batchId, raw_row_no: row.rawRowNo, document_no: row.document_no, action_taken: 'inserted' });
            }
          } catch (err: any) {
            counters.rejected++;
            const e = fmtSupabaseError(err);
            const detail = [e.code, e.message, e.details, e.hint].filter(Boolean).join(' | ');
            rowLogs.push({
              upload_id: batchId, raw_row_no: row.rawRowNo, document_no: row.document_no,
              action_taken: 'rejected', reason_code: e.code ?? 'db_error', reason_detail: detail,
            });
            if (rejectSamples.length < 5) {
              rejectSamples.push({ rawRowNo: row.rawRowNo, documentNo: row.document_no, reasonCode: e.code, reasonDetail: detail });
            }
          }
          processed++;
          if (processed % 25 === 0 || processed === f.parsed!.length) {
            const pct = Math.round((processed / f.parsed!.length) * 100);
            setFiles((cur) => cur.map((x) => x.id === f.id ? { ...x, progress: pct } : x));
          }
        }, CONCURRENCY);

        for (let i = 0; i < rowLogs.length; i += 500) {
          const { error: logErr } = await (supabase as any)
            .from('docs_upload_row_logs')
            .insert(rowLogs.slice(i, i + 500));
          if (logErr) console.warn('docs_upload_row_logs insert failed:', logErr);
        }

        await (supabase as any)
          .from('docs_upload_batches')
          .update({
            status: 'completed',
            processed_rows: f.parsed!.length,
            success_rows: counters.inserted + counters.updated,
            skipped_rows: counters.skipped,
            rejected_rows: counters.rejected,
          })
          .eq('id', batchId);

        if (counters.unmatched.size > 0) {
          const rawByKey = new Map<string, string>();
          for (const row of f.parsed!) {
            if (!row.organisation_raw) continue;
            const key = normalizeOrgKey(row.organisation_raw);
            if (counters.unmatched.has(key) && !rawByKey.has(key)) {
              rawByKey.set(key, row.organisation_raw.trim());
            }
          }
          const aliasRows = [...rawByKey.values()].map((raw_label) => ({
            raw_label, subcontractor_id: null, is_active: true,
          }));
          if (aliasRows.length > 0) {
            await (supabase as any)
              .from('docs_org_alias')
              .upsert(aliasRows, { onConflict: 'raw_label', ignoreDuplicates: true });
          }
        }

        setFiles((cur) => cur.map((x) => x.id === f.id ? {
          ...x, status: 'done', progress: 100,
          unmatchedOrgs: [...counters.unmatched],
          rejectSamples,
          result: {
            inserted: counters.inserted, updated: counters.updated,
            skipped: counters.skipped, rejected: counters.rejected,
            unmatchedOrgs: counters.unmatched.size,
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

  return (
    <DocsImportContext.Provider value={{ files, isRunning, addFiles, removeFile, clearAll, setFileSheets, startImport }}>
      {children}
    </DocsImportContext.Provider>
  );
}
