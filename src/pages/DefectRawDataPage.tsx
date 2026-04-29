import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import { Download, Filter, MessageSquare, Search, Upload, X } from 'lucide-react';
import { META_FIELD_NAMES, type CommentSummary, EMPTY_SUMMARY, isMetaField } from '@/lib/meta-fields';
import { MetaCell } from '@/components/raw-data/MetaCell';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DefectStatusBadge } from '@/components/defects/DefectStatusBadge';
import { type DefectItem, formatPct, isOverdueDefect } from '@/lib/defect-utils';
import { isStageDelayedAsOf, isActualComplete, isClosureComplete, isAtRisk, isStageDone as isDefectStageDone } from '@/lib/defect-dashboard-utils';
import { DefectStageProgress, DefectStageProgressLegend } from '@/components/defects/DefectStageProgress';
import { useLatestDataDate } from '@/hooks/useLatestDataDate';
import { formatDdMmm } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDefectFieldConfig } from '@/hooks/useDefectFieldConfig';
import { useFrozenColumnCount } from '@/hooks/useAppSettings';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatTeamLabel, USER_TYPE_LABELS } from '@/types/enums';
import { useToast } from '@/hooks/use-toast';
import { exportDefectRawToExcel, exportDefectRawToExcelBySubcontractor } from '@/lib/defect-excel-export';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { BulkEditBar } from '@/components/raw-data/BulkEditBar';
import { TopHorizontalScrollbar } from '@/components/raw-data/TopHorizontalScrollbar';
import type { BulkEditableField } from '@/lib/bulk-edit';
import { buildColumnFilterChips } from '@/lib/filter-chip-utils';

const EMPTY_TOKEN = '__EMPTY__';
const DEFAULT_SORTING: SortingState = [{ id: 'issue_no', desc: false }];

const DEFECT_RAW_FIELDS = [
  'issue_no',
  'subcontractor_issue_no',
  'subcontractor_issue_source',
  'stage_progress',
  'closure_status',
  'status',
  'completion_status',
  'team',
  'planned_progress_pct',
  'actual_progress_pct',
  'area_type',
  'area_level',
  'area_location',
  'area_raw',
  'main_trade',
  'sub_trade',
  'work_type',
  'classification_source',
  'classified_at',
  'trade_detail',
  'description',
  'defect_type',
  'priority',
  'subcontractor_name',
  'subsub_name',
  'hdec_pic_name',
  'hdec_eng_name',
  'planned_start_date',
  'planned_completion_date',
  'planned_closure_date',
  'actual_start_date',
  'actual_completion_date',
  'actual_closure_date',
  'remarks',
  'hdec_comments',
  'updated_at',
  'created_at',
  ...META_FIELD_NAMES,
] as const;

const TEXT_FILTER_FIELDS = new Set([
  'issue_no',
  'subcontractor_issue_no',
  'subcontractor_issue_source',
  'area_location',
  'area_raw',
  'description',
  'remarks',
  'hdec_comments',
  'trade_detail',
]);

const DATE_FILTER_FIELDS = new Set([
  'planned_start_date',
  'planned_completion_date',
  'planned_closure_date',
  'actual_start_date',
  'actual_completion_date',
  'actual_closure_date',
  'classified_at',
  'updated_at',
  'created_at',
]);
const PROGRESS_FIELDS = new Set(['actual_progress_pct', 'planned_progress_pct']);

const RAW_SEARCH_FIELDS = [
  'issue_no',
  'subcontractor_issue_no',
  'subcontractor_issue_source',
  'team',
  'area_type',
  'area_level',
  'area_location',
  'area_raw',
  'main_trade',
  'sub_trade',
  'work_type',
  'classification_source',
  'trade_detail',
  'description',
  'defect_type',
  'status',
  'completion_status',
  'priority',
  'subcontractor_name',
  'subsub_name',
  'hdec_pic_name',
  'hdec_eng_name',
  'closure_status',
  'remarks',
  'hdec_comments',
] as const;

type DefectRawRow = DefectItem & { created_at?: string | null };

const multiSelectFilterFn = (row: any, columnId: string, filterValue: string[]) => {
  if (!filterValue || filterValue.length === 0) return true;
  const val = row.getValue(columnId);
  const isEmpty = val == null || val === '';
  if (filterValue.includes(EMPTY_TOKEN) && isEmpty) return true;
  if (isEmpty) return false;
  return filterValue.includes(String(val));
};

