// Sub-module workers for the Docs Import hub.
// Each worker owns its sub-module's upsert logic, but shares row/field/change
// log generation through ImportRowOutcome -> writeImportLogs.
import { supabase } from '@/integrations/supabase/client';
import { buildFieldLog, classifyChange, type PendingFieldLog } from '@/lib/import-field-log';
import {
  buildOrgResolver,
  fmtSupabaseError,
  normalizeOrgKey,
  persistUnmatchedOrgs,
  resolveSubcontractorId,
  runWithConcurrency,
  type OrgResolverMaps,
} from '@/lib/docs-import-logging';
import type { ParsedDocsRow } from '@/lib/docs-import-parser';
import type { ParsedOmmRow } from '@/lib/docs-omm-import-parser';
import type { ParsedSparePartRow } from '@/lib/docs-spare-part-import-parser';
import type {
  DocsRejectSample,
  ImporterAdapter,
  ImportRowOutcome,
  WorkerContext,
} from '@/contexts/docs-import/types';

const CONCURRENCY = 8;

// ============================================================================
// ABD (As-Built Drawings)
// ============================================================================

const ABD_TRACKED_FIELDS = [
  'revision', 'title', 'organisation_raw', 'subcontractor_id', 'subcontractor_name',
  'discipline', 'document_type', 'series', 'level_location', 'sequential_no',
  'current_status', 'aconex_status', 'is_submitted',
  'submitted_date', 'approved_date',
  'sub1_planned_date', 'sub1_submission_date', 'sub1_approval_date', 'sub1_approval_status', 'sub1_actual_response_date',
  'sub2_planned_date', 'sub2_submission_date', 'sub2_approval_date', 'sub2_approval_status', 'sub2_actual_response_date',
  'sub3_planned_date', 'sub3_submission_date', 'sub3_approval_date', 'sub3_approval_status', 'sub3_actual_response_date',
  'transmittal_number', 'transmittal_due_date', 'days_due',
  'remarks', 'hdec_pic_name', 'hdec_eng_name', 'team',
];

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

