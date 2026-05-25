import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { detectImportType, getExcelSheetNames, normalizeHeader, parseExcelFile, parseLegacy, parseStandard, resolveValue, type DetectedImportType, type ParsedSubtest } from '@/lib/import-parser';
import { useToast } from '@/hooks/use-toast';
import { buildScheduleChangeImpact, hasScheduleChangeImpact } from '@/lib/schedule-change-utils';
import { derivePlanFromT2 } from '@/lib/business-days';
import { SUBTEST_ACTUAL_DATE_FIELDS, type SubtestActualDateField } from '@/lib/defect-date-validation';
import { buildFieldLog, type PendingFieldLog } from '@/lib/import-field-log';
import {
  applyDecisionsInPlace, detectEditDistanceDecisions, fetchSubMasterMaps, normalizeRowsAgainstMaster,
  type SimilarDecisionAction, type SimilarMasterDecision,
} from '@/lib/subcontractor-master-sync';

export type ImportType = 'legacy' | 'standard';
export type FileStatus = 'pending' | 'parsing' | 'pending_sheet_selection' | 'ready' | 'processing' | 'done' | 'failed';

export interface ImportFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: FileStatus;
  parsedCount: number;
  progress: number;
  result?: { inserted: number; updated: number; skipped: number; rejected: number };
  error?: string;
  parsed?: ParsedSubtest[];
  unmappedHeaders?: string[];
  detectedImportType?: DetectedImportType;
  detectionReasons?: string[];
  dataDate?: string;
  team?: string;
  /** All sheet names in the workbook. Set when 2+ sheets exist; user must pick one. */
  sheetNames?: string[];
  /** Currently selected sheet (set after user picks, or auto-set when only 1 sheet). */
  selectedSheet?: string;
  /** Cached buffer for re-parsing on sheet change. */
  buffer?: ArrayBuffer;
  /** All raw header strings present in the chosen sheet (for column-select dialog). */
  availableHeaders?: string[];
  /** First data row (header → value) used as preview in column-select dialog. */
  headerSamples?: Record<string, unknown>;
  /** User-excluded raw headers. Default: []. */
  excludedHeaders?: string[];
  /** Canonical field names excluded from this import (derived from excludedHeaders).
   *  Importer skips writes / change detection / field-logs for these fields. */
  excludedFields?: Set<string>;
}

interface ImportContextValue {
  files: ImportFileItem[];
  isRunning: boolean;
  currentIndex: number;
  similarDecisions: SimilarMasterDecision[];
  addFiles: (files: File[]) => Promise<void>;
  removeFile: (id: string) => void;
  clearAll: () => void;
  startImport: () => Promise<void>;
  setFileDataDate: (id: string, date: string) => void;
  setFileTeam: (id: string, team: string) => void;
  setFileSheet: (id: string, sheetName: string) => Promise<void>;
  setFileExcludedHeaders: (id: string, excluded: string[]) => void;
  setDecisionAction: (key: string, action: SimilarDecisionAction) => void;
  confirmSimilarDecisions: () => Promise<void>;
  cancelSimilarDecisions: () => void;
}

const ImportContext = createContext<ImportContextValue | null>(null);

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error('useImport must be used within ImportProvider');
  return ctx;
}

