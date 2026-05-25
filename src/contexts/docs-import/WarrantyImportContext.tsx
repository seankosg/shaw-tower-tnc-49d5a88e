// Warranty import context — independent of the shared Docs ABD/OMM pipeline
// because Warranty writes to its own tables (warranty_items / warranty_threads
// / warranty_upload_batches / warranty_change_log) and resolves Schedule R
// columns into subcontractor_info_master.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { fmtSupabaseError, getDefaultProject, todayIso } from '@/lib/docs-import-logging';
import {
  parseWarrantyExcel,
  getWarrantyExcelSheetNames,
  getWarrantyHeaderInfo,
  type ParsedWarrantyRow,
  type WarrantyThreadInput,
} from '@/lib/docs-warranty-import-parser';
import {
  applyDecisionsInPlace, detectEditDistanceDecisions, fetchSubMasterMaps, normalizeRowsAgainstMaster,
  type SimilarDecisionAction, type SimilarMasterDecision,
} from '@/lib/subcontractor-master-sync';

export type WarrantyFileStatus = 'pending' | 'parsing' | 'ready' | 'processing' | 'done' | 'failed';

export interface WarrantyImportFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: WarrantyFileStatus;
  progress: number;
  dataDate?: string;
  error?: string;
  errorCode?: string;
  errorDetails?: string;
  errorHint?: string;
  parsed?: ParsedWarrantyRow[];
  parsedCount: number;
  sheetNames?: string[];
  selectedSheets?: string[];
  availableHeaders?: string[];
  headerSamples?: Record<string, unknown>;
  fieldByHeader?: Record<string, string | null>;
  excludedHeaders?: string[];
  excludedFields?: Set<string>;
  validationError?: string | null;
  unknownHeaders?: string[];
  rejectSamples?: Array<{ rawRowNo: number; key: string; reason: string }>;
  emptyKeyCount?: number;
  duplicateKeyCount?: number;
  result?: {
    inserted: number;
    updated: number;
    skipped: number;
    rejected: number;
    threadsInserted: number;
    threadsUpdated: number;
    subconInfoUpserts: number;
  };
}

export interface WarrantyImportContextValue {
  subModule: 'warranty';
  keyFieldLabel: string;
  dataDateRequired: boolean;
  rawDataPath: string;
  files: WarrantyImportFile[];
  isRunning: boolean;
  addFiles: (selected: File[]) => Promise<void>;
  removeFile: (id: string) => void;
  clearAll: () => void;
  setFileSheets: (id: string, sheets: string[]) => Promise<void>;
  setFileDataDate: (id: string, dataDate: string) => void;
  setFileExcludedHeaders: (id: string, excluded: string[]) => Promise<void>;
  startImport: () => Promise<void>;
  similarDecisions: SimilarMasterDecision[];
  setDecisionAction: (key: string, action: SimilarDecisionAction) => void;
  confirmSimilarDecisions: () => Promise<void>;
  cancelSimilarDecisions: () => void;
}

const Ctx = createContext<WarrantyImportContextValue | null>(null);

function validateHeaders(file: WarrantyImportFile): string | null {
  const fbh = file.fieldByHeader;
  if (!fbh || Object.keys(fbh).length === 0) return null;
  const matched = Object.entries(fbh).filter(([, f]) => f === 'item_no').map(([h]) => h);
  if (matched.length === 0) {
    return 'No column maps to "No" (item number). Warranty rows are identified by their No column.';
  }
  const excluded = new Set(file.excludedHeaders ?? []);
  if (matched.every((h) => excluded.has(h))) {
    return '"No" column is currently excluded via Select Columns. Re-include it before import.';
  }
  return null;
}

