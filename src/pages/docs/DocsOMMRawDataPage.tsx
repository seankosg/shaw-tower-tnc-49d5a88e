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
import { Download, ExternalLink, Filter, Search, Upload } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import { computeOmmCopyAlert, computeOmmStatus } from '@/lib/docs-omm-status';
import { OmmStatusBadge } from '@/components/docs/OmmStatusBadge';
import { OmmCopyQuantityCell } from '@/components/docs/OmmCopyQuantityCell';
import { OmmCycleProgress } from '@/components/docs/OmmCycleProgress';
import { useDocsFieldConfig } from '@/hooks/useDocsFieldConfig';
import { useCommonMasters, unionWithLegacy } from '@/hooks/useCommonMasters';
import { useFrozenColumnCount } from '@/hooks/useAppSettings';
import { useIsMobile } from '@/hooks/use-mobile';
import { TopHorizontalScrollbar } from '@/components/raw-data/TopHorizontalScrollbar';
import {
  NumberRangeDropdown,
  numberRangeFilterFn,
} from '@/components/raw-data/NumberRangeDropdown';
import { buildColumnFilterChips } from '@/lib/filter-chip-utils';
import {
  OmmBulkActionBar,
  type OmmBulkField,
} from '@/components/raw-data/OmmBulkActionBar';
import { exportOmmToExcel, type OmmExportFormat } from '@/lib/omm-excel-export';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

// ─── Field categorisation ───────────────────────────────────────────────────
const MULTI_SELECT_FIELDS = new Set([
  'category_group',
  'category',
  'team',
  'subcontractor_name',
  'hdec_pic_name',
  'hdec_eng_name',
  'training_required',
  'draft_response_status',
  'final_response_status',
  'current_stage',
  'current_status',
]);
const TEXT_FIELDS = new Set([
  'sn',
  'section',
  'work_trade_material',
  'remarks',
]);
const DATE_FIELDS = new Set([
  'instruction_date',
  'draft_planned_date',
  'draft_actual_date',
  'draft_response_date',
  'final_planned_date',
  'final_actual_date',
  'final_response_planned_date',
  'final_response_actual_date',
]);
const NUMBER_FIELDS = new Set([
  'pdf_required_qty',
  'pdf_actual_qty',
  'hardcopy_required_qty',
  'hardcopy_actual_qty',
]);

// Data fields rendered for each OMM row (system anchors like __select / __open
// and the derived cycle_progress / current_status columns are NOT included here —
// they are pinned by the page itself).
const OMM_DATA_FIELDS = [
  'sn',
  'category_group',
  'team',
  'category',
  'section',
  'work_trade_material',
  'subcontractor_name',
  'hdec_pic_name',
  'hdec_eng_name',
  'training_required',
  'instruction_date',
  'pdf_required_qty',
  'pdf_actual_qty',
  'hardcopy_required_qty',
  'hardcopy_actual_qty',
  'draft_planned_date',
  'draft_actual_date',
  'draft_response_date',
  'draft_response_status',
  'final_planned_date',
  'final_actual_date',
  'final_response_planned_date',
  'final_response_actual_date',
  'final_response_status',
  'current_stage',
  'remarks',
] as const;

const RAW_SEARCH_FIELDS = [
  'sn',
  'section',
  'work_trade_material',
  'subcontractor_name',
  'hdec_pic_name',
  'hdec_eng_name',
  'remarks',
  'category',
  'category_group',
  'team',
] as const;

const EMPTY_TOKEN = '__EMPTY__';
const DEFAULT_SORTING: SortingState = [
  { id: 'category_group', desc: false },
  { id: 'sn', desc: false },
];

interface OMMRow {
  id: string;
  sn: string | null;
  category: string | null;
  category_group: string | null;
  section: string | null;
  work_trade_material: string | null;
  subcontractor_name: string | null;
  team: string | null;
  training_required: string | null;
  pdf_required_qty: number | null;
  pdf_actual_qty: number | null;
  hardcopy_required_qty: number | null;
  hardcopy_actual_qty: number | null;
  instruction_date: string | null;
  draft_planned_date: string | null;
  draft_actual_date: string | null;
  draft_response_date: string | null;
  draft_response_status: string | null;
  final_planned_date: string | null;
  final_actual_date: string | null;
  final_response_planned_date: string | null;
  final_response_actual_date: string | null;
  final_response_status: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  remarks: string | null;
  is_resubmission: boolean;
  resubmission_seq: number;
  parent_id: string | null;
  current_stage: string | null;
  current_status: string | null;
}

