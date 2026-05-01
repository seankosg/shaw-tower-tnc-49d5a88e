import * as XLSX from 'xlsx';
import { normalizeDate } from '@/lib/defect-parser';

/**
 * Docs (As-Built Drawings) Excel parser.
 *
 * Strategy:
 *  - Sweep ALL sheets in the workbook (one xlsx may contain Architecture/Civil/
 *    Mechanical/Electrical sheets each with their own register).
 *  - Detect a header row in the first 25 rows of each sheet.
 *  - Map flexible header labels via FIELD_ALIASES + heuristic substring match.
 *  - Specialised ELEC parser: when a sheet's discipline = ELEC, derive the
 *    discipline sub-code from the document number itself (e.g. SHAW-ELE-001 →
 *    "ELE", SHAW-ELC-001 → "ELC"), since one sheet often mixes them.
 *  - Aconex status codes 'A' / 'B' are treated as Approved → is_submitted=true,
 *    plus 'Approved' / 'Submitted' literal strings.
 */

export interface ParsedDocsRow {
  rawRowNo: number;
  sheetName: string;
  document_no: string;
  revision: string | null;
  title: string | null;
  organisation_raw: string | null;
  discipline: string | null;
  document_type: string | null;
  aconex_status: string | null;
  is_submitted: boolean;
  submitted_date: string | null;
  approved_date: string | null;
  remarks: string | null;
  raw_payload: Record<string, unknown>;
}

export interface ParseDocsResult {
  rows: ParsedDocsRow[];
  sheetCount: number;
  /** sheetName → { headerCount, rowCount, discipline } summary for the UI. */
  sheets: Array<{ name: string; headerCount: number; rowCount: number; discipline: string | null }>;
  /** Headers we encountered but could not map to a known field. */
  unknownHeaders: string[];
}

const FIELD_ALIASES: Record<string, keyof ParsedDocsRow | 'skip'> = {
  // doc number
  'document no': 'document_no',
  'document number': 'document_no',
  'doc no': 'document_no',
  'doc number': 'document_no',
  'drawing no': 'document_no',
  'drawing number': 'document_no',
  'dwg no': 'document_no',
  'dwg number': 'document_no',
  'no': 'document_no',
  'document id': 'document_no',
  // revision
  'rev': 'revision',
  'revision': 'revision',
  'rev no': 'revision',
  'revision no': 'revision',
  // title
  'title': 'title',
  'document title': 'title',
  'drawing title': 'title',
  'description': 'title',
  // organisation
  'organisation': 'organisation_raw',
  'organization': 'organisation_raw',
  'org': 'organisation_raw',
  'company': 'organisation_raw',
  'subcontractor': 'organisation_raw',
  'sub contractor': 'organisation_raw',
  'vendor': 'organisation_raw',
  'originator': 'organisation_raw',
  // discipline (per-row override)
  'discipline': 'discipline',
  'trade': 'discipline',
  // document type / package
  'document type': 'document_type',
  'doc type': 'document_type',
  'type': 'document_type',
  'package': 'document_type',
  // aconex status
  'aconex status': 'aconex_status',
  'status': 'aconex_status',
  'review status': 'aconex_status',
  'approval status': 'aconex_status',
  'workflow status': 'aconex_status',
  // dates
  'submitted date': 'submitted_date',
  'submission date': 'submitted_date',
  'date submitted': 'submitted_date',
  'submitted on': 'submitted_date',
  'approved date': 'approved_date',
  'approval date': 'approved_date',
  'date approved': 'approved_date',
  'approved on': 'approved_date',
  // remarks
  'remarks': 'remarks',
  'comments': 'remarks',
  'note': 'remarks',
  'notes': 'remarks',
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\s*\(H\)\s*$/i, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function mapHeader(header: string): keyof ParsedDocsRow | 'skip' | null {
  const norm = normalizeHeader(header);
  if (!norm) return 'skip';
  const exact = FIELD_ALIASES[norm];
  if (exact) return exact;
  // Heuristic substring fallbacks (do not promote weak matches blindly).
  if (norm.includes('document') && norm.includes('no')) return 'document_no';
  if (norm.includes('drawing') && norm.includes('no')) return 'document_no';
  if (norm === 'no.') return 'document_no';
  if (norm.includes('rev')) return 'revision';
  if (norm.includes('title')) return 'title';
  if (norm.includes('discipline')) return 'discipline';
  if (norm.includes('status')) return 'aconex_status';
  if (norm.includes('submit') && norm.includes('date')) return 'submitted_date';
  if (norm.includes('approv') && norm.includes('date')) return 'approved_date';
  if (norm.includes('remark') || norm.includes('comment')) return 'remarks';
  if (norm.includes('organisation') || norm.includes('organization') || norm.includes('vendor')) return 'organisation_raw';
  return null;
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/** Aconex codes A/B = Approved.  Also accept literal Approved/Submitted strings. */
function isApprovedStatus(status: string | null): boolean {
  if (!status) return false;
  const v = status.trim().toUpperCase();
  if (v === 'A' || v === 'B') return true;
  if (v.startsWith('APPROV')) return true;
  if (v.startsWith('SUBMIT')) return true;
  if (v === 'CLOSED') return true;
  return false;
}

/** Try to derive a discipline code from a sheet name (e.g. "Electrical Drawings" → "ELEC"). */
function disciplineFromSheetName(name: string): string | null {
  const v = name.toLowerCase();
  if (/\barch/.test(v)) return 'ARCH';
  if (/\bcivil|\bstruct/.test(v)) return 'CIVIL';
  if (/\bmech|\bhvac/.test(v)) return 'MECH';
  if (/\belec|\belv|\bele\b/.test(v)) return 'ELEC';
  if (/\bplumb/.test(v)) return 'PLUMB';
  if (/\bfire/.test(v)) return 'FIRE';
  if (/\bicta|\bict\b|\btelecom|\bcomms/.test(v)) return 'ICT';
  if (/\blandscape/.test(v)) return 'LAND';
  return null;
}

/** Extract a discipline sub-code from a document number's middle segment.
 *  Examples:  "SHAW-ELE-001" → "ELE"   "AB-ELC-FL01-001" → "ELC"  */
function extractDocDiscipline(docNo: string): string | null {
  const parts = docNo.split(/[-_/.]/).map((p) => p.trim()).filter(Boolean);
  // Look for an all-caps alpha token of length 2-5 that isn't obviously numeric / project code.
  for (let i = 1; i < parts.length; i++) {
    const tok = parts[i];
    if (/^[A-Z]{2,5}$/.test(tok)) return tok;
  }
  return null;
}

/** Detect the header row in a worksheet (first row whose cells map to ≥2 known fields). */
function detectHeaderRow(matrix: unknown[][]): { headerRowIdx: number; headers: string[] } | null {
  const limit = Math.min(matrix.length, 25);
  let bestIdx = -1;
  let bestScore = 0;
  let bestHeaders: string[] = [];
  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? [];
    let mapped = 0;
    for (const cell of row) {
      const text = String(cell ?? '').trim();
      if (!text) continue;
      const result = mapHeader(text);
      if (result && result !== 'skip') mapped++;
    }
    if (mapped > bestScore) {
      bestScore = mapped;
      bestIdx = r;
      bestHeaders = row.map((c) => String(c ?? '').trim());
    }
  }
  if (bestScore >= 2 && bestIdx >= 0) {
    return { headerRowIdx: bestIdx, headers: bestHeaders };
  }
  return null;
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

export async function getDocsExcelSheetNames(file: File): Promise<string[]> {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: 'array' });
  return workbook.SheetNames;
}

