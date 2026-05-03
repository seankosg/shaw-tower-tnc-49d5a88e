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
import { Download, Filter, Search, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useAppSetting, useFrozenColumnCount } from '@/hooks/useAppSettings';
import { useDocsFieldConfig } from '@/hooks/useDocsFieldConfig';
import { useLatestDocsDataDate } from '@/hooks/useLatestDocsDataDate';
import { computeRisk } from '@/lib/docs-risk';
import { getTradeFromSheetName, TRADE_OPTIONS } from '@/lib/docs-trade';
import { exportDocsRawToExcel } from '@/lib/docs-excel-export';
import { TopHorizontalScrollbar } from '@/components/raw-data/TopHorizontalScrollbar';
import { DocsBulkEditBar } from '@/components/raw-data/DocsBulkEditBar';
import { DocsCycleProgress } from '@/components/docs/DocsCycleProgress';
import { computeOverallStatus } from '@/lib/docs-status';
import { formatDdMmm } from '@/lib/format';
import { cn } from '@/lib/utils';
import { buildColumnFilterChips } from '@/lib/filter-chip-utils';
import type { BulkEditableField } from '@/lib/bulk-edit';

const EMPTY_TOKEN = '__EMPTY__';
const DEFAULT_SORTING: SortingState = [{ id: 'document_no', desc: false }];

interface DocsRawRow {
  id: string;
  project_id: string;
  document_no: string;
  revision: string | null;
  title: string | null;
  discipline: string | null;
  sheet_name: string | null;
  series: string | null;
  level_location: string | null;
  document_type: string | null;
  organisation_raw: string | null;
  aconex_status: string | null;
  current_status: string | null;
  is_submitted: boolean;
  transmittal_number: string | null;
  submitted_date: string | null;
  approved_date: string | null;
  transmittal_due_date: string | null;
  days_due: number | null;
  sub1_planned_date: string | null;
  sub1_submission_date: string | null;
  sub1_approval_date: string | null;
  sub1_approval_status: string | null;
  sub2_planned_date: string | null;
  sub2_submission_date: string | null;
  sub2_approval_date: string | null;
  sub2_approval_status: string | null;
  sub3_planned_date: string | null;
  sub3_submission_date: string | null;
  sub3_approval_date: string | null;
  sub3_approval_status: string | null;
  remarks: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  subcontractor_name: string | null;
  sub1_actual_response_date: string | null;
  sub2_actual_response_date: string | null;
  sub3_actual_response_date: string | null;
  updated_at: string | null;
  created_at: string | null;
  // derived (client-side)
  trade?: string;
  risk?: 'red' | 'amber' | 'green';
  overall_status?: string;
}

const DOCS_RAW_FIELDS = [
  'document_no',
  'revision',
  'title',
  'trade',
  'discipline',
  'sheet_name',
  'series',
  'level_location',
  'document_type',
  'organisation_raw',
  'subcontractor_name',
  'hdec_pic_name',
  'hdec_eng_name',
  'cycle_progress',
  'aconex_status',
  'current_status',
  'is_submitted',
  'transmittal_number',
  'submitted_date',
  'approved_date',
  'transmittal_due_date',
  'days_due',
  'sub1_planned_date',
  'sub1_submission_date',
  'sub1_approval_date',
  'sub1_actual_response_date',
  'sub1_approval_status',
  'sub2_planned_date',
  'sub2_submission_date',
  'sub2_approval_date',
  'sub2_actual_response_date',
  'sub2_approval_status',
  'sub3_planned_date',
  'sub3_submission_date',
  'sub3_approval_date',
  'sub3_actual_response_date',
  'sub3_approval_status',
  'remarks',
  'risk',
  'updated_at',
  'created_at',
] as const;

const TEXT_FILTER_FIELDS = new Set([
  'document_no',
  'revision',
  'title',
  'sheet_name',
  'series',
  'level_location',
  'transmittal_number',
  'organisation_raw',
  'subcontractor_name',
  'remarks',
]);

