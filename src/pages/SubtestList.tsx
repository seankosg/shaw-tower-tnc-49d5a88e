import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  flexRender, type ColumnDef, type SortingState, type ColumnFiltersState,
  type ColumnSizingState, type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataSourceTag } from '@/components/shared/DataSourceTag';
import { StageProgress, StageProgressLegend } from '@/components/shared/StageProgress';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Upload, Download, ChevronDown } from 'lucide-react';
import type { TcStatus, DataSource } from '@/types/enums';
import { TC_STATUS_OPTIONS, DATA_SOURCE_LABELS } from '@/types/enums';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import { getSubtestCache, setSubtestCache } from '@/lib/subtest-cache';

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
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  data_source_type: DataSource | null;
  updated_at: string;
  system_code: string;
}

const multiSelectFilterFn = (row: any, columnId: string, filterValue: string[]) => {
  if (!filterValue || filterValue.length === 0) return true;
  const val = row.getValue(columnId);
  return filterValue.includes(val);
};

const textFilterFn = (row: any, columnId: string, filterValue: string) => {
  if (!filterValue) return true;
  const val = row.getValue(columnId);
  if (val == null) return false;
  return String(val).toLowerCase().includes(filterValue.toLowerCase());
};

function MultiSelectFilter({ column, options }: {
  column: any;
  options: { value: string; label: string }[];
}) {
  const selected: string[] = (column.getFilterValue() as string[]) ?? [];

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value];
    column.setFilterValue(next.length ? next : undefined);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-[11px] w-full min-w-0 border-muted justify-between font-normal">
          <span className="truncate">
            {selected.length === 0 ? 'All' : `${selected.length} selected`}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2 max-h-60 overflow-auto" align="start">
        <button
          className="text-[11px] text-muted-foreground hover:underline mb-1 px-1"
          onClick={() => column.setFilterValue(undefined)}
        >
          Clear all
        </button>
        {options.map(o => (
          <label key={o.value} className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer hover:bg-muted/50 rounded">
            <Checkbox
              checked={selected.includes(o.value)}
              onCheckedChange={() => toggle(o.value)}
              className="h-3.5 w-3.5"
            />
            {o.label}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ColumnFilter({ column, type, options }: {
  column: any;
  type: 'text' | 'multi-select';
  options?: { value: string; label: string }[];
}) {
  if (type === 'multi-select' && options) {
    return <MultiSelectFilter column={column} options={options} />;
  }
  return (
    <Input
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder="Filter..."
      className="h-7 text-[11px] w-full min-w-0 border-muted"
    />
  );
}

const DEFAULT_SORTING: SortingState = [{ id: 'item_no', desc: false }];

export default function SubtestList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = user?.id ? `subtest-list-state:${user.id}` : 'subtest-list-state:anon';
  const { isFieldVisible, orderedFieldNames } = useFieldConfig();

  const [data, setData] = useState<SubtestRow[]>(() => {
    const c = getSubtestCache();
    return c.data ?? [];
  });
  const [loading, setLoading] = useState(() => getSubtestCache().data === null);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  // Debounced filter: searchInput is what the user types; globalFilter is what react-table sees
  const [searchInput, setSearchInput] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [systems, setSystems] = useState<{ id: string; system_code: string }[]>([]);
  // status URL filter (overdue / at_risk) — applied client-side
  const urlStatusFilter = searchParams.get('status'); // 'overdue' | 'at_risk' | null
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

  // Load persisted state when user/storageKey changes; URL params override per-column filters
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
        baseSorting = Array.isArray(parsed.sorting) && parsed.sorting.length ? parsed.sorting : DEFAULT_SORTING;
        baseFilters = Array.isArray(parsed.columnFilters) ? parsed.columnFilters : [];
        baseGlobal = typeof parsed.globalFilter === 'string' ? parsed.globalFilter : '';
        baseSizing = parsed.columnSizing && typeof parsed.columnSizing === 'object' ? parsed.columnSizing : {};
      }
    } catch {
      // ignore
    }

    // URL-driven filters take precedence (replace any prior filter on these columns)
    const urlMap: Record<string, string> = {
      system: 'system_code',
      subcon: 'subcontractor_name',
      subsub: 'subsub_name',
      hdec_pic: 'hdec_pic_name',
      t1_status: 't1_status',
      t2_status: 't2_status',
    };
    const next = baseFilters.filter(f => !Object.values(urlMap).includes(f.id));
    for (const [param, col] of Object.entries(urlMap)) {
      const v = searchParams.get(param);
      if (v) {
        // multi-select columns expect string[]
        if (col === 'system_code' || col === 't1_status' || col === 't2_status') {
          next.push({ id: col, value: [v] });
        } else {
          next.push({ id: col, value: v });
        }
      }
    }
    setSorting(baseSorting);
    setColumnFilters(next);
    setGlobalFilter(baseGlobal);
    setSearchInput(baseGlobal);
    setColumnSizing(baseSizing);
    setStateLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, searchParams]);

  // Debounce: searchInput → globalFilter (300ms). Prevents re-filter on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setGlobalFilter(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Persist on change (only after initial load to avoid overwriting). Debounced 500ms so
  // column resize drag does not stringify on every pixel.
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
    fetchData();
    fetchSystems();
  }, []);

  const fetchSystems = async () => {
    const { data } = await supabase.from('system_master').select('id, system_code').eq('is_active', true);
    if (data) setSystems(data);
  };

  const fetchData = async () => {
    // If cache present, render immediately and refresh in background.
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
        .select('id, subtest_id, item_no, mos_code, level, equipment, description, t1_planned_date, t1_actual_date, t1_status, t2_planned_date, t2_actual_date, t2_status, predecessor_status_raw, subcontractor_name, subsub_name, hdec_pic_name, data_source_type, updated_at, system_id, system_master!inner(system_code)')
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

  const isDelayed = (planned: string | null, actual: string | null) => {
    if (!planned || !actual) return false;
    return new Date(actual) > new Date(planned);
  };

  const systemOptions = useMemo(() =>
    systems.map(s => ({ value: s.system_code, label: s.system_code })),
    [systems]
  );

  const statusOptions = useMemo(() =>
    TC_STATUS_OPTIONS.map(s => ({ value: s, label: s })),
    []
  );

  const sourceOptions = useMemo(() =>
    Object.entries(DATA_SOURCE_LABELS).map(([k, v]) => ({ value: k, label: v })),
    []
  );

  const columns = useMemo<ColumnDef<SubtestRow>[]>(() => [
    { accessorKey: 'item_no', header: 'Item No', size: 100, filterFn: textFilterFn },
    {
      id: 'stage_progress',
      header: 'Progress',
      size: 110,
      enableColumnFilter: false,
      enableSorting: true,
      // Sort by stage completion score: pred(1) + t1Done(2) + t2Done(4) so T2-done rows last (asc) or first (desc)
      accessorFn: (r) => {
        const t1Done = r.t1_status === 'Done';
        const t2Done = r.t2_status === 'Done';
        const t1Started = r.t1_status === 'WIP' || t1Done;
        const predDone = t1Started || (r.predecessor_status_raw
          ? /done|완료|cleared|clear|^ok$|complete|closed|^y(es)?$/i.test(r.predecessor_status_raw)
          : false);
        return (predDone ? 1 : 0) + (t1Done ? 2 : 0) + (t2Done ? 4 : 0);
      },
      cell: ({ row }) => (
        <StageProgress
          predecessorRaw={row.original.predecessor_status_raw}
          t1Status={row.original.t1_status}
          t1ActualDate={row.original.t1_actual_date}
          t2Status={row.original.t2_status}
          t2ActualDate={row.original.t2_actual_date}
        />
      ),
    },
    { accessorKey: 'system_code', header: 'System', size: 100, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select' as const, filterOptions: systemOptions } },
    { accessorKey: 'equipment', header: 'Equipment', size: 120, filterFn: textFilterFn,
      cell: ({ getValue }) => (
        <span className="truncate block max-w-[120px]">{getValue() as string || '—'}</span>
      )},
    { accessorKey: 'subtest_id', header: 'Subtest ID', size: 160, filterFn: textFilterFn },
    { accessorKey: 'mos_code', header: 'MOS Code', size: 100, filterFn: textFilterFn },
    { accessorKey: 'description', header: 'Description', size: 200, filterFn: textFilterFn,
      cell: ({ getValue }) => (
        <span className="truncate block max-w-[200px]">{getValue() as string || '—'}</span>
      )},
    { accessorKey: 'predecessor_status_raw', header: 'Predecessor', size: 110, filterFn: textFilterFn },
    { accessorKey: 't1_planned_date', header: 'T1 Planned', size: 100, enableColumnFilter: false,
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 't1_actual_date', header: 'T1 Actual', size: 100, enableColumnFilter: false,
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
      meta: { filterType: 'multi-select' as const, filterOptions: statusOptions },
      cell: ({ getValue }) => <StatusBadge status={getValue() as TcStatus | null} /> },
    { accessorKey: 't2_planned_date', header: 'T2 Planned', size: 100, enableColumnFilter: false,
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 't2_actual_date', header: 'T2 Actual', size: 100, enableColumnFilter: false,
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
      meta: { filterType: 'multi-select' as const, filterOptions: statusOptions },
      cell: ({ getValue }) => <StatusBadge status={getValue() as TcStatus | null} /> },
    { accessorKey: 'subcontractor_name', header: 'Subcontractor', size: 120, filterFn: textFilterFn },
    { accessorKey: 'subsub_name', header: 'Sub-Sub', size: 120, filterFn: textFilterFn },
    { accessorKey: 'hdec_pic_name', header: 'HDEC PIC', size: 110, filterFn: textFilterFn },
    { accessorKey: 'data_source_type', header: 'Source', size: 110, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select' as const, filterOptions: sourceOptions },
      cell: ({ getValue }) => <DataSourceTag source={getValue() as DataSource | null} /> },
    { accessorKey: 'updated_at', header: 'Updated', size: 140, enableColumnFilter: false,
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
  ], [systemOptions, statusOptions, sourceOptions]);

  // Apply status (overdue / at_risk) + date URL filters at data level
  const urlT1PlannedTo = searchParams.get('t1_planned_to');
  const urlT2PlannedTo = searchParams.get('t2_planned_to');
  const urlT1ActualTo = searchParams.get('t1_actual_to');
  const urlT2ActualTo = searchParams.get('t2_actual_to');
  const urlT1PlannedOn = searchParams.get('t1_planned_on');
  const urlT2PlannedOn = searchParams.get('t2_planned_on');
  const urlT1ActualOn = searchParams.get('t1_actual_on');
  const urlT2ActualOn = searchParams.get('t2_actual_on');

  const filteredData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const daysFromToday = (iso: string) => {
      const a = new Date(iso + 'T00:00:00Z').getTime();
      const b = new Date(today + 'T00:00:00Z').getTime();
      return Math.round((a - b) / 86400000);
    };
    return data.filter(r => {
      // status filter
      if (urlStatusFilter) {
        const overdue =
          (r.t1_planned_date && r.t1_planned_date < today && r.t1_status !== 'Done') ||
          (r.t2_planned_date && r.t2_planned_date < today && r.t2_status !== 'Done');
        if (urlStatusFilter === 'overdue' && !overdue) return false;
        if (urlStatusFilter === 'at_risk') {
          if (overdue) return false;
          const within = (planned: string | null, status: TcStatus | null) => {
            if (!planned || status === 'Done') return false;
            const d = daysFromToday(planned);
            return d >= 0 && d <= urlAtRiskDays;
          };
          if (!within(r.t1_planned_date, r.t1_status) && !within(r.t2_planned_date, r.t2_status)) return false;
        }
      }
      // date <= filters
      if (urlT1PlannedTo && !(r.t1_planned_date && r.t1_planned_date <= urlT1PlannedTo)) return false;
      if (urlT2PlannedTo && !(r.t2_planned_date && r.t2_planned_date <= urlT2PlannedTo)) return false;
      if (urlT1ActualTo && !(r.t1_actual_date && r.t1_actual_date <= urlT1ActualTo)) return false;
      if (urlT2ActualTo && !(r.t2_actual_date && r.t2_actual_date <= urlT2ActualTo)) return false;
      // date == filters
      if (urlT1PlannedOn && r.t1_planned_date !== urlT1PlannedOn) return false;
      if (urlT2PlannedOn && r.t2_planned_date !== urlT2PlannedOn) return false;
      if (urlT1ActualOn && r.t1_actual_date !== urlT1ActualOn) return false;
      if (urlT2ActualOn && r.t2_actual_date !== urlT2ActualOn) return false;
      return true;
    });
  }, [data, urlStatusFilter, urlAtRiskDays,
      urlT1PlannedTo, urlT2PlannedTo, urlT1ActualTo, urlT2ActualTo,
      urlT1PlannedOn, urlT2PlannedOn, urlT1ActualOn, urlT2ActualOn]);

  // Map react-table column id → field_config.field_name
  const columnIdToFieldName: Record<string, string> = {
    system_code: 'system',
    // others map by identical key (e.g. item_no, mos_code, t1_status, ...)
  };
  // Reverse map: field_name → react-table column id
  const fieldNameToColumnId: Record<string, string> = { system: 'system_code' };
  const columnVisibility = useMemo<VisibilityState>(() => {
    const visibility: VisibilityState = {};
    for (const col of columns) {
      const id = (col as any).id ?? (col as any).accessorKey;
      if (!id) continue;
      // stage_progress is a synthetic UI column — always show
      if (id === 'stage_progress') continue;
      const fieldName = columnIdToFieldName[id] ?? id;
      visibility[id] = isFieldVisible(fieldName);
    }
    return visibility;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, isFieldVisible]);

  // Compute column order from field_config sort_order.
  // Pinned identity columns stay at the front; stage_progress stays right after item_no.
  const columnOrder = useMemo<string[]>(() => {
    const allIds = columns
      .map(c => (c as any).id ?? (c as any).accessorKey)
      .filter(Boolean) as string[];
    const PINNED_FRONT = ['item_no', 'stage_progress', 'system_code', 'subtest_id', 'mos_code'];
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
    // Append any leftover columns (no config row) at the end, preserving original order.
    for (const id of allIds) {
      if (remaining.has(id)) {
        ordered.push(id);
        remaining.delete(id);
      }
    }
    return [...pinned, ...ordered];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, orderedFieldNames]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter, columnFilters, columnSizing, columnVisibility, columnOrder },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableMultiSort: true,
    enableSortingRemoval: true,
    isMultiSortEvent: (e) => (e as unknown as MouseEvent).shiftKey,
    maxMultiSortColCount: 5,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: { minSize: 60, maxSize: 600 },
  });

  const activeUrlFilters = useMemo(() => {
    const out: { label: string; param: string }[] = [];
    const map: Record<string, string> = {
      system: 'System', subcon: 'Subcon', subsub: 'Sub-Sub',
      hdec_pic: 'HDEC PIC', t1_status: 'T1', t2_status: 'T2', status: 'Status',
      t1_planned_to: 'T1 Plan ≤', t2_planned_to: 'T2 Plan ≤',
      t1_actual_to: 'T1 Actual ≤', t2_actual_to: 'T2 Actual ≤',
      t1_planned_on: 'T1 Plan =', t2_planned_on: 'T2 Plan =',
      t1_actual_on: 'T1 Actual =', t2_actual_on: 'T2 Actual =',
    };
    for (const [k, lbl] of Object.entries(map)) {
      const v = searchParams.get(k);
      if (v) out.push({ label: `${lbl} ${v}`, param: k });
    }
    return out;
  }, [searchParams]);

  const clearUrlFilter = (param: string) => {
    const next = new URLSearchParams(searchParams);
    next.delete(param);
    if (param === 'status') next.delete('at_risk_days');
    setSearchParams(next, { replace: true });
  };
  const clearAllUrlFilters = () => setSearchParams(new URLSearchParams(), { replace: true });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Subtest Master Database</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/import')}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/export')}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {activeUrlFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-xs font-medium text-primary">Filtered from Dashboard:</span>
          {activeUrlFilters.map(f => (
            <button
              key={f.param}
              onClick={() => clearUrlFilter(f.param)}
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
          Tip: Shift+Click headers for multi-sort
        </span>
        {sorting.length > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setSorting([])}>
            Clear sort ({sorting.length})
          </Button>
        )}
        <div className="ml-auto"><StageProgressLegend /></div>
      </div>

      <SubtestTableView
        table={table}
        loading={loading}
        columns={columns}
        sorting={sorting}
        autoSizeColumn={autoSizeColumn}
        isDelayed={isDelayed}
        navigate={navigate}
        tableRef={tableRef}
      />
    </div>
  );
}

