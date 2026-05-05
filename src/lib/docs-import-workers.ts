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
    return { rows: r.rows, unknownHeaders: r.unknownHeaders };
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
    let processed = 0;

    await runWithConcurrency(rows, async (row) => {
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
        processed++;
        return;
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
      };

      try {
        let recordId: string | null = null;
        const changeLog: ImportRowOutcome['changeLog'] = [];
        if (existing) {
          const { error } = await (supabase as any)
            .from('docs_drawings').update(payload).eq('id', existing.id);
          if (error) throw error;
          counters.updated++;
          recordId = existing.id;
          const prev: any = existing.raw_payload || {};
          for (const fname of ABD_TRACKED_FIELDS) {
            const incoming = (payload as any)[fname];
            const previous = prev[fname] ?? null;
            const cls = classifyChange(incoming, previous);
            if (cls === 'empty') continue;
            if (cls === 'unchanged') {
              pushLog({ rawRowNo: row.rawRowNo, field: fname, outcome: 'unchanged', raw: incoming, applied: incoming, previous });
            } else {
              const isTbaDefault = fname === 'subcontractor_name' && incoming === 'TBA';
              pushLog({
                rawRowNo: row.rawRowNo, field: fname,
                outcome: isTbaDefault ? 'auto_filled' : 'applied',
                raw: incoming, applied: incoming, previous,
                code: isTbaDefault ? 'default_tba' : null,
                detail: isTbaDefault ? 'Subcontractor not provided — defaulted to TBA' : null,
              });
              changeLog.push({ field: fname, oldValue: stringify(previous), newValue: stringify(incoming) });
            }
          }
          outcomes.push({
            rawRowNo: row.rawRowNo, key: row.document_no, action: 'updated',
            recordId, drawingId: recordId, fieldLogs, changeLog,
          });
        } else {
          const { data: ins, error } = await (supabase as any)
            .from('docs_drawings').insert(payload).select('id').single();
          if (error) throw error;
          counters.inserted++;
          recordId = ins?.id ?? null;
          for (const fname of ABD_TRACKED_FIELDS) {
            const incoming = (payload as any)[fname];
            if (incoming === null || incoming === undefined || incoming === '') continue;
            const isTbaDefault = fname === 'subcontractor_name' && incoming === 'TBA';
            pushLog({
              rawRowNo: row.rawRowNo, field: fname,
              outcome: isTbaDefault ? 'auto_filled' : 'applied',
              raw: incoming, applied: incoming,
              code: isTbaDefault ? 'default_tba' : null,
              detail: isTbaDefault ? 'Subcontractor not provided — defaulted to TBA' : null,
            });
            changeLog.push({ field: fname, oldValue: null, newValue: stringify(incoming) });
          }
          outcomes.push({
            rawRowNo: row.rawRowNo, key: row.document_no, action: 'inserted',
            recordId, drawingId: recordId, fieldLogs, changeLog,
          });
        }
      } catch (err: any) {
        counters.rejected++;
        const e = fmtSupabaseError(err);
        const detail = [e.code, e.message, e.details, e.hint].filter(Boolean).join(' | ');
        pushLog({ rawRowNo: row.rawRowNo, field: '__row__', outcome: 'rejected_invalid',
          raw: row.document_no, code: e.code ?? 'db_error', detail });
        outcomes.push({
          rawRowNo: row.rawRowNo, key: row.document_no, action: 'rejected',
          reasonCode: e.code ?? 'db_error', reasonDetail: detail, fieldLogs,
        });
        if (rejectSamples.length < 5) {
          rejectSamples.push({ rawRowNo: row.rawRowNo, key: row.document_no, reasonCode: e.code, reasonDetail: detail });
        }
      }
      processed++;
      if (processed % 25 === 0 || processed === rows.length) onProgress(processed, rows.length);
    }, CONCURRENCY);

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
  'draft_planned_date', 'draft_actual_date', 'draft_response_date', 'draft_response_status',
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
  const cols = ['id', 'sn', 'draft_response_status', 'final_response_status', ...OMM_TRACKED_FIELDS]
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
    return { rows: r.rows, unknownHeaders: r.unknownHeaders };
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
      };

      try {
        let recordId: string | null = null;
        const changeLog: ImportRowOutcome['changeLog'] = [];
        if (existing) {
          const { error } = await (supabase as any)
            .from('docs_omm').update(payload).eq('id', existing.id);
          if (error) throw error;
          counters.updated++;
          recordId = existing.id;
          for (const fname of OMM_TRACKED_FIELDS) {
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

export function adapterFor(subModule: 'as_built' | 'omm'): ImporterAdapter<any> {
  return subModule === 'as_built' ? abdAdapter : ommAdapter;
}

export type { WorkerContext };
