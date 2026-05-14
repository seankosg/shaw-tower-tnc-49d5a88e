import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight, Download, ExternalLink, Filter, MessageSquare, Search, Upload } from 'lucide-react';
import { DocsRowDeleteButton } from '@/components/docs/DocsRowDeleteButton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { getOriginHeaderStyle } from '@/lib/origin-header-style';
import { formatDdMmm } from '@/lib/format';
import { useDocsFieldConfig } from '@/hooks/useDocsFieldConfig';
import { useCommonMasters, unionWithLegacy } from '@/hooks/useCommonMasters';
import { useFrozenColumnCount } from '@/hooks/useAppSettings';
import { useIsMobile } from '@/hooks/use-mobile';
import { TopHorizontalScrollbar } from '@/components/raw-data/TopHorizontalScrollbar';
import { NumberRangeDropdown, numberRangeFilterFn } from '@/components/raw-data/NumberRangeDropdown';
import { buildColumnFilterChips } from '@/lib/filter-chip-utils';
import { DocsDashboardFilterBanner } from '@/components/docs/DocsDashboardFilterBanner';
import {
  readDashboardFilterParams,
  computeDashboardFilteredIds,
  hasAnyDashboardFilter,
} from '@/lib/docs-dashboard-filter';
import { WarrantyBulkActionBar, type WarrantyBulkField } from '@/components/raw-data/WarrantyBulkActionBar';
import { exportWarrantyToExcel, type WarrantyExportFormat } from '@/lib/warranty-excel-export';
import {
  WarrantyCycleProgress,
  WarrantyCycleProgressLegend,
} from '@/components/docs/WarrantyCycleProgress';
import {
  WARRANTY_STAGE_KEYS,
  WARRANTY_STAGE_LABELS,
  WARRANTY_STAGE_STATES,
  WARRANTY_STATUS_BADGE,
  classifyWarrantyStageState,
  computeWarrantyOverallStatus,
  type WarrantyStageKey,
  type WarrantyStageState,
  type WarrantyStatusToken,
} from '@/lib/docs-warranty-status';

// ─── Constants ──────────────────────────────────────────────────────────────
const EMPTY_TOKEN = '__EMPTY__';

const MULTI_SELECT_FIELDS = new Set([
  'category', 'team', 'subcontractor_name', 'hdec_pic_name', 'hdec_eng_name',
  'current_stage', 'current_status', 'acra_info_status',
  'draft_status', 'subcon_signing_status', 'hdec_signing_status', 'final_status',
]);
const TEXT_FIELDS = new Set([
  'warranted_item', 'remarks', 'r_works_description', 'r_acra_reg_no',
  'r_acra_address', 'r_brief_description', 'r_director_1', 'r_director_2', 'r_witness',
  'contract_spec_ref',
]);
const DATE_FIELDS = new Set([
  'r_subcontract_date',
  'draft_planned_date', 'draft_actual_date', 'draft_response_planned_date', 'draft_response_actual_date',
  'subcon_signing_planned_date', 'subcon_signing_actual_date',
  'hdec_signing_planned_date', 'hdec_signing_actual_date',
  'final_planned_date', 'final_actual_date',
]);
const NUMBER_FIELDS = new Set(['warranty_period_years', 'item_no']);

const STATUS_FIELDS = new Set([
  'draft_status', 'subcon_signing_status', 'hdec_signing_status', 'final_status',
]);

const RAW_SEARCH_FIELDS = [
  'item_no', 'category', 'warranted_item', 'team',
  'subcontractor_name', 'hdec_pic_name', 'hdec_eng_name', 'remarks',
] as const;

const ALL_DATA_FIELDS = [
  'item_no', 'category', 'warranted_item', 'team',
  'subcontractor_name', 'hdec_pic_name', 'hdec_eng_name', 'warranty_period_years',
  'contract_spec_ref',
  'r_subcontract_date', 'r_works_description', 'r_acra_reg_no', 'r_acra_address',
  'r_brief_description', 'r_director_1', 'r_director_2', 'r_witness', 'acra_info_status',
  'draft_planned_date', 'draft_actual_date', 'draft_response_planned_date',
  'draft_response_actual_date', 'draft_status',
  'subcon_signing_planned_date', 'subcon_signing_actual_date', 'subcon_signing_status',
  'hdec_signing_planned_date', 'hdec_signing_actual_date', 'hdec_signing_status',
  'final_planned_date', 'final_actual_date', 'final_status',
  'current_stage', 'remarks',
] as const;

const DEFAULT_SORTING: SortingState = [
  { id: 'item_no', desc: false },
  { id: 'resubmission_seq', desc: false },
];

interface WarrantyRow {
  id: string;
  item_no: number | null;
  category: string | null;
  warranted_item: string | null;
  team: string | null;
  subcontractor_name: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  warranty_period_years: number | null;
  contract_spec_ref: string | null;
  r_subcontract_date: string | null;
  r_works_description: string | null;
  r_acra_reg_no: string | null;
  r_acra_address: string | null;
  r_brief_description: string | null;
  r_director_1: string | null;
  r_director_2: string | null;
  r_witness: string | null;
  acra_info_status: string | null;
  draft_planned_date: string | null;
  draft_actual_date: string | null;
  draft_response_planned_date: string | null;
  draft_response_actual_date: string | null;
  draft_status: WarrantyStatusToken | null;
  subcon_signing_planned_date: string | null;
  subcon_signing_actual_date: string | null;
  subcon_signing_status: WarrantyStatusToken | null;
  hdec_signing_planned_date: string | null;
  hdec_signing_actual_date: string | null;
  hdec_signing_status: WarrantyStatusToken | null;
  final_planned_date: string | null;
  final_actual_date: string | null;
  final_status: WarrantyStatusToken | null;
  current_stage: string | null;
  current_status: string | null;
  remarks: string | null;
  is_resubmission: boolean;
  resubmission_seq: number;
  parent_id: string | null;
}

