import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
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
import { Check, Filter, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Upload, Download, ChevronDown } from 'lucide-react';
import type { TcStatus, DataSource, TeamType } from '@/types/enums';
import { TC_STATUS_OPTIONS, DATA_SOURCE_LABELS, ALL_TEAMS, TEAM_LABELS } from '@/types/enums';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import { getSubtestCache, setSubtestCache } from '@/lib/subtest-cache';
import { exportSubtestsToExcel } from '@/lib/excel-export';
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
import type { BulkEditableField } from '@/lib/bulk-edit';

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

  const allOptions = [{ value: EMPTY_TOKEN, label: '(Empty)' }, ...options];

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
        className="w-48 p-2 max-h-60 overflow-auto"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => e.stopPropagation()}
      >
        <button
          className="text-[11px] text-muted-foreground hover:underline mb-1 px-1"
          onClick={() => column.setFilterValue(undefined)}
        >
          Clear all
        </button>
        {allOptions.map(o => (
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
  const filterType = meta?.filterType;

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
  const urlStatusFilter = searchParams.get('status');
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
    const dataUrlFilterKeys = [
      ...Object.keys(urlMap),
      'source', 'status', 'at_risk_days', 'as_of',
      'date_from', 'date_to', 'date_field', 'stage', 'cell_status',
      'pred_planned_to', 't1_planned_to', 't2_planned_to',
      'pred_actual_to', 't1_actual_to', 't2_actual_to',
      'pred_planned_on', 't1_planned_on', 't2_planned_on',
      'pred_actual_on', 't1_actual_on', 't2_actual_on',
      'pred_delay_asof', 't1_delay_asof', 't2_delay_asof',
      'pred_delay_on', 't1_delay_on', 't2_delay_on',
    ];
    const hasDataUrlFilters = dataUrlFilterKeys.some(k => searchParams.has(k));
    const next = hasDataUrlFilters ? [] : baseFilters.filter(f => !Object.values(urlMap).includes(f.id));
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
    setSorting(baseSorting);
    setColumnFilters(next);
    setGlobalFilter(hasDataUrlFilters ? '' : baseGlobal);
    setSearchInput(hasDataUrlFilters ? '' : baseGlobal);
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
    const el = tableRef.current;
    if (!el) return;
    const raw = localStorage.getItem(`${storageKey}:scroll`);
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        el.scrollTop = Number(saved.top) || 0;
        el.scrollLeft = Number(saved.left) || 0;
      } catch {
        // ignore
      }
    }
    const save = () => {
      localStorage.setItem(`${storageKey}:scroll`, JSON.stringify({ top: el.scrollTop, left: el.scrollLeft }));
    };
    el.addEventListener('scroll', save, { passive: true });
    return () => el.removeEventListener('scroll', save);
  }, [stateLoaded, storageKey]);

  useEffect(() => {
    fetchData();
    fetchSystems();
    fetchDataDate();
  }, []);

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
        .select('id, subtest_id, item_no, mos_code, level, equipment, description, t1_planned_date, t1_actual_date, t1_status, t2_planned_date, t2_actual_date, t2_status, predecessor_status_raw, pred_status, pred_planned_date, pred_actual_date, subcontractor_name, subsub_name, hdec_pic_name, data_source_type, team, updated_at, system_id, system_master!inner(system_code)' as any)
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
    { accessorKey: 'item_no', header: 'Item No', size: 100, filterFn: textFilterFn,
      meta: { filterType: 'text' } },
    {
      id: 'stage_progress',
      header: 'Progress',
      size: 110,
      enableColumnFilter: false,
      enableSorting: true,
      accessorFn: (r) => {
        const t1Done = r.t1_status === 'Done';
        const t2Done = r.t2_status === 'Done';
        const predDone = r.pred_status === 'Done' || (r.pred_status == null && r.predecessor_status_raw
          ? /done|완료|complete|completed|finished/i.test(r.predecessor_status_raw ?? '')
          : false);
        const t1Done2 = r.t1_status === 'Done';
        return (predDone ? 1 : 0) + (t1Done2 ? 2 : 0) + (t2Done ? 4 : 0);
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
          asOfDate={dataDate}
        />
      ),
    },
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
  ], [systemOptions, statusOptions, sourceOptions, subcontractorOptions, subsubOptions, hdecPicOptions, teamOptions, dataDate]);

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

    return data.filter(r => {
      if (urlStatusFilter) {
        const overdue = getAnyStageDelayedAsOf(r, getStageKeys('all'), delayAsOfDate);
        if (urlStatusFilter === 'overdue' && !overdue) return false;
        if (urlStatusFilter === 'at_risk') {
          if (overdue) return false;
          const within = (stage: StageKey) => {
            const planned = getStagePlannedDate(r, stage);
            if (!planned || isStageDone(r, stage)) return false;
            const d = daysFromToday(planned);
            return d >= 0 && d <= urlAtRiskDays;
          };
          if (!within('pred') && !within('t1') && !within('t2')) return false;
        }
      }
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
  }, [data, urlStatusFilter, urlAtRiskDays,
      urlPredPlannedTo, urlT1PlannedTo, urlT2PlannedTo, urlPredActualTo, urlT1ActualTo, urlT2ActualTo,
      urlPredPlannedOn, urlT1PlannedOn, urlT2PlannedOn, urlPredActualOn, urlT1ActualOn, urlT2ActualOn,
      urlPredDelayAsOf, urlT1DelayAsOf, urlT2DelayAsOf, urlPredDelayOn, urlT1DelayOn, urlT2DelayOn,
      urlDateFrom, urlDateTo, urlDateField, urlStage, urlCellStatus, delayAsOfDate, localToday]);

  const columnIdToFieldName: Record<string, string> = {
    system_code: 'system',
  };
  const fieldNameToColumnId: Record<string, string> = { system: 'system_code' };
  const columnVisibility = useMemo<VisibilityState>(() => {
    const visibility: VisibilityState = {};
    for (const col of columns) {
      const id = (col as any).id ?? (col as any).accessorKey;
      if (!id) continue;
      if (id === 'stage_progress') continue;
      const fieldName = columnIdToFieldName[id] ?? id;
      visibility[id] = isFieldVisible(fieldName);
    }
    return visibility;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, isFieldVisible]);

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
    const out: { label: string; param: string; clears?: string[] }[] = [];
    const source = searchParams.get('source');
    const isScheduleCell = source === 'schedule_cell';
    const formatValue = (v: string) => v === EMPTY_TOKEN ? '(Empty)' : v;
    const map: Record<string, string> = {
      system: 'System', subcon: 'Subcon', subsub: 'Sub-Sub',
      hdec_pic: 'HDEC PIC', pred_status: 'Pred', t1_status: 'T1', t2_status: 'T2', status: 'Status',
      pred_planned_to: 'Pred Plan ≤', pred_actual_to: 'Pred Actual ≤',
      t1_planned_to: 'T1 Plan ≤', t2_planned_to: 'T2 Plan ≤',
      t1_actual_to: 'T1 Actual ≤', t2_actual_to: 'T2 Actual ≤',
      pred_planned_on: 'Pred Plan =', pred_actual_on: 'Pred Actual =',
      t1_planned_on: 'T1 Plan =', t2_planned_on: 'T2 Plan =',
      t1_actual_on: 'T1 Actual =', t2_actual_on: 'T2 Actual =',
      pred_delay_asof: 'Pred Delay ≤', t1_delay_asof: 'T1 Delay ≤', t2_delay_asof: 'T2 Delay ≤',
      pred_delay_on: 'Pred Delay =', t1_delay_on: 'T1 Delay =', t2_delay_on: 'T2 Delay =',
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
    if (toDelete.includes('status')) next.delete('at_risk_days');
    setSearchParams(next, { replace: true });
  };
  const clearAllUrlFilters = () => setSearchParams(new URLSearchParams(), { replace: true });

  // Count active column filters for display
  const activeColumnFilterCount = columnFilters.length;

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
              try {
                const result = exportSubtestsToExcel({
                  table,
                  fieldConfig: fieldConfigRows,
                  globalFilter,
                  searchParams,
                  meta: {
                    userName: profile?.name || profile?.login_id || 'Unknown',
                    userType: profile?.user_type ? USER_TYPE_LABELS[profile.user_type] : '',
                  },
                });
                toast({ title: 'Export complete', description: `${result.rowCount} rows → ${result.fileName}` });
              } catch (err) {
                console.error('Excel export failed', err);
                toast({ title: 'Export failed', description: String((err as Error)?.message ?? err), variant: 'destructive' });
              }
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
        {activeColumnFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => setColumnFilters([])}
          >
            <X className="h-3 w-3 mr-1" />
            Clear filters ({activeColumnFilterCount})
          </Button>
        )}
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

      <SubtestTableView
        table={table}
        loading={loading}
        columns={columns}
        sorting={sorting}
        autoSizeColumn={autoSizeColumn}
        navigate={navigate}
        tableRef={tableRef}
        delayAsOfDate={delayAsOfDate}
      />
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
}

