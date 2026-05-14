import * as XLSX from 'xlsx';
import { getMappedField } from '@/lib/header-mappings-cache';
import { normalizeTeamValue } from '@/types/enums';

/**
 * Spare Part Excel parser.
 * Workbook layout (Spare_Stock_Quantities_Summary):
 *   - Header row: S/N | MATERIAL | SPARES REQUIREMENTS | Unit | Spares Quantity |
 *                 Required Area for Storage | Status | Remarks
 *   - Category rows (e.g. "A | Architectural") — set the rolling category context.
 *   - Parent rows (S/N = numeric) — carry the parent item label + spec_ref.
 *   - Child rows (S/N = "a)", "b)", ...) — actual spare-part entries.
 *
 * We persist every parent + child row, building a synthetic stable `sn` so
 * repeated imports upsert by the same identity.
 */

export interface ParsedSparePartRow {
  rawRowNo: number;
  sheetName: string;
  /** Synthetic stable identifier (e.g. "A.1" or "A.1.a"). Used as the DB key. */
  sn: string;
  /** Raw S/N text from the workbook (1, "a)", ...) — kept for reference. */
  raw_sn: string | null;
  category: string | null;            // e.g. "A - Architectural"
  parent_item: string | null;         // e.g. "Tiling"
  spec_ref: string | null;            // e.g. "LLA-PM-LST-05-05-v02"
  material: string | null;
  spares_requirements: string | null;
  unit: string | null;
  spares_quantity: string | null;
  storage_area_required: string | null;
  status: string | null;
  remarks: string | null;
  subcontractor_name: string | null;
  team: string | null;
  trade: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  raw_payload: Record<string, unknown>;
}

export interface ParseSparePartResult {
  rows: ParsedSparePartRow[];
  sheetCount: number;
  sheets: Array<{ name: string; headerCount: number; rowCount: number }>;
  unknownHeaders: string[];
  excludedFields: Set<string>;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .trim();
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t === '' ? null : t;
}

const FALLBACK_ALIASES: Record<string, string | 'skip'> = {
  's/n': 'sn',
  'sn': 'sn',
  's. no': 'sn',
  's. no.': 'sn',
  'no': 'skip',
  'no.': 'skip',
  'category': 'category',
  'material': 'material',
  'parent item': 'parent_item',
  'spec ref': 'spec_ref',
  'spares requirements': 'spares_requirements',
  'spare requirements': 'spares_requirements',
  'requirements': 'spares_requirements',
  'unit': 'unit',
  'uom': 'unit',
  'spares quantity': 'spares_quantity',
  'spare quantity': 'spares_quantity',
  'quantity': 'spares_quantity',
  'qty': 'spares_quantity',
  'required area for storage': 'storage_area_required',
  'storage area': 'storage_area_required',
  'storage area required': 'storage_area_required',
  'area for storage': 'storage_area_required',
  'storage': 'storage_area_required',
  'status': 'status',
  'remarks': 'remarks',
  'remark': 'remarks',
  'note': 'remarks',
  'notes': 'remarks',
  'subcontractor': 'subcontractor_name',
  'sub-contractor': 'subcontractor_name',
  'subcontractor name': 'subcontractor_name',
  'team': 'team',
  'trade': 'trade',
  'hdec pic': 'hdec_pic_name',
  'pic': 'hdec_pic_name',
  'hdec eng': 'hdec_eng_name',
  'hdec engineer': 'hdec_eng_name',
};

function mapHeader(header: string): string | 'skip' | null {
  const rawTrim = String(header ?? '').trim();
  if (rawTrim.startsWith('__')) return 'skip';
  const norm = normalizeHeader(header);
  if (!norm) return 'skip';
  const db = getMappedField('docs', norm, 'spare_part');
  if (db === 'skip') return 'skip';
  if (db) return db;
  return FALLBACK_ALIASES[norm] ?? null;
}

function detectHeaderRow(matrix: unknown[][]): { idx: number; cols: Array<{ raw: string; field: string | 'skip' | null }> } | null {
  const limit = Math.min(matrix.length, 25);
  let best: { idx: number; score: number; cols: Array<{ raw: string; field: string | 'skip' | null }> } | null = null;
  for (let r = 0; r < limit; r++) {
    const row = matrix[r] ?? [];
    let score = 0;
    const cols: Array<{ raw: string; field: string | 'skip' | null }> = [];
    for (const cell of row) {
      const raw = String(cell ?? '').trim();
      const m = raw ? mapHeader(raw) : null;
      if (m && m !== 'skip') score++;
      cols.push({ raw, field: m });
    }
    if (!best || score > best.score) best = { idx: r, score, cols };
  }
  if (!best || best.score < 3) return null;
  return { idx: best.idx, cols: best.cols };
}

