/**
 * Punch (Minor O/S Work) Raw Data Excel export.
 *
 * Mirrors the Defect Raw Data export feature (single file / per-subcontractor /
 * ZIP) but adapted to the array-based Punch page (no react-table instance).
 */
import XLSX from 'xlsx-js-style';
import { formatDdMmm, formatDdMmmYyyy } from './format';
import { isoToExcelSerial, isoTimestampToExcelSerial, DATE_NUMFMT, DATETIME_NUMFMT } from '@/lib/excel-date-cell';
import {
  PUNCH_FIELDS_BY_NAME,
  PUNCH_GATE_LABEL,
  PUNCH_PROCUREMENT_LABEL,
  PUNCH_HEALTH_LABEL,
  type PunchGateStatus,
  type PunchProcurementStatus,
  type PunchHealthStatus,
} from '@/lib/punch-field-registry';
import type { PunchFieldConfigRow } from '@/hooks/usePunchFieldConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PunchExportFormat = 'view' | 'reimport';
export const PUNCH_REIMPORT_MARKER = '[Format: SHAW_PUNCH_REIMPORT_V1]';

const REIMPORT_ID_FIELDS = ['id', 'item_no'] as const;
const REIMPORT_ID_LABELS: Record<string, string> = {
  id: 'ID',
  item_no: 'Item No',
};

export interface ExportPunchRawOptions {
  /** Filtered + sorted rows from the page (matches what the user sees). */
  rows: any[];
  /** Ordered list of field names to export (matches visible columns). */
  fieldNames: string[];
  fieldConfig: PunchFieldConfigRow[];
  meta: { userName: string; userType: string };
  /** Source description (e.g. URL filter summary). */
  sourceLabel?: string;
  /** Active text search summary. */
  searchSummary?: string;
  /** Active filter summary. */
  filterSummary?: string;
  /** Active sort summary. */
  sortSummary?: string;
  format?: PunchExportFormat;
  /** Field used to read raw_payload / custom_payload fallback values. */
  getOriginalHeader?: (fieldName: string) => string | null;
}

// ---------------------------------------------------------------------------
// Field type helpers (derive from registry)
// ---------------------------------------------------------------------------

const DATE_FIELDS = new Set(
  Object.values(PUNCH_FIELDS_BY_NAME).filter((d) => d.dataType === 'date').map((d) => d.field),
);
const PCT_FIELDS = new Set(
  Object.values(PUNCH_FIELDS_BY_NAME).filter((d) => d.dataType === 'pct').map((d) => d.field),
);
const DATETIME_FIELDS = new Set(['created_at', 'updated_at']);

// ---------------------------------------------------------------------------
// Value access (mirrors PunchRawDataPage.getFieldValue)
// ---------------------------------------------------------------------------

function readFieldValue(row: any, field: string, originalHeader: string | null): any {
  const direct = row?.[field];
  if (direct != null && direct !== '') return direct;
  const rawP = row?.raw_payload;
  if (rawP && typeof rawP === 'object') {
    if (originalHeader && rawP[originalHeader] != null) return rawP[originalHeader];
    if (rawP[field] != null) return rawP[field];
  }
  const customP = row?.custom_payload;
  if (customP && typeof customP === 'object') {
    if (originalHeader && customP[originalHeader] != null) return customP[originalHeader];
    if (customP[field] != null) return customP[field];
  }
  return null;
}

function formatPctValue(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return `${n.toFixed(1)}%`;
}

function formatPunchValue(field: string, raw: any, format: PunchExportFormat): string {
  if (raw == null || raw === '') return '';

  if (format === 'reimport') {
    if (PCT_FIELDS.has(field)) {
      const n = Number(raw);
      return Number.isFinite(n) ? String(n) : '';
    }
    if (DATE_FIELDS.has(field)) return String(raw).slice(0, 10);
    if (DATETIME_FIELDS.has(field)) return String(raw);
    if (Array.isArray(raw)) return raw.join(', ');
    if (typeof raw === 'boolean') return raw ? 'TRUE' : 'FALSE';
    return String(raw);
  }

  // view-friendly
  if (PCT_FIELDS.has(field) || field === 'progress_variance_pct') return formatPctValue(raw);
  if (DATE_FIELDS.has(field)) return formatDdMmm(String(raw).slice(0, 10));
  if (DATETIME_FIELDS.has(field)) return formatDdMmmYyyy(String(raw));
  if (field === 'health_status') return PUNCH_HEALTH_LABEL[raw as PunchHealthStatus] ?? String(raw);
  if (
    field === 'material_approval_status' ||
    field === 'drawing_approval_status' ||
    field === 'mos_approval_status'
  ) {
    return PUNCH_GATE_LABEL[raw as PunchGateStatus] ?? String(raw).replace(/_/g, ' ');
  }
  if (field === 'material_procurement_status') {
    return PUNCH_PROCUREMENT_LABEL[raw as PunchProcurementStatus] ?? String(raw).replace(/_/g, ' ');
  }
  if (field === 'pre_engineering_ready') return raw ? 'Ready' : 'Blocked';
  if (Array.isArray(raw)) return raw.join(', ');
  return String(raw);
}

