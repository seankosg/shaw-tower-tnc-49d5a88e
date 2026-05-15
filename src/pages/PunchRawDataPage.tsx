import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, AlertCircle, Download, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { usePunchFieldConfig } from '@/hooks/usePunchFieldConfig';
import {
  exportPunchRawToExcel,
  exportPunchRawToExcelBySubcontractor,
  exportPunchRawToZipBySubcontractor,
} from '@/lib/punch-excel-export';
import { USER_TYPE_LABELS } from '@/types/enums';
import { formatDdMmm } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';
import {
  PUNCH_FIELDS,
  PUNCH_FIELDS_BY_NAME,
  PUNCH_GATE_LABEL,
  PUNCH_HEALTH_LABEL,
  PUNCH_PROCUREMENT_LABEL,
  type PunchFieldDef,
  type PunchGateStatus,
  type PunchProcurementStatus,
  type PunchHealthStatus,
} from '@/lib/punch-field-registry';
import type { AppRole } from '@/types/enums';

type PunchItem = Database['public']['Tables']['punch_items']['Row'];

const PAGE_SIZE = 1000;

const HEALTH_BADGE_CLASS: Record<PunchHealthStatus, string> = {
  ahead: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200',
  on_track: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200',
  behind: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200',
  critical: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200',
};

const GATE_DOT: Record<PunchGateStatus, string> = {
  not_required: 'bg-muted-foreground/30',
  pending: 'bg-amber-500',
  approved: 'bg-emerald-500',
};

const PROC_DOT: Record<PunchProcurementStatus, string> = {
  not_required: 'bg-muted-foreground/30',
  pending: 'bg-amber-500',
  partially_secured: 'bg-blue-500',
  secured: 'bg-emerald-500',
};

function GateDot({ status, label, kind }: { status: string | null; label: string; kind: 'gate' | 'proc' }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const dot = kind === 'gate'
    ? GATE_DOT[status as PunchGateStatus] ?? 'bg-muted'
    : PROC_DOT[status as PunchProcurementStatus] ?? 'bg-muted';
  const text = kind === 'gate'
    ? PUNCH_GATE_LABEL[status as PunchGateStatus] ?? status
    : PUNCH_PROCUREMENT_LABEL[status as PunchProcurementStatus] ?? status.replace(/_/g, ' ');
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5">
            <span className={cn('inline-block h-2.5 w-2.5 rounded-full', dot)} />
            <span className="text-xs capitalize">{text}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="font-medium">{label}</div>
          <div className="text-muted-foreground capitalize">{text}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function HealthBadge({ status }: { status: PunchHealthStatus | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn('px-2 py-0.5 text-[10px] font-medium', HEALTH_BADGE_CLASS[status])}>
      {PUNCH_HEALTH_LABEL[status]}
    </Badge>
  );
}

function PctCell({ value, variance = false }: { value: number | null; variance?: boolean }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  if (variance) {
    const cls = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-muted-foreground';
    const sign = value > 0 ? '+' : '';
    return <span className={cn('tabular-nums font-medium', cls)}>{sign}{value.toFixed(1)}%</span>;
  }
  return <span className="tabular-nums">{value.toFixed(1)}%</span>;
}