async function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer();
}

export async function getSparePartExcelSheetNames(file: File): Promise<string[]> {
  const buf = await readArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  return wb.SheetNames;
}

export async function getSparePartHeaderInfo(
  file: File,
  selectedSheets?: string[],
): Promise<{
  headers: string[];
  samples: Record<string, unknown>;
  fieldByHeader: Record<string, string | null>;
}> {
  const buf = await readArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets = selectedSheets && selectedSheets.length > 0 ? selectedSheets : wb.SheetNames;
  const headerOrder: string[] = [];
  const seen = new Set<string>();
  const samples: Record<string, unknown> = {};
  const fieldByHeader: Record<string, string | null> = {};
  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
    const detected = detectHeaderRow(matrix);
    if (!detected) continue;
    for (const c of detected.cols) {
      if (!c.raw) continue;
      if (!seen.has(c.raw)) {
        seen.add(c.raw);
        headerOrder.push(c.raw);
        fieldByHeader[c.raw] = c.field && c.field !== 'skip' ? c.field : null;
      }
    }
    const startRow = detected.idx + 1;
    const lastRow = Math.min(matrix.length, startRow + 30);
    for (let r = startRow; r < lastRow; r++) {
      const dataRow = matrix[r] ?? [];
      for (let c = 0; c < detected.cols.length; c++) {
        const label = detected.cols[c].raw;
        if (!label || samples[label] != null) continue;
        const v = dataRow[c];
        if (v != null && String(v).trim() !== '') samples[label] = v;
      }
    }
  }
  // Ensure the system-required `sn` slot is always present so validation passes
  // even when the workbook header label is non-standard.
  const hasSn = Object.values(fieldByHeader).some((f) => f === 'sn');
  if (!hasSn) {
    fieldByHeader['__synthetic_sn__'] = 'sn';
  }
  return { headers: headerOrder, samples, fieldByHeader };
}

/** Parses a row's first cell to detect category (single capital letter A/B/C/D...),
 *  parent (numeric), or child (lowercase letter optionally with `)`). */
type RowKind = 'category' | 'parent' | 'child' | 'data';

function classifyRow(snCell: unknown, materialCell: unknown): RowKind {
  const sn = toText(snCell);
  const mat = toText(materialCell);
  if (!sn && !mat) return 'data';
  if (sn) {
    // Category: single uppercase letter (A, B, ...)
    if (/^[A-Z]$/.test(sn)) return 'category';
    // Child: lowercase letter w/ optional trailing punctuation
    if (/^[a-z]\)?$/i.test(sn) && /^[a-z]/.test(sn)) return 'child';
    // Parent: pure integer
    if (/^\d+\.?$/.test(sn.replace(/\s/g, ''))) return 'parent';
  }
  return 'data';
}

function extractSpecRef(parentCell: string | null): { name: string | null; specRef: string | null } {
  if (!parentCell) return { name: null, specRef: null };
  const m = parentCell.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), specRef: m[2].trim() };
  return { name: parentCell.trim(), specRef: null };
}