function getLabel(field: string, fieldConfig: PunchFieldConfigRow[]): string {
  const cfg = fieldConfig.find((f) => f.field_name === field);
  if (cfg?.display_name) return cfg.display_name;
  return PUNCH_FIELDS_BY_NAME[field]?.exportLabel ?? field;
}

// ---------------------------------------------------------------------------
// Style constants (match Defect export look-and-feel)
// ---------------------------------------------------------------------------

const FONT_NAME = 'Calibri';

const STYLE_TITLE = {
  font: { name: FONT_NAME, sz: 14, bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF1E3A5F' } },
  alignment: { vertical: 'center', horizontal: 'left' },
} as const;

const STYLE_META_LABEL = {
  font: { name: FONT_NAME, sz: 10, bold: true, color: { rgb: 'FF374151' } },
  fill: { fgColor: { rgb: 'FFF3F4F6' } },
  alignment: { vertical: 'center', horizontal: 'left' },
} as const;

const STYLE_META_VALUE = {
  font: { name: FONT_NAME, sz: 10, color: { rgb: 'FF111827' } },
  fill: { fgColor: { rgb: 'FFF3F4F6' } },
  alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
} as const;

const STYLE_HEADER = {
  font: { name: FONT_NAME, sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } },
  fill: { fgColor: { rgb: 'FF334155' } },
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'FF1F2937' } },
    bottom: { style: 'thin', color: { rgb: 'FF1F2937' } },
    left: { style: 'thin', color: { rgb: 'FF1F2937' } },
    right: { style: 'thin', color: { rgb: 'FF1F2937' } },
  },
} as const;

const STYLE_DATA = {
  font: { name: FONT_NAME, sz: 10, color: { rgb: 'FF111827' } },
  alignment: { vertical: 'center', horizontal: 'left' },
  border: {
    top: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
    bottom: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
    left: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
    right: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
  },
} as const;

function setCell(ws: XLSX.WorkSheet, r: number, c: number, value: unknown, style: Record<string, unknown>) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const v = value == null ? '' : value;
  ws[addr] = { t: 's', v: String(v), s: style };
}

function setDateCell(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  serial: number,
  style: Record<string, unknown>,
  numFmt: string,
) {
  const addr = XLSX.utils.encode_cell({ r, c });
  ws[addr] = { t: 'n', v: serial, z: numFmt, s: { ...style, numFmt } };
}

// ---------------------------------------------------------------------------
// Workbook builder
// ---------------------------------------------------------------------------

interface BuildSheetParams {
  rows: any[];
  fieldNames: string[];
  fieldConfig: PunchFieldConfigRow[];
  meta: { userName: string; userType: string };
  sourceLabel: string;
  searchSummary: string;
  filterSummary: string;
  sortSummary: string;
  format: PunchExportFormat;
  sourceSuffix?: string;
  getOriginalHeader: (fieldName: string) => string | null;
}