// ---------- Virtualized table view (extracted to keep memo logic isolated) ----------

interface SubtestTableViewProps {
  table: ReturnType<typeof useReactTable<SubtestRow>>;
  loading: boolean;
  columns: ColumnDef<SubtestRow>[];
  sorting: SortingState;
  autoSizeColumn: (id: string) => void;
  isDelayed: (planned: string | null, actual: string | null) => boolean;
  navigate: (path: string) => void;
  tableRef: React.RefObject<HTMLDivElement>;
}

function SubtestTableView({
  table, loading, columns, sorting, autoSizeColumn, isDelayed, navigate, tableRef,
}: SubtestTableViewProps) {
  const FROZEN_COUNT = 3;
  const leafCols = table.getVisibleLeafColumns();
  const frozenCols = useMemo(() => leafCols.slice(0, FROZEN_COUNT), [leafCols]);
  const scrollCols = useMemo(() => leafCols.slice(FROZEN_COUNT), [leafCols]);

  const frozenWidth = useMemo(
    () => frozenCols.reduce((s, c) => s + c.getSize(), 0),
    [frozenCols, table.getState().columnSizing]
  );
  const scrollWidth = useMemo(
    () => scrollCols.reduce((s, c) => s + c.getSize(), 0),
    [scrollCols, table.getState().columnSizing]
  );

  const frozenPaneRef = useRef<HTMLDivElement>(null);
  // tableRef is used as the scroll pane (source of truth for vertical scroll & virtualizer)
  const scrollPaneRef = tableRef;

  const rows = table.getRowModel().rows;
  const ROW_HEIGHT = 36;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollPaneRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Sync vertical scroll: scroll pane → frozen pane
  const handleScroll = useCallback(() => {
    if (frozenPaneRef.current && scrollPaneRef.current) {
      frozenPaneRef.current.scrollTop = scrollPaneRef.current.scrollTop;
    }
  }, [scrollPaneRef]);

  // Delegate wheel events on frozen pane to scroll pane (vertical scroll)
  const handleFrozenWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollPaneRef.current && e.deltaY !== 0) {
      scrollPaneRef.current.scrollTop += e.deltaY;
    }
  }, [scrollPaneRef]);

  // Header groups (last group has the leaf columns)
  const headerGroups = table.getHeaderGroups();
  const lastHeaderGroup = headerGroups[headerGroups.length - 1];
  const filterHeaders = headerGroups[0]?.headers ?? [];
  const frozenFilterHeaders = filterHeaders.slice(0, FROZEN_COUNT);
  const scrollFilterHeaders = filterHeaders.slice(FROZEN_COUNT);
  const frozenSortHeaders = lastHeaderGroup ? lastHeaderGroup.headers.slice(0, FROZEN_COUNT) : [];
  const scrollSortHeaders = lastHeaderGroup ? lastHeaderGroup.headers.slice(FROZEN_COUNT) : [];

  const renderRowBgClass = (r: SubtestRow) => {
    const delayed = isDelayed(r.t1_planned_date, r.t1_actual_date) ||
                    isDelayed(r.t2_planned_date, r.t2_actual_date);
    const t2Done = r.t2_status === 'Done';
    return { delayed, t2Done };
  };

  return (
    <div className="rounded-md border max-h-[calc(100vh-220px)] flex overflow-hidden bg-background">
      {/* Frozen pane: NO horizontal scrollbar */}
      <div
        ref={frozenPaneRef}
        onWheel={handleFrozenWheel}
        className="overflow-hidden border-r border-border shadow-[2px_0_4px_-2px_hsl(var(--border))] bg-background"
        style={{ width: frozenWidth, flexShrink: 0 }}
      >
        <Table style={{ width: frozenWidth, tableLayout: 'fixed' }}>
          <TableHeader className="sticky top-0 z-20 bg-background">
            {/* Filter row */}
            <TableRow className="border-b-0 bg-muted/30">
              {frozenFilterHeaders.map(header => {
                const meta = header.column.columnDef.meta as any;
                const canFilter = header.column.getCanFilter();
                return (
                  <TableHead
                    key={`filter-${header.id}`}
                    style={{ width: header.getSize() }}
                    className="py-1 px-1 bg-muted/30"
                  >
                    {canFilter ? (
                      <ColumnFilter
                        column={header.column}
                        type={meta?.filterType === 'multi-select' ? 'multi-select' : 'text'}
                        options={meta?.filterOptions}
                      />
                    ) : null}
                  </TableHead>
                );
              })}
            </TableRow>
            <TableRow className="border-b bg-background">
              {frozenSortHeaders.map(header => (
                <TableHead
                  key={header.id}
                  data-column-id={header.column.id}
                  style={{ width: header.getSize() }}
                  className="relative text-xs font-medium cursor-pointer select-none whitespace-nowrap bg-background border-b"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() && (
                    <span className="ml-0.5">
                      {header.column.getIsSorted() === 'asc' ? '▲' : '▼'}
                      {sorting.length > 1 && (
                        <sup className="ml-0.5 text-[9px] text-muted-foreground">
                          {header.column.getSortIndex() + 1}
                        </sup>
                      )}
                    </span>
                  )}
                  {header.column.getCanResize() && (
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => { e.stopPropagation(); autoSizeColumn(header.column.id); }}
                      title="Drag to resize, double-click to auto-fit"
                      className={cn(
                        'absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none bg-transparent hover:bg-primary/40',
                        header.column.getIsResizing() && 'bg-primary/60'
                      )}
                    />
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading || rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={frozenCols.length} className="text-center py-8 text-muted-foreground">
                  &nbsp;
                </TableCell>
              </TableRow>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr style={{ height: paddingTop }} aria-hidden>
                    <td colSpan={frozenCols.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualRows.map(virtualRow => {
                  const row = rows[virtualRow.index];
                  const r = row.original;
                  const { delayed, t2Done } = renderRowBgClass(r);
                  const isHovered = hoveredIndex === virtualRow.index;
                  return (
                    <TableRow
                      key={row.id}
                      data-index={virtualRow.index}
                      className={cn(
                        'cursor-pointer',
                        t2Done && 'bg-muted/30 text-muted-foreground',
                        delayed && !t2Done && 'bg-destructive/5',
                        isHovered && 'bg-muted/50'
                      )}
                      onMouseEnter={() => setHoveredIndex(virtualRow.index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={() => navigate(`/subtests/${r.id}`)}
                    >
                      {row.getVisibleCells().slice(0, FROZEN_COUNT).map(cell => (
                        <TableCell
                          key={cell.id}
                          data-column-id={cell.column.id}
                          style={{ width: cell.column.getSize() }}
                          className="text-xs py-2 truncate"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr style={{ height: paddingBottom }} aria-hidden>
                    <td colSpan={frozenCols.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Scroll pane: horizontal scrollbar lives ONLY here */}
      <div
        ref={scrollPaneRef}
        onScroll={handleScroll}
        className="flex-1 min-w-0 overflow-auto"
      >
        <Table style={{ width: scrollWidth, tableLayout: 'fixed' }}>
          <TableHeader className="sticky top-0 z-20 bg-background">
            {/* Filter row */}
            <TableRow className="border-b-0 bg-muted/30">
              {scrollFilterHeaders.map(header => {
                const meta = header.column.columnDef.meta as any;
                const canFilter = header.column.getCanFilter();
                return (
                  <TableHead
                    key={`filter-${header.id}`}
                    style={{ width: header.getSize() }}
                    className="py-1 px-1 bg-muted/30"
                  >
                    {canFilter ? (
                      <ColumnFilter
                        column={header.column}
                        type={meta?.filterType === 'multi-select' ? 'multi-select' : 'text'}
                        options={meta?.filterOptions}
                      />
                    ) : null}
                  </TableHead>
                );
              })}
            </TableRow>
            <TableRow className="border-b bg-background">
              {scrollSortHeaders.map(header => (
                <TableHead
                  key={header.id}
                  data-column-id={header.column.id}
                  style={{ width: header.getSize() }}
                  className="relative text-xs font-medium cursor-pointer select-none whitespace-nowrap bg-background border-b"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() && (
                    <span className="ml-0.5">
                      {header.column.getIsSorted() === 'asc' ? '▲' : '▼'}
                      {sorting.length > 1 && (
                        <sup className="ml-0.5 text-[9px] text-muted-foreground">
                          {header.column.getSortIndex() + 1}
                        </sup>
                      )}
                    </span>
                  )}
                  {header.column.getCanResize() && (
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => { e.stopPropagation(); autoSizeColumn(header.column.id); }}
                      title="Drag to resize, double-click to auto-fit"
                      className={cn(
                        'absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none bg-transparent hover:bg-primary/40',
                        header.column.getIsResizing() && 'bg-primary/60'
                      )}
                    />
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={scrollCols.length} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={scrollCols.length} className="text-center py-8 text-muted-foreground">
                  No subtests found. Import data to get started.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr style={{ height: paddingTop }} aria-hidden>
                    <td colSpan={scrollCols.length} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualRows.map(virtualRow => {
                  const row = rows[virtualRow.index];
                  const r = row.original;
                  const { delayed, t2Done } = renderRowBgClass(r);
                  const isHovered = hoveredIndex === virtualRow.index;
                  return (
                    <TableRow
                      key={row.id}
                      data-index={virtualRow.index}
                      ref={(el) => el && rowVirtualizer.measureElement(el)}
                      className={cn(
                        'cursor-pointer',
                        t2Done && 'bg-muted/30 text-muted-foreground',
                        delayed && !t2Done && 'bg-destructive/5',
                        isHovered && 'bg-muted/50'
                      )}
                      onMouseEnter={() => setHoveredIndex(virtualRow.index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={() => navigate(`/subtests/${r.id}`)}
                    >
                      {row.getVisibleCells().slice(FROZEN_COUNT).map(cell => (
                        <TableCell
                          key={cell.id}
                          data-column-id={cell.column.id}
                          style={{ width: cell.column.getSize() }}
                          className="text-xs py-2 truncate"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr style={{ height: paddingBottom }} aria-hidden>
                    <td colSpan={scrollCols.length} style={{ padding: 0, border: 0 }} />
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
