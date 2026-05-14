import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  type SortingState,
  type VisibilityState,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, Filter, Search, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useDocsFieldConfig } from '@/hooks/useDocsFieldConfig';
import { useFrozenColumnCount } from '@/hooks/useAppSettings';
import { useIsMobile } from '@/hooks/use-mobile';
import { USER_TYPE_LABELS } from '@/types/enums';
import { cn } from '@/lib/utils';
import { getOriginHeaderStyle } from '@/lib/origin-header-style';
import {
  EMPTY_TOKEN,
  multiSelectFilterFn,
  textFilterFn,
  dateRangeFilterFn,
  matchesAllTokens,
  tokenizeAnd,
} from '@/lib/raw-data-filter-fns';
import { ColumnFilterDropdown } from '@/components/raw-data/ColumnFilterDropdowns';
import { TopHorizontalScrollbar } from '@/components/raw-data/TopHorizontalScrollbar';
import { buildColumnFilterChips } from '@/lib/filter-chip-utils';
import { inferFilterType } from '@/lib/field-filter-type';
import { SPARE_PART_STATUS_BADGE_VARIANT, normalizeSparePartStatus } from '@/lib/docs-spare-part-status';
import {
  exportSparePartRawToExcel,
  exportSparePartRawToExcelBySubcontractor,
  exportSparePartRawToZipBySubcontractor,
} from '@/lib/spare-part-excel-export';

const ZIP_THRESHOLD = 7;
const DEFAULT_SORTING: SortingState = [{ id: 'sn', desc: false }];

const SPARE_PART_RAW_FIELDS = [
  'sn',
  'sn_outline',
  'level',
  'category',
  'parent_item',
  'sub_category',
  'spec_ref',
  'material',
  'spares_requirements',
  'unit',
  'spares_quantity',
  'storage_area_required',
  'status',
  'remarks',
  'subcontractor_name',
  'team',
  'trade',
  'hdec_pic_name',
  'hdec_eng_name',
  'updated_at',
  'created_at',
] as const;

const TEXT_FILTER_FIELDS = new Set([
  'sn',
  'sn_outline',
  'spec_ref',
  'material',
  'spares_requirements',
  'storage_area_required',
  'remarks',
]);

const DATE_FILTER_FIELDS = new Set([
  'updated_at',
  'created_at',
]);

const RAW_SEARCH_FIELDS = SPARE_PART_RAW_FIELDS;

interface SparePartRow {
  id: string;
  sn: string | null;
  sn_outline: string | null;
  level: string | null;
  category: string | null;
  parent_item: string | null;
  sub_category: string | null;
  spec_ref: string | null;
  material: string | null;
  spares_requirements: string | null;
  unit: string | null;
  spares_quantity: string | null;
  storage_area_required: string | null;
  status: string | null;
  remarks: string | null;
  subcontractor_name: string | null;
  team: string | null;
  trade: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  updated_at: string | null;
  created_at: string | null;
  raw_payload: any;
}

type LevelTab = 'leaf' | 'subcategory' | 'parent' | 'category' | 'all';

const LEVEL_LABEL: Record<string, string> = {
  category: 'Cat', parent: 'Parent', subcategory: 'Sub', leaf: 'Leaf',
};
const LEVEL_BADGE: Record<string, 'default' | 'secondary' | 'outline'> = {
  category: 'default', parent: 'secondary', subcategory: 'outline', leaf: 'outline',
};

const globalSparePartFilterFn = (row: any, _columnId: string, filterValue: string) => {
  if (tokenizeAnd(filterValue).length === 0) return true;
  const original = row.original as SparePartRow;
  return RAW_SEARCH_FIELDS.some((field) => matchesAllTokens(String((original as any)[field] ?? ''), filterValue));
};