// ─── Filter functions ───────────────────────────────────────────────────────
const tokenizeAnd = (text: string): string[] =>
  String(text ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

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

const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
  if (tokenizeAnd(filterValue).length === 0) return true;
  const original = row.original as OMMRow;
  return RAW_SEARCH_FIELDS.some((field) =>
    matchesAllTokens(String((original as any)[field] ?? ''), filterValue),
  );
};

// ─── Header filter dropdowns ────────────────────────────────────────────────
function MultiSelectDropdown({
  column,
  options,
}: {
  column: any;
  options: { value: string; label: string }[];
}) {
  const selected: string[] = (column.getFilterValue() as string[]) ?? [];
  const isActive = selected.length > 0;
  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
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
    selected.forEach((v) => {
      if (v !== EMPTY_TOKEN && !counts.has(v)) counts.set(v, 0);
    });
    options.forEach((o) => {
      if (!counts.has(o.value)) counts.set(o.value, 0);
    });
    const list = [...counts.entries()].map(([value, count]) => ({
      value,
      label: labelMap.get(value) ?? value,
      count,
    }));
    list.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
    );
    return [{ value: EMPTY_TOKEN, label: '(Empty)', count: emptyCount }, ...list];
  }, [facets, options, labelMap, selected]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80',
            isActive ? 'text-primary' : 'text-muted-foreground/50',
          )}
          onClick={(event) => event.stopPropagation()}
          title="Filter"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-72 w-56 overflow-auto p-2"
        align="start"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2 px-1">
          <button
            className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => column.setFilterValue(items.map((o) => o.value))}
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
        {items.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50',
              option.count === 0 &&
                !selected.includes(option.value) &&
                'text-muted-foreground/60',
            )}
          >
            <Checkbox
              checked={selected.includes(option.value)}
              onCheckedChange={() => toggle(option.value)}
              className="h-3.5 w-3.5"
            />
            <span className="flex-1 truncate">{option.label}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {option.count}
            </span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function TextFilterDropdown({ column }: { column: any }) {
  const filterValue = column.getFilterValue() as
    | { text?: string; emptyOnly?: boolean }
    | string
    | undefined;
  const text = typeof filterValue === 'string' ? filterValue : filterValue?.text ?? '';
  const emptyOnly =
    typeof filterValue === 'object' ? filterValue?.emptyOnly ?? false : false;
  const isActive = !!(text || emptyOnly);
  const update = (patch: Partial<{ text: string; emptyOnly: boolean }>) => {
    const current =
      typeof filterValue === 'string'
        ? { text: filterValue, emptyOnly: false }
        : filterValue ?? { text: '', emptyOnly: false };
    const next = { ...current, ...patch };
    column.setFilterValue(next.text || next.emptyOnly ? next : undefined);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80',
            isActive ? 'text-primary' : 'text-muted-foreground/50',
          )}
          onClick={(event) => event.stopPropagation()}
          title="Filter"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-52 space-y-2 p-3"
        align="start"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-1">
          <button
            className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => column.setFilterValue(undefined)}
          >
            Clear
          </button>
        </div>
        <Input
          placeholder="Search... (use , for AND)"
          value={text}
          onChange={(event) => update({ text: event.target.value || undefined })}
          className="h-7 text-xs"
          disabled={emptyOnly}
        />
        <p className="text-[10px] text-muted-foreground">
          Tip: comma = AND (e.g. <code>slab, rebar</code>)
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={emptyOnly}
            onCheckedChange={(checked) =>
              update({ emptyOnly: !!checked, text: undefined })
            }
            className="h-3.5 w-3.5"
          />
          Empty only
        </label>
      </PopoverContent>
    </Popover>
  );
}

