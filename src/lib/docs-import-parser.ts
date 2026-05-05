import * as XLSX from 'xlsx';
import { normalizeDate } from '@/lib/defect-parser';
import { normalizeApprovalStatus, clearCyclesAfterClosure, computeOverallStatus } from '@/lib/docs-status';
import { getMappedField } from '@/lib/header-mappings-cache';
import { normalizeTeamValue } from '@/types/enums';

/**
 * Docs (As-Built Drawings) Excel parser.
 *
 * Behaviour:
 *  - Default: ONLY parse sheets whose name contains "register" (case-insensitive,
 *    whitespace-trimmed). Summary / dashboard sheets are skipped automatically.
 *  - Two-row banded headers (row N = group like "SUBMISSION 1", row N+1 = sub
 *    like "PLANNED DATE") are detected and combined into composite header keys
 *    such as "submission 1 | planned date".
 *  - Group headers are forward-filled across the columns covered by their
 *    merged cell (typical Aconex export pattern).
 *  - Every column with a non-empty header is captured into raw_payload, even
 *    if it does not map to a structured field.
 */

export interface ParsedDocsRow {
  rawRowNo: number;
  sheetName: string;
  // Identity
  document_no: string;
  revision: string | null;
  title: string | null;
  // Org / classification
  organisation_raw: string | null;
  discipline: string | null;
  document_type: string | null;
  series: string | null;
  level_location: string | null;
  sequential_no: string | null;
  // Status
  current_status: string | null;       // "Status" column on row
  aconex_status: string | null;        // back-compat (last known approval status)
  is_submitted: boolean;
  // Submission tracking (1/2/3)
  sub1_planned_date: string | null;
  sub1_submission_date: string | null;
  sub1_approval_date: string | null;
  sub1_approval_status: string | null;
  sub2_planned_date: string | null;
  sub2_submission_date: string | null;
  sub2_approval_date: string | null;
  sub2_approval_status: string | null;
  sub3_planned_date: string | null;
  sub3_submission_date: string | null;
  sub3_approval_date: string | null;
  sub3_approval_status: string | null;
  // Legacy aliases (filled from sub1.*) so existing dashboards keep working
  submitted_date: string | null;
  approved_date: string | null;
  // Transmittal
  transmittal_number: string | null;
  transmittal_due_date: string | null;
  days_due: number | null;
  // HDEC personnel (planned for future Excel column; nullable today)
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  // Subcontractor (user-managed; not in Excel — defaults to 'TBA')
  subcontractor_name: string | null;
  // Team (enum: Mech / Elec / Arch / Supp / Design)
  team: string | null;
  // Misc
  remarks: string | null;
  raw_payload: Record<string, unknown>;
}

export interface ParseDocsResult {
  rows: ParsedDocsRow[];
  sheetCount: number;
  sheets: Array<{ name: string; headerCount: number; rowCount: number; discipline: string | null }>;
  unknownHeaders: string[];
  /** Canonical field names the user excluded via the column-select dialog.
   *  Workers consult this set during UPDATE to skip those keys, preserving
   *  the existing DB value. System-required fields (document_no) are forcibly
   *  removed so they can never be excluded. */
  excludedFields: Set<string>;
}

type FieldKey =
  | 'document_no' | 'revision' | 'title' | 'organisation_raw'
  | 'discipline' | 'document_type' | 'series' | 'level_location' | 'sequential_no'
  | 'trade'
  | 'team'
  | 'current_status' | 'remarks'
  | 'sub1_planned_date' | 'sub1_submission_date' | 'sub1_approval_date' | 'sub1_approval_status'
  | 'sub2_planned_date' | 'sub2_submission_date' | 'sub2_approval_date' | 'sub2_approval_status'
  | 'sub3_planned_date' | 'sub3_submission_date' | 'sub3_approval_date' | 'sub3_approval_status'
  | 'transmittal_number' | 'transmittal_due_date' | 'days_due'
  | 'hdec_pic_name' | 'hdec_eng_name'
  | 'subcontractor_name';

