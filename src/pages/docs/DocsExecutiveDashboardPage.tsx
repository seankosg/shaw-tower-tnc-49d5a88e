import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Calendar as CalendarIcon, FileText, BookOpen, ShieldCheck, Package,
  AlertTriangle, CheckCircle2, ListChecks, ArrowRight,
  CalendarClock, Flame, Clock, Layers, Truck,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { resolveTrade, TRADE_OPTIONS, type TradeCategory } from '@/lib/docs-trade';
import {
  loadExecutiveDashboard, type ExecDashboardSnapshot,
} from '@/lib/docs-executive-dashboard-data';
import {
  ALL_STAGE_DEFS, MODULE_LABEL, MODULE_RAW_ROUTE,
  computeStageProgress, summariseByItem, computeAbdBucketDistribution,
  computeOmmSub1StatusBuckets, computeOmmSub2StatusBuckets, OMM_VISIBLE_STAGE_KEYS,
  computeDelaySeverityBuckets, isDueThisWeek, criticalDelayItemIds,
  DELAY_BUCKETS,
  type DocModule, type DocsStageRecord, type AbdBucketDistribution,
  type OmmSub1StatusBuckets, type OmmSub2StatusBuckets, type OmmStatusBucketKey,
  type DelayBucketKey,
} from '@/lib/docs-stage-records';
import { normalizeSparePartStatus, type SparePartStatusNorm } from '@/lib/docs-spare-part-status';
import { isOverdueSparePart } from '@/lib/spare-part-utils';

const MODULE_ICON: Record<DocModule, typeof FileText> = {
  abd: FileText,
  omm: BookOpen,
  warranty: ShieldCheck,
  spare_part: Package,
};