function DateRangeDropdown({ column }: { column: any }) {
  const filterValue = column.getFilterValue() as
    | { from?: string; to?: string; emptyOnly?: boolean }
    | undefined;
  const isActive = !!(filterValue?.from || filterValue?.to || filterValue?.emptyOnly);
  const update = (patch: Partial<{ from: string; to: string; emptyOnly: boolean }>) => {
    const next = { ...(filterValue ?? {}), ...patch };
    column.setFilterValue(
      next.from || next.to || next.emptyOnly ? next : undefined,
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80',
            isActive ? 'text-primary' : 'text-muted-foreground/50',
          )}
          onClick={(event) => event.stopPropagation()}
          title="Filter"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 space-y-2 p-3"
        align="start"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">From</label>
          <Input
            type="date"
            value={filterValue?.from ?? ''}
            onChange={(event) => update({ from: event.target.value || undefined })}
            className="h-7 text-xs"
            disabled={!!filterValue?.emptyOnly}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">To</label>
          <Input
            type="date"
            value={filterValue?.to ?? ''}
            onChange={(event) => update({ to: event.target.value || undefined })}
            className="h-7 text-xs"
            disabled={!!filterValue?.emptyOnly}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs">
          <Checkbox
            checked={!!filterValue?.emptyOnly}
            onCheckedChange={(checked) =>
              update({ emptyOnly: !!checked, from: undefined, to: undefined })
            }
            className="h-3.5 w-3.5"
          />
          Empty only
        </label>
        <button
          className="text-[11px] text-muted-foreground hover:underline"
          onClick={() => column.setFilterValue(undefined)}
        >
          Clear
        </button>
      </PopoverContent>
    </Popover>
  );
}

function ColumnFilterDropdown({ column }: { column: any }) {
  const meta = column.columnDef.meta as any;
  if (meta?.filterType === 'multi-select')
    return <MultiSelectDropdown column={column} options={meta.filterOptions ?? []} />;
  if (meta?.filterType === 'date-range') return <DateRangeDropdown column={column} />;
  if (meta?.filterType === 'number-range') return <NumberRangeDropdown column={column} />;
  return <TextFilterDropdown column={column} />;
}