/** Canonical alias map for single-row headers (no submission-group context). */
const FIELD_ALIASES: Record<string, FieldKey | 'skip'> = {
  // identity
  'document no': 'document_no',
  'document number': 'document_no',
  'doc no': 'document_no',
  'doc number': 'document_no',
  'drawing no': 'document_no',
  'drawing number': 'document_no',
  'dwg no': 'document_no',
  'as-built dwg number': 'document_no',
  'as built dwg number': 'document_no',
  'as built dwg no': 'document_no',
  'as-built dwg no': 'document_no',
  'document id': 'document_no',
  // revision
  'rev': 'revision',
  'revision': 'revision',
  'rev no': 'revision',
  // title
  'title': 'title',
  'document title': 'title',
  'drawing title': 'title',
  'as-built dwg title': 'title',
  'as built dwg title': 'title',
  'description': 'title',
  // org
  'organisation': 'organisation_raw',
  'organization': 'organisation_raw',
  'org': 'organisation_raw',
  'company': 'organisation_raw',
  'subcontractor': 'organisation_raw',
  'vendor': 'organisation_raw',
  'originator': 'organisation_raw',
  // discipline
  'discipline': 'discipline',
  'discipline/role': 'discipline',
  'discipline / role': 'discipline',
  'trade': 'trade',
  'work category': 'trade',
  'category': 'trade',
  'discipline category': 'trade',
  'trade category': 'trade',
  // team
  'team': 'team',
  'team name': 'team',
  'discipline team': 'team',
  // type / series / level
  'document type': 'document_type',
  'document/ drawing type': 'document_type',
  'document / drawing type': 'document_type',
  'doc type': 'document_type',
  'type': 'document_type',
  'package': 'document_type',
  'series': 'series',
  'level/ location': 'level_location',
  'level / location': 'level_location',
  'level location': 'level_location',
  'level': 'level_location',
  'location': 'level_location',
  'sequential no.': 'sequential_no',
  'sequential no': 'sequential_no',
  'seq no': 'sequential_no',
  'sequence no': 'sequential_no',
  // status (row-level)
  'status': 'current_status',
  'aconex status': 'current_status',
  'overall status': 'current_status',
  'overall': 'current_status',
  // remarks
  'remarks': 'remarks',
  'remark': 'remarks',
  'comments': 'remarks',
  'note': 'remarks',
  'notes': 'remarks',
  // transmittal
  'transmittal number': 'transmittal_number',
  'transmittal no': 'transmittal_number',
  'transmittal due date': 'transmittal_due_date',
  'days due': 'days_due',
  // HDEC personnel (future Excel columns)
  'hdec pic': 'hdec_pic_name',
  'hdec p.i.c': 'hdec_pic_name',
  'hdec p.i.c.': 'hdec_pic_name',
  'hdec person in charge': 'hdec_pic_name',
  'pic': 'hdec_pic_name',
  'hdec eng': 'hdec_eng_name',
  'hdec engineer': 'hdec_eng_name',
  'hdec engineering': 'hdec_eng_name',
  // Subcontractor (user-managed)
  'sub-contractor': 'subcontractor_name',
  'sub contractor': 'subcontractor_name',
  'subcontractor name': 'subcontractor_name',
  // skip pure index column
  's. no.': 'skip',
  's. no': 'skip',
  's/no.': 'skip',
  's/no': 'skip',
  'no.': 'skip',
  'sno': 'skip',
  'drawing register': 'skip',
  // SHAW export system columns / non-importable derived fields
  'risk': 'skip',
  'cycle progress': 'skip',
  'cycle_progress': 'skip',
};

/** Sub-column alias inside Submission group → suffix used to compose field key. */
const SUB_ALIAS: Record<string, 'planned_date' | 'submission_date' | 'approval_date' | 'approval_status'> = {
  'planned date': 'planned_date',
  'submission date': 'submission_date',
  'approval date': 'approval_date',
  'approval status': 'approval_status',
};

/**
 * Strip leading ordinal token (1st, 2nd, 3rd, 4th, first, second, third) from a
 * normalized sub-header so labels like "1st planned date" match SUB_ALIAS.
 * Group context (Submission 1/2/3) already encodes the cycle number, so the
 * ordinal in the sub-cell is redundant and only used by the source spreadsheet
 * for human readability.
 */
function stripOrdinalPrefix(s: string): string {
  return s.replace(/^\s*(?:1st|2nd|3rd|\d+th|first|second|third|fourth)\s+/i, '').trim();
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\s*\(H\)\s*$/i, '')
    .replace(/[\t\n\r]+/g, ' ')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Parse "Submission 1" / "Aconex Submission 2" group header → 1|2|3 or null. */
function parseSubmissionGroup(label: string | null | undefined): 1 | 2 | 3 | null {
  if (!label) return null;
  const m = String(label).toLowerCase().match(/submission\s*([123])/);
  if (!m) return null;
  return Number(m[1]) as 1 | 2 | 3;
}

