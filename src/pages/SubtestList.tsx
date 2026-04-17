import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  flexRender, type ColumnDef, type SortingState, type ColumnFiltersState,
} from '@tanstack/react-table';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataSourceTag } from '@/components/shared/DataSourceTag';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Upload, Download, ChevronDown } from 'lucide-react';
import type { TcStatus, DataSource } from '@/types/enums';
import { TC_STATUS_OPTIONS, DATA_SOURCE_LABELS } from '@/types/enums';
import { cn } from '@/lib/utils';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const formatDdMmm = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return `${String(d.getDate()).padStart(2, '0')}-${MONTH_ABBR[d.getMonth()]}`;
};

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

export default function SubtestList() {
  const navigate = useNavigate();
  const [data, setData] = useState<SubtestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [systems, setSystems] = useState<{ id: string; system_code: string }[]>([]);

  useEffect(() => {
    fetchData();
    fetchSystems();
  }, []);

  const fetchSystems = async () => {
    const { data } = await supabase.from('system_master').select('id, system_code').eq('is_active', true);
    if (data) setSystems(data);
  };

  const fetchData = async () => {
    setLoading(true);
    let allData: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data } = await supabase
        .from('subtests')
        .select('id, subtest_id, item_no, mos_code, level, equipment, description, t1_planned_date, t1_actual_date, t1_status, t2_planned_date, t2_actual_date, t2_status, predecessor_status_raw, subcontractor_name, hdec_pic_name, data_source_type, updated_at, system_id, system_master!inner(system_code)')
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

    setData(allData.map((row: any) => ({
      ...row,
      system_code: row.system_master?.system_code ?? '',
    })));
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
    { accessorKey: 'system_code', header: 'System', size: 100, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select' as const, filterOptions: systemOptions } },
    { accessorKey: 'item_no', header: 'Item No', size: 100, filterFn: textFilterFn },
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
    { accessorKey: 't1_status', header: 'T1 Status', size: 90, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select' as const, filterOptions: statusOptions },
      cell: ({ getValue }) => <StatusBadge status={getValue() as TcStatus | null} /> },
    { accessorKey: 't2_planned_date', header: 'T2 Planned', size: 100, enableColumnFilter: false,
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
    { accessorKey: 't2_status', header: 'T2 Status', size: 90, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select' as const, filterOptions: statusOptions },
      cell: ({ getValue }) => <StatusBadge status={getValue() as TcStatus | null} /> },
    { accessorKey: 'subcontractor_name', header: 'Subcontractor', size: 120, filterFn: textFilterFn },
    { accessorKey: 'hdec_pic_name', header: 'HDEC PIC', size: 110, filterFn: textFilterFn },
    { accessorKey: 'data_source_type', header: 'Source', size: 110, filterFn: multiSelectFilterFn,
      meta: { filterType: 'multi-select' as const, filterOptions: sourceOptions },
      cell: ({ getValue }) => <DataSourceTag source={getValue() as DataSource | null} /> },
    { accessorKey: 'updated_at', header: 'Updated', size: 140, enableColumnFilter: false,
      cell: ({ getValue }) => formatDdMmm(getValue() as string | null) },
  ], [systemOptions, statusOptions, sourceOptions]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableMultiSort: true,
    enableSortingRemoval: true,
    isMultiSortEvent: (e) => (e as unknown as MouseEvent).shiftKey,
    maxMultiSortColCount: 5,
  });

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

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subtests..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
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
      </div>

      {/* Scrollable table with sticky header */}
      <div className="rounded-md border max-h-[calc(100vh-220px)] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10">
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id} className="border-b-0">
                {hg.headers.map(header => (
                  <TableHead
                    key={header.id}
                    className="text-xs font-medium cursor-pointer select-none whitespace-nowrap bg-background border-b"
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
                  </TableHead>
                ))}
              </TableRow>
            ))}
            {/* Filter row */}
            <TableRow className="border-b">
              {table.getHeaderGroups()[0].headers.map(header => {
                const meta = header.column.columnDef.meta as any;
                const canFilter = header.column.getCanFilter();
                return (
                  <TableHead key={`filter-${header.id}`} className="py-1 px-1 bg-muted/30">
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
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground">
                  No subtests found. Import data to get started.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map(row => {
                const r = row.original;
                const delayed = isDelayed(r.t1_planned_date, r.t1_actual_date) ||
                                isDelayed(r.t2_planned_date, r.t2_actual_date);
                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50',
                      delayed && 'bg-destructive/5'
                    )}
                    onClick={() => navigate(`/subtests/${r.id}`)}
                  >
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id} className="text-xs py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