export async function parseDocsExcel(
  file: File,
  /** When provided, only these sheet names are parsed. Default = all sheets. */
  selectedSheets?: string[],
): Promise<ParseDocsResult> {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: 'array' });
  const targetSheets = selectedSheets?.length ? selectedSheets : workbook.SheetNames;

  const rows: ParsedDocsRow[] = [];
  const sheetSummary: ParseDocsResult['sheets'] = [];
  const unknownHeaderSet = new Set<string>();

  for (const sheetName of targetSheets) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
    const detected = detectHeaderRow(matrix);
    const sheetDiscipline = disciplineFromSheetName(sheetName);
    if (!detected) {
      sheetSummary.push({ name: sheetName, headerCount: 0, rowCount: 0, discipline: sheetDiscipline });
      continue;
    }
    const { headerRowIdx, headers } = detected;
    const headerMap: Array<{ col: number; field: keyof ParsedDocsRow | null; raw: string }> = [];
    headers.forEach((h, col) => {
      const mapped = mapHeader(h);
      if (mapped === 'skip') {
        headerMap.push({ col, field: null, raw: h });
      } else if (mapped == null) {
        if (h && h.trim()) unknownHeaderSet.add(h.trim());
        headerMap.push({ col, field: null, raw: h });
      } else {
        headerMap.push({ col, field: mapped, raw: h });
      }
    });

    let sheetRowCount = 0;
    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const dataRow = matrix[r] ?? [];
      // Build raw_payload + structured fields
      const payload: Record<string, unknown> = {};
      const struct: Partial<ParsedDocsRow> = {};
      for (const { col, field, raw } of headerMap) {
        const value = dataRow[col];
        if (raw && raw.trim()) payload[raw.trim()] = value;
        if (!field) continue;
        if (field === 'submitted_date' || field === 'approved_date') {
          (struct as any)[field] = normalizeDate(value);
        } else if (field === 'is_submitted') {
          // ignored — derived below
        } else {
          (struct as any)[field] = toText(value);
        }
      }
      const docNo = struct.document_no?.trim();
      if (!docNo) continue; // skip blank rows / sub-headers

      // Derive discipline: row-level value > doc-no extraction (when sheet=ELEC) > sheet name
      let discipline = struct.discipline ?? null;
      if (!discipline) {
        if (sheetDiscipline === 'ELEC') {
          discipline = extractDocDiscipline(docNo) ?? sheetDiscipline;
        } else {
          discipline = sheetDiscipline;
        }
      }

      const aconexStatus = struct.aconex_status ?? null;
      const isSubmitted = isApprovedStatus(aconexStatus) || !!struct.submitted_date || !!struct.approved_date;

      rows.push({
        rawRowNo: r + 1,
        sheetName,
        document_no: docNo,
        revision: struct.revision ?? null,
        title: struct.title ?? null,
        organisation_raw: struct.organisation_raw ?? null,
        discipline,
        document_type: struct.document_type ?? null,
        aconex_status: aconexStatus,
        is_submitted: isSubmitted,
        submitted_date: struct.submitted_date ?? null,
        approved_date: struct.approved_date ?? null,
        remarks: struct.remarks ?? null,
        raw_payload: payload,
      });
      sheetRowCount++;
    }

    sheetSummary.push({
      name: sheetName,
      headerCount: headers.filter((h) => h && String(h).trim()).length,
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