export function WarrantyImportProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<WarrantyImportFile[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const parseAndApply = useCallback(async (id: string, file: File, sheets?: string[], excludedHeaders?: string[]) => {
    try {
      const parsed = await parseWarrantyExcel(file, sheets, { excludedHeaders });
      setFiles((cur) => cur.map((f) => {
        if (f.id !== id) return f;
        const next: WarrantyImportFile = {
          ...f,
          status: 'ready',
          parsed: parsed.rows,
          parsedCount: parsed.rows.length,
          unknownHeaders: parsed.unknownHeaders,
          excludedFields: parsed.excludedFields,
        };
        next.validationError = validateHeaders(next);
        return next;
      }));
    } catch (error) {
      setFiles((cur) => cur.map((f) => f.id === id ? {
        ...f, status: 'failed',
        error: error instanceof Error ? error.message : 'Parse failed',
      } : f));
    }
  }, []);

  const addFiles = useCallback(async (selected: File[]) => {
    const excelFiles = selected.filter((f) => /\.(xlsx|xls)$/i.test(f.name));
    const next: WarrantyImportFile[] = excelFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file, name: file.name, size: file.size,
      status: 'parsing', progress: 0, parsedCount: 0,
      dataDate: todayIso(),
    }));
    setFiles((cur) => [...cur, ...next]);
    for (const item of next) {
      try {
        const sheetNames = await getWarrantyExcelSheetNames(item.file);
        let availableHeaders: string[] = [];
        let headerSamples: Record<string, unknown> = {};
        let fieldByHeader: Record<string, string | null> = {};
        try {
          const info = await getWarrantyHeaderInfo(item.file, sheetNames);
          availableHeaders = info.headers;
          headerSamples = info.samples;
          fieldByHeader = info.fieldByHeader;
        } catch {/* ignore */}
        setFiles((cur) => cur.map((f) => f.id === item.id ? {
          ...f, sheetNames, selectedSheets: sheetNames, availableHeaders, headerSamples, fieldByHeader,
        } : f));
        await parseAndApply(item.id, item.file, sheetNames);
      } catch (error) {
        setFiles((cur) => cur.map((f) => f.id === item.id ? {
          ...f, status: 'failed',
          error: error instanceof Error ? error.message : 'Failed to read workbook',
        } : f));
      }
    }
  }, [parseAndApply]);

  const removeFile = useCallback((id: string) => setFiles((cur) => cur.filter((f) => f.id !== id)), []);
  const clearAll = useCallback(() => setFiles([]), []);

  const setFileSheets = useCallback(async (id: string, sheets: string[]) => {
    let target: WarrantyImportFile | undefined;
    setFiles((cur) => {
      target = cur.find((f) => f.id === id);
      return cur.map((f) => f.id === id ? { ...f, status: 'parsing', selectedSheets: sheets, excludedHeaders: [], excludedFields: undefined } : f);
    });
    if (!target) return;
    await parseAndApply(id, target.file, sheets, []);
  }, [parseAndApply]);

  const setFileDataDate = useCallback((id: string, dataDate: string) => {
    setFiles((cur) => cur.map((f) => f.id === id ? { ...f, dataDate } : f));
  }, []);

  const setFileExcludedHeaders = useCallback(async (id: string, excluded: string[]) => {
    let target: WarrantyImportFile | undefined;
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
    const blocked = ready.filter((f) => f.validationError);
    if (blocked.length > 0) {
      toast({
        title: 'Cannot start import',
        description: blocked[0].validationError ?? 'Validation failed',
        variant: 'destructive',
      });
      return;
    }
    setIsRunning(true);

    let project: { id: string };
    try {
      project = await getDefaultProject();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Project lookup failed';
      toast({ title: 'Project required', description: msg, variant: 'destructive' });
      setIsRunning(false);
      return;
    }

    // Pre-load subcontractor master to map names → ids.
    const { data: subRows } = await (supabase as any)
      .from('subcontractor_master')
      .select('id, name, type')
      .eq('is_active', true)
      .eq('type', 'sub');
    const subByName = new Map<string, string>();
    for (const s of subRows ?? []) {
      if (s?.name) subByName.set(String(s.name).trim().toLowerCase(), s.id);
    }

    for (const f of ready) {
      const parsed = f.parsed!;
      // Pre-pass duplicate / empty key detection
      let emptyKey = 0;
      const seen = new Set<number>();
      let dupCount = 0;
      for (const r of parsed) {
        if (r.item_no == null) { emptyKey++; continue; }
        if (seen.has(r.item_no)) dupCount++; else seen.add(r.item_no);
      }
      setFiles((cur) => cur.map((x) => x.id === f.id ? {
        ...x, status: 'processing', progress: 0,
        emptyKeyCount: emptyKey, duplicateKeyCount: dupCount,
        rejectSamples: [], errorCode: undefined, errorDetails: undefined, errorHint: undefined, error: undefined,
      } : x));

      try {
        // Create batch row
        const { data: batch, error: batchErr } = await (supabase as any)
          .from('warranty_upload_batches').insert({
            project_id: project.id,
            uploaded_by: user?.id ?? null,
            source_filename: f.name,
            data_date: f.dataDate || todayIso(),
            total_rows: parsed.length,
          }).select('id').single();
        if (batchErr || !batch) throw batchErr ?? new Error('Failed to create batch');
        const batchId = batch.id as string;

        // Load existing items for upsert (include all tracked fields for change-log diffing).
        const TRACKED_FIELDS = [
          'category','warranted_item','team','warranty_period_years','contract_spec_ref',
          'subcontractor_name','subcontractor_id','hdec_pic_name','hdec_eng_name',
          'r_works_description','r_acra_reg_no','r_acra_address','r_subcontract_date',
          'r_brief_description','r_director_1','r_director_2','r_witness','acra_info_status',
          'draft_planned_date','draft_actual_date','draft_response_planned_date','draft_response_actual_date','draft_status',
          'subcon_signing_planned_date','subcon_signing_actual_date','subcon_signing_status',
          'hdec_signing_planned_date','hdec_signing_actual_date','hdec_signing_status',
          'final_planned_date','final_actual_date','final_status','remarks',
        ] as const;
        const { data: existingRows } = await (supabase as any)
          .from('warranty_items')
          .select(['id','item_no','raw_payload', ...TRACKED_FIELDS].join(','))
          .eq('project_id', project.id)
          .eq('is_active', true)
          .is('parent_id', null);
        const existingByNo = new Map<number, any>();
        for (const r of existingRows ?? []) {
          if (r.item_no != null) existingByNo.set(r.item_no, r);
        }

        let inserted = 0, updated = 0, skipped = 0, rejected = 0;
        let threadsInserted = 0, threadsUpdated = 0, subconInfoUpserts = 0;
        const rejectSamples: WarrantyImportFile['rejectSamples'] = [];
        const rowLogs: any[] = [];
        const changeLogs: any[] = [];
        const stringify = (v: unknown): string | null => {
          if (v == null || v === '') return null;
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          return String(v);
        };

        const onProgress = (i: number) => {
          const pct = Math.round((i / parsed.length) * 100);
          setFiles((cur) => cur.map((x) => x.id === f.id ? { ...x, progress: pct } : x));
        };

        for (let i = 0; i < parsed.length; i++) {
          const row = parsed[i];
          if (row.item_no == null) {
            skipped++;
            rowLogs.push({ upload_id: batchId, row_no: row.rawRowNo, item_no: null, status: 'skipped', message: 'Empty No' });
            continue;
          }
          const subId = row.subcontractor_name
            ? subByName.get(row.subcontractor_name.trim().toLowerCase()) ?? null
            : null;

          const payload: Record<string, unknown> = {
            project_id: project.id,
            item_no: row.item_no,
            category: row.category,
            warranted_item: row.warranted_item,
            team: row.team,
            warranty_period_years: row.warranty_period_years,
            contract_spec_ref: row.contract_spec_ref,
            subcontractor_name: row.subcontractor_name,
            subcontractor_id: subId,
            hdec_pic_name: row.hdec_pic_name,
            hdec_eng_name: row.hdec_eng_name,
            r_works_description: row.r_works_description,
            r_acra_reg_no: row.r_acra_reg_no,
            r_acra_address: row.r_acra_address,
            r_subcontract_date: row.r_subcontract_date,
            r_brief_description: row.r_brief_description,
            r_director_1: row.r_director_1,
            r_director_2: row.r_director_2,
            r_witness: row.r_witness,
            acra_info_status: row.acra_info_status,
            draft_planned_date: row.draft_planned_date,
            draft_actual_date: row.draft_actual_date,
            draft_response_planned_date: row.draft_response_planned_date,
            draft_response_actual_date: row.draft_response_actual_date,
            draft_status: row.draft_status,
            subcon_signing_planned_date: row.subcon_signing_planned_date,
            subcon_signing_actual_date: row.subcon_signing_actual_date,
            subcon_signing_status: row.subcon_signing_status,
            hdec_signing_planned_date: row.hdec_signing_planned_date,
            hdec_signing_actual_date: row.hdec_signing_actual_date,
            hdec_signing_status: row.hdec_signing_status,
            final_planned_date: row.final_planned_date,
            final_actual_date: row.final_actual_date,
            final_status: row.final_status,
            remarks: row.remarks,
            raw_payload: row.raw_payload,
            data_source_type: 'excel_import',
            source_upload_id: batchId,
            updated_by: user?.id ?? null,
          };

          // Drop excluded fields on update branch later.
          const excludedFields = f.excludedFields ?? new Set<string>();

          const existing = existingByNo.get(row.item_no);
          let recordId: string | null = null;
          try {
            if (existing) {
              const updatePayload: Record<string, unknown> = { ...payload };
              for (const ex of excludedFields) delete updatePayload[ex];
              const prevRaw = (existing.raw_payload && typeof existing.raw_payload === 'object')
                ? existing.raw_payload as Record<string, unknown>
                : {};
              updatePayload.raw_payload = { ...prevRaw, ...row.raw_payload };
              const { error } = await (supabase as any)
                .from('warranty_items').update(updatePayload).eq('id', existing.id);
              if (error) throw error;
              recordId = existing.id;
              updated++;
              rowLogs.push({ upload_id: batchId, row_no: row.rawRowNo, item_no: row.item_no, status: 'updated' });
              // Diff tracked fields → docs_change_log
              for (const fld of TRACKED_FIELDS) {
                if (excludedFields.has(fld)) continue;
                if (!(fld in updatePayload)) continue;
                const oldV = stringify(existing[fld]);
                const newV = stringify(updatePayload[fld]);
                if (oldV !== newV) {
                  changeLogs.push({
                    sub_module: 'warranty', record_id: existing.id,
                    changed_field: fld, old_value: oldV, new_value: newV,
                    change_source: 'excel_import', upload_id: batchId,
                    changed_by: user?.id ?? null,
                  });
                }
              }
            } else {
              const { data: ins, error } = await (supabase as any)
                .from('warranty_items').insert({ ...payload, created_by: user?.id ?? null }).select('id').single();
              if (error) throw error;
              recordId = ins?.id ?? null;
              inserted++;
              rowLogs.push({ upload_id: batchId, row_no: row.rawRowNo, item_no: row.item_no, status: 'inserted' });
              if (recordId) {
                for (const fld of TRACKED_FIELDS) {
                  const newV = stringify((payload as any)[fld]);
                  if (newV == null) continue;
                  changeLogs.push({
                    sub_module: 'warranty', record_id: recordId,
                    changed_field: fld, old_value: null, new_value: newV,
                    change_source: 'excel_import', upload_id: batchId,
                    changed_by: user?.id ?? null,
                  });
                }
              }
            }
          } catch (err: any) {
            rejected++;
            const e = fmtSupabaseError(err);
            const reason = [e.code, e.message, e.details].filter(Boolean).join(' | ');
            rowLogs.push({ upload_id: batchId, row_no: row.rawRowNo, item_no: row.item_no, status: 'rejected', message: reason });
            if (rejectSamples!.length < 5) {
              rejectSamples!.push({ rawRowNo: row.rawRowNo, key: String(row.item_no), reason });
            }
            continue;
          }

          // Schedule R → subcontractor_info_master upsert (only if we have a subcontractor_id).
          if (subId && (row.r_acra_reg_no || row.r_acra_address || row.r_director_1 || row.r_director_2 || row.r_witness || row.r_subcontract_date)) {
            try {
              const { data: existingInfo } = await (supabase as any)
                .from('subcontractor_info_master').select('id').eq('subcontractor_id', subId).maybeSingle();
              const infoPayload: Record<string, unknown> = {
                subcontractor_id: subId,
                acra_reg_no: row.r_acra_reg_no,
                acra_address: row.r_acra_address,
                default_director_1: row.r_director_1,
                default_director_2: row.r_director_2,
                default_witness: row.r_witness,
                last_subcontract_date: row.r_subcontract_date,
                updated_by: user?.id ?? null,
              };
              if (existingInfo?.id) {
                await (supabase as any).from('subcontractor_info_master').update(infoPayload).eq('id', existingInfo.id);
              } else {
                await (supabase as any).from('subcontractor_info_master').insert(infoPayload);
              }
              subconInfoUpserts++;
            } catch (e) {
              console.warn('[warranty-import] subcon_info upsert failed', e);
            }
          }

          // Threads — upsert by (warranty_item_id, thread_label).
          if (recordId && row.threads.length > 0) {
            for (const t of row.threads) {
              try {
                const { data: existingThread } = await (supabase as any)
                  .from('warranty_threads').select('id')
                  .eq('warranty_item_id', recordId).eq('thread_label', t.thread_label).maybeSingle();
                const threadPayload: Record<string, unknown> = {
                  warranty_item_id: recordId,
                  project_id: project.id,
                  thread_date: t.thread_date,
                  thread_label: t.display_label || t.thread_label,
                  action_party: t.action_party,
                  content: t.content,
                  sort_order: t.sort_order,
                  source_upload_id: batchId,
                  updated_by: user?.id ?? null,
                };
                if (existingThread?.id) {
                  await (supabase as any).from('warranty_threads').update(threadPayload).eq('id', existingThread.id);
                  threadsUpdated++;
                } else {
                  await (supabase as any).from('warranty_threads').insert({ ...threadPayload, created_by: user?.id ?? null });
                  threadsInserted++;
                }
              } catch (e) {
                console.warn('[warranty-import] thread upsert failed', e);
              }
            }
          }

          if ((i + 1) % 10 === 0 || i === parsed.length - 1) onProgress(i + 1);
        }

        // Persist row logs in chunks.
        for (let i = 0; i < rowLogs.length; i += 200) {
          const chunk = rowLogs.slice(i, i + 200);
          await (supabase as any).from('warranty_upload_row_logs').insert(chunk);
        }

        // Persist Change History (docs_change_log) in chunks of 500.
        for (let i = 0; i < changeLogs.length; i += 500) {
          const chunk = changeLogs.slice(i, i + 500);
          const { error: clErr } = await (supabase as any).from('docs_change_log').insert(chunk);
          if (clErr) console.warn('[warranty-import] docs_change_log insert failed', clErr);
        }

        // Finalize batch counters.
        await (supabase as any).from('warranty_upload_batches').update({
          processed_rows: parsed.length,
          inserted_rows: inserted,
          updated_rows: updated,
          rejected_rows: rejected,
        }).eq('id', batchId);

        setFiles((cur) => cur.map((x) => x.id === f.id ? {
          ...x, status: 'done', progress: 100,
          rejectSamples,
          result: { inserted, updated, skipped, rejected, threadsInserted, threadsUpdated, subconInfoUpserts },
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
    toast({ title: 'Warranty import complete', description: `${ready.length} file(s) processed.` });
  }, [files, isRunning, toast, user]);

  const value: WarrantyImportContextValue = {
    subModule: 'warranty',
    keyFieldLabel: 'No',
    dataDateRequired: false,
    rawDataPath: '/docs/warranty',
    files, isRunning, addFiles, removeFile, clearAll,
    setFileSheets, setFileDataDate, setFileExcludedHeaders, startImport,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWarrantyImport(): WarrantyImportContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWarrantyImport must be used within WarrantyImportProvider');
  return ctx;
}

// Reuse the type so external imports stay clean.
export type { ParsedWarrantyRow, WarrantyThreadInput };