function buildPunchWorkbook(params: BuildSheetParams): XLSX.WorkBook {
  const { rows, fieldNames, fieldConfig, meta, sourceLabel, searchSummary, filterSummary, sortSummary, format, sourceSuffix, getOriginalHeader } = params;
  const isReimport = format === 'reimport';

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const exportedTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const finalSource = sourceSuffix ? `${sourceLabel} · ${sourceSuffix}` : sourceLabel;
  const formatLabel = isReimport ? `Re-import ready  ${PUNCH_REIMPORT_MARKER}` : 'View-friendly';

  // For re-import, prepend stable identifier columns not already present.
  const visibleSet = new Set(fieldNames);
  const reimportIdFields = isReimport ? REIMPORT_ID_FIELDS.filter((f) => !visibleSet.has(f)) : [];

  const headerRow: string[] = [
    ...reimportIdFields.map((f) => REIMPORT_ID_LABELS[f] ?? f),
    ...fieldNames.map((f) => (isReimport && REIMPORT_ID_LABELS[f] ? REIMPORT_ID_LABELS[f] : getLabel(f, fieldConfig))),
  ];

  const dataRows = rows.map((row) => {
    const idCells = reimportIdFields.map((f) => {
      const v = row?.[f];
      return v == null || v === '' ? '' : String(v);
    });
    const cells = fieldNames.map((f) => {
      const orig = getOriginalHeader(f);
      const raw = readFieldValue(row, f, orig);
      return formatPunchValue(f, raw, format);
    });
    return [...idCells, ...cells];
  });

  const colCount = Math.max(headerRow.length, 2);
  const lastColLetter = XLSX.utils.encode_col(colCount - 1);

  const aoa: any[][] = [
    [`SHAW T&C — Punch Raw Data Export  (${formatLabel})`],
    [`Exported: ${exportedTs}  by  ${meta.userName}${meta.userType ? ` (${meta.userType})` : ''}`],
    [`Source: ${finalSource}`],
    [`Search: ${searchSummary || '(none)'}`],
    [`Filters: ${filterSummary || '(none)'}`],
    [`Sort: ${sortSummary || '(default)'}`],
    [],
    headerRow,
    ...dataRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const merges: XLSX.Range[] = [];
  for (let r = 0; r < 6; r++) merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
  ws['!merges'] = merges;

  ws['!cols'] = headerRow.map((_, idx) => {
    if (idx < reimportIdFields.length) {
      const fid = reimportIdFields[idx];
      return { wch: fid === 'id' ? 38 : 18 };
    }
    return { wch: 18 };
  });

  const rowsInfo: XLSX.RowInfo[] = [];
  rowsInfo[0] = { hpt: 24 };
  for (let i = 1; i <= 5; i++) rowsInfo[i] = { hpt: 16 };
  rowsInfo[6] = { hpt: 6 };
  rowsInfo[7] = { hpt: 28 };
  for (let i = 0; i < dataRows.length; i++) rowsInfo[8 + i] = { hpt: 20 };
  ws['!rows'] = rowsInfo;

  const xSplit = Math.min(3, headerRow.length);
  ws['!freeze'] = { xSplit, ySplit: 8 };
  (ws as any)['!views'] = [
    {
      state: 'frozen',
      xSplit,
      ySplit: 8,
      topLeftCell: XLSX.utils.encode_cell({ r: 8, c: xSplit }),
      activePane: 'bottomRight',
    },
  ];

  setCell(ws, 0, 0, aoa[0][0], STYLE_TITLE);
  for (let r = 1; r <= 5; r++) {
    setCell(ws, r, 0, aoa[r][0], r === 1 ? STYLE_META_LABEL : STYLE_META_VALUE);
  }
  for (let c = 0; c < headerRow.length; c++) setCell(ws, 7, c, headerRow[c], STYLE_HEADER);

  const fieldIdByColIdx: (string | null)[] = [...reimportIdFields, ...fieldNames];

  for (let r = 0; r < dataRows.length; r++) {
    const original = rows[r];
    for (let c = 0; c < dataRows[r].length; c++) {
      const fieldId = fieldIdByColIdx[c];
      if (fieldId && DATE_FIELDS.has(fieldId)) {
        const serial = isoToExcelSerial(original?.[fieldId]);
        if (serial != null) {
          setDateCell(ws, 8 + r, c, serial, STYLE_DATA, DATE_NUMFMT);
          continue;
        }
      } else if (fieldId && DATETIME_FIELDS.has(fieldId)) {
        const serial = isoTimestampToExcelSerial(original?.[fieldId]);
        if (serial != null) {
          setDateCell(ws, 8 + r, c, serial, STYLE_DATA, DATETIME_NUMFMT);
          continue;
        }
      }
      setCell(ws, 8 + r, c, dataRows[r][c], STYLE_DATA);
    }
  }

  const lastRow = 8 + dataRows.length - 1;
  ws['!ref'] = `A1:${lastColLetter}${Math.max(lastRow + 1, 8)}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Punch');
  return wb;
}

function timestampForFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function sanitizeForFilename(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Unassigned';
  const cleaned = trimmed.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 30) || 'Unassigned';
}

function normalizeOpts(opts: ExportPunchRawOptions): BuildSheetParams {
  return {
    rows: opts.rows,
    fieldNames: opts.fieldNames,
    fieldConfig: opts.fieldConfig,
    meta: opts.meta,
    sourceLabel: opts.sourceLabel ?? 'Punch Raw Data',
    searchSummary: opts.searchSummary ?? '(none)',
    filterSummary: opts.filterSummary ?? '(none)',
    sortSummary: opts.sortSummary ?? '(default)',
    format: opts.format ?? 'view',
    getOriginalHeader: opts.getOriginalHeader ?? (() => null),
  };
}

// ---------------------------------------------------------------------------
// Public: single file
// ---------------------------------------------------------------------------

export function exportPunchRawToExcel(opts: ExportPunchRawOptions): { rowCount: number; fileName: string } {
  const base = normalizeOpts(opts);
  const wb = buildPunchWorkbook(base);
  const suffix = base.format === 'reimport' ? '_REIMPORT' : '';
  const fileName = `SHAW_Punch${suffix}_${timestampForFilename()}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { rowCount: opts.rows.length, fileName };
}

// ---------------------------------------------------------------------------
// Public: per-subcontractor (multiple downloads)
// ---------------------------------------------------------------------------

function groupBySubcontractor(rows: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const raw = r?.subcontractor_name;
    const key = raw && String(raw).trim() ? String(raw).trim() : 'Unassigned';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  return groups;
}

function sortGroupKeys(groups: Map<string, any[]>): string[] {
  return Array.from(groups.keys()).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });
}