function stringify(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export const abdAdapter: ImporterAdapter<ParsedDocsRow> = {
  subModule: 'as_built',
  keyFieldLabel: 'Document No',
  dataDateRequired: true,
  rawDataPath: '/docs/abd',
  parseFile: async (file, sheets, options) => {
    const { parseDocsExcel } = await import('@/lib/docs-import-parser');
    const r = await parseDocsExcel(file, sheets, options);
    return { rows: r.rows, unknownHeaders: r.unknownHeaders, excludedFields: r.excludedFields };
  },
  getSheetNames: async (file) => {
    const { getDocsExcelSheetNames } = await import('@/lib/docs-import-parser');
    return getDocsExcelSheetNames(file);
  },
  getHeaderInfo: async (file, sheets) => {
    const { getDocsHeaderInfo } = await import('@/lib/docs-import-parser');
    return getDocsHeaderInfo(file, sheets);
  },
  getRowKey: (row) => row.document_no ?? null,
  upsertWorker: async (ctx, rows, onProgress) => {
    const orgMaps = await buildOrgResolver();
    const existingByDocNo = await loadExistingDrawings(ctx.projectId);
    const counters = { inserted: 0, updated: 0, skipped: 0, rejected: 0, unmatchedOrgs: new Set<string>() };
    const outcomes: ImportRowOutcome[] = [];
    const rejectSamples: DocsRejectSample[] = [];
    // User-excluded canonical fields — UPDATE branch must skip these so the
    // existing DB value is preserved (mirrors T&C / Defect importers).
    const excludedFields = ctx.excludedFields ?? new Set<string>();

    // Performance pattern (mirrors DefectImportContext):
    //   1. Single sequential pre-pass to validate, build payloads, and split
    //      rows into INSERT vs UPDATE buckets.
    //   2. Bulk INSERT in chunks of 200 (cuts ~200x HTTP round-trips).
    //   3. UPDATE pool of 8 concurrent requests (Supabase has no bulk update).
    const INSERT_CHUNK = 200;
    const UPDATE_CONCURRENCY = 8;

    type InsertItem = { row: ParsedDocsRow; payload: Record<string, unknown> };
    type UpdateItem = { row: ParsedDocsRow; payload: Record<string, unknown>; existingId: string; prevPayload: any };
    const insertItems: InsertItem[] = [];
    const updateItems: UpdateItem[] = [];

    // ---- Pre-pass: validate + build payloads + bucketize ------------------
    for (const row of rows) {
      const subId = resolveSubcontractorId(row.organisation_raw, orgMaps);
      if (row.organisation_raw && !subId) counters.unmatchedOrgs.add(normalizeOrgKey(row.organisation_raw));

      const fieldLogs: PendingFieldLog[] = [];
      const pushLog = (args: Parameters<typeof buildFieldLog>[1]) =>
        fieldLogs.push(buildFieldLog('docs', args));

      if (!row.document_no || !String(row.document_no).trim()) {
        counters.skipped++;
        pushLog({ rawRowNo: row.rawRowNo, field: 'document_no', outcome: 'skipped_empty',
          raw: null, code: 'empty_document_no', detail: 'Document No is empty' });
        outcomes.push({
          rawRowNo: row.rawRowNo, key: null, action: 'skipped',
          reasonCode: 'empty_document_no', reasonDetail: 'Document No is empty',
          fieldLogs,
        });
        continue;
      }

      const existing = existingByDocNo.get(row.document_no);
      const payload: Record<string, unknown> = {
        project_id: ctx.projectId,
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
        team: row.team,
        raw_payload: row.raw_payload,
        source_upload_id: ctx.batchId,
        data_source_type: 'excel_import',
        updated_by: ctx.userId,
        // Reimport = restore intent: revive any soft-deleted row so it
        // becomes visible again in Raw Data after a successful update.
        is_active: true,
      };

      if (existing) {
        updateItems.push({ row, payload, existingId: existing.id, prevPayload: existing.raw_payload || {} });
      } else {
        insertItems.push({ row, payload });
      }
    }

    // Helper to build per-row logs + changeLog after DB write succeeds.
    const buildOutcomeForUpdate = (it: UpdateItem, recordId: string) => {
      const fieldLogs: PendingFieldLog[] = [];
      const changeLog: ImportRowOutcome['changeLog'] = [];
      const push = (args: Parameters<typeof buildFieldLog>[1]) => fieldLogs.push(buildFieldLog('docs', args));
      for (const fname of ABD_TRACKED_FIELDS) {
        // Excluded fields are not written to DB on UPDATE; skip audit too.
        if (excludedFields.has(fname)) continue;
        const incoming = (it.payload as any)[fname];
        const previous = it.prevPayload[fname] ?? null;
        const cls = classifyChange(incoming, previous);
        if (cls === 'empty') continue;
        if (cls === 'unchanged') {
          push({ rawRowNo: it.row.rawRowNo, field: fname, outcome: 'unchanged', raw: incoming, applied: incoming, previous });
        } else {
          const isTbaDefault = fname === 'subcontractor_name' && incoming === 'TBA';
          push({
            rawRowNo: it.row.rawRowNo, field: fname,
            outcome: isTbaDefault ? 'auto_filled' : 'applied',
            raw: incoming, applied: incoming, previous,
            code: isTbaDefault ? 'default_tba' : null,
            detail: isTbaDefault ? 'Subcontractor not provided — defaulted to TBA' : null,
          });
          changeLog.push({ field: fname, oldValue: stringify(previous), newValue: stringify(incoming) });
        }
      }
      outcomes.push({
        rawRowNo: it.row.rawRowNo, key: it.row.document_no, action: 'updated',
        recordId, drawingId: recordId, fieldLogs, changeLog,
      });
    };

    const buildOutcomeForInsert = (it: InsertItem, recordId: string | null) => {
      const fieldLogs: PendingFieldLog[] = [];
      const changeLog: ImportRowOutcome['changeLog'] = [];
      const push = (args: Parameters<typeof buildFieldLog>[1]) => fieldLogs.push(buildFieldLog('docs', args));
      for (const fname of ABD_TRACKED_FIELDS) {
        const incoming = (it.payload as any)[fname];
        if (incoming === null || incoming === undefined || incoming === '') continue;
        const isTbaDefault = fname === 'subcontractor_name' && incoming === 'TBA';
        push({
          rawRowNo: it.row.rawRowNo, field: fname,
          outcome: isTbaDefault ? 'auto_filled' : 'applied',
          raw: incoming, applied: incoming,
          code: isTbaDefault ? 'default_tba' : null,
          detail: isTbaDefault ? 'Subcontractor not provided — defaulted to TBA' : null,
        });
        changeLog.push({ field: fname, oldValue: null, newValue: stringify(incoming) });
      }
      outcomes.push({
        rawRowNo: it.row.rawRowNo, key: it.row.document_no, action: 'inserted',
        recordId, drawingId: recordId, fieldLogs, changeLog,
      });
    };

    const recordRejection = (row: ParsedDocsRow, err: any) => {
      counters.rejected++;
      const e = fmtSupabaseError(err);
      const detail = [e.code, e.message, e.details, e.hint].filter(Boolean).join(' | ');
      const fieldLogs: PendingFieldLog[] = [];
      fieldLogs.push(buildFieldLog('docs', {
        rawRowNo: row.rawRowNo, field: '__row__', outcome: 'rejected_invalid',
        raw: row.document_no, code: e.code ?? 'db_error', detail,
      }));
      outcomes.push({
        rawRowNo: row.rawRowNo, key: row.document_no, action: 'rejected',
        reasonCode: e.code ?? 'db_error', reasonDetail: detail, fieldLogs,
      });
      if (rejectSamples.length < 5) {
        rejectSamples.push({ rawRowNo: row.rawRowNo, key: row.document_no, reasonCode: e.code, reasonDetail: detail });
      }
    };

    const totalWriteRows = insertItems.length + updateItems.length;
    let processed = 0;
    const tick = (n: number) => {
      processed += n;
      if (processed % 50 === 0 || processed >= totalWriteRows) {
        onProgress(processed, Math.max(totalWriteRows, 1));
      }
    };

    // ---- Bulk INSERT in chunks --------------------------------------------
    for (let i = 0; i < insertItems.length; i += INSERT_CHUNK) {
      const slice = insertItems.slice(i, i + INSERT_CHUNK);
      const payloads = slice.map((it) => it.payload);
      const { data, error } = await (supabase as any)
        .from('docs_drawings').insert(payloads).select('id, document_no');
      if (error) {
        // Bulk failure: fall back to per-row inserts so good rows still land
        // and we get accurate per-row reject reasons.
        for (const it of slice) {
          const { data: ins, error: e2 } = await (supabase as any)
            .from('docs_drawings').insert(it.payload).select('id').single();
          if (e2) { recordRejection(it.row, e2); continue; }
          counters.inserted++;
          buildOutcomeForInsert(it, ins?.id ?? null);
        }
      } else {
        const idByDoc = new Map<string, string>();
        for (const r of (data ?? [])) idByDoc.set(String(r.document_no), r.id);
        for (const it of slice) {
          counters.inserted++;
          buildOutcomeForInsert(it, idByDoc.get(String(it.row.document_no)) ?? null);
        }
      }
      tick(slice.length);
    }

    // ---- UPDATE pool (8 concurrent) ---------------------------------------
    // Build a sanitized payload per row: drop excluded keys (preserve existing
    // DB value) and merge raw_payload with the previously stored one so raw
    // cells from excluded headers are not lost.
    const sanitizeUpdatePayload = (it: UpdateItem): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...it.payload };
      for (const f of excludedFields) delete out[f];
      const prevRaw = (it.prevPayload && typeof it.prevPayload === 'object') ? it.prevPayload : {};
      const incomingRaw = (it.payload.raw_payload && typeof it.payload.raw_payload === 'object')
        ? (it.payload.raw_payload as Record<string, unknown>) : {};
      out.raw_payload = { ...prevRaw, ...incomingRaw };
      return out;
    };

    for (let i = 0; i < updateItems.length; i += UPDATE_CONCURRENCY) {
      const chunk = updateItems.slice(i, i + UPDATE_CONCURRENCY);
      const results = await Promise.all(
        chunk.map((it) =>
          (supabase as any).from('docs_drawings').update(sanitizeUpdatePayload(it)).eq('id', it.existingId)
            .then((r: any) => ({ it, error: r.error }))
            .catch((err: any) => ({ it, error: err })),
        ),
      );
      for (const { it, error } of results) {
        if (error) { recordRejection(it.row, error); continue; }
        counters.updated++;
        buildOutcomeForUpdate(it, it.existingId);
      }
      tick(chunk.length);
    }

    // Force a final progress tick.
    onProgress(Math.max(totalWriteRows, 1), Math.max(totalWriteRows, 1));

    await persistUnmatchedOrgs(counters.unmatchedOrgs, rows as any);
    return { outcomes, counters, rejectSamples };
  },
};

