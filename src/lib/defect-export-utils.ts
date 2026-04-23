import * as XLSX from 'xlsx';
import { type DefectItem, isClosedDefect, isOverdueDefect } from '@/lib/defect-utils';
import { DEFECT_DEFAULT_FIELD_LABELS, type DefectFieldConfigRow } from '@/hooks/useDefectFieldConfig';

export interface DefectExportFilters {
  query: string;
  team: string;
  status: string;
  subcontractor: string;
  subsub: string;
  hdecPic: string;
  mainTrade: string;
  subTrade: string;
  level: string;
  dateField: 'planned_date' | 'target_date' | 'closed_date' | 'updated_at';
  dateStart: string;
  dateEnd: string;
}

export type DefectColumnMode = 'all' | 'visible' | 'responsibility' | 'schedule' | 'progress';

export const DEFECT_EXPORT_FIELDS = Object.keys(DEFECT_DEFAULT_FIELD_LABELS);
export const DEFECT_EXPORT_GROUPS: Record<Exclude<DefectColumnMode, 'all' | 'visible'>, string[]> = {
  responsibility: ['issue_no', 'subcontractor_issue_no', 'subcontractor_issue_source', 'team', 'subcontractor_name', 'subsub_name', 'hdec_pic_name'],
  schedule: ['issue_no', 'planned_date', 'target_date', 'closed_date', 'closure_status', 'actual_progress_pct'],
  progress: ['issue_no', 'status', 'closure_status', 'actual_progress_pct', 'planned_date', 'target_date', 'closed_date'],
};

function matchesText(item: DefectItem, query: string) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return [item.issue_no, item.subcontractor_issue_no, item.area_location, item.description, item.subcontractor_name, item.subsub_name, item.hdec_pic_name]
    .some((value) => String(value ?? '').toLowerCase().includes(text));
}

export function filterDefectsForExport(items: DefectItem[], filters: DefectExportFilters) {
  return items.filter((item) => {
    const statusText = String(item.closure_status ?? item.status ?? '').toLowerCase();
    const dateValue = filters.dateField === 'updated_at' ? item.updated_at?.slice(0, 10) : String((item as any)[filters.dateField] ?? '');
    return matchesText(item, filters.query)
      && (!filters.team || item.team === filters.team)
      && (!filters.status || statusText.includes(filters.status.toLowerCase()))
      && (!filters.subcontractor || item.subcontractor_name === filters.subcontractor)
      && (!filters.subsub || item.subsub_name === filters.subsub)
      && (!filters.hdecPic || item.hdec_pic_name === filters.hdecPic)
      && (!filters.mainTrade || item.main_trade === filters.mainTrade)
      && (!filters.subTrade || item.sub_trade === filters.subTrade)
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

export function exportDefectsWorkbook(items: DefectItem[], opts: { columns: string[]; configs: DefectFieldConfigRow[]; filters: DefectExportFilters; filePrefix?: string }) {
  const configMap = new Map(opts.configs.map((field) => [field.field_name, field]));
  const label = (field: string) => configMap.get(field)?.display_name || DEFECT_DEFAULT_FIELD_LABELS[field] || field;
  const rows = items.map((item) => Object.fromEntries(opts.columns.map((field) => [label(field), (item as any)[field] ?? ''])));
  const summary = [
    { Metric: 'Total', Value: items.length },
    { Metric: 'Closed', Value: items.filter(isClosedDefect).length },
    { Metric: 'Open', Value: items.filter((item) => !isClosedDefect(item)).length },
    { Metric: 'Overdue', Value: items.filter((item) => isOverdueDefect(item)).length },
  ];
  const info = Object.entries(opts.filters).map(([Field, Value]) => ({ Field, Value: Value || '—' }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Defects');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), 'Export Info');
  const fileName = `${opts.filePrefix ?? 'defect_advanced_export'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { fileName, rowCount: rows.length };
}