export function ImportProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [files, setFiles] = useState<ImportFileItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const updateFile = (id: string, patch: Partial<ImportFileItem>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  };

  /** Parse a given sheet from a buffer and update file state accordingly. */
  const parseAndApply = useCallback((id: string, buf: ArrayBuffer, sheetName?: string) => {
    try {
      const { rows, rawHeaders, mappedHeaders, unmappedHeaders, resolvedSheetName } = parseExcelFile(buf, sheetName);
      const detection = detectImportType(mappedHeaders);
      const subtests = detection.type === 'legacy' ? parseLegacy(rows) : detection.type === 'standard' ? parseStandard(rows) : [];
      const effectiveSheet = resolvedSheetName ?? sheetName;
      // Build header preview: only headers with a non-empty raw label are kept;
      // sample = first data row's value for each header (best-effort).
      const availableHeaders = rawHeaders.filter(h => String(h ?? '').trim() !== '');
      const headerSamples: Record<string, unknown> = {};
      if (rows.length > 0) {
        const firstRow = rows[0];
        for (let i = 0; i < rawHeaders.length; i++) {
          const raw = rawHeaders[i];
          if (!raw) continue;
          const mapped = mappedHeaders[i];
          headerSamples[raw] = firstRow[mapped] ?? '';
        }
      }
      if (subtests.length === 0) {
        updateFile(id, {
          status: 'failed',
          error: detection.type === 'unknown' ? 'Unknown import format' : 'No valid rows found',
          unmappedHeaders,
          detectedImportType: detection.type,
          detectionReasons: detection.reasons,
          selectedSheet: effectiveSheet,
          availableHeaders,
          headerSamples,
        });
      } else {
        updateFile(id, {
          status: 'ready',
          parsedCount: subtests.length,
          parsed: subtests,
          unmappedHeaders,
          detectedImportType: detection.type,
          detectionReasons: detection.reasons,
          selectedSheet: effectiveSheet,
          availableHeaders,
          headerSamples,
          error: undefined,
        });
      }
    } catch (e: any) {
      updateFile(id, { status: 'failed', error: e.message });
    }
  }, []);

  const addFiles = useCallback(async (newFiles: File[]) => {
    const today = new Date().toISOString().slice(0, 10);
    const items: ImportFileItem[] = newFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
      size: file.size,
      status: 'parsing',
      parsedCount: 0,
      progress: 0,
      dataDate: today,
    }));
    setFiles(prev => [...prev, ...items]);

    for (const item of items) {
      try {
        const buf = await item.file.arrayBuffer();
        const sheetNames = getExcelSheetNames(buf);
        // Stash buffer for potential re-parse on sheet change
        updateFile(item.id, { buffer: buf, sheetNames });

        if (sheetNames.length > 1) {
          // Multiple sheets — wait for user to pick one
          updateFile(item.id, { status: 'pending_sheet_selection' });
          continue;
        }
        // 0 or 1 sheet — parse first sheet directly
        parseAndApply(item.id, buf, sheetNames[0]);
      } catch (e: any) {
        updateFile(item.id, { status: 'failed', error: e.message });
      }
    }
  }, [parseAndApply]);

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    setFiles([]);
    setCurrentIndex(-1);
  };

  const setFileDataDate = (id: string, date: string) => {
    updateFile(id, { dataDate: date });
  };

  const setFileTeam = (id: string, team: string) => {
    updateFile(id, { team });
  };

  const setFileSheet = useCallback(async (id: string, sheetName: string) => {
    const target = files.find(f => f.id === id);
    if (!target) return;
    let buf = target.buffer;
    if (!buf) {
      try {
        buf = await target.file.arrayBuffer();
        updateFile(id, { buffer: buf });
      } catch (e: any) {
        updateFile(id, { status: 'failed', error: e.message });
        return;
      }
    }
    // Sheet change → headers may differ → reset excludedHeaders.
    updateFile(id, { status: 'parsing', selectedSheet: sheetName, excludedHeaders: [], excludedFields: undefined });
    parseAndApply(id, buf, sheetName);
  }, [files, parseAndApply]);

  const setFileExcludedHeaders = useCallback((id: string, excluded: string[]) => {
    const fields = new Set<string>();
    for (const h of excluded) {
      const f = normalizeHeader(h);
      if (f) fields.add(f);
    }
    updateFile(id, { excludedHeaders: excluded, excludedFields: fields });
  }, []);

  const processFile = async (item: ImportFileItem): Promise<{ inserted: number; updated: number; skipped: number; rejected: number } | null> => {
    if (!item.parsed) return null;
    const parsed = item.parsed;
    const res = { inserted: 0, updated: 0, skipped: 0, rejected: 0 };
    const userCreateFails: string[] = [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: projects } = await supabase.from('projects').select('id').eq('is_active', true).limit(1);
    const projectId = projects?.[0]?.id;
    if (!projectId) throw new Error('No active project found');

    const { data: batch, error: batchErr } = await supabase.from('upload_batches').insert({
      project_id: projectId,
      uploaded_file_name: item.name,
      import_type: item.detectedImportType === 'standard' ? 'standard' : 'legacy',
      total_rows: parsed.length,
      status: 'processing' as any,
      data_date: item.dataDate || null,
      uploaded_by: user.id,
    } as any).select('id').single();
    if (batchErr || !batch) throw new Error(batchErr?.message || 'Failed to create batch');
    const uploadId = batch.id;

    // Build a rich, human-readable reason_detail from a Postgres / PostgREST error
    // so Import Logs show error code + message + details + hint instead of just `error.message`.
    const formatPgError = (err: any): string => {
      if (!err) return 'unknown error';
      const code = err.code ? `[${err.code}] ` : '';
      const msg = err.message ?? JSON.stringify(err);
      const details = err.details ? ` | details: ${err.details}` : '';
      const hint = err.hint ? ` | hint: ${err.hint}` : '';
      return `${code}${msg}${details}${hint}`;
    };

    // -------- PREFETCH (parallel) --------
    // Single-shot fetch of every cache & lookup we need for the whole file,
    // so the per-row loop performs ZERO master/system reads.
    const [systemsRes, aliasRes, subRes, hdecRes] = await Promise.all([
      supabase.from('system_master').select('id, system_code').eq('project_id', projectId),
      supabase.from('system_alias_map').select('alias_name, system_id').eq('project_id', projectId).eq('is_active', true),
      supabase.from('subcontractor_master').select('id, name, type, parent_subcontractor_id, is_active'),
      supabase.from('hdec_pic_master').select('id, name, is_active'),
    ]);
    const systemsData = systemsRes.data;
    const aliasData = aliasRes.data;
    const subData = subRes.data;
    const hdecData = hdecRes.data;
    const systemByCode = new Map<string, string>();
    (systemsData || []).forEach(s => systemByCode.set(s.system_code.toLowerCase(), s.id));
    const aliasByName = new Map<string, string>();
    (aliasData || []).forEach(a => aliasByName.set(a.alias_name.toLowerCase(), a.system_id));

    // Master caches: name(lowercased) -> id (data already prefetched above)
    const subconCache = new Map<string, { id: string; active: boolean }>();
    const subsubCache = new Map<string, { id: string; active: boolean; parent_id: string | null }>();
    (subData || []).forEach((m: any) => {
      const t = m.type ?? 'sub';
      if (t === 'sub') subconCache.set(m.name.toLowerCase().trim(), { id: m.id, active: m.is_active });
      else subsubCache.set(m.name.toLowerCase().trim(), { id: m.id, active: m.is_active, parent_id: m.parent_subcontractor_id });
    });
    const hdecCache = new Map<string, { id: string; active: boolean }>();
    (hdecData || []).forEach((m: any) => hdecCache.set(m.name.toLowerCase().trim(), { id: m.id, active: m.is_active }));

    async function ensureSubcontractor(name: string | null): Promise<void> {
      if (!name) return;
      const key = name.toLowerCase().trim();
      if (subconCache.has(key)) return;
      const { data: ins } = await supabase.from('subcontractor_master')
        .insert({ name: name.trim(), type: 'sub' } as any).select('id').single();
      if (!ins) return;
      subconCache.set(key, { id: ins.id, active: true });
      const { error: fnErr } = await supabase.functions.invoke('auto-create-master-user', {
        body: { name: name.trim(), master_type: 'subcontractor', subcontractor_name: name.trim() },
      });
      if (fnErr) userCreateFails.push(`${name.trim()} (sub): ${fnErr.message}`);
    }

    async function ensureSubsub(name: string | null, parentName: string | null): Promise<void> {
      if (!name) return;
      const key = name.toLowerCase().trim();
      if (subsubCache.has(key)) return;
      let parentId: string | null = null;
      if (parentName) {
        await ensureSubcontractor(parentName);
        parentId = subconCache.get(parentName.toLowerCase().trim())?.id ?? null;
      }
      if (!parentId) {
        const anyParent = subconCache.values().next().value;
        if (!anyParent) return;
        parentId = anyParent.id;
      }
      const { data: ins } = await supabase.from('subcontractor_master')
        .insert({ name: name.trim(), type: 'subsub', parent_subcontractor_id: parentId } as any).select('id').single();
      if (!ins) return;
      subsubCache.set(key, { id: ins.id, active: true, parent_id: parentId });
      const { error: fnErr } = await supabase.functions.invoke('auto-create-master-user', {
        body: {
          name: name.trim(), master_type: 'subsub',
          subcontractor_name: parentName ?? null, subsub_name: name.trim(),
        },
      });
      if (fnErr) userCreateFails.push(`${name.trim()} (subsub): ${fnErr.message}`);
    }

    async function ensureHdecPic(name: string | null): Promise<void> {
      if (!name) return;
      const key = name.toLowerCase().trim();
      if (hdecCache.has(key)) return;
      const { data: ins } = await supabase.from('hdec_pic_master')
        .insert({ name: name.trim() }).select('id').single();
      if (!ins) return;
      hdecCache.set(key, { id: ins.id, active: true });
      const { error: fnErr } = await supabase.functions.invoke('auto-create-master-user', {
        body: { name: name.trim(), master_type: 'hdec_pic', hdec_pic_name: name.trim() },
      });
      if (fnErr) userCreateFails.push(`${name.trim()} (hdec_pic): ${fnErr.message}`);
    }

    // Tracks the most recent auto-create failure per raw system name so we can surface
    // it in the row log instead of just "Cannot resolve system".
    const systemAutoCreateError = new Map<string, string>();

    async function resolveSystem(rawName: string): Promise<string | null> {
      if (!rawName) return null;
      const key = rawName.toLowerCase().trim();
      if (systemByCode.has(key)) return systemByCode.get(key)!;
      if (aliasByName.has(key)) return aliasByName.get(key)!;
      const { data: newSys, error: newSysErr } = await supabase.from('system_master').insert({
        project_id: projectId!,
        system_code: rawName.trim(),
        is_auto_created: true,
        requires_admin_review: true,
      }).select('id').single();
      if (newSys) {
        systemByCode.set(key, newSys.id);
        return newSys.id;
      }
      if (newSysErr) systemAutoCreateError.set(key, formatPgError(newSysErr));
      return null;
    }

    const rowLogs: any[] = [];
    const scheduleChangeAudits: any[] = [];
    const changeLogs: any[] = [];
    const fieldLogs: PendingFieldLog[] = [];
    const fl = (
      rawRowNo: number | null,
      field: string,
      outcome: PendingFieldLog['outcome'],
      opts: { raw?: unknown; applied?: unknown; previous?: unknown; code?: string | null; detail?: string | null } = {}
    ) => {
      fieldLogs.push(buildFieldLog('tnc', { rawRowNo, field, outcome, ...opts }));
    };

    // Emit warnings for date cells that contained text but couldn't be parsed.
    for (const row of parsed) {
      if (!row._dateWarnings?.length) continue;
      for (const w of row._dateWarnings) {
        fl(row.raw_row_no ?? null, w.field, 'rejected_invalid', {
          raw: w.raw,
          code: 'unparseable_date',
          detail: `Could not parse "${w.raw}" as a date`,
        });
      }
    }

    // -------- BULK MASTER PRE-CREATION --------
    // Scan parsed rows once, find all subcontractor / subsub / hdec_pic names that
    // do not yet exist, insert them in a single batch, then fire all
    // auto-create-master-user edge function calls in parallel. This replaces the
    // previous per-row sequential `await ensureXxx()` pattern.
    {
      const subToCreate = new Map<string, string>(); // key -> displayName
      const subsubToCreate = new Map<string, { name: string; parentName: string | null }>();
      const hdecToCreate = new Map<string, string>();
      for (const row of parsed) {
        const sName = row.subcontractor_name?.trim();
        if (sName && !subconCache.has(sName.toLowerCase())) subToCreate.set(sName.toLowerCase(), sName);
        const ssName = row.subsub_name?.trim();
        if (ssName && !subsubCache.has(ssName.toLowerCase())) {
          subsubToCreate.set(ssName.toLowerCase(), { name: ssName, parentName: row.subcontractor_name?.trim() || null });
        }
        const hName = row.hdec_pic_name?.trim();
        if (hName && !hdecCache.has(hName.toLowerCase())) hdecToCreate.set(hName.toLowerCase(), hName);
      }

      // Insert new sub-contractors
      if (subToCreate.size > 0) {
        const rows = Array.from(subToCreate.values()).map(name => ({ name, type: 'sub' as const }));
        const { data: inserted } = await supabase.from('subcontractor_master').insert(rows as any).select('id, name');
        (inserted || []).forEach(r => subconCache.set(r.name.toLowerCase().trim(), { id: r.id, active: true }));
      }
      // Insert new subsubs (after parents exist)
      if (subsubToCreate.size > 0) {
        const fallbackParent = subconCache.values().next().value?.id ?? null;
        const rows = Array.from(subsubToCreate.values()).map(({ name, parentName }) => {
          const pid = parentName ? subconCache.get(parentName.toLowerCase().trim())?.id ?? fallbackParent : fallbackParent;
          return pid ? { name, type: 'subsub' as const, parent_subcontractor_id: pid } : null;
        }).filter(Boolean) as any[];
        if (rows.length > 0) {
          const { data: inserted } = await supabase.from('subcontractor_master').insert(rows).select('id, name, parent_subcontractor_id');
          (inserted || []).forEach((r: any) => subsubCache.set(r.name.toLowerCase().trim(), { id: r.id, active: true, parent_id: r.parent_subcontractor_id }));
        }
      }
      // Insert new hdec_pics
      if (hdecToCreate.size > 0) {
        const rows = Array.from(hdecToCreate.values()).map(name => ({ name }));
        const { data: inserted } = await supabase.from('hdec_pic_master').insert(rows).select('id, name');
        (inserted || []).forEach(r => hdecCache.set(r.name.toLowerCase().trim(), { id: r.id, active: true }));
      }

      // Fire auto-create-master-user edge calls in parallel (best-effort).
      const userCreateCalls: Promise<void>[] = [];
      for (const name of subToCreate.values()) {
        userCreateCalls.push(
          supabase.functions.invoke('auto-create-master-user', {
            body: { name, master_type: 'subcontractor', subcontractor_name: name },
          }).then(({ error }) => { if (error) userCreateFails.push(`${name} (sub): ${error.message}`); }),
        );
      }
      for (const { name, parentName } of subsubToCreate.values()) {
        userCreateCalls.push(
          supabase.functions.invoke('auto-create-master-user', {
            body: { name, master_type: 'subsub', subcontractor_name: parentName, subsub_name: name },
          }).then(({ error }) => { if (error) userCreateFails.push(`${name} (subsub): ${error.message}`); }),
        );
      }
      for (const name of hdecToCreate.values()) {
        userCreateCalls.push(
          supabase.functions.invoke('auto-create-master-user', {
            body: { name, master_type: 'hdec_pic', hdec_pic_name: name },
          }).then(({ error }) => { if (error) userCreateFails.push(`${name} (hdec_pic): ${error.message}`); }),
        );
      }
      // Don't block import on user-account creation; let it run in background.
      void Promise.all(userCreateCalls);
    }

    // -------- BULK PREFETCH OF EXISTING SUBTESTS --------
    // Single query (chunked by item_no) replaces three per-row selects.
    const existingByKey = new Map<string, any>();
    {
      const itemNos = Array.from(new Set(parsed.map(r => r.item_no).filter(Boolean) as string[]));
      const CHUNK = 500;
      for (let i = 0; i < itemNos.length; i += CHUNK) {
        const slice = itemNos.slice(i, i + CHUNK);
        const { data: existingRows } = await supabase.from('subtests')
          .select('id, project_id, system_id, item_no, mos_code, subtest_id, row_version, is_active, custom_payload, ' +
                  'pred_planned_date, t1_planned_date, t2_planned_date, ' +
                  'r1_target_submission_date, r2_target_submission_date, r2_target_approval_date, ' +
                  't1_status, t1_actual_date, t2_status, t2_actual_date, ' +
                  'pred_status, pred_actual_date, r1_status, r2_status')
          .eq('project_id', projectId!)
          .in('item_no', slice);
        (existingRows || []).forEach((r: any) => {
          existingByKey.set(`${r.system_id}|${r.item_no}|${r.mos_code}`, r);
        });
      }
    }

    // Throttled progress: only re-render every PROGRESS_STEP rows.
    const PROGRESS_STEP = Math.max(1, Math.floor(parsed.length / 50));

    // -------- PRE-RESOLVE ALL SYSTEMS (sequential, before concurrent pool) --------
    // resolveSystem may insert new system_master rows; running it concurrently
    // could create duplicates for the same raw name. Pre-resolve all unique
    // raw system names here so the parallel pool only does subtests writes.
    const uniqueRawSystems = Array.from(new Set(parsed.map(r => r.raw_system_name).filter(Boolean) as string[]));
    for (const rawName of uniqueRawSystems) {
      await resolveSystem(rawName);
    }

    // -------- BUILD WRITE TASKS (sequential, memory-only) --------
    // Phase 1: walk every row, do all in-memory work (validation, autofill, schedule
    // impact, field-log classification) and produce a list of update/insert "tasks".
    // Rejected/skipped rows are handled inline (no DB write needed).
    type WriteTask =
      | { kind: 'update'; existingId: string; updates: Record<string, any>; onSuccess: () => void; onFail: (err: any) => void }
      | { kind: 'insert'; payload: Record<string, any>; onSuccess: () => void; onFail: (err: any) => void };
    const writeTasks: WriteTask[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i];

      const systemId = await resolveSystem(row.raw_system_name);
      if (!systemId) {
        res.rejected++;
        const rawKey = (row.raw_system_name ?? '').toLowerCase().trim();
        const autoErr = systemAutoCreateError.get(rawKey);
        const detail = !row.raw_system_name
          ? 'Row has no System / Raw System Name value.'
          : autoErr
            ? `Cannot resolve system "${row.raw_system_name}" and auto-register failed: ${autoErr}`
            : `Cannot resolve system "${row.raw_system_name}" — not found in system_master, no alias, and auto-register did not produce a new row.`;
        rowLogs.push({
          upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
          item_no: row.item_no, mos_code: row.mos_code, action_taken: 'rejected' as any,
          reason_code: 'system_resolve_failed', reason_detail: detail,
          mapped_system_id: null,
        });
        fl(row.raw_row_no, 'system_id', 'rejected_invalid', { raw: row.raw_system_name, code: 'system_resolve_failed', detail });
        continue;
      }

      // Business rule: actual dates cannot be later than the file's Data Date.
      if (item.dataDate) {
        const dd = item.dataDate;
        const violations: Array<{ field: string; value: string }> = [];
        for (const f of SUBTEST_ACTUAL_DATE_FIELDS) {
          const v = (row as any)[f] as string | null | undefined;
          if (v && v > dd) violations.push({ field: f, value: v });
        }
        if (violations.length > 0) {
          res.rejected++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'rejected' as any,
            reason_code: 'actual_date_after_data_date',
            reason_detail: `Actual date(s) cannot be later than Data Date (${dd}): ${violations.map(x => `${x.field}=${x.value}`).join(', ')}.`,
            mapped_system_id: systemId,
          });
          for (const v of violations) {
            fl(row.raw_row_no, v.field, 'rejected_invalid', { raw: v.value, code: 'actual_date_after_data_date', detail: `Value ${v.value} is later than Data Date ${dd}` });
          }
          continue;
        }
      }

      // Auto-register masters mentioned in this row.
      // (Bulk pre-creation already happened above; these calls are now O(1) cache hits and DO NOT await DB.)
      // Note: kept for safety in case a row references a name not seen in the initial scan
      // (extremely rare; would only happen for whitespace-variant names that hash differently).
      // To avoid bringing back per-row awaits we simply skip — the row will fail-soft if truly missing.

      // Look up by natural key from prefetched cache (zero DB round-trips for existing matches).
      const existing = existingByKey.get(`${systemId}|${row.item_no}|${row.mos_code}`) ?? null;

      const dataSourceType = item.detectedImportType === 'legacy' ? 'legacy_import_inherited' : 'standard_import';
      const autoFillDate = item.dataDate || new Date().toISOString().slice(0, 10);

      if (existing) {
        const updates: Record<string, any> = {};
        const rowTeamValue = item.detectedImportType === 'standard' ? row.team : (item.team || null);
        const fields: [string, string | null][] = [
          ['description', row.description], ['equipment', row.equipment], ['level', row.level],
          ['t1_planned_date', row.t1_planned_date], ['t1_status', row.t1_status],
          ['t2_planned_date', row.t2_planned_date], ['t2_status', row.t2_status],
          ['predecessor_status_raw', row.predecessor_status_raw],
          ['pred_status', row.pred_status],
          ['pred_planned_date', row.pred_planned_date],
          ['pred_actual_date', row.pred_actual_date],
          ['subcontractor_name', row.subcontractor_name],
          ['subsub_name', row.subsub_name],
          ['hdec_pic_name', row.hdec_pic_name],
          ['r1_status', row.r1_status],
          ['r1_report_ref', row.r1_report_ref],
          ['r1_target_submission_date', row.r1_target_submission_date],
          ['r1_actual_submission_date', row.r1_actual_submission_date],
          ['r2_status', row.r2_status],
          ['aconex_ref_no', row.aconex_ref_no],
          ['r2_target_submission_date', row.r2_target_submission_date],
          ['r2_actual_submission_date', row.r2_actual_submission_date],
          ['r2_target_approval_date', row.r2_target_approval_date],
          ['r2_actual_approval_date', row.r2_actual_approval_date],
          ['remarks', row.remarks],
          ['punchlist_comments', row.punchlist_comments],
        ];
        const excludedFields = item.excludedFields;
        for (const [field, val] of fields) {
          if (excludedFields?.has(field)) continue;
          const resolved = resolveValue(val, null);
          if (resolved !== undefined) updates[field] = resolved;
        }
        const resolvedTeam = resolveValue(rowTeamValue, null);
        if (!excludedFields?.has('team') && resolvedTeam !== undefined) updates.team = resolvedTeam;

        // Merge custom_payload (only when there are new custom values)
        if (row.custom_payload && Object.keys(row.custom_payload).length > 0) {
          const existingCustom = ((existing as any).custom_payload ?? {}) as Record<string, unknown>;
          const merged = { ...existingCustom, ...row.custom_payload };
          // Only update if there's an actual diff
          const changed = Object.keys(row.custom_payload).some(
            (k) => JSON.stringify(existingCustom[k]) !== JSON.stringify(row.custom_payload[k]),
          );
          if (changed) updates.custom_payload = merged;
        }

        const needsReactivation = (existing as any).is_active === false;
        if (Object.keys(updates).length === 0 && !needsReactivation) {
          res.skipped++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'skipped' as any,
            reason_code: 'no_changes',
            reason_detail: 'All mapped columns match existing values; no update needed.',
            mapped_system_id: systemId,
          });
          fl(row.raw_row_no, '__row__', 'info', { code: 'no_changes', detail: 'All mapped columns match existing values; no update needed.' });
          continue;
        }

        updates.data_source_type = dataSourceType;
        updates.source_upload_id = uploadId;
        updates.row_version = (existing.row_version || 1) + 1;
        updates.subtest_id = row.subtest_id;
        // Re-activate previously hidden subtests so they reappear on the data screens.
        updates.is_active = true;

        // Auto-fill t1/t2 status to 'Planned' when planned_date exists but status is null
        const finalT1PlannedForAutoFill = updates.t1_planned_date !== undefined ? updates.t1_planned_date : null;
        const finalT2PlannedForAutoFill = updates.t2_planned_date !== undefined ? updates.t2_planned_date : null;

        // Auto-fill actual_date when status becomes Done and actual_date is empty.
        // Source values come from the prefetched `existing` row (no extra DB call).
        const ed: any = existing;

        // Auto-fill actual_date when status becomes Done and actual_date is empty
        // (existing already contains all needed t1/t2/pred status & dates from prefetch)
        const finalT1Status = updates.t1_status !== undefined ? updates.t1_status : ed?.t1_status;
        const finalT1Actual = updates.t1_actual_date !== undefined ? updates.t1_actual_date : ed?.t1_actual_date;
        if (finalT1Status === 'Done' && !finalT1Actual) {
          updates.t1_actual_date = autoFillDate;
        }
        const finalT2Status = updates.t2_status !== undefined ? updates.t2_status : ed?.t2_status;
        const finalT2Actual = updates.t2_actual_date !== undefined ? updates.t2_actual_date : ed?.t2_actual_date;
        if (finalT2Status === 'Done' && !finalT2Actual) {
          updates.t2_actual_date = autoFillDate;
        }
        const finalPredStatus = updates.pred_status !== undefined ? updates.pred_status : ed?.pred_status;
        const finalPredActual = updates.pred_actual_date !== undefined ? updates.pred_actual_date : ed?.pred_actual_date;
        if (finalPredStatus === 'Done' && !finalPredActual) {
          updates.pred_actual_date = autoFillDate;
        }

        // Auto-fill status to 'Planned' when planned_date exists but status is null
        if (finalT1Status == null && (finalT1PlannedForAutoFill || ed?.t1_planned_date)) {
          updates.t1_status = 'Planned';
        }
        if (finalT2Status == null && (finalT2PlannedForAutoFill || ed?.t2_planned_date)) {
          updates.t2_status = 'Planned';
        }
        const finalPredPlannedForAutoFill = updates.pred_planned_date !== undefined ? updates.pred_planned_date : ed?.pred_planned_date;
        if (finalPredStatus == null && finalPredPlannedForAutoFill) {
          updates.pred_status = 'Planned';
        }

        // R1/R2: when T2 planned date is present, auto-derive missing R1/R2 target dates
        // (only fills targets that the import didn't supply AND are still empty in DB).
        // Source values come from the prefetched `existing` row (no extra DB call).
        const er: any = existing;
        const finalT2PlannedForRDerive = updates.t2_planned_date !== undefined ? updates.t2_planned_date : ed?.t2_planned_date;
        if (finalT2PlannedForRDerive) {
          const derived = derivePlanFromT2(finalT2PlannedForRDerive);
          if (updates.r1_target_submission_date === undefined && !er?.r1_target_submission_date) {
            updates.r1_target_submission_date = derived.r1_target_submission_date;
          }
          if (updates.r2_target_submission_date === undefined && !er?.r2_target_submission_date) {
            updates.r2_target_submission_date = derived.r2_target_submission_date;
          }
          if (updates.r2_target_approval_date === undefined && !er?.r2_target_approval_date) {
            updates.r2_target_approval_date = derived.r2_target_approval_date;
          }
        }
        // Default R1/R2 status to 'Planned' when a target date exists but no status set
        const finalR1Status = updates.r1_status !== undefined ? updates.r1_status : er?.r1_status;
        const finalR1Target = updates.r1_target_submission_date !== undefined ? updates.r1_target_submission_date : er?.r1_target_submission_date;
        if (finalR1Status == null && finalR1Target) updates.r1_status = 'Planned';
        const finalR2Status = updates.r2_status !== undefined ? updates.r2_status : er?.r2_status;
        const finalR2Target = updates.r2_target_submission_date !== undefined ? updates.r2_target_submission_date : er?.r2_target_submission_date;
        if (finalR2Status == null && finalR2Target) updates.r2_status = 'Planned';

        const scheduleImpact = buildScheduleChangeImpact(existing as any, {
          pred_planned_date: updates.pred_planned_date,
          t1_planned_date: updates.t1_planned_date,
          t2_planned_date: updates.t2_planned_date,
          r1_target_submission_date: updates.r1_target_submission_date,
          r2_target_submission_date: updates.r2_target_submission_date,
        });

        writeTasks.push({
          kind: 'update',
          existingId: existing.id,
          updates,
          onFail: (error: any) => {
          res.rejected++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'rejected' as any,
            reason_code: 'update_failed', reason_detail: formatPgError(error), mapped_system_id: systemId,
          });
          fl(row.raw_row_no, '__row__', 'rejected_invalid', { code: 'update_failed', detail: formatPgError(error) });
          },
          onSuccess: () => {
          res.updated++;
          if (hasScheduleChangeImpact(scheduleImpact)) {
            scheduleChangeAudits.push({
              upload_id: uploadId,
              subtest_id: existing.id,
              project_id: projectId,
              system_id: systemId,
              item_no: existing.item_no,
              mos_code: existing.mos_code,
              subtest_code: row.subtest_id || existing.subtest_id,
              raw_row_no: row.raw_row_no,
              pred_old_date: scheduleImpact.pred?.old_date ?? null,
              pred_new_date: scheduleImpact.pred?.new_date ?? null,
              pred_diff_days: scheduleImpact.pred?.diff_days ?? null,
              pred_prev_gap_days: scheduleImpact.pred?.prev_gap_days ?? null,
              pred_cur_gap_days: scheduleImpact.pred?.cur_gap_days ?? null,
              t1_old_date: scheduleImpact.t1?.old_date ?? null,
              t1_new_date: scheduleImpact.t1?.new_date ?? null,
              t1_diff_days: scheduleImpact.t1?.diff_days ?? null,
              t1_prev_gap_days: scheduleImpact.t1?.prev_gap_days ?? null,
              t1_cur_gap_days: scheduleImpact.t1?.cur_gap_days ?? null,
              t2_old_date: scheduleImpact.t2?.old_date ?? null,
              t2_new_date: scheduleImpact.t2?.new_date ?? null,
              t2_diff_days: scheduleImpact.t2?.diff_days ?? null,
              t2_prev_gap_days: scheduleImpact.t2?.prev_gap_days ?? null,
              t2_cur_gap_days: scheduleImpact.t2?.cur_gap_days ?? null,
              r1_old_date: scheduleImpact.r1?.old_date ?? null,
              r1_new_date: scheduleImpact.r1?.new_date ?? null,
              r1_diff_days: scheduleImpact.r1?.diff_days ?? null,
              r1_prev_gap_days: scheduleImpact.r1?.prev_gap_days ?? null,
              r1_cur_gap_days: scheduleImpact.r1?.cur_gap_days ?? null,
              r2s_old_date: scheduleImpact.r2s?.old_date ?? null,
              r2s_new_date: scheduleImpact.r2s?.new_date ?? null,
              r2s_diff_days: scheduleImpact.r2s?.diff_days ?? null,
              r2s_prev_gap_days: scheduleImpact.r2s?.prev_gap_days ?? null,
              created_by: user.id,
            });
            (['pred', 't1', 't2'] as const).forEach(stage => {
              const change = scheduleImpact[stage];
              if (!change) return;
              changeLogs.push({
                subtest_id: existing.id,
                changed_field: `${stage}_planned_date`,
                old_value: change.old_date,
                new_value: change.new_date,
                changed_by: user.id,
                change_source: 'excel_import' as any,
                upload_id: uploadId,
              });
            });
            (['r1', 'r2s'] as const).forEach(stage => {
              const change = scheduleImpact[stage];
              if (!change) return;
              const fieldName = stage === 'r1' ? 'r1_target_submission_date' : 'r2_target_submission_date';
              changeLogs.push({
                subtest_id: existing.id,
                changed_field: fieldName,
                old_value: change.old_date,
                new_value: change.new_date,
                changed_by: user.id,
                change_source: 'excel_import' as any,
                upload_id: uploadId,
              });
            });
          }
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'updated' as any,
            mapped_system_id: systemId,
          });
          // Per-cell field logs for every column actually written by this update.
          for (const [k, v] of Object.entries(updates)) {
            if (k === 'data_source_type' || k === 'source_upload_id' || k === 'row_version' || k === 'subtest_id' || k === 'is_active') continue;
            // 'planned' status auto-fills are recognizable: the original parsed row had no value.
            const wasAutoStatus = (k === 't1_status' || k === 't2_status' || k === 'pred_status' || k === 'r1_status' || k === 'r2_status') && !(row as any)[k];
            const wasAutoActual = (k === 't1_actual_date' || k === 't2_actual_date' || k === 'pred_actual_date') && !(row as any)[k];
            const wasDerivedR = (k === 'r1_target_submission_date' || k === 'r2_target_submission_date' || k === 'r2_target_approval_date') && !(row as any)[k];
            if (wasAutoStatus) {
              fl(row.raw_row_no, k, 'auto_filled', { applied: v, code: 'status_auto_planned', detail: 'Planned date present but status missing — set to Planned.' });
            } else if (wasAutoActual) {
              fl(row.raw_row_no, k, 'auto_filled', { applied: v, code: 'actual_autofilled_on_done', detail: `Status=Done with no actual date — auto-filled to data date.` });
            } else if (wasDerivedR) {
              fl(row.raw_row_no, k, 'derived', { applied: v, code: 'derived_from_t2', detail: 'R1/R2 target derived from T2 planned date.' });
            } else {
              fl(row.raw_row_no, k, 'applied', { applied: v });
            }
          }
          },
        });
      } else {
        // Auto-fill status to 'Planned' when planned_date exists but status is null (new inserts)
        const insertT1Status = (!row.t1_status && row.t1_planned_date) ? 'Planned' : row.t1_status;
        const insertT2Status = (!row.t2_status && row.t2_planned_date) ? 'Planned' : row.t2_status;
        const insertPredStatus = (!row.pred_status && row.pred_planned_date) ? 'Planned' : row.pred_status;
        // Auto-fill actual_date for new inserts when status is Done
        const insertT1Actual = insertT1Status === 'Done' ? autoFillDate : null;
        const insertT2Actual = insertT2Status === 'Done' ? autoFillDate : null;
        const insertPredActual = insertPredStatus === 'Done' ? autoFillDate : (row.pred_actual_date ?? null);
        const rowTeamValue = item.detectedImportType === 'standard' ? row.team : (item.team || null);
        const resolvedTeam = resolveValue(rowTeamValue, null);

        // R1/R2: derive missing target dates from T2 planned date
        const derivedR = row.t2_planned_date ? derivePlanFromT2(row.t2_planned_date) : { r1_target_submission_date: null, r2_target_submission_date: null, r2_target_approval_date: null };
        const insertR1Target = row.r1_target_submission_date ?? derivedR.r1_target_submission_date;
        const insertR2SubTarget = row.r2_target_submission_date ?? derivedR.r2_target_submission_date;
        const insertR2ApprovalTarget = row.r2_target_approval_date ?? derivedR.r2_target_approval_date;
        // Default R1/R2 status to 'Planned' when target exists but no explicit status
        const insertR1Status = row.r1_status ?? (insertR1Target ? 'Planned' : null);
        const insertR2Status = row.r2_status ?? (insertR2SubTarget ? 'Planned' : null);

        const insertPayload: Record<string, any> = {
          project_id: projectId!, system_id: systemId,
          item_no: row.item_no, mos_code: row.mos_code, subtest_id: row.subtest_id,
          level: row.level, equipment: row.equipment, description: row.description,
          t1_planned_date: row.t1_planned_date, t1_status: insertT1Status as any,
          t1_actual_date: insertT1Actual,
          t2_planned_date: row.t2_planned_date, t2_status: insertT2Status as any,
          t2_actual_date: insertT2Actual,
          predecessor_status_raw: row.predecessor_status_raw,
          pred_status: insertPredStatus as any,
          pred_planned_date: row.pred_planned_date,
          pred_actual_date: insertPredActual,
          subcontractor_name: row.subcontractor_name,
          subsub_name: row.subsub_name,
          hdec_pic_name: row.hdec_pic_name,
          r1_status: insertR1Status as any,
          r1_report_ref: row.r1_report_ref,
          r1_target_submission_date: insertR1Target,
          r1_actual_submission_date: row.r1_actual_submission_date,
          r2_status: insertR2Status as any,
          aconex_ref_no: row.aconex_ref_no,
          r2_target_submission_date: insertR2SubTarget,
          r2_actual_submission_date: row.r2_actual_submission_date,
          r2_target_approval_date: insertR2ApprovalTarget,
          r2_actual_approval_date: row.r2_actual_approval_date,
          remarks: row.remarks,
          punchlist_comments: row.punchlist_comments,
          data_source_type: dataSourceType as any, source_upload_id: uploadId,
          team: (resolvedTeam === undefined ? null : resolvedTeam) as any,
          custom_payload: row.custom_payload ?? {},
        };
        writeTasks.push({
          kind: 'insert',
          payload: insertPayload,
          onFail: (error: any) => {
          res.rejected++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'rejected' as any,
            reason_code: 'insert_failed', reason_detail: formatPgError(error), mapped_system_id: systemId,
          });
          fl(row.raw_row_no, '__row__', 'rejected_invalid', { code: 'insert_failed', detail: formatPgError(error) });
          },
          onSuccess: () => {
          res.inserted++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'inserted' as any,
            mapped_system_id: systemId,
          });
          // Per-cell field logs for new inserts (non-empty values only).
          const insertedPayload: Record<string, unknown> = {
            description: row.description, equipment: row.equipment, level: row.level,
            t1_planned_date: row.t1_planned_date, t1_status: insertT1Status, t1_actual_date: insertT1Actual,
            t2_planned_date: row.t2_planned_date, t2_status: insertT2Status, t2_actual_date: insertT2Actual,
            pred_status: insertPredStatus, pred_planned_date: row.pred_planned_date, pred_actual_date: insertPredActual,
            subcontractor_name: row.subcontractor_name, subsub_name: row.subsub_name, hdec_pic_name: row.hdec_pic_name,
            r1_status: insertR1Status, r1_report_ref: row.r1_report_ref,
            r1_target_submission_date: insertR1Target, r1_actual_submission_date: row.r1_actual_submission_date,
            r2_status: insertR2Status, aconex_ref_no: row.aconex_ref_no,
            r2_target_submission_date: insertR2SubTarget, r2_actual_submission_date: row.r2_actual_submission_date,
            r2_target_approval_date: insertR2ApprovalTarget, r2_actual_approval_date: row.r2_actual_approval_date,
            remarks: row.remarks, punchlist_comments: row.punchlist_comments,
            team: resolvedTeam,
          };
          for (const [k, v] of Object.entries(insertedPayload)) {
            if (v === null || v === undefined || v === '') continue;
            const wasAutoStatus = (k === 't1_status' || k === 't2_status' || k === 'pred_status' || k === 'r1_status' || k === 'r2_status') && !(row as any)[k];
            const wasAutoActual = (k === 't1_actual_date' || k === 't2_actual_date' || k === 'pred_actual_date') && !(row as any)[k];
            const wasDerivedR = (k === 'r1_target_submission_date' || k === 'r2_target_submission_date' || k === 'r2_target_approval_date') && !(row as any)[k];
            if (wasAutoStatus) {
              fl(row.raw_row_no, k, 'auto_filled', { applied: v, code: 'status_auto_planned', detail: 'Planned date present but status missing — set to Planned.' });
            } else if (wasAutoActual) {
              fl(row.raw_row_no, k, 'auto_filled', { applied: v, code: 'actual_autofilled_on_done', detail: 'Status=Done with no actual date — auto-filled to data date.' });
            } else if (wasDerivedR) {
              fl(row.raw_row_no, k, 'derived', { applied: v, code: 'derived_from_t2', detail: 'R1/R2 target derived from T2 planned date.' });
            } else {
              fl(row.raw_row_no, k, 'applied', { applied: v });
            }
          }
          },
        });
      }
    }

    // -------- EXECUTE WRITE TASKS WITH CONCURRENCY POOL --------
    // Run update/insert calls in parallel (8 at a time) to maximize throughput.
    // Pre-resolution of systems and master pre-creation already eliminated the
    // race-prone DB writes from this phase, so this is safe.
    const CONCURRENCY = 8;
    let completed = 0;
    let nextTaskIdx = 0;
    const totalTasks = writeTasks.length;
    const runWorker = async () => {
      while (true) {
        const idx = nextTaskIdx++;
        if (idx >= totalTasks) return;
        const t = writeTasks[idx];
        try {
          if (t.kind === 'update') {
            const { error } = await supabase.from('subtests').update(t.updates as any).eq('id', t.existingId);
            if (error) t.onFail(error); else t.onSuccess();
          } else {
            let { error } = await supabase.from('subtests').insert(t.payload as any);
            // Recover from subtest_id uniqueness collisions within the same project
            // (different system but same item_no/mos_code → same generated subtest_id).
            // Append a numeric suffix and retry up to 5 times.
            if (error && (error as any).code === '23505' && /subtest_id/i.test((error as any).message ?? '')) {
              const baseId = String((t.payload as any).subtest_id ?? '');
              for (let attempt = 2; attempt <= 6 && error; attempt++) {
                const retryPayload = { ...(t.payload as any), subtest_id: `${baseId}-${attempt}` };
                const r = await supabase.from('subtests').insert(retryPayload as any);
                error = r.error as any;
                if (!error) break;
                if ((error as any).code !== '23505' || !/subtest_id/i.test((error as any).message ?? '')) break;
              }
            }
            if (error) t.onFail(error); else t.onSuccess();
          }
        } catch (error: any) {
          t.onFail(error);
        }
        completed++;
        if (completed % PROGRESS_STEP === 0 || completed === totalTasks) {
          updateFile(item.id, { progress: Math.round((completed / Math.max(totalTasks, 1)) * 100) });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, totalTasks) }, () => runWorker())
    );

    // -------- PARALLEL LOG INSERTS --------
    // All four log streams are independent; chunk and fire in parallel.
    const LOG_CHUNK = 500;
    const fieldRows = fieldLogs.length > 0 ? fieldLogs.map((b) => ({
      upload_id: uploadId,
      kind: 'tnc' as const,
      raw_row_no: b.raw_row_no,
      field_name: b.field_name,
      outcome: b.outcome,
      raw_value: b.raw_value,
      applied_value: b.applied_value,
      previous_value: b.previous_value,
      reason_code: b.reason_code,
      reason_detail: b.reason_detail,
      created_by: user.id,
    })) : [];
    const chunk = <T,>(arr: T[], size: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };
    await Promise.all([
      ...chunk(rowLogs, LOG_CHUNK).map(c => supabase.from('upload_row_logs').insert(c)),
      ...chunk(scheduleChangeAudits, LOG_CHUNK).map(c => supabase.from('schedule_change_audit').insert(c as any)),
      ...chunk(changeLogs, LOG_CHUNK).map(c => supabase.from('subtest_change_log').insert(c)),
      ...chunk(fieldRows, LOG_CHUNK).map(c => (supabase as any).from('import_field_logs').insert(c)),
    ]);

    await supabase.from('upload_batches').update({
      status: 'completed' as any,
      processed_rows: parsed.length,
      success_rows: res.inserted + res.updated,
      skipped_rows: res.skipped,
      rejected_rows: res.rejected,
    }).eq('id', uploadId);

    if (userCreateFails.length > 0) {
      toast({
        title: `${userCreateFails.length} user account(s) failed`,
        description: userCreateFails.slice(0, 3).join('; ') + (userCreateFails.length > 3 ? '...' : ''),
        variant: 'destructive',
      });
    }

    return res;
  };

  const startImport = async () => {
    const queue = files.filter(f => f.status === 'ready' && (f.detectedImportType === 'standard' || (f.detectedImportType === 'legacy' && f.team)));
    if (queue.length === 0) return;
    setIsRunning(true);

    let totals = { inserted: 0, updated: 0, skipped: 0, rejected: 0 };

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setCurrentIndex(files.findIndex(f => f.id === item.id));
      updateFile(item.id, { status: 'processing', progress: 0 });
      try {
        const res = await processFile(item);
        if (res) {
          updateFile(item.id, { status: 'done', progress: 100, result: res });
          totals.inserted += res.inserted;
          totals.updated += res.updated;
          totals.skipped += res.skipped;
          totals.rejected += res.rejected;
        }
      } catch (e: any) {
        updateFile(item.id, { status: 'failed', error: e.message });
      }
    }

    setIsRunning(false);
    setCurrentIndex(-1);
    toast({
      title: 'All imports complete',
      description: `${totals.inserted} inserted, ${totals.updated} updated, ${totals.skipped} skipped, ${totals.rejected} rejected`,
    });
  };

  return (
    <ImportContext.Provider value={{
      files, isRunning, currentIndex,
      addFiles, removeFile, clearAll, startImport, setFileDataDate, setFileTeam, setFileSheet, setFileExcludedHeaders,
    }}>
      {children}
    </ImportContext.Provider>
  );
}