// ────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────
export default function DocsOMMRawDataPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth() as any;
  const { fields: fieldConfigRows, isFieldVisible, getLabel, sortFieldNames } = useDocsFieldConfig('omm');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<OmmExportFormat>('view');
  const storageKey = user?.id
    ? `omm-raw-data-state:${user.id}`
    : 'omm-raw-data-state:anon';

  const [rows, setRows] = useState<OMMRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateLoaded, setStateLoaded] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [mismatchOnly, setMismatchOnly] = useState(false);
  const [resubFilter, setResubFilter] = useState<'all' | 'only' | 'hide'>('all');

  const tableRef = useRef<HTMLDivElement>(null);

  // ── Data load (paged) ─────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true);
    let all: OMMRow[] = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await (supabase as any)
        .from('docs_omm')
        .select('*')
        .eq('is_active', true)
        .order('category_group', { ascending: true, nullsFirst: false })
        .order('sn', { ascending: true })
        .order('resubmission_seq', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
        break;
      }
      if (data?.length) {
        all = all.concat(data as OMMRow[]);
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }
    setRows(all);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── State persistence (localStorage) ──────────────────────────────────────
  useEffect(() => {
    setStateLoaded(false);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSorting(
          Array.isArray(parsed.sorting) && parsed.sorting.length
            ? parsed.sorting
            : DEFAULT_SORTING,
        );
        setColumnFilters(Array.isArray(parsed.columnFilters) ? parsed.columnFilters : []);
        setColumnSizing(
          parsed.columnSizing && typeof parsed.columnSizing === 'object'
            ? parsed.columnSizing
            : {},
        );
        if (typeof parsed.globalFilter === 'string') {
          setGlobalFilter(parsed.globalFilter);
          setSearchInput(parsed.globalFilter);
        }
        if (parsed.mismatchOnly) setMismatchOnly(true);
        if (parsed.resubFilter === 'only' || parsed.resubFilter === 'hide')
          setResubFilter(parsed.resubFilter);
      }
    } catch {
      /* ignore */
    }
    // URL takes precedence
    const urlQ = searchParams.get('q');
    if (urlQ != null) {
      setGlobalFilter(urlQ);
      setSearchInput(urlQ);
    }
    if (searchParams.get('mismatch') === '1') setMismatchOnly(true);
    const resub = searchParams.get('resub');
    if (resub === 'only' || resub === 'hide') setResubFilter(resub);
    setStateLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!stateLoaded) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            sorting,
            columnFilters,
            columnSizing,
            globalFilter,
            mismatchOnly,
            resubFilter,
          }),
        );
      } catch {
        /* ignore quota */
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [
    stateLoaded,
    storageKey,
    sorting,
    columnFilters,
    columnSizing,
    globalFilter,
    mismatchOnly,
    resubFilter,
  ]);

  // Debounced global search
  useEffect(() => {
    const t = window.setTimeout(() => setGlobalFilter(searchInput), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // ── Filtered base data (mismatch / resub toggles) ─────────────────────────
  const filteredBaseData = useMemo(() => {
    let next = rows;
    if (mismatchOnly) next = next.filter((r) => computeOmmCopyAlert(r).hasMismatch);
    if (resubFilter === 'only') next = next.filter((r) => r.is_resubmission);
    else if (resubFilter === 'hide') next = next.filter((r) => !r.is_resubmission);
    return next;
  }, [rows, mismatchOnly, resubFilter]);

  // ── Option fields for multi-select filters ────────────────────────────────
  const masters = useCommonMasters();
  const optionFields = useMemo(() => {
    const opts = (field: keyof OMMRow) =>
      [...new Set(rows.map((r) => r[field]).filter((v): v is string => Boolean(v)))]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v }));
    const present = (field: keyof OMMRow) =>
      rows.map((r) => r[field] as unknown as string | null | undefined);
    return {
      category_group: opts('category_group'),
      category: opts('category'),
      team: unionWithLegacy(masters.teamOptions, present('team')),
      subcontractor_name: unionWithLegacy(masters.subcontractorOptions, present('subcontractor_name')),
      hdec_pic_name: unionWithLegacy(masters.hdecPicOptions, present('hdec_pic_name')),
      hdec_eng_name: unionWithLegacy(masters.hdecEngOptions, present('hdec_eng_name')),
      training_required: opts('training_required'),
      draft_response_status: [
        { value: 'A', label: 'A' },
        { value: 'B', label: 'B' },
        { value: 'C', label: 'C' },
      ],
      final_response_status: [
        { value: 'A', label: 'A' },
        { value: 'B', label: 'B' },
        { value: 'C', label: 'C' },
      ],
      current_stage: opts('current_stage'),
      current_status: opts('current_status'),
    };
  }, [rows, masters.teamOptions, masters.subcontractorOptions, masters.hdecPicOptions, masters.hdecEngOptions]);

  // ── Column definitions ────────────────────────────────────────────────────
  const updateField = useCallback(
    async (id: string, field: keyof OMMRow, value: any) => {
      const { error } = await (supabase as any)
        .from('docs_omm')
        .update({ [field]: value, updated_by: user?.id ?? null })
        .eq('id', id);
      if (error) {
        toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Saved', description: `${String(field)} updated` });
      reload();
    },
    [user, toast, reload],
  );

  const columns = useMemo<ColumnDef<OMMRow>[]>(() => {
    const sizeByField: Record<string, number> = {
      sn: 90,
      category_group: 150,
      category: 130,
      section: 110,
      work_trade_material: 260,
      team: 90,
      subcontractor_name: 150,
      hdec_pic_name: 130,
      hdec_eng_name: 130,
      training_required: 120,
      pdf_required_qty: 80,
      pdf_actual_qty: 80,
      hardcopy_required_qty: 80,
      hardcopy_actual_qty: 80,
      draft_planned_date: 110,
      draft_actual_date: 110,
      draft_response_date: 110,
      draft_response_status: 90,
      final_planned_date: 110,
      final_actual_date: 110,
      final_response_planned_date: 120,
      final_response_actual_date: 120,
      final_response_status: 90,
      instruction_date: 110,
      remarks: 220,
      cycle_progress: 110,
      current_status: 150,
    };

    const selectColumn: ColumnDef<OMMRow> = {
      id: '__select',
      size: 36,
      enableSorting: false,
      enableColumnFilter: false,
      enableResizing: false,
      header: ({ table: t }) => (
        <span
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center"
        >
          <Checkbox
            checked={
              t.getIsAllRowsSelected()
                ? true
                : t.getIsSomeRowsSelected()
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(c) => t.toggleAllRowsSelected(!!c)}
            className="h-3.5 w-3.5"
          />
        </span>
      ),
      cell: ({ row }) => (
        <span
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center"
        >
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(c) => row.toggleSelected(!!c)}
            className="h-3.5 w-3.5"
          />
        </span>
      ),
    };

    const OMM_PROGRESS_OPTIONS = [
      { value: 'Pending Draft', label: 'Pending Draft' },
      { value: 'Draft Under Review', label: 'Draft Under Review' },
      { value: 'Pending Final Submission', label: 'Pending Final Submission' },
      { value: 'Final Under Review', label: 'Final Under Review' },
      { value: 'Approved', label: 'Approved' },
      { value: 'Rejected', label: 'Rejected' },
    ];

    const cycleColumn: ColumnDef<OMMRow> = {
      id: 'cycle_progress',
      header: 'Cycle',
      size: 110,
      enableSorting: false,
      enableColumnFilter: true,
      accessorFn: (r) => computeOmmStatus(r),
      filterFn: multiSelectFilterFn,
      meta: {
        filterType: 'multi-select',
        filterOptions: OMM_PROGRESS_OPTIONS,
      },
      cell: ({ row }) => <OmmCycleProgress row={row.original} />,
    };

    const statusColumn: ColumnDef<OMMRow> = {
      id: 'current_status',
      header: 'Status',
      size: 150,
      enableColumnFilter: true,
      filterFn: multiSelectFilterFn,
      meta: {
        filterType: 'multi-select',
        filterOptions: optionFields.current_status,
      },
      accessorFn: (r) => computeOmmStatus(r),
      cell: ({ row }) => <OmmStatusBadge row={row.original} />,
    };

    const openColumn: ColumnDef<OMMRow> = {
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
            navigate(`/docs/omm/${row.original.id}`);
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      ),
    };

    // Build a column for each known data field (Field Config drives order/visibility separately)
    const dataFields = OMM_DATA_FIELDS as readonly string[];

    const dataColumns: ColumnDef<OMMRow>[] = dataFields.map((field) => {
      const isMulti = MULTI_SELECT_FIELDS.has(field);
      const isText = TEXT_FIELDS.has(field);
      const isDate = DATE_FIELDS.has(field);
      const isNum = NUMBER_FIELDS.has(field);
      const filterType = isDate
        ? 'date-range'
        : isNum
          ? 'number-range'
          : isMulti
            ? 'multi-select'
            : 'text';
      const filterFn = isDate
        ? dateRangeFilterFn
        : isNum
          ? numberRangeFilterFn
          : isMulti
            ? multiSelectFilterFn
            : textFilterFn;

      return {
        accessorKey: field,
        id: field,
        header: getLabel(field) || field,
        size: sizeByField[field] ?? 130,
        filterFn,
        meta: {
          filterType,
          filterOptions: (optionFields as any)[field] ?? [],
          label: getLabel(field) || field,
        },
        cell: ({ row, getValue }) => {
          const value = getValue() as any;
          const r = row.original;

          if (field === 'sn') {
            const isResub = r.is_resubmission;
            return (
              <span
                className={cn(
                  'font-mono text-xs',
                  isResub && 'text-muted-foreground',
                )}
              >
                {isResub && <span className="mr-1">↳</span>}
                {value ?? '—'}
                {isResub && r.resubmission_seq > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    R{r.resubmission_seq}
                  </span>
                )}
              </span>
            );
          }
          if (field === 'pdf_actual_qty') {
            return (
              <OmmCopyQuantityCell
                required={r.pdf_required_qty}
                actual={r.pdf_actual_qty}
              />
            );
          }
          if (field === 'hardcopy_actual_qty') {
            return (
              <OmmCopyQuantityCell
                required={r.hardcopy_required_qty}
                actual={r.hardcopy_actual_qty}
              />
            );
          }
          if (field === 'draft_response_status') {
            return (
              <ResponseStatusEditor
                value={r.draft_response_status}
                onChange={(v) => updateField(r.id, 'draft_response_status', v)}
              />
            );
          }
          if (field === 'final_response_status') {
            return (
              <ResponseStatusEditor
                value={r.final_response_status}
                onChange={(v) => updateField(r.id, 'final_response_status', v)}
                disabled={r.draft_response_status !== 'A'}
              />
            );
          }
          if (isDate) return formatDdMmm(value ? String(value).slice(0, 10) : null);
          if (isNum) return value == null ? '—' : <span className="tabular-nums">{value}</span>;
          if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
          if (field === 'work_trade_material' || field === 'remarks') {
            return (
              <span className="block truncate" title={String(value)}>
                {String(value)}
              </span>
            );
          }
          return <span className="truncate">{String(value)}</span>;
        },
      };
    });

    return [selectColumn, cycleColumn, ...dataColumns, statusColumn, openColumn];
  }, [getLabel, optionFields, navigate, updateField]);

  // ── Visibility from Field Config (always show anchors) ────────────────────
  const ALWAYS_VISIBLE = new Set([
    '__select',
    '__open',
    'sn',
    'cycle_progress',
    'current_status',
    'pdf_actual_qty',
    'hardcopy_actual_qty',
  ]);

  const columnVisibility = useMemo<VisibilityState>(() => {
    const v: VisibilityState = {};
    // Anchors always on
    for (const id of ALWAYS_VISIBLE) v[id] = true;
    // Data fields follow Field Config (is_enabled)
    for (const id of OMM_DATA_FIELDS) {
      if (ALWAYS_VISIBLE.has(id)) continue;
      v[id] = isFieldVisible(id);
    }
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFieldVisible]);

  // Column order driven by Field Config sort_order, with fixed pinned/trailing anchors
  const columnOrder = useMemo(() => {
    const PINNED = ['__select', 'cycle_progress', 'sn'];
    const TRAILING = ['current_status', '__open'];
    const remaining = (OMM_DATA_FIELDS as readonly string[]).filter(
      (f) => !PINNED.includes(f) && !TRAILING.includes(f),
    );
    return [...PINNED, ...sortFieldNames(remaining), ...TRAILING];
  }, [sortFieldNames]);

  // ── Table ─────────────────────────────────────────────────────────────────
  const table = useReactTable({
    data: filteredBaseData,
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
  }, [columnFilters, globalFilter, mismatchOnly, resubFilter]);

  const selectedRows = useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowSelection, filteredBaseData],
  );

  // ── Bulk fields ───────────────────────────────────────────────────────────
  const bulkFields = useMemo<OmmBulkField[]>(() => {
    const opts = (k: keyof typeof optionFields) => (optionFields as any)[k] ?? [];
    return [
      { field: 'category_group', label: getLabel('category_group') || 'Category', inputType: 'select', group: 'Classification', options: opts('category_group') },
      { field: 'category', label: getLabel('category') || 'Sub-category', inputType: 'select', group: 'Classification', options: opts('category') },
      { field: 'team', label: getLabel('team') || 'Team', inputType: 'select', group: 'Classification', options: opts('team') },
      { field: 'training_required', label: 'Training Required', inputType: 'select', group: 'Classification', options: opts('training_required') },
      { field: 'subcontractor_name', label: getLabel('subcontractor_name') || 'Subcontractor', inputType: 'select', group: 'Assignment', options: opts('subcontractor_name') },
      { field: 'hdec_pic_name', label: 'HDEC PIC', inputType: 'select', group: 'Assignment', options: opts('hdec_pic_name') },
      { field: 'hdec_eng_name', label: 'HDEC ENG', inputType: 'select', group: 'Assignment', options: opts('hdec_eng_name') },
      { field: 'pdf_required_qty', label: 'PDF Required', inputType: 'number', group: 'Quantities' },
      { field: 'pdf_actual_qty', label: 'PDF Actual', inputType: 'number', group: 'Quantities' },
      { field: 'hardcopy_required_qty', label: 'HC Required', inputType: 'number', group: 'Quantities' },
      { field: 'hardcopy_actual_qty', label: 'HC Actual', inputType: 'number', group: 'Quantities' },
      { field: 'instruction_date', label: 'Instruction Date', inputType: 'date', group: 'Schedule' },
      { field: 'draft_planned_date', label: 'Draft Planned', inputType: 'date', group: 'Schedule' },
      { field: 'draft_actual_date', label: 'Draft Actual', inputType: 'date', group: 'Schedule' },
      { field: 'draft_response_date', label: 'Draft Response Date', inputType: 'date', group: 'Schedule' },
      { field: 'final_planned_date', label: 'Final Planned', inputType: 'date', group: 'Schedule' },
      { field: 'final_actual_date', label: 'Final Actual', inputType: 'date', group: 'Schedule' },
      { field: 'final_response_planned_date', label: 'Final Response Planned', inputType: 'date', group: 'Schedule' },
      { field: 'final_response_actual_date', label: 'Final Response Actual', inputType: 'date', group: 'Schedule' },
      {
        field: 'draft_response_status',
        label: 'Draft Response (A/B/C)',
        inputType: 'select',
        group: 'Response',
        options: [
          { value: 'A', label: 'A — Approved' },
          { value: 'B', label: 'B — Rejected' },
          { value: 'C', label: 'C — Rejected (major)' },
        ],
        warning:
          'Setting B/C will trigger automatic resubmission rows for every selected item.',
      },
      {
        field: 'final_response_status',
        label: 'Final Response (A/B/C)',
        inputType: 'select',
        group: 'Response',
        options: [
          { value: 'A', label: 'A — Approved' },
          { value: 'B', label: 'B — Rejected' },
          { value: 'C', label: 'C — Rejected (major)' },
        ],
        warning:
          'Setting B/C will trigger automatic resubmission rows for every selected item.',
      },
      { field: 'remarks', label: 'Remarks', inputType: 'text', group: 'Notes' },
    ];
  }, [getLabel, optionFields]);

  // ── Filter chips ──────────────────────────────────────────────────────────
  const columnFilterChips = useMemo(
    () => buildColumnFilterChips(table, columnFilters),
    [table, columnFilters],
  );
  const removeColumnFilter = (id: string) =>
    setColumnFilters((prev) => prev.filter((f) => f.id !== id));

  // ── URL sync (q only — rest stays in localStorage) ────────────────────────
  useEffect(() => {
    if (!stateLoaded) return;
    const next = new URLSearchParams(searchParams);
    if (globalFilter) next.set('q', globalFilter);
    else next.delete('q');
    if (mismatchOnly) next.set('mismatch', '1');
    else next.delete('mismatch');
    if (resubFilter !== 'all') next.set('resub', resubFilter);
    else next.delete('resub');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalFilter, mismatchOnly, resubFilter, stateLoaded]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const mismatchCount = useMemo(
    () => rows.filter((r) => computeOmmCopyAlert(r).hasMismatch).length,
    [rows],
  );
  const resubCount = useMemo(() => rows.filter((r) => r.is_resubmission).length, [rows]);

  // ── Export (current view, single .xlsx) ───────────────────────────────────
  const handleExport = useCallback(() => {
    const sorted = table.getSortedRowModel().rows;
    if (sorted.length === 0) {
      toast({
        title: 'No rows to export',
        description: 'Adjust filters and try again.',
        variant: 'destructive',
      });
      return;
    }
    const visibleCols = table
      .getVisibleLeafColumns()
      .filter((c) => c.id !== '__select' && c.id !== '__open' && c.id !== 'cycle_progress');
    const headers = visibleCols.map((c) => {
      const meta = c.columnDef.meta as any;
      return meta?.label ?? (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id);
    });
    const aoa: unknown[][] = [headers];
    for (const r of sorted) {
      aoa.push(
        visibleCols.map((c) => {
          const v = (r.original as any)[c.id];
          if (c.id === 'current_status') return computeOmmStatus(r.original);
          if (v == null) return '';
          if (DATE_FIELDS.has(c.id)) return String(v).slice(0, 10);
          return v;
        }),
      );
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'OMM');
    XLSX.writeFile(wb, `omm-raw-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: 'Export complete', description: `${sorted.length} rows exported.` });
  }, [table, toast]);

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">OMM Manuals — Raw Data</h1>
          <p className="text-sm text-muted-foreground">
            Operation &amp; Maintenance Manual list, lifecycle status &amp; copy quantities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {table.getFilteredRowModel().rows.length} / {rows.length} rows
          </Badge>
          {mismatchCount > 0 && (
            <Badge variant="outline" className="border-rose-300 text-rose-700">
              {mismatchCount} copy mismatch{mismatchCount === 1 ? '' : 'es'}
            </Badge>
          )}
          {resubCount > 0 && (
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              {resubCount} resubmission{resubCount === 1 ? '' : 's'}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/docs/import?sub=omm')}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Excel
          </Button>
        </div>
      </div>

      {/* Active filter chips */}
      {columnFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            Active column filters:
          </span>
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
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 text-xs"
            onClick={() => setColumnFilters([])}
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search OMM... (comma = AND)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="mismatch-only"
            checked={mismatchOnly}
            onCheckedChange={setMismatchOnly}
          />
          <Label htmlFor="mismatch-only" className="cursor-pointer text-xs">
            Copy mismatch only
          </Label>
        </div>
        <Select value={resubFilter} onValueChange={(v) => setResubFilter(v as any)}>
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rows</SelectItem>
            <SelectItem value="only">Resubmissions only</SelectItem>
            <SelectItem value="hide">Hide resubmissions</SelectItem>
          </SelectContent>
        </Select>
        {sorting.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => setSorting(DEFAULT_SORTING)}
          >
            Clear sort ({sorting.length})
          </Button>
        )}
        <span className="hidden self-center text-xs text-muted-foreground md:inline">
          Tip: Shift+Click headers for multi-sort · Click{' '}
          <Filter className="inline h-3 w-3" /> to filter columns
        </span>
      </div>

      {/* Bulk action bar (sticky) */}
      <OmmBulkActionBar
        selectedRows={selectedRows}
        fields={bulkFields}
        onApplied={({ field, value, ids }) => {
          // Optimistic local update
          setRows((prev) =>
            prev.map((r) =>
              ids.includes(r.id) ? ({ ...r, [field]: value as any } as OMMRow) : r,
            ),
          );
          setRowSelection({});
        }}
        onMutated={() => reload()}
        onClearSelection={() => setRowSelection({})}
      />

      {/* Table */}
      <OmmRawTableView
        table={table}
        loading={loading}
        sorting={sorting.length ? sorting : DEFAULT_SORTING}
        navigate={navigate}
        tableRef={tableRef}
      />
    </div>
  );
}

// ─── Inline editor for response status ─────────────────────────────────────
function ResponseStatusEditor({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value ?? '__none__'}
      onValueChange={(v) => onChange(v === '__none__' ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger
        className="h-7 w-[70px] text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">—</SelectItem>
        <SelectItem value="A">A</SelectItem>
        <SelectItem value="B">B</SelectItem>
        <SelectItem value="C">C</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ─── Virtualised table view with sticky frozen columns ─────────────────────
interface ViewProps {
  table: ReturnType<typeof useReactTable<OMMRow>>;
  loading: boolean;
  sorting: SortingState;
  navigate: (path: string) => void;
  tableRef: React.RefObject<HTMLDivElement>;
}

function OmmRawTableView({ table, loading, sorting, navigate, tableRef }: ViewProps) {
  const isMobile = useIsMobile();
  const { value: frozenSetting } = useFrozenColumnCount();
  const userFrozenCount = isMobile
    ? 1
    : Math.min(Math.max(Number(frozenSetting) || 1, 1), 4);
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
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;
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
          'relative h-9 cursor-pointer select-none whitespace-nowrap border-b bg-background px-3 py-0 text-left text-xs font-medium',
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
            <span
              className="flex-shrink-0"
              onClick={(event) => event.stopPropagation()}
            >
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

  const stickyBgFor = (row: OMMRow, index: number): string => {
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
                <TableCell
                  colSpan={leafColumns.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={leafColumns.length}
                  className="py-8 text-center text-muted-foreground"
                >
                  No OMM records. Use the Import page to upload.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr style={{ height: paddingTop }} aria-hidden>
                    <td
                      colSpan={leafColumns.length}
                      style={{ padding: 0, border: 0 }}
                    />
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
                      onClick={() => navigate(`/docs/omm/${row.original.id}`)}
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
                              'truncate whitespace-nowrap px-3 py-2 text-xs',
                              isLastSticky &&
                                'shadow-[2px_0_4px_-2px_hsl(var(--border))]',
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
                    <td
                      colSpan={leafColumns.length}
                      style={{ padding: 0, border: 0 }}
                    />
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