function mapHeader(header: string): FieldKey | 'skip' | null {
  const rawTrim = String(header ?? '').trim();
  if (rawTrim.startsWith('__')) return 'skip';
  const norm = normalizeHeader(header);
  if (!norm) return 'skip';
  const exact = FIELD_ALIASES[norm];
  if (exact) return exact;
  // SHAW export single-row sub-cycle labels: "1st planned submission" etc.
  const subMatch = norm.match(/^(1st|2nd|3rd)\s+(planned|actual)\s+(submission|response)$/);
  if (subMatch) {
    const n = subMatch[1] === '1st' ? 1 : subMatch[1] === '2nd' ? 2 : 3;
    const kind = subMatch[2]; // planned | actual
    const target = subMatch[3]; // submission | response
    let suffix: 'planned_date' | 'submission_date' | 'approval_date' | 'actual_response_date';
    if (kind === 'planned' && target === 'submission') suffix = 'planned_date';
    else if (kind === 'actual' && target === 'submission') suffix = 'submission_date';
    else if (kind === 'planned' && target === 'response') suffix = 'approval_date';
    else suffix = 'actual_response_date';
    return `sub${n}_${suffix}` as FieldKey;
  }
  const statusMatch = norm.match(/^(1st|2nd|3rd)\s+status$/);
  if (statusMatch) {
    const n = statusMatch[1] === '1st' ? 1 : statusMatch[1] === '2nd' ? 2 : 3;
    return `sub${n}_approval_status` as FieldKey;
  }
  // Heuristics
  if (norm.includes('document') && norm.includes('no')) return 'document_no';
  if (norm.includes('drawing') && norm.includes('no')) return 'document_no';
  if (norm.includes('dwg') && norm.includes('number')) return 'document_no';
  if (norm.includes('rev') && norm.length <= 12) return 'revision';
  if (norm.includes('title')) return 'title';
  if (norm.includes('discipline')) return 'discipline';
  if (norm === 'status') return 'current_status';
  if (norm.includes('overall') && norm.includes('status')) return 'current_status';
  if (norm.includes('transmittal') && norm.includes('due')) return 'transmittal_due_date';
  if (norm.includes('transmittal')) return 'transmittal_number';
  if (norm.includes('days due')) return 'days_due';
  if (norm.includes('remark') || norm.includes('comment')) return 'remarks';
  if (norm.includes('organisation') || norm.includes('organization') || norm.includes('vendor')) return 'organisation_raw';
  if (norm.includes('series')) return 'series';
  if (norm.includes('level') || norm.includes('location')) return 'level_location';
  if (norm.includes('sequential')) return 'sequential_no';
  if (norm.includes('hdec') && (norm.includes('pic') || norm.includes('person'))) return 'hdec_pic_name';
  if (norm.includes('hdec') && norm.includes('eng')) return 'hdec_eng_name';
  if (norm.includes('sub') && norm.includes('contractor')) return 'subcontractor_name';
  if (norm === 'team' || norm.endsWith(' team') || norm.startsWith('team ')) return 'team';
  // DB-driven mapping fallback (Admin-managed aliases)
  const dbMapped = getMappedField('docs', norm, 'as_built');
  if (dbMapped && dbMapped !== 'skip') return dbMapped as FieldKey;
  if (dbMapped === 'skip') return 'skip';
  return null;
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isApprovedStatus(status: string | null): boolean {
  if (!status) return false;
  const v = status.trim().toUpperCase();
  if (v === 'A' || v === 'B') return true;
  if (v.startsWith('APPROV')) return true;
  if (v.startsWith('SUBMIT')) return true;
  if (v === 'CLOSED') return true;
  return false;
}

function disciplineFromSheetName(name: string): string | null {
  const v = name.toLowerCase();
  if (/\barc\b|\barchi/.test(v)) return 'ARCH';
  if (/\bid\b|interior/.test(v)) return 'ID';
  if (/\bsg\b|signage/.test(v)) return 'SG';
  if (/\bstr\b|struct/.test(v)) return 'STR';
  if (/\bfc\b|facade/.test(v)) return 'FC';
  if (/\bla\b|landscape/.test(v)) return 'LA';
  if (/\bmech|hvac/.test(v)) return 'MECH';
  if (/\belec|\belv/.test(v)) return 'ELEC';
  return null;
}

/**
 * Detect the 1- or 2-row banded header.
 * Returns: header row indices + per-column composite header info.
 */
interface DetectedHeader {
  groupRowIdx: number | null;
  subRowIdx: number;
  /** Per-column: { group, sub, composite, mapped } */
  cols: Array<{
    group: string | null;
    sub: string;
    composite: string;
    field: FieldKey | null;
    submissionN: 1 | 2 | 3 | null;
  }>;
}

function detectHeader(matrix: unknown[][]): DetectedHeader | null {
  const limit = Math.min(matrix.length, 25);
  // Find best-scoring 2-row pair: score = mapped fields when combining row r (group) + row r+1 (sub).
  let best: { score: number; groupIdx: number | null; subIdx: number } | null = null;

  const tryScore = (groupIdx: number | null, subIdx: number) => {
    const subRow = matrix[subIdx] ?? [];
    const groupRow = groupIdx != null ? (matrix[groupIdx] ?? []) : [];
    // Forward-fill group across columns where it's blank (covers merged cells)
    const filledGroup: (string | null)[] = [];
    let last: string | null = null;
    for (let c = 0; c < Math.max(subRow.length, groupRow.length); c++) {
      const v = String(groupRow[c] ?? '').trim();
      if (v) last = v;
      filledGroup.push(last);
    }
    let score = 0;
    for (let c = 0; c < subRow.length; c++) {
      const sub = String(subRow[c] ?? '').trim();
      const grp = filledGroup[c];
      const subNorm = stripOrdinalPrefix(normalizeHeader(sub));
      const grpN = parseSubmissionGroup(grp);
      if (grpN && SUB_ALIAS[subNorm]) { score += 2; continue; }
      const m = mapHeader(sub);
      if (m && m !== 'skip') score++;
    }
    if (!best || score > best.score) best = { score, groupIdx, subIdx };
  };

  for (let r = 0; r < limit; r++) {
    tryScore(null, r);              // single-row header at r
    if (r + 1 < limit) tryScore(r, r + 1);  // group=r, sub=r+1
  }
  if (!best || best.score < 3) return null;

  const subRow = matrix[best.subIdx] ?? [];
  const groupRow = best.groupIdx != null ? (matrix[best.groupIdx] ?? []) : [];
  const filledGroup: (string | null)[] = [];
  let last: string | null = null;
  for (let c = 0; c < Math.max(subRow.length, groupRow.length); c++) {
    const v = String(groupRow[c] ?? '').trim();
    if (v) last = v;
    filledGroup.push(last);
  }

  const cols: DetectedHeader['cols'] = [];
  for (let c = 0; c < subRow.length; c++) {
    const sub = String(subRow[c] ?? '').trim();
    const grp = filledGroup[c];
    const subNorm = stripOrdinalPrefix(normalizeHeader(sub));
    const grpNorm = normalizeHeader(grp);
    const submissionN = parseSubmissionGroup(grp);
    let field: FieldKey | null = null;
    let composite = sub || grp || '';

    if (submissionN && SUB_ALIAS[subNorm]) {
      const suffix = SUB_ALIAS[subNorm];
      field = `sub${submissionN}_${suffix}` as FieldKey;
      composite = `${grp} | ${sub}`;
    } else if (sub) {
      const m = mapHeader(sub);
      if (m && m !== 'skip') field = m;
      composite = sub;
    } else if (grp) {
      const m = mapHeader(grp);
      if (m && m !== 'skip') field = m;
      composite = grp;
    }
    cols.push({
      group: grp,
      sub,
      composite: composite.trim(),
      field,
      submissionN,
    });
  }

  return { groupRowIdx: best.groupIdx, subRowIdx: best.subIdx, cols };
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

function isRegisterSheet(name: string): boolean {
  const v = name.toLowerCase();
  return v.includes('register') || v.includes('drawings');
}

export async function getDocsExcelSheetNames(file: File): Promise<string[]> {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: 'array' });
  // Default behaviour: only "register" sheets are surfaced for import.
  return workbook.SheetNames.filter(isRegisterSheet);
}

