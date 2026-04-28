import React, { createContext, useContext, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { detectImportType, getExcelSheetNames, parseExcelFile, parseLegacy, parseStandard, resolveValue, type DetectedImportType, type ParsedSubtest } from '@/lib/import-parser';
import { useToast } from '@/hooks/use-toast';
import { buildScheduleChangeImpact, hasScheduleChangeImpact } from '@/lib/schedule-change-utils';
import { derivePlanFromT2 } from '@/lib/business-days';
import { SUBTEST_ACTUAL_DATE_FIELDS, type SubtestActualDateField } from '@/lib/defect-date-validation';

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
}

interface ImportContextValue {
  files: ImportFileItem[];
  isRunning: boolean;
  currentIndex: number;
  addFiles: (files: File[]) => Promise<void>;
  removeFile: (id: string) => void;
  clearAll: () => void;
  startImport: () => Promise<void>;
  setFileDataDate: (id: string, date: string) => void;
  setFileTeam: (id: string, team: string) => void;
  setFileSheet: (id: string, sheetName: string) => Promise<void>;
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
      const { rows, mappedHeaders, unmappedHeaders } = parseExcelFile(buf, sheetName);
      const detection = detectImportType(mappedHeaders);
      const subtests = detection.type === 'legacy' ? parseLegacy(rows) : detection.type === 'standard' ? parseStandard(rows) : [];
      if (subtests.length === 0) {
        updateFile(id, {
          status: 'failed',
          error: detection.type === 'unknown' ? 'Unknown import format' : 'No valid rows found',
          unmappedHeaders,
          detectedImportType: detection.type,
          detectionReasons: detection.reasons,
          selectedSheet: sheetName,
        });
      } else {
        updateFile(id, {
          status: 'ready',
          parsedCount: subtests.length,
          parsed: subtests,
          unmappedHeaders,
          detectedImportType: detection.type,
          detectionReasons: detection.reasons,
          selectedSheet: sheetName,
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
    updateFile(id, { status: 'parsing', selectedSheet: sheetName });
    parseAndApply(id, buf, sheetName);
  }, [files, parseAndApply]);

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

    const { data: systemsData } = await supabase.from('system_master').select('id, system_code').eq('project_id', projectId);
    const { data: aliasData } = await supabase.from('system_alias_map').select('alias_name, system_id').eq('project_id', projectId).eq('is_active', true);
    const systemByCode = new Map<string, string>();
    (systemsData || []).forEach(s => systemByCode.set(s.system_code.toLowerCase(), s.id));
    const aliasByName = new Map<string, string>();
    (aliasData || []).forEach(a => aliasByName.set(a.alias_name.toLowerCase(), a.system_id));

    // Master caches: name(lowercased) -> id
    const { data: subData } = await supabase.from('subcontractor_master').select('id, name, type, parent_subcontractor_id, is_active');
    const { data: hdecData } = await supabase.from('hdec_pic_master').select('id, name, is_active');
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
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i];
      updateFile(item.id, { progress: Math.round(((i + 1) / parsed.length) * 100) });

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
        continue;
      }

      // Business rule: actual dates cannot be later than the file's Data Date.
      if (item.dataDate) {
        const dd = item.dataDate;
        const violations: string[] = [];
        for (const f of SUBTEST_ACTUAL_DATE_FIELDS) {
          const v = (row as any)[f] as string | null | undefined;
          if (v && v > dd) violations.push(`${f}=${v}`);
        }
        if (violations.length > 0) {
          res.rejected++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'rejected' as any,
            reason_code: 'actual_date_after_data_date',
            reason_detail: `Actual date(s) cannot be later than Data Date (${dd}): ${violations.join(', ')}.`,
            mapped_system_id: systemId,
          });
          continue;
        }
      }

      // Auto-register masters mentioned in this row
      await ensureSubcontractor(row.subcontractor_name);
      await ensureSubsub(row.subsub_name, row.subcontractor_name);
      await ensureHdecPic(row.hdec_pic_name);

      // Look up by natural key WITHOUT is_active filter, so previously deactivated
      // subtests are matched and re-activated below (instead of triggering a duplicate insert).
      const { data: existing } = await supabase.from('subtests')
        .select('id, project_id, system_id, item_no, mos_code, subtest_id, updated_at, row_version, pred_planned_date, t1_planned_date, t2_planned_date, r1_target_submission_date, r2_target_submission_date, is_active')
        .eq('project_id', projectId!).eq('system_id', systemId)
        .eq('item_no', row.item_no).eq('mos_code', row.mos_code)
        .maybeSingle();

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
        for (const [field, val] of fields) {
          const resolved = resolveValue(val, null);
          if (resolved !== undefined) updates[field] = resolved;
        }
        const resolvedTeam = resolveValue(rowTeamValue, null);
        if (resolvedTeam !== undefined) updates.team = resolvedTeam;

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

        // Auto-fill actual_date when status becomes Done and actual_date is empty
        const { data: existingDates } = await supabase.from('subtests')
          .select('t1_status, t1_planned_date, t1_actual_date, t2_status, t2_planned_date, t2_actual_date, pred_status, pred_planned_date, pred_actual_date' as any)
          .eq('id', existing.id).maybeSingle();
        const ed: any = existingDates;
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
        // (only fills targets that the import didn't supply AND are still empty in DB)
        const { data: existingR } = await supabase.from('subtests')
          .select('r1_target_submission_date, r2_target_submission_date, r2_target_approval_date, r1_status, r2_status' as any)
          .eq('id', existing.id).maybeSingle();
        const er: any = existingR;
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

        const { error } = await supabase.from('subtests').update(updates as any).eq('id', existing.id);
        if (error) {
          res.rejected++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'rejected' as any,
            reason_code: 'update_failed', reason_detail: formatPgError(error), mapped_system_id: systemId,
          });
        } else {
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
        }
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

        const { error } = await supabase.from('subtests').insert({
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
        } as any);
        if (error) {
          res.rejected++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'rejected' as any,
            reason_code: 'insert_failed', reason_detail: formatPgError(error), mapped_system_id: systemId,
          });
        } else {
          res.inserted++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'inserted' as any,
            mapped_system_id: systemId,
          });
        }
      }
    }

    for (let i = 0; i < rowLogs.length; i += 100) {
      await supabase.from('upload_row_logs').insert(rowLogs.slice(i, i + 100));
    }
    for (let i = 0; i < scheduleChangeAudits.length; i += 100) {
      await supabase.from('schedule_change_audit').insert(scheduleChangeAudits.slice(i, i + 100) as any);
    }
    for (let i = 0; i < changeLogs.length; i += 100) {
      await supabase.from('subtest_change_log').insert(changeLogs.slice(i, i + 100));
    }

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
      addFiles, removeFile, clearAll, startImport, setFileDataDate, setFileTeam, setFileSheet,
    }}>
      {children}
    </ImportContext.Provider>
  );
}
