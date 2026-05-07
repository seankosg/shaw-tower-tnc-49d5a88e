import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  getFacetedRowModel, getFacetedUniqueValues,
  flexRender, type ColumnDef, type SortingState, type ColumnFiltersState,
  type ColumnSizingState, type RowSelectionState, type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataSourceTag } from '@/components/shared/DataSourceTag';
import { StageProgress, StageProgressLegend } from '@/components/shared/StageProgress';
import { Check, Filter, MessageSquare, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Upload, Download, ChevronDown } from 'lucide-react';
import type { TcStatus, DataSource, TeamType, ReportStatus } from '@/types/enums';
import { TC_STATUS_OPTIONS, DATA_SOURCE_LABELS, ALL_TEAMS, TEAM_LABELS, REPORT_STATUS_OPTIONS } from '@/types/enums';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import { getSubtestCache, setSubtestCache } from '@/lib/subtest-cache';
import { exportSubtestsToExcel, exportSubtestsToExcelBySubcontractor, exportSubtestsToZipBySubcontractor } from '@/lib/excel-export';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

const ZIP_THRESHOLD = 7;
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { USER_TYPE_LABELS } from '@/types/enums';
import {
  getAnyStageDelayedAsOf,
  getStageActualDate,
  getStageKeys,
  getStagePlannedDate,
  isStageDelayedAsOf,
  isStageDone,
  todayIso,
  type StageKey,
} from '@/lib/stage-metrics';
import { BulkEditBar } from '@/components/raw-data/BulkEditBar';
import { TopHorizontalScrollbar } from '@/components/raw-data/TopHorizontalScrollbar';
import type { BulkEditableField } from '@/lib/bulk-edit';
import { META_FIELD_NAMES, type CommentSummary, EMPTY_SUMMARY, isMetaField } from '@/lib/meta-fields';
import { MetaCell } from '@/components/raw-data/MetaCell';
import { buildColumnFilterChips } from '@/lib/filter-chip-utils';
import { inferFilterType } from '@/lib/field-filter-type';

interface SubtestRow {
  id: string;
  subtest_id: string;
  item_no: string;
  mos_code: string;
  level: string | null;
  equipment: string | null;
  description: string | null;
  t1_planned_date: string | null;
  t1_actual_date: string | null;
  t1_status: TcStatus | null;
  t2_planned_date: string | null;
  t2_actual_date: string | null;
  t2_status: TcStatus | null;
  predecessor_status_raw: string | null;
  pred_status: TcStatus | null;
  pred_planned_date: string | null;
  pred_actual_date: string | null;
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  data_source_type: DataSource | null;
  team: TeamType | null;
  updated_at: string;
  system_code: string;
  // R1 / R2 (report workflow)
  r1_status: ReportStatus | null;
  r1_target_submission_date: string | null;
  r1_actual_submission_date: string | null;
  r2_status: ReportStatus | null;
  r2_target_submission_date: string | null;
  r2_actual_submission_date: string | null;
  r2_target_approval_date: string | null;
  r2_actual_approval_date: string | null;
  r1_report_ref: string | null;
  aconex_ref_no: string | null;
  remarks: string | null;
  punchlist_comments: string | null;
  mos_sequence: number | null;
  updated_by: string | null;
  source_upload_id: string | null;
}

// ---- Filter functions ----

const EMPTY_TOKEN = '__EMPTY__';

const multiSelectFilterFn = (row: any, columnId: string, filterValue: string[]) => {
  if (!filterValue || filterValue.length === 0) return true;
  const val = row.getValue(columnId);
  const isEmpty = val == null || val === '';
  if (filterValue.includes(EMPTY_TOKEN) && isEmpty) return true;
  if (isEmpty) return false;
  return filterValue.includes(val);
};

const textFilterFn = (row: any, columnId: string, filterValue: any) => {
  if (!filterValue) return true;
  // Support object shape { text, emptyOnly }
  const text = typeof filterValue === 'string' ? filterValue : filterValue?.text;
  const emptyOnly = typeof filterValue === 'object' ? filterValue?.emptyOnly : false;
  const val = row.getValue(columnId);
  if (emptyOnly) return val == null || String(val).trim() === '';
  if (!text) return true;
  if (val == null) return false;
  return String(val).toLowerCase().includes(text.toLowerCase());
};

const dateRangeFilterFn = (row: any, columnId: string, filterValue: any) => {
  if (!filterValue) return true;
  const { from, to, emptyOnly } = filterValue;
  const val = row.getValue(columnId) as string | null;
  if (emptyOnly) return val == null || val === '';
  if (!from && !to) return true;
  if (!val) return false;
  if (from && val < from) return false;
  if (to && val > to) return false;
  return true;
};

// ---- Filter dropdown components ----

function MultiSelectDropdown({ column, options }: {
  column: any;
  options: { value: string; label: string }[];
}) {
  const selected: string[] = (column.getFilterValue() as string[]) ?? [];
  const isActive = selected.length > 0;

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v: string) => v !== value)
      : [...selected, value];
    column.setFilterValue(next.length ? next : undefined);
  };

  // Label dictionary derived from the static `options` prop (used for enum→label mapping).
  const labelMap = useMemo(() => new Map(options.map(o => [o.value, o.label])), [options]);

  // Faceted unique values reflect rows that pass ALL OTHER active column filters
  // (TanStack Table excludes the current column's own filter automatically).
  const facets = column.getFacetedUniqueValues?.() as Map<any, number> | undefined;

  // Build candidate items: union of facet keys + currently-selected values + static options
  // (so enums with no current data and already-selected-but-now-filtered-out values are kept).
  const items = useMemo(() => {
    const counts = new Map<string, number>();
    let emptyCount = 0;
    if (facets) {
      facets.forEach((count, rawVal) => {
        if (rawVal == null || rawVal === '') {
          emptyCount += count;
        } else {
          const key = String(rawVal);
          counts.set(key, (counts.get(key) ?? 0) + count);
        }
      });
    }
    // Ensure currently-selected and static options remain visible even with count=0.
    selected.forEach((v) => { if (v !== EMPTY_TOKEN && !counts.has(v)) counts.set(v, 0); });
    options.forEach((o) => { if (!counts.has(o.value)) counts.set(o.value, 0); });

    const list = [...counts.entries()].map(([value, count]) => ({
      value,
      label: labelMap.get(value) ?? value,
      count,
    }));
    list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return [{ value: EMPTY_TOKEN, label: '(Empty)', count: emptyCount }, ...list];
  }, [facets, options, labelMap, selected]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted/80',
            isActive ? 'text-primary' : 'text-muted-foreground/50'
          )}
          onClick={(e) => e.stopPropagation()}
          title="Filter"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-2 max-h-72 overflow-auto"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1 px-1">
          <button
            className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => column.setFilterValue(items.map(o => o.value))}
          >
            Select all
          </button>
          <button
            className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => column.setFilterValue(undefined)}
          >
            Clear all
          </button>
        </div>
        {items.map(o => (
          <label
            key={o.value}
            className={cn(
              'flex items-center gap-2 px-1 py-1 text-xs cursor-pointer hover:bg-muted/50 rounded',
              o.count === 0 && !selected.includes(o.value) && 'text-muted-foreground/60'
            )}
          >
            <Checkbox
              checked={selected.includes(o.value)}
              onCheckedChange={() => toggle(o.value)}
              className="h-3.5 w-3.5"
            />
            <span className="flex-1 truncate">{o.label}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{o.count}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function DateRangeDropdown({ column }: { column: any }) {
  const filterValue = column.getFilterValue() as { from?: string; to?: string; emptyOnly?: boolean } | undefined;
  const isActive = !!(filterValue?.from || filterValue?.to || filterValue?.emptyOnly);

  const update = (patch: Partial<{ from: string; to: string; emptyOnly: boolean }>) => {
    const current = filterValue ?? {};
    const next = { ...current, ...patch };
    if (!next.from && !next.to && !next.emptyOnly) {
      column.setFilterValue(undefined);
    } else {
      column.setFilterValue(next);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted/80',
            isActive ? 'text-primary' : 'text-muted-foreground/50'
          )}
          onClick={(e) => e.stopPropagation()}
          title="Filter"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-3 space-y-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-1">
          <button
            className="text-[11px] text-muted-foreground/40 cursor-not-allowed"
            disabled
            title="Not applicable for date filters"
          >
            Select all
          </button>
          <button
            className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => column.setFilterValue(undefined)}
          >
            Clear all
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">From</label>
          <Input
            type="date"
            value={filterValue?.from ?? ''}
            onChange={(e) => update({ from: e.target.value || undefined })}
            className="h-7 text-xs"
            disabled={!!filterValue?.emptyOnly}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">To</label>
          <Input
            type="date"
            value={filterValue?.to ?? ''}
            onChange={(e) => update({ to: e.target.value || undefined })}
            className="h-7 text-xs"
            disabled={!!filterValue?.emptyOnly}
          />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer pt-1">
          <Checkbox
            checked={!!filterValue?.emptyOnly}
            onCheckedChange={(checked) => update({ emptyOnly: !!checked, from: undefined, to: undefined })}
            className="h-3.5 w-3.5"
          />
          Empty only
        </label>
      </PopoverContent>
    </Popover>
  );
}

function TextFilterDropdown({ column }: { column: any }) {
  const filterValue = column.getFilterValue() as { text?: string; emptyOnly?: boolean } | string | undefined;
  const text = typeof filterValue === 'string' ? filterValue : filterValue?.text ?? '';
  const emptyOnly = typeof filterValue === 'object' ? filterValue?.emptyOnly ?? false : false;
  const isActive = !!(text || emptyOnly);

  const update = (patch: Partial<{ text: string; emptyOnly: boolean }>) => {
    const current = typeof filterValue === 'string'
      ? { text: filterValue, emptyOnly: false }
      : filterValue ?? { text: '', emptyOnly: false };
    const next = { ...current, ...patch };
    if (!next.text && !next.emptyOnly) {
      column.setFilterValue(undefined);
    } else {
      column.setFilterValue(next);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted/80',
            isActive ? 'text-primary' : 'text-muted-foreground/50'
          )}
          onClick={(e) => e.stopPropagation()}
          title="Filter"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-52 p-3 space-y-2"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-1">
          <button
            className="text-[11px] text-muted-foreground/40 cursor-not-allowed"
            disabled
            title="Not applicable for text filters"
          >
            Select all
          </button>
          <button
            className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => column.setFilterValue(undefined)}
          >
            Clear all
          </button>
        </div>
        <Input
          placeholder="Search..."
          value={text}
          onChange={(e) => update({ text: e.target.value || undefined })}
          className="h-7 text-xs"
          disabled={emptyOnly}
        />
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={emptyOnly}
            onCheckedChange={(checked) => update({ emptyOnly: !!checked, text: undefined })}
            className="h-3.5 w-3.5"
          />
          Empty only
        </label>
      </PopoverContent>
    </Popover>
  );
}