/**
 * Inspect the workbook and return every detected composite header label across the
 * given sheets (defaults to register sheets), plus a first non-empty sample value
 * per header and the structured field it maps to. Used by the column-select
 * dialog in the Docs import UI.
 */
export async function getDocsHeaderInfo(
  file: File,
  selectedSheets?: string[],
): Promise<{
  headers: string[];
  samples: Record<string, unknown>;
  fieldByHeader: Record<string, string | null>;
}> {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: 'array' });
  const targetSheets = (selectedSheets?.length
    ? selectedSheets
    : workbook.SheetNames.filter(isRegisterSheet));
  const headerOrder: string[] = [];
  const seen = new Set<string>();
  const samples: Record<string, unknown> = {};
  const fieldByHeader: Record<string, string | null> = {};
  for (const sheetName of targetSheets) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
    const detected = detectHeader(matrix);
    if (!detected) continue;
    for (const col of detected.cols) {
      const label = col.composite;
      if (!label) continue;
      if (!seen.has(label)) {
        seen.add(label);
        headerOrder.push(label);
        fieldByHeader[label] = col.field ?? null;
      }
    }
    const startRow = detected.subRowIdx + 1;
    const lastRow = Math.min(matrix.length, startRow + 20);
    for (let r = startRow; r < lastRow; r++) {
      const dataRow = matrix[r] ?? [];
      for (let c = 0; c < detected.cols.length; c++) {
        const label = detected.cols[c].composite;
        if (!label || samples[label] != null) continue;
        const v = dataRow[c];
        if (v != null && String(v).trim() !== '') samples[label] = v;
      }
    }
  }
  return { headers: headerOrder, samples, fieldByHeader };
}

