import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TopHorizontalScrollbar } from '@/components/raw-data/TopHorizontalScrollbar';
import { useFrozenColumnCount } from '@/hooks/useAppSettings';
import { useIsMobile } from '@/hooks/use-mobile';
import { AlertCircle, ChevronDown, ChevronRight, Download, Filter, Search, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { usePunchFieldConfig } from '@/hooks/usePunchFieldConfig';
import {
  exportPunchRawToExcel,
  exportPunchRawToExcelBySubcontractor,
  exportPunchRawToZipBySubcontractor,
} from '@/lib/punch-excel-export';
import { USER_TYPE_LABELS } from '@/types/enums';
import { formatDdMmm } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

// Natural compare for punch item_no like "3", "3.1", "10", "10.2"
function comparePunchItemNo(a: string | null | undefined, b: string | null | undefined): number {
  const sa = String(a ?? ''); const sb = String(b ?? '');
  const pa = sa.split('.').map((p) => { const n = Number(p); return Number.isFinite(n) ? n : p; });
  const pb = sb.split('.').map((p) => { const n = Number(p); return Number.isFinite(n) ? n : p; });
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i]; const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y;
    } else {
      const cmp = String(x).localeCompare(String(y));
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}
import {
  PUNCH_FIELDS,
  PUNCH_FIELDS_BY_NAME,
  PUNCH_GATE_LABEL,
  PUNCH_GATE_STATUS,
  PUNCH_HEALTH_LABEL,
  PUNCH_HEALTH_STATUS,
  PUNCH_PROCUREMENT_LABEL,
  PUNCH_PROCUREMENT_STATUS,
  PUNCH_OVERRIDABLE_SET,
  SUBTASK_STAGE_SHORT,
  SUBTASK_STAGE_LABEL,
  type PunchFieldDef,
  type PunchGateStatus,
  type PunchHealthStatus,
  type PunchProcurementStatus,
  type SubtaskStage,
} from '@/lib/punch-field-registry';
import {
  computePunchProgressState,
  getPunchProgressTooltipLines,
  PUNCH_PROGRESS_ICON,
  PUNCH_PROGRESS_LABEL,
  PUNCH_PROGRESS_COLOR,
  PUNCH_PROGRESS_STATES,
  type PunchProgressState,
} from '@/lib/punch-progress-icon';
import { PunchProgressLegend } from '@/components/punch/PunchProgressLegend';
import type { AppRole } from '@/types/enums';
import {
  ColumnFilterDropdown,
  EMPTY_TOKEN,
  dateRangeFilterFn,
  matchesAllTokens,
  multiSelectFilterFn,
  textFilterFn,
  tokenizeAnd,
} from '@/components/raw-data/ColumnFilterDropdowns';
import { BulkEditBar } from '@/components/raw-data/BulkEditBar';
import { buildColumnFilterChips } from '@/lib/filter-chip-utils';
import { inferFilterType } from '@/lib/field-filter-type';
import type { BulkEditableField } from '@/lib/bulk-edit';

type PunchItem = Database['public']['Tables']['punch_items']['Row'];

const PAGE_SIZE = 1000;
const ZIP_THRESHOLD = 7;
const DEFAULT_SORTING: SortingState = [{ id: 'summary_no', desc: false }];

const DATE_FIELDS = new Set(
  PUNCH_FIELDS.filter((f) => f.dataType === 'date').map((f) => f.field),
);
const PCT_FIELDS = new Set(
  PUNCH_FIELDS.filter((f) => f.dataType === 'pct' || f.dataType === 'number').map((f) => f.field),
);
const ENUM_FIELDS = new Set(
  PUNCH_FIELDS.filter((f) => f.dataType === 'enum').map((f) => f.field),
);

/** Fields backed by enum/select-like values — best served by multi-select filter. */
const MULTI_SELECT_FIELDS = new Set<string>([
  // enum dataType (derived from registry)
  ...PUNCH_FIELDS.filter((f) => f.dataType === 'enum' || f.dataType === 'bool').map((f) => f.field),
  // select-like text fields
  'team', 'work_type', 'main_trade', 'sub_trade', 'category1', 'category2', 'category3',
  'critical_level', 'level', 'subcontractor_name', 'subsub_name', 'hdec_pic_name', 'hdec_eng_name',
  'completion_status',
  // virtual columns
  'row_type',
]);

/** Free-text searchable fields — derived from registry text dataType minus pure-id/numeric ones. */
const TEXT_SEARCH_FIELDS: (keyof PunchItem)[] = PUNCH_FIELDS
  .filter((f) => f.dataType === 'text')
  .map((f) => f.field as keyof PunchItem);

/** Pinned columns (always visible, fixed at left). */
const PINNED_COLUMN_IDS = ['__select', 'summary_no', 'subtask_no'];

/** Group label for display in Bulk-edit dialog. */
const GROUP_LABELS: Record<string, string> = {
  identity: 'Identity',
  classification: 'Classification',
  people: 'People',
  schedule: 'Schedule',
  progress: 'Progress',
  pre_engineering: 'Pre-Engineering',
  meta: 'Notes',
};

/** Source-origin badge class. */
const ORIGIN_BADGE: Record<string, string> = {
  system: 'bg-muted text-muted-foreground border-border',
  derived: 'bg-primary/10 text-primary border-primary/30',
  custom: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200',
};

const HEALTH_BADGE_CLASS: Record<PunchHealthStatus, string> = {
  ahead: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200',
  on_track: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200',
  behind: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200',
  critical: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200',
};

const GATE_DOT: Record<PunchGateStatus, string> = {
  not_required: 'bg-muted-foreground/30',
  pending: 'bg-amber-500',
  approved: 'bg-emerald-500',
};

const PROC_DOT: Record<PunchProcurementStatus, string> = {
  not_required: 'bg-muted-foreground/30',
  pending: 'bg-amber-500',
  partially_secured: 'bg-blue-500',
  secured: 'bg-emerald-500',
};

function GateDot({ status, label, kind }: { status: string | null; label: string; kind: 'gate' | 'proc' }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const dot = kind === 'gate'
    ? GATE_DOT[status as PunchGateStatus] ?? 'bg-muted'
    : PROC_DOT[status as PunchProcurementStatus] ?? 'bg-muted';
  const text = kind === 'gate'
    ? PUNCH_GATE_LABEL[status as PunchGateStatus] ?? status
    : PUNCH_PROCUREMENT_LABEL[status as PunchProcurementStatus] ?? status.replace(/_/g, ' ');
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn('inline-block h-2.5 w-2.5 rounded-full', dot)} />
            <span className="text-xs capitalize">{text}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="font-medium">{label}</div>
          <div className="text-muted-foreground capitalize">{text}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function HealthBadge({ status }: { status: PunchHealthStatus | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn('px-2 py-0.5 text-[10px] font-medium', HEALTH_BADGE_CLASS[status])}>
      {PUNCH_HEALTH_LABEL[status]}
    </Badge>
  );
}