// ---- Stage Progress per-stage filter ----------------------------------------
type StageProgressState = 'Done' | 'WIP' | 'Planned' | 'Delayed';
const STAGE_PROGRESS_STATES: StageProgressState[] = ['Done', 'WIP', 'Planned', 'Delayed'];
const STAGE_FILTER_KEYS = ['pred', 't1', 't2', 'r1', 'r2a'] as const;
type StageFilterKey = typeof STAGE_FILTER_KEYS[number];
const STAGE_FILTER_LABELS: Record<StageFilterKey, string> = {
  pred: 'Predecessor',
  t1: 'T1',
  t2: 'T2',
  r1: 'R1',
  r2a: 'R2A',
};

export type StageProgressFilter = Partial<Record<StageFilterKey, StageProgressState[]>>;

export function isStageProgressFilterEmpty(v: StageProgressFilter | undefined | null): boolean {
  if (!v) return true;
  return STAGE_FILTER_KEYS.every((k) => !v[k] || v[k]!.length === 0);
}

function classifyStageState(
  row: any,
  stage: StageFilterKey,
  asOfDate: string,
): StageProgressState {
  const stageKey: StageKey = stage;
  if (isStageDone(row, stageKey)) return 'Done';
  if (isStageDelayedAsOf(row, stageKey, asOfDate)) return 'Delayed';
  const status =
    stage === 'pred' ? row.pred_status
    : stage === 't1' ? row.t1_status
    : stage === 't2' ? row.t2_status
    : stage === 'r1' ? row.r1_status
    : row.r2_status;
  if (status === 'Hold') return 'Delayed';
  if (status === 'WIP') return 'WIP';
  if (stage === 'r2a' && (status === 'Submitted' || status === 'Under Review')) return 'WIP';
  return 'Planned';
}

const stageProgressFilterFn: any = (
  row: any,
  columnId: string,
  filterValue: StageProgressFilter,
) => {
  if (isStageProgressFilterEmpty(filterValue)) return true;
  const original = row.original;
  const meta = (row as any).getAllCells?.()?.find?.((c: any) => c.column.id === columnId)
    ?.column?.columnDef?.meta as any;
  const asOf: string = meta?.asOfDate || todayIso();
  for (const k of STAGE_FILTER_KEYS) {
    const allowed = filterValue[k];
    if (!allowed || allowed.length === 0) continue;
    const state = classifyStageState(original, k, asOf);
    if (!allowed.includes(state)) return false;
  }
  return true;
};