// ============================================================================
// OMM (Operation & Maintenance Manuals)
// ============================================================================

const OMM_TRACKED_FIELDS = [
  'category', 'category_group', 'section', 'work_trade_material',
  'subcontractor_id', 'subcontractor_name', 'team', 'trade',
  'training_required',
  'pdf_required_qty', 'pdf_actual_qty', 'hardcopy_required_qty', 'hardcopy_actual_qty',
  'instruction_date',
  // Legacy Draft (deprecated; kept so historical reads/diffs still work)
  'draft_planned_date', 'draft_actual_date', 'draft_response_date', 'draft_response_status',
  // Sub1 / Sub2 / Sub3 cycles
  'sub1_planned_date', 'sub1_actual_date', 'sub1_response_date', 'sub1_response_status',
  'sub2_planned_date', 'sub2_actual_date', 'sub2_response_planned_date', 'sub2_response_actual_date', 'sub2_response_status',
  'sub3_planned_date', 'sub3_actual_date', 'sub3_response_planned_date', 'sub3_response_actual_date', 'sub3_response_status',
  'final_planned_date', 'final_actual_date',
  'final_response_planned_date', 'final_response_actual_date', 'final_response_status',
  'hdec_pic_name', 'hdec_eng_name', 'remarks',
];

interface OmmExistingRow {
  id: string;
  draft_response_status: string | null;
  final_response_status: string | null;
  // Snapshot of trackable fields for diff.
  [key: string]: any;
}