export async function parseDocsExcel(
  file: File,
  /** When provided, overrides the default register-only filter. */
  selectedSheets?: string[],
  options?: { excludedHeaders?: string[] },
): Promise<ParseDocsResult> {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: 'array' });
  const targetSheets = (selectedSheets?.length
    ? selectedSheets
    : workbook.SheetNames.filter(isRegisterSheet));
  const excludedSet = new Set((options?.excludedHeaders ?? []).map((h) => h.trim()).filter(Boolean));
  // Canonical field names the user excluded — built up while iterating header
  // columns inside each sheet. Workers use this to skip those keys on UPDATE
  // so existing DB values are preserved.
  const excludedFields = new Set<string>();


  const rows: ParsedDocsRow[] = [];
  const sheetSummary: ParseDocsResult['sheets'] = [];
  const unknownHeaderSet = new Set<string>();

  for (const sheetName of targetSheets) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
    const detected = detectHeader(matrix);
    const sheetDiscipline = disciplineFromSheetName(sheetName);
    if (!detected) {
      sheetSummary.push({ name: sheetName, headerCount: 0, rowCount: 0, discipline: sheetDiscipline });
      continue;
    }
    // Track unknown headers (have content but no field mapping).
    for (const col of detected.cols) {
      if (!col.field && col.composite) {
        unknownHeaderSet.add(col.composite);
      }
    }

    const startRow = detected.subRowIdx + 1;
    let sheetRowCount = 0;
    for (let r = startRow; r < matrix.length; r++) {
      const dataRow = matrix[r] ?? [];
      const payload: Record<string, unknown> = {};
      const struct: Partial<Record<FieldKey, any>> = {};

      for (let c = 0; c < detected.cols.length; c++) {
        const col = detected.cols[c];
        const value = dataRow[c];
        const isExcluded = !!(col.composite && excludedSet.has(col.composite));
        if (col.composite) payload[col.composite] = value;
        // Track which canonical fields were excluded (skip the system-required key).
        if (isExcluded && col.field && col.field !== 'document_no') {
          excludedFields.add(col.field);
        }
        if (!col.field || isExcluded) continue;
        if (col.field.endsWith('_date') || col.field === 'transmittal_due_date') {
          struct[col.field] = normalizeDate(value);
        } else if (col.field === 'days_due') {
          struct[col.field] = toNumber(value);
        } else {
          struct[col.field] = toText(value);
        }
      }

      const docNoRaw = struct.document_no ? String(struct.document_no).trim() : '';
      // Skip rows with no doc number AND no submission/title content (sub-headers, totals)
      if (!docNoRaw) continue;
      // Strip leading whitespace/control chars often present in source ("\t\nHDEC-...")
      const docNo = docNoRaw.replace(/^[\s\t\n\r]+/, '').replace(/\s+$/, '');

      // Discipline fallback chain
      let discipline = struct.discipline ?? null;
      if (!discipline) discipline = sheetDiscipline;

      // v2: normalize cycle approval statuses to A/B/C/null only.
      const sub1Status = normalizeApprovalStatus(struct.sub1_approval_status ?? null);
      const sub2Status = normalizeApprovalStatus(struct.sub2_approval_status ?? null);
      const sub3Status = normalizeApprovalStatus(struct.sub3_approval_status ?? null);

      // Aconex status fallback (back-compat field): prefer current_status, then normalized cycle status.
      const aconexStatus = struct.current_status
        ?? sub1Status
        ?? sub2Status
        ?? sub3Status
        ?? null;

      // Back-compat is_submitted: any cycle reached A/B/C OR any submission date set.
      const isSubmitted =
        sub1Status != null
        || sub2Status != null
        || sub3Status != null
        || !!struct.sub1_submission_date
        || !!struct.sub2_submission_date
        || !!struct.sub3_submission_date;

      // v2: subcontractor_name defaults to 'TBA' if Excel has no value.
      const subcontractorName =
        struct.subcontractor_name && String(struct.subcontractor_name).trim()
          ? String(struct.subcontractor_name).trim()
          : 'TBA';

      // Clear later cycles when an earlier cycle is 'A' (closed).
      const cleaned = clearCyclesAfterClosure({
        sub1_planned_date: struct.sub1_planned_date ?? null,
        sub1_submission_date: struct.sub1_submission_date ?? null,
        sub1_approval_date: struct.sub1_approval_date ?? null,
        sub1_actual_response_date: null,
        sub1_approval_status: sub1Status,
        sub2_planned_date: struct.sub2_planned_date ?? null,
        sub2_submission_date: struct.sub2_submission_date ?? null,
        sub2_approval_date: struct.sub2_approval_date ?? null,
        sub2_actual_response_date: null,
        sub2_approval_status: sub2Status,
        sub3_planned_date: struct.sub3_planned_date ?? null,
        sub3_submission_date: struct.sub3_submission_date ?? null,
        sub3_approval_date: struct.sub3_approval_date ?? null,
        sub3_actual_response_date: null,
        sub3_approval_status: sub3Status,
      });

      rows.push({
        rawRowNo: r + 1,
        sheetName,
        document_no: docNo,
        revision: struct.revision ?? null,
        title: struct.title ?? null,
        organisation_raw: struct.organisation_raw ?? null,
        discipline,
        document_type: struct.document_type ?? null,
        series: struct.series ?? null,
        level_location: struct.level_location ?? null,
        sequential_no: struct.sequential_no ?? null,
        // current_status = computed Overall Status (single source of truth, derived from cycles).
        current_status: computeOverallStatus(cleaned as any, null),
        aconex_status: aconexStatus,
        is_submitted: isSubmitted,
        sub1_planned_date: cleaned.sub1_planned_date ?? null,
        sub1_submission_date: cleaned.sub1_submission_date ?? null,
        sub1_approval_date: cleaned.sub1_approval_date ?? null,
        sub1_approval_status: cleaned.sub1_approval_status ?? null,
        sub2_planned_date: cleaned.sub2_planned_date ?? null,
        sub2_submission_date: cleaned.sub2_submission_date ?? null,
        sub2_approval_date: cleaned.sub2_approval_date ?? null,
        sub2_approval_status: cleaned.sub2_approval_status ?? null,
        sub3_planned_date: cleaned.sub3_planned_date ?? null,
        sub3_submission_date: cleaned.sub3_submission_date ?? null,
        sub3_approval_date: cleaned.sub3_approval_date ?? null,
        sub3_approval_status: cleaned.sub3_approval_status ?? null,
        submitted_date: cleaned.sub1_submission_date ?? null,
        approved_date: cleaned.sub1_approval_date ?? null,
        transmittal_number: struct.transmittal_number ?? null,
        transmittal_due_date: struct.transmittal_due_date ?? null,
        days_due: struct.days_due ?? null,
        remarks: struct.remarks ?? null,
        hdec_pic_name: struct.hdec_pic_name ?? null,
        hdec_eng_name: struct.hdec_eng_name ?? null,
        subcontractor_name: subcontractorName,
        team: normalizeTeamValue(struct.team) ?? normalizeTeamValue(discipline) ?? null,
        raw_payload: payload,
      });
      sheetRowCount++;
    }

    sheetSummary.push({
      name: sheetName,
      headerCount: detected.cols.filter((c) => c.composite).length,
      rowCount: sheetRowCount,
      discipline: sheetDiscipline,
    });
  }

  return {
    rows,
    sheetCount: targetSheets.length,
    sheets: sheetSummary,
    unknownHeaders: [...unknownHeaderSet].sort(),
  };
}
