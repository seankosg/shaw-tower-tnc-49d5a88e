import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel,
  getFacetedRowModel, getFacetedUniqueValues,
  type ColumnDef, type ColumnFiltersState, type ColumnSizingState,
  type RowSelectionState, type SortingState, type VisibilityState,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, Filter, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useDocsFieldConfig } from '@/hooks/useDocsFieldConfig';
import { useFrozenColumnCount } from '@/hooks/useAppSettings';
import { useIsMobile } from '@/hooks/use-mobile';
import { USER_TYPE_LABELS, formatTeamLabel } from '@/types/enums';
import { TopHorizontalScrollbar } from '@/components/raw-data/TopHorizontalScrollbar';
import { cn } from '@/lib/utils';
import { isMetaField } from '@/lib/meta-fields';
import { formatDdMmm } from '@/lib/format';
import { getOriginHeaderStyle } from '@/lib/origin-header-style';
import { buildColumnFilterChips } from '@/lib/filter-chip-utils';
import { useSparePartCache, refreshSparePartCache } from '@/lib/spare-part-cache';
import {
  SPARE_PART_RAW_FIELDS, SPARE_PART_DATE_FIELDS, SPARE_PART_TEXT_FIELDS,
  SPARE_PART_DATETIME_FIELDS, SPARE_PART_SEARCH_FIELDS,
  isOverdueSparePart, isDeliveryComplete,
  type SparePartItem,
} from '@/lib/spare-part-utils';
import {
  SPARE_PART_STATUS_BADGE_VARIANT, normalizeSparePartStatus,
} from '@/lib/docs-spare-part-status';
import {
  exportSparePartRawToExcel, exportSparePartRawToExcelBySubcontractor,
  exportSparePartRawToZipBySubcontractor,
} from '@/lib/docs-spare-part-excel-export';
import { SparePartProcurementProgress, SparePartProgressLegend } from '@/components/spare-parts/SparePartProcurementProgress';

const ZIP_THRESHOLD = 7;
const EMPTY_TOKEN = '__EMPTY__';
const DEFAULT_SORTING: SortingState = [{ id: 'category', desc: false }, { id: 'sn', desc: false }];

type Row = SparePartItem;

// ───────── Filter functions (mirror Defect Raw Data) ─────────
const tokenizeAnd = (text: string): string[] =>
  String(text ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
const matchesAllTokens = (haystack: string, query: string): boolean => {
  const tokens = tokenizeAnd(query);
  if (!tokens.length) return true;
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
const globalFn = (row: any, _id: string, filterValue: string) => {
  if (!tokenizeAnd(filterValue).length) return true;
  const o = row.original as Row;
  return SPARE_PART_SEARCH_FIELDS.some((f) => matchesAllTokens(String((o as any)[f] ?? ''), filterValue));
};

function uniqueOptions(data: Row[], field: keyof Row) {
  return [...new Set(data.map((r) => r[field]).filter((v): v is string => Boolean(v)))]
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ value: v, label: v }));
}

