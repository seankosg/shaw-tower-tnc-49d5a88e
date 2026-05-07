import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays } from 'date-fns';
import {
  AlertTriangle, Calendar as CalendarIcon, Clock, FileText, BookOpen,
  ShieldCheck, Filter as FilterIcon, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useAtRiskThreshold } from '@/hooks/useAppSettings';
import {
  loadExecutiveDashboard, type ExecDashboardSnapshot,
} from '@/lib/docs-executive-dashboard-data';
import {
  ALL_STAGE_DEFS, MODULE_LABEL, computeStageProgress, summariseByItem,
  type DocModule, type DocsStageRecord, type ItemSummary,
} from '@/lib/docs-stage-records';

const MODULE_ICON: Record<DocModule, typeof FileText> = {
  abd: FileText,
  omm: BookOpen,
  warranty: ShieldCheck,
};

const MODULES: DocModule[] = ['abd', 'omm', 'warranty'];

type DocTypeFilter = 'all' | DocModule;

interface Filters {
  docType: DocTypeFilter;
  trade: string;
  team: string;
  subcontractor: string;
  hdecPic: string;
  hdecEng: string;
  stage: string;        // stage_key
  search: string;
  overdueOnly: boolean;
  atRiskOnly: boolean;
}

const EMPTY_FILTERS: Filters = {
  docType: 'all',
  trade: '__any__',
  team: '__any__',
  subcontractor: '__any__',
  hdecPic: '__any__',
  hdecEng: '__any__',
  stage: '__any__',
  search: '',
  overdueOnly: false,
  atRiskOnly: false,
};

