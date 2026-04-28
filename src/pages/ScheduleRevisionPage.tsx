import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table';
import { CalendarClock, Filter, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TEAM_LABELS, type TeamType } from '@/types/enums';
import { formatDateTimeDdMmmYyyy, formatDdMmm, formatSignedDays } from '@/lib/format';
import { cn } from '@/lib/utils';

type Stage = 'pred' | 't1' | 't2' | 'r1' | 'r2s';
type FilterKind = 'text' | 'date-range' | 'multi-select';

type FilterMeta = {
  filterType?: FilterKind;
  filterOptions?: { value: string; label: string }[];
};

interface ScheduleChangeAudit {
  id: string;
  created_at: string;
  raw_row_no: number | null;
  project_id: string;
  system_id: string;
  item_no: string;
  mos_code: string;
  subtest_code: string | null;
  subtest_id: string;
  pred_old_date: string | null;
  pred_new_date: string | null;
  pred_diff_days: number | null;
  pred_prev_gap_days: number | null;
  pred_cur_gap_days: number | null;
  t1_old_date: string | null;
  t1_new_date: string | null;
  t1_diff_days: number | null;
  t1_prev_gap_days: number | null;
  t1_cur_gap_days: number | null;
  t2_old_date: string | null;
  t2_new_date: string | null;
  t2_diff_days: number | null;
  t2_prev_gap_days: number | null;
  t2_cur_gap_days: number | null;
  r1_old_date: string | null;
  r1_new_date: string | null;
  r1_diff_days: number | null;
  r1_prev_gap_days: number | null;
  r1_cur_gap_days: number | null;
  r2s_old_date: string | null;
  r2s_new_date: string | null;
  r2s_diff_days: number | null;
  r2s_prev_gap_days: number | null;
}

interface SubtestRevisionMeta {
  id: string;
  subcontractor_name: string | null;
  subsub_name: string | null;
  team: TeamType | null;
}

type ScheduleRevisionRow = ScheduleChangeAudit & {
  project_name: string;
  system_code: string;
  team: TeamType | null;
  team_label: string;
  subcontractor_name: string | null;
  subsub_name: string | null;
};

const stageGroups = ['pred', 't1', 't2', 'r1', 'r2s'] as const;
const stageLabels: Record<Stage, string> = { pred: 'Pred', t1: 'T1', t2: 'T2', r1: 'R1 Sub', r2s: 'R2 Sub' };
// R2 Submission is the last tracked stage and has no successor → no Cur.Gap column.
const stageHasSuccessor: Record<Stage, boolean> = { pred: true, t1: true, t2: true, r1: true, r2s: false };
const EMPTY_TOKEN = '__EMPTY__';

const formatGap = (value: number | null | undefined) => value == null ? '—' : String(value);
const diffClass = (value: number | null) =>
  value == null ? '' : value > 0 ? 'text-destructive font-medium' : value < 0 ? 'text-primary font-medium' : 'text-muted-foreground';

const textFilterFn = (row: any, columnId: string, filterValue: { text?: string; emptyOnly?: boolean } | string | undefined) => {
  if (!filterValue) return true;
  const text = typeof filterValue === 'string' ? filterValue : filterValue.text;
  const emptyOnly = typeof filterValue === 'object' ? filterValue.emptyOnly : false;
  const value = row.getValue(columnId);
  if (emptyOnly) return value == null || String(value).trim() === '';
  if (!text) return true;
  if (value == null) return false;
  return String(value).toLowerCase().includes(text.toLowerCase());
};

const dateRangeFilterFn = (row: any, columnId: string, filterValue: { from?: string; to?: string; emptyOnly?: boolean } | undefined) => {
  if (!filterValue) return true;
  const { from, to, emptyOnly } = filterValue;
  const rawValue = row.getValue(columnId) as string | null;
  if (emptyOnly) return rawValue == null || rawValue === '';
  if (!from && !to) return true;
  if (!rawValue) return false;
  const value = rawValue.slice(0, 10);
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
};

