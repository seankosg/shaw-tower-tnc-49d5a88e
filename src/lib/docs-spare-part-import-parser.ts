import * as XLSX from 'xlsx';
import { getMappedField } from '@/lib/header-mappings-cache';
import { normalizeTeamValue } from '@/types/enums';

/**
 * Spare Part Excel parser — supports 4-level hierarchy:
 *   Category (A)  →  Parent (A-1)  →  Sub-category (A-1-a)  →  Leaf (A-1-a-1)
 *
 * Workbook variants encountered:
 *   - Single S/N column (legacy 3-level): A, 1, "a)", text
 *   - Two S/N columns (Spare_Stock_..._breakdown): S/N #1 (free-form outline)
 *     + S/N #2 (hierarchical id like "A-1-a-1")
 *
 * S/N #2 pattern is used as the canonical, idempotent identifier when present;
 * we fall back to legacy heuristics on the first S/N column otherwise.
 */

export type SparePartLevel = 'category' | 'parent' | 'subcategory' | 'leaf';

export interface ParsedSparePartRow {
  rawRowNo: number;
  sheetName: string;
  /** Canonical stable identifier (S/N #2 when present, else synthetic). */
  sn: string;
  /** Free-form S/N #1 outline when workbook provides it. */
  sn_outline: string | null;
  /** Original cell content of the canonical S/N column. */
  raw_sn: string | null;
  level: SparePartLevel;
  category: string | null;
  parent_item: string | null;
  sub_category: string | null;
  spec_ref: string | null;
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
  // S/N columns — #2 (hierarchical) is canonical, #1 is the outline
  's/n': 'sn',
  'sn': 'sn',
  's. no': 'sn',
  's. no.': 'sn',
  's/n #2': 'sn',
  's/n#2': 'sn',
  's/n 2': 'sn',
  's/n no.2': 'sn',
  's/n #1': 'sn_outline',
  's/n#1': 'sn_outline',
  's/n 1': 'sn_outline',
  's/n no.1': 'sn_outline',
  'no': 'skip',
  'no.': 'skip',
  'category': 'category',
  'sub-category': 'sub_category',
  'sub category': 'sub_category',
  'subcategory': 'sub_category',
  'material': 'material',
  'parent item': 'parent_item',
  'parent': 'parent_item',
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
  const hasSn = Object.values(fieldByHeader).some((f) => f === 'sn');
  if (!hasSn) {
    fieldByHeader['__synthetic_sn__'] = 'sn';
  }
  return { headers: headerOrder, samples, fieldByHeader };
}

/** Classify by hierarchical S/N #2 pattern (preferred), fallback to legacy single-column heuristic. */
function classifyByHierId(snHier: string | null): SparePartLevel | null {
  if (!snHier) return null;
  const t = snHier.replace(/\s+/g, '');
  if (/^[A-Za-z]$/.test(t)) return 'category';
  if (/^[A-Za-z]-\d+$/.test(t)) return 'parent';
  if (/^[A-Za-z]-\d+-[a-z]$/i.test(t)) return 'subcategory';
  if (/^[A-Za-z]-\d+-[a-z]-\d+$/i.test(t)) return 'leaf';
  return null;
}