const DATE_FILTER_FIELDS = new Set([
  'submitted_date',
  'approved_date',
  'transmittal_due_date',
  'sub1_planned_date',
  'sub1_submission_date',
  'sub1_approval_date',
  'sub1_actual_response_date',
  'sub2_planned_date',
  'sub2_submission_date',
  'sub2_approval_date',
  'sub2_actual_response_date',
  'sub3_planned_date',
  'sub3_submission_date',
  'sub3_approval_date',
  'sub3_actual_response_date',
  'updated_at',
  'created_at',
]);

const NUMERIC_FIELDS = new Set(['days_due']);

const RAW_SEARCH_FIELDS: (keyof DocsRawRow)[] = [
  'document_no', 'revision', 'title', 'discipline', 'sheet_name', 'series',
  'level_location', 'document_type', 'organisation_raw', 'subcontractor_name',
  'aconex_status', 'current_status', 'transmittal_number', 'remarks',
  'hdec_pic_name', 'hdec_eng_name',
  'sub1_approval_status', 'sub2_approval_status', 'sub3_approval_status',
];

// ─── Filter functions ──────────────────────────────────────────────────────
const tokenizeAnd = (text: string) => String(text ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
const matchesAllTokens = (haystack: string, query: string) => {
  const tokens = tokenizeAnd(query);
  if (tokens.length === 0) return true;
  const lower = String(haystack ?? '').toLowerCase();
  return tokens.every((tok) => lower.includes(tok));
};

const multiSelectFilterFn = (row: any, columnId: string, filterValue: string[]) => {
  if (!filterValue?.length) return true;
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

const globalDocsFilterFn = (row: any, _columnId: string, filterValue: string) => {
  if (tokenizeAnd(filterValue).length === 0) return true;
  const original = row.original as DocsRawRow;
  return RAW_SEARCH_FIELDS.some((field) => matchesAllTokens(String((original as any)[field] ?? ''), filterValue));
};

function uniqueOptions(data: DocsRawRow[], field: keyof DocsRawRow) {
  return [...new Set(data.map((row) => row[field]).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

// ─── Filter dropdowns (mirror Defect) ──────────────────────────────────────
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
        if (rawVal == null || rawVal === '') emptyCount += count;
        else { const key = String(rawVal); counts.set(key, (counts.get(key) ?? 0) + count); }
      });
    }
    selected.forEach((v) => { if (v !== EMPTY_TOKEN && !counts.has(v)) counts.set(v, 0); });
    options.forEach((o) => { if (!counts.has(o.value)) counts.set(o.value, 0); });
    const list = [...counts.entries()].map(([value, count]) => ({ value, label: labelMap.get(value) ?? value, count }));
    list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return [{ value: EMPTY_TOKEN, label: '(Empty)', count: emptyCount }, ...list];
  }, [facets, options, labelMap, selected]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80', isActive ? 'text-primary' : 'text-muted-foreground/50')} onClick={(e) => e.stopPropagation()} title="Filter">
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-h-72 w-56 overflow-auto p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2 px-1">
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(items.map((o) => o.value))}>Select all</button>
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(undefined)}>Clear all</button>
        </div>
        {items.map((option) => (
          <label key={option.value} className={cn('flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50', option.count === 0 && !selected.includes(option.value) && 'text-muted-foreground/60')}>
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
        <button className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80', isActive ? 'text-primary' : 'text-muted-foreground/50')} onClick={(e) => e.stopPropagation()} title="Filter">
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 space-y-2 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <Input placeholder="Search... (use , for AND)" value={text} onChange={(e) => update({ text: e.target.value || undefined })} className="h-7 text-xs" disabled={emptyOnly} />
        <p className="text-[10px] text-muted-foreground">Tip: comma separates AND terms</p>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox checked={emptyOnly} onCheckedChange={(c) => update({ emptyOnly: !!c, text: undefined })} className="h-3.5 w-3.5" /> Empty only
        </label>
        <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(undefined)}>Clear</button>
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
        <button className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80', isActive ? 'text-primary' : 'text-muted-foreground/50')} onClick={(e) => e.stopPropagation()} title="Filter">
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-1"><label className="text-[11px] text-muted-foreground">From</label><Input type="date" value={filterValue?.from ?? ''} onChange={(e) => update({ from: e.target.value || undefined })} className="h-7 text-xs" disabled={!!filterValue?.emptyOnly} /></div>
        <div className="space-y-1"><label className="text-[11px] text-muted-foreground">To</label><Input type="date" value={filterValue?.to ?? ''} onChange={(e) => update({ to: e.target.value || undefined })} className="h-7 text-xs" disabled={!!filterValue?.emptyOnly} /></div>
        <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs">
          <Checkbox checked={!!filterValue?.emptyOnly} onCheckedChange={(c) => update({ emptyOnly: !!c, from: undefined, to: undefined })} className="h-3.5 w-3.5" /> Empty only
        </label>
        <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(undefined)}>Clear</button>
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

// ───────────────────────────────────────────────────────────────────────────
export default function DocsRawDataPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isFieldVisible, getLabel, sortFieldNames, fields: fieldConfigRows } = useDocsFieldConfig();
  const { value: leadDays } = useAppSetting<number>('docs_lead_days_as_built', 30);

  const storageKey = user?.id ? `docs-raw-data-state:${user.id}` : 'docs-raw-data-state:anon';
  const [items, setItems] = useState<DocsRawRow[]>([]);
  const [scDateMap, setScDateMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [searchInput, setSearchInput] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'view' | 'reimport'>('view');
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

  // ─── Load drawings (paginated to bypass 1k row cap) ───
  const reload = useCallback(async () => {
    setLoading(true);
    let allRows: any[] = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await (supabase as any)
        .from('docs_drawings')
        .select('*')
        .eq('sub_module', 'as_built')
        .eq('is_active', true)
        .order('document_no', { ascending: true })
        .range(from, from + pageSize - 1);
      if (data?.length) {
        allRows = allRows.concat(data);
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }
    setItems(allRows as DocsRawRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // SC dates for risk computation
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('app_settings').select('key, value').like('key', 'docs_sc_date_%');
      if (data) {
        const map: Record<string, string> = {};
        for (const s of data) {
          const projectId = s.key.replace('docs_sc_date_', '');
          if (typeof s.value === 'string') map[projectId] = s.value;
        }
        setScDateMap(map);
      }
    })();
  }, []);

  const { dataDate } = useLatestDocsDataDate('as_built');

  // Augment rows with derived trade + risk + overall status (v2)
  const augmentedItems = useMemo<DocsRawRow[]>(() => items.map((r) => ({
    ...r,
    trade: getTradeFromSheetName(r.sheet_name) === '—' ? '' : getTradeFromSheetName(r.sheet_name) as string,
    risk: computeRisk(r.is_submitted, scDateMap[r.project_id], leadDays),
    overall_status: computeOverallStatus(r as any, dataDate),
  })), [items, scDateMap, leadDays, dataDate]);

  // ─── State persistence (localStorage) ───
  useEffect(() => {
    setStateLoaded(false);
    let baseFilters: ColumnFiltersState = [];
    let baseSorting: SortingState = DEFAULT_SORTING;
    let baseGlobal = '';
    let baseSizing: ColumnSizingState = {};
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        baseSizing = parsed.columnSizing && typeof parsed.columnSizing === 'object' ? parsed.columnSizing : {};
        baseSorting = Array.isArray(parsed.sorting) && parsed.sorting.length ? parsed.sorting : DEFAULT_SORTING;
        baseFilters = Array.isArray(parsed.columnFilters) ? parsed.columnFilters : [];
        baseGlobal = typeof parsed.globalFilter === 'string' ? parsed.globalFilter : '';
      }
    } catch { /* ignore */ }

    // URL → text filter for `q` (global search)
    const urlQ = searchParams.get('q');
    const effectiveGlobal = urlQ !== null ? urlQ : baseGlobal;
    setSorting(baseSorting);
    setColumnFilters(baseFilters);
    setGlobalFilter(effectiveGlobal);
    setSearchInput(effectiveGlobal);
    setColumnSizing(baseSizing);
    setStateLoaded(true);
  }, [storageKey, searchParams]);

  useEffect(() => {
    const t = window.setTimeout(() => setGlobalFilter(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!stateLoaded) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          sorting: sorting.length ? sorting : DEFAULT_SORTING,
          columnFilters, globalFilter, columnSizing,
        }));
      } catch { /* ignore quota */ }
    }, 500);
    return () => window.clearTimeout(t);
  }, [stateLoaded, storageKey, sorting, columnFilters, globalFilter, columnSizing]);

  // Scroll position persistence
  useEffect(() => {
    if (!stateLoaded || loading) return;
    const el = tableRef.current;
    if (!el) return;
    const SCROLL_KEY = `${storageKey}:scroll:v2`;
    const raw = localStorage.getItem(SCROLL_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        const apply = () => { el.scrollTop = Number(saved.top) || 0; el.scrollLeft = Number(saved.left) || 0; };
        apply();
        requestAnimationFrame(apply);
      } catch { /* ignore */ }
    }
    const save = () => localStorage.setItem(SCROLL_KEY, JSON.stringify({ top: el.scrollTop, left: el.scrollLeft }));
    el.addEventListener('scroll', save, { passive: true });
    return () => el.removeEventListener('scroll', save);
  }, [stateLoaded, storageKey, loading]);

  // ─── Column option lists for multi-select filters ───
  const optionFields = useMemo(() => ({
    discipline: uniqueOptions(augmentedItems, 'discipline'),
    series: uniqueOptions(augmentedItems, 'series'),
    document_type: uniqueOptions(augmentedItems, 'document_type'),
    aconex_status: uniqueOptions(augmentedItems, 'aconex_status'),
    current_status: uniqueOptions(augmentedItems, 'current_status'),
    sub1_approval_status: uniqueOptions(augmentedItems, 'sub1_approval_status'),
    sub2_approval_status: uniqueOptions(augmentedItems, 'sub2_approval_status'),
    sub3_approval_status: uniqueOptions(augmentedItems, 'sub3_approval_status'),
    is_submitted: [{ value: 'true', label: 'Submitted' }, { value: 'false', label: 'Not submitted' }],
    trade: TRADE_OPTIONS.map((t) => ({ value: t, label: t })),
    risk: [
      { value: 'red', label: 'Red' },
      { value: 'amber', label: 'Amber' },
      { value: 'green', label: 'Green' },
    ],
  }), [augmentedItems]);

  // ─── Columns ───
  const columns = useMemo<ColumnDef<DocsRawRow>[]>(() => {
    const selectColumn: ColumnDef<DocsRawRow> = {
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

    const sizeByField: Record<string, number> = {
      document_no: 180,
      revision: 70,
      title: 280,
      trade: 110,
      discipline: 110,
      sheet_name: 160,
      series: 90,
      level_location: 130,
      document_type: 130,
      organisation_raw: 160,
      hdec_pic_name: 130,
      hdec_eng_name: 130,
      aconex_status: 120,
      current_status: 120,
      is_submitted: 90,
      transmittal_number: 140,
      submitted_date: 110,
      approved_date: 110,
      transmittal_due_date: 110,
      days_due: 80,
      remarks: 240,
      risk: 90,
      updated_at: 130,
      created_at: 130,
    };

    const dataColumns: ColumnDef<DocsRawRow>[] = DOCS_RAW_FIELDS.map((field) => {
      const filterType: 'multi-select' | 'date-range' | 'text' =
        DATE_FILTER_FIELDS.has(field) ? 'date-range'
        : TEXT_FILTER_FIELDS.has(field) || NUMERIC_FIELDS.has(field) ? 'text'
        : 'multi-select';

      const base: ColumnDef<DocsRawRow> = {
        accessorKey: field,
        header: getLabel(field),
        size: sizeByField[field] ?? 130,
        filterFn:
          filterType === 'date-range' ? dateRangeFilterFn
          : filterType === 'text' ? textFilterFn
          : multiSelectFilterFn,
        meta: {
          filterType,
          filterOptions: (optionFields as any)[field] ?? [],
        },
        cell: ({ row, getValue }) => {
          const value = getValue() as any;
          if (field === 'document_no') {
            return <span className="font-mono text-xs text-primary hover:underline">{String(value ?? '—')}</span>;
          }
          if (field === 'is_submitted') {
            return (
              <Badge variant={value ? 'default' : 'outline'} className="text-[10px]">
                {value ? 'Yes' : 'No'}
              </Badge>
            );
          }
          if (field === 'aconex_status' || field === 'current_status') {
            if (!value) return <span className="text-muted-foreground">—</span>;
            return <Badge variant="outline" className="text-[10px]">{String(value)}</Badge>;
          }
          if (field === 'risk') {
            const r = row.original.risk;
            if (!r) return '—';
            const cls = r === 'red' ? 'bg-red-100 text-red-800 hover:bg-red-100'
              : r === 'amber' ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
              : 'bg-green-100 text-green-800 hover:bg-green-100';
            return <Badge className={cn(cls, 'text-[10px]')}>{r.toUpperCase()}</Badge>;
          }
          if (field === 'cycle_progress') {
            return <DocsCycleProgress drawing={row.original as any} dataDate={dataDate} />;
          }
          if (DATE_FILTER_FIELDS.has(field)) {
            return formatDdMmm(value ? String(value).slice(0, 10) : null);
          }
          const text = value == null || value === '' ? '—' : String(value);
          if (['title', 'remarks'].includes(field)) return <span className="block truncate" title={text}>{text}</span>;
          return text;
        },
      };
      return base;
    });

    return [selectColumn, ...dataColumns];
  }, [getLabel, optionFields, dataDate]);

  const columnVisibility = useMemo<VisibilityState>(() => {
    const v: VisibilityState = { __select: true };
    for (const f of DOCS_RAW_FIELDS) {
      if (f === 'document_no') v[f] = true;
      else if (f === 'trade' || f === 'risk') v[f] = true; // derived columns always shown by default
      else v[f] = isFieldVisible(f);
    }
    return v;
  }, [isFieldVisible]);

  const columnOrder = useMemo(() => {
    const PINNED = ['__select', 'document_no'];
    const remaining = (DOCS_RAW_FIELDS as readonly string[]).filter((id) => !PINNED.includes(id));
    return [...PINNED, ...sortFieldNames(remaining)];
  }, [sortFieldNames]);

  const table = useReactTable({
    data: augmentedItems,
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
    globalFilterFn: globalDocsFilterFn,
    enableMultiSort: true,
    enableSortingRemoval: true,
    isMultiSortEvent: (e) => (e as unknown as MouseEvent).shiftKey,
    maxMultiSortColCount: 5,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: { minSize: 64, maxSize: 640 },
  });

  useEffect(() => { setRowSelection({}); }, [columnFilters, globalFilter, searchParams]);

  const selectedRows = useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original),
    [rowSelection, augmentedItems],
  );

  const bulkFields = useMemo<BulkEditableField[]>(() => [
    { field: 'discipline', label: getLabel('discipline'), inputType: 'select', group: 'Classification', options: optionFields.discipline },
    { field: 'document_type', label: getLabel('document_type'), inputType: 'select', group: 'Classification', options: optionFields.document_type },
    { field: 'aconex_status', label: getLabel('aconex_status'), inputType: 'select', group: 'Status', options: optionFields.aconex_status },
    { field: 'current_status', label: getLabel('current_status'), inputType: 'select', group: 'Status', options: optionFields.current_status },
    { field: 'sub1_approval_status', label: getLabel('sub1_approval_status'), inputType: 'select', group: 'Submission', options: optionFields.sub1_approval_status },
    { field: 'sub2_approval_status', label: getLabel('sub2_approval_status'), inputType: 'select', group: 'Submission', options: optionFields.sub2_approval_status },
    { field: 'sub3_approval_status', label: getLabel('sub3_approval_status'), inputType: 'select', group: 'Submission', options: optionFields.sub3_approval_status },
    { field: 'submitted_date', label: getLabel('submitted_date'), inputType: 'date', group: 'Dates' },
    { field: 'approved_date', label: getLabel('approved_date'), inputType: 'date', group: 'Dates' },
    { field: 'transmittal_due_date', label: getLabel('transmittal_due_date'), inputType: 'date', group: 'Dates' },
    { field: 'sub1_planned_date', label: getLabel('sub1_planned_date'), inputType: 'date', group: 'Sub1' },
    { field: 'sub1_submission_date', label: getLabel('sub1_submission_date'), inputType: 'date', group: 'Sub1' },
    { field: 'sub1_approval_date', label: getLabel('sub1_approval_date'), inputType: 'date', group: 'Sub1' },
    { field: 'sub2_planned_date', label: getLabel('sub2_planned_date'), inputType: 'date', group: 'Sub2' },
    { field: 'sub2_submission_date', label: getLabel('sub2_submission_date'), inputType: 'date', group: 'Sub2' },
    { field: 'sub2_approval_date', label: getLabel('sub2_approval_date'), inputType: 'date', group: 'Sub2' },
    { field: 'sub3_planned_date', label: getLabel('sub3_planned_date'), inputType: 'date', group: 'Sub3' },
    { field: 'sub3_submission_date', label: getLabel('sub3_submission_date'), inputType: 'date', group: 'Sub3' },
    { field: 'sub3_approval_date', label: getLabel('sub3_approval_date'), inputType: 'date', group: 'Sub3' },
    { field: 'revision', label: getLabel('revision'), inputType: 'text', group: 'Notes' },
    { field: 'title', label: getLabel('title'), inputType: 'text', group: 'Notes' },
    { field: 'remarks', label: getLabel('remarks'), inputType: 'text', group: 'Notes' },
    { field: 'transmittal_number', label: getLabel('transmittal_number'), inputType: 'text', group: 'Notes' },
    { field: 'hdec_pic_name', label: getLabel('hdec_pic_name'), inputType: 'text', group: 'Personnel' },
    { field: 'hdec_eng_name', label: getLabel('hdec_eng_name'), inputType: 'text', group: 'Personnel' },
  ], [getLabel, optionFields]);

  const handleBulkApplied = useCallback(({ field, value, ids }: { field: string; value: string | number | boolean | null; ids: string[] }) => {
    setItems((prev) => prev.map((r) => (ids.includes(r.id) ? ({ ...r, [field]: value as any }) : r)));
    setRowSelection({});
  }, []);

  const columnFilterChips = useMemo(() => buildColumnFilterChips(table, columnFilters), [table, columnFilters]);
  const removeColumnFilter = (id: string) => setColumnFilters((prev) => prev.filter((f) => f.id !== id));

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Raw Data — ABD</h1>
          <p className="text-sm text-muted-foreground">As-Built Drawings tracking — submission and approval data.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/docs/import')}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => {
              if (table.getFilteredRowModel().rows.length === 0) {
                toast({ title: 'No rows to export', description: 'Adjust filters and try again.', variant: 'destructive' });
                return;
              }
              setExportFormat('view');
              setExportDialogOpen(true);
            }}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Excel
          </Button>
        </div>
      </div>

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
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => setColumnFilters([])}>Clear all</Button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search drawings... (comma = AND)" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="h-9 pl-8" />
        </div>
        <span className="self-center text-sm text-muted-foreground">{table.getFilteredRowModel().rows.length} drawings</span>
        {sorting.length > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setSorting(DEFAULT_SORTING)}>
            Clear sort ({sorting.length})
          </Button>
        )}
        <span className="hidden self-center text-xs text-muted-foreground md:inline">
          Tip: Shift+Click headers for multi-sort · Click <Filter className="inline h-3 w-3" /> to filter columns
        </span>
      </div>

      <DocsBulkEditBar
        selectedRows={selectedRows}
        fields={bulkFields}
        onApplied={handleBulkApplied}
        onClearSelection={() => setRowSelection({})}
      />

      <DocsRawTableView
        table={table}
        loading={loading}
        sorting={sorting.length ? sorting : DEFAULT_SORTING}
        autoSizeColumn={autoSizeColumn}
        navigate={navigate}
        tableRef={tableRef}
        location={location}
      />

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Drawings</DialogTitle>
            <DialogDescription>Choose how you want to export the currently filtered rows.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">Format</div>
              <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as 'view' | 'reimport')} className="gap-2">
                <div className="flex items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value="view" id="export-format-view" className="mt-0.5" />
                  <label htmlFor="export-format-view" className="flex-1 cursor-pointer">
                    <div className="text-sm font-medium">View export</div>
                    <div className="text-xs text-muted-foreground">Human-friendly format with badges/derived values.</div>
                  </label>
                </div>
                <div className="flex items-start gap-3 rounded-md border p-3">
                  <RadioGroupItem value="reimport" id="export-format-reimport" className="mt-0.5" />
                  <label htmlFor="export-format-reimport" className="flex-1 cursor-pointer">
                    <div className="text-sm font-medium">Re-import ready</div>
                    <div className="text-xs text-muted-foreground">Includes ID columns; derived columns excluded; suitable for editing and re-importing.</div>
                  </label>
                </div>
              </RadioGroup>
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              {table.getFilteredRowModel().rows.length} rows will be exported.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              exportDocsRawToExcel({
                table,
                fieldConfig: fieldConfigRows,
                globalFilter,
                meta: { userName: profile?.name ?? user?.email ?? 'unknown', userType: profile?.user_type ?? 'unknown' },
                format: exportFormat,
              });
              setExportDialogOpen(false);
              toast({ title: 'Export started', description: 'Excel file is being generated.' });
            }}>Download</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Inner virtualized table (mirrors DefectRawTableView)