const multiSelectFilterFn = (row: any, columnId: string, filterValue: string[] | undefined) => {
  if (!filterValue?.length) return true;
  const value = row.getValue(columnId);
  const isEmpty = value == null || value === '';
  if (filterValue.includes(EMPTY_TOKEN) && isEmpty) return true;
  if (isEmpty) return false;
  return filterValue.includes(String(value));
};

function StageCells({ row, stage }: { row: ScheduleRevisionRow; stage: Stage }) {
  const oldDate = row[`${stage}_old_date` as keyof ScheduleRevisionRow] as string | null;
  const newDate = row[`${stage}_new_date` as keyof ScheduleRevisionRow] as string | null;
  const diff = row[`${stage}_diff_days` as keyof ScheduleRevisionRow] as number | null;
  const prevGap = row[`${stage}_prev_gap_days` as keyof ScheduleRevisionRow] as number | null;
  const curGap = stageHasSuccessor[stage]
    ? (row[`${stage}_cur_gap_days` as keyof ScheduleRevisionRow] as number | null)
    : null;

  return (
    <>
      <TableCell className="text-xs whitespace-nowrap">{formatDdMmm(oldDate)}</TableCell>
      <TableCell className="text-xs whitespace-nowrap">{formatDdMmm(newDate)}</TableCell>
      <TableCell className={`text-xs text-right ${diffClass(diff)}`}>{formatSignedDays(diff)}</TableCell>
      <TableCell className="text-xs text-right">{formatGap(prevGap)}</TableCell>
      {stageHasSuccessor[stage] && (
        <TableCell className="text-xs text-right">{formatGap(curGap)}</TableCell>
      )}
    </>
  );
}

