import * as XLSX from 'xlsx';
import { getMappedField } from '@/lib/header-mappings-cache';
import { normalizeTeamValue } from '@/types/enums';
import { normalizeDate } from '@/lib/date-normalize';

/**
 * Spare Part Excel parser.
 *
 * Workbook contract (current):
 *   Sheet "Spare Parts", header on row 2 (row 1 may be blank), 35 columns
 *   covering S/N, hierarchy (Level/Category/Parent Item/Sub-category),
 *   item spec (Material Description, Location, Floor Level, Type,
 *   Specification, Size, Spec Ref), procurement workflow (Material Lead Time,
 *   Planned/Actual Confirmation, Direction to Subcon, ETA, Planned/Actual PO,
 *   PO Status, Planned/Actual Delivery), assignment (subcontractor_name,
 *   HDEC PIC, hdec_eng_name, team, trade) and audit columns.
 *
 * Re-imports of system-exported workbooks must be idempotent: every leaf row
 * carries a stable `S/N` like `A-1-a-1`, and every group row carries a
 * synthetic `A.1` / `A.1.a` / `A.1.row16` style key. We always trust the
 * file's `S/N` directly and never invent new keys.
 */

export interface ParsedSparePartRow {
  rawRowNo: number;
  sheetName: string;
  /** Stable identifier used for upsert. */
  sn: string;
  /** Original system row index column (Excel "Item NO"). */
  item_no: number | null;
  raw_sn: string | null;
  level: string | null;             // 'leaf' | 'parent' | 'sub-category' | 'category' | null
  sn_outline: string | null;
  category: string | null;
  parent_item: string | null;
  sub_category: string | null;
  material: string | null;
  spec_ref: string | null;
  // Item spec (new)
  location: string | null;
  floor_level: string | null;
  item_type: string | null;
  specification: string | null;
  size: string | null;
  // Quantity / storage
  spares_requirements: string | null;
  unit: string | null;
  spares_quantity: string | null;
  storage_area_required: string | null;
  // Status / remarks
  status: string | null;
  remarks: string | null;
  // Procurement workflow (new)
  material_lead_time: string | null;
  planned_confirm_date: string | null;
  actual_confirm_date: string | null;
  direction_to_subcon_date: string | null;
  eta_date: string | null;
  planned_po_date: string | null;
  actual_po_date: string | null;
  po_status: string | null;
  planned_delivery_date: string | null;
  actual_delivery_date: string | null;
  // Assignment
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

const DATE_FIELDS = new Set([
  'planned_confirm_date',
  'actual_confirm_date',
  'direction_to_subcon_date',
  'eta_date',
  'planned_po_date',
  'actual_po_date',
  'planned_delivery_date',
  'actual_delivery_date',
]);

/** System / metadata headers that must NEVER be imported (round-trip safety). */
const SYSTEM_SKIP_HEADERS = new Set([
  'id', 'project_id', 'is_active', 'row_version', 'source_upload_id',
  'data_source_type', 'raw_payload', 'custom_payload', 'updated_by',
  'row_no', 'sheet_name', 'updated_at', 'created_at',
]);

const FALLBACK_ALIASES: Record<string, string | 'skip'> = {
  // Identity
  's/n': 'sn',
  'sn': 'sn',
  's. no': 'sn',
  's. no.': 'sn',
  's/n outline': 'sn_outline',
  'sn outline': 'sn_outline',
  'no': 'skip',
  'no.': 'skip',
  'item no': 'item_no',
  'item no.': 'item_no',
  'item number': 'item_no',
  // Hierarchy
  'level': 'level',
  'category': 'category',
  'parent item': 'parent_item',
  'sub-category': 'sub_category',
  'sub category': 'sub_category',
  'subcategory': 'sub_category',
  // Item description / spec
  'material': 'material',
  'material description': 'material',
  'spec ref': 'spec_ref',
  'specification ref': 'spec_ref',
  'location': 'location',
  // NOTE: a second 'level' header (= floor level) is disambiguated below
  // by header column index — see detectHeaderRow.
  'floor level': 'floor_level',
  'floor': 'floor_level',
  'type': 'item_type',
  'item type': 'item_type',
  'specification': 'specification',
  'spec': 'specification',
  'size': 'size',
  // Spares qty / storage
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
  // Status / remarks
  'status': 'status',
  'remarks': 'remarks',
  'remark': 'remarks',
  'note': 'remarks',
  'notes': 'remarks',
  // Procurement workflow
  'material lead time': 'material_lead_time',
  'lead time': 'material_lead_time',
  'planned confirmation date': 'planned_confirm_date',
  'planned confirmation': 'planned_confirm_date',
  'actual confirmation date': 'actual_confirm_date',
  'actual confirmation': 'actual_confirm_date',
  'direction to subcon date': 'direction_to_subcon_date',
  'direction to subcon': 'direction_to_subcon_date',
  'eta': 'eta_date',
  'eta date': 'eta_date',
  'planned po issuance date': 'planned_po_date',
  'planned po date': 'planned_po_date',
  'planned po': 'planned_po_date',
  'actual po issuance date': 'actual_po_date',
  'actual po date': 'actual_po_date',
  'actual po': 'actual_po_date',
  'po status': 'po_status',
  'planned delivery date': 'planned_delivery_date',
  'planned delivery': 'planned_delivery_date',
  // Note: workbook has typo "Actual Deliery Date" — accept both spellings
  'actual delivery date': 'actual_delivery_date',
  'actual deliery date': 'actual_delivery_date',
  'actual delivery': 'actual_delivery_date',
  'actual deliery': 'actual_delivery_date',
  // Assignment
  'subcontractor': 'subcontractor_name',
  'sub-contractor': 'subcontractor_name',
  'subcontractor name': 'subcontractor_name',
  'subcontractor_name': 'subcontractor_name',
  'team': 'team',
  'trade': 'trade',
  'hdec pic': 'hdec_pic_name',
  'pic': 'hdec_pic_name',
  'hdec_pic_name': 'hdec_pic_name',
  'hdec eng': 'hdec_eng_name',
  'hdec engineer': 'hdec_eng_name',
  'hdec_eng_name': 'hdec_eng_name',
};

function mapHeader(header: string): string | 'skip' | null {
  const rawTrim = String(header ?? '').trim();
  if (rawTrim.startsWith('__')) return 'skip';
  const norm = normalizeHeader(header);
  if (!norm) return 'skip';
  if (SYSTEM_SKIP_HEADERS.has(norm)) return 'skip';
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

  // Disambiguate duplicate 'Level' headers: first = hierarchy level (leaf/...),
  // second = floor_level. Apply only when both already mapped to 'level'.
  let levelCount = 0;
  for (let i = 0; i < best.cols.length; i++) {
    if (best.cols[i].field === 'level') {
      if (levelCount > 0) best.cols[i] = { ...best.cols[i], field: 'floor_level' };
      levelCount++;
    }
  }
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
  const hasSn = Object.values(fieldByHeader).some((f) => f === 'sn');
  if (!hasSn) {
    fieldByHeader['__synthetic_sn__'] = 'sn';
  }
  return { headers: headerOrder, samples, fieldByHeader };
}

/** Free-form S/N classifier (used only when the file has no `level` column). */
type RowKind = 'category' | 'parent' | 'sub_category' | 'leaf' | 'data';

function classifyBySn(snCell: unknown, materialCell: unknown): RowKind {
  const sn = toText(snCell);
  const mat = toText(materialCell);
  if (!sn && !mat) return 'data';
  if (sn) {
    if (/^[A-Z]$/.test(sn)) return 'category';                // "A"
    if (/^[A-Z][.\-]\d+$/.test(sn)) return 'parent';          // "A.1" / "A-1"
    if (/^[A-Z][.\-]\d+[.\-][a-z]$/i.test(sn)) return 'sub_category'; // "A.1.a" / "A-1-a"
    if (/^[A-Z][.\-]\d+[.\-][a-z][.\-]\d+$/i.test(sn)) return 'leaf'; // "A-1-a-1"
    if (/^[a-z]\)?$/i.test(sn)) return 'sub_category';        // "a)" legacy
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

    const colByField = new Map<string, number>();
    for (let i = 0; i < detected.cols.length; i++) {
      const c = detected.cols[i];
      if (c.field && c.field !== 'skip' && !colByField.has(c.field)) colByField.set(c.field, i);
    }
    const hasFileLevel = colByField.has('level');

    let currentCategory: string | null = null;
    let currentParentName: string | null = null;
    let currentParentSpec: string | null = null;
    let currentSubCategory: string | null = null;
    let count = 0;

    for (let r = detected.idx + 1; r < matrix.length; r++) {
      const dataRow = matrix[r] ?? [];

      const payload: Record<string, unknown> = {};
      for (let c = 0; c < detected.cols.length; c++) {
        const col = detected.cols[c];
        if (col.raw) payload[col.raw] = dataRow[c];
      }

      const snIdx = colByField.get('sn') ?? 0;
      const matIdx = colByField.get('material') ?? 1;
      const snCell = dataRow[snIdx];
      const matCell = dataRow[matIdx];

      // Build struct from mapped columns (excluding user-excluded headers).
      const struct: Record<string, any> = {};
      for (let c = 0; c < detected.cols.length; c++) {
        const col = detected.cols[c];
        if (!col.field || col.field === 'skip') continue;
        const isExcluded = !!(col.raw && excludedSet.has(col.raw));
        if (isExcluded) {
          if (col.field !== 'sn') excludedFields.add(col.field);
          continue;
        }
        const cell = dataRow[c];
        if (DATE_FIELDS.has(col.field)) {
          struct[col.field] = normalizeDate(cell);
        } else {
          struct[col.field] = toText(cell);
        }
      }

      const fileLevelRaw = hasFileLevel ? toText(struct.level) : null;
      const fileLevel = fileLevelRaw ? fileLevelRaw.toLowerCase() : null;

      // Determine kind: file `level` value wins; otherwise classify by S/N.
      let kind: RowKind;
      if (fileLevel) {
        if (fileLevel === 'leaf') kind = 'leaf';
        else if (fileLevel === 'parent') kind = 'parent';
        else if (fileLevel === 'sub-category' || fileLevel === 'sub_category' || fileLevel === 'subcategory') kind = 'sub_category';
        else if (fileLevel === 'category') kind = 'category';
        else kind = 'data';
      } else {
        kind = classifyBySn(snCell, matCell);
      }

      // Update rolling context for legacy classification fallbacks.
      if (kind === 'category') {
        const letter = toText(snCell);
        const name = toText(matCell);
        currentCategory = letter && name ? `${letter} - ${name}` : (letter ?? name ?? null);
        currentParentName = null;
        currentParentSpec = null;
        currentSubCategory = null;
        // Persist category rows too (so admin UI can audit them).
      } else if (kind === 'parent') {
        const ext = extractSpecRef(toText(matCell));
        currentParentName = ext.name;
        currentParentSpec = ext.specRef;
        currentSubCategory = null;
      } else if (kind === 'sub_category') {
        currentSubCategory = toText(matCell);
      }

      const rawSn = toText(snCell);
      const sn = rawSn || `${sheetName}.row${r + 1}`;

      // Filter out completely empty rows (no SN, no material, no qty).
      if (!rawSn && !struct.material && !struct.spares_requirements && !struct.spares_quantity && !struct.parent_item) {
        continue;
      }

      const team = normalizeTeamValue(struct.team ?? null);

      rows.push({
        rawRowNo: r + 1,
        sheetName,
        sn,
        raw_sn: rawSn,
        level: struct.level ?? (kind === 'data' ? null : kind),
        sn_outline: struct.sn_outline ?? null,
        category: struct.category ?? currentCategory,
        parent_item: struct.parent_item ?? currentParentName,
        sub_category: struct.sub_category ?? currentSubCategory,
        material: struct.material ?? null,
        spec_ref: struct.spec_ref ?? currentParentSpec,
        location: struct.location ?? null,
        floor_level: struct.floor_level ?? null,
        item_type: struct.item_type ?? null,
        specification: struct.specification ?? null,
        size: struct.size ?? null,
        spares_requirements: struct.spares_requirements ?? null,
        unit: struct.unit ?? null,
        spares_quantity: struct.spares_quantity ?? null,
        storage_area_required: struct.storage_area_required ?? null,
        status: struct.status ?? null,
        remarks: struct.remarks ?? null,
        material_lead_time: struct.material_lead_time ?? null,
        planned_confirm_date: struct.planned_confirm_date ?? null,
        actual_confirm_date: struct.actual_confirm_date ?? null,
        direction_to_subcon_date: struct.direction_to_subcon_date ?? null,
        eta_date: struct.eta_date ?? null,
        planned_po_date: struct.planned_po_date ?? null,
        actual_po_date: struct.actual_po_date ?? null,
        po_status: struct.po_status ?? null,
        planned_delivery_date: struct.planned_delivery_date ?? null,
        actual_delivery_date: struct.actual_delivery_date ?? null,
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
