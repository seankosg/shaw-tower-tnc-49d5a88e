import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, Filter, Search, Upload, X, ChevronRight, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import { useDocsFieldConfig } from '@/hooks/useDocsFieldConfig';
import { TopHorizontalScrollbar } from '@/components/raw-data/TopHorizontalScrollbar';
import { NumberRangeDropdown, numberRangeFilterFn } from '@/components/raw-data/NumberRangeDropdown';
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
import * as XLSX from 'xlsx';

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
  'current_stage', 'current_status', 'remarks',
] as const;

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

function ColumnFilterDropdown({ column, filterType }: { column: any; filterType: string }) {
  switch (filterType) {
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
  const { toast } = useToast();
  const { getLabel, isFieldVisible, sortFieldNames } = useDocsFieldConfig('warranty');

  const [rows, setRows] = useState<WarrantyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'item_no', desc: false },
    { id: 'resubmission_seq', desc: false },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
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
      if (error) { toast({ title: 'Load failed', description: error.message, variant: 'destructive' }); break; }
      if (!data || data.length === 0) break;
      all.push(...(data as WarrantyRow[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setRows(all);
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('warranty_items_raw')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_items' }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // Group resubmissions: hide children whose parent is collapsed.
  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      if (!r.is_resubmission || !r.parent_id) return true;
      // child shown unless its top-level parent is collapsed
      return !collapsedParents.has(r.parent_id);
    });
  }, [rows, collapsedParents]);

  const childCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.is_resubmission && r.parent_id) m.set(r.parent_id, (m.get(r.parent_id) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const toggleParent = (parentId: string) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  // ── Column definitions ──
  const columns = useMemo<ColumnDef<WarrantyRow>[]>(() => {
    const baseCols: ColumnDef<WarrantyRow>[] = [
      {
        id: '__select',
        size: 36,
        enableSorting: false,
        enableColumnFilter: false,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? 'indeterminate' : false}
            onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
            className="h-3.5 w-3.5"
          />
        ),
        cell: ({ row }) => (
          <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)}
            onClick={(e) => e.stopPropagation()} className="h-3.5 w-3.5" />
        ),
      },
      {
        id: '__expand',
        size: 28,
        enableSorting: false, enableColumnFilter: false,
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
      },
    ];

    const dataCols: ColumnDef<WarrantyRow>[] = [];

    // Custom: Cycle Progress
    if (isFieldVisible('cycle_progress')) {
      dataCols.push({
        id: 'cycle_progress',
        accessorFn: (r) => computeWarrantyOverallStatus(r),
        header: () => (
          <span className="inline-flex items-center gap-1">
            {getLabel('cycle_progress')}
          </span>
        ),
        cell: ({ row }) => <WarrantyCycleProgress row={row.original} />,
        size: 160,
        enableColumnFilter: true,
        filterFn: stageProgressFilterFn,
        meta: { filterType: 'stage-progress' },
      });
    }

    for (const field of ALL_DATA_FIELDS) {
      if (!isFieldVisible(field)) continue;
      const isStatus = STATUS_FIELDS.has(field);
      const isDate = DATE_FIELDS.has(field);
      const isNumber = NUMBER_FIELDS.has(field);
      const isMulti = MULTI_SELECT_FIELDS.has(field);
      const isText = TEXT_FIELDS.has(field);

      const filterType = isMulti ? 'multi-select'
        : isText ? 'text'
        : isDate ? 'date-range'
        : isNumber ? 'number-range'
        : isMulti ? 'multi-select'
        : null;
      const filterFn = isMulti ? multiSelectFilterFn
        : isText ? textFilterFn
        : isDate ? dateRangeFilterFn
        : isNumber ? numberRangeFilterFn
        : undefined;

      const col: ColumnDef<WarrantyRow> = {
        id: field,
        accessorFn: (r) => (r as any)[field],
        header: () => <span>{getLabel(field)}</span>,
        size: isDate ? 100 : isStatus ? 80 : isNumber ? 80 : 140,
        enableColumnFilter: !!filterType,
        filterFn: filterFn as any,
        meta: { filterType },
        cell: ({ getValue, row }) => {
          const v = getValue() as any;
          if (isStatus) return <StatusBadge value={v as WarrantyStatusToken | null} />;
          if (isDate) return <span className="text-xs">{formatDdMmm(v) || '—'}</span>;
          if (isNumber) return <span className="tabular-nums text-xs">{v ?? '—'}</span>;
          if (field === 'item_no') {
            return (
              <span className="font-mono text-xs">
                {v}{row.original.is_resubmission && (
                  <span className="ml-1 text-[10px] text-muted-foreground">·{row.original.resubmission_seq}</span>
                )}
              </span>
            );
          }
          if (v == null || v === '') return <span className="text-xs text-muted-foreground">—</span>;
          return <span className="text-xs">{String(v)}</span>;
        },
      };
      dataCols.push(col);
    }

    // Sort data cols by field config order
    const fieldOrder = sortFieldNames(dataCols.map((c) => c.id as string));
    dataCols.sort((a, b) => fieldOrder.indexOf(a.id as string) - fieldOrder.indexOf(b.id as string));

    return [...baseCols, ...dataCols];
  }, [getLabel, isFieldVisible, sortFieldNames, childCounts, collapsedParents]);

  // Column visibility from field config (built into columns above already via filter)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const table = useReactTable({
    data: visibleRows,
    columns,
    state: { sorting, columnFilters, globalFilter, rowSelection, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    globalFilterFn: globalFilterFn as any,
    enableRowSelection: true,
    getRowId: (row) => row.id,
  });

  // Active filter chips
  const activeChips = useMemo(() => {
    return columnFilters.map((f) => {
      const col = table.getColumn(f.id);
      const label = col?.columnDef.id ? getLabel(col.columnDef.id) : f.id;
      let summary = '';
      const v = f.value;
      if (Array.isArray(v)) summary = v.map((x) => x === EMPTY_TOKEN ? '(empty)' : x).join(', ');
      else if (v && typeof v === 'object') {
        if (WARRANTY_STAGE_KEYS.some((k) => (v as any)[k]?.length)) {
          summary = WARRANTY_STAGE_KEYS
            .filter((k) => (v as any)[k]?.length)
            .map((k) => `${WARRANTY_STAGE_LABELS[k]}(${(v as any)[k].join(',')})`)
            .join(' · ');
        } else if ('text' in v || 'emptyOnly' in v) {
          summary = (v as any).text || ((v as any).emptyOnly ? '(empty)' : '');
        } else if ('from' in v || 'to' in v) {
          summary = `${(v as any).from ?? '*'} → ${(v as any).to ?? '*'}`;
          if ((v as any).emptyOnly) summary = '(empty)';
        } else if ('min' in v || 'max' in v) {
          summary = `${(v as any).min ?? '*'} – ${(v as any).max ?? '*'}`;
          if ((v as any).emptyOnly) summary = '(empty)';
        }
      } else if (typeof v === 'string') summary = v;
      return { id: f.id, label, summary };
    });
  }, [columnFilters, getLabel, table]);

  // Virtualizer
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { rows: rowModelRows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rowModelRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  // Export
  const handleExport = (mode: 'all' | 'visible' | 'selected') => {
    let exportRows: WarrantyRow[];
    if (mode === 'selected') {
      const ids = Object.keys(rowSelection);
      exportRows = rows.filter((r) => ids.includes(r.id));
    } else if (mode === 'visible') {
      exportRows = rowModelRows.map((r) => r.original);
    } else {
      exportRows = rows;
    }
    if (exportRows.length === 0) {
      toast({ title: 'Nothing to export', variant: 'destructive' });
      return;
    }
    const data = exportRows.map((r) => {
      const o: Record<string, any> = { No: r.item_no };
      ALL_DATA_FIELDS.forEach((f) => {
        if (f === 'item_no') return;
        if (isFieldVisible(f)) o[getLabel(f)] = (r as any)[f];
      });
      o['Stage'] = r.current_stage;
      o['Status'] = r.current_status;
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Warranty');
    XLSX.writeFile(wb, `warranty-raw-data-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="space-y-3 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Warranty Deeds — Raw Data</h1>
          <p className="text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${rowModelRows.length} of ${rows.length} items`}
            {selectedCount > 0 && ` · ${selectedCount} selected`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/docs/import?sub=warranty')}>
            <Upload className="mr-1 h-4 w-4" /> Import
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1 h-4 w-4" /> Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1" align="end">
              <button className="block w-full px-2 py-1.5 text-left text-xs hover:bg-muted/50 rounded"
                onClick={() => handleExport('all')}>All ({rows.length})</button>
              <button className="block w-full px-2 py-1.5 text-left text-xs hover:bg-muted/50 rounded"
                onClick={() => handleExport('visible')}>Filtered ({rowModelRows.length})</button>
              <button className="block w-full px-2 py-1.5 text-left text-xs hover:bg-muted/50 rounded disabled:opacity-50"
                disabled={selectedCount === 0}
                onClick={() => handleExport('selected')}>Selected ({selectedCount})</button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Search + legend */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search no, item, subcontractor, PIC… (, for AND)"
            value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-8 pl-8 text-xs" />
        </div>
        <WarrantyCycleProgressLegend />
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {activeChips.map((c) => (
            <Badge key={c.id} variant="secondary" className="text-[10px] gap-1">
              <span className="font-medium">{c.label}:</span>
              <span className="opacity-80">{c.summary}</span>
              <button onClick={() => table.getColumn(c.id)?.setFilterValue(undefined)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <button className="text-[10px] text-muted-foreground hover:underline ml-1"
            onClick={() => setColumnFilters([])}>Clear all</button>
        </div>
      )}

      {/* Table */}
      <div className="flex max-h-[calc(100vh-260px)] flex-col overflow-hidden rounded border bg-card">
        <TopHorizontalScrollbar targetRef={tableContainerRef} width={table.getTotalSize()} />
        <div ref={tableContainerRef} className="min-w-0 flex-1 overflow-auto scrollbar-hide">
          <Table style={{ width: table.getTotalSize(), tableLayout: 'fixed' }}>
            <TableHeader className="bg-card">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-b bg-card [&>th]:sticky [&>th]:top-0 [&>th]:z-[2] [&>th]:bg-card">
                  {hg.headers.map((h) => {
                    const ft = (h.column.columnDef.meta as any)?.filterType;
                    return (
                      <TableHead key={h.id} style={{ width: h.getSize() }}
                        className="text-xs h-9 cursor-pointer select-none"
                        onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}>
                        <div className="flex items-center gap-1">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === 'asc' && <span>▲</span>}
                          {h.column.getIsSorted() === 'desc' && <span>▼</span>}
                          {ft && <ColumnFilterDropdown column={h.column} filterType={ft} />}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground text-sm">Loading…</TableCell></TableRow>
              ) : rowModelRows.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground text-sm">
                  No matching warranty items.
                </TableCell></TableRow>
              ) : (
                <>
                  {paddingTop > 0 && <TableRow style={{ height: paddingTop }}><TableCell colSpan={columns.length} className="p-0" /></TableRow>}
                  {virtualRows.map((vr) => {
                    const row = rowModelRows[vr.index];
                    const r = row.original;
                    return (
                      <TableRow key={row.id}
                        data-index={vr.index}
                        ref={(el) => el && rowVirtualizer.measureElement(el)}
                        className={cn('cursor-pointer hover:bg-muted/40',
                          r.is_resubmission && 'bg-muted/20',
                          row.getIsSelected() && 'bg-primary/5')}
                        onClick={() => navigate(`/docs/warranty/${r.id}`)}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className={cn('py-1.5', r.is_resubmission && cell.column.id === 'item_no' && 'pl-6')}
                            style={{ width: cell.column.getSize() }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                  {paddingBottom > 0 && <TableRow style={{ height: paddingBottom }}><TableCell colSpan={columns.length} className="p-0" /></TableRow>}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