function TextFilterDropdown({ column }: { column: Column<ScheduleRevisionRow> }) {
  const filterValue = column.getFilterValue() as { text?: string; emptyOnly?: boolean } | string | undefined;
  const text = typeof filterValue === 'string' ? filterValue : filterValue?.text ?? '';
  const emptyOnly = typeof filterValue === 'object' ? filterValue?.emptyOnly ?? false : false;
  const isActive = Boolean(text || emptyOnly);

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
        <Input
          placeholder="Search..."
          value={text}
          onChange={(event) => update({ text: event.target.value || undefined })}
          className="h-7 text-xs"
          disabled={emptyOnly}
        />
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

function DateRangeDropdown({ column }: { column: Column<ScheduleRevisionRow> }) {
  const filterValue = column.getFilterValue() as { from?: string; to?: string; emptyOnly?: boolean } | undefined;
  const isActive = Boolean(filterValue?.from || filterValue?.to || filterValue?.emptyOnly);

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
        <label className="flex cursor-pointer items-center gap-2 text-xs">
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

function MultiSelectDropdown({ column, options }: { column: Column<ScheduleRevisionRow>; options: { value: string; label: string }[] }) {
  const selected = (column.getFilterValue() as string[] | undefined) ?? [];
  const isActive = selected.length > 0;
  const allOptions = [{ value: EMPTY_TOKEN, label: '(Empty)' }, ...options];

  const toggle = (value: string) => {
    const next = selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value];
    column.setFilterValue(next.length ? next : undefined);
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
      <PopoverContent className="max-h-60 w-52 overflow-auto p-2" align="start" onClick={(event) => event.stopPropagation()}>
        <button className="mb-1 px-1 text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(undefined)}>
          Clear all
        </button>
        {allOptions.map(option => (
          <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
            <Checkbox checked={selected.includes(option.value)} onCheckedChange={() => toggle(option.value)} className="h-3.5 w-3.5" />
            {option.label}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ColumnFilterDropdown({ column }: { column: Column<ScheduleRevisionRow> }) {
  const meta = column.columnDef.meta as FilterMeta | undefined;
  if (meta?.filterType === 'date-range') return <DateRangeDropdown column={column} />;
  if (meta?.filterType === 'multi-select') return <MultiSelectDropdown column={column} options={meta.filterOptions ?? []} />;
  return <TextFilterDropdown column={column} />;
}

function SortableHeader({ column, label, className, rowSpan }: { column: Column<ScheduleRevisionRow> | undefined; label: string; className?: string; rowSpan?: number }) {
  if (!column) return <TableHead rowSpan={rowSpan} className={cn('text-xs whitespace-nowrap', className)}>{label}</TableHead>;
  const sorted = column.getIsSorted();

  return (
    <TableHead rowSpan={rowSpan} className={cn('text-xs whitespace-nowrap', className)}>
      <div className="flex items-center gap-1">
        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={column.getToggleSortingHandler()}>
          <span>{label}</span>
          <span className="w-2 text-[10px] text-muted-foreground">{sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : ''}</span>
        </button>
        {column.getCanFilter() && <ColumnFilterDropdown column={column} />}
      </div>
    </TableHead>
  );
}

export default function ScheduleRevisionPage() {
  const navigate = useNavigate();
  const [changes, setChanges] = useState<ScheduleRevisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [auditRes, projectRes, systemRes] = await Promise.all([
        supabase
          .from('schedule_change_audit')
          .select('*')
          .order('created_at', { ascending: false })
          .order('raw_row_no', { ascending: true })
          .limit(500),
        supabase.from('projects').select('id, project_code, project_name').eq('is_active', true),
        supabase.from('system_master').select('id, system_code').eq('is_active', true),
      ]);

      const auditRows = (auditRes.data as ScheduleChangeAudit[]) ?? [];
      const subtestIds = Array.from(new Set(auditRows.map(row => row.subtest_id).filter(Boolean)));
      const subtestRes = subtestIds.length
        ? await supabase.from('subtests').select('id, subcontractor_name, subsub_name, team').in('id', subtestIds)
        : { data: [] as SubtestRevisionMeta[] };

      if (cancelled) return;

      const projectNames = Object.fromEntries((projectRes.data ?? []).map(project => [project.id, project.project_code || project.project_name]));
      const systemCodes = Object.fromEntries((systemRes.data ?? []).map(system => [system.id, system.system_code]));
      const subtestMeta = Object.fromEntries(((subtestRes.data as SubtestRevisionMeta[]) ?? []).map(subtest => [subtest.id, subtest]));

      setChanges(auditRows.map(row => {
        const meta = subtestMeta[row.subtest_id];
        return {
          ...row,
          project_name: projectNames[row.project_id] || '—',
          system_code: systemCodes[row.system_id] || '—',
          team: meta?.team ?? null,
          team_label: meta?.team ? TEAM_LABELS[meta.team] : '',
          subcontractor_name: meta?.subcontractor_name ?? null,
          subsub_name: meta?.subsub_name ?? null,
        };
      }));
      setLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const columns = useMemo<ColumnDef<ScheduleRevisionRow>[]>(() => [
    { accessorKey: 'created_at', header: 'Changed At', filterFn: dateRangeFilterFn, meta: { filterType: 'date-range' } },
    { accessorKey: 'project_name', header: 'Project', filterFn: textFilterFn },
    { accessorKey: 'system_code', header: 'System', filterFn: textFilterFn },
    { accessorKey: 'team_label', header: 'Team', filterFn: multiSelectFilterFn, meta: { filterType: 'multi-select', filterOptions: Object.entries(TEAM_LABELS).map(([value, label]) => ({ value: label, label })) } },
    { accessorKey: 'subcontractor_name', header: 'Subcontractor', filterFn: textFilterFn },
    { accessorKey: 'subsub_name', header: 'Sub-Sub', filterFn: textFilterFn },
    { accessorKey: 'raw_row_no', header: 'Row', filterFn: textFilterFn },
    { accessorKey: 'item_no', header: 'Item No', filterFn: textFilterFn },
    { accessorKey: 'mos_code', header: 'MOS Code', filterFn: textFilterFn },
    { accessorKey: 'subtest_code', header: 'Subtest ID', filterFn: textFilterFn },
    ...stageGroups.flatMap(stage => {
      const baseCols: ColumnDef<ScheduleRevisionRow>[] = [
        { accessorKey: `${stage}_old_date`, header: `${stageLabels[stage]} Old date`, filterFn: dateRangeFilterFn, meta: { filterType: 'date-range' } },
        { accessorKey: `${stage}_new_date`, header: `${stageLabels[stage]} New date`, filterFn: dateRangeFilterFn, meta: { filterType: 'date-range' } },
        { accessorKey: `${stage}_diff_days`, header: `${stageLabels[stage]} Diff`, filterFn: textFilterFn },
        { accessorKey: `${stage}_prev_gap_days`, header: `${stageLabels[stage]} Prev.Gap`, filterFn: textFilterFn },
      ];
      if (stageHasSuccessor[stage]) {
        baseCols.push({ accessorKey: `${stage}_cur_gap_days`, header: `${stageLabels[stage]} Cur.Gap`, filterFn: textFilterFn });
      }
      return baseCols;
    }),
  ], []);

  const table = useReactTable({
    data: changes,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;
  const changeCountLabel = useMemo(() => `${rows.length.toLocaleString()} of ${changes.length.toLocaleString()} revisions`, [changes.length, rows.length]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <CalendarClock className="h-5 w-5 text-primary" />
            Schedule Revision
          </h1>
          <p className="text-xs text-muted-foreground">
            Pred / T1 / T2 planned date revision history · Recent 500 records · {changeCountLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {columnFilters.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setColumnFilters([])}>
              <X className="h-3.5 w-3.5" />
              Clear filters ({columnFilters.length})
            </Button>
          )}
          {sorting.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setSorting([])}>
              Clear sort
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4">
              <Skeleton className="h-[520px] w-full" />
            </div>
          ) : (
            <div className="max-h-[680px] overflow-auto rounded-md border-0">
              <Table className="min-w-[2080px]">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <SortableHeader column={table.getColumn('created_at')} label="Changed At" rowSpan={2} />
                    <SortableHeader column={table.getColumn('project_name')} label="Project" rowSpan={2} />
                    <SortableHeader column={table.getColumn('system_code')} label="System" rowSpan={2} />
                    <SortableHeader column={table.getColumn('team_label')} label="Team" rowSpan={2} />
                    <SortableHeader column={table.getColumn('subcontractor_name')} label="Subcontractor" rowSpan={2} />
                    <SortableHeader column={table.getColumn('subsub_name')} label="Sub-Sub" rowSpan={2} />
                    <SortableHeader column={table.getColumn('raw_row_no')} label="Row" rowSpan={2} />
                    <SortableHeader column={table.getColumn('item_no')} label="Item No" rowSpan={2} />
                    <SortableHeader column={table.getColumn('mos_code')} label="MOS Code" rowSpan={2} />
                    <SortableHeader column={table.getColumn('subtest_code')} label="Subtest ID" rowSpan={2} />
                    {stageGroups.map(stage => <TableHead key={stage} colSpan={5} className="border-l text-center text-xs">{stageLabels[stage]}</TableHead>)}
                  </TableRow>
                  <TableRow>
                    {stageGroups.flatMap(stage => ['old_date', 'new_date', 'diff_days', 'prev_gap_days', 'cur_gap_days'].map((suffix, index) => {
                      const label = ['Old date', 'New date', 'Diff', 'Prev.Gap', 'Cur.Gap'][index];
                      return <SortableHeader key={`${stage}-${suffix}`} column={table.getColumn(`${stage}_${suffix}`)} label={label} className="border-l first:border-l-0" />;
                    }))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={25} className="py-8 text-center text-muted-foreground">No schedule revisions</TableCell></TableRow>
                  ) : rows.map(row => {
                    const original = row.original;
                    return (
                      <TableRow key={original.id} className="cursor-pointer" onClick={() => navigate(`/subtests/${original.subtest_id}`)}>
                        <TableCell className="text-xs whitespace-nowrap">{formatDateTimeDdMmmYyyy(original.created_at)}</TableCell>
                        <TableCell className="text-xs">{original.project_name}</TableCell>
                        <TableCell className="text-xs">{original.system_code}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{original.team_label || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{original.subcontractor_name || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{original.subsub_name || '—'}</TableCell>
                        <TableCell className="text-xs">{original.raw_row_no ?? '—'}</TableCell>
                        <TableCell className="text-xs">{original.item_no}</TableCell>
                        <TableCell className="text-xs">{original.mos_code}</TableCell>
                        <TableCell className="text-xs">{original.subtest_code || '—'}</TableCell>
                        {stageGroups.map(stage => <StageCells key={stage} row={original} stage={stage} />)}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
