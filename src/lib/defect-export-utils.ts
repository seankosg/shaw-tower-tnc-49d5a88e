import * as XLSX from 'xlsx';
import { type DefectItem, isClosedDefect, isOverdueDefect } from '@/lib/defect-utils';
import { DEFECT_DEFAULT_FIELD_LABELS, type DefectFieldConfigRow } from '@/hooks/useDefectFieldConfig';
import { formatTeamLabel } from '@/types/enums';
import { isoToExcelSerial, isoTimestampToExcelSerial, DATE_NUMFMT, DATETIME_NUMFMT } from '@/lib/excel-date-cell';

const DATE_FIELDS = new Set([
  'planned_start_date',
  'planned_completion_date',
  'planned_closure_date',
  'actual_start_date',
  'actual_completion_date',
  'actual_closure_date',
]);
const DATETIME_FIELDS = new Set(['updated_at', 'created_at']);

export type DefectExportDateField =
  | 'planned_start_date'
  | 'planned_completion_date'
  | 'planned_closure_date'
  | 'actual_start_date'
  | 'actual_completion_date'
  | 'actual_closure_date'
  | 'updated_at';

export interface DefectExportFilters {
  query: string;
  team: string;
  status: string;
  subcontractor: string;
  subsub: string;
  hdecPic: string;
  mainTrade: string;
  subTrade: string;
  workType: string;
  classificationSource: string;
  level: string;
  dateField: DefectExportDateField;
  dateStart: string;
  dateEnd: string;
}

export type DefectColumnMode = 'all' | 'visible' | 'responsibility' | 'schedule' | 'progress' | 'classification';

export const DEFECT_EXPORT_FIELDS = Object.keys(DEFECT_DEFAULT_FIELD_LABELS);
export const DEFECT_EXPORT_GROUPS: Record<Exclude<DefectColumnMode, 'all' | 'visible'>, string[]> = {
  responsibility: ['issue_no', 'subcontractor_issue_no', 'subcontractor_issue_source', 'team', 'subcontractor_name', 'subsub_name', 'hdec_pic_name', 'hdec_eng_name'],
  schedule: [
    'issue_no',
    'planned_start_date', 'planned_completion_date', 'planned_closure_date',
    'actual_start_date', 'actual_completion_date', 'actual_closure_date',
    'completion_status', 'closure_status',
  ],
  progress: ['issue_no', 'status', 'completion_status', 'closure_status', 'planned_progress_pct', 'actual_progress_pct', 'planned_completion_date', 'actual_completion_date', 'planned_closure_date', 'actual_closure_date'],
  classification: ['issue_no', 'description', 'main_trade', 'sub_trade', 'work_type', 'classification_source', 'trade_detail'],
};

function matchesText(item: DefectItem, query: string) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return [item.issue_no, item.subcontractor_issue_no, item.area_location, item.description, item.subcontractor_name, item.subsub_name, item.hdec_pic_name]
    .some((value) => String(value ?? '').toLowerCase().includes(text));
}

export function filterDefectsForExport(items: DefectItem[], filters: DefectExportFilters) {
  return items.filter((item) => {
    const statusText = String(item.closure_status ?? item.completion_status ?? item.status ?? '').toLowerCase();
    const dateValue = filters.dateField === 'updated_at' ? item.updated_at?.slice(0, 10) : String((item as any)[filters.dateField] ?? '');
    return matchesText(item, filters.query)
      && (!filters.team || item.team === filters.team)
      && (!filters.status || statusText.includes(filters.status.toLowerCase()))
      && (!filters.subcontractor || item.subcontractor_name === filters.subcontractor)
      && (!filters.subsub || item.subsub_name === filters.subsub)
      && (!filters.hdecPic || item.hdec_pic_name === filters.hdecPic)
      && (!filters.mainTrade || item.main_trade === filters.mainTrade)
      && (!filters.subTrade || item.sub_trade === filters.subTrade)
      && (!filters.workType || item.work_type === filters.workType)
      && (!filters.classificationSource || item.classification_source === filters.classificationSource)
      && (!filters.level || item.area_level === filters.level)
      && (!filters.dateStart || (dateValue && dateValue >= filters.dateStart))
      && (!filters.dateEnd || (dateValue && dateValue <= filters.dateEnd));
  });
}

export function resolveDefectExportColumns(mode: DefectColumnMode, configs: DefectFieldConfigRow[]) {
  const configMap = new Map(configs.map((field) => [field.field_name, field]));
  const base = mode === 'all' ? DEFECT_EXPORT_FIELDS : mode === 'visible'
    ? DEFECT_EXPORT_FIELDS.filter((field) => configMap.get(field)?.is_enabled ?? true)
    : DEFECT_EXPORT_GROUPS[mode];
  return [...base].sort((a, b) => (configMap.get(a)?.sort_order ?? 9999) - (configMap.get(b)?.sort_order ?? 9999));
}

export function exportDefectsWorkbook(
  items: DefectItem[],
  opts: {
    columns: string[];
    configs: DefectFieldConfigRow[];
    filters: DefectExportFilters;
    /** Data Date — required for overdue judgment. Pass from useLatestDataDate(). */
    asOf: string;
    filePrefix?: string;
  },
) {
  const configMap = new Map(opts.configs.map((field) => [field.field_name, field]));
  const label = (field: string) => configMap.get(field)?.display_name || DEFECT_DEFAULT_FIELD_LABELS[field] || field;

  // Build Defects sheet manually so date fields become real Excel date cells.
  const headers = opts.columns.map(label);
  const defectsSheet = XLSX.utils.aoa_to_sheet([headers]);
  for (let r = 0; r < items.length; r++) {
    const item = items[r] as any;
    for (let c = 0; c < opts.columns.length; c++) {
      const field = opts.columns[c];
      const raw = item[field];
      const addr = XLSX.utils.encode_cell({ r: r + 1, c });
      if (DATE_FIELDS.has(field)) {
        const serial = isoToExcelSerial(raw);
        if (serial != null) {
          defectsSheet[addr] = { t: 'n', v: serial, z: DATE_NUMFMT };
          continue;
        }
      } else if (DATETIME_FIELDS.has(field)) {
        const serial = isoTimestampToExcelSerial(raw);
        if (serial != null) {
          defectsSheet[addr] = { t: 'n', v: serial, z: DATETIME_NUMFMT };
          continue;
        }
      }
      const value = field === 'team' ? formatTeamLabel(raw) : raw ?? '';
      if (typeof value === 'number') {
        defectsSheet[addr] = { t: 'n', v: value };
      } else {
        defectsSheet[addr] = { t: 's', v: value === '' ? '' : String(value) };
      }
    }
  }
  const lastCol = XLSX.utils.encode_col(Math.max(opts.columns.length - 1, 0));
  defectsSheet['!ref'] = `A1:${lastCol}${items.length + 1}`;

  const summary = [
    { Metric: 'Total', Value: items.length },
    { Metric: 'Closed', Value: items.filter(isClosedDefect).length },
    { Metric: 'Open', Value: items.filter((item) => !isClosedDefect(item)).length },
    { Metric: 'Overdue (as of Data Date)', Value: items.filter((item) => isOverdueDefect(item, opts.asOf)).length },
    { Metric: 'Data Date', Value: opts.asOf },
  ];
  const info = [
    { Field: 'Data Date', Value: opts.asOf },
    ...Object.entries(opts.filters).map(([Field, Value]) => ({ Field, Value: Value || '—' })),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, defectsSheet, 'Defects');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), 'Export Info');
  const fileName = `${opts.filePrefix ?? 'defect_advanced_export'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { fileName, rowCount: items.length };
}