async function loadExistingOmm(projectId: string): Promise<Map<string, OmmExistingRow>> {
  const map = new Map<string, OmmExistingRow>();
  const cols = ['id', 'sn', 'raw_payload', 'draft_response_status', 'final_response_status', ...OMM_TRACKED_FIELDS]
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await (supabase as any)
      .from('docs_omm')
      .select(cols)
      .eq('project_id', projectId)
      .eq('is_active', true)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.sn) map.set(String(row.sn), row);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

async function countOmmResubmissionsSince(
  projectId: string,
  sinceIso: string,
): Promise<{ total: number; byStage: { Draft: number; Final: number } }> {
  const { data } = await (supabase as any)
    .from('docs_omm')
    .select('id, current_stage, created_at')
    .eq('project_id', projectId)
    .eq('is_resubmission', true)
    .gte('created_at', sinceIso);
  const byStage = { Draft: 0, Final: 0 };
  for (const row of data ?? []) {
    if (row.current_stage === 'Draft') byStage.Draft++;
    else if (row.current_stage === 'Final') byStage.Final++;
  }
  return { total: (data ?? []).length, byStage };
}

export const ommAdapter: ImporterAdapter<ParsedOmmRow> = {
  subModule: 'omm',
  keyFieldLabel: 'SN',
  dataDateRequired: false,
  rawDataPath: '/docs/omm',
  parseFile: async (file, sheets, options) => {
    const { parseOmmExcel } = await import('@/lib/docs-omm-import-parser');
    const r = await parseOmmExcel(file, sheets, options);
    return { rows: r.rows, unknownHeaders: r.unknownHeaders, excludedFields: r.excludedFields };
  },
  getSheetNames: async (file) => {
    const { getOmmExcelSheetNames } = await import('@/lib/docs-omm-import-parser');
    return getOmmExcelSheetNames(file);
  },
  getHeaderInfo: async (file, sheets) => {
    const { getOmmHeaderInfo } = await import('@/lib/docs-omm-import-parser');
    return getOmmHeaderInfo(file, sheets);
  },
  getRowKey: (row) => row.sn ?? null,
  upsertWorker: async (ctx, rows, onProgress) => {
    const orgMaps = await buildOrgResolver();
    const existingBySn = await loadExistingOmm(ctx.projectId);
    const counters = { inserted: 0, updated: 0, skipped: 0, rejected: 0, unmatchedOrgs: new Set<string>() };
    const outcomes: ImportRowOutcome[] = [];
    const rejectSamples: DocsRejectSample[] = [];
    const importStartedAt = new Date().toISOString();
    let processed = 0;
    // User-excluded canonical fields — UPDATE branch must skip these so the
    // existing DB value is preserved (mirrors T&C / Defect importers).
    const excludedFields = ctx.excludedFields ?? new Set<string>();

    // OMM uses lower concurrency to keep the resubmission trigger ordering predictable.
    await runWithConcurrency(rows, async (row) => {
      const subId = resolveSubcontractorId(row.subcontractor_name, orgMaps);
      if (row.subcontractor_name && !subId) counters.unmatchedOrgs.add(normalizeOrgKey(row.subcontractor_name));

      const fieldLogs: PendingFieldLog[] = [];
      const pushLog = (args: Parameters<typeof buildFieldLog>[1]) =>
        fieldLogs.push(buildFieldLog('docs', args));

      const sn = row.sn ? String(row.sn).trim() : '';
      if (!sn) {
        counters.skipped++;
        pushLog({ rawRowNo: row.rawRowNo, field: 'sn', outcome: 'skipped_empty',
          raw: null, code: 'empty_sn', detail: 'SN is empty' });
        outcomes.push({
          rawRowNo: row.rawRowNo, key: null, action: 'skipped',
          reasonCode: 'empty_sn', reasonDetail: 'SN is empty', fieldLogs,
        });
        processed++;
        return;
      }

      const existing = existingBySn.get(sn);
      const payload: Record<string, unknown> = {
        project_id: ctx.projectId,
        sn,
        category: row.category,
        category_group: row.category_group,
        section: row.section,
        work_trade_material: row.work_trade_material,
        subcontractor_name: row.subcontractor_name,
        subcontractor_id: subId,
        team: row.team,
        training_required: row.training_required,
        pdf_required_qty: row.pdf_required_qty,
        pdf_actual_qty: row.pdf_actual_qty,
        hardcopy_required_qty: row.hardcopy_required_qty,
        hardcopy_actual_qty: row.hardcopy_actual_qty,
        instruction_date: row.instruction_date,
        draft_planned_date: row.draft_planned_date,
        draft_actual_date: row.draft_actual_date,
        draft_response_date: row.draft_response_date,
        draft_response_status: row.draft_response_status,
        sub1_planned_date: row.sub1_planned_date,
        sub1_actual_date: row.sub1_actual_date,
        sub1_response_date: row.sub1_response_date,
        sub1_response_status: row.sub1_response_status,
        sub2_planned_date: row.sub2_planned_date,
        sub2_actual_date: row.sub2_actual_date,
        sub2_response_planned_date: row.sub2_response_planned_date,
        sub2_response_actual_date: row.sub2_response_actual_date,
        sub2_response_status: row.sub2_response_status,
        sub3_planned_date: row.sub3_planned_date,
        sub3_actual_date: row.sub3_actual_date,
        sub3_response_planned_date: row.sub3_response_planned_date,
        sub3_response_actual_date: row.sub3_response_actual_date,
        sub3_response_status: row.sub3_response_status,
        final_planned_date: row.final_planned_date,
        final_actual_date: row.final_actual_date,
        final_response_planned_date: row.final_response_planned_date,
        final_response_actual_date: row.final_response_actual_date,
        final_response_status: row.final_response_status,
        hdec_pic_name: row.hdec_pic_name,
        hdec_eng_name: row.hdec_eng_name,
        remarks: row.remarks,
        sheet_name: row.sheetName,
        row_no: row.rawRowNo,
        raw_payload: row.raw_payload,
        source_upload_id: ctx.batchId,
        data_source_type: 'excel_import',
        updated_by: ctx.userId,
        // Reimport = restore intent (see ABD adapter).
        is_active: true,
      };

      try {
        let recordId: string | null = null;
        const changeLog: ImportRowOutcome['changeLog'] = [];
        if (existing) {
          // Sanitize UPDATE payload: drop excluded keys + merge raw_payload
          // with the previously stored one (preserve raw cells from excluded
          // headers).
          const updatePayload: Record<string, unknown> = { ...payload };
          for (const f of excludedFields) delete updatePayload[f];
          const prevRaw = ((existing as any).raw_payload && typeof (existing as any).raw_payload === 'object')
            ? (existing as any).raw_payload as Record<string, unknown>
            : {};
          updatePayload.raw_payload = { ...prevRaw, ...(row.raw_payload ?? {}) };

          const { error } = await (supabase as any)
            .from('docs_omm').update(updatePayload).eq('id', existing.id);
          if (error) throw error;
          counters.updated++;
          recordId = existing.id;
          for (const fname of OMM_TRACKED_FIELDS) {
            // Excluded fields are not written; skip audit too.
            if (excludedFields.has(fname)) continue;
            const incoming = (payload as any)[fname];
            const previous = (existing as any)[fname] ?? null;
            const cls = classifyChange(incoming, previous);
            if (cls === 'empty') continue;
            if (cls === 'unchanged') {
              pushLog({ rawRowNo: row.rawRowNo, field: fname, outcome: 'unchanged', raw: incoming, applied: incoming, previous });
            } else {
              pushLog({ rawRowNo: row.rawRowNo, field: fname, outcome: 'applied', raw: incoming, applied: incoming, previous });
              changeLog.push({ field: fname, oldValue: stringify(previous), newValue: stringify(incoming) });
            }
          }
          outcomes.push({
            rawRowNo: row.rawRowNo, key: sn, action: 'updated',
            recordId, fieldLogs, changeLog,
          });
        } else {
          const { data: ins, error } = await (supabase as any)
            .from('docs_omm').insert(payload).select('id').single();
          if (error) throw error;
          counters.inserted++;
          recordId = ins?.id ?? null;
          for (const fname of OMM_TRACKED_FIELDS) {
            const incoming = (payload as any)[fname];
            if (incoming === null || incoming === undefined || incoming === '') continue;
            pushLog({ rawRowNo: row.rawRowNo, field: fname, outcome: 'applied', raw: incoming, applied: incoming });
            changeLog.push({ field: fname, oldValue: null, newValue: stringify(incoming) });
          }
          outcomes.push({
            rawRowNo: row.rawRowNo, key: sn, action: 'inserted',
            recordId, fieldLogs, changeLog,
          });
        }
      } catch (err: any) {
        counters.rejected++;
        const e = fmtSupabaseError(err);
        const detail = [e.code, e.message, e.details, e.hint].filter(Boolean).join(' | ');
        pushLog({ rawRowNo: row.rawRowNo, field: '__row__', outcome: 'rejected_invalid',
          raw: sn, code: e.code ?? 'db_error', detail });
        outcomes.push({
          rawRowNo: row.rawRowNo, key: sn, action: 'rejected',
          reasonCode: e.code ?? 'db_error', reasonDetail: detail, fieldLogs,
        });
        if (rejectSamples.length < 5) {
          rejectSamples.push({ rawRowNo: row.rawRowNo, key: sn, reasonCode: e.code, reasonDetail: detail });
        }
      }
      processed++;
      if (processed % 25 === 0 || processed === rows.length) onProgress(processed, rows.length);
    }, Math.min(CONCURRENCY, 4));

    await persistUnmatchedOrgs(
      counters.unmatchedOrgs,
      rows.map((r) => ({ organisation_raw: r.subcontractor_name })),
    );

    // Count auto-created resubmission rows produced by docs_omm_after_update_resubmit.
    const resub = await countOmmResubmissionsSince(ctx.projectId, importStartedAt);
    return {
      outcomes, counters, rejectSamples,
      resubmissionsCreated: resub.total,
      resubmissionsByStage: resub.byStage,
    };
  },
};