function StageProgressFilterDropdown({ column }: { column: any }) {
  const value = (column.getFilterValue() as StageProgressFilter | undefined) ?? {};
  const isActive = !isStageProgressFilterEmpty(value);

  const toggle = (stage: StageFilterKey, state: StageProgressState) => {
    const current = value[stage] ?? [];
    const next = current.includes(state)
      ? current.filter((s) => s !== state)
      : [...current, state];
    const merged: StageProgressFilter = { ...value, [stage]: next };
    if (next.length === 0) delete (merged as any)[stage];
    column.setFilterValue(isStageProgressFilterEmpty(merged) ? undefined : merged);
  };

  const setStageAll = (stage: StageFilterKey, all: boolean) => {
    const merged: StageProgressFilter = { ...value };
    if (all) merged[stage] = [...STAGE_PROGRESS_STATES];
    else delete (merged as any)[stage];
    column.setFilterValue(isStageProgressFilterEmpty(merged) ? undefined : merged);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted/80',
            isActive ? 'text-primary' : 'text-muted-foreground/50',
          )}
          onClick={(e) => e.stopPropagation()}
          title="Filter Progress by stage"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 space-y-2 max-h-[440px] overflow-auto"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[11px] font-semibold text-foreground">Filter by stage state</span>
          <button
            className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => column.setFilterValue(undefined)}
          >
            Clear all
          </button>
        </div>
        <div className="space-y-2">
          {STAGE_FILTER_KEYS.map((stage) => {
            const selected = value[stage] ?? [];
            return (
              <div key={stage} className="border rounded-md p-2 bg-muted/30">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] font-semibold">{STAGE_FILTER_LABELS[stage]}</span>
                  <div className="flex gap-1.5">
                    <button
                      className="text-[10px] text-muted-foreground hover:underline"
                      onClick={() => setStageAll(stage, true)}
                    >
                      All
                    </button>
                    <span className="text-[10px] text-muted-foreground/40">·</span>
                    <button
                      className="text-[10px] text-muted-foreground hover:underline"
                      onClick={() => setStageAll(stage, false)}
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {STAGE_PROGRESS_STATES.map((state) => (
                    <label
                      key={state}
                      className="flex items-center gap-1.5 px-1 py-0.5 text-xs cursor-pointer hover:bg-background/60 rounded"
                    >
                      <Checkbox
                        checked={selected.includes(state)}
                        onCheckedChange={() => toggle(stage, state)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="truncate">{state}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ColumnFilterDropdown({ column }: { column: any }) {
  const meta = column.columnDef.meta as any;
  const filterType = meta?.filterType;

  if (filterType === 'stage-progress') {
    return <StageProgressFilterDropdown column={column} />;
  }
  if (filterType === 'multi-select') {
    return <MultiSelectDropdown column={column} options={meta?.filterOptions ?? []} />;
  }
  if (filterType === 'date-range') {
    return <DateRangeDropdown column={column} />;
  }
  return <TextFilterDropdown column={column} />;
}

const DEFAULT_SORTING: SortingState = [{ id: 'item_no', desc: false }];

export default function SubtestList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = user?.id ? `subtest-list-state:${user.id}` : 'subtest-list-state:anon';
  const { isFieldVisible, orderedFieldNames, fields: fieldConfigRows } = useFieldConfig();

  const [data, setData] = useState<SubtestRow[]>(() => {
    const c = getSubtestCache();
    return c.data ?? [];
  });
  const [loading, setLoading] = useState(() => getSubtestCache().data === null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [searchInput, setSearchInput] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [systems, setSystems] = useState<{ id: string; system_code: string }[]>([]);
  const [dataDate, setDataDate] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [commentSummary, setCommentSummary] = useState<Record<string, CommentSummary>>({});
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'single' | 'per-subcon'>('single');
  const [exportBusy, setExportBusy] = useState(false);
  const urlStatusFilter = searchParams.get('status');
  const urlScope = searchParams.get('scope');
  const urlAtRiskDays = Number(searchParams.get('at_risk_days') ?? '2');
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const autoSizeColumn = (columnId: string) => {
    const container = tableRef.current;
    if (!container) return;
    const cells = container.querySelectorAll<HTMLElement>(`[data-column-id="${columnId}"]`);
    let max = 60;
    cells.forEach(cell => {
      const clone = cell.cloneNode(true) as HTMLElement;
      clone.style.cssText = 'position:absolute; visibility:hidden; width:auto; white-space:nowrap; max-width:none; left:-9999px; top:0;';
      document.body.appendChild(clone);
      const w = clone.getBoundingClientRect().width;
      document.body.removeChild(clone);
      if (w > max) max = w;
    });
    const finalWidth = Math.min(Math.ceil(max) + 16, 600);
    setColumnSizing(prev => ({ ...prev, [columnId]: finalWidth }));
  };

  // URL params that indicate the user arrived from a Dashboard / Progress drill-down.
  // When ANY of these are present we discard saved column filters & sorting so the
  // drill-down view is shown clean (only URL-derived filters apply).
  const SUBTEST_DRILLDOWN_PARAMS = [
    'source', 'q',
    // urlMap keys (column-equality drill-downs)
    'system', 'subcon', 'subsub', 'hdec_pic', 'team',
    'pred_status', 't1_status', 't2_status',
    // date / delay / unplanned cell drill-downs
    'pred_planned_to', 't1_planned_to', 't2_planned_to',
    'pred_actual_to', 't1_actual_to', 't2_actual_to',
    'pred_planned_on', 't1_planned_on', 't2_planned_on',
    'pred_actual_on', 't1_actual_on', 't2_actual_on',
    'pred_delay_asof', 't1_delay_asof', 't2_delay_asof',
    'pred_delay_on', 't1_delay_on', 't2_delay_on',
    'pred_actual_unplanned_on', 't1_actual_unplanned_on', 't2_actual_unplanned_on',
    // R1 / R2 cell drill-downs
    'r1_planned_to', 'r2_planned_to', 'r1_actual_to', 'r2_actual_to',
    'r1_planned_on', 'r2_planned_on', 'r1_actual_on', 'r2_actual_on',
    'r1_delay_asof', 'r2_delay_asof', 'r1_delay_on', 'r2_delay_on',
    'r1_actual_unplanned_on', 'r2_actual_unplanned_on',
    'r1_status', 'r2_status',
    // schedule-cell drill-downs
    'date_from', 'date_to', 'date_field', 'stage', 'cell_status', 'as_of', 'status',
  ];

  useEffect(() => {
    setStateLoaded(false);
    const isDrilldown = SUBTEST_DRILLDOWN_PARAMS.some((p) => searchParams.has(p));
    let baseFilters: ColumnFiltersState = [];
    let baseSorting: SortingState = DEFAULT_SORTING;
    let baseGlobal = '';
    let baseSizing: ColumnSizingState = {};
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Sizing always restored.
        baseSizing = parsed.columnSizing && typeof parsed.columnSizing === 'object' ? parsed.columnSizing : {};
        // Sort, column filters and global search only restored on a clean entry
        // (no drill-down params). On drill-down entry, saved state is discarded
        // so only URL-derived filters apply.
        if (!isDrilldown) {
          baseSorting = Array.isArray(parsed.sorting) && parsed.sorting.length ? parsed.sorting : DEFAULT_SORTING;
          baseFilters = Array.isArray(parsed.columnFilters) ? parsed.columnFilters : [];
          baseGlobal = typeof parsed.globalFilter === 'string' ? parsed.globalFilter : '';
        }
      }
    } catch {
      // ignore
    }

    const urlMap: Record<string, string> = {
      system: 'system_code',
      subcon: 'subcontractor_name',
      subsub: 'subsub_name',
      hdec_pic: 'hdec_pic_name',
      team: 'team',
      pred_status: 'pred_status',
      t1_status: 't1_status',
      t2_status: 't2_status',
    };
    // Merge: keep saved column filters except those that the URL is going to override.
    // (When isDrilldown, baseFilters is already empty so this is a no-op filter.)
    const urlOverriddenColIds = new Set<string>();
    for (const [param, col] of Object.entries(urlMap)) {
      if (searchParams.has(param)) urlOverriddenColIds.add(col);
    }
    const next = baseFilters.filter(f => !urlOverriddenColIds.has(f.id));
    for (const [param, col] of Object.entries(urlMap)) {
      const v = searchParams.get(param);
      if (v) {
        if (col === 'system_code' || col === 'team' || col === 'pred_status' || col === 't1_status' || col === 't2_status'
          || col === 'subcontractor_name' || col === 'subsub_name' || col === 'hdec_pic_name') {
          next.push({ id: col, value: [v] });
        } else {
          next.push({ id: col, value: v });
        }
      }
    }
    const urlQ = searchParams.get('q');
    const effectiveGlobal = urlQ !== null ? urlQ : baseGlobal;
    setSorting(baseSorting);
    setColumnFilters(next);
    setGlobalFilter(effectiveGlobal);
    setSearchInput(effectiveGlobal);
    setColumnSizing(baseSizing);
    setStateLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, searchParams]);

  useEffect(() => {
    const t = setTimeout(() => setGlobalFilter(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!stateLoaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ sorting, columnFilters, globalFilter, columnSizing }));
      } catch {
        // ignore quota errors
      }
    }, 500);
    return () => clearTimeout(t);
  }, [stateLoaded, storageKey, sorting, columnFilters, globalFilter, columnSizing]);

  useEffect(() => {
    if (!stateLoaded) return;
    if (loading) return;
    const el = tableRef.current;
    if (!el) return;
    const raw = localStorage.getItem(`${storageKey}:scroll`);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        const apply = () => {
          el.scrollTop = Number(saved.top) || 0;
          el.scrollLeft = Number(saved.left) || 0;
        };
        apply();
        requestAnimationFrame(apply);
      } catch {
        // ignore
      }
    }
    const save = () => {
      localStorage.setItem(`${storageKey}:scroll`, JSON.stringify({ top: el.scrollTop, left: el.scrollLeft }));
    };
    el.addEventListener('scroll', save, { passive: true });
    return () => el.removeEventListener('scroll', save);
  }, [stateLoaded, storageKey, loading]);

  useEffect(() => {
    fetchData();
    fetchSystems();
    fetchDataDate();
  }, []);

  // Load comment summary (count + unread) for visible subtests, refresh on realtime changes
  useEffect(() => {
    if (!user || data.length === 0) {
      setCommentSummary({});
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const refresh = async () => {
      const ids = data.map((r) => r.id);
      const chunkSize = 500;
      const next: Record<string, CommentSummary> = {};
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data: rows, error } = await (supabase as any).rpc('get_subtest_comment_summary', { _subtest_ids: chunk });
        if (error || !rows) continue;
        for (const row of rows as Array<{
          subtest_id: string;
          comment_count: number;
          has_unread: boolean;
          instruction_count: number;
          comment_count_only: number;
          reply_count: number;
          last_activity_at: string | null;
        }>) {
          next[row.subtest_id] = {
            count: row.comment_count,
            hasUnread: row.has_unread,
            instructionCount: row.instruction_count ?? 0,
            commentCount: row.comment_count_only ?? 0,
            replyCount: row.reply_count ?? 0,
            lastActivityAt: row.last_activity_at ?? null,
          };
        }
      }
      if (!cancelled) setCommentSummary(next);
    };

    const debouncedRefresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 400);
    };

    refresh();

    const channel = supabase
      .channel('subtest-comments-summary')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subtest_comments' }, debouncedRefresh)
      .subscribe();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [user, data]);

  const fetchDataDate = async () => {
    const { data } = await supabase
      .from('upload_batches')
      .select('data_date')
      .eq('status', 'completed')
      .not('data_date', 'is', null)
      .order('data_date', { ascending: false })
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setDataDate(data?.data_date ?? null);
  };

  const fetchSystems = async () => {
    const { data } = await supabase.from('system_master').select('id, system_code').eq('is_active', true);
    if (data) setSystems(data);
  };

  const fetchData = async () => {
    const cached = getSubtestCache();
    if (cached.data) {
      setData(cached.data as SubtestRow[]);
      setLoading(false);
    } else {
      setLoading(true);
    }

    let allData: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data } = await supabase
        .from('subtests')
        .select('id, subtest_id, item_no, mos_code, mos_sequence, level, equipment, description, t1_planned_date, t1_actual_date, t1_status, t2_planned_date, t2_actual_date, t2_status, predecessor_status_raw, pred_status, pred_planned_date, pred_actual_date, subcontractor_name, subsub_name, hdec_pic_name, data_source_type, team, updated_at, updated_by, source_upload_id, system_id, r1_status, r1_target_submission_date, r1_actual_submission_date, r1_report_ref, r2_status, r2_target_submission_date, r2_actual_submission_date, r2_target_approval_date, r2_actual_approval_date, aconex_ref_no, remarks, punchlist_comments, system_master!inner(system_code)' as any)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (data && data.length > 0) {
        allData = allData.concat(data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    const mapped = allData.map((row: any) => ({
      ...row,
      system_code: row.system_master?.system_code ?? '',
    }));
    setData(mapped as SubtestRow[]);
    setSubtestCache(mapped as any);
    setLoading(false);
  };

  const systemOptions = useMemo(() =>
    systems.map(s => ({ value: s.system_code, label: s.system_code })),
    [systems]
  );

  const statusOptions = useMemo(() =>
    TC_STATUS_OPTIONS.map(s => ({ value: s, label: s })),
    []
  );

  const reportStatusOptions = useMemo(() =>
    REPORT_STATUS_OPTIONS.map(s => ({ value: s, label: s })),
    []
  );

  const sourceOptions = useMemo(() =>
    Object.entries(DATA_SOURCE_LABELS).map(([k, v]) => ({ value: k, label: v })),
    []
  );

  // Dynamic options from data for subcontractor, subsub, hdec_pic
  const subcontractorOptions = useMemo(() => {
    const unique = [...new Set(data.map(r => r.subcontractor_name).filter(Boolean))] as string[];
    return unique.sort().map(v => ({ value: v, label: v }));
  }, [data]);

  const subsubOptions = useMemo(() => {
    const unique = [...new Set(data.map(r => r.subsub_name).filter(Boolean))] as string[];
    return unique.sort().map(v => ({ value: v, label: v }));
  }, [data]);

  const hdecPicOptions = useMemo(() => {
    const unique = [...new Set(data.map(r => r.hdec_pic_name).filter(Boolean))] as string[];
    return unique.sort().map(v => ({ value: v, label: v }));
  }, [data]);

  const teamOptions = useMemo(() =>
    ALL_TEAMS.map(t => ({ value: t, label: TEAM_LABELS[t] })),
    []
  );

  const columns = useMemo<ColumnDef<SubtestRow>[]>(() => [
    {
      id: '__select',
      size: 36,
      enableSorting: false,
      enableColumnFilter: false,
      enableResizing: false,
      header: ({ table: t }) => (
        <span onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
          <Checkbox
            checked={t.getIsAllRowsSelected() ? true : t.getIsSomeRowsSelected() ? 'indeterminate' : false}
            onCheckedChange={(checked) => t.toggleAllRowsSelected(!!checked)}
            aria-label="Select all rows in current view"
            className="h-3.5 w-3.5"
          />
        </span>
      ),
      cell: ({ row }) => (
        <span onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(!!checked)}
            aria-label="Select row"
            className="h-3.5 w-3.5"
          />
        </span>
      ),
    },
    { accessorKey: 'item_no', header: 'Item No', size: 100, filterFn: textFilterFn,
      meta: { filterType: 'text' },
      cell: ({ row, getValue }) => {
        const value = getValue() as any;
        const summary = commentSummary[row.original.id];
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="truncate">{String(value ?? '—')}</span>
            {summary && summary.count > 0 && (
              <span
                title={`${summary.count} comment${summary.count > 1 ? 's' : ''}${summary.hasUnread ? ' · unread' : ''}`}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] leading-none',
                  summary.hasUnread
                    ? 'text-amber-600 font-bold bg-amber-500/10'
                    : 'text-muted-foreground',
                )}
              >
                {summary.hasUnread && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />}
                <MessageSquare className="h-3 w-3" />
                {summary.count}
              </span>
            )}
          </span>
        );
      },
    },
    (() => {
      const asOfDate = dataDate ?? new Date().toISOString().slice(0, 10);
      // Sortable bitmask: pred=1, t1=2, t2=4, r1=8, r2a=16 (more progress = larger).
      const progressBitmask = (r: any): number =>
        (isStageDone(r, 'pred') ? 1 : 0)
        + (isStageDone(r, 't1') ? 2 : 0)
        + (isStageDone(r, 't2') ? 4 : 0)
        + (isStageDone(r, 'r1') ? 8 : 0)
        + (isStageDone(r, 'r2a') ? 16 : 0);
      return {
        id: 'stage_progress',
        header: 'Progress',
        size: 170,
        enableColumnFilter: true,
        enableSorting: true,
        accessorFn: progressBitmask,
        filterFn: stageProgressFilterFn,
        meta: {
          filterType: 'stage-progress',
          label: 'Progress',
          asOfDate,
        },
        cell: ({ row }) => (
          <StageProgress
            predecessorRaw={row.original.predecessor_status_raw}
            predStatus={row.original.pred_status}
            predActualDate={row.original.pred_actual_date}
            predPlannedDate={row.original.pred_planned_date}
            t1Status={row.original.t1_status}
            t1ActualDate={row.original.t1_actual_date}
            t1PlannedDate={row.original.t1_planned_date}
            t2Status={row.original.t2_status}
            t2ActualDate={row.original.t2_actual_date}
            t2PlannedDate={row.original.t2_planned_date}
            r1Status={row.original.r1_status}
            r1ActualSubmissionDate={row.original.r1_actual_submission_date}
            r1TargetSubmissionDate={row.original.r1_target_submission_date}
            r2Status={row.original.r2_status}
            r2ActualApprovalDate={row.original.r2_actual_approval_date}
            r2TargetApprovalDate={row.original.r2_target_approval_date}
            asOfDate={dataDate}
          />
        ),
      };
    })(),
    { accessorKey: 'system_code', header: 'System', size: 100, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select', filterOptions: systemOptions } },
    { accessorKey: 'team', header: 'Team', size: 80, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select', filterOptions: teamOptions },
      cell: ({ getValue }) => {
        const v = getValue() as TeamType | null;
        return v ? TEAM_LABELS[v] : '—';
      }},
    { accessorKey: 'level', header: 'Level', size: 90, filterFn: textFilterFn,
      meta: { filterType: 'text' },
      cell: ({ getValue }) => getValue() as string || '—' },
    { accessorKey: 'equipment', header: 'Equipment', size: 120, filterFn: textFilterFn,
      meta: { filterType: 'text' },
      cell: ({ getValue }) => (
        <span className="truncate block max-w-[120px]">{getValue() as string || '—'}</span>
      )},
    { accessorKey: 'subtest_id', header: 'Subtest ID', size: 160, filterFn: textFilterFn,
      meta: { filterType: 'text' } },
    { accessorKey: 'mos_code', header: 'MOS Code', size: 100, filterFn: textFilterFn,
      meta: { filterType: 'text' } },
    { accessorKey: 'description', header: 'Description', size: 200, filterFn: textFilterFn,
      meta: { filterType: 'text' },
      cell: ({ getValue }) => (
        <span className="truncate block max-w-[200px]">{getValue() as string || '—'}</span>
      )},
    { accessorKey: 'predecessor_status_raw', header: 'Predecessor', size: 110, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        if (!v) return '—';
        if (/^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}-[A-Za-z]{3}/.test(v))
          return formatDdMmm(v);
        return v;
      }},
    { accessorKey: 't1_planned_date', header: 'T1 Planned', size: 100, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 't1_actual_date', header: 'T1 Actual', size: 100, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ row }) => {
        const actual = row.original.t1_actual_date;
        const planned = row.original.t1_planned_date;
        if (!actual) return <span className="text-muted-foreground">—</span>;
        const late = planned && actual > planned;
        return (
          <span className={cn('inline-flex items-center gap-1 font-medium', late ? 'text-destructive' : 'text-success')}>
            <Check className="h-3 w-3" />{formatDdMmm(actual)}
          </span>
        );
      }},
    { accessorKey: 't1_status', header: 'T1 Status', size: 90, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select', filterOptions: statusOptions },
      cell: ({ getValue }) => <StatusBadge status={getValue() as TcStatus | null} /> },
    { accessorKey: 't2_planned_date', header: 'T2 Planned', size: 100, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 't2_actual_date', header: 'T2 Actual', size: 100, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ row }) => {
        const actual = row.original.t2_actual_date;
        const planned = row.original.t2_planned_date;
        if (!actual) return <span className="text-muted-foreground">—</span>;
        const late = planned && actual > planned;
        return (
          <span className={cn('inline-flex items-center gap-1 font-medium', late ? 'text-destructive' : 'text-success')}>
            <Check className="h-3 w-3" />{formatDdMmm(actual)}
          </span>
        );
      }},
    { accessorKey: 't2_status', header: 'T2 Status', size: 90, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select', filterOptions: statusOptions },
      cell: ({ getValue }) => <StatusBadge status={getValue() as TcStatus | null} /> },
    { accessorKey: 'pred_planned_date', header: 'Pred Planned', size: 100, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 'pred_actual_date', header: 'Pred Actual', size: 100, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 'subcontractor_name', header: 'Subcontractor', size: 120, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select', filterOptions: subcontractorOptions } },
    { accessorKey: 'subsub_name', header: 'Sub-Sub', size: 120, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select', filterOptions: subsubOptions } },
    { accessorKey: 'hdec_pic_name', header: 'HDEC PIC', size: 110, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select', filterOptions: hdecPicOptions } },
    { accessorKey: 'data_source_type', header: 'Source', size: 110, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select', filterOptions: sourceOptions },
      cell: ({ getValue }) => <DataSourceTag source={getValue() as DataSource | null} /> },
    { accessorKey: 'updated_at', header: 'Updated', size: 140, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    // ---- R1 (Report stage 1) ----
    { accessorKey: 'r1_status', header: 'R1 Status', size: 100, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select', filterOptions: reportStatusOptions },
      cell: ({ getValue }) => {
        const v = getValue() as ReportStatus | null;
        return v ? <span className="text-xs font-medium">{v}</span> : <span className="text-muted-foreground">—</span>;
      } },
    { accessorKey: 'r1_target_submission_date', header: 'R1 Target Sub.', size: 110, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 'r1_actual_submission_date', header: 'R1 Actual Sub.', size: 110, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 'r1_report_ref', header: 'R1 Aconex Ref', size: 130, filterFn: textFilterFn,
      meta: { filterType: 'text' },
      cell: ({ getValue }) => (<span className="truncate block max-w-[130px]">{(getValue() as string) || '—'}</span>) },
    // ---- R2 (Report stage 2) ----
    { accessorKey: 'r2_status', header: 'R2 Status', size: 100, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select', filterOptions: reportStatusOptions },
      cell: ({ getValue }) => {
        const v = getValue() as ReportStatus | null;
        return v ? <span className="text-xs font-medium">{v}</span> : <span className="text-muted-foreground">—</span>;
      } },
    { accessorKey: 'r2_target_submission_date', header: 'R2 Target Sub.', size: 110, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 'r2_actual_submission_date', header: 'R2 Actual Sub.', size: 110, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 'r2_target_approval_date', header: 'R2 Target Apv.', size: 110, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 'r2_actual_approval_date', header: 'R2 Actual Apv.', size: 110, filterFn: dateRangeFilterFn,
      meta: { filterType: 'date-range' },
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    // ---- Other ----
    { accessorKey: 'aconex_ref_no', header: 'Aconex Ref No', size: 130, filterFn: textFilterFn,
      meta: { filterType: 'text' },
      cell: ({ getValue }) => (<span className="truncate block max-w-[130px]">{(getValue() as string) || '—'}</span>) },
    { accessorKey: 'remarks', header: 'Remarks', size: 180, filterFn: textFilterFn,
      meta: { filterType: 'text' },
      cell: ({ getValue }) => (<span className="truncate block max-w-[180px]">{(getValue() as string) || '—'}</span>) },
    { accessorKey: 'punchlist_comments', header: 'Punchlist Comments', size: 180, filterFn: textFilterFn,
      meta: { filterType: 'text' },
      cell: ({ getValue }) => (<span className="truncate block max-w-[180px]">{(getValue() as string) || '—'}</span>) },
    { accessorKey: 'mos_sequence', header: 'MOS Seq.', size: 80, filterFn: textFilterFn,
      meta: { filterType: 'text' },
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        return v == null ? <span className="text-muted-foreground">—</span> : String(v);
      } },
    { accessorKey: 'updated_by', header: 'Updated By', size: 120, filterFn: textFilterFn,
      meta: { filterType: 'text' },
      cell: ({ getValue }) => (<span className="truncate block max-w-[120px] text-muted-foreground">{(getValue() as string) || '—'}</span>) },
    { accessorKey: 'source_upload_id', header: 'Upload ID', size: 110, filterFn: textFilterFn,
      meta: { filterType: 'text' },
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return v ? <span className="font-mono text-[10px] text-muted-foreground">{v.slice(0, 8)}…</span> : <span className="text-muted-foreground">—</span>;
      } },
    // ---- Virtual meta columns (Instructions / Comments / Replies / Last Activity) ----
    ...META_FIELD_NAMES.map<ColumnDef<SubtestRow>>((field) => ({
      id: field,
      header:
        field === '_meta_instruction_count' ? 'Instructions'
          : field === '_meta_comment_count' ? 'Comments'
          : field === '_meta_reply_count' ? 'Replies'
          : 'Last Activity',
      size: 110,
      enableColumnFilter: false,
      enableSorting: true,
      accessorFn: (row: SubtestRow) => {
        const s = commentSummary[row.id] ?? EMPTY_SUMMARY;
        if (field === '_meta_instruction_count') return s.instructionCount;
        if (field === '_meta_comment_count') return s.commentCount;
        if (field === '_meta_reply_count') return s.replyCount;
        return s.lastActivityAt ? new Date(s.lastActivityAt).getTime() : 0;
      },
      cell: ({ row }) => (
        <MetaCell
          field={field as any}
          summary={commentSummary[row.original.id]}
          onClick={() => navigate(`/subtests/${row.original.id}#comments`)}
        />
      ),
    })),
  ], [systemOptions, statusOptions, sourceOptions, subcontractorOptions, subsubOptions, hdecPicOptions, teamOptions, reportStatusOptions, dataDate, commentSummary, navigate]);

  // ─── Dynamic columns: any field_config row that is enabled but has no
  // matching hardcoded column above. Filter type is auto-inferred from the
  // field name + original_header. Currently no field_config rows are missing,
  // but this guarantees future additions auto-appear with sensible filters.
  const dynamicColumns = useMemo<ColumnDef<SubtestRow>[]>(() => {
    const baseIds = new Set<string>(
      columns.map((c) => (c as any).id ?? (c as any).accessorKey).filter(Boolean) as string[],
    );
    // Map known column-id aliases back to field_config field_name
    const aliasToField: Record<string, string> = { system_code: 'system' };
    const baseFields = new Set<string>([...baseIds].map((id) => aliasToField[id] ?? id));
    return (fieldConfigRows ?? [])
      .filter((row) => row && row.is_enabled && !baseFields.has(row.field_name) && !isMetaField(row.field_name))
      .map((row) => {
        const fieldName = row.field_name;
        const inferred = inferFilterType(fieldName);
        const filterFn =
          inferred === 'date-range' ? dateRangeFilterFn
          : inferred === 'multi-select' ? multiSelectFilterFn
          : textFilterFn;
        const optionSet = inferred === 'multi-select'
          ? [...new Set(data.map((r) => {
              const v = (r as any)[fieldName];
              return v == null || v === '' ? '' : String(v);
            }).filter(Boolean))]
              .sort((a, b) => a.localeCompare(b))
              .map((v) => ({ value: v, label: v }))
          : [];
        return {
          accessorKey: fieldName,
          header: row.display_name || fieldName,
          size: 140,
          filterFn,
          meta: { filterType: inferred, filterOptions: optionSet, isDynamic: true },
          cell: ({ getValue }) => {
            const value = getValue() as any;
            if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
            if (inferred === 'date-range') {
              const iso = String(value).slice(0, 10);
              return <span>{iso}</span>;
            }
            return <span className="block truncate">{String(value)}</span>;
          },
        } as ColumnDef<SubtestRow>;
      });
  }, [columns, fieldConfigRows, data]);

  const allColumns = useMemo<ColumnDef<SubtestRow>[]>(
    () => [...columns, ...dynamicColumns],
    [columns, dynamicColumns],
  );

  // Apply status (overdue / at_risk) + date URL filters at data level
  const urlT1PlannedTo = searchParams.get('t1_planned_to');
  const urlT2PlannedTo = searchParams.get('t2_planned_to');
  const urlPredPlannedTo = searchParams.get('pred_planned_to');
  const urlT1ActualTo = searchParams.get('t1_actual_to');
  const urlT2ActualTo = searchParams.get('t2_actual_to');
  const urlPredActualTo = searchParams.get('pred_actual_to');
  const urlT1PlannedOn = searchParams.get('t1_planned_on');
  const urlT2PlannedOn = searchParams.get('t2_planned_on');
  const urlPredPlannedOn = searchParams.get('pred_planned_on');
  const urlT1ActualOn = searchParams.get('t1_actual_on');
  const urlT2ActualOn = searchParams.get('t2_actual_on');
  const urlPredActualOn = searchParams.get('pred_actual_on');
  const urlPredDelayAsOf = searchParams.get('pred_delay_asof');
  const urlT1DelayAsOf = searchParams.get('t1_delay_asof');
  const urlT2DelayAsOf = searchParams.get('t2_delay_asof');
  const urlPredDelayOn = searchParams.get('pred_delay_on');
  const urlT1DelayOn = searchParams.get('t1_delay_on');
  const urlT2DelayOn = searchParams.get('t2_delay_on');
  const urlPredActualUnplannedOn = searchParams.get('pred_actual_unplanned_on');
  const urlT1ActualUnplannedOn = searchParams.get('t1_actual_unplanned_on');
  const urlT2ActualUnplannedOn = searchParams.get('t2_actual_unplanned_on');
  // R1 / R2 cell-link filters (mirror Pred/T1/T2)
  const urlR1PlannedTo = searchParams.get('r1_planned_to');
  const urlR2PlannedTo = searchParams.get('r2_planned_to');
  const urlR1ActualTo = searchParams.get('r1_actual_to');
  const urlR2ActualTo = searchParams.get('r2_actual_to');
  const urlR1PlannedOn = searchParams.get('r1_planned_on');
  const urlR2PlannedOn = searchParams.get('r2_planned_on');
  const urlR1ActualOn = searchParams.get('r1_actual_on');
  const urlR2ActualOn = searchParams.get('r2_actual_on');
  const urlR1DelayAsOf = searchParams.get('r1_delay_asof');
  const urlR2DelayAsOf = searchParams.get('r2_delay_asof');
  const urlR1DelayOn = searchParams.get('r1_delay_on');
  const urlR2DelayOn = searchParams.get('r2_delay_on');
  const urlR1ActualUnplannedOn = searchParams.get('r1_actual_unplanned_on');
  const urlR2ActualUnplannedOn = searchParams.get('r2_actual_unplanned_on');

  const urlDateFrom = searchParams.get('date_from');
  const urlDateTo = searchParams.get('date_to');
  const urlDateField = searchParams.get('date_field') as 'planned' | 'actual' | null;
  const urlStage = searchParams.get('stage') as 'pred' | 't1' | 't2' | null;
  const urlCellStatus = searchParams.get('cell_status') as TcStatus | null;
  const urlAsOf = searchParams.get('as_of');
  const localToday = todayIso();
  const delayAsOfDate = urlAsOf || dataDate || localToday;

  const filteredData = useMemo(() => {
    const atRiskBaseDate = localToday;
    const daysFromToday = (iso: string) => {
      const a = new Date(iso + 'T00:00:00Z').getTime();
      const b = new Date(atRiskBaseDate + 'T00:00:00Z').getTime();
      return Math.round((a - b) / 86400000);
    };

    const inRange = (d: string | null) =>
      !!d && (!urlDateFrom || d >= urlDateFrom) && (!urlDateTo || d <= urlDateTo);

    // Overdue / At-Risk stage scope:
    //  - default: Pred/T1/T2 (matches Dashboard 1-tier KPI Overdue card)
    //  - scope=all: Pred/T1/T2/R1/R2 (matches Dashboard 3-tier alert banner)
    const OVERDUE_STAGES: StageKey[] = urlScope === 'all'
      ? ['pred', 't1', 't2', 'r1', 'r2s', 'r2a']
      : ['pred', 't1', 't2'];

    return data.filter(r => {
      if (urlStatusFilter) {
        const overdue = getAnyStageDelayedAsOf(r, OVERDUE_STAGES, delayAsOfDate);
        if (urlStatusFilter === 'overdue' && !overdue) return false;
        // 5-stage workflow: final completion = R2 Approved
        if (urlStatusFilter === 'remaining' && isStageDone(r, 't2')) return false;
        if (urlStatusFilter === 'at_risk') {
          if (overdue) return false;
          const within = (stage: StageKey) => {
            const planned = getStagePlannedDate(r, stage);
            if (!planned || isStageDone(r, stage)) return false;
            const d = daysFromToday(planned);
            return d >= 0 && d <= urlAtRiskDays;
          };
          if (!OVERDUE_STAGES.some(within)) return false;
        }
      }
      // Pred/T1/T2 cell-link filters
      if (urlPredPlannedTo && !(r.pred_planned_date && r.pred_planned_date <= urlPredPlannedTo)) return false;
      if (urlT1PlannedTo && !(r.t1_planned_date && r.t1_planned_date <= urlT1PlannedTo)) return false;
      if (urlT2PlannedTo && !(r.t2_planned_date && r.t2_planned_date <= urlT2PlannedTo)) return false;
      if (urlPredActualTo && !(r.pred_actual_date && r.pred_actual_date <= urlPredActualTo)) return false;
      if (urlT1ActualTo && !(r.t1_actual_date && r.t1_actual_date <= urlT1ActualTo)) return false;
      if (urlT2ActualTo && !(r.t2_actual_date && r.t2_actual_date <= urlT2ActualTo)) return false;
      if (urlPredPlannedOn && r.pred_planned_date !== urlPredPlannedOn) return false;
      if (urlT1PlannedOn && r.t1_planned_date !== urlT1PlannedOn) return false;
      if (urlT2PlannedOn && r.t2_planned_date !== urlT2PlannedOn) return false;
      if (urlPredActualOn && r.pred_actual_date !== urlPredActualOn) return false;
      if (urlT1ActualOn && r.t1_actual_date !== urlT1ActualOn) return false;
      if (urlT2ActualOn && r.t2_actual_date !== urlT2ActualOn) return false;
      if (urlPredDelayAsOf && !isStageDelayedAsOf(r, 'pred', urlPredDelayAsOf)) return false;
      if (urlT1DelayAsOf && !isStageDelayedAsOf(r, 't1', urlT1DelayAsOf)) return false;
      if (urlT2DelayAsOf && !isStageDelayedAsOf(r, 't2', urlT2DelayAsOf)) return false;
      if (urlPredDelayOn && !(r.pred_planned_date === urlPredDelayOn && !isStageDone(r, 'pred'))) return false;
      if (urlT1DelayOn && !(r.t1_planned_date === urlT1DelayOn && !isStageDone(r, 't1'))) return false;
      if (urlT2DelayOn && !(r.t2_planned_date === urlT2DelayOn && !isStageDone(r, 't2'))) return false;
      if (urlPredActualUnplannedOn && !(r.pred_actual_date === urlPredActualUnplannedOn && r.pred_planned_date !== urlPredActualUnplannedOn)) return false;
      if (urlT1ActualUnplannedOn && !(r.t1_actual_date === urlT1ActualUnplannedOn && r.t1_planned_date !== urlT1ActualUnplannedOn)) return false;
      if (urlT2ActualUnplannedOn && !(r.t2_actual_date === urlT2ActualUnplannedOn && r.t2_planned_date !== urlT2ActualUnplannedOn)) return false;

      // R1 cell-link filters (planned = r1_target_submission_date, actual = r1_actual_submission_date)
      if (urlR1PlannedTo) {
        const p = getStagePlannedDate(r, 'r1');
        if (!(p && p <= urlR1PlannedTo)) return false;
      }
      if (urlR1ActualTo) {
        const a = getStageActualDate(r, 'r1');
        if (!(a && a <= urlR1ActualTo)) return false;
      }
      if (urlR1PlannedOn && getStagePlannedDate(r, 'r1') !== urlR1PlannedOn) return false;
      if (urlR1ActualOn && getStageActualDate(r, 'r1') !== urlR1ActualOn) return false;
      if (urlR1DelayAsOf && !isStageDelayedAsOf(r, 'r1', urlR1DelayAsOf)) return false;
      if (urlR1DelayOn && !(getStagePlannedDate(r, 'r1') === urlR1DelayOn && !isStageDone(r, 'r1'))) return false;
      if (urlR1ActualUnplannedOn) {
        const a = getStageActualDate(r, 'r1');
        const p = getStagePlannedDate(r, 'r1');
        if (!(a === urlR1ActualUnplannedOn && p !== urlR1ActualUnplannedOn)) return false;
      }

      // R2 cell-link filters (planned = r2_target_approval_date, actual = r2_actual_approval_date)
      if (urlR2PlannedTo) {
        const p = getStagePlannedDate(r, 'r2a');
        if (!(p && p <= urlR2PlannedTo)) return false;
      }
      if (urlR2ActualTo) {
        const a = getStageActualDate(r, 'r2a');
        if (!(a && a <= urlR2ActualTo)) return false;
      }
      if (urlR2PlannedOn && getStagePlannedDate(r, 'r2a') !== urlR2PlannedOn) return false;
      if (urlR2ActualOn && getStageActualDate(r, 'r2a') !== urlR2ActualOn) return false;
      if (urlR2DelayAsOf && !isStageDelayedAsOf(r, 'r2a', urlR2DelayAsOf)) return false;
      if (urlR2DelayOn && !(getStagePlannedDate(r, 'r2a') === urlR2DelayOn && !isStageDone(r, 'r2a'))) return false;
      if (urlR2ActualUnplannedOn) {
        const a = getStageActualDate(r, 'r2a');
        const p = getStagePlannedDate(r, 'r2a');
        if (!(a === urlR2ActualUnplannedOn && p !== urlR2ActualUnplannedOn)) return false;
      }

      if (urlDateFrom || urlDateTo) {
        const stages: Array<'pred' | 't1' | 't2'> = urlStage ? [urlStage] : ['pred', 't1', 't2'];
        const fieldKey = urlDateField === 'actual' ? 'actual_date' : 'planned_date';
        let matchAny = false;
        for (const st of stages) {
          const dateVal = urlDateField === 'actual' ? getStageActualDate(r, st) : getStagePlannedDate(r, st);
          if (!inRange(dateVal)) continue;
          if (urlCellStatus) {
            if (urlCellStatus === 'Done' && !isStageDone(r, st)) continue;
          }
          matchAny = true;
          break;
        }
        if (!matchAny) return false;
      }

      return true;
    });
  }, [data, urlStatusFilter, urlAtRiskDays, urlScope,
      urlPredPlannedTo, urlT1PlannedTo, urlT2PlannedTo, urlPredActualTo, urlT1ActualTo, urlT2ActualTo,
      urlPredPlannedOn, urlT1PlannedOn, urlT2PlannedOn, urlPredActualOn, urlT1ActualOn, urlT2ActualOn,
      urlPredDelayAsOf, urlT1DelayAsOf, urlT2DelayAsOf, urlPredDelayOn, urlT1DelayOn, urlT2DelayOn,
      urlPredActualUnplannedOn, urlT1ActualUnplannedOn, urlT2ActualUnplannedOn,
      urlR1PlannedTo, urlR2PlannedTo, urlR1ActualTo, urlR2ActualTo,
      urlR1PlannedOn, urlR2PlannedOn, urlR1ActualOn, urlR2ActualOn,
      urlR1DelayAsOf, urlR2DelayAsOf, urlR1DelayOn, urlR2DelayOn,
      urlR1ActualUnplannedOn, urlR2ActualUnplannedOn,
      urlDateFrom, urlDateTo, urlDateField, urlStage, urlCellStatus, delayAsOfDate, localToday]);

  const columnIdToFieldName: Record<string, string> = {
    system_code: 'system',
  };
  const fieldNameToColumnId: Record<string, string> = { system: 'system_code' };
  const columnVisibility = useMemo<VisibilityState>(() => {
    const visibility: VisibilityState = {};
    for (const col of allColumns) {
      const id = (col as any).id ?? (col as any).accessorKey;
      if (!id) continue;
      if (id === 'stage_progress') continue;
      const fieldName = columnIdToFieldName[id] ?? id;
      visibility[id] = isFieldVisible(fieldName);
    }
    return visibility;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allColumns, isFieldVisible]);

  const columnOrder = useMemo<string[]>(() => {
    const allIds = allColumns
      .map(c => (c as any).id ?? (c as any).accessorKey)
      .filter(Boolean) as string[];
    const PINNED_FRONT = ['__select', 'item_no', 'stage_progress'];
    const pinned = PINNED_FRONT.filter(id => allIds.includes(id));
    const remaining = new Set(allIds.filter(id => !pinned.includes(id)));
    const ordered: string[] = [];
    for (const fname of orderedFieldNames) {
      const colId = fieldNameToColumnId[fname] ?? fname;
      if (remaining.has(colId)) {
        ordered.push(colId);
        remaining.delete(colId);
      }
    }
    for (const id of allIds) {
      if (remaining.has(id)) {
        ordered.push(id);
        remaining.delete(id);
      }
    }
    return [...pinned, ...ordered];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allColumns, orderedFieldNames]);

  const table = useReactTable({
    data: filteredData,
    columns: allColumns,
    state: { sorting, globalFilter, columnFilters, columnSizing, columnVisibility, columnOrder, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableMultiSort: true,
    enableSortingRemoval: true,
    isMultiSortEvent: (e) => (e as unknown as MouseEvent).shiftKey,
    maxMultiSortColCount: 5,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: { minSize: 60, maxSize: 600 },
  });

  // Clear selection on filter/search/url change
  useEffect(() => { setRowSelection({}); }, [columnFilters, globalFilter, searchParams]);

  const selectedRows = useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original),
    [rowSelection, filteredData],
  );

  const bulkFields = useMemo<BulkEditableField[]>(() => [
    { field: 'subcontractor_name', label: 'Subcontractor', inputType: 'select', group: 'Assignment', options: subcontractorOptions },
    { field: 'subsub_name', label: 'Sub-Sub', inputType: 'select', group: 'Assignment', options: subsubOptions },
    { field: 'hdec_pic_name', label: 'HDEC PIC', inputType: 'select', group: 'Assignment', options: hdecPicOptions },
    { field: 'team', label: 'Team', inputType: 'select', group: 'Assignment', options: teamOptions },
    { field: 't1_status', label: 'T1 Status', inputType: 'select', group: 'Status', options: statusOptions },
    { field: 't2_status', label: 'T2 Status', inputType: 'select', group: 'Status', options: statusOptions },
    { field: 'pred_status', label: 'Pred Status', inputType: 'select', group: 'Status', options: statusOptions },
    { field: 't1_planned_date', label: 'T1 Planned', inputType: 'date', group: 'Schedule' },
    { field: 't1_actual_date', label: 'T1 Actual', inputType: 'date', group: 'Schedule' },
    { field: 't2_planned_date', label: 'T2 Planned', inputType: 'date', group: 'Schedule' },
    { field: 't2_actual_date', label: 'T2 Actual', inputType: 'date', group: 'Schedule' },
    { field: 'pred_planned_date', label: 'Pred Planned', inputType: 'date', group: 'Schedule' },
    { field: 'pred_actual_date', label: 'Pred Actual', inputType: 'date', group: 'Schedule' },
    { field: 'remarks', label: 'Remarks', inputType: 'text', group: 'Notes' },
    { field: 'punchlist_comments', label: 'Punchlist Comments', inputType: 'text', group: 'Notes' },
  ], [subcontractorOptions, subsubOptions, hdecPicOptions, teamOptions, statusOptions]);

  const handleBulkApplied = useCallback(({ field, value, ids }: { field: string; value: string | number | null; ids: string[] }) => {
    setData((prev) => prev.map((row) => (ids.includes(row.id) ? ({ ...row, [field]: value as any }) : row)));
    setRowSelection({});
  }, []);

  const activeUrlFilters = useMemo(() => {
    const out: { label: string; param: string; clears?: string[] }[] = [];
    const source = searchParams.get('source');
    const isScheduleCell = source === 'schedule_cell';
    const formatValue = (v: string) => v === EMPTY_TOKEN ? '(Empty)' : v;
    const map: Record<string, string> = {
      system: 'System', subcon: 'Subcon', subsub: 'Sub-Sub',
      hdec_pic: 'HDEC PIC', pred_status: 'Pred', t1_status: 'T1', t2_status: 'T2',
      r1_status: 'R1', r2_status: 'R2', status: 'Status',
      pred_planned_to: 'Pred Plan ≤', pred_actual_to: 'Pred Actual ≤',
      t1_planned_to: 'T1 Plan ≤', t2_planned_to: 'T2 Plan ≤',
      t1_actual_to: 'T1 Actual ≤', t2_actual_to: 'T2 Actual ≤',
      pred_planned_on: 'Pred Plan =', pred_actual_on: 'Pred Actual =',
      t1_planned_on: 'T1 Plan =', t2_planned_on: 'T2 Plan =',
      t1_actual_on: 'T1 Actual =', t2_actual_on: 'T2 Actual =',
      pred_delay_asof: 'Pred Delay ≤', t1_delay_asof: 'T1 Delay ≤', t2_delay_asof: 'T2 Delay ≤',
      pred_delay_on: 'Pred Delay =', t1_delay_on: 'T1 Delay =', t2_delay_on: 'T2 Delay =',
      pred_actual_unplanned_on: 'Pred Unplanned =', t1_actual_unplanned_on: 'T1 Unplanned =', t2_actual_unplanned_on: 'T2 Unplanned =',
      // R1 / R2 cell-link filters
      r1_planned_to: 'R1 Plan ≤', r2_planned_to: 'R2 Plan ≤',
      r1_actual_to: 'R1 Actual ≤', r2_actual_to: 'R2 Actual ≤',
      r1_planned_on: 'R1 Plan =', r2_planned_on: 'R2 Plan =',
      r1_actual_on: 'R1 Actual =', r2_actual_on: 'R2 Actual =',
      r1_delay_asof: 'R1 Delay ≤', r2_delay_asof: 'R2 Delay ≤',
      r1_delay_on: 'R1 Delay =', r2_delay_on: 'R2 Delay =',
      r1_actual_unplanned_on: 'R1 Unplanned =', r2_actual_unplanned_on: 'R2 Unplanned =',
      stage: 'Stage', cell_status: 'Cell Status',
    };
    for (const [k, lbl] of Object.entries(map)) {
      if (isScheduleCell && (k === 'stage' || k === 'cell_status')) continue;
      const v = searchParams.get(k);
      if (v) out.push({ label: `${lbl} ${formatValue(v)}`, param: k });
    }
    const df = searchParams.get('date_from');
    const dt = searchParams.get('date_to');
    const fld = searchParams.get('date_field');
    if (df || dt) {
      const fldLbl = fld === 'actual' ? 'Actual' : 'Plan';
      const range = df === dt || !dt ? df : `${df} → ${dt}`;
      const stage = searchParams.get('stage');
      const stageLbl = stage === 'pred' ? 'Pred' : stage === 't1' ? 'T1' : stage === 't2' ? 'T2' : 'All stages';
      const statusLbl = searchParams.get('cell_status') === 'Done' ? ' · Done' : '';
      out.push({
        label: isScheduleCell ? `${fldLbl} · ${stageLbl} · ${range}${statusLbl}` : `${fldLbl} ${range}`,
        param: 'date_from',
        clears: isScheduleCell
          ? ['date_from', 'date_to', 'date_field', 'stage', 'cell_status', 'source']
          : ['date_from', 'date_to', 'date_field'],
      });
    }
    return out;
  }, [searchParams]);

  const filterSourceLabel = useMemo(() => {
    const source = searchParams.get('source');
    if (source?.startsWith('schedule')) return 'Filtered from Progress:';
    if (source === 'dashboard' || activeUrlFilters.length > 0) return 'Filtered from Dashboard:';
    return 'Active URL filters:';
  }, [searchParams, activeUrlFilters.length]);

  const clearUrlFilter = (param: string, clears?: string[]) => {
    const next = new URLSearchParams(searchParams);
    const toDelete = clears && clears.length ? clears : [param];
    for (const p of toDelete) next.delete(p);
    if (toDelete.includes('status')) { next.delete('at_risk_days'); next.delete('scope'); }
    setSearchParams(next, { replace: true });
  };
  const clearAllUrlFilters = () => setSearchParams(new URLSearchParams(), { replace: true });

  // Count active column filters for display
  const activeColumnFilterCount = columnFilters.length;
  const columnFilterChips = useMemo(() => buildColumnFilterChips(table, columnFilters), [table, columnFilters]);
  const removeColumnFilter = (id: string) => setColumnFilters((prev) => prev.filter((f) => f.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Subtest Master Database</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/import')}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const visibleRows = table.getSortedRowModel().rows.length;
              if (visibleRows === 0) {
                toast({ title: 'No rows to export', description: 'Adjust filters and try again.', variant: 'destructive' });
                return;
              }
              setExportMode('single');
              setExportDialogOpen(true);
            }}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/export')}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {activeUrlFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-primary">{filterSourceLabel}</span>
          {activeUrlFilters.map(f => (
            <button
              key={f.param}
              onClick={() => clearUrlFilter(f.param, f.clears)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20"
              title="Click to remove"
            >
              {f.label} ✕
            </button>
          ))}
          <Button variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={clearAllUrlFilters}>
            Clear all
          </Button>
        </div>
      )}

      {columnFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Active column filters:</span>
          {columnFilterChips.map((chip) => (
            <button
              key={chip.id}
              onClick={() => removeColumnFilter(chip.id)}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-secondary/80"
              title="Click to remove"
            >
              {chip.label} ✕
            </button>
          ))}
          <Button variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={() => setColumnFilters([])}>
            Clear all
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subtests..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <span className="text-sm text-muted-foreground self-center">
          {table.getFilteredRowModel().rows.length} records
        </span>
        <span className="text-xs text-muted-foreground self-center hidden md:inline">
          Tip: Shift+Click headers for multi-sort · Click <Filter className="inline h-3 w-3" /> to filter columns
        </span>
        {sorting.length > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setSorting([])}>
            Clear sort ({sorting.length})
          </Button>
        )}
        <div className="ml-auto"><StageProgressLegend /></div>
      </div>

      <BulkEditBar
        selectedRows={selectedRows}
        fields={bulkFields}
        table="subtests"
        entity="subtest"
        exportColumns={[
          { id: 'subtest_id', label: 'Subtest ID' },
          { id: 'item_no', label: 'Item No' },
          { id: 'mos_code', label: 'MOS Code' },
          { id: 'system_code', label: 'System' },
          { id: 'description', label: 'Description' },
          { id: 'level', label: 'Level' },
          { id: 'equipment', label: 'Equipment' },
          { id: 'subcontractor_name', label: 'Subcontractor' },
          { id: 'subsub_name', label: 'Sub-Sub' },
          { id: 'hdec_pic_name', label: 'HDEC PIC' },
          { id: 'team', label: 'Team' },
          { id: 'pred_status', label: 'Pred Status' },
          { id: 't1_status', label: 'T1 Status' },
          { id: 't2_status', label: 'T2 Status' },
          { id: 'pred_planned_date', label: 'Pred Planned' },
          { id: 'pred_actual_date', label: 'Pred Actual' },
          { id: 't1_planned_date', label: 'T1 Planned' },
          { id: 't1_actual_date', label: 'T1 Actual' },
          { id: 't2_planned_date', label: 'T2 Planned' },
          { id: 't2_actual_date', label: 'T2 Actual' },
          { id: 'remarks', label: 'Remarks' },
        ]}
        reassignFields={[
          { field: 'subcontractor_name', label: 'Subcontractor', options: subcontractorOptions },
          { field: 'subsub_name', label: 'Sub-Sub', options: subsubOptions },
          { field: 'hdec_pic_name', label: 'HDEC PIC', options: hdecPicOptions },
          { field: 'team', label: 'Team', options: teamOptions },
        ]}
        onApplied={handleBulkApplied}
        onMutated={() => fetchData()}
        onClearSelection={() => setRowSelection({})}
      />

      <SubtestTableView
        table={table}
        loading={loading}
        columns={columns}
        sorting={sorting}
        autoSizeColumn={autoSizeColumn}
        navigate={navigate}
        tableRef={tableRef}
        delayAsOfDate={delayAsOfDate}
        overdueScope={urlScope === 'all' ? 'all' : 'execution'}
      />

      <Dialog
        open={exportDialogOpen}
        onOpenChange={(open) => {
          if (!open && exportBusy) return;
          setExportDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Subtests</DialogTitle>
            <DialogDescription>Choose how you want to export the currently filtered rows.</DialogDescription>
          </DialogHeader>
          {(() => {
            const sortedRows = table.getSortedRowModel().rows;
            const subconSet = new Set<string>();
            for (const r of sortedRows) {
              const raw = (r.original as any)?.subcontractor_name;
              const key = raw && String(raw).trim() ? String(raw).trim() : 'Unassigned';
              subconSet.add(key);
            }
            const willZip = subconSet.size >= ZIP_THRESHOLD;
            return (
              <div className="space-y-4 py-2">
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Output</div>
                  <RadioGroup
                    value={exportMode}
                    onValueChange={(v) => setExportMode(v as 'single' | 'per-subcon')}
                    className="gap-2"
                  >
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="single" id="export-single" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="export-single" className="cursor-pointer text-sm font-medium">Single file</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Exports the current view as one .xlsx file ({sortedRows.length} rows).</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="per-subcon" id="export-per-subcon" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="export-per-subcon" className="cursor-pointer text-sm font-medium">
                          One file per Subcontractor
                        </Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {willZip ? (
                            <span className="text-amber-600 dark:text-amber-400">
                              {subconSet.size} Subcontractors detected — files will be packaged into a single .zip to avoid browser download limits. Empty Subcontractor rows go to "Unassigned".
                            </span>
                          ) : (
                            <>Triggers {subconSet.size} download{subconSet.size === 1 ? '' : 's'} (one .xlsx per Subcontractor). Empty Subcontractor rows go to "Unassigned".</>
                          )}
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(false)} disabled={exportBusy}>Cancel</Button>
            <Button
              size="sm"
              disabled={exportBusy}
              onClick={async () => {
                const meta = {
                  userName: profile?.name || profile?.login_id || 'Unknown',
                  userType: profile?.user_type ? USER_TYPE_LABELS[profile.user_type] : '',
                };
                try {
                  if (exportMode === 'single') {
                    const result = exportSubtestsToExcel({ table, fieldConfig: fieldConfigRows, globalFilter, searchParams, meta });
                    toast({ title: 'Export complete', description: `${result.rowCount} rows → ${result.fileName}` });
                    setExportDialogOpen(false);
                  } else {
                    const sortedRows = table.getSortedRowModel().rows;
                    const subconSet = new Set<string>();
                    for (const r of sortedRows) {
                      const raw = (r.original as any)?.subcontractor_name;
                      const key = raw && String(raw).trim() ? String(raw).trim() : 'Unassigned';
                      subconSet.add(key);
                    }
                    if (subconSet.size >= ZIP_THRESHOLD) {
                      toast({
                        title: 'Packaging into ZIP',
                        description: `${subconSet.size} Subcontractors detected — bundling into a single .zip to avoid browser download limits.`,
                      });
                      setExportBusy(true);
                      const result = await exportSubtestsToZipBySubcontractor({ table, fieldConfig: fieldConfigRows, globalFilter, searchParams, meta });
                      toast({
                        title: 'Export complete',
                        description: `${result.fileCount} file${result.fileCount === 1 ? '' : 's'} bundled in ${result.zipFileName} (${result.rowCount} rows total)`,
                      });
                      setExportBusy(false);
                      setExportDialogOpen(false);
                    } else {
                      const result = exportSubtestsToExcelBySubcontractor({ table, fieldConfig: fieldConfigRows, globalFilter, searchParams, meta });
                      toast({ title: 'Export complete', description: `${result.fileCount} file${result.fileCount === 1 ? '' : 's'} downloaded (${result.rowCount} rows total)` });
                      setExportDialogOpen(false);
                    }
                  }
                } catch (err) {
                  console.error('Excel export failed', err);
                  toast({ title: 'Export failed', description: String((err as Error)?.message ?? err), variant: 'destructive' });
                  setExportBusy(false);
                }
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> {exportBusy ? 'Exporting…' : 'Export'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Virtualized table view ----------

interface SubtestTableViewProps {
  table: ReturnType<typeof useReactTable<SubtestRow>>;
  loading: boolean;
  columns: ColumnDef<SubtestRow>[];
  sorting: SortingState;
  autoSizeColumn: (id: string) => void;
  navigate: (path: string) => void;
  tableRef: React.RefObject<HTMLDivElement>;
  delayAsOfDate: string;
  overdueScope: 'execution' | 'all';
}

function SubtestTableView({
  table, loading, columns, sorting, autoSizeColumn, navigate, tableRef, delayAsOfDate, overdueScope,
}: SubtestTableViewProps) {
  const isMobile = useIsMobile();
  // +1 for the always-on selection column at the start
  const frozenCount = (isMobile ? 1 : 4) + 1;

  const leafCols = table.getVisibleLeafColumns();

  // Cumulative left offset for each frozen column (used by `position: sticky`).
  const stickyLefts = useMemo(() => {
    const lefts: number[] = [];
    let acc = 0;
    for (let i = 0; i < frozenCount && i < leafCols.length; i++) {
      lefts.push(acc);
      acc += leafCols[i].getSize();
    }
    return lefts;
  }, [leafCols, frozenCount, table.getState().columnSizing]);

  const frozenWidth = useMemo(
    () => leafCols.slice(0, frozenCount).reduce((s, c) => s + c.getSize(), 0),
    [leafCols, frozenCount, table.getState().columnSizing],
  );
  const totalWidth = useMemo(
    () => leafCols.reduce((s, c) => s + c.getSize(), 0),
    [leafCols, table.getState().columnSizing],
  );

  const rows = table.getRowModel().rows;
  const ROW_HEIGHT = 36;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const headerGroups = table.getHeaderGroups();
  const lastHeaderGroup = headerGroups[headerGroups.length - 1];
  const allHeaders = lastHeaderGroup ? lastHeaderGroup.headers : [];

  const renderRowBgClass = (r: SubtestRow) => {
    // Match active Overdue scope (Pred/T1/T2 default, or all 5 stages when scope=all).
    const stages: StageKey[] = overdueScope === 'all'
      ? ['pred', 't1', 't2', 'r1', 'r2s', 'r2a']
      : ['pred', 't1', 't2'];
    const delayed = getAnyStageDelayedAsOf(r, stages, delayAsOfDate);
    const t2Done = isStageDone(r, 't2');
    return { delayed, t2Done };
  };

  const renderHeader = (header: any, index: number) => {
    const isSticky = index < frozenCount;
    const isLastSticky = index === frozenCount - 1;
    const canFilter = header.column.getCanFilter();
    const headerDef = header.column.columnDef.header;
    const headerText = typeof headerDef === 'string' ? headerDef : header.column.id;
    return (
      <TableHead
        key={header.id}
        data-column-id={header.column.id}
        title={headerText}
        style={{
          width: header.getSize(),
          minWidth: header.getSize(),
          maxWidth: header.getSize(),
          ...(isSticky
            ? {
                position: 'sticky',
                left: stickyLefts[index],
                zIndex: 3,
                background: 'hsl(var(--background))',
              }
            : {}),
        }}
        className={cn(
          'relative h-9 cursor-pointer select-none whitespace-nowrap border-b bg-background px-4 py-0 text-left text-xs font-medium',
          isLastSticky && 'shadow-[2px_0_4px_-2px_hsl(var(--border))]',
        )}
        onClick={header.column.getToggleSortingHandler()}
      >
        <div className="flex w-full items-center justify-between gap-1">
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
            {header.column.getIsSorted() && (
              <span className="flex-shrink-0">
                {header.column.getIsSorted() === 'asc' ? '▲' : '▼'}
                {sorting.length > 1 && (
                  <sup className="ml-0.5 text-[9px] text-muted-foreground">{header.column.getSortIndex() + 1}</sup>
                )}
              </span>
            )}
          </span>
          {canFilter && (
            <span className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <ColumnFilterDropdown column={header.column} />
            </span>
          )}
        </div>
        {header.column.getCanResize() && (
          <div
            onMouseDown={header.getResizeHandler()}
            onTouchStart={header.getResizeHandler()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => { e.stopPropagation(); autoSizeColumn(header.column.id); }}
            title="Drag to resize, double-click to auto-fit"
            className={cn(
              'absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none bg-transparent hover:bg-primary/40',
              header.column.getIsResizing() && 'bg-primary/60',
            )}
          />
        )}
      </TableHead>
    );
  };

  // Sticky cells MUST be fully opaque, otherwise scrolled content from the
  // non-frozen columns shows through. Layer the row tint on top of an opaque
  // base background using two stacked CSS background layers.
  const stickyBgFor = (r: SubtestRow, index: number): string => {
    const { delayed, t2Done } = renderRowBgClass(r);
    const base = 'hsl(var(--background))';
    const opaque = `linear-gradient(${base}, ${base})`;
    if (hoveredIndex === index) return `${opaque}, hsl(var(--muted) / 0.5)`;
    if (delayed && !t2Done) return `${opaque}, hsl(var(--destructive) / 0.05)`;
    if (t2Done) return `${opaque}, hsl(var(--muted) / 0.3)`;
    return base;
  };

  return (
    <div className="flex max-h-[calc(100vh-220px)] flex-col overflow-hidden rounded-md border bg-background">
      {/* Mirror horizontal scrollbar above the body. The visible track starts
          AFTER the frozen area so it never appears to overlap sticky columns. */}
      <TopHorizontalScrollbar
        targetRef={tableRef}
        width={totalWidth}
        frozenWidth={frozenWidth}
      />
      {/* Single scroll container: owns BOTH horizontal and vertical scroll.
          Header is rendered inside the same <table>, with sticky top rows so
          it stays visible vertically while sharing the same horizontal scroll
          coordinate space as the body. Frozen columns use position:sticky on
          both header and body cells, guaranteeing alignment. */}
      <div
        ref={tableRef}
        className="min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable]"
      >
        <Table style={{ width: totalWidth, tableLayout: 'fixed' }}>
          <TableHeader className="bg-background">
            <TableRow className="border-b bg-background [&>th]:sticky [&>th]:top-0 [&>th]:z-[2] [&>th]:bg-background">
              {allHeaders.map(renderHeader)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={leafCols.length} className="py-8 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={leafCols.length} className="py-8 text-center text-muted-foreground">No subtests found. Import data to get started.</TableCell>
              </TableRow>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr style={{ height: paddingTop }} aria-hidden>
                    <td colSpan={leafCols.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  const r = row.original;
                  const { delayed, t2Done } = renderRowBgClass(r);
                  const stickyBg = stickyBgFor(r, virtualRow.index);
                  return (
                    <TableRow
                      key={row.id}
                      data-index={virtualRow.index}
                      style={{ height: ROW_HEIGHT, maxHeight: ROW_HEIGHT }}
                      className={cn(
                        'cursor-pointer',
                        t2Done && 'bg-muted/30 text-muted-foreground',
                        delayed && !t2Done && 'bg-destructive/5',
                        hoveredIndex === virtualRow.index && 'bg-muted/50',
                      )}
                      onMouseEnter={() => setHoveredIndex(virtualRow.index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={() => navigate(`/subtests/${r.id}${location.search}`)}
                    >
                      {row.getVisibleCells().map((cell, cellIdx) => {
                        const isSticky = cellIdx < frozenCount;
                        const isLastSticky = cellIdx === frozenCount - 1;
                        return (
                          <TableCell
                            key={cell.id}
                            data-column-id={cell.column.id}
                            style={{
                              width: cell.column.getSize(),
                              minWidth: cell.column.getSize(),
                              maxWidth: cell.column.getSize(),
                              height: ROW_HEIGHT,
                              maxHeight: ROW_HEIGHT,
                              overflow: 'hidden',
                              ...(isSticky
                                ? {
                                    position: 'sticky',
                                    left: stickyLefts[cellIdx],
                                    zIndex: 1,
                                    background: stickyBg,
                                  }
                                : {}),
                            }}
                            className={cn(
                              'truncate whitespace-nowrap px-4 py-2 text-xs',
                              isLastSticky && 'shadow-[2px_0_4px_-2px_hsl(var(--border))]',
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr style={{ height: paddingBottom }} aria-hidden>
                    <td colSpan={leafCols.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