function uniq(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v ?? '').trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function applyFilter(records: DocsStageRecord[], f: Filters): DocsStageRecord[] {
  return records.filter((r) => {
    if (f.docType !== 'all' && r.document_type !== f.docType) return false;
    if (f.trade !== '__any__' && (r.trade ?? '') !== f.trade) return false;
    if (f.team !== '__any__' && (r.team ?? '') !== f.team) return false;
    if (f.subcontractor !== '__any__' && (r.subcontractor ?? '') !== f.subcontractor) return false;
    if (f.hdecPic !== '__any__' && (r.hdec_pic ?? '') !== f.hdecPic) return false;
    if (f.hdecEng !== '__any__' && (r.hdec_eng ?? '') !== f.hdecEng) return false;
    if (f.stage !== '__any__' && r.stage_key !== f.stage) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = `${r.document_no} ${r.title} ${r.subcontractor ?? ''} ${r.hdec_pic ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function StatCard({
  title, value, hint, tone = 'default',
}: { title: string; value: string | number; hint?: string; tone?: 'default' | 'red' | 'amber' | 'green' }) {
  const toneClass = {
    default: '',
    red: 'border-red-200 dark:border-red-900/60',
    amber: 'border-amber-200 dark:border-amber-900/60',
    green: 'border-emerald-200 dark:border-emerald-900/60',
  }[tone];
  const valueClass = {
    default: '',
    red: 'text-red-600 dark:text-red-400',
    amber: 'text-amber-600 dark:text-amber-400',
    green: 'text-emerald-600 dark:text-emerald-400',
  }[tone];
  return (
    <Card className={cn(toneClass)}>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className={cn('text-2xl font-semibold tracking-tight', valueClass)}>{value}</div>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function AlertCard({
  title, value, tone, onClick,
}: { title: string; value: number; tone: 'red' | 'amber'; onClick?: () => void }) {
  const cls = tone === 'red'
    ? 'border-red-300 bg-red-50/60 dark:border-red-900/70 dark:bg-red-950/30'
    : 'border-amber-300 bg-amber-50/60 dark:border-amber-900/70 dark:bg-amber-950/30';
  const txt = tone === 'red'
    ? 'text-red-700 dark:text-red-300'
    : 'text-amber-700 dark:text-amber-300';
  return (
    <Card className={cn('cursor-pointer transition hover:shadow-md', cls)} onClick={onClick}>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className={cn('text-xs font-semibold uppercase tracking-wide', txt)}>{title}</p>
          <p className={cn('mt-1 text-3xl font-bold', txt)}>{value}</p>
        </div>
        <AlertTriangle className={cn('h-8 w-8', txt)} />
      </CardContent>
    </Card>
  );
}

function StageProgressCard({
  label, total, done, overdue, onClick, active,
}: { label: string; total: number; done: number; overdue: number; onClick?: () => void; active?: boolean }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-left transition hover:shadow-md',
        active && 'ring-2 ring-primary',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground line-clamp-1">{label}</span>
        {overdue > 0 && (
          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">OD {overdue}</Badge>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-semibold">{done}</span>
        <span className="text-xs text-muted-foreground">/ {total}</span>
        <span className="ml-auto text-xs font-medium">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </button>
  );
}

export default function DocsExecutiveDashboardPage() {
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState<Date>(() => new Date());
  const [snap, setSnap] = useState<ExecDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { value: atRiskDays } = useAtRiskThreshold();
  const [overdueTab, setOverdueTab] = useState<'doc' | 'stage' | 'risk'>('doc');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadExecutiveDashboard({ asOf, atRiskDays })
      .then((s) => { if (!cancelled) setSnap(s); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [asOf, atRiskDays]);

  const records = snap?.records ?? [];
  const filtered = useMemo(() => applyFilter(records, filters), [records, filters]);

  // KPI / module cards work off the doc-type filter only (not stage / overdue toggles)
  const docTypeFiltered = useMemo(
    () => applyFilter(records, { ...filters, stage: '__any__', overdueOnly: false, atRiskOnly: false, search: '' }),
    [records, filters],
  );

  const itemSummaries = useMemo(() => summariseByItem(docTypeFiltered), [docTypeFiltered]);
  const stageProgress = useMemo(() => computeStageProgress(docTypeFiltered), [docTypeFiltered]);

  // Top KPIs
  const total = itemSummaries.length;
  const completed = itemSummaries.filter((i) => i.is_completed).length;
  const remaining = total - completed;
  const overallPct = total ? Math.round((completed / total) * 100) : 0;
  const docOverdue = itemSummaries.filter((i) => i.is_overdue).length;
  const docAtRisk = itemSummaries.filter((i) => !i.is_overdue && i.is_at_risk).length;
  const stageOverdue = docTypeFiltered.filter((r) => r.is_overdue).length;
  const stageAtRisk = docTypeFiltered.filter((r) => r.is_at_risk).length;

  // Filter option lists
  const filterOptions = useMemo(() => ({
    trade: uniq(records.map((r) => r.trade)),
    team: uniq(records.map((r) => r.team)),
    subcontractor: uniq(records.map((r) => r.subcontractor)),
    hdecPic: uniq(records.map((r) => r.hdec_pic)),
    hdecEng: uniq(records.map((r) => r.hdec_eng)),
  }), [records]);

  const moduleStats = useMemo(() => {
    return MODULES.map((m) => {
      const items = itemSummaries.filter((i) => i.document_type === m);
      const t = items.length;
      const d = items.filter((i) => i.is_completed).length;
      return {
        module: m,
        total: t,
        done: d,
        remaining: t - d,
        progress: t ? Math.round((d / t) * 100) : 0,
        overdue: items.filter((i) => i.is_overdue).length,
        at_risk: items.filter((i) => !i.is_overdue && i.is_at_risk).length,
      };
    });
  }, [itemSummaries]);

  // Overdue list — depends on full filter
  const overdueDocItems: ItemSummary[] = useMemo(() => {
    const items = summariseByItem(filtered).filter((i) => i.is_overdue);
    return items.sort((a, b) => b.max_delay_days - a.max_delay_days);
  }, [filtered]);

  const overdueStages: DocsStageRecord[] = useMemo(
    () => filtered.filter((r) => r.is_overdue).sort((a, b) => b.delay_days - a.delay_days),
    [filtered],
  );

  const atRiskStages: DocsStageRecord[] = useMemo(
    () => filtered.filter((r) => r.is_at_risk && !r.is_overdue)
      .sort((a, b) => {
        const da = a.planned_date ?? '';
        const db = b.planned_date ?? '';
        return da.localeCompare(db);
      }),
    [filtered],
  );

  const setF = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const activeFilterCount = (Object.keys(filters) as (keyof Filters)[])
    .filter((k) => {
      const v = filters[k];
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return v && v !== '__any__' && v !== 'all' && v !== '';
      return false;
    }).length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Document Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Close-out documents — As-Built / OMM / Warranty submission &amp; approval status
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 font-normal">
                <CalendarIcon className="h-4 w-4" />
                Data Date: {format(asOf, 'yyyy-MM-dd')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="single" selected={asOf} onSelect={(d) => d && setAsOf(d)} initialFocus
                className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Badge variant="outline" className="gap-1 font-normal">
            <Clock className="h-3 w-3" /> At-risk window: {atRiskDays}d
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <FilterIcon className="h-4 w-4 text-muted-foreground" />
          <Select value={filters.docType} onValueChange={(v) => setF({ docType: v as DocTypeFilter, stage: '__any__' })}>
            <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Documents</SelectItem>
              {MODULES.map((m) => <SelectItem key={m} value={m}>{MODULE_LABEL[m]}</SelectItem>)}
            </SelectContent>
          </Select>

          {filters.docType !== 'all' && (
            <Select value={filters.stage} onValueChange={(v) => setF({ stage: v })}>
              <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">All Stages</SelectItem>
                {ALL_STAGE_DEFS[filters.docType as DocModule].map((s) => (
                  <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {[
            { key: 'trade', label: 'Trade', opts: filterOptions.trade },
            { key: 'team', label: 'Team', opts: filterOptions.team },
            { key: 'subcontractor', label: 'Subcontractor', opts: filterOptions.subcontractor },
            { key: 'hdecPic', label: 'HDEC PIC', opts: filterOptions.hdecPic },
            { key: 'hdecEng', label: 'HDEC ENG', opts: filterOptions.hdecEng },
          ].map((f) => (
            <Select key={f.key} value={(filters as any)[f.key]} onValueChange={(v) => setF({ [f.key]: v } as any)}>
              <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder={f.label} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">All {f.label}</SelectItem>
                {f.opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          ))}

          <Input
            placeholder="Search doc no / title…"
            value={filters.search}
            onChange={(e) => setF({ search: e.target.value })}
            className="h-8 w-[200px]"
          />
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 gap-1">
              <X className="h-3.5 w-3.5" /> Reset ({activeFilterCount})
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Top KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Total Documents" value={loading ? '—' : total} />
        <StatCard title="Completed" value={loading ? '—' : completed} hint={`${overallPct}% complete`} tone="green" />
        <StatCard title="Remaining" value={loading ? '—' : remaining} />
        <StatCard title="Overall Progress" value={loading ? '—' : `${overallPct}%`} />
        <StatCard title="Documents Overdue" value={loading ? '—' : docOverdue} tone="red" />
        <StatCard title="Documents At-Risk" value={loading ? '—' : docAtRisk} tone="amber" />
      </div>

      {/* Document type cards */}
      <div className="grid gap-3 md:grid-cols-3">
        {moduleStats.map((m) => {
          const Icon = MODULE_ICON[m.module];
          const active = filters.docType === m.module;
          return (
            <Card
              key={m.module}
              onClick={() => setF({ docType: active ? 'all' : m.module, stage: '__any__' })}
              className={cn('cursor-pointer transition hover:shadow-md', active && 'ring-2 ring-primary')}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">{MODULE_LABEL[m.module]}</CardTitle>
                </div>
                <span className="text-sm font-semibold">{m.progress}%</span>
              </CardHeader>
              <CardContent className="space-y-2 p-4 pt-0">
                <Progress value={m.progress} className="h-1.5" />
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Total</div><div className="font-semibold">{m.total}</div></div>
                  <div><div className="text-muted-foreground">Done</div><div className="font-semibold text-emerald-600">{m.done}</div></div>
                  <div><div className="text-muted-foreground">Overdue</div><div className="font-semibold text-red-600">{m.overdue}</div></div>
                  <div><div className="text-muted-foreground">At-Risk</div><div className="font-semibold text-amber-600">{m.at_risk}</div></div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Stage progress strip */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Stage Progress</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {filters.docType === 'all' ? (
            <div className="space-y-4">
              {MODULES.map((m) => {
                const stages = stageProgress.filter((s) => s.module === m);
                if (!stages.length) return null;
                return (
                  <div key={m}>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                      {MODULE_LABEL[m]}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
                      {stages.map((s) => (
                        <StageProgressCard
                          key={s.stage_key}
                          label={s.stage_label}
                          total={s.total}
                          done={s.done}
                          overdue={s.overdue}
                          active={filters.stage === s.stage_key}
                          onClick={() => setF({ docType: m, stage: filters.stage === s.stage_key ? '__any__' : s.stage_key })}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
              {stageProgress.map((s) => (
                <StageProgressCard
                  key={s.stage_key}
                  label={s.stage_label}
                  total={s.total}
                  done={s.done}
                  overdue={s.overdue}
                  active={filters.stage === s.stage_key}
                  onClick={() => setF({ stage: filters.stage === s.stage_key ? '__any__' : s.stage_key })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Large alert cards */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <AlertCard title="Documents Overdue" value={docOverdue} tone="red"
          onClick={() => setOverdueTab('doc')} />
        <AlertCard title="Total Stage Overdue" value={stageOverdue} tone="red"
          onClick={() => setOverdueTab('stage')} />
        <AlertCard title="Documents At-Risk" value={docAtRisk} tone="amber"
          onClick={() => setOverdueTab('risk')} />
        <AlertCard title="Total Stage At-Risk" value={stageAtRisk} tone="amber"
          onClick={() => setOverdueTab('risk')} />
      </div>

      {/* Overdue detail list */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Overdue / At-Risk Detail</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Tabs value={overdueTab} onValueChange={(v) => setOverdueTab(v as any)}>
            <TabsList>
              <TabsTrigger value="doc">Documents Overdue ({overdueDocItems.length})</TabsTrigger>
              <TabsTrigger value="stage">Stage Overdue ({overdueStages.length})</TabsTrigger>
              <TabsTrigger value="risk">At-Risk ({atRiskStages.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="doc" className="mt-3">
              <DocOverdueTable items={overdueDocItems} onRowClick={(r) => navigate(r.detail_route)} />
            </TabsContent>
            <TabsContent value="stage" className="mt-3">
              <StageDetailTable rows={overdueStages} mode="overdue" onRowClick={(r) => navigate(r.detail_route)} />
            </TabsContent>
            <TabsContent value="risk" className="mt-3">
              <StageDetailTable rows={atRiskStages} mode="risk" onRowClick={(r) => navigate(r.detail_route)} asOf={asOf} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {loading && !snap && <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function DocTypeBadge({ m }: { m: DocModule }) {
  const txt = m === 'abd' ? 'ABD' : m === 'omm' ? 'OMM' : 'WAR';
  return <Badge variant="outline" className="font-mono text-[10px]">{txt}</Badge>;
}

function DocOverdueTable({ items, onRowClick }: { items: ItemSummary[]; onRowClick: (i: ItemSummary) => void }) {
  if (!items.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No overdue documents.</p>;
  }
  return (
    <div className="max-h-[480px] overflow-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur">
          <TableRow>
            <TableHead className="w-[60px]">Type</TableHead>
            <TableHead>Doc No</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Trade</TableHead>
            <TableHead>Subcon</TableHead>
            <TableHead>HDEC PIC</TableHead>
            <TableHead>Current Stage</TableHead>
            <TableHead>Overdue Stages</TableHead>
            <TableHead className="text-right">Delay (days)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.item_id} className="cursor-pointer hover:bg-accent/40" onClick={() => onRowClick(i)}>
              <TableCell><DocTypeBadge m={i.document_type} /></TableCell>
              <TableCell className="font-mono text-xs">{i.document_no}</TableCell>
              <TableCell className="max-w-[260px] truncate">{i.title}</TableCell>
              <TableCell className="text-xs">{i.trade ?? '—'}</TableCell>
              <TableCell className="text-xs">{i.subcontractor ?? '—'}</TableCell>
              <TableCell className="text-xs">{i.hdec_pic ?? '—'}</TableCell>
              <TableCell className="text-xs">{i.current_stage}</TableCell>
              <TableCell className="text-xs">
                <div className="flex flex-wrap gap-1">
                  {i.overdue_stages.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right font-semibold text-red-600">{i.max_delay_days}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StageDetailTable({
  rows, mode, onRowClick, asOf,
}: { rows: DocsStageRecord[]; mode: 'overdue' | 'risk'; onRowClick: (r: DocsStageRecord) => void; asOf?: Date }) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">
      {mode === 'overdue' ? 'No overdue stages.' : 'No at-risk stages.'}
    </p>;
  }
  return (
    <div className="max-h-[480px] overflow-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur">
          <TableRow>
            <TableHead className="w-[60px]">Type</TableHead>
            <TableHead>Doc No</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Subcon</TableHead>
            <TableHead>HDEC PIC</TableHead>
            <TableHead>Planned</TableHead>
            <TableHead className="text-right">{mode === 'overdue' ? 'Delay (days)' : 'Days Remaining'}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, idx) => {
            const remaining = mode === 'risk' && r.planned_date && asOf
              ? Math.max(0, differenceInDays(new Date(r.planned_date), asOf))
              : 0;
            return (
              <TableRow key={`${r.item_id}-${r.stage_key}-${idx}`}
                className="cursor-pointer hover:bg-accent/40" onClick={() => onRowClick(r)}>
                <TableCell><DocTypeBadge m={r.document_type} /></TableCell>
                <TableCell className="font-mono text-xs">{r.document_no}</TableCell>
                <TableCell className="max-w-[260px] truncate">{r.title}</TableCell>
                <TableCell className="text-xs">{r.stage_label}</TableCell>
                <TableCell className="text-xs">{r.subcontractor ?? '—'}</TableCell>
                <TableCell className="text-xs">{r.hdec_pic ?? '—'}</TableCell>
                <TableCell className="text-xs">{r.planned_date ?? '—'}</TableCell>
                <TableCell className={cn(
                  'text-right font-semibold',
                  mode === 'overdue' ? 'text-red-600' : 'text-amber-600',
                )}>
                  {mode === 'overdue' ? r.delay_days : remaining}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