// ───────────────────────────────────────────────────────────────────────────
function DocsRawTableView({
  table, loading, sorting, autoSizeColumn, navigate, tableRef, location,
}: {
  table: ReturnType<typeof useReactTable<DocsRawRow>>;
  loading: boolean;
  sorting: SortingState;
  autoSizeColumn: (id: string) => void;
  navigate: (to: string) => void;
  tableRef: React.RefObject<HTMLDivElement>;
  location: { search: string };
}) {
  const { value: frozenCountRaw } = useFrozenColumnCount();
  const leafColumns = table.getVisibleLeafColumns();
  const frozenCount = Math.min(Math.max(Number(frozenCountRaw) || 1, 1), leafColumns.length);

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
          ...(isSticky ? { position: 'sticky', left: stickyLefts[index], zIndex: 3, background: 'hsl(var(--background))' } : {}),
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

  const renderRowClass = (row: DocsRawRow, index: number) => cn(
    'cursor-pointer',
    row.is_submitted && 'text-foreground',
    !row.is_submitted && row.risk === 'red' && 'bg-destructive/5',
    hoveredIndex === index && 'bg-muted/50',
  );

  const stickyBgFor = (row: DocsRawRow, index: number): string => {
    const base = 'hsl(var(--background))';
    const opaque = `linear-gradient(${base}, ${base})`;
    if (hoveredIndex === index) return `${opaque}, hsl(var(--muted) / 0.95)`;
    if (!row.is_submitted && row.risk === 'red') return `${opaque}, hsl(var(--destructive) / 0.06)`;
    return base;
  };

  return (
    <div className="flex max-h-[calc(100vh-220px)] flex-col overflow-hidden rounded-md border bg-background">
      <TopHorizontalScrollbar targetRef={tableRef} width={totalWidth} frozenWidth={frozenWidth} />
      <div ref={tableRef} className="min-w-0 flex-1 overflow-auto scrollbar-hide">
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
                <TableCell colSpan={leafColumns.length} className="py-8 text-center text-muted-foreground">No drawings found. Import data to get started.</TableCell>
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
                      onClick={() => navigate(`/docs/${row.original.id}${location.search}`)}
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
                              ...(isSticky ? { position: 'sticky', left: stickyLefts[cellIdx], zIndex: 1, background: stickyBg } : {}),
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