function ReadyCell({ row }: { row: PunchItem }) {
  if (row.pre_engineering_ready) {
    return <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] dark:bg-emerald-950 dark:text-emerald-200">Ready</Badge>;
  }
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px] dark:bg-amber-950 dark:text-amber-200 gap-1">
            <AlertCircle className="h-3 w-3" />
            Blocked
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="left">
          {(row.pre_engineering_blockers || []).length > 0
            ? row.pre_engineering_blockers.join(', ')
            : 'Pre-engineering not complete'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Compute cell value for a given (row, field). Falls back to raw_payload / custom_payload for dynamic columns. */
function getFieldValue(row: PunchItem, field: string, originalHeader: string | null): any {
  const direct = (row as any)[field];
  if (direct != null && direct !== '') return direct;
  const rawP = (row as any).raw_payload;
  if (rawP && typeof rawP === 'object') {
    if (originalHeader && rawP[originalHeader] != null) return rawP[originalHeader];
    if (rawP[field] != null) return rawP[field];
  }
  const customP = (row as any).custom_payload;
  if (customP && typeof customP === 'object') {
    if (originalHeader && customP[originalHeader] != null) return customP[originalHeader];
    if (customP[field] != null) return customP[field];
  }
  return null;
}

function renderCell(row: PunchItem, field: string, def: PunchFieldDef | null, value: any) {
  // Specialized renderers for known fields
  switch (field) {
    case 'health_status':
      return <HealthBadge status={(value as PunchHealthStatus) ?? null} />;
    case 'pre_engineering_ready':
      return <ReadyCell row={row} />;
    case 'material_approval_status':
    case 'drawing_approval_status':
    case 'mos_approval_status':
      return <GateDot status={value} label={def?.exportLabel ?? field} kind="gate" />;
    case 'material_procurement_status':
      return <GateDot status={value} label={def?.exportLabel ?? field} kind="proc" />;
    case 'progress_variance_pct':
      return <PctCell value={value == null ? null : Number(value)} variance />;
    case 'planned_progress_pct':
    case 'actual_progress_pct':
      return <PctCell value={value == null ? null : Number(value)} />;
    case 'pre_engineering_blockers': {
      const arr = Array.isArray(value) ? value : [];
      return arr.length > 0 ? <span className="text-xs">{arr.join(', ')}</span> : <span className="text-muted-foreground">—</span>;
    }
  }
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
  if (def?.dataType === 'date') {
    return <span className="text-xs">{formatDdMmm(String(value).slice(0, 10))}</span>;
  }
  if (def?.dataType === 'number') {
    return <span className="tabular-nums text-xs">{value}</span>;
  }
  if (def?.dataType === 'pct') {
    return <PctCell value={Number(value)} />;
  }
  if (Array.isArray(value)) {
    return <span className="text-xs">{value.join(', ')}</span>;
  }
  return <span className="text-xs block truncate" title={String(value)}>{String(value)}</span>;
}

const SIZE_BY_FIELD: Record<string, string> = {
  item_no: 'w-[110px] font-mono text-xs',
  outstanding_work: 'min-w-[260px] text-sm',
  location: 'w-[120px]',
  level: 'w-[80px]',
  team: 'w-[80px]',
  subcontractor_name: 'w-[160px] truncate',
  subsub_name: 'w-[140px] truncate',
  hdec_pic_name: 'w-[110px]',
  hdec_eng_name: 'w-[110px]',
  planned_completion_date: 'w-[110px]',
  actual_completion_date: 'w-[110px]',
  planned_start_date: 'w-[110px]',
  actual_start_date: 'w-[110px]',
  data_date: 'w-[110px]',
  planned_progress_pct: 'w-[80px] text-right',
  actual_progress_pct: 'w-[80px] text-right',
  progress_variance_pct: 'w-[90px] text-right',
  health_status: 'w-[90px]',
  pre_engineering_ready: 'w-[90px]',
  material_approval_status: 'w-[150px]',
  material_procurement_status: 'w-[170px]',
  drawing_approval_status: 'w-[150px]',
  mos_approval_status: 'w-[140px]',
  weight: 'w-[70px] text-right',
};

export default function PunchRawDataPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { roles, profile } = useAuth() as { roles?: AppRole[]; profile?: any };
  const { fields: configRows, isFieldVisible, getLabel, sortFieldNames, getOriginalHeader, loading: configLoading } =
    usePunchFieldConfig();

  const [rows, setRows] = useState<PunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState<PunchHealthStatus | 'all'>('all');
  const [readyFilter, setReadyFilter] = useState<'all' | 'ready' | 'blocked'>('all');

  // Excel export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'single' | 'per-subcon'>('single');
  const [exportFormat, setExportFormat] = useState<'view' | 'reimport'>('view');
  const [exportBusy, setExportBusy] = useState(false);
  const ZIP_THRESHOLD = 7;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const all: PunchItem[] = [];
      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('punch_items')
          .select('*')
          .eq('is_active', true)
          .order('item_no', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) {
          toast({ title: 'Failed to load punch items', description: error.message, variant: 'destructive' });
          break;
        }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      if (!cancelled) {
        setRows(all);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  /** Final ordered list of visible fields, driven by Field Config + dynamic rows. */
  const visibleFields = useMemo(() => {
    const knownFields = new Set(PUNCH_FIELDS.map((f) => f.field));
    const dynamicFields = configRows
      .filter((r) => r.is_enabled && !knownFields.has(r.field_name))
      .map((r) => r.field_name);
    const allFieldNames = [...PUNCH_FIELDS.map((f) => f.field), ...dynamicFields];
    return sortFieldNames(allFieldNames).filter((f) => isFieldVisible(f, roles ?? []));
  }, [configRows, sortFieldNames, isFieldVisible, roles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (healthFilter !== 'all' && r.health_status !== healthFilter) return false;
      if (readyFilter === 'ready' && !r.pre_engineering_ready) return false;
      if (readyFilter === 'blocked' && r.pre_engineering_ready) return false;
      if (!q) return true;
      const blob = [
        r.item_no, r.outstanding_work, r.location, r.level, r.subcontractor_name,
        r.subsub_name, r.hdec_pic_name, r.team, r.work_type, r.category1, r.category2,
      ].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search, healthFilter, readyFilter]);

  const stats = useMemo(() => ({
    total: rows.length,
    critical: rows.filter((r) => r.health_status === 'critical').length,
    behind: rows.filter((r) => r.health_status === 'behind').length,
    blocked: rows.filter((r) => !r.pre_engineering_ready).length,
  }), [rows]);

  const colCount = visibleFields.length || 1;
  const tableLoading = loading || configLoading;

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Punch (Minor O/S Work) — Raw Data</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stats.total} items · {stats.critical} critical · {stats.behind} behind · {stats.blocked} pre-eng blocked
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/punch/import')}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (filtered.length === 0) {
                toast({ title: 'No rows to export', description: 'Adjust filters and try again.', variant: 'destructive' });
                return;
              }
              setExportMode('single');
              setExportFormat('view');
              setExportDialogOpen(true);
            }}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item no / work / location / subcontractor"
            className="h-9 w-[360px] pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Health:</span>
          {(['all', 'ahead', 'on_track', 'behind', 'critical'] as const).map((h) => (
            <Button
              key={h}
              size="sm"
              variant={healthFilter === h ? 'default' : 'outline'}
              className="h-7 px-2 text-xs capitalize"
              onClick={() => setHealthFilter(h)}
            >
              {h === 'all' ? 'All' : h.replace('_', ' ')}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Pre-Eng:</span>
          {(['all', 'ready', 'blocked'] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={readyFilter === r ? 'default' : 'outline'}
              className="h-7 px-2 text-xs capitalize"
              onClick={() => setReadyFilter(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded border">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              {visibleFields.map((field) => {
                const label = getLabel(field);
                const orig = getOriginalHeader(field);
                const sizeCls = SIZE_BY_FIELD[field] ?? 'min-w-[120px]';
                return (
                  <TableHead key={field} className={cn('whitespace-nowrap', sizeCls)}>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">{label}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div className="font-medium">{label}</div>
                          <div className="text-muted-foreground">field: <code>{field}</code></div>
                          {orig && orig !== label && (
                            <div className="text-muted-foreground">header: <code>{orig}</code></div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableLoading && (
              <TableRow><TableCell colSpan={colCount} className="text-center py-12 text-muted-foreground text-sm">Loading…</TableCell></TableRow>
            )}
            {!tableLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={colCount} className="text-center py-12 text-muted-foreground text-sm">No punch items match the current filters.</TableCell></TableRow>
            )}
            {!tableLoading && filtered.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/punch/${r.id}`)}
              >
                {visibleFields.map((field) => {
                  const def = PUNCH_FIELDS_BY_NAME[field] ?? null;
                  const orig = getOriginalHeader(field);
                  const value = getFieldValue(r, field, orig);
                  const sizeCls = SIZE_BY_FIELD[field] ?? '';
                  return (
                    <TableCell key={field} className={cn('align-top', sizeCls)}>
                      {renderCell(r, field, def, value)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={exportDialogOpen}
        onOpenChange={(open) => {
          if (!open && exportBusy) return;
          setExportDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Punch Raw Data</DialogTitle>
            <DialogDescription>Choose how you want to export the currently filtered rows.</DialogDescription>
          </DialogHeader>
          {(() => {
            const subconSet = new Set<string>();
            for (const r of filtered) {
              const raw = (r as any)?.subcontractor_name;
              const key = raw && String(raw).trim() ? String(raw).trim() : 'Unassigned';
              subconSet.add(key);
            }
            const willZip = subconSet.size >= ZIP_THRESHOLD;
            return (
              <div className="space-y-4 py-2">
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Format</div>
                  <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as 'view' | 'reimport')} className="gap-2">
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="view" id="punch-export-format-view" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="punch-export-format-view" className="cursor-pointer text-sm font-medium">View-friendly</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Human-readable format (formatted dates, percentages, status labels). Best for sharing or reporting.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="reimport" id="punch-export-format-reimport" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="punch-export-format-reimport" className="cursor-pointer text-sm font-medium">Re-import ready</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Includes ID + Item No columns and raw values (YYYY-MM-DD dates, numeric %). Edit values and re-import to update existing rows.</p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Output</div>
                  <RadioGroup value={exportMode} onValueChange={(v) => setExportMode(v as 'single' | 'per-subcon')} className="gap-2">
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="single" id="punch-export-single" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="punch-export-single" className="cursor-pointer text-sm font-medium">Single file</Label>
                        <p className="mt-1 text-xs text-muted-foreground">Exports the current view as one .xlsx file ({filtered.length} rows).</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <RadioGroupItem value="per-subcon" id="punch-export-per-subcon" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="punch-export-per-subcon" className="cursor-pointer text-sm font-medium">One file per Subcontractor</Label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {willZip ? (
                            <span className="text-amber-600 dark:text-amber-400">
                              {subconSet.size} Subcontractors detected — files will be packaged into a single .zip to avoid browser download limits. Empty Subcontractor rows go to "Unassigned".
                            </span>
                          ) : (
                            <>Triggers {subconSet.size} download{subconSet.size === 1 ? '' : 's'} (one .xlsx per Subcontractor). Empty Subcontractor rows go to "Unassigned".</>
                          )}
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
            <Button
              size="sm"
              disabled={exportBusy}
              onClick={async () => {
                const meta = {
                  userName: profile?.name || profile?.login_id || 'Unknown',
                  userType: profile?.user_type ? USER_TYPE_LABELS[profile.user_type as keyof typeof USER_TYPE_LABELS] : '',
                };
                const sharedOpts = {
                  rows: filtered,
                  fieldNames: visibleFields,
                  fieldConfig: configRows,
                  meta,
                  searchSummary: search.trim() ? `"${search.trim()}"` : '(none)',
                  filterSummary: [
                    healthFilter !== 'all' ? `Health=${healthFilter}` : null,
                    readyFilter !== 'all' ? `Pre-Eng=${readyFilter}` : null,
                  ].filter(Boolean).join(' · ') || '(none)',
                  sortSummary: 'Item No ↑',
                  format: exportFormat,
                  getOriginalHeader,
                };
                try {
                  if (exportMode === 'single') {
                    const result = exportPunchRawToExcel(sharedOpts);
                    toast({ title: 'Export complete', description: `${result.rowCount} rows → ${result.fileName}` });
                    setExportDialogOpen(false);
                  } else {
                    const subconSet = new Set<string>();
                    for (const r of filtered) {
                      const raw = (r as any)?.subcontractor_name;
                      const key = raw && String(raw).trim() ? String(raw).trim() : 'Unassigned';
                      subconSet.add(key);
                    }
                    if (subconSet.size >= ZIP_THRESHOLD) {
                      toast({
                        title: 'Packaging into ZIP',
                        description: `${subconSet.size} Subcontractors detected — bundling into a single .zip to avoid browser download limits.`,
                      });
                      setExportBusy(true);
                      const result = await exportPunchRawToZipBySubcontractor(sharedOpts);
                      toast({
                        title: 'Export complete',
                        description: `${result.fileCount} file${result.fileCount === 1 ? '' : 's'} bundled in ${result.zipFileName} (${result.rowCount} rows total)`,
                      });
                      setExportBusy(false);
                      setExportDialogOpen(false);
                    } else {
                      const result = exportPunchRawToExcelBySubcontractor(sharedOpts);
                      toast({ title: 'Export complete', description: `${result.fileCount} file${result.fileCount === 1 ? '' : 's'} downloaded (${result.rowCount} rows total)` });
                      setExportDialogOpen(false);
                    }
                  }
                } catch (err) {
                  console.error('Punch Excel export failed', err);
                  toast({ title: 'Export failed', description: String((err as Error)?.message ?? err), variant: 'destructive' });
                  setExportBusy(false);
                }
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> {exportBusy ? 'Exporting…' : 'Export'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