// ============================================================================
// SPARE PART
// ============================================================================

const SPARE_PART_TRACKED_FIELDS = [
  'level', 'sn_outline',
  'category', 'parent_item', 'sub_category', 'spec_ref', 'material',
  'spares_requirements', 'unit', 'spares_quantity', 'storage_area_required',
  'status', 'remarks',
  'subcontractor_name', 'team', 'trade', 'hdec_pic_name', 'hdec_eng_name',
];

async function loadExistingSpareParts(projectId: string): Promise<Map<string, { id: string; raw_payload: any; [k: string]: any }>> {
  const map = new Map<string, { id: string; raw_payload: any; [k: string]: any }>();
  const cols = ['id', 'sn', 'raw_payload', ...SPARE_PART_TRACKED_FIELDS]
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await (supabase as any)
      .from('docs_spare_part')
      .select(cols)
      .eq('project_id', projectId)
      .eq('is_active', true)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.sn) map.set(String(row.sn), row);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}


export const sparePartAdapter: ImporterAdapter<ParsedSparePartRow> = {
  subModule: 'spare_part',
  keyFieldLabel: 'S/N',
  dataDateRequired: false,
  rawDataPath: '/docs/spare-part',
  parseFile: async (file, sheets, options) => {
    const { parseSparePartExcel } = await import('@/lib/docs-spare-part-import-parser');
    const r = await parseSparePartExcel(file, sheets, options);
    return { rows: r.rows, unknownHeaders: r.unknownHeaders, excludedFields: r.excludedFields };
  },
  getSheetNames: async (file) => {
    const { getSparePartExcelSheetNames } = await import('@/lib/docs-spare-part-import-parser');
    return getSparePartExcelSheetNames(file);
  },
  getHeaderInfo: async (file, sheets) => {
    const { getSparePartHeaderInfo } = await import('@/lib/docs-spare-part-import-parser');
    return getSparePartHeaderInfo(file, sheets);
  },
  getRowKey: (row) => row.sn ?? null,
  upsertWorker: async (ctx, rows, onProgress) => {
    const orgMaps = await buildOrgResolver();
    const existingBySn = await loadExistingSpareParts(ctx.projectId);
    const counters = { inserted: 0, updated: 0, skipped: 0, rejected: 0, unmatchedOrgs: new Set<string>() };
    const outcomes: ImportRowOutcome[] = [];
    const rejectSamples: DocsRejectSample[] = [];
    const excludedFields = ctx.excludedFields ?? new Set<string>();

    const INSERT_CHUNK = 200;
    const UPDATE_CONCURRENCY = 8;
    type InsertItem = { row: ParsedSparePartRow; payload: Record<string, unknown> };
    type UpdateItem = { row: ParsedSparePartRow; payload: Record<string, unknown>; existingId: string; prev: any };
    const insertItems: InsertItem[] = [];
    const updateItems: UpdateItem[] = [];

    for (const row of rows) {
      const subId = resolveSubcontractorId(row.subcontractor_name, orgMaps);
      if (row.subcontractor_name && !subId) counters.unmatchedOrgs.add(normalizeOrgKey(row.subcontractor_name));

      const fieldLogs: PendingFieldLog[] = [];
      const pushLog = (args: Parameters<typeof buildFieldLog>[1]) => fieldLogs.push(buildFieldLog('docs', args));

      const sn = row.sn ? String(row.sn).trim() : '';
      // Need at least one of material / spares_requirements / spares_quantity.
      if (!sn || (!row.material && !row.spares_requirements && !row.spares_quantity && !row.parent_item)) {
        counters.skipped++;
        pushLog({ rawRowNo: row.rawRowNo, field: '__row__', outcome: 'skipped_empty',
          raw: null, code: 'empty_row', detail: 'Row has no spare-part data' });
        outcomes.push({
          rawRowNo: row.rawRowNo, key: sn || null, action: 'skipped',
          reasonCode: 'empty_row', reasonDetail: 'Row has no spare-part data', fieldLogs,
        });
        continue;
      }

      const existing = existingBySn.get(sn);
      const payload: Record<string, unknown> = {
        project_id: ctx.projectId,
        sn,
        category: row.category,
        parent_item: row.parent_item,
        spec_ref: row.spec_ref,
        material: row.material,
        spares_requirements: row.spares_requirements,
        unit: row.unit,
        spares_quantity: row.spares_quantity,
        storage_area_required: row.storage_area_required,
        status: row.status,
        remarks: row.remarks,
        subcontractor_name: row.subcontractor_name,
        team: row.team,
        trade: row.trade,
        hdec_pic_name: row.hdec_pic_name,
        hdec_eng_name: row.hdec_eng_name,
        sheet_name: row.sheetName,
        row_no: row.rawRowNo,
        raw_payload: row.raw_payload,
        source_upload_id: ctx.batchId,
        data_source_type: 'excel_import',
        updated_by: ctx.userId,
        // Reimport = restore intent (see ABD adapter).
        is_active: true,
      };

      if (existing) {
        updateItems.push({ row, payload, existingId: existing.id, prev: existing });
      } else {
        insertItems.push({ row, payload });
      }
    }

    const buildOutcomeForUpdate = (it: UpdateItem, recordId: string) => {
      const fieldLogs: PendingFieldLog[] = [];
      const changeLog: ImportRowOutcome['changeLog'] = [];
      const push = (args: Parameters<typeof buildFieldLog>[1]) => fieldLogs.push(buildFieldLog('docs', args));
      for (const fname of SPARE_PART_TRACKED_FIELDS) {
        if (excludedFields.has(fname)) continue;
        const incoming = (it.payload as any)[fname];
        const previous = (it.prev as any)[fname] ?? null;
        const cls = classifyChange(incoming, previous);
        if (cls === 'empty') continue;
        if (cls === 'unchanged') {
          push({ rawRowNo: it.row.rawRowNo, field: fname, outcome: 'unchanged', raw: incoming, applied: incoming, previous });
        } else {
          push({ rawRowNo: it.row.rawRowNo, field: fname, outcome: 'applied', raw: incoming, applied: incoming, previous });
          changeLog.push({ field: fname, oldValue: stringify(previous), newValue: stringify(incoming) });
        }
      }
      outcomes.push({ rawRowNo: it.row.rawRowNo, key: it.row.sn, action: 'updated', recordId, fieldLogs, changeLog });
    };

    const buildOutcomeForInsert = (it: InsertItem, recordId: string | null) => {
      const fieldLogs: PendingFieldLog[] = [];
      const changeLog: ImportRowOutcome['changeLog'] = [];
      const push = (args: Parameters<typeof buildFieldLog>[1]) => fieldLogs.push(buildFieldLog('docs', args));
      for (const fname of SPARE_PART_TRACKED_FIELDS) {
        const incoming = (it.payload as any)[fname];
        if (incoming === null || incoming === undefined || incoming === '') continue;
        push({ rawRowNo: it.row.rawRowNo, field: fname, outcome: 'applied', raw: incoming, applied: incoming });
        changeLog.push({ field: fname, oldValue: null, newValue: stringify(incoming) });
      }
      outcomes.push({ rawRowNo: it.row.rawRowNo, key: it.row.sn, action: 'inserted', recordId, fieldLogs, changeLog });
    };

    const recordRejection = (row: ParsedSparePartRow, err: any) => {
      counters.rejected++;
      const e = fmtSupabaseError(err);
      const detail = [e.code, e.message, e.details, e.hint].filter(Boolean).join(' | ');
      const fieldLogs: PendingFieldLog[] = [];
      fieldLogs.push(buildFieldLog('docs', {
        rawRowNo: row.rawRowNo, field: '__row__', outcome: 'rejected_invalid',
        raw: row.sn, code: e.code ?? 'db_error', detail,
      }));
      outcomes.push({
        rawRowNo: row.rawRowNo, key: row.sn, action: 'rejected',
        reasonCode: e.code ?? 'db_error', reasonDetail: detail, fieldLogs,
      });
      if (rejectSamples.length < 5) {
        rejectSamples.push({ rawRowNo: row.rawRowNo, key: row.sn, reasonCode: e.code, reasonDetail: detail });
      }
    };

    const totalWriteRows = insertItems.length + updateItems.length;
    let processed = 0;
    const tick = (n: number) => {
      processed += n;
      if (processed % 50 === 0 || processed >= totalWriteRows) {
        onProgress(processed, Math.max(totalWriteRows, 1));
      }
    };

    for (let i = 0; i < insertItems.length; i += INSERT_CHUNK) {
      const slice = insertItems.slice(i, i + INSERT_CHUNK);
      const payloads = slice.map((it) => it.payload);
      const { data, error } = await (supabase as any)
        .from('docs_spare_part').insert(payloads).select('id, sn');
      if (error) {
        for (const it of slice) {
          const { data: ins, error: e2 } = await (supabase as any)
            .from('docs_spare_part').insert(it.payload).select('id').single();
          if (e2) { recordRejection(it.row, e2); continue; }
          counters.inserted++;
          buildOutcomeForInsert(it, ins?.id ?? null);
        }
      } else {
        const idBySn = new Map<string, string>();
        for (const r of (data ?? [])) idBySn.set(String(r.sn), r.id);
        for (const it of slice) {
          counters.inserted++;
          buildOutcomeForInsert(it, idBySn.get(String(it.row.sn)) ?? null);
        }
      }
      tick(slice.length);
    }

    const sanitizeUpdatePayload = (it: UpdateItem): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...it.payload };
      for (const f of excludedFields) delete out[f];
      const prevRaw = (it.prev?.raw_payload && typeof it.prev.raw_payload === 'object') ? it.prev.raw_payload : {};
      const incomingRaw = (it.payload.raw_payload && typeof it.payload.raw_payload === 'object')
        ? (it.payload.raw_payload as Record<string, unknown>) : {};
      out.raw_payload = { ...prevRaw, ...incomingRaw };
      return out;
    };

    for (let i = 0; i < updateItems.length; i += UPDATE_CONCURRENCY) {
      const chunk = updateItems.slice(i, i + UPDATE_CONCURRENCY);
      const results = await Promise.all(
        chunk.map((it) =>
          (supabase as any).from('docs_spare_part').update(sanitizeUpdatePayload(it)).eq('id', it.existingId)
            .then((r: any) => ({ it, error: r.error }))
            .catch((err: any) => ({ it, error: err })),
        ),
      );
      for (const { it, error } of results) {
        if (error) { recordRejection(it.row, error); continue; }
        counters.updated++;
        buildOutcomeForUpdate(it, it.existingId);
      }
      tick(chunk.length);
    }

    onProgress(Math.max(totalWriteRows, 1), Math.max(totalWriteRows, 1));
    await persistUnmatchedOrgs(
      counters.unmatchedOrgs,
      rows.map((r) => ({ organisation_raw: r.subcontractor_name })),
    );
    return { outcomes, counters, rejectSamples };
  },
};

export function adapterFor(subModule: 'as_built' | 'omm' | 'spare_part'): ImporterAdapter<any> {
  if (subModule === 'as_built') return abdAdapter;
  if (subModule === 'omm') return ommAdapter;
  return sparePartAdapter;
}

export type { WorkerContext };