function SubtestTableView({
  table, loading, columns, sorting, autoSizeColumn, navigate, tableRef, delayAsOfDate,
}: SubtestTableViewProps) {
  const isMobile = useIsMobile();
  const FROZEN_COUNT = isMobile ? 1 : 4;
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

  const handleScroll = useCallback(() => {
    if (frozenPaneRef.current && scrollPaneRef.current) {
      frozenPaneRef.current.scrollTop = scrollPaneRef.current.scrollTop;
    }
  }, [scrollPaneRef]);

  const handleFrozenWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollPaneRef.current && e.deltaY !== 0) {
      scrollPaneRef.current.scrollTop += e.deltaY;
    }
  }, [scrollPaneRef]);

  const headerGroups = table.getHeaderGroups();
  const lastHeaderGroup = headerGroups[headerGroups.length - 1];
  const allHeaders = lastHeaderGroup ? lastHeaderGroup.headers : [];
  const frozenHeaders = allHeaders.slice(0, FROZEN_COUNT);
  const scrollHeaders = allHeaders.slice(FROZEN_COUNT);

  const renderRowBgClass = (r: SubtestRow) => {
    const delayed = getAnyStageDelayedAsOf(r, getStageKeys('all'), delayAsOfDate);
    const t2Done = isStageDone(r, 't2');
    return { delayed, t2Done };
  };

  const renderHeader = (header: any) => {
    const canFilter = header.column.getCanFilter();
    return (
      <TableHead
        key={header.id}
        data-column-id={header.column.id}
        style={{ width: header.getSize() }}
        className="relative text-xs font-medium cursor-pointer select-none whitespace-nowrap bg-background border-b"
        onClick={header.column.getToggleSortingHandler()}
      >
        <span className="inline-flex items-center gap-1">
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
          {canFilter && (
            <span onClick={(e) => e.stopPropagation()}>
              <ColumnFilterDropdown column={header.column} />
            </span>
          )}
        </span>
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
    );
  };

  return (
    <div className="rounded-md border max-h-[calc(100vh-220px)] flex overflow-hidden bg-background">
      {/* Frozen pane */}
      <div
        ref={frozenPaneRef}
        onWheel={handleFrozenWheel}
        className="overflow-hidden border-r border-border shadow-[2px_0_4px_-2px_hsl(var(--border))] bg-background"
        style={{ width: frozenWidth, flexShrink: 0 }}
      >
        <Table style={{ width: frozenWidth, tableLayout: 'fixed' }}>
          <TableHeader className="sticky top-0 z-20 bg-background">
            <TableRow className="border-b bg-background">
              {frozenHeaders.map(renderHeader)}
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
                      style={{ height: virtualRow.size }}
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

      {/* Scroll pane */}
      <div
        ref={scrollPaneRef}
        onScroll={handleScroll}
        className="flex-1 min-w-0 overflow-auto"
      >
        <Table style={{ width: scrollWidth, tableLayout: 'fixed' }}>
          <TableHeader className="sticky top-0 z-20 bg-background">
            <TableRow className="border-b bg-background">
              {scrollHeaders.map(renderHeader)}
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