function PctCell({ value, variance = false }: { value: number | null; variance?: boolean }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  if (variance) {
    const cls = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-muted-foreground';
    const sign = value > 0 ? '+' : '';
    return <span className={cn('tabular-nums font-medium', cls)}>{sign}{value.toFixed(1)}%</span>;
  }
  return <span className="tabular-nums">{value.toFixed(1)}%</span>;
}

function ReadyCell({ row }: { row: PunchItem }) {
  if (row.pre_engineering_ready) {
    return <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] dark:bg-emerald-950 dark:text-emerald-200">Ready</Badge>;
  }
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px] dark:bg-amber-950 dark:text-amber-200 gap-1">
            <AlertCircle className="h-3 w-3" />
            Blocked
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="left">
          {(row.pre_engineering_blockers || []).length > 0
            ? row.pre_engineering_blockers.join(', ')
            : 'Pre-engineering not complete'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Compute cell value for a given (row, field). Falls back to raw_payload / custom_payload. */
function getFieldValue(row: PunchItem, field: string, originalHeader: string | null): any {
  const direct = (row as any)[field];
  if (direct != null && direct !== '') return direct;
  const rawP = (row as any).raw_payload;
  if (rawP && typeof rawP === 'object') {
    if (originalHeader && rawP[originalHeader] != null) return rawP[originalHeader];
    if (rawP[field] != null) return rawP[field];
  }
  const customP = (row as any).custom_payload;
  if (customP && typeof customP === 'object') {
    if (originalHeader && customP[originalHeader] != null) return customP[originalHeader];
    if (customP[field] != null) return customP[field];
  }
  return null;
}

interface CellExtras {
  isCollapsed?: boolean;
  onToggle?: () => void;
}

function renderCell(row: PunchItem, field: string, def: PunchFieldDef | null, value: any, extras?: CellExtras) {
  // Summary No — primary identifier column with hierarchy toggle/indent
  if (field === 'summary_no' || field === 'item_no') {
    const r = row as any;
    const isSummary = !!r.is_summary;
    const isChild = !!r.parent_id;
    const stage = r.subtask_stage as SubtaskStage | null;
    const overrideCount = r.override_fields ? Object.keys(r.override_fields).length : 0;
    const collapsed = !!extras?.isCollapsed;
    return (
      <span className={cn('inline-flex items-center gap-1.5 min-w-0', isChild && 'pl-4')}>
        {isSummary ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); extras?.onToggle?.(); }}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-primary hover:bg-muted"
            aria-label={collapsed ? 'Expand subtasks' : 'Collapse subtasks'}
            title={collapsed ? 'Expand subtasks' : 'Collapse subtasks'}
          >
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        ) : isChild ? (
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : null}
        <span className={cn('truncate', isSummary && 'font-semibold')}>{value == null || value === '' ? '—' : String(value)}</span>
        {isChild && stage && field === 'summary_no' && (
          <span className="ml-0.5 rounded border px-1 py-0 text-[8px] font-semibold text-muted-foreground">
            {SUBTASK_STAGE_SHORT[stage]}
          </span>
        )}
        {isSummary && overrideCount > 0 && field === 'summary_no' && (
          <span
            className="ml-0.5 rounded border border-amber-400 bg-amber-50 px-1 py-0 text-[8px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"
            title={`${overrideCount} field${overrideCount === 1 ? '' : 's'} manually overridden`}
          >
            M{overrideCount}
          </span>
        )}
      </span>
    );
  }
  // Subtask No — show "S" badge on summary rows, value on subtask rows
  if (field === 'subtask_no') {
    const r = row as any;
    if (r.is_summary) {
      return (
        <span className="inline-flex items-center rounded border border-primary/40 bg-primary/10 px-1.5 py-0 text-[10px] font-semibold text-primary">
          S
        </span>
      );
    }
    return <span className="text-xs">{value == null || value === '' ? '—' : String(value)}</span>;
  }

  switch (field) {
    case 'subtask_stage':
      return value ? (
        <span className="text-xs">{SUBTASK_STAGE_LABEL[value as SubtaskStage] ?? String(value)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    case 'progress_icon': {
      const state = computePunchProgressState(row as any);
      const Icon = PUNCH_PROGRESS_ICON[state];
      return (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-center">
                <Icon className={cn('h-4 w-4', PUNCH_PROGRESS_COLOR[state])} aria-label={PUNCH_PROGRESS_LABEL[state]} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">{PUNCH_PROGRESS_LABEL[state]}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    case 'health_status':
      return <HealthBadge status={(value as PunchHealthStatus) ?? null} />;
    case 'pre_engineering_ready':
      return <ReadyCell row={row} />;
    case 'material_approval_status':
    case 'drawing_approval_status':
    case 'mos_approval_status':
      return <GateDot status={value} label={def?.exportLabel ?? field} kind="gate" />;
    case 'material_procurement_status':
      return <GateDot status={value} label={def?.exportLabel ?? field} kind="proc" />;
    case 'progress_variance_pct':
      return <PctCell value={value == null ? null : Number(value)} variance />;
    case 'planned_progress_pct':
    case 'actual_progress_pct':
      return <PctCell value={value == null ? null : Number(value)} />;
    case 'pre_engineering_blockers': {
      const arr = Array.isArray(value) ? value : [];
      return arr.length > 0 ? <span className="text-xs">{arr.join(', ')}</span> : <span className="text-muted-foreground">—</span>;
    }
  }
  // Highlight overridden cells on summary rows
  const r = row as any;
  if (r.is_summary && PUNCH_OVERRIDABLE_SET.has(field) && r.override_fields && r.override_fields[field]) {
    const inner = renderPlainCell(value, def);
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-1 -mx-1 bg-amber-50/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
        title="Manual override"
      >
        {inner}
        <span className="text-[8px] font-bold text-amber-700 dark:text-amber-300">M</span>
      </span>
    );
  }
  return renderPlainCell(value, def);
}

function renderPlainCell(value: any, def: PunchFieldDef | null) {
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
  if (def?.dataType === 'date') {
    return <span className="text-xs">{formatDdMmm(String(value).slice(0, 10))}</span>;
  }
  if (def?.dataType === 'number') {
    return <span className="tabular-nums text-xs">{value}</span>;
  }
  if (def?.dataType === 'pct') {
    return <PctCell value={Number(value)} />;
  }
  if (Array.isArray(value)) {
    return <span className="text-xs">{value.join(', ')}</span>;
  }
  return <span className="text-xs block truncate" title={String(value)}>{String(value)}</span>;
}

const SIZE_BY_FIELD: Record<string, number> = {
  summary_no: 110,
  subtask_no: 90,
  item_no: 110,

  outstanding_work: 280,
  location: 130,
  level: 80,
  team: 80,
  work_type: 110,
  main_trade: 110,
  sub_trade: 110,
  category1: 110,
  category2: 110,
  category3: 110,
  critical_level: 100,
  subcontractor_name: 160,
  subsub_name: 140,
  hdec_pic_name: 110,
  hdec_eng_name: 110,
  planned_completion_date: 110,
  actual_completion_date: 110,
  planned_start_date: 110,
  actual_start_date: 110,
  data_date: 110,
  planned_progress_pct: 90,
  actual_progress_pct: 90,
  progress_variance_pct: 90,
  health_status: 100,
  completion_status: 120,
  pre_engineering_ready: 100,
  material_approval_status: 150,
  material_procurement_status: 170,
  drawing_approval_status: 150,
  mos_approval_status: 140,
  weight: 70,
  remarks: 200,
  row_type: 110,
};

function uniqueOptions(rows: PunchItem[], field: string) {
  return [...new Set(rows.map((r) => (r as any)[field]).filter((v): v is string => Boolean(v)))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

const globalPunchFilterFn = (row: any, _columnId: string, filterValue: string) => {
  if (tokenizeAnd(filterValue).length === 0) return true;
  const original = row.original as PunchItem;
  return TEXT_SEARCH_FIELDS.some((f) => matchesAllTokens(String((original as any)[f] ?? ''), filterValue));
};

export default function PunchRawDataPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, roles, profile } = useAuth() as { user?: any; roles?: AppRole[]; profile?: any };
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    fields: configRows, isFieldVisible, getLabel, sortFieldNames,
    getOriginalHeader, getSourceOrigin, loading: configLoading,
  } = usePunchFieldConfig();

  const storageKey = user?.id ? `punch-raw-data-state:${user.id}` : 'punch-raw-data-state:anon';

  const [rows, setRows] = useState<PunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateLoaded, setStateLoaded] = useState(false);

  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [searchInput, setSearchInput] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [collapsedSummaries, setCollapsedSummaries] = useState<Set<string>>(() => new Set());
  const toggleSummary = useCallback((id: string) => {
    setCollapsedSummaries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'single' | 'per-subcon'>('single');
  const [exportFormat, setExportFormat] = useState<'view' | 'reimport'>('view');
  const [exportBusy, setExportBusy] = useState(false);

  const tableRef = useRef<HTMLDivElement>(null);

  const autoSizeColumn = useCallback((columnId: string) => {
    const container = tableRef.current;
    if (!container) return;
    const cells = container.querySelectorAll<HTMLElement>(`[data-column-id="${columnId}"]`);
    let max = 72;
    cells.forEach((cell) => {
      const clone = cell.cloneNode(true) as HTMLElement;
      clone.style.cssText = 'position:absolute; visibility:hidden; width:auto; white-space:nowrap; max-width:none; left:-9999px; top:0;';
      document.body.appendChild(clone);
      max = Math.max(max, clone.getBoundingClientRect().width);
      document.body.removeChild(clone);
    });
    setColumnSizing((prev) => ({ ...prev, [columnId]: Math.min(Math.ceil(max) + 18, 640) }));
  }, []);

  // ── Load punch items ─────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    const all: PunchItem[] = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from('punch_items')
        .select('*')
        .eq('is_active', true)
        .order('item_no', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        toast({ title: 'Failed to load punch items', description: error.message, variant: 'destructive' });
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    setRows(all);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      if (cancelled) setRows([]);
    })();
    return () => { cancelled = true; };
  }, [reload]);

  // ── URL → column filter hydration ────────────────────────────────────────
  const DRILLDOWN_PARAMS = [
    'team', 'subcontractor', 'subsub', 'hdecPic', 'hdecEng', 'level', 'workType',
    'mainTrade', 'subTrade', 'health', 'ready', 'completionStatus', 'itemNo',
    'dateField', 'dateStart', 'dateEnd', 'critical',
    'status', 'criticalLevel', 'category1', 'pre_eng', 'blocker', 'due', 'start_due', 'dq',
  ];

  useEffect(() => {
    setStateLoaded(false);
    const isDrilldown = DRILLDOWN_PARAMS.some((p) => searchParams.has(p));
    let baseFilters: ColumnFiltersState = [];
    let baseSorting: SortingState = DEFAULT_SORTING;
    let baseGlobal = '';
    let baseSizing: ColumnSizingState = {};
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        baseSizing = parsed.columnSizing && typeof parsed.columnSizing === 'object' ? parsed.columnSizing : {};
        if (!isDrilldown) {
          baseSorting = Array.isArray(parsed.sorting) && parsed.sorting.length ? parsed.sorting : DEFAULT_SORTING;
          baseFilters = Array.isArray(parsed.columnFilters) ? parsed.columnFilters : [];
          baseGlobal = typeof parsed.globalFilter === 'string' ? parsed.globalFilter : '';
        }
      }
    } catch {
      // ignore invalid saved state
    }

    const urlMap: Record<string, string> = {
      team: 'team',
      subcontractor: 'subcontractor_name',
      subsub: 'subsub_name',
      hdecPic: 'hdec_pic_name',
      hdecEng: 'hdec_eng_name',
      level: 'level',
      criticalLevel: 'critical_level',
      category1: 'category1',
      workType: 'work_type',
      mainTrade: 'main_trade',
      subTrade: 'sub_trade',
      health: 'health_status',
      ready: 'pre_engineering_ready',
      completionStatus: 'completion_status',
      itemNo: 'item_no',
    };
    const urlOverridden = new Set<string>();
    for (const [param, col] of Object.entries(urlMap)) {
      if (searchParams.has(param)) urlOverridden.add(col);
    }
    const urlDateField = searchParams.get('dateField');
    if ((searchParams.has('dateStart') || searchParams.has('dateEnd')) && urlDateField && DATE_FIELDS.has(urlDateField)) {
      urlOverridden.add(urlDateField);
    }
    const nextFilters = baseFilters.filter((f) => !urlOverridden.has(f.id));
    for (const [param, col] of Object.entries(urlMap)) {
      const value = searchParams.get(param);
      if (!value) continue;
      if (col === 'item_no') {
        nextFilters.push({ id: col, value: value === EMPTY_TOKEN ? { text: '', emptyOnly: true } : { text: value } });
      } else {
        nextFilters.push({ id: col, value: value.split(',').filter(Boolean) });
      }
    }
    const dateStart = searchParams.get('dateStart');
    const dateEnd = searchParams.get('dateEnd');
    if ((dateStart || dateEnd) && urlDateField && DATE_FIELDS.has(urlDateField)) {
      nextFilters.push({ id: urlDateField, value: { from: dateStart || undefined, to: dateEnd || undefined } });
    }

    setColumnFilters(nextFilters);
    setSorting(baseSorting);
    setGlobalFilter(baseGlobal);
    setSearchInput(baseGlobal);
    setColumnSizing(baseSizing);
    setStateLoaded(true);
  }, [storageKey, searchParams]);

  // Debounced global search
  useEffect(() => {
    const t = window.setTimeout(() => setGlobalFilter(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Persist state to localStorage
  useEffect(() => {
    if (!stateLoaded) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          sorting: sorting.length ? sorting : DEFAULT_SORTING,
          columnFilters,
          globalFilter,
          columnSizing,
        }));
      } catch {
        // ignore quota
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [stateLoaded, storageKey, sorting, columnFilters, globalFilter, columnSizing]);

  // ── All field ids (registry + Field Config dynamic), regardless of visibility.
  //    Visibility/order is applied via React Table state below, mirroring DefectRawDataPage.
  const allFieldIds = useMemo(() => {
    const known = new Set([...PUNCH_FIELDS.map((f) => f.field), 'row_type', 'progress_icon']);
    const dynamic = configRows
      .filter((r) => r.is_enabled && !known.has(r.field_name))
      .map((r) => r.field_name);
    // 'row_type' & 'progress_icon' are virtual columns (no DB column)
    return ['row_type', 'progress_icon', ...PUNCH_FIELDS.map((f) => f.field), ...dynamic];
  }, [configRows]);

  // ── Option fields for multi-select filters ───────────────────────────────
  const optionFields = useMemo(() => {
    const out: Record<string, { value: string; label: string }[]> = {};
    for (const f of MULTI_SELECT_FIELDS) {
      if (f === 'row_type') {
        out[f] = [
          { value: 'Summary', label: 'Summary' },
          { value: 'Subtask', label: 'Subtask' },
          { value: 'Standalone', label: 'Standalone' },
        ];
      } else if (f === 'health_status') {
        out[f] = PUNCH_HEALTH_STATUS.map((v) => ({ value: v, label: PUNCH_HEALTH_LABEL[v] }));
      } else if (f === 'pre_engineering_ready') {
        out[f] = [
          { value: 'true', label: 'Ready' },
          { value: 'false', label: 'Blocked' },
        ];
      } else if (f === 'material_procurement_status') {
        out[f] = PUNCH_PROCUREMENT_STATUS.map((v) => ({ value: v, label: PUNCH_PROCUREMENT_LABEL[v] }));
      } else if (ENUM_FIELDS.has(f)) {
        out[f] = PUNCH_GATE_STATUS.map((v) => ({ value: v, label: PUNCH_GATE_LABEL[v] }));
      } else {
        out[f] = uniqueOptions(rows, f);
      }
    }
    return out;
  }, [rows]);

  // ── Build columns ────────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<PunchItem>[]>(() => {
    const selectColumn: ColumnDef<PunchItem> = {
      id: '__select',
      size: 36,
      enableSorting: false,
      enableColumnFilter: false,
      enableResizing: false,
      header: ({ table: t }) => (
        <span onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
          <Checkbox
            checked={t.getIsAllRowsSelected() ? true : t.getIsSomeRowsSelected() ? 'indeterminate' : false}
            onCheckedChange={(c) => t.toggleAllRowsSelected(!!c)}
            aria-label="Select all rows in current view"
            className="h-3.5 w-3.5"
          />
        </span>
      ),
      cell: ({ row }) => (
        <span onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(c) => row.toggleSelected(!!c)}
            aria-label="Select row"
            className="h-3.5 w-3.5"
          />
        </span>
      ),
    };

    const dataColumns: ColumnDef<PunchItem>[] = allFieldIds.map((field) => {
      const def = PUNCH_FIELDS_BY_NAME[field] ?? null;
      const orig = getOriginalHeader(field);
      const origin = getSourceOrigin(field);
      const isDate = DATE_FIELDS.has(field);
      const isMulti = MULTI_SELECT_FIELDS.has(field);
      const isPct = PCT_FIELDS.has(field);
      const inferred = def
        ? (isDate ? 'date-range' : isMulti ? 'multi-select' : isPct ? 'text' : 'text')
        : (isMulti ? 'multi-select' : inferFilterType(field, orig));
      const filterFn = inferred === 'date-range' ? dateRangeFilterFn
        : inferred === 'multi-select' ? multiSelectFilterFn
        : textFilterFn;
      const accessorFn = (r: PunchItem) => {
        if (field === 'row_type') {
          const rr = r as any;
          return rr.is_summary ? 'Summary' : rr.parent_id ? 'Subtask' : 'Standalone';
        }
        if (field === 'pre_engineering_ready') return r.pre_engineering_ready ? 'true' : 'false';
        return getFieldValue(r, field, orig);
      };
      let dynamicOptions: { value: string; label: string }[] = optionFields[field] ?? [];
      if (inferred === 'multi-select' && !optionFields[field]) {
        dynamicOptions = [...new Set(rows.map((r) => {
          const v = accessorFn(r);
          return v == null || v === '' ? '' : String(v);
        }).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b))
          .map((v) => ({ value: v, label: v }));
      }
      const label = field === 'row_type' ? 'Row Type' : getLabel(field);
      const headerNode = (
        <span className="inline-flex items-center gap-1">
          <span className="truncate">{label}</span>
          {origin && origin !== 'system' && field !== 'row_type' && (
            <span
              title={orig ? `Source: ${origin} · Original header: ${orig}` : `Source: ${origin}`}
              className={cn(
                'inline-flex items-center rounded border px-1 py-0 text-[9px] font-semibold uppercase leading-tight',
                ORIGIN_BADGE[origin] ?? ORIGIN_BADGE.custom,
              )}
            >
              {origin === 'derived' ? 'D' : origin === 'custom' ? 'C' : origin.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
      );
      const isVirtualNoFilter = field === 'progress_icon';
      return {
        id: field,
        accessorFn,
        header: () => headerNode,
        size: isVirtualNoFilter ? 60 : (SIZE_BY_FIELD[field] ?? 130),
        enableSorting: !isVirtualNoFilter,
        enableColumnFilter: !isVirtualNoFilter,
        filterFn,
        meta: {
          filterType: inferred,
          filterOptions: dynamicOptions,
          headerLabel: label,
          originalHeader: orig,
        },
        cell: ({ row, getValue }) => {
          if (field === 'item_no' || field === 'summary_no') {
            const r = row.original as any;
            const isSummary = !!r.is_summary;
            const id = String(row.original.id);
            return renderCell(row.original, field, def, getValue(), {
              isCollapsed: isSummary && collapsedSummaries.has(id),
              onToggle: isSummary ? () => toggleSummary(id) : undefined,
            });
          }

          if (field === 'row_type') {
            const v = String(getValue() ?? '');
            const cls = v === 'Summary'
              ? 'border-primary/40 bg-primary/10 text-primary'
              : v === 'Subtask'
                ? 'border-muted-foreground/30 bg-muted/40 text-muted-foreground'
                : 'border-border bg-background text-foreground';
            return (
              <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px] font-medium', cls)}>{v || '—'}</Badge>
            );
          }
          return renderCell(row.original, field, def, getValue());
        },
      } as ColumnDef<PunchItem>;
    });

    return [selectColumn, ...dataColumns];
  }, [allFieldIds, getLabel, getOriginalHeader, getSourceOrigin, optionFields, rows, collapsedSummaries, toggleSummary]);

  // URL → derived row filtering (status/due/blocker/pre_eng/start_due)
  const filteredRows = useMemo(() => {
    let next = rows;
    const today = new Date().toISOString().slice(0, 10);
    const horizon = (days: number) => {
      const d = new Date(today + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const status = searchParams.get('status');
    if (status) {
      switch (status) {
        case 'completed': next = next.filter((r) => !!r.actual_completion_date); break;
        case 'wip': next = next.filter((r) => !!r.actual_start_date && !r.actual_completion_date); break;
        case 'not_started': next = next.filter((r) => !r.actual_start_date); break;
        case 'overdue': next = next.filter((r) => !r.actual_completion_date && r.planned_completion_date && r.planned_completion_date < today); break;
        case 'start_delayed': next = next.filter((r) => !r.actual_start_date && r.planned_start_date && r.planned_start_date < today); break;
        case 'planned_started': next = next.filter((r) => !!r.planned_start_date && r.planned_start_date <= today); break;
        case 'actual_started': next = next.filter((r) => !!r.actual_start_date); break;
        case 'in_delay': next = next.filter((r) => {
          const sd = !r.actual_start_date && r.planned_start_date && r.planned_start_date < today;
          const od = !r.actual_completion_date && r.planned_completion_date && r.planned_completion_date < today;
          const bh = r.health_status === 'behind' || r.health_status === 'critical';
          return sd || od || bh;
        }); break;
        case 'critical': next = next.filter((r) => r.health_status === 'critical' || (!r.actual_completion_date && r.planned_completion_date && (Date.parse(today) - Date.parse(r.planned_completion_date)) / 86_400_000 > 14)); break;
        case 'ready_not_started': next = next.filter((r) => !!r.pre_engineering_ready && !r.actual_start_date); break;
      }
    }
    const due = searchParams.get('due');
    if (due) {
      const days = due === 'this_week' ? 7 : due === 'next_14_days' ? 14 : 0;
      if (days) {
        const h = horizon(days);
        next = next.filter((r) => !r.actual_completion_date && r.planned_completion_date && r.planned_completion_date >= today && r.planned_completion_date <= h);
      }
    }
    const startDue = searchParams.get('start_due');
    if (startDue) {
      const days = Number(startDue) || 0;
      if (days > 0) {
        const h = horizon(days);
        next = next.filter((r) => !r.actual_start_date && r.planned_start_date && r.planned_start_date >= today && r.planned_start_date <= h);
      }
    }
    if (searchParams.get('pre_eng') === 'blocked') {
      next = next.filter((r) => !r.pre_engineering_ready);
    }
    const blocker = searchParams.get('blocker');
    if (blocker) {
      const has = (r: PunchItem, kinds: string[]) => kinds.length > 0 && kinds.every((k) => {
        if (k === 'material_approval') return r.material_approval_status === 'pending';
        if (k === 'material_procurement') return r.material_procurement_status === 'pending' || r.material_procurement_status === 'partially_secured';
        if (k === 'drawing_approval') return r.drawing_approval_status === 'pending';
        if (k === 'mos_approval') return r.mos_approval_status === 'pending';
        return false;
      });
      const blockersOf = (r: PunchItem) => [
        r.material_approval_status === 'pending' && 'material_approval',
        (r.material_procurement_status === 'pending' || r.material_procurement_status === 'partially_secured') && 'material_procurement',
        r.drawing_approval_status === 'pending' && 'drawing_approval',
        r.mos_approval_status === 'pending' && 'mos_approval',
      ].filter(Boolean) as string[];
      if (blocker === 'multiple') next = next.filter((r) => blockersOf(r).length > 1);
      else next = next.filter((r) => has(r, [blocker]));
    }
    const dq = searchParams.get('dq');
    if (dq) {
      const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
      switch (dq) {
        case 'missing_planned_start': next = next.filter((r) => !r.planned_start_date); break;
        case 'missing_planned_completion': next = next.filter((r) => !r.planned_completion_date); break;
        case 'missing_hdec_pic': next = next.filter((r) => !String(r.hdec_pic_name ?? '').trim()); break;
        case 'missing_subcontractor': next = next.filter((r) => !String(r.subcontractor_name ?? '').trim()); break;
        case 'missing_team': next = next.filter((r) => !String(r.team ?? '').trim()); break;
        case 'completed_missing_actual_completion':
          next = next.filter((r) => (Number(r.actual_progress_pct) || 0) >= 100 && !r.actual_completion_date); break;
        case 'invalid_progress':
          next = next.filter((r) => {
            const a = num(r.actual_progress_pct), p = num(r.planned_progress_pct);
            return (a != null && (a > 100 || a < 0)) || (p != null && (p > 100 || p < 0));
          }); break;
        case 'invalid_dates':
          next = next.filter((r) => (r.planned_start_date && r.planned_completion_date && r.planned_completion_date < r.planned_start_date)
            || (r.actual_start_date && r.actual_completion_date && r.actual_completion_date < r.actual_start_date)); break;
        case 'missing_weight': next = next.filter((r) => !(Number(r.weight) > 0)); break;
        case 'missing_health': next = next.filter((r) => !r.health_status); break;
      }
    }
    return next;
  }, [rows, searchParams]);

  // ── Hierarchical default ordering ─────────────────────────────────────────
  // When sorting is at default (item_no asc), arrange rows so each parent (Summary
  // or standalone) is followed by its children sorted by planned_start_date.
  const isDefaultSort = sorting.length === 0
    || (sorting.length === 1 && (sorting[0].id === 'summary_no' || sorting[0].id === 'item_no') && !sorting[0].desc);
  const orderedRows = useMemo(() => {
    if (isDefaultSort) {
      const byParent = new Map<string, PunchItem[]>();
      const roots: PunchItem[] = [];
      for (const r of filteredRows) {
        if ((r as any).parent_id) {
          const k = String((r as any).parent_id);
          const arr = byParent.get(k) ?? [];
          arr.push(r);
          byParent.set(k, arr);
        } else {
          roots.push(r);
        }
      }
      roots.sort((a, b) => comparePunchItemNo(a.item_no, b.item_no));
      const childCmp = (a: PunchItem, b: PunchItem) => {
        const da = a.planned_start_date ?? ''; const db = b.planned_start_date ?? '';
        if (!da && !db) return comparePunchItemNo(a.item_no, b.item_no);
        if (!da) return 1; if (!db) return -1;
        const c = da.localeCompare(db);
        return c !== 0 ? c : comparePunchItemNo(a.item_no, b.item_no);
      };
      const out: PunchItem[] = [];
      const rootIds = new Set(roots.map((r) => String(r.id)));
      for (const p of roots) {
        out.push(p);
        const isCollapsed = (p as any).is_summary && collapsedSummaries.has(String(p.id));
        const kids = byParent.get(String(p.id));
        if (kids && kids.length && !isCollapsed) {
          kids.sort(childCmp);
          out.push(...kids);
        }
      }
      for (const [k, arr] of byParent) {
        if (rootIds.has(k)) continue;
        arr.sort(childCmp);
        out.push(...arr);
      }
      return out;
    }
    // User-applied sorting → flat sort, hierarchy ignored
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      for (const s of sorting) {
        const va = (a as any)[s.id];
        const vb = (b as any)[s.id];
        const aEmpty = va === null || va === undefined || va === '';
        const bEmpty = vb === null || vb === undefined || vb === '';
        if (aEmpty && bEmpty) continue;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        let c: number;
        if (s.id === 'item_no' || s.id === 'summary_no' || s.id === 'subtask_no') c = comparePunchItemNo(va, vb);
        else if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
        else c = String(va).localeCompare(String(vb));
        if (c !== 0) return s.desc ? -c : c;
      }
      return 0;
    });
    return arr;
  }, [filteredRows, isDefaultSort, sorting, collapsedSummaries]);


  // ── Column visibility & order (driven by Field Config) ──────────────────
  const columnVisibility = useMemo<VisibilityState>(() => {
    const vis: VisibilityState = { __select: true };
    for (const id of allFieldIds) {
      // summary_no / subtask_no are pinned-always-visible (primary identifiers)
      if (id === 'summary_no' || id === 'subtask_no') { vis[id] = true; continue; }
      // legacy item_no: hide by default (user can re-enable in Field Config)
      if (id === 'item_no') { vis[id] = isFieldVisible(id, roles ?? []); continue; }

      vis[id] = isFieldVisible(id, roles ?? []);
    }
    return vis;
  }, [allFieldIds, isFieldVisible, roles]);

  const columnOrder = useMemo<string[]>(() => {
    const remaining = allFieldIds.filter((id) => !PINNED_COLUMN_IDS.includes(id));
    return [...PINNED_COLUMN_IDS, ...sortFieldNames(remaining)];
  }, [allFieldIds, sortFieldNames]);

  const table = useReactTable({
    data: orderedRows,
    columns,
    state: { sorting, globalFilter, columnFilters, columnSizing, columnVisibility, columnOrder, rowSelection },
    manualSorting: true,

    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    onRowSelectionChange: setRowSelection,
    getRowId: (r) => r.id,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    globalFilterFn: globalPunchFilterFn,
    enableMultiSort: true,
    enableSortingRemoval: true,
    isMultiSortEvent: (e) => (e as unknown as MouseEvent).shiftKey,
    maxMultiSortColCount: 5,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: { minSize: 64, maxSize: 640 },
  });

  // Clear selection when filters/search change
  useEffect(() => { setRowSelection({}); }, [columnFilters, globalFilter, searchParams]);

  const selectedRows = useMemo(
    () => table.getSelectedRowModel().rows
      .map((r) => r.original)
      .filter((r) => !(r as any).is_summary), // Summary rows excluded from bulk operations
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowSelection, rows],
  );

  // ── Bulk-edit field definitions — derived from PUNCH_FIELDS registry +
  //    Field Config (label, visibility, sort_order). Read-only fields and
  //    identity primary keys are excluded.
  const bulkFields = useMemo<BulkEditableField[]>(() => {
    const EXCLUDED = new Set<string>([
      'item_no', 'outstanding_work', // primary identifier / required body
      'data_date', // import-only timestamp
    ]);
    const eligible = PUNCH_FIELDS
      .filter((f) => !f.readOnly && !EXCLUDED.has(f.field))
      .filter((f) => isFieldVisible(f.field, roles ?? []));
    const ordered = sortFieldNames(eligible.map((f) => f.field));
    const byField = new Map(eligible.map((f) => [f.field, f]));
    return ordered.flatMap<BulkEditableField>((field) => {
      const def = byField.get(field);
      if (!def) return [];
      const group = GROUP_LABELS[def.group] ?? def.group;
      const inputType: BulkEditableField['inputType'] =
        def.dataType === 'date' ? 'date'
        : def.dataType === 'number' || def.dataType === 'pct' ? 'text'
        : MULTI_SELECT_FIELDS.has(field) ? 'select'
        : 'text';
      return [{
        field,
        label: getLabel(field),
        inputType,
        group,
        options: inputType === 'select' ? (optionFields[field] ?? []) : undefined,
      }];
    });
  }, [getLabel, sortFieldNames, isFieldVisible, roles, optionFields]);

  const handleBulkApplied = useCallback(({ field, value, ids }: { field: string; value: string | number | null; ids: string[] }) => {
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, [field]: value } as PunchItem : r)));
    setRowSelection({});
  }, []);

  // ── URL filter chips ─────────────────────────────────────────────────────
  const activeUrlFilters = useMemo(() => {
    const labels: Record<string, string> = {
      team: 'Team', subcontractor: 'Subcontractor', subsub: 'Sub-Sub',
      hdecPic: 'HDEC PIC', hdecEng: 'HDEC ENG', level: 'Level',
      workType: 'Work Type', mainTrade: 'Main Trade', subTrade: 'Sub Trade',
      health: 'Health', ready: 'Pre-Eng', completionStatus: 'Completion', itemNo: 'Item No',
    };
    const out: { label: string; param: string; clears?: string[] }[] = [];
    for (const [param, label] of Object.entries(labels)) {
      const v = searchParams.get(param);
      if (!v) continue;
      out.push({ label: `${label} ${v === EMPTY_TOKEN ? '(Blank)' : v}`, param });
    }
    const from = searchParams.get('dateStart');
    const to = searchParams.get('dateEnd');
    if (from || to) {
      const df = searchParams.get('dateField');
      out.push({
        label: `${df ? getLabel(df) : 'Date'} ${from || ''}${from && to ? ' → ' : ''}${to || ''}`,
        param: 'dateStart',
        clears: ['dateStart', 'dateEnd', 'dateField'],
      });
    }
    return out;
  }, [searchParams, getLabel]);

  const clearUrlFilter = (param: string, clears?: string[]) => {
    const next = new URLSearchParams(searchParams);
    for (const k of clears?.length ? clears : [param]) next.delete(k);
    setSearchParams(next, { replace: true });
  };
  const clearAllUrlFilters = () => setSearchParams(new URLSearchParams(), { replace: true });

  const columnFilterChips = useMemo(() => buildColumnFilterChips(table, columnFilters), [table, columnFilters]);
  const removeColumnFilter = (id: string) => setColumnFilters((prev) => prev.filter((f) => f.id !== id));

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: rows.length,
    critical: rows.filter((r) => r.health_status === 'critical').length,
    behind: rows.filter((r) => r.health_status === 'behind').length,
    blocked: rows.filter((r) => !r.pre_engineering_ready).length,
  }), [rows]);

  const tableLoading = loading || configLoading;
  const filteredRowCount = table.getFilteredRowModel().rows.length;


  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Punch (Minor O/S Work) — Raw Data</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stats.total} items · {stats.critical} critical · {stats.behind} behind · {stats.blocked} pre-eng blocked
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/punch/import')}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (filteredRowCount === 0) {
                toast({ title: 'No rows to export', description: 'Adjust filters and try again.', variant: 'destructive' });
                return;
              }
              setExportMode('single');
              setExportFormat('view');
              setExportDialogOpen(true);
            }}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Excel
          </Button>
        </div>
      </div>

      {activeUrlFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-primary">Active URL filters:</span>
          {activeUrlFilters.map((f) => (
            <button key={f.param} onClick={() => clearUrlFilter(f.param, f.clears)} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20">
              {f.label} ✕
            </button>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={clearAllUrlFilters}>Clear all</Button>
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
            >
              {chip.label} ✕
            </button>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => setColumnFilters([])}>
            Clear all
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search punch items... (comma = AND)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <span className="self-center text-sm text-muted-foreground">{filteredRowCount} records</span>
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          disabled={!isDefaultSort}
          title={isDefaultSort ? 'Expand all summary rows' : 'Clear sort to use hierarchy'}
          onClick={() => setCollapsedSummaries(new Set())}
        >
          <ChevronDown className="mr-1 h-3.5 w-3.5" /> Expand all
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          disabled={!isDefaultSort}
          title={isDefaultSort ? 'Collapse all summary rows' : 'Clear sort to use hierarchy'}
          onClick={() => {
            const ids = new Set<string>();
            for (const r of filteredRows) {
              if ((r as any).is_summary) ids.add(String(r.id));
            }
            setCollapsedSummaries(ids);
          }}
        >
          <ChevronRight className="mr-1 h-3.5 w-3.5" /> Collapse all
        </Button>
        {sorting.length > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setSorting(DEFAULT_SORTING)}>
            Clear sort ({sorting.length})
          </Button>
        )}
        <span className="hidden self-center text-xs text-muted-foreground md:inline">
          Tip: Shift+Click headers for multi-sort · Click <Filter className="inline h-3 w-3" /> to filter columns
        </span>
      </div>

      <BulkEditBar
        selectedRows={selectedRows}
        fields={bulkFields}
        table="punch_items"
        entity="punch"
        exportColumns={columnOrder
          .filter((id) => id !== '__select' && id !== 'progress_icon' && columnVisibility[id] !== false)
          .map((id) => ({ id, label: getLabel(id) }))}
        reassignFields={[
          { field: 'subcontractor_name', label: getLabel('subcontractor_name'), options: optionFields.subcontractor_name ?? [] },
          { field: 'subsub_name', label: getLabel('subsub_name'), options: optionFields.subsub_name ?? [] },
          { field: 'hdec_pic_name', label: getLabel('hdec_pic_name'), options: optionFields.hdec_pic_name ?? [] },
          { field: 'team', label: getLabel('team'), options: optionFields.team ?? [] },
        ]}
        onApplied={handleBulkApplied}
        onMutated={() => reload()}
        onClearSelection={() => setRowSelection({})}
      />

      <PunchRawTableView
        table={table}
        loading={tableLoading}
        sorting={sorting.length ? sorting : DEFAULT_SORTING}
        autoSizeColumn={autoSizeColumn}
        navigate={navigate}
        tableRef={tableRef}
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
            <DialogTitle>Export Punch Raw Data</DialogTitle>
            <DialogDescription>Choose how you want to export the currently filtered rows.</DialogDescription>
          </DialogHeader>
          {(() => {
            const sortedRows = table.getSortedRowModel().rows.map((r) => r.original);
            const subconSet = new Set<string>();
            for (const r of sortedRows) {
              const raw = (r as any)?.subcontractor_name;
              const key = raw && String(raw).trim() ? String(raw).trim() : 'Unassigned';
              subconSet.add(key);
            }
            const willZip = subconSet.size >= ZIP_THRESHOLD;
            return (
              <div className="space-y-4 py-2">
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Format</div>
                  <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as 'view' | 'reimport')} className="gap-2">
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="view" id="punch-export-format-view" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="punch-export-format-view" className="cursor-pointer text-sm font-medium">View-friendly</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Human-readable format (formatted dates, percentages, status labels). Best for sharing or reporting.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="reimport" id="punch-export-format-reimport" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="punch-export-format-reimport" className="cursor-pointer text-sm font-medium">Re-import ready</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Includes ID + Item No columns and raw values (YYYY-MM-DD dates, numeric %). Edit values and re-import to update existing rows.</p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Output</div>
                  <RadioGroup value={exportMode} onValueChange={(v) => setExportMode(v as 'single' | 'per-subcon')} className="gap-2">
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="single" id="punch-export-single" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="punch-export-single" className="cursor-pointer text-sm font-medium">Single file</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Exports the current view as one .xlsx file ({sortedRows.length} rows).</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="per-subcon" id="punch-export-per-subcon" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="punch-export-per-subcon" className="cursor-pointer text-sm font-medium">One file per Subcontractor</Label>
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
                const sortedRows = table.getSortedRowModel().rows.map((r) => r.original);
                const meta = {
                  userName: profile?.name || profile?.login_id || 'Unknown',
                  userType: profile?.user_type ? USER_TYPE_LABELS[profile.user_type as keyof typeof USER_TYPE_LABELS] : '',
                };
                const filterSummary = columnFilters.length > 0
                  ? columnFilters.map((f) => f.id).join(', ')
                  : '(none)';
                const sharedOpts = {
                  rows: sortedRows,
                  fieldNames: columnOrder.filter((id) => id !== '__select' && id !== 'progress_icon' && columnVisibility[id] !== false),
                  fieldConfig: configRows,
                  meta,
                  searchSummary: globalFilter.trim() ? `"${globalFilter.trim()}"` : '(none)',
                  filterSummary,
                  sortSummary: sorting.length
                    ? sorting.map((s) => `${getLabel(s.id)} ${s.desc ? '↓' : '↑'}`).join(', ')
                    : 'Item No ↑',
                  format: exportFormat,
                  getOriginalHeader,
                };
                try {
                  if (exportMode === 'single') {
                    const result = exportPunchRawToExcel(sharedOpts);
                    toast({ title: 'Export complete', description: `${result.rowCount} rows → ${result.fileName}` });
                    setExportDialogOpen(false);
                  } else {
                    const subconSet = new Set<string>();
                    for (const r of sortedRows) {
                      const raw = (r as any)?.subcontractor_name;
                      const key = raw && String(raw).trim() ? String(raw).trim() : 'Unassigned';
                      subconSet.add(key);
                    }
                    if (subconSet.size >= ZIP_THRESHOLD) {
                      toast({
                        title: 'Packaging into ZIP',
                        description: `${subconSet.size} Subcontractors detected — bundling into a single .zip to avoid browser download limits.`,
                      });
                      setExportBusy(true);
                      const result = await exportPunchRawToZipBySubcontractor(sharedOpts);
                      toast({
                        title: 'Export complete',
                        description: `${result.fileCount} file${result.fileCount === 1 ? '' : 's'} bundled in ${result.zipFileName} (${result.rowCount} rows total)`,
                      });
                      setExportBusy(false);
                      setExportDialogOpen(false);
                    } else {
                      const result = exportPunchRawToExcelBySubcontractor(sharedOpts);
                      toast({ title: 'Export complete', description: `${result.fileCount} file${result.fileCount === 1 ? '' : 's'} downloaded (${result.rowCount} rows total)` });
                      setExportDialogOpen(false);
                    }
                  }
                } catch (err) {
                  console.error('Punch Excel export failed', err);
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

interface PunchRawTableViewProps {
  table: any;
  loading: boolean;
  sorting: SortingState;
  autoSizeColumn: (id: string) => void;
  navigate: (path: string) => void;
  tableRef: React.RefObject<HTMLDivElement>;
}

function PunchRawTableView({ table, loading, sorting, autoSizeColumn, navigate, tableRef }: PunchRawTableViewProps) {
  const isMobile = useIsMobile();
  const { value: frozenSetting } = useFrozenColumnCount();
  const userFrozenCount = isMobile ? 1 : Math.min(Math.max(Number(frozenSetting) || 1, 1), 4);
  const frozenCount = userFrozenCount + 1;

  const leafColumns = table.getVisibleLeafColumns();
  const stickyLefts = useMemo(() => {
    const lefts: number[] = [];
    let acc = 0;
    for (let i = 0; i < frozenCount && i < leafColumns.length; i++) {
      lefts.push(acc);
      acc += leafColumns[i].getSize();
    }
    return lefts;
  }, [leafColumns, frozenCount, table.getState().columnSizing]);
  const frozenWidth = useMemo(
    () => leafColumns.slice(0, frozenCount).reduce((s: number, c: any) => s + c.getSize(), 0),
    [leafColumns, frozenCount, table.getState().columnSizing],
  );
  const totalWidth = useMemo(
    () => leafColumns.reduce((s: number, c: any) => s + c.getSize(), 0),
    [leafColumns, table.getState().columnSizing],
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

  const headerGroup = table.getHeaderGroups().at(-1);
  const allHeaders = headerGroup?.headers ?? [];

  const renderHeader = (header: any, index: number) => {
    const isSticky = index < frozenCount;
    const isLastSticky = index === frozenCount - 1;
    const headerDef = header.column.columnDef.header;
    const meta = header.column.columnDef.meta as any;
    const headerText = (meta?.headerLabel as string) || (typeof headerDef === 'string' ? headerDef : header.column.id);
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
            ? { position: 'sticky', left: stickyLefts[index], zIndex: 3, background: 'hsl(var(--background))' }
            : {}),
        }}
        className={cn(
          'relative h-9 cursor-pointer select-none whitespace-nowrap border-b px-3 py-0 text-left text-xs font-medium',
          !isSticky && 'bg-background',
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
          {header.column.getCanFilter() && (
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

  const isCompletedRow = (row: PunchItem) => {
    if (row.actual_completion_date) return true;
    const s = String(row.completion_status ?? '').trim().toLowerCase();
    return s === 'done' || s === 'complete' || s === 'completed' || s === 'closed';
  };
  const isRiskRow = (row: PunchItem) => row.health_status === 'critical' || row.health_status === 'behind';

  const renderRowClass = (row: PunchItem, index: number) => {
    const completed = isCompletedRow(row);
    const risk = isRiskRow(row);
    return cn(
      'cursor-pointer',
      completed && 'bg-muted/30 text-muted-foreground',
      risk && !completed && 'bg-destructive/5',
      hoveredIndex === index && 'bg-muted/50',
    );
  };

  const stickyBgFor = (row: PunchItem, index: number): string => {
    const completed = isCompletedRow(row);
    const risk = isRiskRow(row);
    const base = 'hsl(var(--background))';
    const opaque = `linear-gradient(${base}, ${base})`;
    if (hoveredIndex === index) return `${opaque}, hsl(var(--muted) / 0.95)`;
    if (risk && !completed) return `${opaque}, hsl(var(--destructive) / 0.06)`;
    if (completed) return `${opaque}, hsl(var(--muted) / 0.45)`;
    return base;
  };

  return (
    <div className="flex max-h-[calc(100vh-220px)] flex-col overflow-hidden rounded-md border bg-background">
      <TopHorizontalScrollbar targetRef={tableRef} width={totalWidth} frozenWidth={frozenWidth} />
      <div ref={tableRef} className="min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
        <Table style={{ width: totalWidth, tableLayout: 'fixed' }}>
          <TableHeader className="bg-background">
            <TableRow className="border-b bg-background [&>th]:sticky [&>th]:top-0 [&>th]:z-[2] [&>th]:bg-background">
              {allHeaders.map(renderHeader)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={leafColumns.length} className="py-8 text-center text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={leafColumns.length} className="py-8 text-center text-muted-foreground">No punch items match the current filters.</TableCell>
              </TableRow>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr style={{ height: paddingTop }} aria-hidden>
                    <td colSpan={leafColumns.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  const stickyBg = stickyBgFor(row.original, virtualRow.index);
                  return (
                    <TableRow
                      key={row.id}
                      data-index={virtualRow.index}
                      style={{ height: ROW_HEIGHT, maxHeight: ROW_HEIGHT }}
                      className={renderRowClass(row.original, virtualRow.index)}
                      onMouseEnter={() => setHoveredIndex(virtualRow.index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={() => navigate(`/punch/${row.original.id}`)}
                    >
                      {row.getVisibleCells().map((cell: any, cellIdx: number) => {
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
                                ? { position: 'sticky', left: stickyLefts[cellIdx], zIndex: 1, background: stickyBg }
                                : {}),
                            }}
                            className={cn(
                              'truncate whitespace-nowrap py-2 text-xs',
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
                    <td colSpan={leafColumns.length} style={{ padding: 0, border: 0 }} />
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