// Comma-separated tokens are AND-combined (case-insensitive substring match).
const tokenizeAnd = (text: string): string[] =>
  String(text ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

const matchesAllTokens = (haystack: string, query: string): boolean => {
  const tokens = tokenizeAnd(query);
  if (tokens.length === 0) return true;
  const lower = String(haystack ?? '').toLowerCase();
  return tokens.every((tok) => lower.includes(tok));
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

const progressFilterFn = (row: any, columnId: string, filterValue: any) => {
  if (!filterValue) return true;
  const { text, emptyOnly } = filterValue;
  const val = row.getValue(columnId);
  if (emptyOnly) return val == null || val === '';
  if (!text) return true;
  return matchesAllTokens(formatPct(val), String(text));
};

const globalDefectFilterFn = (row: any, _columnId: string, filterValue: string) => {
  if (tokenizeAnd(filterValue).length === 0) return true;
  const original = row.original as DefectRawRow;
  return RAW_SEARCH_FIELDS.some((field) => matchesAllTokens(String((original as any)[field] ?? ''), filterValue));
};

function uniqueOptions(data: DefectRawRow[], field: keyof DefectRawRow) {
  return [...new Set(data.map((row) => row[field]).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

function MultiSelectDropdown({ column, options }: { column: any; options: { value: string; label: string }[] }) {
  const selected: string[] = (column.getFilterValue() as string[]) ?? [];
  const isActive = selected.length > 0;
  const toggle = (value: string) => {
    const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
    column.setFilterValue(next.length ? next : undefined);
  };

  const labelMap = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const facets = column.getFacetedUniqueValues?.() as Map<any, number> | undefined;

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
          className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80', isActive ? 'text-primary' : 'text-muted-foreground/50')}
          onClick={(event) => event.stopPropagation()}
          title="Filter"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-h-72 w-56 overflow-auto p-2" align="start" onClick={(event) => event.stopPropagation()}>
        <button className="mb-1 px-1 text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(undefined)}>
          Clear all
        </button>
        {items.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50',
              option.count === 0 && !selected.includes(option.value) && 'text-muted-foreground/60'
            )}
          >
            <Checkbox checked={selected.includes(option.value)} onCheckedChange={() => toggle(option.value)} className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">{option.label}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{option.count}</span>
          </label>
        ))}
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
    const current = typeof filterValue === 'string' ? { text: filterValue, emptyOnly: false } : filterValue ?? { text: '', emptyOnly: false };
    const next = { ...current, ...patch };
    column.setFilterValue(next.text || next.emptyOnly ? next : undefined);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80', isActive ? 'text-primary' : 'text-muted-foreground/50')}
          onClick={(event) => event.stopPropagation()}
          title="Filter"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 space-y-2 p-3" align="start" onClick={(event) => event.stopPropagation()}>
        <Input placeholder="Search... (use , for AND)" value={text} onChange={(event) => update({ text: event.target.value || undefined })} className="h-7 text-xs" disabled={emptyOnly} />
        <p className="text-[10px] text-muted-foreground">Tip: comma separates AND terms (e.g. <code>slab, rebar</code>)</p>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox checked={emptyOnly} onCheckedChange={(checked) => update({ emptyOnly: !!checked, text: undefined })} className="h-3.5 w-3.5" />
          Empty only
        </label>
        <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(undefined)}>
          Clear
        </button>
      </PopoverContent>
    </Popover>
  );
}

function DateRangeDropdown({ column }: { column: any }) {
  const filterValue = column.getFilterValue() as { from?: string; to?: string; emptyOnly?: boolean } | undefined;
  const isActive = !!(filterValue?.from || filterValue?.to || filterValue?.emptyOnly);
  const update = (patch: Partial<{ from: string; to: string; emptyOnly: boolean }>) => {
    const next = { ...(filterValue ?? {}), ...patch };
    column.setFilterValue(next.from || next.to || next.emptyOnly ? next : undefined);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80', isActive ? 'text-primary' : 'text-muted-foreground/50')}
          onClick={(event) => event.stopPropagation()}
          title="Filter"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2 p-3" align="start" onClick={(event) => event.stopPropagation()}>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">From</label>
          <Input type="date" value={filterValue?.from ?? ''} onChange={(event) => update({ from: event.target.value || undefined })} className="h-7 text-xs" disabled={!!filterValue?.emptyOnly} />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">To</label>
          <Input type="date" value={filterValue?.to ?? ''} onChange={(event) => update({ to: event.target.value || undefined })} className="h-7 text-xs" disabled={!!filterValue?.emptyOnly} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs">
          <Checkbox checked={!!filterValue?.emptyOnly} onCheckedChange={(checked) => update({ emptyOnly: !!checked, from: undefined, to: undefined })} className="h-3.5 w-3.5" />
          Empty only
        </label>
        <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(undefined)}>
          Clear
        </button>
      </PopoverContent>
    </Popover>
  );
}

function ColumnFilterDropdown({ column }: { column: any }) {
  const meta = column.columnDef.meta as any;
  if (meta?.filterType === 'multi-select') return <MultiSelectDropdown column={column} options={meta.filterOptions ?? []} />;
  if (meta?.filterType === 'date-range') return <DateRangeDropdown column={column} />;
  return <TextFilterDropdown column={column} />;
}

