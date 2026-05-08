import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Calendar as CalendarIcon, FileText, BookOpen, ShieldCheck,
  AlertTriangle, CheckCircle2, ListChecks, ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { resolveTrade, TRADE_OPTIONS, type TradeCategory } from '@/lib/docs-trade';
import {
  loadExecutiveDashboard, type ExecDashboardSnapshot,
} from '@/lib/docs-executive-dashboard-data';
import {
  ALL_STAGE_DEFS, MODULE_LABEL, MODULE_RAW_ROUTE,
  computeStageProgress, summariseByItem,
  type DocModule, type DocsStageRecord,
} from '@/lib/docs-stage-records';

const MODULE_ICON: Record<DocModule, typeof FileText> = {
  abd: FileText,
  omm: BookOpen,
  warranty: ShieldCheck,
};

// Distinct accent per module — semantic-friendly Tailwind classes
const MODULE_ACCENT: Record<DocModule, { bar: string; chip: string; ring: string; text: string }> = {
  abd:      { bar: 'bg-sky-500',     chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',         ring: 'ring-sky-500/30',     text: 'text-sky-600' },
  omm:      { bar: 'bg-violet-500',  chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', ring: 'ring-violet-500/30',  text: 'text-violet-600' },
  warranty: { bar: 'bg-emerald-500', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-500/30', text: 'text-emerald-600' },
};

const MODULES: DocModule[] = ['abd', 'omm', 'warranty'];

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

  const goRaw = (m: DocModule, params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    navigate(`${MODULE_RAW_ROUTE[m]}${qs}`);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Document Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Close-out documents — As-Built Drawings · Operation &amp; Maintenance Manual · Warranty Deeds
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

      {MODULES.map((m) => (
        <ModuleSection key={m} module={m} records={records} onNavigate={goRaw} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function ModuleSection({
  module, records, onNavigate,
}: {
  module: DocModule;
  records: DocsStageRecord[];
  onNavigate: (m: DocModule, params?: Record<string, string>) => void;
}) {
  const Icon = MODULE_ICON[module];
  const accent = MODULE_ACCENT[module];

  const isAbd = module === 'abd';

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
  const done = itemSummaries.filter((i) => i.is_completed).length;
  const overdue = itemSummaries.filter((i) => i.is_overdue).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const stages = useMemo(() => computeStageProgress(filteredRecords), [filteredRecords]);

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
        {/* Module Summary Card row */}
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryTile
            icon={ListChecks}
            label="Total"
            value={total}
            sublabel="All documents"
            accent={accent}
            onClick={() => onNavigate(module)}
          />
          <SummaryTile
            icon={CheckCircle2}
            label="Done"
            value={done}
            sublabel={`${pct}% complete`}
            accent={accent}
            tone="green"
            onClick={() => onNavigate(module, { status: 'completed' })}
          >
            <Progress value={pct} className="mt-2 h-1.5" />
          </SummaryTile>
          <SummaryTile
            icon={AlertTriangle}
            label="Overdue"
            value={overdue}
            sublabel={overdue > 0 ? 'Past planned date' : 'On track'}
            accent={accent}
            tone={overdue > 0 ? 'red' : 'muted'}
            onClick={() => onNavigate(module, { overdue: '1' })}
          />
        </div>

        {/* Stage Progress */}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Stage Progress</h3>
              <p className="text-xs text-muted-foreground">
                Completion and overdue counts per stage. Click a stage to view items.
              </p>
            </div>
            <Tabs value={team} onValueChange={setTeam}>
              <TabsList className="h-8">
                <TabsTrigger value="__all__" className="h-7 px-3 text-xs">All Teams</TabsTrigger>
                {teams.map((t) => (
                  <TabsTrigger key={t} value={t} className="h-7 px-3 text-xs">{t}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className={cn(
            'grid gap-3',
            stages.length <= 5 ? 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
                                : 'sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7',
          )}>
            {stages.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No data.</p>
            )}
            {stages.map((s) => {
              const params: Record<string, string> = { stage: s.stage_key };
              if (team !== '__all__') params.team = team;
              return (
                <StageCard
                  key={s.stage_key}
                  label={s.stage_label}
                  total={s.total}
                  done={s.done}
                  overdue={s.overdue}
                  accent={accent}
                  onClick={() => onNavigate(module, params)}
                />
              );
            })}
          </div>
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
  tone?: 'default' | 'green' | 'red' | 'muted';
  children?: React.ReactNode;
}) {
  const valueClass = {
    default: 'text-foreground',
    green: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
    muted: 'text-muted-foreground',
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
  label, total, done, overdue, accent, onClick,
}: {
  label: string;
  total: number;
  done: number;
  overdue: number;
  accent: Accent;
  onClick?: () => void;
}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
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
      <div className="flex items-start justify-between gap-2 pl-1">
        <span className="text-xs font-medium leading-tight text-foreground">{label}</span>
        {overdue > 0 && (
          <Badge variant="destructive" className="h-5 shrink-0 px-1.5 text-[10px]">
            {overdue} overdue
          </Badge>
        )}
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
