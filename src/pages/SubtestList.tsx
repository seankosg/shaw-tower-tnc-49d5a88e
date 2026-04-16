import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  getPaginationRowModel, flexRender, type ColumnDef, type SortingState,
} from '@tanstack/react-table';
import { supabase } from '@/integrations/supabase/client';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataSourceTag } from '@/components/shared/DataSourceTag';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Search, Upload, Download } from 'lucide-react';
import type { TcStatus, DataSource } from '@/types/enums';
import { TC_STATUS_OPTIONS } from '@/types/enums';
import { cn } from '@/lib/utils';

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

export default function SubtestList() {
  const navigate = useNavigate();
  const [data, setData] = useState<SubtestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [systems, setSystems] = useState<{ id: string; system_code: string }[]>([]);
  const [systemFilter, setSystemFilter] = useState<string>('all');

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
    const { data, error } = await supabase
      .from('subtests')
      .select('id, subtest_id, item_no, mos_code, level, equipment, description, t1_planned_date, t1_actual_date, t1_status, t2_planned_date, t2_actual_date, t2_status, predecessor_status_raw, subcontractor_name, hdec_pic_name, data_source_type, updated_at, system_id, system_master!inner(system_code)')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(500);

    if (data) {
      setData(data.map((row: any) => ({
        ...row,
        system_code: row.system_master?.system_code ?? '',
      })));
    }
    setLoading(false);
  };

  const isDelayed = (planned: string | null, actual: string | null) => {
    if (!planned || !actual) return false;
    return new Date(actual) > new Date(planned);
  };

  const columns = useMemo<ColumnDef<SubtestRow>[]>(() => [
    { accessorKey: 'system_code', header: 'System', size: 100 },
    { accessorKey: 'item_no', header: 'Item No', size: 100 },
    { accessorKey: 'subtest_id', header: 'Subtest ID', size: 160 },
    { accessorKey: 'mos_code', header: 'MOS Code', size: 100 },
    { accessorKey: 'description', header: 'Description', size: 200, cell: ({ getValue }) => (
      <span className="truncate block max-w-[200px]">{getValue() as string || '—'}</span>
    )},
    { accessorKey: 't1_status', header: 'T1 Status', size: 90,
      cell: ({ getValue }) => <StatusBadge status={getValue() as TcStatus | null} /> },
    { accessorKey: 't1_planned_date', header: 'T1 Planned', size: 100 },
    { accessorKey: 't2_status', header: 'T2 Status', size: 90,
      cell: ({ getValue }) => <StatusBadge status={getValue() as TcStatus | null} /> },
    { accessorKey: 't2_planned_date', header: 'T2 Planned', size: 100 },
    { accessorKey: 'predecessor_status_raw', header: 'Predecessor', size: 110 },
    { accessorKey: 'subcontractor_name', header: 'Subcontractor', size: 120 },
    { accessorKey: 'hdec_pic_name', header: 'HDEC PIC', size: 110 },
    { accessorKey: 'data_source_type', header: 'Source', size: 110,
      cell: ({ getValue }) => <DataSourceTag source={getValue() as DataSource | null} /> },
    { accessorKey: 'updated_at', header: 'Updated', size: 140,
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return v ? new Date(v).toLocaleDateString() : '—';
      }},
  ], []);

  const filteredData = useMemo(() => {
    let result = data;
    if (statusFilter !== 'all') {
      result = result.filter(r => r.t1_status === statusFilter || r.t2_status === statusFilter);
    }
    if (systemFilter !== 'all') {
      result = result.filter(r => r.system_code === systemFilter);
    }
    return result;
  }, [data, statusFilter, systemFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
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

      {/* Filters */}
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
        <Select value={systemFilter} onValueChange={setSystemFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="All Systems" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Systems</SelectItem>
            {systems.map(s => (
              <SelectItem key={s.id} value={s.system_code}>{s.system_code}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {TC_STATUS_OPTIONS.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id}>
                {hg.headers.map(header => (
                  <TableHead
                    key={header.id}
                    className="text-xs font-medium cursor-pointer select-none whitespace-nowrap"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                  </TableHead>
                ))}
              </TableRow>
            ))}
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

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {table.getFilteredRowModel().rows.length} records
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