// ─── Filter functions ───────────────────────────────────────────────────────
const tokenizeAnd = (text: string): string[] =>
  String(text ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

const matchesAllTokens = (haystack: string, query: string): boolean => {
  const tokens = tokenizeAnd(query);
  if (tokens.length === 0) return true;
  const lower = String(haystack ?? '').toLowerCase();
  return tokens.every((tok) => lower.includes(tok));
};

const multiSelectFilterFn = (row: any, columnId: string, filterValue: string[]) => {
  if (!filterValue || filterValue.length === 0) return true;
  const val = row.getValue(columnId);
  const isEmpty = val == null || val === '';
  if (filterValue.includes(EMPTY_TOKEN) && isEmpty) return true;
  if (isEmpty) return false;
  return filterValue.includes(String(val));
};

const textFilterFn = (row: any, columnId: string, filterValue: any) => {
  if (!filterValue) return true;
  const text = typeof filterValue === 'string' ? filterValue : filterValue?.text;
  const emptyOnly = typeof filterValue === 'object' ? filterValue?.emptyOnly : false;
  const val = row.getValue(columnId);
  if (emptyOnly) return val == null || String(val).trim() === '';
  if (!text) return true;
  if (val == null) return false;
  return matchesAllTokens(String(val), String(text));
};

const dateRangeFilterFn = (row: any, columnId: string, filterValue: any) => {
  if (!filterValue) return true;
  const { from, to, emptyOnly } = filterValue;
  const val = row.getValue(columnId) as string | null;
  if (emptyOnly) return val == null || val === '';
  if (!from && !to) return true;
  if (!val) return false;
  const iso = String(val).slice(0, 10);
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
};

type StageProgressFilter = Partial<Record<WarrantyStageKey, WarrantyStageState[]>>;

const isStageFilterEmpty = (f?: StageProgressFilter | null) => {
  if (!f) return true;
  return WARRANTY_STAGE_KEYS.every((k) => !f[k] || f[k]!.length === 0);
};

const stageProgressFilterFn = (row: any, _columnId: string, filterValue: StageProgressFilter) => {
  if (isStageFilterEmpty(filterValue)) return true;
  const original = row.original as WarrantyRow;
  const today = new Date().toISOString().slice(0, 10);
  for (const key of WARRANTY_STAGE_KEYS) {
    const allowed = filterValue[key];
    if (!allowed || allowed.length === 0) continue;
    const state = classifyWarrantyStageState(original, key, today);
    if (!allowed.includes(state)) return false;
  }
  return true;
};

const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
  if (tokenizeAnd(filterValue).length === 0) return true;
  const original = row.original as WarrantyRow;
  return RAW_SEARCH_FIELDS.some((field) =>
    matchesAllTokens(String((original as any)[field] ?? ''), filterValue),
  );
};

// ─── Header filter dropdowns ────────────────────────────────────────────────
function MultiSelectDropdown({ column }: { column: any }) {
  const selected: string[] = (column.getFilterValue() as string[]) ?? [];
  const isActive = selected.length > 0;
  const facets = column.getFacetedUniqueValues?.() as Map<any, number> | undefined;

  const items = useMemo(() => {
    const counts = new Map<string, number>();
    let emptyCount = 0;
    if (facets) {
      facets.forEach((count, rawVal) => {
        if (rawVal == null || rawVal === '') emptyCount += count;
        else { const k = String(rawVal); counts.set(k, (counts.get(k) ?? 0) + count); }
      });
    }
    selected.forEach((v) => { if (v !== EMPTY_TOKEN && !counts.has(v)) counts.set(v, 0); });
    const list = [...counts.entries()].map(([value, count]) => ({ value, label: value, count }));
    list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return [{ value: EMPTY_TOKEN, label: '(Empty)', count: emptyCount }, ...list];
  }, [facets, selected]);

  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    column.setFilterValue(next.length ? next : undefined);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80',
            isActive ? 'text-primary' : 'text-muted-foreground/50')}
          onClick={(e) => e.stopPropagation()} title="Filter">
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-h-72 w-56 overflow-auto p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2 px-1">
          <button className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => column.setFilterValue(items.map((o) => o.value))}>Select all</button>
          <button className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => column.setFilterValue(undefined)}>Clear</button>
        </div>
        {items.map((o) => (
          <label key={o.value}
            className={cn('flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50',
              o.count === 0 && !selected.includes(o.value) && 'text-muted-foreground/60')}>
            <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">{o.label}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{o.count}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function TextFilterDropdown({ column }: { column: any }) {
  const fv = column.getFilterValue() as { text?: string; emptyOnly?: boolean } | string | undefined;
  const text = typeof fv === 'string' ? fv : fv?.text ?? '';
  const emptyOnly = typeof fv === 'object' ? fv?.emptyOnly ?? false : false;
  const isActive = !!(text || emptyOnly);
  const update = (patch: Partial<{ text: string; emptyOnly: boolean }>) => {
    const cur = typeof fv === 'string' ? { text: fv, emptyOnly: false } : fv ?? { text: '', emptyOnly: false };
    const next = { ...cur, ...patch };
    column.setFilterValue(next.text || next.emptyOnly ? next : undefined);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80',
          isActive ? 'text-primary' : 'text-muted-foreground/50')}
          onClick={(e) => e.stopPropagation()} title="Filter">
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 space-y-2 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <button className="text-[11px] text-muted-foreground hover:underline"
          onClick={() => column.setFilterValue(undefined)}>Clear</button>
        <Input placeholder="Search... (, for AND)" value={text} className="h-7 text-xs"
          onChange={(e) => update({ text: e.target.value || undefined })} />
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={emptyOnly} onCheckedChange={(c) => update({ emptyOnly: !!c })} className="h-3.5 w-3.5" />
          Empty only
        </label>
      </PopoverContent>
    </Popover>
  );
}