export default function DefectRawDataPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { dataDate } = useLatestDataDate();
  const storageKey = user?.id ? `defect-raw-data-state:${user.id}` : 'defect-raw-data-state:anon';
  const { isFieldVisible, getLabel, sortFieldNames, fields: fieldConfigRows } = useDefectFieldConfig();
  const [items, setItems] = useState<DefectRawRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [searchInput, setSearchInput] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'single' | 'per-subcon'>('single');
  const [exportFormat, setExportFormat] = useState<'view' | 'reimport'>('view');
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [commentSummary, setCommentSummary] = useState<Record<string, CommentSummary>>({});
  const tableRef = useRef<HTMLDivElement>(null);

  const autoSizeColumn = (columnId: string) => {
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
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let allRows: DefectRawRow[] = [];
      const pageSize = 1000;
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data } = await (supabase as any)
          .from('defect_items')
          .select('*')
          .eq('is_active', true)
          .order('issue_no', { ascending: true })
          .range(from, from + pageSize - 1);
        if (data?.length) {
          allRows = allRows.concat(data as DefectRawRow[]);
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }
      if (!cancelled) {
        setItems(allRows);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Load comment summary (count + unread) for visible defects, and refresh on realtime changes
  useEffect(() => {
    if (!user || items.length === 0) {
      setCommentSummary({});
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const refresh = async () => {
      const ids = items.map((i) => i.id);
      const chunkSize = 500;
      const next: Record<string, CommentSummary> = {};
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { data, error } = await (supabase as any).rpc('get_defect_comment_summary', { _defect_ids: chunk });
        if (error || !data) continue;
        for (const row of data as Array<{
          defect_id: string;
          comment_count: number;
          has_unread: boolean;
          instruction_count: number;
          comment_count_only: number;
          reply_count: number;
          last_activity_at: string | null;
        }>) {
          next[row.defect_id] = {
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
      .channel('defect-comments-summary')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'defect_comments' }, debouncedRefresh)
      .subscribe();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [user, items]);

  // URL params that indicate the user arrived from a Dashboard drill-down.
  // When ANY of these are present we ignore the localStorage-saved sort/column-filter state,
  // so the user always sees the drill-down's own clean view (sorted by Issue No asc).
  const DRILLDOWN_PARAMS = [
    'source', 'actualComplete', 'closureComplete', 'overdue', 'atRisk',
    'dueOn', 'unplannedActualOn', 'asOf', 'stage',
    'team', 'subcontractor', 'subsub', 'hdecPic', 'hdecEng',
    'level', 'mainTrade', 'subTrade', 'workType', 'classificationSource',
    'status', 'closureStatus', 'issueNo', 'subcontractorIssueNo',
    'dateStart', 'dateEnd', 'dateField',
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
        // Sizing and global search are always restored.
        baseSizing = parsed.columnSizing && typeof parsed.columnSizing === 'object' ? parsed.columnSizing : {};
        baseGlobal = typeof parsed.globalFilter === 'string' ? parsed.globalFilter : '';
        // Sort and column filters are only restored on a clean entry (no drill-down params).
        // This is the root-cause fix for "wrong / stale sort when entering from a dashboard card".
        if (!isDrilldown) {
          baseSorting = Array.isArray(parsed.sorting) && parsed.sorting.length ? parsed.sorting : DEFAULT_SORTING;
          baseFilters = Array.isArray(parsed.columnFilters) ? parsed.columnFilters : [];
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
      level: 'area_level',
      mainTrade: 'main_trade',
      subTrade: 'sub_trade',
      workType: 'work_type',
      classificationSource: 'classification_source',
      status: 'status',
      closureStatus: 'closure_status',
      issueNo: 'issue_no',
      subcontractorIssueNo: 'subcontractor_issue_no',
    };
    // Merge: keep saved column filters except those that the URL is going to override.
    // Previously, the presence of ANY URL filter wiped all saved column filters.
    const urlOverriddenColIds = new Set<string>();
    for (const [param, col] of Object.entries(urlMap)) {
      if (searchParams.has(param)) urlOverriddenColIds.add(col);
    }
    const urlDateField = searchParams.get('dateField');
    if ((searchParams.has('dateStart') || searchParams.has('dateEnd')) && urlDateField && DATE_FILTER_FIELDS.has(urlDateField)) {
      urlOverriddenColIds.add(urlDateField);
    }
    const nextFilters = baseFilters.filter((filter) => !urlOverriddenColIds.has(filter.id));

    for (const [param, col] of Object.entries(urlMap)) {
      const value = searchParams.get(param);
      if (!value) continue;
      if (TEXT_FILTER_FIELDS.has(col)) nextFilters.push({ id: col, value: value === EMPTY_TOKEN ? { text: '', emptyOnly: true } : { text: value } });
      else nextFilters.push({ id: col, value: value.split(',').filter(Boolean) });
    }

    const dateStart = searchParams.get('dateStart');
    const dateEnd = searchParams.get('dateEnd');
    if ((dateStart || dateEnd) && urlDateField && DATE_FILTER_FIELDS.has(urlDateField)) {
      nextFilters.push({ id: urlDateField, value: { from: dateStart || undefined, to: dateEnd || undefined } });
    }

    const urlQ = searchParams.get('q');
    const effectiveGlobal = urlQ !== null ? urlQ : baseGlobal;
    setSorting(baseSorting);
    setColumnFilters(nextFilters);
    setGlobalFilter(effectiveGlobal);
    setSearchInput(effectiveGlobal);
    setColumnSizing(baseSizing);
    setStateLoaded(true);
  }, [storageKey, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setGlobalFilter(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!stateLoaded) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ sorting: sorting.length ? sorting : DEFAULT_SORTING, columnFilters, globalFilter, columnSizing }));
      } catch {
        // ignore quota errors
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [stateLoaded, storageKey, sorting, columnFilters, globalFilter, columnSizing]);

  useEffect(() => {
    if (!stateLoaded) return;
    if (loading) return;
    const element = tableRef.current;
    if (!element) return;
    // v2 layout = single-table sticky-columns. Old (v1) saved offsets are
    // computed against a different DOM and would mis-align row geometry.
    const SCROLL_KEY = `${storageKey}:scroll:v2`;
    // Drop any v1 leftover so it can never be applied to the new layout.
    try { localStorage.removeItem(`${storageKey}:scroll`); } catch { /* ignore */ }
    const raw = localStorage.getItem(SCROLL_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        const apply = () => {
          element.scrollTop = Number(saved.top) || 0;
          element.scrollLeft = Number(saved.left) || 0;
        };
        apply();
        requestAnimationFrame(apply);
      } catch {
        // ignore invalid saved scroll
      }
    }
    const save = () => localStorage.setItem(SCROLL_KEY, JSON.stringify({ top: element.scrollTop, left: element.scrollLeft }));
    element.addEventListener('scroll', save, { passive: true });
    return () => element.removeEventListener('scroll', save);
  }, [stateLoaded, storageKey, loading]);

  const filteredBaseData = useMemo(() => {
    const dateStart = searchParams.get('dateStart');
    const dateEnd = searchParams.get('dateEnd');
    const dateField = searchParams.get('dateField');
    let next = items;
    if ((dateStart || dateEnd) && !(dateField && DATE_FILTER_FIELDS.has(dateField))) next = next.filter((item) => {
      const dateValue = item.planned_completion_date ?? item.planned_start_date ?? '';
      return (!dateStart || dateValue >= dateStart) && (!dateEnd || dateValue <= dateEnd);
    });
    // Align with Dashboard card definitions (lenient): date OR progress/status indicator.
    const ac = searchParams.get('actualComplete');
    if (ac === 'true') next = next.filter((item) => isActualComplete(item as any));
    else if (ac === 'false') next = next.filter((item) => !isActualComplete(item as any));
    const cc = searchParams.get('closureComplete');
    if (cc === 'true') next = next.filter((item) => isClosureComplete(item as any));
    else if (cc === 'false') next = next.filter((item) => !isClosureComplete(item as any));
    if (searchParams.get('overdue') === 'true') {
      // URL `asOf` (Dashboard drill-down) takes precedence; otherwise use the project's Data Date.
      // NEVER fall back to today — overdue is always a Data-Date judgment.
      const asOfDate = searchParams.get('asOf') ?? dataDate;
      const stage = searchParams.get('stage') as 'start' | 'completion' | 'closure' | null;
      next = next.filter((item) => {
        if (stage === 'start' || stage === 'completion' || stage === 'closure') {
          return isStageDelayedAsOf(item as any, stage, asOfDate);
        }
        return isOverdueDefect(item, asOfDate);
      });
    }
    const dueOn = searchParams.get('dueOn');
    if (dueOn) {
      const stage = searchParams.get('stage');
      next = next.filter((item) => {
        if (Boolean(item.actual_closure_date)) return false;
        if (stage === 'start') return item.planned_start_date === dueOn && !item.actual_start_date;
        if (stage === 'completion') return item.planned_completion_date === dueOn && Number(item.actual_progress_pct ?? 0) < 100;
        if (stage === 'closure') return item.planned_closure_date === dueOn && !item.actual_closure_date;
        return (
          (item.planned_start_date === dueOn && !item.actual_start_date) ||
          (item.planned_completion_date === dueOn && Number(item.actual_progress_pct ?? 0) < 100) ||
          (item.planned_closure_date === dueOn && !item.actual_closure_date)
        );
      });
    }
    const unplannedActualOn = searchParams.get('unplannedActualOn');
    if (unplannedActualOn) {
      const stage = searchParams.get('stage');
      next = next.filter((item) => {
        if (stage === 'start') return item.actual_start_date === unplannedActualOn && item.planned_start_date !== unplannedActualOn;
        if (stage === 'completion') return item.actual_completion_date === unplannedActualOn && item.planned_completion_date !== unplannedActualOn;
        if (stage === 'closure') return item.actual_closure_date === unplannedActualOn && item.planned_closure_date !== unplannedActualOn;
        return (
          (item.actual_start_date === unplannedActualOn && item.planned_start_date !== unplannedActualOn) ||
          (item.actual_completion_date === unplannedActualOn && item.planned_completion_date !== unplannedActualOn) ||
          (item.actual_closure_date === unplannedActualOn && item.planned_closure_date !== unplannedActualOn)
        );
      });
    }
    if (searchParams.get('atRisk') === 'true') {
      // Match dashboard's isAtRisk: checks all stages (start/completion/closure)
      // with cascade Done logic and lenient completion/closure definitions.
      const asOf = new Date().toISOString().slice(0, 10);
      const days = Number(searchParams.get('atRiskDays') ?? 7);
      next = next.filter((item) => isAtRisk(item as any, asOf, days));
    }
    return next;
  }, [items, searchParams, dataDate]);

  const optionFields = useMemo(() => ({
    team: uniqueOptions(items, 'team').map((option) => ({ value: option.value, label: formatTeamLabel(option.value) })),
    closure_status: uniqueOptions(items, 'closure_status'),
    status: uniqueOptions(items, 'status'),
    subcontractor_name: uniqueOptions(items, 'subcontractor_name'),
    subsub_name: uniqueOptions(items, 'subsub_name'),
    hdec_pic_name: uniqueOptions(items, 'hdec_pic_name'),
    hdec_eng_name: uniqueOptions(items, 'hdec_eng_name' as any),
    area_type: uniqueOptions(items, 'area_type'),
    area_level: uniqueOptions(items, 'area_level'),
    area_location: uniqueOptions(items, 'area_location'),
    main_trade: uniqueOptions(items, 'main_trade'),
    sub_trade: uniqueOptions(items, 'sub_trade'),
    work_type: uniqueOptions(items, 'work_type'),
    classification_source: [
      { value: 'rule', label: 'rule' },
      { value: 'discipline', label: 'discipline' },
      { value: 'manual', label: 'manual' },
      { value: 'unclassified', label: 'unclassified' },
    ],
    defect_type: uniqueOptions(items, 'defect_type'),
    priority: uniqueOptions(items, 'priority'),
  }), [items]);

  const columns = useMemo<ColumnDef<DefectRawRow>[]>(() => {
    const selectColumn: ColumnDef<DefectRawRow> = {
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
      meta: { isSelectColumn: true },
    };

    const dataColumns: ColumnDef<DefectRawRow>[] = DEFECT_RAW_FIELDS.map((field) => {
      // ─── Virtual Stage Progress column (Start → Completion → Closure pip pipeline) ───
      if (field === 'stage_progress') {
        return {
          id: 'stage_progress',
          header: 'Progress',
          size: 110,
          enableColumnFilter: false,
          enableSorting: true,
          accessorFn: (r: DefectRawRow) => {
            const startDone = isDefectStageDone(r as any, 'start');
            const compDone = isDefectStageDone(r as any, 'completion');
            const closureDone = isDefectStageDone(r as any, 'closure');
            return (startDone ? 1 : 0) + (compDone ? 2 : 0) + (closureDone ? 4 : 0);
          },
          cell: ({ row }) => <DefectStageProgress item={row.original as any} asOfDate={dataDate} />,
        } as ColumnDef<DefectRawRow>;
      }
      // ─── Virtual meta columns (Instructions / Comments / Replies / Last Activity) ───
      if (isMetaField(field)) {
        return {
          id: field,
          header: getLabel(field),
          size: 110,
          enableSorting: true,
          enableColumnFilter: false,
          accessorFn: (row: DefectRawRow) => {
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
              onClick={() => navigate(`/defects/${row.original.id}#comments`)}
            />
          ),
        } as ColumnDef<DefectRawRow>;
      }

      const sizeByField: Record<string, number> = {
        issue_no: 120,
        subcontractor_issue_no: 170,
        closure_status: 130,
        completion_status: 130,
        team: 80,
        subcontractor_issue_source: 170,
        description: 260,
        area_location: 220,
        area_raw: 180,
        remarks: 220,
        hdec_comments: 220,
        updated_at: 130,
        created_at: 130,
        classified_at: 130,
        planned_start_date: 110,
        planned_completion_date: 110,
        planned_closure_date: 110,
        actual_start_date: 110,
        actual_completion_date: 110,
        actual_closure_date: 110,
        planned_progress_pct: 100,
        actual_progress_pct: 100,
      };
      const base: ColumnDef<DefectRawRow> = {
        accessorKey: field,
        header: getLabel(field),
        size: sizeByField[field] ?? 130,
        filterFn: DATE_FILTER_FIELDS.has(field) ? dateRangeFilterFn : PROGRESS_FIELDS.has(field) ? progressFilterFn : TEXT_FILTER_FIELDS.has(field) ? textFilterFn : multiSelectFilterFn,
        meta: {
          filterType: DATE_FILTER_FIELDS.has(field) ? 'date-range' : TEXT_FILTER_FIELDS.has(field) || PROGRESS_FIELDS.has(field) ? 'text' : 'multi-select',
          filterOptions: (optionFields as any)[field] ?? [],
        },
        cell: ({ row, getValue }) => {
          const value = getValue() as any;
          if (field === 'issue_no') {
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
          }
          if (field === 'closure_status') return <DefectStatusBadge status={row.original.closure_status ?? row.original.status} />;
          if (field === 'status') return <DefectStatusBadge status={row.original.status} />;
          if (field === 'completion_status') return <DefectStatusBadge status={row.original.completion_status} />;
          if (field === 'team') return formatTeamLabel(value);
          if (PROGRESS_FIELDS.has(field)) return formatPct(value);
          if (field === 'classification_source') {
            const src = String(value ?? '').toLowerCase();
            if (!src) return '—';
            const cls = src === 'rule' ? 'bg-primary/10 text-primary border-primary/30'
              : src === 'discipline' ? 'bg-accent text-accent-foreground border-border'
              : src === 'manual' ? 'bg-muted text-foreground border-border'
              : 'bg-destructive/10 text-destructive border-destructive/30';
            return <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold', cls)}>{src}</span>;
          }
          if (DATE_FILTER_FIELDS.has(field)) return formatDdMmm(value ? String(value).slice(0, 10) : null);
          const text = String(value ?? '—');
          if (['description', 'area_location', 'area_raw', 'remarks', 'hdec_comments'].includes(field)) return <span className="block truncate">{text}</span>;
          return text;
        },
      };
      return base;
    });

    return [selectColumn, ...dataColumns];
  }, [getLabel, optionFields, commentSummary, navigate, dataDate]);

  const columnVisibility = useMemo<VisibilityState>(() => {
    const visibility: VisibilityState = { __select: true };
    for (const field of DEFECT_RAW_FIELDS) {
      if (field === 'issue_no' || field === 'stage_progress') visibility[field] = true;
      else visibility[field] = isFieldVisible(field);
    }
    return visibility;
  }, [isFieldVisible]);

  const columnOrder = useMemo(() => {
    const PINNED_FRONT = ['__select', 'issue_no', 'stage_progress'];
    const remaining = (DEFECT_RAW_FIELDS as readonly string[]).filter(
      (id) => !PINNED_FRONT.includes(id),
    );
    return [...PINNED_FRONT, ...sortFieldNames(remaining)];
  }, [sortFieldNames]);

  const table = useReactTable({
    data: filteredBaseData,
    columns,
    state: { sorting: sorting.length ? sorting : DEFAULT_SORTING, globalFilter, columnFilters, columnSizing, columnVisibility, columnOrder, rowSelection },
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
    globalFilterFn: globalDefectFilterFn,
    enableMultiSort: true,
    enableSortingRemoval: true,
    isMultiSortEvent: (event) => (event as unknown as MouseEvent).shiftKey,
    maxMultiSortColCount: 5,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: { minSize: 64, maxSize: 640 },
  });

  // Clear selection when filters/search/url change to avoid acting on hidden rows
  useEffect(() => {
    setRowSelection({});
  }, [columnFilters, globalFilter, searchParams]);

  const selectedRows = useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original),
    [rowSelection, filteredBaseData],
  );

  const bulkFields = useMemo<BulkEditableField[]>(() => [
    // Location
    { field: 'area_level', label: getLabel('area_level'), inputType: 'select', group: 'Location', options: optionFields.area_level },
    { field: 'area_location', label: getLabel('area_location'), inputType: 'select', group: 'Location', options: optionFields.area_location },
    // Classification
    { field: 'team', label: getLabel('team'), inputType: 'select', group: 'Classification', options: optionFields.team },
    { field: 'main_trade', label: getLabel('main_trade'), inputType: 'select', group: 'Classification', options: optionFields.main_trade },
    { field: 'sub_trade', label: getLabel('sub_trade'), inputType: 'select', group: 'Classification', options: optionFields.sub_trade },
    { field: 'work_type', label: getLabel('work_type'), inputType: 'select', group: 'Classification', options: optionFields.work_type },
    { field: 'priority', label: getLabel('priority'), inputType: 'select', group: 'Classification', options: optionFields.priority },
    { field: 'defect_type', label: getLabel('defect_type'), inputType: 'select', group: 'Classification', options: optionFields.defect_type },
    // Assignment
    { field: 'subcontractor_name', label: getLabel('subcontractor_name'), inputType: 'select', group: 'Assignment', options: optionFields.subcontractor_name },
    { field: 'subsub_name', label: getLabel('subsub_name'), inputType: 'select', group: 'Assignment', options: optionFields.subsub_name },
    { field: 'hdec_pic_name', label: getLabel('hdec_pic_name'), inputType: 'select', group: 'Assignment', options: optionFields.hdec_pic_name },
    { field: 'hdec_eng_name', label: getLabel('hdec_eng_name'), inputType: 'select', group: 'Assignment', options: optionFields.hdec_eng_name },
    // Status
    { field: 'status', label: getLabel('status'), inputType: 'select', group: 'Status', options: optionFields.status },
    { field: 'closure_status', label: getLabel('closure_status'), inputType: 'select', group: 'Status', options: optionFields.closure_status },
    { field: 'completion_status', label: getLabel('completion_status'), inputType: 'select', group: 'Status', options: [
      { value: 'Planned', label: 'Planned' }, { value: 'WIP', label: 'WIP' }, { value: 'Done', label: 'Done' }, { value: 'Delay', label: 'Delay' },
    ] },
    // Schedule
    { field: 'planned_start_date', label: getLabel('planned_start_date'), inputType: 'date', group: 'Schedule' },
    { field: 'planned_completion_date', label: getLabel('planned_completion_date'), inputType: 'date', group: 'Schedule' },
    { field: 'planned_closure_date', label: getLabel('planned_closure_date'), inputType: 'date', group: 'Schedule' },
    { field: 'actual_start_date', label: getLabel('actual_start_date'), inputType: 'date', group: 'Schedule' },
    { field: 'actual_completion_date', label: getLabel('actual_completion_date'), inputType: 'date', group: 'Schedule' },
    { field: 'actual_closure_date', label: getLabel('actual_closure_date'), inputType: 'date', group: 'Schedule' },
    // Notes
    { field: 'remarks', label: getLabel('remarks'), inputType: 'text', group: 'Notes' },
    { field: 'hdec_comments', label: getLabel('hdec_comments'), inputType: 'text', group: 'Notes' },
  ], [getLabel, optionFields]);

  const handleBulkApplied = useCallback(({ field, value, ids }: { field: string; value: string | number | null; ids: string[] }) => {
    // Optimistically apply changes locally so the table reflects updates without a full refetch
    setItems((prev) => prev.map((row) => (ids.includes(row.id) ? ({ ...row, [field]: value as any }) : row)));
    setRowSelection({});
  }, []);

  const activeUrlFilters = useMemo(() => {
    const labels: Record<string, string> = {
      q: 'Search',
      team: 'Team',
      subcontractor: 'Subcontractor',
      subsub: 'Sub-Sub',
      hdecPic: 'HDEC PIC',
      hdecEng: 'HDEC ENG',
      level: 'Level',
      mainTrade: 'Main Trade',
      subTrade: 'Sub Trade',
      workType: 'Work Type',
      classificationSource: 'Classification',
      status: 'Status',
      closureStatus: 'Closure',
      issueNo: 'Issue No',
      subcontractorIssueNo: 'Subcontractor Issue No',
    };
    const out: { label: string; param: string; clears?: string[] }[] = [];
    for (const [param, label] of Object.entries(labels)) {
      const value = searchParams.get(param);
      if (!value) continue;
      const display = value === EMPTY_TOKEN ? '(Blank)' : param === 'team' ? formatTeamLabel(value) : value;
      out.push({ label: `${label} ${display}`, param });
    }
    const from = searchParams.get('dateStart');
    const to = searchParams.get('dateEnd');
    if (from || to) {
      const dateField = searchParams.get('dateField');
      out.push({ label: `${dateField ? getLabel(dateField) : 'Date'} ${from || ''}${from && to ? ' → ' : ''}${to || ''}`, param: 'dateStart', clears: ['dateStart', 'dateEnd', 'dateField'] });
    }
    const dueOn = searchParams.get('dueOn');
    if (dueOn) {
      const stage = searchParams.get('stage');
      const stageLabel = stage === 'completion' ? 'Completion' : stage === 'closure' ? 'Closure' : stage === 'start' ? 'Start' : 'Stage';
      out.push({ label: `${stageLabel} due ${dueOn} (open)`, param: 'dueOn', clears: ['dueOn', 'stage'] });
    }
    const unplannedActualOn = searchParams.get('unplannedActualOn');
    if (unplannedActualOn) {
      const stage = searchParams.get('stage');
      const stageLabel = stage === 'completion' ? 'Completion' : stage === 'closure' ? 'Closure' : stage === 'start' ? 'Start' : 'Stage';
      out.push({ label: `${stageLabel} actual ${unplannedActualOn} (unplanned)`, param: 'unplannedActualOn', clears: ['unplannedActualOn', 'stage'] });
    }
    // Dashboard-driven status filters
    const ac = searchParams.get('actualComplete');
    const cc = searchParams.get('closureComplete');
    if (ac === 'true' && cc === 'false') {
      out.push({ label: 'Remain Inspection', param: 'actualComplete', clears: ['actualComplete', 'closureComplete'] });
    } else {
      if (ac === 'true' || ac === 'false') {
        out.push({ label: `Completion: ${ac === 'true' ? 'Done' : 'Open'}`, param: 'actualComplete', clears: ['actualComplete'] });
      }
      if (cc === 'true' || cc === 'false') {
        out.push({ label: `Closure: ${cc === 'true' ? 'Done' : 'Open'}`, param: 'closureComplete', clears: ['closureComplete'] });
      }
    }
    if (searchParams.get('overdue') === 'true') {
      const stage = searchParams.get('stage');
      const stageLabel = stage === 'completion' ? 'Completion' : stage === 'closure' ? 'Closure' : stage === 'start' ? 'Start' : null;
      out.push({ label: stageLabel ? `Overdue — ${stageLabel}` : 'Overdue', param: 'overdue', clears: ['overdue', 'stage', 'asOf'] });
    }
    if (searchParams.get('atRisk') === 'true') {
      const days = searchParams.get('atRiskDays');
      out.push({ label: days ? `At Risk (≤ ${days}d)` : 'At Risk', param: 'atRisk', clears: ['atRisk', 'atRiskDays'] });
    }
    return out;
  }, [searchParams, getLabel]);

  const clearUrlFilter = (param: string, clears?: string[]) => {
    const next = new URLSearchParams(searchParams);
    for (const key of clears?.length ? clears : [param]) next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const clearAllUrlFilters = () => setSearchParams(new URLSearchParams(), { replace: true });
  const activeColumnFilterCount = columnFilters.length;
  const columnFilterChips = useMemo(() => buildColumnFilterChips(table, columnFilters), [table, columnFilters]);
  const removeColumnFilter = (id: string) => setColumnFilters((prev) => prev.filter((f) => f.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Defect Raw Data</h1>
          <p className="text-sm text-muted-foreground">Issue No and subcontractor issue tracking data.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/defects/import')}>
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
              setExportFormat('view');
              setExportDialogOpen(true);
            }}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/defects/export')}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {activeUrlFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-primary">Active URL filters:</span>
          {activeUrlFilters.map((filter) => (
            <button key={filter.param} onClick={() => clearUrlFilter(filter.param, filter.clears)} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary hover:bg-primary/20" title="Click to remove">
              {filter.label} ✕
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

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search defects... (comma = AND)" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="h-9 pl-8" />
        </div>
        <span className="self-center text-sm text-muted-foreground">{table.getFilteredRowModel().rows.length} records</span>
        {sorting.length > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setSorting(DEFAULT_SORTING)}>
            Clear sort ({sorting.length})
          </Button>
        )}
        <span className="hidden self-center text-xs text-muted-foreground md:inline">
          Tip: Shift+Click headers for multi-sort · Click <Filter className="inline h-3 w-3" /> to filter columns
        </span>
        <div className="ml-auto"><DefectStageProgressLegend /></div>
      </div>

      <BulkEditBar
        selectedRows={selectedRows}
        fields={bulkFields}
        table="defect_items"
        onApplied={handleBulkApplied}
        onClearSelection={() => setRowSelection({})}
      />

      <DefectRawTableView table={table} loading={loading} sorting={sorting.length ? sorting : DEFAULT_SORTING} autoSizeColumn={autoSizeColumn} navigate={navigate} tableRef={tableRef} dataDate={dataDate} />

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Defect Raw Data</DialogTitle>
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
            return (
              <div className="space-y-4 py-2">
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Format</div>
                  <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as 'view' | 'reimport')} className="gap-2">
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="view" id="export-format-view" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="export-format-view" className="cursor-pointer text-sm font-medium">View-friendly</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Human-readable format (formatted dates, percentages, team labels). Best for sharing or reporting.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="reimport" id="export-format-reimport" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="export-format-reimport" className="cursor-pointer text-sm font-medium">Re-import ready</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Includes ID columns and raw values (YYYY-MM-DD dates, numeric %). Edit values and re-import to update existing rows. New rows will not be created.</p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Output</div>
                  <RadioGroup value={exportMode} onValueChange={(v) => setExportMode(v as 'single' | 'per-subcon')} className="gap-2">
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
                        <Label htmlFor="export-per-subcon" className="cursor-pointer text-sm font-medium">One file per Subcontractor</Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Splits filtered rows by Subcontractor — {subconSet.size} file{subconSet.size === 1 ? '' : 's'} ({sortedRows.length} rows total).
                          Empty Subcontractor rows go to "Unassigned". File names include the Subcontractor name.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => {
                const meta = {
                  userName: profile?.name || profile?.login_id || 'Unknown',
                  userType: profile?.user_type ? USER_TYPE_LABELS[profile.user_type] : '',
                };
                try {
                  if (exportMode === 'single') {
                    const result = exportDefectRawToExcel({ table, fieldConfig: fieldConfigRows, globalFilter, searchParams, meta, format: exportFormat });
                    toast({ title: 'Export complete', description: `${result.rowCount} rows → ${result.fileName}` });
                  } else {
                    const result = exportDefectRawToExcelBySubcontractor({ table, fieldConfig: fieldConfigRows, globalFilter, searchParams, meta, format: exportFormat });
                    toast({ title: 'Export complete', description: `${result.fileCount} file${result.fileCount === 1 ? '' : 's'} exported (${result.rowCount} rows total)` });
                  }
                  setExportDialogOpen(false);
                } catch (err) {
                  console.error('Defect Excel export failed', err);
                  toast({ title: 'Export failed', description: String((err as Error)?.message ?? err), variant: 'destructive' });
                }
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface DefectRawTableViewProps {
  table: ReturnType<typeof useReactTable<DefectRawRow>>;
  loading: boolean;
  sorting: SortingState;
  autoSizeColumn: (id: string) => void;
  navigate: (path: string) => void;
  tableRef: React.RefObject<HTMLDivElement>;
  dataDate: string;
}

function DefectRawTableView({ table, loading, sorting, autoSizeColumn, navigate, tableRef, dataDate }: DefectRawTableViewProps) {
  const isMobile = useIsMobile();
  const { value: frozenSetting } = useFrozenColumnCount();
  // +1 for the always-on selection column at the start
  const userFrozenCount = isMobile ? 1 : Math.min(Math.max(Number(frozenSetting) || 1, 1), 4);
  const frozenCount = userFrozenCount + 1;

  const leafColumns = table.getVisibleLeafColumns();
  // Cumulative left offset for each frozen column (used by `position: sticky`).
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
    () => leafColumns.slice(0, frozenCount).reduce((s, c) => s + c.getSize(), 0),
    [leafColumns, frozenCount, table.getState().columnSizing],
  );
  const totalWidth = useMemo(
    () => leafColumns.reduce((s, c) => s + c.getSize(), 0),
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
    return (
      <TableHead
        key={header.id}
        data-column-id={header.column.id}
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
                {sorting.length > 1 && <sup className="ml-0.5 text-[9px] text-muted-foreground">{header.column.getSortIndex() + 1}</sup>}
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
            onDoubleClick={(event) => { event.stopPropagation(); autoSizeColumn(header.column.id); }}
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

  const renderRowClass = (row: DefectRawRow, index: number) => {
    const closed = Boolean(row.actual_closure_date) || /closed|complete|done/i.test(`${row.closure_status ?? ''} ${row.status ?? ''}`);
    const overdue = isOverdueDefect(row, dataDate);
    return cn(
      'cursor-pointer',
      closed && 'bg-muted/30 text-muted-foreground',
      overdue && !closed && 'bg-destructive/5',
      hoveredIndex === index && 'bg-muted/50',
    );
  };

  // Sticky cells MUST be fully opaque, otherwise scrolled content from the
  // non-frozen columns shows through. Layer the row tint on top of an opaque
  // base background using two stacked CSS background layers.
  const stickyBgFor = (row: DefectRawRow, index: number): string => {
    const closed = Boolean(row.actual_closure_date) || /closed|complete|done/i.test(`${row.closure_status ?? ''} ${row.status ?? ''}`);
    const overdue = isOverdueDefect(row, dataDate);
    const base = 'hsl(var(--background))';
    const opaque = `linear-gradient(${base}, ${base})`;
    if (hoveredIndex === index) return `${opaque}, hsl(var(--muted) / 0.95)`;
    if (overdue && !closed) return `${opaque}, hsl(var(--destructive) / 0.06)`;
    if (closed) return `${opaque}, hsl(var(--muted) / 0.45)`;
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
        className="min-w-0 flex-1 overflow-auto scrollbar-hide"
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
                <TableCell colSpan={leafColumns.length} className="py-8 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={leafColumns.length} className="py-8 text-center text-muted-foreground">No defects found. Import data to get started.</TableCell>
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
                      onClick={() => navigate(`/defects/${row.original.id}${location.search}`)}
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