// Distinct accent per module — semantic-friendly Tailwind classes
const MODULE_ACCENT: Record<DocModule, { bar: string; chip: string; ring: string; text: string }> = {
  abd:        { bar: 'bg-sky-500',     chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',         ring: 'ring-sky-500/30',     text: 'text-sky-600' },
  omm:        { bar: 'bg-violet-500',  chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', ring: 'ring-violet-500/30',  text: 'text-violet-600' },
  warranty:   { bar: 'bg-emerald-500', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-500/30', text: 'text-emerald-600' },
  spare_part: { bar: 'bg-amber-500',   chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',   ring: 'ring-amber-500/30',   text: 'text-amber-600' },
};

const MODULES: DocModule[] = ['abd', 'omm', 'warranty', 'spare_part'];

function uniqSorted(values: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v ?? '').toString().trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export default function DocsExecutiveDashboardPage() {
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState<Date>(() => new Date());
  const [snap, setSnap] = useState<ExecDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadExecutiveDashboard({ asOf })
      .then((s) => { if (!cancelled) setSnap(s); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [asOf]);

  const records = snap?.records ?? [];
  const abdRows = snap?.abdRows ?? [];
  const ommRows = snap?.ommRows ?? [];
  const warrantyRows = snap?.warrantyRows ?? [];
  const sparePartRows = snap?.sparePartRows ?? [];

  const goRaw = (m: DocModule, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    navigate(`${MODULE_RAW_ROUTE[m]}${qs}`);
  };

  // Portfolio-wide KPI summary across all modules
  const portfolioKpi = useMemo(() => {
    const summaries = summariseByItem(records);
    const total = summaries.length;
    const completed = summaries.filter((i) => i.is_completed).length;
    const overdue = summaries.filter((i) => i.is_overdue).length;
    const dueIds = isDueThisWeek(records, asOf);
    const critIds = criticalDelayItemIds(records);
    return {
      total,
      completed,
      remaining: total - completed,
      overdue,
      dueThisWeek: dueIds.size,
      criticalDelay: critIds.size,
    };
  }, [records, asOf]);


  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Document Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Close-out documents — As-Built Drawings · Operation &amp; Maintenance Manual · Warranty Deeds · Spare Parts
          </p>
        </div>
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
      </div>

      {loading && !snap && <p className="text-sm text-muted-foreground">Loading…</p>}

      {/* Portfolio KPI Strip */}
      <PortfolioKpiStrip kpi={portfolioKpi} />

      {MODULES.map((m) => (
        <ModuleSection key={m} module={m} records={records} abdRows={abdRows} ommRows={ommRows} asOf={asOf} onNavigate={goRaw} />
      ))}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function PortfolioKpiStrip({ kpi }: {
  kpi: { total: number; completed: number; remaining: number; overdue: number; dueThisWeek: number; criticalDelay: number };
}) {
  const items = [
    { label: 'Total', value: kpi.total, icon: ListChecks, tone: 'default' as const },
    { label: 'Completed', value: kpi.completed, icon: CheckCircle2, tone: 'green' as const },
    { label: 'Remaining', value: kpi.remaining, icon: Clock, tone: 'default' as const },
    { label: 'Overdue', value: kpi.overdue, icon: AlertTriangle, tone: kpi.overdue > 0 ? 'red' as const : 'muted' as const },
    { label: 'Due This Week', value: kpi.dueThisWeek, icon: CalendarClock, tone: 'amber' as const },
    { label: 'Critical Delay (>30d)', value: kpi.criticalDelay, icon: Flame, tone: kpi.criticalDelay > 0 ? 'red' as const : 'muted' as const },
  ];
  const toneClass = (t: 'default' | 'green' | 'red' | 'amber' | 'muted') => ({
    default: 'text-foreground',
    green: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
    amber: 'text-amber-600 dark:text-amber-400',
    muted: 'text-muted-foreground',
  }[t]);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.label} className="flex flex-col rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{it.label}</span>
              <Icon className={cn('h-4 w-4', toneClass(it.tone))} />
            </div>
            <div className={cn('mt-2 text-2xl font-semibold tabular-nums tracking-tight', toneClass(it.tone))}>
              {it.value.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}



// ─────────────────────────────────────────────────────────────────────
function ModuleSection({
  module, records, abdRows, ommRows, asOf, onNavigate,
}: {
  module: DocModule;
  records: DocsStageRecord[];
  abdRows: any[];
  ommRows: any[];
  asOf: Date;
  onNavigate: (m: DocModule, params?: Record<string, string>) => void;
}) {
  const Icon = MODULE_ICON[module];
  const accent = MODULE_ACCENT[module];

  const isAbd = module === 'abd';
  const isOmm = module === 'omm';

  const moduleRecords = useMemo(
    () => records.filter((r) => r.document_type === module),
    [records, module],
  );

  // Compute trade per record for ABD (uses document_no as sheet_name fallback)
  const recordTrade = useMemo(() => {
    if (!isAbd) return new Map<DocsStageRecord, string>();
    const m = new Map<DocsStageRecord, string>();
    for (const r of moduleRecords) {
      const t = resolveTrade({ trade: r.trade, sheet_name: r.document_no });
      m.set(r, t === '—' ? 'Other' : (t as string));
    }
    return m;
  }, [moduleRecords, isAbd]);

  // Tab options
  const teams = useMemo(() => uniqSorted(moduleRecords.map((r) => r.team)), [moduleRecords]);
  const trades = useMemo(() => {
    if (!isAbd) return [] as TradeCategory[];
    const present = new Set<string>();
    for (const v of recordTrade.values()) present.add(v);
    return TRADE_OPTIONS.filter((t) => present.has(t));
  }, [recordTrade, isAbd]);

  const [tab, setTab] = useState<string>('__all__');

  // Reset tab if currently selected value disappears
  useEffect(() => {
    if (tab === '__all__') return;
    const valid = isAbd ? trades.includes(tab as TradeCategory) : teams.includes(tab);
    if (!valid) setTab('__all__');
  }, [teams, trades, tab, isAbd]);

  // Filtered records — used for stage strip
  const filteredRecords = useMemo(() => {
    if (tab === '__all__') return moduleRecords;
    if (isAbd) return moduleRecords.filter((r) => recordTrade.get(r) === tab);
    return moduleRecords.filter((r) => (r.team ?? '') === tab);
  }, [moduleRecords, tab, isAbd, recordTrade]);

  // Module-level totals: NOT affected by tab — shows project-wide totals
  const itemSummaries = useMemo(() => summariseByItem(moduleRecords), [moduleRecords]);
  const total = itemSummaries.length;
  const overdue = itemSummaries.filter((i) => i.is_overdue).length;
  // ABD Done = Approved + Under Review (SSOT). Other modules use is_completed.
  const abdAllBuckets = useMemo(
    () => (isAbd ? computeAbdBucketDistribution(abdRows) : null),
    [isAbd, abdRows],
  );
  const done = isAbd && abdAllBuckets
    ? abdAllBuckets.approved + abdAllBuckets.under_review
    : itemSummaries.filter((i) => i.is_completed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const stages = useMemo(() => computeStageProgress(filteredRecords), [filteredRecords]);

  // ABD-only bucket distribution (SSOT — matches Raw Data Current Status)
  const abdRowsForTab = useMemo(() => {
    if (!isAbd) return [] as any[];
    if (tab === '__all__') return abdRows;
    return abdRows.filter((row) => {
      const t = resolveTrade(row as any);
      const norm = t === '—' ? 'Other' : (t as string);
      return norm === tab;
    });
  }, [abdRows, isAbd, tab]);
  const abdBuckets: AbdBucketDistribution = useMemo(
    () => computeAbdBucketDistribution(abdRowsForTab),
    [abdRowsForTab],
  );

  // OMM-only: Sub1 Status buckets (A/B/C/UR/Planned) — respects team tab
  const ommRowsForTab = useMemo(() => {
    if (!isOmm) return [] as any[];
    if (tab === '__all__') return ommRows;
    return ommRows.filter((row) => (row?.team ?? '') === tab);
  }, [ommRows, isOmm, tab]);
  const ommSub1Buckets: OmmSub1StatusBuckets = useMemo(
    () => computeOmmSub1StatusBuckets(ommRowsForTab),
    [ommRowsForTab],
  );
  const ommSub2Buckets: OmmSub2StatusBuckets = useMemo(
    () => computeOmmSub2StatusBuckets(ommRowsForTab),
    [ommRowsForTab],
  );

  // Subcontractor / HDEC PIC filters (module-scoped)
  const subcontractors = useMemo(() => uniqSorted(moduleRecords.map((r) => r.subcontractor)), [moduleRecords]);
  const pics = useMemo(() => uniqSorted(moduleRecords.map((r) => r.hdec_pic)), [moduleRecords]);
  const [subFilter, setSubFilter] = useState<string>('__all__');
  const [picFilter, setPicFilter] = useState<string>('__all__');
  useEffect(() => { if (subFilter !== '__all__' && !subcontractors.includes(subFilter)) setSubFilter('__all__'); }, [subcontractors, subFilter]);
  useEffect(() => { if (picFilter !== '__all__' && !pics.includes(picFilter)) setPicFilter('__all__'); }, [pics, picFilter]);

  // Module 6-KPI summary (responds to tab + subcon + pic filters via filteredItems)
  const filteredItems = useMemo(() => {
    let base = filteredRecords;
    if (subFilter !== '__all__') base = base.filter((r) => (r.subcontractor ?? '') === subFilter);
    if (picFilter !== '__all__') base = base.filter((r) => (r.hdec_pic ?? '') === picFilter);
    return summariseByItem(base);
  }, [filteredRecords, subFilter, picFilter]);

  const kpiTotal = filteredItems.length;
  const kpiCompleted = filteredItems.filter((i) => i.is_completed).length;
  const kpiOverdue = filteredItems.filter((i) => i.is_overdue).length;
  const kpiDueIds = useMemo(() => isDueThisWeek(
    filteredRecords
      .filter((r) => subFilter === '__all__' || (r.subcontractor ?? '') === subFilter)
      .filter((r) => picFilter === '__all__' || (r.hdec_pic ?? '') === picFilter),
    asOf,
  ), [filteredRecords, subFilter, picFilter, asOf]);
  const kpiCriticalIds = useMemo(() => criticalDelayItemIds(
    filteredRecords
      .filter((r) => subFilter === '__all__' || (r.subcontractor ?? '') === subFilter)
      .filter((r) => picFilter === '__all__' || (r.hdec_pic ?? '') === picFilter),
  ), [filteredRecords, subFilter, picFilter]);
  const delayBuckets = useMemo(() => computeDelaySeverityBuckets(
    filteredRecords
      .filter((r) => subFilter === '__all__' || (r.subcontractor ?? '') === subFilter)
      .filter((r) => picFilter === '__all__' || (r.hdec_pic ?? '') === picFilter),
  ), [filteredRecords, subFilter, picFilter]);

  // Build extra params for drill-down (preserve current filters)
  const extraParams = (): Record<string, string> => {
    const p: Record<string, string> = {};
    if (tab !== '__all__') {
      if (isAbd) p.trade = tab; else p.team = tab;
    }
    if (subFilter !== '__all__') p.subcontractor = subFilter;
    if (picFilter !== '__all__') p.hdec_pic = picFilter;
    return p;
  };

  // Short trade labels for the tab list
  const TRADE_SHORT: Record<TradeCategory, string> = {
    'Architecture': 'Arch',
    'Structure': 'Struct',
    'Mechanical': 'Mech',
    'Electrical': 'Elec',
    'Plumbing': 'Plumb',
    'Fire Protection': 'Fire',
    'HVAC': 'HVAC',
    'Civil': 'Civil',
    'Landscape': 'Land',
    'Interior': 'Int',
    'Other': 'Other',
  };


  return (
    <Card className="overflow-hidden">
      {/* Header bar */}
      <div className={cn('flex items-center gap-3 border-b px-5 py-4', accent.chip)}>
        <Icon className="h-5 w-5" />
        <div className="flex-1">
          <h2 className="text-base font-semibold leading-tight">{MODULE_LABEL[module]}</h2>
          <p className="text-xs opacity-80">
            {total.toLocaleString()} documents · {done.toLocaleString()} completed · {overdue.toLocaleString()} overdue
          </p>
        </div>
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => onNavigate(module)}>
          Open Raw Data <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      <CardContent className="space-y-5 p-5">
        {/* Subcontractor / HDEC PIC filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Filters</span>
          <Select value={subFilter} onValueChange={setSubFilter}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Subcontractor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Subcontractors</SelectItem>
              {subcontractors.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={picFilter} onValueChange={setPicFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="HDEC PIC" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All HDEC PIC</SelectItem>
              {pics.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          {(subFilter !== '__all__' || picFilter !== '__all__') && (
            <Button variant="ghost" size="sm" className="h-8 text-xs"
              onClick={() => { setSubFilter('__all__'); setPicFilter('__all__'); }}>
              Clear
            </Button>
          )}
        </div>

        {/* Module 6-KPI row */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <SummaryTile icon={ListChecks} label="Total" value={kpiTotal} accent={accent}
            onClick={() => onNavigate(module, extraParams())} />
          <SummaryTile icon={CheckCircle2} label="Completed" value={kpiCompleted}
            sublabel={kpiTotal ? `${Math.round((kpiCompleted / kpiTotal) * 100)}%` : '—'}
            accent={accent} tone="green"
            onClick={() => onNavigate(module, { ...extraParams(), ...(isAbd ? { bucket: 'done' } : { status: 'completed' }) })}>
            <Progress value={kpiTotal ? Math.round((kpiCompleted / kpiTotal) * 100) : 0} className="mt-2 h-1.5" />
          </SummaryTile>
          <SummaryTile icon={Clock} label="Remaining" value={kpiTotal - kpiCompleted} accent={accent}
            onClick={() => onNavigate(module, extraParams())} />
          <SummaryTile icon={AlertTriangle} label="Overdue" value={kpiOverdue} accent={accent}
            tone={kpiOverdue > 0 ? 'red' : 'muted'}
            onClick={() => onNavigate(module, { ...extraParams(), overdue: '1' })} />
          <SummaryTile icon={CalendarClock} label="Due This Week" value={kpiDueIds.size} accent={accent}
            tone="amber"
            onClick={() => onNavigate(module, { ...extraParams(), due_this_week: '1' })} />
          <SummaryTile icon={Flame} label="Critical Delay" value={kpiCriticalIds.size} accent={accent}
            tone={kpiCriticalIds.size > 0 ? 'red' : 'muted'}
            sublabel=">30 days"
            onClick={() => onNavigate(module, { ...extraParams(), delay_bucket: '30+' })} />
        </div>

        {/* Delay Severity Buckets */}
        <DelaySeverityRow
          counts={delayBuckets}
          onClick={(b) => onNavigate(module, { ...extraParams(), delay_bucket: b, overdue: '1' })}
        />

        {/* Stage Progress */}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">
                {isAbd ? 'Stage Distribution' : 'Stage Progress'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isAbd
                  ? 'Mutually-exclusive buckets — sum equals total. Click a bucket to view items.'
                  : 'Completion and overdue counts per stage. Click a stage to view items.'}
              </p>
            </div>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-8 flex flex-wrap gap-0.5">
                <TabsTrigger value="__all__" className="h-7 px-3 text-xs">All</TabsTrigger>
                {isAbd
                  ? trades.map((t) => (
                      <TabsTrigger key={t} value={t} className="h-7 px-2 text-xs">
                        {TRADE_SHORT[t]}
                      </TabsTrigger>
                    ))
                  : teams.map((t) => (
                      <TabsTrigger key={t} value={t} className="h-7 px-3 text-xs">{t}</TabsTrigger>
                    ))}
              </TabsList>
            </Tabs>
          </div>

          {isAbd ? (
            <AbdBucketGrid
              dist={abdBuckets}
              accent={accent}
              tradeFilter={tab === '__all__' ? null : tab}
              onNavigate={(params) => onNavigate(module, params)}
            />
          ) : isOmm ? (
            (() => {
              const visibleStages = stages.filter((s) => OMM_VISIBLE_STAGE_KEYS.has(s.stage_key));
              const stageByKey = new Map(visibleStages.map((s) => [s.stage_key, s]));
              const renderStage = (key: string) => {
                const s = stageByKey.get(key);
                if (!s) return null;
                const params: Record<string, string> = { stage: s.stage_key, overdue: '1' };
                if (tab !== '__all__') params.team = tab;
                return (
                  <StageCard
                    key={s.stage_key}
                    label={s.stage_label}
                    total={s.total}
                    done={s.done}
                    overdue={s.overdue}
                    remaining={s.remaining}
                    accent={accent}
                    onClick={() => onNavigate(module, params)}
                  />
                );
              };
              return (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                  <OmmSubStatusCard
                    title="1st Status"
                    buckets={ommSub1Buckets}
                    accent={accent}
                    onBucket={(b) => {
                      const params: Record<string, string> = { sub1_status: b };
                      if (tab !== '__all__') params.team = tab;
                      onNavigate(module, params);
                    }}
                  />
                  {renderStage('omm.sub2_submission')}
                  <OmmSubStatusCard
                    title="2nd Status"
                    buckets={ommSub2Buckets}
                    accent={accent}
                    onBucket={(b) => {
                      const params: Record<string, string> = { sub2_status: b };
                      if (tab !== '__all__') params.team = tab;
                      onNavigate(module, params);
                    }}
                  />
                  {renderStage('omm.final_submission')}
                  {renderStage('omm.final_approval')}
                </div>
              );
            })()
          ) : (
            <div className={cn(
              'grid gap-3',
              stages.length <= 5 ? 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
                                  : 'sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7',
            )}>
              {stages.length === 0 && (
                <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No data.</p>
              )}
              {stages.map((s) => {
                const params: Record<string, string> = { stage: s.stage_key, overdue: '1' };
                if (tab !== '__all__') {
                  params.team = tab;
                }
                return (
                  <StageCard
                    key={s.stage_key}
                    label={s.stage_label}
                    total={s.total}
                    done={s.done}
                    overdue={s.overdue}
                    remaining={s.remaining}
                    accent={accent}
                    onClick={() => onNavigate(module, params)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
type Accent = (typeof MODULE_ACCENT)[DocModule];

function SummaryTile({
  icon: Icon, label, value, sublabel, accent, onClick, tone = 'default', children,
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  sublabel?: string;
  accent: Accent;
  onClick?: () => void;
  tone?: 'default' | 'green' | 'red' | 'muted' | 'amber';
  children?: React.ReactNode;
}) {
  const valueClass = {
    default: 'text-foreground',
    green: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
    muted: 'text-muted-foreground',
    amber: 'text-amber-600 dark:text-amber-400',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col rounded-xl border bg-card p-4 text-left transition',
        'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none',
        `focus-visible:ring-2 ${accent.ring}`,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={cn('h-4 w-4', accent.text)} />
      </div>
      <div className={cn('mt-2 text-3xl font-semibold tabular-nums tracking-tight', valueClass)}>
        {value.toLocaleString()}
      </div>
      {sublabel && <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>}
      {children}
    </button>
  );
}

function StageCard({
  label, total, done, overdue, remaining, accent, onClick,
}: {
  label: string;
  total: number;
  done: number;
  overdue: number;
  remaining?: number;
  accent: Accent;
  onClick?: () => void;
}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const rem = remaining ?? Math.max(0, total - done);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-card p-3.5 text-left transition',
        'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2',
        accent.ring,
      )}
    >
      {/* left accent bar */}
      <span className={cn('absolute inset-y-0 left-0 w-1', accent.bar)} />
      {/* OD chip top-right */}
      <span
        className={cn(
          'absolute right-2 top-2 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
          overdue > 0
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-muted-foreground',
        )}
        title={`Overdue ${overdue} / Remaining ${rem}`}
      >
        OD {overdue}/{rem}
      </span>
      <div className="flex items-start justify-between gap-2 pl-1 pr-14">
        <span className="text-xs font-medium leading-tight text-foreground">{label}</span>
      </div>
      <div className="flex items-baseline justify-between gap-2 pl-1">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tabular-nums leading-none">{pct}%</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {done.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ABD-only: 3 main buckets + 3 sub-cards inside Submission Required
function AbdBucketGrid({
  dist, accent, tradeFilter, onNavigate,
}: {
  dist: AbdBucketDistribution;
  accent: Accent;
  tradeFilter: string | null;
  onNavigate: (params: Record<string, string>) => void;
}) {
  const total = dist.total || 1;
  const baseParams: Record<string, string> = tradeFilter ? { trade: tradeFilter } : {};
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <BucketCard
        label="Approved"
        value={dist.approved}
        pct={pct(dist.approved)}
        tone="green"
        accent={accent}
        onClick={() => onNavigate({ ...baseParams, bucket: 'approved' })}
      />
      <BucketCard
        label="Under Review"
        value={dist.under_review}
        pct={pct(dist.under_review)}
        tone="amber"
        accent={accent}
        onClick={() => onNavigate({ ...baseParams, bucket: 'under_review' })}
      />
      <SubmissionRequiredCard
        dist={dist.submission_required}
        totalAll={total}
        accent={accent}
        baseParams={baseParams}
        onNavigate={onNavigate}
      />
    </div>
  );
}

function BucketCard({
  label, value, pct, tone, accent, onClick,
}: {
  label: string;
  value: number;
  pct: number;
  tone: 'green' | 'amber' | 'sky';
  accent: Accent;
  onClick: () => void;
}) {
  const valueClass =
    tone === 'green' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'amber' ? 'text-amber-600 dark:text-amber-400'
    : 'text-sky-600 dark:text-sky-400';
  const barClass =
    tone === 'green' ? 'bg-emerald-500'
    : tone === 'amber' ? 'bg-amber-500'
    : 'bg-sky-500';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-card p-4 text-left transition',
        'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2',
        accent.ring,
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', barClass)} />
      <div className="pl-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-baseline justify-between gap-2 pl-1">
        <span className={cn('text-3xl font-semibold tabular-nums leading-none', valueClass)}>
          {value.toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </button>
  );
}

function SubmissionRequiredCard({
  dist, totalAll, accent, baseParams, onNavigate,
}: {
  dist: AbdBucketDistribution['submission_required'];
  totalAll: number;
  accent: Accent;
  baseParams: Record<string, string>;
  onNavigate: (params: Record<string, string>) => void;
}) {
  const pct = totalAll ? Math.round((dist.total / totalAll) * 100) : 0;
  const subItems: { label: string; value: number; bucket: string }[] = [
    { label: '1st', value: dist.sub1, bucket: 'sub1_required' },
    { label: '2nd', value: dist.sub2, bucket: 'sub2_required' },
    { label: '3rd', value: dist.sub3, bucket: 'sub3_required' },
  ];
  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-card p-4',
        'focus-visible:ring-2',
        accent.ring,
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-sky-500" />
      <button
        type="button"
        onClick={() => onNavigate({ ...baseParams, bucket: 'submission_required' })}
        className="group flex flex-col gap-2 text-left transition hover:opacity-90 focus-visible:outline-none"
      >
        <div className="pl-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Submission Required
        </div>
        <div className="flex items-baseline justify-between gap-2 pl-1">
          <span className="text-3xl font-semibold tabular-nums leading-none text-sky-600 dark:text-sky-400">
            {dist.total.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </button>
      <div className="mt-2 grid grid-cols-3 gap-1.5 pl-1">
        {subItems.map((s) => (
          <button
            key={s.bucket}
            type="button"
            onClick={() => onNavigate({ ...baseParams, bucket: s.bucket })}
            className={cn(
              'group flex flex-col items-start rounded-md border bg-muted/30 px-2 py-1.5 text-left transition',
              'hover:-translate-y-0.5 hover:shadow-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2',
              accent.ring,
            )}
            title={`${s.label} Submission Required`}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {s.label}
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {s.value.toLocaleString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// OMM-only: generic Status card with A / B / C / UR / TBS buckets
function OmmSubStatusCard({
  title, buckets, accent, onBucket,
}: {
  title: string;
  buckets: OmmSub1StatusBuckets;
  accent: Accent;
  onBucket: (bucket: OmmStatusBucketKey) => void;
}) {
  const items: { key: OmmStatusBucketKey; label: string; value: number; tone: string }[] = [
    { key: 'A',   label: 'A',   value: buckets.A,   tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20' },
    { key: 'B',   label: 'B',   value: buckets.B,   tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20' },
    { key: 'C',   label: 'C',   value: buckets.C,   tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20' },
    { key: 'UR',  label: 'UR',  value: buckets.UR,  tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20' },
    { key: 'TBS', label: 'TBS', value: buckets.TBS, tone: 'bg-muted text-muted-foreground hover:bg-muted/80' },
  ];
  if (import.meta.env.DEV) {
    const sum = items.reduce((n, it) => n + it.value, 0);
    if (sum !== buckets.total) {
      // eslint-disable-next-line no-console
      console.warn('[OmmSubStatusCard] bucket sum != total', { title, sum, total: buckets.total });
    }
  }
  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 overflow-hidden rounded-xl border bg-card p-3.5',
        'focus-visible:ring-2',
        accent.ring,
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', accent.bar)} />
      <div className="flex items-baseline justify-between gap-2 pl-1 pr-1">
        <span
          className="text-xs font-medium leading-tight text-foreground"
          title="Items currently in this cycle (each row counted in exactly one Status card)"
        >
          {title}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          In cycle {buckets.total.toLocaleString()}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1 pl-1">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => onBucket(it.key)}
            title={`${it.label}: ${it.value}`}
            className={cn(
              'flex flex-col items-center justify-center rounded-md px-1 py-1.5 transition focus-visible:outline-none focus-visible:ring-2',
              accent.ring,
              it.tone,
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide leading-none">
              {it.label}
            </span>
            <span className="mt-1 text-base font-semibold tabular-nums leading-none">
              {it.value.toLocaleString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function DelaySeverityRow({
  counts,
  onClick,
}: {
  counts: Record<DelayBucketKey, number>;
  onClick: (b: DelayBucketKey) => void;
}) {
  const total = DELAY_BUCKETS.reduce((s, b) => s + (counts[b] ?? 0), 0);
  const tone: Record<DelayBucketKey, string> = {
    '0-7':   'bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20',
    '8-14':  'bg-orange-500/10 text-orange-700 dark:text-orange-300 hover:bg-orange-500/20',
    '15-30': 'bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20',
    '30+':   'bg-red-600/15 text-red-800 dark:text-red-200 hover:bg-red-600/25',
  };
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Delay Severity (Overdue Items)
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          Total {total.toLocaleString()}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {DELAY_BUCKETS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onClick(b)}
            className={cn(
              'flex flex-col items-center justify-center rounded-md px-2 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tone[b],
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide leading-none">
              {b === '30+' ? '30+ days' : `${b} days`}
            </span>
            <span className="mt-1 text-base font-semibold tabular-nums leading-none">
              {(counts[b] ?? 0).toLocaleString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