function uniqueOptions(data: SparePartRow[], field: keyof SparePartRow) {
  return [...new Set(data.map((r) => r[field]).filter((v): v is string => Boolean(v)))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

export default function DocsSparePartRawDataPage() {
  const navigate = useNavigate();
  const { user, profile, roles } = useAuth();
  const { toast } = useToast();
  const { isFieldVisible, getLabel, sortFieldNames, fields: fieldConfigRows, getSourceOrigin } = useDocsFieldConfig('spare_part');

  const storageKey = user?.id ? `spare-part-raw-data-state:${user.id}` : 'spare-part-raw-data-state:anon';

  const [items, setItems] = useState<SparePartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateLoaded, setStateLoaded] = useState(false);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [searchInput, setSearchInput] = useState('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [levelTab, setLevelTab] = useState<LevelTab>('leaf');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'single' | 'per-subcon'>('single');
  const [exportBusy, setExportBusy] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const all: SparePartRow[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await (supabase as any)
        .from('docs_spare_part')
        .select('*')
        .eq('is_active', true)
        .order('sn', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
        break;
      }
      const batch = (data ?? []) as SparePartRow[];
      all.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    setItems(all);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void reload(); }, [reload]);

  const autoSizeColumn = useCallback((columnId: string) => {
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
  }, []);

  // Restore persisted state.
  useEffect(() => {
    setStateLoaded(false);
    let baseFilters: ColumnFiltersState = [];
    let baseSorting: SortingState = DEFAULT_SORTING;
    let baseGlobal = '';
    let baseSizing: ColumnSizingState = {};
    let baseLevel: LevelTab = 'leaf';
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        baseSizing = parsed.columnSizing && typeof parsed.columnSizing === 'object' ? parsed.columnSizing : {};
        baseSorting = Array.isArray(parsed.sorting) && parsed.sorting.length ? parsed.sorting : DEFAULT_SORTING;
        baseFilters = Array.isArray(parsed.columnFilters) ? parsed.columnFilters : [];
        baseGlobal = typeof parsed.globalFilter === 'string' ? parsed.globalFilter : '';
        if (typeof parsed.levelTab === 'string') baseLevel = parsed.levelTab as LevelTab;
      }
    } catch { /* ignore */ }
    setSorting(baseSorting);
    setColumnFilters(baseFilters);
    setGlobalFilter(baseGlobal);
    setSearchInput(baseGlobal);
    setColumnSizing(baseSizing);
    setLevelTab(baseLevel);
    setStateLoaded(true);
  }, [storageKey]);

  // Debounced search.
  useEffect(() => {
    const timer = window.setTimeout(() => setGlobalFilter(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Persist state.
  useEffect(() => {
    if (!stateLoaded) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          sorting: sorting.length ? sorting : DEFAULT_SORTING,
          columnFilters, globalFilter, columnSizing, levelTab,
        }));
      } catch { /* ignore */ }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [stateLoaded, storageKey, sorting, columnFilters, globalFilter, columnSizing, levelTab]);

  // Restore scroll position.
  useEffect(() => {
    if (!stateLoaded || loading) return;
    const element = tableRef.current;
    if (!element) return;
    const SCROLL_KEY = `${storageKey}:scroll`;
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
      } catch { /* ignore */ }
    }
    const save = () => localStorage.setItem(SCROLL_KEY, JSON.stringify({ top: element.scrollTop, left: element.scrollLeft }));
    element.addEventListener('scroll', save, { passive: true });
    return () => element.removeEventListener('scroll', save);
  }, [stateLoaded, storageKey, loading]);

  const filteredBaseData = useMemo(() => {
    if (levelTab === 'all') return items;
    return items.filter((r) => (r.level ?? 'leaf') === levelTab);
  }, [items, levelTab]);

  const optionFields = useMemo(() => ({
    level: [
      { value: 'category', label: 'Category' },
      { value: 'parent', label: 'Parent' },
      { value: 'subcategory', label: 'Sub-category' },
      { value: 'leaf', label: 'Leaf' },
    ],
    category: uniqueOptions(items, 'category'),
    parent_item: uniqueOptions(items, 'parent_item'),
    sub_category: uniqueOptions(items, 'sub_category'),
    unit: uniqueOptions(items, 'unit'),
    status: uniqueOptions(items, 'status'),
    subcontractor_name: uniqueOptions(items, 'subcontractor_name'),
    team: uniqueOptions(items, 'team'),
    trade: uniqueOptions(items, 'trade'),
    hdec_pic_name: uniqueOptions(items, 'hdec_pic_name'),
    hdec_eng_name: uniqueOptions(items, 'hdec_eng_name'),
    spares_quantity: uniqueOptions(items, 'spares_quantity'),
  }), [items]);

  const columns = useMemo<ColumnDef<SparePartRow>[]>(() => {
    const sizeByField: Record<string, number> = {
      sn: 110, sn_outline: 100, level: 80, category: 140, parent_item: 140,
      sub_category: 140, spec_ref: 140, material: 240, spares_requirements: 200,
      unit: 70, spares_quantity: 90, storage_area_required: 180, status: 110, remarks: 200,
      subcontractor_name: 150, team: 80, trade: 110, hdec_pic_name: 130, hdec_eng_name: 130,
      updated_at: 130, created_at: 130,
    };

    const dataColumns: ColumnDef<SparePartRow>[] = SPARE_PART_RAW_FIELDS.map((field) => {
      const isText = TEXT_FILTER_FIELDS.has(field);
      const isDate = DATE_FILTER_FIELDS.has(field);
      const filterType: 'text' | 'date-range' | 'multi-select' =
        isDate ? 'date-range' : isText ? 'text' : 'multi-select';
      const base: ColumnDef<SparePartRow> = {
        accessorKey: field,
        header: getLabel(field),
        size: sizeByField[field] ?? 130,
        filterFn: isDate ? dateRangeFilterFn : isText ? textFilterFn : multiSelectFilterFn,
        meta: {
          filterType,
          filterOptions: (optionFields as any)[field] ?? [],
        },
        cell: ({ row, getValue }) => {
          const value = getValue() as any;
          if (field === 'level') {
            const lvl = String(value ?? 'leaf');
            return (
              <Badge variant={LEVEL_BADGE[lvl] ?? 'outline'} className="text-[10px]">
                {LEVEL_LABEL[lvl] ?? lvl}
              </Badge>
            );
          }
          if (field === 'status' && value) {
            const norm = normalizeSparePartStatus(value);
            return <Badge variant={SPARE_PART_STATUS_BADGE_VARIANT[norm]} className="text-[10px]">{value}</Badge>;
          }
          if (field === 'sn' || field === 'spec_ref') {
            return <span className="font-mono text-[11px]">{String(value ?? '—')}</span>;
          }
          if (field === 'sn_outline') {
            return <span className="text-[11px] text-muted-foreground">{String(value ?? '')}</span>;
          }
          if (isDate) {
            return value ? formatDateShort(String(value)) : '—';
          }
          const text = String(value ?? '—');
          if (['material', 'spares_requirements', 'storage_area_required', 'remarks'].includes(field)) {
            return <span className="block truncate">{text}</span>;
          }
          return text;
        },
      };
      return base;
    });

    // Dynamic columns: enabled docs_field_config rows that aren't already in the static list.
    const knownIds = new Set<string>(SPARE_PART_RAW_FIELDS as readonly string[]);
    const dynamicColumns: ColumnDef<SparePartRow>[] = (fieldConfigRows ?? [])
      .filter((row) => row && row.is_enabled && !knownIds.has(row.field_name))
      .map((row) => {
        const fieldName = row.field_name;
        const headerKey = row.original_header || fieldName;
        const inferred = inferFilterType(fieldName, row.original_header);
        const filterFn =
          inferred === 'date-range' ? dateRangeFilterFn
          : inferred === 'multi-select' ? multiSelectFilterFn
          : textFilterFn;
        const accessorFn = (r: SparePartRow): any => {
          const direct = (r as any)[fieldName];
          if (direct != null && direct !== '') return direct;
          const payload = (r as any).raw_payload;
          if (payload && typeof payload === 'object') {
            return payload[headerKey] ?? payload[fieldName] ?? null;
          }
          return null;
        };
        const filterOptions = inferred === 'multi-select'
          ? [...new Set(items.map((r) => {
              const v = accessorFn(r);
              return v == null || v === '' ? '' : String(v);
            }).filter(Boolean))]
              .sort((a, b) => a.localeCompare(b))
              .map((v) => ({ value: v, label: v }))
          : [];
        return {
          id: fieldName,
          accessorFn,
          header: row.display_name || getLabel(fieldName),
          size: 140,
          filterFn,
          meta: { filterType: inferred, filterOptions, isDynamic: true },
          cell: ({ getValue }) => {
            const value = getValue() as any;
            if (value == null || value === '') return '—';
            if (inferred === 'date-range') return formatDateShort(String(value));
            return <span className="block truncate">{String(value)}</span>;
          },
        } as ColumnDef<SparePartRow>;
      });

    return [...dataColumns, ...dynamicColumns];
  }, [getLabel, optionFields, fieldConfigRows, items]);

  const allColumnIds = useMemo<string[]>(
    () => columns.map((c) => (c as any).id ?? (c as any).accessorKey).filter(Boolean) as string[],
    [columns],
  );

  const columnVisibility = useMemo<VisibilityState>(() => {
    const visibility: VisibilityState = {};
    for (const id of allColumnIds) {
      if (id === 'sn') visibility[id] = true; // anchor
      else visibility[id] = isFieldVisible(id, roles);
    }
    return visibility;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allColumnIds, isFieldVisible, roles]);

  const columnOrder = useMemo(() => {
    const PINNED_FRONT = ['sn'];
    const remaining = allColumnIds.filter((id) => !PINNED_FRONT.includes(id));
    return [...PINNED_FRONT, ...sortFieldNames(remaining)];
  }, [allColumnIds, sortFieldNames]);

  const table = useReactTable({
    data: filteredBaseData,
    columns,
    state: { sorting: sorting.length ? sorting : DEFAULT_SORTING, globalFilter, columnFilters, columnSizing, columnVisibility, columnOrder },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    globalFilterFn: globalSparePartFilterFn,
    enableMultiSort: true,
    enableSortingRemoval: true,
    isMultiSortEvent: (e) => (e as unknown as MouseEvent).shiftKey,
    maxMultiSortColCount: 5,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: { minSize: 64, maxSize: 640 },
  });

  const columnFilterChips = useMemo(() => buildColumnFilterChips(table, columnFilters), [table, columnFilters]);
  const removeColumnFilter = (id: string) => setColumnFilters((prev) => prev.filter((f) => f.id !== id));

  const handleExport = async () => {
    const meta = {
      userName: profile?.name || profile?.login_id || 'Unknown',
      userType: profile?.user_type ? USER_TYPE_LABELS[profile.user_type] : '',
    };
    try {
      if (exportMode === 'single') {
        const r = exportSparePartRawToExcel({ table, fieldConfig: fieldConfigRows, globalFilter, meta });
        toast({ title: 'Export complete', description: `${r.rowCount} rows → ${r.fileName}` });
        setExportDialogOpen(false);
      } else {
        const sortedRows = table.getSortedRowModel().rows;
        const set = new Set<string>();
        for (const r of sortedRows) {
          const raw = (r.original as any)?.subcontractor_name;
          set.add(raw && String(raw).trim() ? String(raw).trim() : 'Unassigned');
        }
        if (set.size >= ZIP_THRESHOLD) {
          setExportBusy(true);
          toast({ title: 'Packaging into ZIP', description: `${set.size} subcontractors — bundling into a single .zip.` });
          const r = await exportSparePartRawToZipBySubcontractor({ table, fieldConfig: fieldConfigRows, globalFilter, meta });
          toast({ title: 'Export complete', description: `${r.fileCount} files in ${r.zipFileName} (${r.rowCount} rows)` });
          setExportBusy(false);
        } else {
          const r = exportSparePartRawToExcelBySubcontractor({ table, fieldConfig: fieldConfigRows, globalFilter, meta });
          toast({ title: 'Export complete', description: `${r.fileCount} files (${r.rowCount} rows)` });
        }
        setExportDialogOpen(false);
      }
    } catch (err) {
      console.error('Spare Part export failed', err);
      toast({ title: 'Export failed', description: String((err as Error)?.message ?? err), variant: 'destructive' });
      setExportBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Spare Part Raw Data</h1>
          <p className="text-sm text-muted-foreground">Spare stock quantities & spares requirements tracking.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/docs/import?sub=spare_part')}>
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
              setExportDialogOpen(true);
            }}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Excel
          </Button>
        </div>
      </div>

      <Tabs value={levelTab} onValueChange={(v) => setLevelTab(v as LevelTab)}>
        <TabsList>
          <TabsTrigger value="leaf">Leaf only</TabsTrigger>
          <TabsTrigger value="subcategory">Sub-category</TabsTrigger>
          <TabsTrigger value="parent">Parent</TabsTrigger>
          <TabsTrigger value="category">Category</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

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
          <Input
            placeholder="Search spare parts... (comma = AND)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
        <span className="self-center text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} records
        </span>
        {sorting.length > 0 && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setSorting(DEFAULT_SORTING)}>
            Clear sort ({sorting.length})
          </Button>
        )}
        <span className="hidden self-center text-xs text-muted-foreground md:inline">
          Tip: Shift+Click headers for multi-sort · Click <Filter className="inline h-3 w-3" /> to filter columns
        </span>
      </div>

      <SparePartRawTableView
        table={table}
        loading={loading}
        sorting={sorting.length ? sorting : DEFAULT_SORTING}
        autoSizeColumn={autoSizeColumn}
        navigate={navigate}
        tableRef={tableRef}
        getSourceOrigin={getSourceOrigin}
      />

      <Dialog
        open={exportDialogOpen}
        onOpenChange={(open) => { if (!open && exportBusy) return; setExportDialogOpen(open); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Spare Part Raw Data</DialogTitle>
            <DialogDescription>Choose how you want to export the currently filtered rows.</DialogDescription>
          </DialogHeader>
          {(() => {
            const sortedRows = table.getSortedRowModel().rows;
            const set = new Set<string>();
            for (const r of sortedRows) {
              const raw = (r.original as any)?.subcontractor_name;
              set.add(raw && String(raw).trim() ? String(raw).trim() : 'Unassigned');
            }
            const willZip = set.size >= ZIP_THRESHOLD;
            return (
              <div className="space-y-4 py-2">
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
                        {willZip
                          ? <span className="text-amber-600 dark:text-amber-400">{set.size} subcontractors — packaged into a single .zip.</span>
                          : <>Triggers {set.size} download{set.size === 1 ? '' : 's'} (one .xlsx per Subcontractor).</>}
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(false)} disabled={exportBusy}>Cancel</Button>
            <Button size="sm" disabled={exportBusy} onClick={handleExport}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> {exportBusy ? 'Exporting…' : 'Export'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatDateShort(iso: string): string {
  const slice = iso.slice(0, 10);
  if (!slice) return '—';
  const d = new Date(slice);
  if (isNaN(d.getTime())) return slice;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}`;
}

interface ViewProps {
  table: ReturnType<typeof useReactTable<SparePartRow>>;
  loading: boolean;
  sorting: SortingState;
  autoSizeColumn: (id: string) => void;
  navigate: (path: string) => void;
  tableRef: React.RefObject<HTMLDivElement>;
  getSourceOrigin?: (field: string) => 'hdec' | 'aconex' | 'system';
}

function SparePartRawTableView({ table, loading, sorting, autoSizeColumn, navigate, tableRef, getSourceOrigin }: ViewProps) {
  const isMobile = useIsMobile();
  const { value: frozenSetting } = useFrozenColumnCount();
  const frozenCount = isMobile ? 1 : Math.min(Math.max(Number(frozenSetting) || 1, 1), 4);

  const leafColumns = table.getVisibleLeafColumns();
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
    const originStyle = getSourceOrigin
      ? getOriginHeaderStyle(getSourceOrigin(header.column.id))
      : getOriginHeaderStyle('system');
    return (
      <TableHead
        key={header.id}
        data-column-id={header.column.id}
        title={headerText}
        style={{
          width: header.getSize(),
          minWidth: header.getSize(),
          maxWidth: header.getSize(),
          ...(isSticky ? { position: 'sticky', left: stickyLefts[index], zIndex: 3, background: originStyle.stickyBg } : {}),
        }}
        className={cn(
          'relative h-9 cursor-pointer select-none whitespace-nowrap border-b px-4 py-0 text-left text-xs font-medium',
          !isSticky && (originStyle.bg || 'bg-background'),
          originStyle.border,
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

  const stickyBgFor = (_row: SparePartRow, index: number): string => {
    const base = 'hsl(var(--background))';
    const opaque = `linear-gradient(${base}, ${base})`;
    if (hoveredIndex === index) return `${opaque}, hsl(var(--muted) / 0.95)`;
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
              <TableRow>
                <TableCell colSpan={leafColumns.length} className="py-8 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={leafColumns.length} className="py-8 text-center text-muted-foreground">
                  No spare parts found. Import a workbook to get started.
                </TableCell>
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
                      className={cn('cursor-pointer', hoveredIndex === virtualRow.index && 'bg-muted/50')}
                      onMouseEnter={() => setHoveredIndex(virtualRow.index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      onClick={() => navigate(`/docs/spare-part/${row.original.id}`)}
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

// Suppress unused-import lint when EMPTY_TOKEN is referenced indirectly via filter fns.
void EMPTY_TOKEN;