// ───────── Filter dropdowns (compact copies) ─────────
function MultiSelectDropdown({ column, options }: { column: any; options: { value: string; label: string }[] }) {
  const selected: string[] = (column.getFilterValue() as string[]) ?? [];
  const isActive = selected.length > 0;
  const labelMap = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const facets = column.getFacetedUniqueValues?.() as Map<any, number> | undefined;
  const items = useMemo(() => {
    const counts = new Map<string, number>();
    let emptyCount = 0;
    facets?.forEach((c, v) => {
      if (v == null || v === '') emptyCount += c;
      else counts.set(String(v), (counts.get(String(v)) ?? 0) + c);
    });
    selected.forEach((v) => { if (v !== EMPTY_TOKEN && !counts.has(v)) counts.set(v, 0); });
    options.forEach((o) => { if (!counts.has(o.value)) counts.set(o.value, 0); });
    const list = [...counts.entries()].map(([value, count]) => ({ value, label: labelMap.get(value) ?? value, count }));
    list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return [{ value: EMPTY_TOKEN, label: '(Empty)', count: emptyCount }, ...list];
  }, [facets, options, labelMap, selected]);
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    column.setFilterValue(next.length ? next : undefined);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button onClick={(e) => e.stopPropagation()}
          className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80', isActive ? 'text-primary' : 'text-muted-foreground/50')}>
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-h-72 w-56 overflow-auto p-2" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2 px-1">
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(items.map((o) => o.value))}>Select all</button>
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(undefined)}>Clear all</button>
        </div>
        {items.map((option) => (
          <label key={option.value}
            className={cn('flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50',
              option.count === 0 && !selected.includes(option.value) && 'text-muted-foreground/60')}>
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
        <button onClick={(e) => e.stopPropagation()}
          className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80', isActive ? 'text-primary' : 'text-muted-foreground/50')}>
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 space-y-2 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-1">
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(undefined)}>Clear all</button>
        </div>
        <Input placeholder="Search... (use , for AND)" value={text} disabled={emptyOnly}
          onChange={(e) => update({ text: e.target.value || undefined })} className="h-7 text-xs" />
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox checked={emptyOnly} onCheckedChange={(c) => update({ emptyOnly: !!c, text: undefined })} className="h-3.5 w-3.5" />
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
        <button onClick={(e) => e.stopPropagation()}
          className={cn('inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80', isActive ? 'text-primary' : 'text-muted-foreground/50')}>
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">From</label>
          <Input type="date" value={fv?.from ?? ''} onChange={(e) => update({ from: e.target.value || undefined })} className="h-7 text-xs" disabled={!!fv?.emptyOnly} />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">To</label>
          <Input type="date" value={fv?.to ?? ''} onChange={(e) => update({ to: e.target.value || undefined })} className="h-7 text-xs" disabled={!!fv?.emptyOnly} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs">
          <Checkbox checked={!!fv?.emptyOnly} onCheckedChange={(c) => update({ emptyOnly: !!c, from: undefined, to: undefined })} className="h-3.5 w-3.5" />
          Empty only
        </label>
        <div className="px-1">
          <button className="text-[11px] text-muted-foreground hover:underline" onClick={() => column.setFilterValue(undefined)}>Clear</button>
        </div>
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

export default function DocsSparePartRawDataPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { items: cachedItems, initialLoaded } = useSparePartCache();
  const items = cachedItems as Row[];
  const loading = !initialLoaded;
  const { isFieldVisible, getLabel, sortFieldNames, fields: fieldConfigRows, getSourceOrigin } =
    useDocsFieldConfig('spare_part');
  const { roles } = useAuth() as any;

  const storageKey = user?.id ? `spare-part-raw-data-state:${user.id}` : 'spare-part-raw-data-state:anon';
  const [stateLoaded, setStateLoaded] = useState(false);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [searchInput, setSearchInput] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnVisibilityOverrides, setColumnVisibilityOverrides] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'single' | 'per-subcon'>('single');
  const [exportFormat, setExportFormat] = useState<'view' | 'reimport'>('view');
  const [exportBusy, setExportBusy] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Restore state from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.sorting) && p.sorting.length) setSorting(p.sorting);
        if (Array.isArray(p.columnFilters)) setColumnFilters(p.columnFilters);
        if (typeof p.globalFilter === 'string') { setGlobalFilter(p.globalFilter); setSearchInput(p.globalFilter); }
        if (p.columnSizing && typeof p.columnSizing === 'object') setColumnSizing(p.columnSizing);
        if (p.columnVisibility && typeof p.columnVisibility === 'object') setColumnVisibilityOverrides(p.columnVisibility);
      }
    } catch { /* ignore */ }
    setStateLoaded(true);
  }, [storageKey]);

  // Debounced search
  useEffect(() => { const t = window.setTimeout(() => setGlobalFilter(searchInput), 300); return () => window.clearTimeout(t); }, [searchInput]);

  // Persist state
  useEffect(() => {
    if (!stateLoaded) return;
    const t = window.setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ sorting, columnFilters, globalFilter, columnSizing, columnVisibility: columnVisibilityOverrides })); } catch { /* ignore */ }
    }, 500);
    return () => window.clearTimeout(t);
  }, [stateLoaded, storageKey, sorting, columnFilters, globalFilter, columnSizing, columnVisibilityOverrides]);

  // URL drill-down: ?overdue, ?asOf, ?subcontractor, ?hdec_pic, ?team, ?trade,
  //                  ?status, ?po_status, ?po_pending, ?eta_missing, ?delivery_pending, ?stage
  const filteredBaseData = useMemo(() => {
    let next = items;
    const asOf = searchParams.get('asOf') ?? new Date().toISOString().slice(0, 10);
    if (searchParams.get('overdue') === 'true') {
      next = next.filter((r) => isOverdueSparePart(r, asOf));
    }
    const subcon = searchParams.get('subcontractor');
    if (subcon) next = next.filter((r) => String(r.subcontractor_name ?? '') === subcon);
    const hdecPic = searchParams.get('hdec_pic');
    if (hdecPic) next = next.filter((r) => String(r.hdec_pic_name ?? '') === hdecPic);
    const team = searchParams.get('team');
    if (team) next = next.filter((r) => String(r.team ?? '') === team);
    const trade = searchParams.get('trade');
    if (trade) next = next.filter((r) => String(r.trade ?? '') === trade);
    const status = searchParams.get('status');
    if (status) next = next.filter((r) => String(r.status ?? '').toLowerCase() === status.toLowerCase());
    const poStatus = searchParams.get('po_status');
    if (poStatus) next = next.filter((r) => String(r.po_status ?? '').toLowerCase() === poStatus.toLowerCase());
    if (searchParams.get('po_pending') === 'true') {
      next = next.filter((r) => !(r as any).po_issued_date);
    }
    if (searchParams.get('eta_missing') === 'true') {
      next = next.filter((r) => !(r as any).eta_date && !(r as any).delivered_date);
    }
    if (searchParams.get('delivery_pending') === 'true') {
      next = next.filter((r) => !(r as any).delivered_date);
    }
    return next;
  }, [items, searchParams]);

  const optionFields = useMemo(() => ({
    team: uniqueOptions(items, 'team').map((o) => ({ value: o.value, label: formatTeamLabel(o.value) })),
    status: uniqueOptions(items, 'status'),
    po_status: uniqueOptions(items, 'po_status'),
    subcontractor_name: uniqueOptions(items, 'subcontractor_name'),
    hdec_pic_name: uniqueOptions(items, 'hdec_pic_name'),
    hdec_eng_name: uniqueOptions(items, 'hdec_eng_name'),
    category: uniqueOptions(items, 'category'),
    sub_category: uniqueOptions(items, 'sub_category'),
    location: uniqueOptions(items, 'location'),
    floor_level: uniqueOptions(items, 'floor_level'),
    item_type: uniqueOptions(items, 'item_type'),
    trade: uniqueOptions(items, 'trade'),
    unit: uniqueOptions(items, 'unit'),
  }), [items]);

  const sizeByField: Record<string, number> = {
    item_no: 70, sn_outline: 110,
    sn: 100, category: 90, sub_category: 130, parent_item: 180, material: 260,
    spec_ref: 130, location: 130, floor_level: 90, item_type: 110, specification: 220,
    size: 90, spares_requirements: 200, unit: 70, spares_quantity: 80, storage_area_required: 160,
    status: 110, po_status: 100, material_lead_time: 130,
    planned_confirm_date: 110, actual_confirm_date: 110, direction_to_subcon_date: 110,
    eta_date: 100, planned_po_date: 110, actual_po_date: 110,
    planned_delivery_date: 120, actual_delivery_date: 120,
    subcontractor_name: 180, hdec_pic_name: 110, hdec_eng_name: 110, team: 80, trade: 90,
    remarks: 220, updated_at: 130, created_at: 130,
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const selectColumn: ColumnDef<Row> = {
      id: '__select', size: 36, enableSorting: false, enableColumnFilter: false, enableResizing: false,
      header: ({ table: t }) => (
        <span onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
          <Checkbox checked={t.getIsAllRowsSelected() ? true : t.getIsSomeRowsSelected() ? 'indeterminate' : false}
            onCheckedChange={(c) => t.toggleAllRowsSelected(!!c)} className="h-3.5 w-3.5" />
        </span>
      ),
      cell: ({ row }) => (
        <span onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
          <Checkbox checked={row.getIsSelected()} onCheckedChange={(c) => row.toggleSelected(!!c)} className="h-3.5 w-3.5" />
        </span>
      ),
      meta: { isSelectColumn: true },
    };

    const progressColumn: ColumnDef<Row> = {
      id: 'procurement_progress',
      header: 'Progress',
      size: 130,
      enableSorting: false,
      enableColumnFilter: false,
      cell: ({ row }) => <SparePartProcurementProgress item={row.original} />,
    };

    const dataColumns: ColumnDef<Row>[] = SPARE_PART_RAW_FIELDS.map((field) => {
      const isDate = SPARE_PART_DATE_FIELDS.has(field);
      const isDateTime = SPARE_PART_DATETIME_FIELDS.has(field);
      const isText = SPARE_PART_TEXT_FIELDS.has(field);
      const filterType = isDate || isDateTime ? 'date-range' : isText ? 'text' : 'multi-select';
      return {
        id: field,
        accessorKey: field,
        header: getLabel(field),
        size: sizeByField[field] ?? 130,
        filterFn: filterType === 'date-range' ? dateRangeFilterFn : filterType === 'text' ? textFilterFn : multiSelectFilterFn,
        meta: { filterType, filterOptions: (optionFields as any)[field] ?? [], label: getLabel(field) },
        cell: ({ row, getValue }) => {
          const v = getValue() as any;
          if (field === 'status') {
            if (!v) return '—';
            const norm = normalizeSparePartStatus(v);
            return <Badge variant={SPARE_PART_STATUS_BADGE_VARIANT[norm]} className="text-[10px]">{v}</Badge>;
          }
          if (field === 'po_status') return v ? <Badge variant="outline" className="text-[10px]">{v}</Badge> : '—';
          if (field === 'team') return formatTeamLabel(v);
          if (isDate) return formatDdMmm(v ? String(v).slice(0, 10) : null);
          if (isDateTime) return v ? formatDdMmm(String(v).slice(0, 10)) : '—';
          const text = String(v ?? '—');
          if (['material', 'specification', 'spares_requirements', 'storage_area_required', 'remarks'].includes(field)) {
            return <span className="block truncate" title={text === '—' ? undefined : text}>{text}</span>;
          }
          return text;
        },
      } as ColumnDef<Row>;
    });

    // Dynamic columns: any enabled docs_field_config row not in SPARE_PART_RAW_FIELDS
    const knownIds = new Set<string>(SPARE_PART_RAW_FIELDS as readonly string[]);
    const dynamicColumns: ColumnDef<Row>[] = (fieldConfigRows ?? [])
      .filter((r) => r && r.is_enabled && !knownIds.has(r.field_name) && !isMetaField(r.field_name))
      .map((r) => {
        const fieldName = r.field_name;
        const headerKey = r.original_header || fieldName;
        const accessorFn = (row: Row): any => {
          const direct = (row as any)[fieldName];
          if (direct != null && direct !== '') return direct;
          const rawP = (row as any).raw_payload;
          if (rawP && typeof rawP === 'object') {
            const v = rawP[headerKey] ?? rawP[fieldName];
            if (v != null && v !== '') return v;
          }
          const customP = (row as any).custom_payload;
          if (customP && typeof customP === 'object') {
            return customP[headerKey] ?? customP[fieldName] ?? null;
          }
          return null;
        };
        return {
          id: fieldName,
          accessorFn,
          header: r.display_name || getLabel(fieldName),
          size: 140,
          filterFn: textFilterFn,
          meta: { filterType: 'text', filterOptions: [], label: r.display_name || getLabel(fieldName), isDynamic: true },
          cell: ({ getValue }) => {
            const v = getValue() as any;
            if (v == null || v === '') return '—';
            return <span className="block truncate" title={String(v)}>{String(v)}</span>;
          },
        } as ColumnDef<Row>;
      });

    return [selectColumn, progressColumn, ...dataColumns, ...dynamicColumns];
  }, [optionFields, getLabel, fieldConfigRows]);

  // All column ids (static + dynamic)
  const allColumnIds = useMemo<string[]>(
    () => columns.map((c) => (c as any).id ?? (c as any).accessorKey).filter(Boolean) as string[],
    [columns],
  );

  // Visibility derived from Field Config (+ user overrides from localStorage)
  const columnVisibility = useMemo<VisibilityState>(() => {
    const v: VisibilityState = { __select: true, procurement_progress: true };
    for (const id of allColumnIds) {
      if (id === '__select' || id === 'procurement_progress') continue;
      if (Object.prototype.hasOwnProperty.call(columnVisibilityOverrides, id)) {
        v[id] = columnVisibilityOverrides[id]!;
      } else {
        v[id] = isFieldVisible(id, roles ?? []);
      }
    }
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allColumnIds, isFieldVisible, roles, columnVisibilityOverrides]);

  // Order from Field Config sort_order (pinned first)
  const columnOrder = useMemo(() => {
    const PINNED_FRONT = ['__select', 'procurement_progress'];
    const remaining = allColumnIds.filter((id) => !PINNED_FRONT.includes(id));
    return [...PINNED_FRONT, ...sortFieldNames(remaining)];
  }, [allColumnIds, sortFieldNames]);

  const table = useReactTable({
    data: filteredBaseData,
    columns,
    state: { sorting, columnFilters, globalFilter, columnSizing, columnVisibility, columnOrder, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: (updater) => {
      setColumnVisibilityOverrides((prev) => {
        const next = typeof updater === 'function' ? (updater as any)(columnVisibility) : updater;
        return { ...prev, ...next };
      });
    },
    onRowSelectionChange: setRowSelection,
    globalFilterFn: globalFn,
    enableMultiSort: true,
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const columnFilterChips = useMemo(() => buildColumnFilterChips(table, columnFilters), [table, columnFilters]);
  const removeColumnFilter = (id: string) => setColumnFilters((p) => p.filter((f) => f.id !== id));

  const exportMeta = {
    userName: profile?.name || profile?.login_id || 'Unknown',
    userType: profile?.user_type ? USER_TYPE_LABELS[profile.user_type] : '',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Spare Parts Raw Data</h1>
          <p className="text-sm text-muted-foreground">Spare stock procurement tracking.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/docs/import')}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (table.getSortedRowModel().rows.length === 0) {
              toast({ title: 'No rows to export', variant: 'destructive' }); return;
            }
            setExportMode('single'); setExportFormat('view'); setExportDialogOpen(true);
          }}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Excel
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refreshSparePartCache()}>Refresh</Button>
        </div>
      </div>

      {columnFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Active column filters:</span>
          {columnFilterChips.map((chip) => (
            <button key={chip.id} onClick={() => removeColumnFilter(chip.id)}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-secondary/80">
              {chip.label} ✕
            </button>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => setColumnFilters([])}>Clear all</Button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search spare parts... (comma = AND)" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)} className="h-9 pl-8" />
        </div>
        <span className="self-center text-sm text-muted-foreground">{filteredCount} records</span>
        {sorting.length > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setSorting(DEFAULT_SORTING)}>
            Clear sort ({sorting.length})
          </Button>
        )}
        <div className="ml-auto"><SparePartProgressLegend /></div>
      </div>

      <SparePartTableView table={table} loading={loading} sorting={sorting} navigate={navigate} tableRef={tableRef} getSourceOrigin={getSourceOrigin} />

      <Dialog open={exportDialogOpen} onOpenChange={(o) => { if (!o && exportBusy) return; setExportDialogOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Spare Parts Raw Data</DialogTitle>
            <DialogDescription>Choose how you want to export the currently filtered rows.</DialogDescription>
          </DialogHeader>
          {(() => {
            const sortedRows = table.getSortedRowModel().rows;
            const subconSet = new Set<string>();
            for (const r of sortedRows) {
              const raw = (r.original as any)?.subcontractor_name;
              subconSet.add(raw && String(raw).trim() ? String(raw).trim() : 'Unassigned');
            }
            const willZip = subconSet.size >= ZIP_THRESHOLD;
            return (
              <div className="space-y-4 py-2">
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Format</div>
                  <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as any)} className="gap-2">
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="view" id="ef-view" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="ef-view" className="cursor-pointer text-sm font-medium">View-friendly</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Human-readable. Date columns kept as Excel date type.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="reimport" id="ef-reimport" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="ef-reimport" className="cursor-pointer text-sm font-medium">Re-import ready</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Includes ID + S/N anchor columns for round-trip update.</p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Output</div>
                  <RadioGroup value={exportMode} onValueChange={(v) => setExportMode(v as any)} className="gap-2">
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="single" id="em-single" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="em-single" className="cursor-pointer text-sm font-medium">Single file</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{sortedRows.length} rows in one .xlsx.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="per-subcon" id="em-subcon" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="em-subcon" className="cursor-pointer text-sm font-medium">One file per Subcontractor</Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {willZip
                            ? <span className="text-amber-600">{subconSet.size} subs — packaged as .zip.</span>
                            : <>{subconSet.size} download{subconSet.size === 1 ? '' : 's'}.</>}
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(false)} disabled={exportBusy}>Cancel</Button>
            <Button size="sm" disabled={exportBusy} onClick={async () => {
              try {
                if (exportMode === 'single') {
                  const r = exportSparePartRawToExcel({ table, fieldConfig: fieldConfigRows, globalFilter, meta: exportMeta, format: exportFormat });
                  toast({ title: 'Export complete', description: `${r.rowCount} rows → ${r.fileName}` });
                  setExportDialogOpen(false);
                } else {
                  const subconSet = new Set<string>();
                  for (const r of table.getSortedRowModel().rows) {
                    const raw = (r.original as any)?.subcontractor_name;
                    subconSet.add(raw && String(raw).trim() ? String(raw).trim() : 'Unassigned');
                  }
                  if (subconSet.size >= ZIP_THRESHOLD) {
                    setExportBusy(true);
                    const r = await exportSparePartRawToZipBySubcontractor({ table, fieldConfig: fieldConfigRows, globalFilter, meta: exportMeta, format: exportFormat });
                    toast({ title: 'Export complete', description: `${r.fileCount} files in ${r.zipFileName} (${r.rowCount} rows)` });
                    setExportBusy(false); setExportDialogOpen(false);
                  } else {
                    const r = exportSparePartRawToExcelBySubcontractor({ table, fieldConfig: fieldConfigRows, globalFilter, meta: exportMeta, format: exportFormat });
                    toast({ title: 'Export complete', description: `${r.fileCount} files (${r.rowCount} rows)` });
                    setExportDialogOpen(false);
                  }
                }
              } catch (err: any) {
                toast({ title: 'Export failed', description: err?.message ?? String(err), variant: 'destructive' });
                setExportBusy(false);
              }
            }}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> {exportBusy ? 'Exporting…' : 'Export'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ViewProps {
  table: ReturnType<typeof useReactTable<Row>>;
  loading: boolean;
  sorting: SortingState;
  navigate: (path: string) => void;
  tableRef: React.RefObject<HTMLDivElement>;
  getSourceOrigin?: (field: string) => 'hdec' | 'aconex' | 'system';
}

function SparePartTableView({ table, loading, sorting, navigate, tableRef, getSourceOrigin }: ViewProps) {
  const isMobile = useIsMobile();
  const { value: frozenSetting } = useFrozenColumnCount();
  const userFrozen = isMobile ? 1 : Math.min(Math.max(Number(frozenSetting) || 1, 1), 4);
  // +1 for select column, +1 for progress column
  const frozenCount = userFrozen + 2;

  const leafColumns = table.getVisibleLeafColumns();
  const stickyLefts = useMemo(() => {
    const lefts: number[] = []; let acc = 0;
    for (let i = 0; i < frozenCount && i < leafColumns.length; i++) { lefts.push(acc); acc += leafColumns[i].getSize(); }
    return lefts;
  }, [leafColumns, frozenCount, table.getState().columnSizing]);
  const frozenWidth = useMemo(() => leafColumns.slice(0, frozenCount).reduce((s, c) => s + c.getSize(), 0),
    [leafColumns, frozenCount, table.getState().columnSizing]);
  const totalWidth = useMemo(() => leafColumns.reduce((s, c) => s + c.getSize(), 0),
    [leafColumns, table.getState().columnSizing]);

  const rows = table.getRowModel().rows;
  const ROW_HEIGHT = 36;
  const rowVirtualizer = useVirtualizer({
    count: rows.length, getScrollElement: () => tableRef.current,
    estimateSize: () => ROW_HEIGHT, overscan: 12,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const padTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const padBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const headerGroup = table.getHeaderGroups().at(-1);
  const allHeaders = headerGroup?.headers ?? [];

  const renderHeader = (header: any, index: number) => {
    const isSticky = index < frozenCount;
    const isLastSticky = index === frozenCount - 1;
    const originStyle = getSourceOrigin ? getOriginHeaderStyle(getSourceOrigin(header.column.id)) : getOriginHeaderStyle('system');
    return (
      <TableHead key={header.id} data-column-id={header.column.id}
        style={{
          width: header.getSize(), minWidth: header.getSize(), maxWidth: header.getSize(),
          ...(isSticky ? { position: 'sticky', left: stickyLefts[index], zIndex: 3, background: originStyle.stickyBg } : {}),
        }}
        className={cn(
          'relative h-9 cursor-pointer select-none whitespace-nowrap border-b px-3 py-0 text-left text-xs font-medium',
          !isSticky && (originStyle.bg || 'bg-background'),
          originStyle.border,
          isLastSticky && 'shadow-[2px_0_4px_-2px_hsl(var(--border))]',
        )}
        onClick={header.column.getToggleSortingHandler()}>
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
          <div onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()}
            onClick={(e) => e.stopPropagation()}
            className={cn('absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none bg-transparent hover:bg-primary/40',
              header.column.getIsResizing() && 'bg-primary/60')} />
        )}
      </TableHead>
    );
  };

  const stickyBgFor = (row: Row, index: number): string => {
    const closed = isDeliveryComplete(row);
    const overdue = isOverdueSparePart(row, new Date().toISOString().slice(0, 10));
    const base = 'hsl(var(--background))';
    const opaque = `linear-gradient(${base}, ${base})`;
    if (hoveredIndex === index) return `${opaque}, hsl(var(--muted) / 0.95)`;
    if (overdue && !closed) return `${opaque}, hsl(var(--destructive) / 0.06)`;
    if (closed) return `${opaque}, hsl(var(--muted) / 0.45)`;
    return base;
  };

  return (
    <div className="flex max-h-[calc(100vh-220px)] flex-col overflow-hidden rounded-md border bg-background">
      <TopHorizontalScrollbar targetRef={tableRef} width={totalWidth} frozenWidth={frozenWidth} />
      <div ref={tableRef} className="min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
        <Table style={{ width: totalWidth, tableLayout: 'fixed' }}>
          <TableHeader className="bg-background">
            <TableRow className="border-b bg-background [&>th]:sticky [&>th]:top-0 [&>th]:z-[2] [&>th]:bg-background">
              {allHeaders.map(renderHeader)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={leafColumns.length} className="py-8 text-center text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={leafColumns.length} className="py-8 text-center text-muted-foreground">No spare parts found. Use Import to upload data.</TableCell></TableRow>
            ) : (
              <>
                {padTop > 0 && (<tr style={{ height: padTop }} aria-hidden><td colSpan={leafColumns.length} style={{ padding: 0, border: 0 }} /></tr>)}
                {virtualRows.map((vr) => {
                  const row = rows[vr.index];
                  const closed = isDeliveryComplete(row.original);
                  const overdue = isOverdueSparePart(row.original, new Date().toISOString().slice(0, 10));
                  const stickyBg = stickyBgFor(row.original, vr.index);
                  return (
                    <TableRow key={row.id} data-index={vr.index}
                      style={{ height: ROW_HEIGHT, maxHeight: ROW_HEIGHT }}
                      className={cn('cursor-pointer',
                        closed && 'bg-muted/30 text-muted-foreground',
                        overdue && !closed && 'bg-destructive/5',
                        hoveredIndex === vr.index && 'bg-muted/50')}
                      onMouseEnter={() => setHoveredIndex(vr.index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={() => navigate(`/docs/spare-part/${row.original.id}`)}>
                      {row.getVisibleCells().map((cell, ci) => {
                        const isSticky = ci < frozenCount;
                        const isLastSticky = ci === frozenCount - 1;
                        return (
                          <TableCell key={cell.id} data-column-id={cell.column.id}
                            style={{
                              width: cell.column.getSize(), minWidth: cell.column.getSize(), maxWidth: cell.column.getSize(),
                              height: ROW_HEIGHT, maxHeight: ROW_HEIGHT, overflow: 'hidden',
                              ...(isSticky ? { position: 'sticky', left: stickyLefts[ci], zIndex: 1, background: stickyBg } : {}),
                            }}
                            className={cn('truncate whitespace-nowrap py-2 px-3 text-xs',
                              isLastSticky && 'shadow-[2px_0_4px_-2px_hsl(var(--border))]')}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                {padBottom > 0 && (<tr style={{ height: padBottom }} aria-hidden><td colSpan={leafColumns.length} style={{ padding: 0, border: 0 }} /></tr>)}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