function DateRangeDropdown({ column }: { column: any }) {
  const fv = column.getFilterValue() as { from?: string; to?: string; emptyOnly?: boolean } | undefined;
  const isActive = !!(fv?.from || fv?.to || fv?.emptyOnly);
  const update = (patch: Partial<{ from: string; to: string; emptyOnly: boolean }>) => {
    const next = { ...(fv ?? {}), ...patch };
    column.setFilterValue(next.from || next.to || next.emptyOnly ? next : undefined);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80',
          isActive ? 'text-primary' : 'text-muted-foreground/50')}
          onClick={(e) => e.stopPropagation()} title="Filter">
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-2 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <button className="text-[11px] text-muted-foreground hover:underline"
          onClick={() => column.setFilterValue(undefined)}>Clear</button>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">From</div>
            <Input type="date" value={fv?.from ?? ''} className="h-7 text-xs"
              onChange={(e) => update({ from: e.target.value || undefined })} />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground mb-0.5">To</div>
            <Input type="date" value={fv?.to ?? ''} className="h-7 text-xs"
              onChange={(e) => update({ to: e.target.value || undefined })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={!!fv?.emptyOnly} onCheckedChange={(c) => update({ emptyOnly: !!c })} className="h-3.5 w-3.5" />
          Empty only
        </label>
      </PopoverContent>
    </Popover>
  );
}