export async function parseSparePartExcel(
  file: File,
  selectedSheets?: string[],
  options?: { excludedHeaders?: string[] },
): Promise<ParseSparePartResult> {
  const buf = await readArrayBuffer(file);
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets = selectedSheets && selectedSheets.length > 0 ? selectedSheets : wb.SheetNames;
  const excludedSet = new Set((options?.excludedHeaders ?? []).map((h) => h.trim()).filter(Boolean));
  const excludedFields = new Set<string>();

  const rows: ParsedSparePartRow[] = [];
  const sheetSummary: ParseSparePartResult['sheets'] = [];
  const unknown = new Set<string>();

  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
    const detected = detectHeaderRow(matrix);
    if (!detected) {
      sheetSummary.push({ name: sheetName, headerCount: 0, rowCount: 0 });
      continue;
    }
    for (const c of detected.cols) {
      if (c.raw && (!c.field || c.field === null)) unknown.add(c.raw);
    }

    // Build a column-index lookup by canonical field name for direct access.
    const colByField = new Map<string, number>();
    for (let i = 0; i < detected.cols.length; i++) {
      const c = detected.cols[i];
      if (c.field && c.field !== 'skip' && !colByField.has(c.field)) colByField.set(c.field, i);
    }

    let currentCategory: string | null = null;
    let currentParentLetter: string | null = null;
    let currentParentName: string | null = null;
    let currentParentSpec: string | null = null;
    let count = 0;

    for (let r = detected.idx + 1; r < matrix.length; r++) {
      const dataRow = matrix[r] ?? [];

      // Capture original cell payload by header label.
      const payload: Record<string, unknown> = {};
      for (let c = 0; c < detected.cols.length; c++) {
        const col = detected.cols[c];
        if (col.raw) payload[col.raw] = dataRow[c];
      }

      const snIdx = colByField.get('sn') ?? 0;
      const matIdx = colByField.get('material') ?? 1;
      const snCell = dataRow[snIdx];
      const matCell = dataRow[matIdx];

      const kind = classifyRow(snCell, matCell);

      if (kind === 'category') {
        const letter = toText(snCell);
        const name = toText(matCell);
        currentCategory = letter && name ? `${letter} - ${name}` : (letter ?? name ?? null);
        currentParentLetter = null;
        currentParentName = null;
        currentParentSpec = null;
        continue;
      }

      if (kind === 'parent') {
        const num = toText(snCell)?.replace(/\D/g, '') ?? null;
        const ext = extractSpecRef(toText(matCell));
        currentParentLetter = num;
        currentParentName = ext.name;
        currentParentSpec = ext.specRef;
        // Parent rows are also imported (some workbooks carry data on the parent
        // row directly when there's no sub-list). Fall through.
      }

      // Build struct from mapped columns (only those not user-excluded).
      const struct: Record<string, any> = {};
      for (let c = 0; c < detected.cols.length; c++) {
        const col = detected.cols[c];
        if (!col.field || col.field === 'skip') continue;
        const isExcluded = !!(col.raw && excludedSet.has(col.raw));
        if (isExcluded) {
          if (col.field !== 'sn') excludedFields.add(col.field);
          continue;
        }
        struct[col.field] = toText(dataRow[c]);
      }

      // Skip blank data rows.
      const rawSn = toText(snCell);
      const material = struct.material ?? toText(matCell);
      const reqs = struct.spares_requirements;
      const qty = struct.spares_quantity;
      if (kind !== 'parent' && !rawSn && !material && !reqs && !qty) continue;

      // Synthetic stable identifier — used for idempotent upsert.
      const catLetter = currentCategory?.split(' - ')[0]?.trim() || 'X';
      let synthSn: string;
      if (kind === 'parent') {
        synthSn = `${catLetter}.${currentParentLetter ?? 'P'}`;
      } else if (kind === 'child') {
        const childLetter = (rawSn ?? '').replace(/[^a-zA-Z]/g, '');
        synthSn = `${catLetter}.${currentParentLetter ?? 'X'}.${childLetter || (r + 1)}`;
      } else {
        // Free-form row: use raw row number as last-resort discriminator.
        synthSn = `${catLetter}.${currentParentLetter ?? 'X'}.row${r + 1}`;
      }

      // For parent rows, prefer the extracted parent name as material if no
      // standalone material text exists.
      const materialFinal = kind === 'parent' && !material ? currentParentName : material;

      const team = normalizeTeamValue(struct.team ?? null);

      rows.push({
        rawRowNo: r + 1,
        sheetName,
        sn: synthSn,
        raw_sn: rawSn,
        category: currentCategory,
        parent_item: currentParentName,
        spec_ref: struct.spec_ref ?? currentParentSpec,
        material: materialFinal,
        spares_requirements: reqs,
        unit: struct.unit ?? null,
        spares_quantity: qty,
        storage_area_required: struct.storage_area_required ?? null,
        status: struct.status ?? null,
        remarks: struct.remarks ?? null,
        subcontractor_name: struct.subcontractor_name ?? null,
        team,
        trade: struct.trade ?? null,
        hdec_pic_name: struct.hdec_pic_name ?? null,
        hdec_eng_name: struct.hdec_eng_name ?? null,
        raw_payload: payload,
      });
      count++;
    }

    sheetSummary.push({
      name: sheetName,
      headerCount: detected.cols.filter((c) => c.raw).length,
      rowCount: count,
    });
  }

  return {
    rows,
    sheetCount: sheets.length,
    sheets: sheetSummary,
    unknownHeaders: [...unknown].sort(),
    excludedFields,
  };
}