export function exportPunchRawToExcelBySubcontractor(opts: ExportPunchRawOptions): {
  fileCount: number;
  rowCount: number;
  fileNames: string[];
} {
  const base = normalizeOpts(opts);
  const groups = groupBySubcontractor(opts.rows);
  const ts = timestampForFilename();
  const suffix = base.format === 'reimport' ? '_REIMPORT' : '';
  const fileNames: string[] = [];

  for (const subconName of sortGroupKeys(groups)) {
    const groupRows = groups.get(subconName)!;
    const wb = buildPunchWorkbook({ ...base, rows: groupRows, sourceSuffix: `Subcontractor: ${subconName}` });
    const fileName = `SHAW_Punch${suffix}_${sanitizeForFilename(subconName)}_${ts}.xlsx`;
    XLSX.writeFile(wb, fileName);
    fileNames.push(fileName);
  }

  return { fileCount: fileNames.length, rowCount: opts.rows.length, fileNames };
}

// ---------------------------------------------------------------------------
// Public: per-subcontractor ZIP (single download)
// ---------------------------------------------------------------------------

export async function exportPunchRawToZipBySubcontractor(opts: ExportPunchRawOptions): Promise<{
  fileCount: number;
  rowCount: number;
  zipFileName: string;
  fileNames: string[];
}> {
  const { default: JSZip } = await import('jszip');
  const base = normalizeOpts(opts);
  const groups = groupBySubcontractor(opts.rows);
  const ts = timestampForFilename();
  const suffix = base.format === 'reimport' ? '_REIMPORT' : '';

  const zip = new JSZip();
  const usedNames = new Set<string>();
  const fileNames: string[] = [];

  for (const subconName of sortGroupKeys(groups)) {
    const groupRows = groups.get(subconName)!;
    const wb = buildPunchWorkbook({ ...base, rows: groupRows, sourceSuffix: `Subcontractor: ${subconName}` });

    const baseName = `SHAW_Punch${suffix}_${sanitizeForFilename(subconName)}_${ts}`;
    let candidate = `${baseName}.xlsx`;
    let n = 2;
    while (usedNames.has(candidate)) {
      candidate = `${baseName} (${n}).xlsx`;
      n += 1;
    }
    usedNames.add(candidate);

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    zip.file(candidate, buffer);
    fileNames.push(candidate);
  }

  const zipFileName = `SHAW_Punch${suffix}_BySubcontractor_${ts}.zip`;
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { fileCount: fileNames.length, rowCount: opts.rows.length, zipFileName, fileNames };
}