function StageProgressFilterDropdown({ column }: { column: any }) {
  const fv = (column.getFilterValue() as StageProgressFilter | undefined) ?? {};
  const isActive = !isStageFilterEmpty(fv);
  const update = (key: WarrantyStageKey, states: WarrantyStageState[]) => {
    const next: StageProgressFilter = { ...fv, [key]: states.length ? states : undefined };
    column.setFilterValue(isStageFilterEmpty(next) ? undefined : next);
  };
  const toggle = (key: WarrantyStageKey, st: WarrantyStageState) => {
    const cur = fv[key] ?? [];
    update(key, cur.includes(st) ? cur.filter((s) => s !== st) : [...cur, st]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80',
          isActive ? 'text-primary' : 'text-muted-foreground/50')}
          onClick={(e) => e.stopPropagation()} title="Filter by stage state">
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 space-y-2" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-semibold">Filter by stage</div>
          <button className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => column.setFilterValue(undefined)}>Clear all</button>
        </div>
        {WARRANTY_STAGE_KEYS.map((key) => {
          const cur = fv[key] ?? [];
          return (
            <div key={key} className="rounded border p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{WARRANTY_STAGE_LABELS[key]}</span>
                <div className="flex gap-1">
                  <button className="text-[10px] text-muted-foreground hover:underline"
                    onClick={() => update(key, [...WARRANTY_STAGE_STATES])}>All</button>
                  <button className="text-[10px] text-muted-foreground hover:underline"
                    onClick={() => update(key, [])}>None</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {WARRANTY_STAGE_STATES.map((st) => (
                  <label key={st} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <Checkbox checked={cur.includes(st)} onCheckedChange={() => toggle(key, st)} className="h-3 w-3" />
                    {st}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function ColumnFilterDropdown({ column }: { column: any }) {
  const meta = column.columnDef.meta as any;
  switch (meta?.filterType) {
    case 'multi-select': return <MultiSelectDropdown column={column} />;
    case 'text': return <TextFilterDropdown column={column} />;
    case 'date-range': return <DateRangeDropdown column={column} />;
    case 'number-range': return <NumberRangeDropdown column={column} />;
    case 'stage-progress': return <StageProgressFilterDropdown column={column} />;
    default: return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function StatusBadge({ value }: { value: WarrantyStatusToken | null }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', WARRANTY_STATUS_BADGE[value])}>
      {value}
    </Badge>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function DocsWarrantyRawDataPage() {
  const navigate = useNavigate();
  const { user, profile, roles } = useAuth() as any;
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { fields: fieldConfigRows, getLabel, isFieldVisible, sortFieldNames, getSourceOrigin } = useDocsFieldConfig('warranty');

  const storageKey = user?.id
    ? `warranty-raw-data-state:${user.id}`
    : 'warranty-raw-data-state:anon';

  const [rows, setRows] = useState<WarrantyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateLoaded, setStateLoaded] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [resubFilter, setResubFilter] = useState<'all' | 'only' | 'hide'>('all');
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<WarrantyExportFormat>('view');
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const tableRef = useRef<HTMLDivElement>(null);

  // ── Data load ────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    const all: WarrantyRow[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await (supabase as any)
        .from('warranty_items')
        .select('*')
        .eq('is_active', true)
        .order('item_no', { ascending: true })
        .order('resubmission_seq', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...(data as WarrantyRow[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setRows(all);
    setLoading(false);
  }, [toast]);

  useEffect(() => { reload(); }, [reload]);

  // ── Realtime ──
  useEffect(() => {
    const ch = supabase.channel('warranty_items_raw')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_items' }, () => { reload(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload]);

  // ── Comment counts (warranty_comments) ──
  useEffect(() => {
    if (rows.length === 0) { setCommentCounts({}); return; }
    let cancelled = false;
    let timer: number | undefined;

    const refresh = async () => {
      const ids = rows.map((r) => r.id);
      const next: Record<string, number> = {};
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await (supabase as any)
          .from('warranty_comments')
          .select('warranty_item_id')
          .in('warranty_item_id', chunk);
        if (error || !data) continue;
        for (const r of data as Array<{ warranty_item_id: string }>) {
          next[r.warranty_item_id] = (next[r.warranty_item_id] ?? 0) + 1;
        }
      }
      if (!cancelled) setCommentCounts(next);
    };

    const debounced = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 400);
    };

    refresh();

    const ch = supabase.channel('warranty_comments_counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_comments' }, debounced)
      .subscribe();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [rows]);

  // ── State persistence ──
  const DOCS_DRILLDOWN_PARAMS = ['status', 'overdue', 'stage', 'team', 'q', 'resub'];
  useEffect(() => {
    setStateLoaded(false);
    const isDrilldown = DOCS_DRILLDOWN_PARAMS.some((p) => searchParams.has(p));
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setColumnSizing(parsed.columnSizing && typeof parsed.columnSizing === 'object' ? parsed.columnSizing : {});
        if (!isDrilldown) {
          setSorting(
            Array.isArray(parsed.sorting) && parsed.sorting.length ? parsed.sorting : DEFAULT_SORTING,
          );
          setColumnFilters(Array.isArray(parsed.columnFilters) ? parsed.columnFilters : []);
          if (typeof parsed.globalFilter === 'string') {
            setGlobalFilter(parsed.globalFilter);
            setSearchInput(parsed.globalFilter);
          }
          if (parsed.resubFilter === 'only' || parsed.resubFilter === 'hide') setResubFilter(parsed.resubFilter);
        } else {
          setSorting(DEFAULT_SORTING);
          setColumnFilters([]);
          setGlobalFilter('');
          setSearchInput('');
          setResubFilter('all');
        }
      }
    } catch { /* ignore */ }
    const urlQ = searchParams.get('q');
    if (urlQ != null) {
      setGlobalFilter(urlQ);
      setSearchInput(urlQ);
    }
    const resub = searchParams.get('resub');
    if (resub === 'only' || resub === 'hide') setResubFilter(resub);
    setStateLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, searchParams]);

  useEffect(() => {
    if (!stateLoaded) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          sorting, columnFilters, columnSizing, globalFilter, resubFilter,
        }));
      } catch { /* ignore quota */ }
    }, 500);
    return () => window.clearTimeout(t);
  }, [stateLoaded, storageKey, sorting, columnFilters, columnSizing, globalFilter, resubFilter]);

  // Debounced global search
  useEffect(() => {
    const t = window.setTimeout(() => setGlobalFilter(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // URL sync
  useEffect(() => {
    if (!stateLoaded) return;
    const next = new URLSearchParams(searchParams);
    if (globalFilter) next.set('q', globalFilter); else next.delete('q');
    if (resubFilter !== 'all') next.set('resub', resubFilter); else next.delete('resub');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalFilter, resubFilter, stateLoaded]);

  // ── Filter base data (resub filter + collapse) ──
  const filteredBaseData = useMemo(() => {
    let next = rows;
    if (resubFilter === 'only') next = next.filter((r) => r.is_resubmission);
    else if (resubFilter === 'hide') next = next.filter((r) => !r.is_resubmission);
    next = next.filter((r) => {
      if (!r.is_resubmission || !r.parent_id) return true;
      return !collapsedParents.has(r.parent_id);
    });
    return next;
  }, [rows, resubFilter, collapsedParents]);

  // ── Dashboard URL filter (from Executive Dashboard) ───────────────────────
  const dashboardParams = useMemo(() => readDashboardFilterParams(searchParams), [searchParams]);
  const tableData = useMemo(() => {
    if (!hasAnyDashboardFilter(dashboardParams)) return filteredBaseData;
    const ids = computeDashboardFilteredIds('warranty', filteredBaseData, dashboardParams);
    if (!ids) return filteredBaseData;
    return filteredBaseData.filter((r) => ids.has(r.id));
  }, [filteredBaseData, dashboardParams]);
  const clearDashboardFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    ['status', 'overdue', 'stage', 'team'].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const childCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.is_resubmission && r.parent_id) m.set(r.parent_id, (m.get(r.parent_id) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const toggleParent = useCallback((parentId: string) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  const resubCount = useMemo(() => rows.filter((r) => r.is_resubmission).length, [rows]);

  // ── Bulk update helper ──
  const updateField = useCallback(
    async (id: string, field: string, value: any) => {
      const { error } = await (supabase as any)
        .from('warranty_items')
        .update({ [field]: value, updated_by: user?.id ?? null })
        .eq('id', id);
      if (error) {
        toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Saved', description: `${field} updated` });
      reload();
    },
    [user, toast, reload],
  );

  // ── Column definitions ──
  const columns = useMemo<ColumnDef<WarrantyRow>[]>(() => {
    const sizeByField: Record<string, number> = {
      item_no: 80,
      category: 130,
      warranted_item: 240,
      team: 90,
      subcontractor_name: 160,
      hdec_pic_name: 120,
      hdec_eng_name: 120,
      warranty_period_years: 90,
      contract_spec_ref: 130,
      acra_info_status: 110,
      r_subcontract_date: 110,
      r_works_description: 220,
      r_acra_reg_no: 120,
      r_acra_address: 220,
      r_brief_description: 220,
      r_director_1: 130,
      r_director_2: 130,
      r_witness: 130,
      draft_planned_date: 110,
      draft_actual_date: 110,
      draft_response_planned_date: 120,
      draft_response_actual_date: 120,
      draft_status: 80,
      subcon_signing_planned_date: 120,
      subcon_signing_actual_date: 120,
      subcon_signing_status: 80,
      hdec_signing_planned_date: 120,
      hdec_signing_actual_date: 120,
      hdec_signing_status: 80,
      final_planned_date: 110,
      final_actual_date: 110,
      final_status: 80,
      current_stage: 110,
      current_status: 160,
      remarks: 220,
      cycle_progress: 160,
    };

    const selectColumn: ColumnDef<WarrantyRow> = {
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
            className="h-3.5 w-3.5"
          />
        </span>
      ),
      cell: ({ row }) => (
        <span onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
          <Checkbox checked={row.getIsSelected()} onCheckedChange={(c) => row.toggleSelected(!!c)} className="h-3.5 w-3.5" />
        </span>
      ),
    };

    const expandColumn: ColumnDef<WarrantyRow> = {
      id: '__expand',
      size: 32,
      enableSorting: false,
      enableColumnFilter: false,
      enableResizing: false,
      header: () => null,
      cell: ({ row }) => {
        const r = row.original;
        if (r.is_resubmission) return null;
        const count = childCounts.get(r.id) ?? 0;
        if (count === 0) return null;
        const collapsed = collapsedParents.has(r.id);
        return (
          <button onClick={(e) => { e.stopPropagation(); toggleParent(r.id); }}
            className="inline-flex items-center text-muted-foreground hover:text-foreground"
            title={collapsed ? `Show ${count} resubmissions` : 'Hide resubmissions'}>
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span className="text-[10px] ml-0.5">{count}</span>
          </button>
        );
      },
    };

    const cycleColumn: ColumnDef<WarrantyRow> = {
      id: 'cycle_progress',
      header: 'Progress',
      size: 160,
      enableSorting: false,
      enableColumnFilter: true,
      accessorFn: (r) => computeWarrantyOverallStatus(r),
      filterFn: stageProgressFilterFn as any,
      meta: { filterType: 'stage-progress', label: 'Progress' },
      cell: ({ row }) => <WarrantyCycleProgress row={row.original} />,
    };

    const statusColumn: ColumnDef<WarrantyRow> = {
      id: 'current_status',
      header: 'Status',
      size: 160,
      enableColumnFilter: true,
      filterFn: multiSelectFilterFn as any,
      meta: { filterType: 'multi-select', label: 'Status' },
      accessorFn: (r) => computeWarrantyOverallStatus(r),
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return <span className="text-xs">{v}</span>;
      },
    };

    const openColumn: ColumnDef<WarrantyRow> = {
      id: '__open',
      size: 50,
      enableSorting: false,
      enableColumnFilter: false,
      enableResizing: false,
      header: '',
      cell: ({ row }) => (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/docs/warranty/${row.original.id}`);
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      ),
    };

    const deleteColumn: ColumnDef<WarrantyRow> = {
      id: '__delete',
      size: 44,
      enableSorting: false,
      enableColumnFilter: false,
      enableResizing: false,
      header: '',
      cell: ({ row }) => (
        <DocsRowDeleteButton
          table="warranty_items"
          id={row.original.id}
          recordLabel={row.original.item_no != null ? String(row.original.item_no) : (row.original.warranted_item ?? null)}
          onDeleted={() => reload()}
        />
      ),
    };

    const dataFields = ALL_DATA_FIELDS as readonly string[];

    const dataColumns: ColumnDef<WarrantyRow>[] = dataFields.map((field) => {
      const isStatus = STATUS_FIELDS.has(field);
      const isMulti = MULTI_SELECT_FIELDS.has(field);
      const isText = TEXT_FIELDS.has(field);
      const isDate = DATE_FIELDS.has(field);
      const isNum = NUMBER_FIELDS.has(field);
      const filterType = isDate ? 'date-range'
        : isNum ? 'number-range'
        : isMulti ? 'multi-select'
        : isText ? 'text'
        : null;
      const filterFn: any = isDate ? dateRangeFilterFn
        : isNum ? numberRangeFilterFn
        : isMulti ? multiSelectFilterFn
        : isText ? textFilterFn
        : undefined;

      return {
        accessorKey: field,
        id: field,
        header: getLabel(field) || field,
        size: sizeByField[field] ?? 130,
        filterFn,
        enableColumnFilter: !!filterType,
        meta: { filterType, label: getLabel(field) || field },
        cell: ({ row, getValue }) => {
          const value = getValue() as any;
          const r = row.original;

          if (field === 'item_no') {
            const isResub = r.is_resubmission;
            const cCount = commentCounts[r.id] ?? 0;
            return (
              <span className={cn('inline-flex items-center gap-1 font-mono text-xs', isResub && 'text-muted-foreground')}>
                {isResub && <span className="mr-0.5">↳</span>}
                {value ?? '—'}
                {isResub && r.resubmission_seq > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">R{r.resubmission_seq}</span>
                )}
                {cCount > 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); navigate(`/docs/warranty/${r.id}#comments`); }}
                    title={`${cCount} comment${cCount > 1 ? 's' : ''}`}
                    className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] leading-none text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <MessageSquare className="h-3 w-3" />
                    <span className="tabular-nums">{cCount}</span>
                  </button>
                )}
              </span>
            );
          }
          if (isStatus) return <StatusBadge value={value as WarrantyStatusToken | null} />;
          if (isDate) return <span className="text-xs">{formatDdMmm(value ? String(value).slice(0, 10) : null) || '—'}</span>;
          if (isNum) return value == null ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums text-xs">{value}</span>;
          if (value == null || value === '') return <span className="text-xs text-muted-foreground">—</span>;
          return <span className="block truncate text-xs" title={String(value)}>{String(value)}</span>;
        },
      };
    });

    return [selectColumn, expandColumn, cycleColumn, ...dataColumns, statusColumn, openColumn];
  }, [getLabel, navigate, childCounts, collapsedParents, toggleParent, commentCounts]);

  // ── Visibility from Field Config (always show anchors) ──
  const ALWAYS_VISIBLE = useMemo(() => new Set([
    '__select', '__expand', '__open', 'item_no', 'cycle_progress', 'current_status',
  ]), []);

  const columnVisibility = useMemo<VisibilityState>(() => {
    const v: VisibilityState = {};
    for (const id of ALWAYS_VISIBLE) v[id] = true;
    for (const id of ALL_DATA_FIELDS) {
      if (ALWAYS_VISIBLE.has(id)) continue;
      v[id] = isFieldVisible(id, roles);
    }
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFieldVisible, roles]);

  // Column order from Field Config sort_order with pinned anchors
  const columnOrder = useMemo(() => {
    const PINNED = ['__select', '__expand', 'cycle_progress', 'item_no'];
    const TRAILING = ['current_status', '__open'];
    const remaining = (ALL_DATA_FIELDS as readonly string[]).filter(
      (f) => !PINNED.includes(f) && !TRAILING.includes(f),
    );
    return [...PINNED, ...sortFieldNames(remaining), ...TRAILING];
  }, [sortFieldNames]);

  // ── Table ──
  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting: sorting.length ? sorting : DEFAULT_SORTING,
      globalFilter,
      columnFilters,
      columnSizing,
      columnVisibility,
      columnOrder,
      rowSelection,
    },
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
    globalFilterFn,
    enableMultiSort: true,
    enableSortingRemoval: true,
    isMultiSortEvent: (e) => (e as unknown as MouseEvent).shiftKey,
    maxMultiSortColCount: 5,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: { minSize: 60, maxSize: 600 },
  });

  // Clear selection when filters change
  useEffect(() => {
    setRowSelection({});
  }, [columnFilters, globalFilter, resubFilter]);

  const selectedRows = useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowSelection, tableData],
  );

  // ── Bulk fields ──
  const masters = useCommonMasters();
  const optionFields = useMemo(() => {
    const opts = (field: keyof WarrantyRow) =>
      [...new Set(rows.map((r) => r[field]).filter((v): v is string => Boolean(v)))]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v }));
    const present = (field: keyof WarrantyRow) =>
      rows.map((r) => r[field] as unknown as string | null | undefined);
    return {
      category: opts('category'),
      team: unionWithLegacy(masters.teamOptions, present('team')),
      subcontractor_name: unionWithLegacy(masters.subcontractorOptions, present('subcontractor_name')),
      hdec_pic_name: unionWithLegacy(masters.hdecPicOptions, present('hdec_pic_name')),
      hdec_eng_name: unionWithLegacy(masters.hdecEngOptions, present('hdec_eng_name')),
      acra_info_status: opts('acra_info_status'),
    };
  }, [rows, masters.teamOptions, masters.subcontractorOptions, masters.hdecPicOptions, masters.hdecEngOptions]);

  const STATUS_OPTIONS = useMemo(() => ([
    { value: 'A', label: 'A — Approved' },
    { value: 'B', label: 'B — Rejected' },
    { value: 'C', label: 'C — Rejected (major)' },
    { value: 'UR', label: 'UR — Under Review' },
    { value: 'WIP', label: 'WIP' },
    { value: 'Planned', label: 'Planned' },
  ]), []);

  const bulkFields = useMemo<WarrantyBulkField[]>(() => ([
    { field: 'category', label: getLabel('category') || 'Category', inputType: 'select', group: 'Classification', options: optionFields.category },
    { field: 'team', label: getLabel('team') || 'Team', inputType: 'select', group: 'Classification', options: optionFields.team },
    { field: 'subcontractor_name', label: getLabel('subcontractor_name') || 'Subcontractor', inputType: 'select', group: 'Assignment', options: optionFields.subcontractor_name },
    { field: 'hdec_pic_name', label: 'HDEC PIC', inputType: 'select', group: 'Assignment', options: optionFields.hdec_pic_name },
    { field: 'hdec_eng_name', label: 'HDEC ENG', inputType: 'select', group: 'Assignment', options: optionFields.hdec_eng_name },
    { field: 'warranty_period_years', label: 'Warranty Period (yrs)', inputType: 'number', group: 'Classification' },
    { field: 'acra_info_status', label: 'ACRA Info Status', inputType: 'select', group: 'Workflow', options: optionFields.acra_info_status },
    { field: 'r_subcontract_date', label: 'Subcontract Date', inputType: 'date', group: 'Schedule' },
    { field: 'draft_planned_date', label: 'Draft Planned', inputType: 'date', group: 'Schedule' },
    { field: 'draft_actual_date', label: 'Draft Actual', inputType: 'date', group: 'Schedule' },
    { field: 'draft_response_planned_date', label: 'Draft Response Planned', inputType: 'date', group: 'Schedule' },
    { field: 'draft_response_actual_date', label: 'Draft Response Actual', inputType: 'date', group: 'Schedule' },
    { field: 'draft_status', label: 'Draft Status', inputType: 'select', group: 'Workflow', options: STATUS_OPTIONS, warning: 'B/C indicates rejection — resubmission rows may be required.' },
    { field: 'subcon_signing_planned_date', label: 'Subcon Sign Planned', inputType: 'date', group: 'Schedule' },
    { field: 'subcon_signing_actual_date', label: 'Subcon Sign Actual', inputType: 'date', group: 'Schedule' },
    { field: 'subcon_signing_status', label: 'Subcon Sign Status', inputType: 'select', group: 'Workflow', options: STATUS_OPTIONS },
    { field: 'hdec_signing_planned_date', label: 'HDEC Sign Planned', inputType: 'date', group: 'Schedule' },
    { field: 'hdec_signing_actual_date', label: 'HDEC Sign Actual', inputType: 'date', group: 'Schedule' },
    { field: 'hdec_signing_status', label: 'HDEC Sign Status', inputType: 'select', group: 'Workflow', options: STATUS_OPTIONS },
    { field: 'final_planned_date', label: 'Final Planned', inputType: 'date', group: 'Schedule' },
    { field: 'final_actual_date', label: 'Final Actual', inputType: 'date', group: 'Schedule' },
    { field: 'final_status', label: 'Final Status', inputType: 'select', group: 'Workflow', options: STATUS_OPTIONS },
    { field: 'remarks', label: 'Remarks', inputType: 'text', group: 'Notes' },
  ]), [getLabel, optionFields, STATUS_OPTIONS]);

  // ── Filter chips (extend buildColumnFilterChips with stage-progress) ──
  const columnFilterChips = useMemo(() => {
    const base = buildColumnFilterChips(table, columnFilters);
    // Add chips for stage-progress filters that base may have skipped
    const extra: { id: string; label: string }[] = [];
    for (const f of columnFilters) {
      if (base.some((c) => c.id === f.id)) continue;
      const v = f.value as any;
      if (v && typeof v === 'object' && WARRANTY_STAGE_KEYS.some((k) => Array.isArray(v[k]) && v[k].length)) {
        const parts = WARRANTY_STAGE_KEYS
          .filter((k) => Array.isArray(v[k]) && v[k].length)
          .map((k) => `${WARRANTY_STAGE_LABELS[k]}(${v[k].join(',')})`);
        extra.push({ id: f.id, label: `Progress: ${parts.join(' · ')}` });
      }
    }
    return [...base, ...extra];
  }, [table, columnFilters]);

  const removeColumnFilter = (id: string) =>
    setColumnFilters((prev) => prev.filter((f) => f.id !== id));

  // ── Export ──
  const exportRowCount = table.getFilteredRowModel().rows.length;
  const handleExport = useCallback(() => {
    if (exportRowCount === 0) {
      toast({ title: 'No rows to export', description: 'Adjust filters and try again.', variant: 'destructive' });
      return;
    }
    exportWarrantyToExcel({
      table,
      fieldConfig: fieldConfigRows,
      globalFilter,
      meta: { userName: profile?.name ?? user?.email ?? 'unknown', userType: profile?.user_type ?? 'unknown' },
      format: exportFormat,
    });
    setExportDialogOpen(false);
    toast({ title: 'Export started', description: `${exportRowCount} rows queued for download.` });
  }, [table, fieldConfigRows, globalFilter, profile, user, exportFormat, exportRowCount, toast]);

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Warranty Deeds — Raw Data</h1>
          <p className="text-sm text-muted-foreground">
            Warranty deed lifecycle: ACRA info, draft, subcon &amp; HDEC signing, final issuance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {table.getFilteredRowModel().rows.length} / {rows.length} rows
          </Badge>
          {selectedCount > 0 && (
            <Badge variant="outline" className="border-primary/40 text-primary">
              {selectedCount} selected
            </Badge>
          )}
          {resubCount > 0 && (
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              {resubCount} resubmission{resubCount === 1 ? '' : 's'}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/docs/import?sub=warranty')}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Excel
          </Button>
        </div>
      </div>

      <DocsDashboardFilterBanner module="warranty" params={dashboardParams} onClear={clearDashboardFilter} />

      {/* Active filter chips */}
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
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => setColumnFilters([])}>
            Clear all
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search warranty... (comma = AND)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <Select value={resubFilter} onValueChange={(v) => setResubFilter(v as any)}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rows</SelectItem>
            <SelectItem value="only">Resubmissions only</SelectItem>
            <SelectItem value="hide">Hide resubmissions</SelectItem>
          </SelectContent>
        </Select>
        {sorting.length > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setSorting(DEFAULT_SORTING)}>
            Clear sort ({sorting.length})
          </Button>
        )}
        <WarrantyCycleProgressLegend />
        <span className="hidden self-center text-xs text-muted-foreground md:inline">
          Tip: Shift+Click headers for multi-sort · Click <Filter className="inline h-3 w-3" /> to filter columns
        </span>
      </div>

      {/* Bulk action bar */}
      <WarrantyBulkActionBar
        selectedRows={selectedRows}
        fields={bulkFields}
        onApplied={({ field, value, ids }) => {
          setRows((prev) =>
            prev.map((r) => (ids.includes(r.id) ? ({ ...r, [field]: value as any } as WarrantyRow) : r)),
          );
          setRowSelection({});
        }}
        onMutated={() => reload()}
        onClearSelection={() => setRowSelection({})}
      />

      {/* Table */}
      <WarrantyRawTableView
        table={table}
        loading={loading}
        sorting={sorting.length ? sorting : DEFAULT_SORTING}
        navigate={navigate}
        tableRef={tableRef}
        getSourceOrigin={getSourceOrigin}
      />

      {/* Export dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Warranty Deeds</DialogTitle>
            <DialogDescription>
              Choose a format. Filters and sort are preserved in both options.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as WarrantyExportFormat)}>
              <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
                <RadioGroupItem value="view" className="mt-1" />
                <div>
                  <div className="text-sm font-medium">Current view</div>
                  <div className="text-xs text-muted-foreground">
                    Uses currently visible columns. Includes computed Status; suitable for review &amp; sharing.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
                <RadioGroupItem value="reimport" className="mt-1" />
                <div>
                  <div className="text-sm font-medium">Re-import ready</div>
                  <div className="text-xs text-muted-foreground">
                    Includes ID columns; computed columns excluded; suitable for editing and re-importing.
                  </div>
                </div>
              </label>
            </RadioGroup>
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              {exportRowCount} rows will be exported.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleExport}>Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Virtualised table view with sticky frozen columns ────────────────────
interface ViewProps {
  table: ReturnType<typeof useReactTable<WarrantyRow>>;
  loading: boolean;
  sorting: SortingState;
  navigate: (path: string) => void;
  tableRef: React.RefObject<HTMLDivElement>;
  getSourceOrigin?: (field: string) => 'hdec' | 'aconex' | 'system';
}

function WarrantyRawTableView({ table, loading, sorting, navigate, tableRef, getSourceOrigin }: ViewProps) {
  const isMobile = useIsMobile();
  const { value: frozenSetting } = useFrozenColumnCount();
  const userFrozenCount = isMobile ? 1 : Math.min(Math.max(Number(frozenSetting) || 1, 1), 4);
  const frozenCount = userFrozenCount + 1; // +1 for select column

  const leafColumns = table.getVisibleLeafColumns();
  const stickyLefts = useMemo(() => {
    const lefts: number[] = [];
    let acc = 0;
    for (let i = 0; i < frozenCount && i < leafColumns.length; i++) {
      lefts.push(acc);
      acc += leafColumns[i].getSize();
    }
    return lefts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafColumns, frozenCount, table.getState().columnSizing]);
  const frozenWidth = useMemo(
    () => leafColumns.slice(0, frozenCount).reduce((s, c) => s + c.getSize(), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leafColumns, frozenCount, table.getState().columnSizing],
  );
  const totalWidth = useMemo(
    () => leafColumns.reduce((s, c) => s + c.getSize(), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const headerText = typeof headerDef === 'string' ? headerDef : header.column.id;
    const originStyle = getSourceOrigin
      ? getOriginHeaderStyle(getSourceOrigin(header.column.id))
      : getOriginHeaderStyle('system');
    return (
      <TableHead
        key={header.id}
        title={headerText}
        style={{
          width: header.getSize(),
          minWidth: header.getSize(),
          maxWidth: header.getSize(),
          ...(isSticky ? {
            position: 'sticky',
            left: stickyLefts[index],
            zIndex: 3,
            background: originStyle.stickyBg,
          } : {}),
        }}
        className={cn(
          'relative h-9 cursor-pointer select-none whitespace-nowrap border-b px-3 py-0 text-left text-xs font-medium',
          !isSticky && (originStyle.bg || 'bg-background'),
          originStyle.border,
          isLastSticky && 'shadow-[2px_0_4px_-2px_hsl(var(--border))]',
        )}
        onClick={header.column.getToggleSortingHandler()}
      >
        <div className="flex w-full items-center justify-between gap-1">
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <span className="truncate">
              {flexRender(header.column.columnDef.header, header.getContext())}
            </span>
            {header.column.getIsSorted() && (
              <span className="flex-shrink-0">
                {header.column.getIsSorted() === 'asc' ? '▲' : '▼'}
                {sorting.length > 1 && (
                  <sup className="ml-0.5 text-[9px] text-muted-foreground">
                    {header.column.getSortIndex() + 1}
                  </sup>
                )}
              </span>
            )}
          </span>
          {header.column.getCanFilter() && (
            <span className="flex-shrink-0" onClick={(event) => event.stopPropagation()}>
              <ColumnFilterDropdown column={header.column} />
            </span>
          )}
        </div>
        {header.column.getCanResize() && (
          <div
            onMouseDown={header.getResizeHandler()}
            onTouchStart={header.getResizeHandler()}
            onClick={(event) => event.stopPropagation()}
            title="Drag to resize"
            className={cn(
              'absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none bg-transparent hover:bg-primary/40',
              header.column.getIsResizing() && 'bg-primary/60',
            )}
          />
        )}
      </TableHead>
    );
  };

  const stickyBgFor = (row: WarrantyRow, index: number): string => {
    const base = 'hsl(var(--background))';
    const opaque = `linear-gradient(${base}, ${base})`;
    if (hoveredIndex === index) return `${opaque}, hsl(var(--muted) / 0.95)`;
    if (row.is_resubmission) return `${opaque}, hsl(var(--muted) / 0.45)`;
    return base;
  };

  return (
    <div className="flex max-h-[calc(100vh-260px)] flex-col overflow-hidden rounded-md border bg-background">
      <TopHorizontalScrollbar
        targetRef={tableRef}
        width={totalWidth}
        frozenWidth={frozenWidth}
      />
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
                <TableCell colSpan={leafColumns.length} className="py-8 text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={leafColumns.length} className="py-8 text-center text-muted-foreground">
                  No warranty records. Use the Import page to upload.
                </TableCell>
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
                      className={cn(
                        'cursor-pointer',
                        row.original.is_resubmission && 'bg-muted/30',
                        hoveredIndex === virtualRow.index && 'bg-muted/50',
                      )}
                      onMouseEnter={() => setHoveredIndex(virtualRow.index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={() => navigate(`/docs/warranty/${row.original.id}`)}
                    >
                      {row.getVisibleCells().map((cell, cellIdx) => {
                        const isSticky = cellIdx < frozenCount;
                        const isLastSticky = cellIdx === frozenCount - 1;
                        return (
                          <TableCell
                            key={cell.id}
                            style={{
                              width: cell.column.getSize(),
                              minWidth: cell.column.getSize(),
                              maxWidth: cell.column.getSize(),
                              height: ROW_HEIGHT,
                              maxHeight: ROW_HEIGHT,
                              overflow: 'hidden',
                              ...(isSticky ? {
                                position: 'sticky',
                                left: stickyLefts[cellIdx],
                                zIndex: 1,
                                background: stickyBg,
                              } : {}),
                            }}
                            className={cn(
                              'truncate whitespace-nowrap px-3 py-2 text-xs',
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