function classifyLegacy(snCell: unknown, materialCell: unknown): SparePartLevel | 'data' {
  const sn = toText(snCell);
  const mat = toText(materialCell);
  if (!sn && !mat) return 'data';
  if (sn) {
    if (/^[A-Z]$/.test(sn)) return 'category';
    if (/^[a-z]\)?$/i.test(sn) && /^[a-z]/.test(sn)) return 'leaf'; // legacy "child" → leaf
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

    let currentCategory: string | null = null;       // e.g. "A - Architectural"
    let currentCategoryLetter: string | null = null; // e.g. "A"
    let currentParentNum: string | null = null;      // e.g. "1"
    let currentParentName: string | null = null;
    let currentParentSpec: string | null = null;
    let currentSubLetter: string | null = null;      // e.g. "a"
    let currentSubName: string | null = null;        // e.g. "Natural Stone"
    let count = 0;

    for (let r = detected.idx + 1; r < matrix.length; r++) {
      const dataRow = matrix[r] ?? [];

      const payload: Record<string, unknown> = {};
      for (let c = 0; c < detected.cols.length; c++) {
        const col = detected.cols[c];
        if (col.raw) payload[col.raw] = dataRow[c];
      }

      const snIdx = colByField.get('sn') ?? 0;
      const snOutlineIdx = colByField.get('sn_outline');
      const matIdx = colByField.get('material') ?? 1;

      const snHier = toText(dataRow[snIdx]);
      const snOutline = snOutlineIdx != null ? toText(dataRow[snOutlineIdx]) : null;
      const matCell = dataRow[matIdx];

      // Prefer hierarchical pattern; fall back to legacy single-column heuristic.
      const level: SparePartLevel | 'data' =
        classifyByHierId(snHier) ?? classifyLegacy(dataRow[snIdx], matCell);

      // Build struct from mapped columns (excluding user-excluded).
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

      const material = struct.material ?? toText(matCell);

      // ---- Update rolling context based on detected level ----
      if (level === 'category') {
        const letter = (snHier ?? toText(dataRow[snIdx]) ?? '').replace(/\s/g, '').toUpperCase();
        const name = material;
        currentCategoryLetter = letter || null;
        currentCategory = letter && name ? `${letter} - ${name}` : (letter || name || null);
        currentParentNum = null;
        currentParentName = null;
        currentParentSpec = null;
        currentSubLetter = null;
        currentSubName = null;
      } else if (level === 'parent') {
        // Hierarchical: A-1 → letter=A, num=1. Legacy: snHier numeric-only.
        const t = (snHier ?? '').replace(/\s/g, '');
        const m = t.match(/^([A-Za-z])-(\d+)$/);
        if (m) {
          currentCategoryLetter = m[1].toUpperCase();
          currentParentNum = m[2];
        } else {
          currentParentNum = (toText(dataRow[snIdx]) ?? '').replace(/\D/g, '') || null;
        }
        const ext = extractSpecRef(material);
        currentParentName = ext.name;
        currentParentSpec = ext.specRef;
        currentSubLetter = null;
        currentSubName = null;
      } else if (level === 'subcategory') {
        const t = (snHier ?? '').replace(/\s/g, '');
        const m = t.match(/^([A-Za-z])-(\d+)-([a-z])$/i);
        if (m) {
          currentCategoryLetter = m[1].toUpperCase();
          currentParentNum = m[2];
          currentSubLetter = m[3].toLowerCase();
        }
        currentSubName = material;
      } else if (level === 'leaf') {
        const t = (snHier ?? '').replace(/\s/g, '');
        const m = t.match(/^([A-Za-z])-(\d+)-([a-z])-(\d+)$/i);
        if (m) {
          currentCategoryLetter = m[1].toUpperCase();
          currentParentNum = m[2];
          currentSubLetter = m[3].toLowerCase();
        }
      }

      // Skip blank rows that don't even have category context.
      if (level === 'data') {
        const reqs = struct.spares_requirements;
        const qty = struct.spares_quantity;
        if (!snHier && !snOutline && !material && !reqs && !qty) continue;
      }

      // ---- Build canonical sn ----
      let canonicalSn: string;
      if (snHier) {
        canonicalSn = snHier.replace(/\s/g, '');
      } else {
        // Legacy fallback path
        const catL = currentCategoryLetter || 'X';
        const parN = currentParentNum || 'X';
        if (level === 'category') canonicalSn = catL;
        else if (level === 'parent') canonicalSn = `${catL}-${parN}`;
        else if (level === 'subcategory') canonicalSn = `${catL}-${parN}-${currentSubLetter || 'x'}`;
        else if (level === 'leaf') {
          // Use legacy child letter from S/N #1 if available
          const childLetter = (toText(dataRow[snIdx]) ?? '').replace(/[^a-zA-Z]/g, '').toLowerCase();
          canonicalSn = `${catL}-${parN}-${childLetter || 'x'}-${r + 1}`;
        } else {
          canonicalSn = `${catL}-${parN}-row${r + 1}`;
        }
      }

      const finalLevel: SparePartLevel = level === 'data' ? 'leaf' : level;
      const team = normalizeTeamValue(struct.team ?? null);

      const materialFinal =
        finalLevel === 'parent' && !material ? currentParentName :
        finalLevel === 'subcategory' && !material ? currentSubName :
        material;

      rows.push({
        rawRowNo: r + 1,
        sheetName,
        sn: canonicalSn,
        sn_outline: snOutline ?? (snOutlineIdx == null ? toText(dataRow[snIdx]) : null),
        raw_sn: snHier,
        level: finalLevel,
        category: currentCategory,
        parent_item: currentParentName,
        sub_category: currentSubName,
        spec_ref: struct.spec_ref ?? currentParentSpec,
        material: materialFinal,
        spares_requirements: struct.spares_requirements ?? null,
        unit: struct.unit ?? null,
        spares_quantity: struct.spares_quantity ?? null,
        storage_area_required: struct.storage_area_required ?? null,
        status: struct.status ?? null,
        remarks: struct.remarks ?? null,
        subcontractor_name: struct.subcontractor_name ?? null,
        team,
        trade: struct.trade ?? (currentCategory ? currentCategory.split(' - ')[1] ?? null : null),
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
