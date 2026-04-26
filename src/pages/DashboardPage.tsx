import { useEffect, useMemo, useState } from 'react';
import { ALL_TEAMS, TEAM_LABELS, type TeamType } from '@/types/enums';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart';
import {
  PieChart, Pie, Cell, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import {
  AlertTriangle, CheckCircle2, ListChecks, Clock, TrendingUp, ChevronRight, ChevronDown, CalendarIcon, Download, Filter,
} from 'lucide-react';
import { exportPlanActualToExcel } from '@/lib/dashboard-excel-export';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import { useAtRiskThreshold } from '@/hooks/useAppSettings';
import {
  type SubtestForDashboard, type PlanActualRow, type PlanActualMetrics,
  todayIso, yesterdayIso, isOverdue, isAtRisk, maxDelayDays, isOverdueAllStages, isAtRiskAllStages,
  aggregatePlanActualByGroup, buildSCurve, NONE_LABEL,
} from '@/lib/dashboard-utils';
import { isStageDone } from '@/lib/stage-metrics';
import { RecentSubtestComments } from '@/components/dashboard/RecentSubtestComments';

const STATUS_COLORS: Record<string, string> = {
  Done: 'hsl(142, 71%, 45%)',
  WIP: 'hsl(43, 96%, 56%)',
  Planned: 'hsl(215, 20%, 65%)',
  Hold: 'hsl(0, 72%, 51%)',
};

interface SystemRef { id: string; system_code: string; }

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { value: atRiskDays } = useAtRiskThreshold();
  const [subtests, setSubtests] = useState<SubtestForDashboard[]>([]);
  const [systems, setSystems] = useState<SystemRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [scurveBucket, setScurveBucket] = useState<'day' | 'week'>((searchParams.get('bucket') as 'day' | 'week') || 'day');
  const [scurveOpen, setScurveOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('dashboard.scurve.open') === '1';
  });
  useEffect(() => {
    try { localStorage.setItem('dashboard.scurve.open', scurveOpen ? '1' : '0'); } catch {}
  }, [scurveOpen]);
  const [teamFilter, setTeamFilter] = useState<string>(searchParams.get('team') || 'all');
  const [dataDate, setDataDate] = useState(() => yesterdayIso(todayIso()));
  const [systemTextFilter, setSystemTextFilter] = useState(searchParams.get('system_text') || '');
  const [selectedSystemFilters, setSelectedSystemFilters] = useState<string[]>(searchParams.get('systems')?.split(',').filter(Boolean) || []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // page through subtests in batches of 1000
      let all: SubtestForDashboard[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data } = await supabase
          .from('subtests')
          .select('id, item_no, mos_code, system_id, subcontractor_name, subsub_name, hdec_pic_name, t1_status, t2_status, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date, predecessor_status_raw, pred_status, pred_planned_date, pred_actual_date, team, r1_status, r1_target_submission_date, r1_actual_submission_date, r2_status, r2_target_submission_date, r2_actual_submission_date, r2_target_approval_date, r2_actual_approval_date' as any)
          .eq('is_active', true)
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data as unknown as SubtestForDashboard[]);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const sysRes = await supabase.from('system_master').select('id, system_code').eq('is_active', true);
      const latestImport = await supabase
        .from('upload_batches')
        .select('data_date')
        .eq('status', 'completed')
        .not('data_date', 'is', null)
        .order('data_date', { ascending: false })
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setSubtests(all);
        setSystems(sysRes.data ?? []);
        if (latestImport.data?.data_date) setDataDate(latestImport.data.data_date);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const today = todayIso();
  const dataDateLabel = formatDdMmm(dataDate);
  const todayLabel = formatDdMmm(today);
  const sysCodeById = useMemo(() => {
    const m = new Map<string, string>();
    systems.forEach(s => m.set(s.id, s.system_code));
    return m;
  }, [systems]);

  const filteredSubtests = useMemo(
    () => teamFilter === 'all' ? subtests : subtests.filter(s => s.team === teamFilter),
    [subtests, teamFilter],
  );

  // ───── Top KPIs
  const kpis = useMemo(() => {
    const total = filteredSubtests.length;
    const systemCount = new Set(filteredSubtests.map(s => s.system_id)).size;

    // Overall done = R2 Approved (final completion in 5-stage workflow)
    const totalDone = filteredSubtests.filter(s => isStageDone(s, 't2')).length;
    const remaining = total - totalDone;
    const progressPct = total ? Math.round((totalDone / total) * 1000) / 10 : 0;

    // Overdue (any stage) as of Data Date
    const overdueCount = filteredSubtests.filter(s => isOverdue(s, dataDate)).length;
    const atRiskCount = filteredSubtests.filter(s => isAtRisk(s, today, atRiskDays)).length;

    // Stage-specific
    const stageStat = (stage: 'pred' | 't1' | 't2' | 'r1' | 'r2', plannedField: keyof SubtestForDashboard) => {
      const done = filteredSubtests.filter(s => isStageDone(s, stage)).length;
      const overdue = filteredSubtests.filter(s => {
        const planned = s[plannedField] as string | null | undefined;
        return planned && planned <= dataDate && !isStageDone(s, stage);
      }).length;
      const pct = total ? Math.round((done / total) * 1000) / 10 : 0;
      return { done, overdue, pct };
    };

    const pred = stageStat('pred', 'pred_planned_date');
    const t1 = stageStat('t1', 't1_planned_date');
    const t2 = stageStat('t2', 't2_planned_date');
    const r1 = stageStat('r1', 'r1_target_submission_date');
    const r2 = stageStat('r2', 'r2_target_approval_date');

    return {
      systemCount, total, totalDone, remaining, progressPct, overdueCount, atRiskCount,
      predDone: pred.done, predOverdue: pred.overdue, predPct: pred.pct,
      t1Done: t1.done, t1Overdue: t1.overdue, t1Pct: t1.pct,
      t2Done: t2.done, t2Overdue: t2.overdue, t2Pct: t2.pct,
      r1Done: r1.done, r1Overdue: r1.overdue, r1Pct: r1.pct,
      r2Done: r2.done, r2Overdue: r2.overdue, r2Pct: r2.pct,
    };
  }, [filteredSubtests, today, dataDate, atRiskDays]);

  // ───── Group aggregates per tab — Plan vs Actual rows
  const bySystem = useMemo(
    () => aggregatePlanActualByGroup(filteredSubtests, today, dataDate, s => s.system_id, k => sysCodeById.get(k) ?? '—'),
    [filteredSubtests, today, dataDate, sysCodeById]
  );
  const bySubcon = useMemo(
    () => aggregatePlanActualByGroup(filteredSubtests, today, dataDate, s => s.subcontractor_name ?? NONE_LABEL, k => k),
    [filteredSubtests, today, dataDate]
  );
  const bySubsub = useMemo(
    () => aggregatePlanActualByGroup(filteredSubtests, today, dataDate, s => s.subsub_name ?? NONE_LABEL, k => k),
    [filteredSubtests, today, dataDate]
  );
  const byHdec = useMemo(
    () => aggregatePlanActualByGroup(filteredSubtests, today, dataDate, s => s.hdec_pic_name ?? NONE_LABEL, k => k),
    [filteredSubtests, today, dataDate]
  );
  const byTeam = useMemo(
    () => aggregatePlanActualByGroup(filteredSubtests, today, dataDate, s => s.team ?? NONE_LABEL, k => k),
    [filteredSubtests, today, dataDate]
  );
  const systemFilterOptions = useMemo(
    () => Array.from(new Set(bySystem.map(r => r.label))).sort((a, b) => a.localeCompare(b)),
    [bySystem]
  );
  const filteredBySystem = useMemo(() => {
    const text = systemTextFilter.trim().toLowerCase();
    return bySystem.filter(r => {
      const matchesText = !text || r.label.toLowerCase().includes(text);
      const matchesSelection = selectedSystemFilters.length === 0 || selectedSystemFilters.includes(r.label);
      return matchesText && matchesSelection;
    });
  }, [bySystem, systemTextFilter, selectedSystemFilters]);
  const systemKeyResolver = useMemo(
    () => (key: string) => sysCodeById.get(key) ?? key,
    [sysCodeById]
  );

  // ───── Breakdown tab & export
  const [breakdownTab, setBreakdownTab] = useState(searchParams.get('tab') || 'system');
  const { toast } = useToast();

  const breakdownDataMap: Record<string, { rows: PlanActualRow[]; header: string }> = {
    system: { rows: filteredBySystem, header: 'System' },
    subcon: { rows: bySubcon, header: 'Subcontractor' },
    subsub: { rows: bySubsub, header: 'Sub-Sub' },
    hdec: { rows: byHdec, header: 'HDEC PIC' },
    team: { rows: byTeam, header: 'Team' },
  };

  const handleBreakdownExport = () => {
    const { rows, header } = breakdownDataMap[breakdownTab] ?? breakdownDataMap.system;
    if (!rows.length) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }
    const { rowCount, fileName } = exportPlanActualToExcel(rows, header, today, dataDate);
    toast({ title: 'Export complete', description: `${rowCount} groups → ${fileName}` });
  };

  // ───── S-Curve
  const [scurveStart, setScurveStart] = useState(searchParams.get('scurve_start') || '2026-04-15');
  const [scurveEnd, setScurveEnd] = useState(searchParams.get('scurve_end') || '2026-06-07');

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDelete = (key: string, value: string, defaultValue: string) => {
      if (!value || value === defaultValue) next.delete(key);
      else next.set(key, value);
    };
    setOrDelete('team', teamFilter, 'all');
    setOrDelete('bucket', scurveBucket, 'day');
    setOrDelete('tab', breakdownTab, 'system');
    setOrDelete('system_text', systemTextFilter, '');
    setOrDelete('systems', selectedSystemFilters.join(','), '');
    setOrDelete('scurve_start', scurveStart, '2026-04-15');
    setOrDelete('scurve_end', scurveEnd, '2026-06-07');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [teamFilter, scurveBucket, breakdownTab, systemTextFilter, selectedSystemFilters, scurveStart, scurveEnd, searchParams, setSearchParams]);

  const scurve = useMemo(
    () => buildSCurve(filteredSubtests, scurveBucket, scurveStart, scurveEnd, today),
    [filteredSubtests, scurveBucket, scurveStart, scurveEnd, today]
  );

  // ───── Top Overdue
  const topOverdue = useMemo(() => {
    return filteredSubtests
      .filter(s => isOverdue(s, dataDate))
      .map(s => ({ s, delay: maxDelayDays(s, dataDate) }))
      .sort((a, b) => b.delay - a.delay)
      .slice(0, 10);
  }, [filteredSubtests, dataDate]);

  // ───── Pie data
  const t1Pie = useMemo(() => buildPie(filteredSubtests, 't1_status'), [filteredSubtests]);
  const t2Pie = useMemo(() => buildPie(filteredSubtests, 't2_status'), [filteredSubtests]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading dashboard...</div>;
  }

  // Navigation helpers
  const goSubtests = (params: Record<string, string>) => {
    const q = new URLSearchParams({ source: 'dashboard', ...params }).toString();
    navigate(`/tc/raw-data?${q}`);
  };

  const chartConfig = {
    t1Planned: { label: 'T1 Planned (cum)', color: 'hsl(220, 65%, 55%)' },
    t1Actual: { label: 'T1 Actual (cum)', color: 'hsl(220, 65%, 36%)' },
    t2Planned: { label: 'T2 Planned (cum)', color: 'hsl(142, 50%, 55%)' },
    t2Actual: { label: 'T2 Actual (cum)', color: 'hsl(0, 72%, 50%)' },
    t1Met: { label: 'T1 Actual', color: 'hsl(220, 70%, 40%)' },
    t1Shortfall: { label: 'T1 Shortfall', color: 'hsl(0, 72%, 50%)' },
    t1Excess: { label: 'T1 Excess', color: 'hsl(220, 80%, 25%)' },
    t2Met: { label: 'T2 Actual', color: 'hsl(142, 60%, 40%)' },
    t2Shortfall: { label: 'T2 Shortfall', color: 'hsl(0, 72%, 50%)' },
    t2Excess: { label: 'T2 Excess', color: 'hsl(142, 70%, 20%)' },
    Done: { label: 'Done', color: STATUS_COLORS.Done },
    WIP: { label: 'WIP', color: STATUS_COLORS.WIP },
    Planned: { label: 'Planned', color: STATUS_COLORS.Planned },
    Hold: { label: 'Hold', color: STATUS_COLORS.Hold },
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">T&C Executive Dashboard</h1>
        <div className="flex items-center gap-3">
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {ALL_TEAMS.map(t => (
                <SelectItem key={t} value={t}>{TEAM_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            At-Risk threshold: ≤ {atRiskDays} day{atRiskDays === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* ─── Tier 1: Overall Summary ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <KpiCard icon={<ListChecks className="h-6 w-6 text-primary" />} label="Systems" value={kpis.systemCount} onClick={() => navigate('/tc/raw-data')} />
        <KpiCard icon={<ListChecks className="h-6 w-6 text-muted-foreground" />} label="Total Subtests" value={kpis.total.toLocaleString()} onClick={() => navigate('/tc/raw-data')} />
        <KpiCard icon={<CheckCircle2 className="h-6 w-6" style={{ color: STATUS_COLORS.Done }} />} label="Done" value={kpis.totalDone.toLocaleString()} sub="T2 Done" onClick={() => goSubtests({ t2_status: 'Done' })} />
        <KpiCard icon={<Clock className="h-6 w-6 text-muted-foreground" />} label="Remaining" value={kpis.remaining.toLocaleString()} sub="T2 not Done" onClick={() => goSubtests({ status: 'remaining' })} />
        <Card className="flex flex-col justify-center p-4">
          <p className="text-xs text-muted-foreground mb-1">Progress</p>
          <p className="text-xl font-bold text-foreground">{kpis.progressPct}%</p>
          <Progress value={kpis.progressPct} className="mt-1 h-2" />
        </Card>
        <KpiCard
          icon={<AlertTriangle className="h-6 w-6 text-destructive" />}
          label="Overdue"
          value={kpis.overdueCount}
          accent="destructive"
          onClick={() => goSubtests({ status: 'overdue', as_of: dataDate })}
        />
      </div>

      {/* ─── Tier 2: Stage Cards (Pred / T1 / T2 / R1 / R2) ─── */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StageCard stage="Predecessor" total={kpis.total} done={kpis.predDone} remaining={kpis.total - kpis.predDone} pct={kpis.predPct} overdue={kpis.predOverdue} onClick={() => goSubtests({ pred_status: 'Done' })} />
        <StageCard stage="T1" total={kpis.total} done={kpis.t1Done} remaining={kpis.total - kpis.t1Done} pct={kpis.t1Pct} overdue={kpis.t1Overdue} onClick={() => goSubtests({ t1_status: 'Done' })} />
        <StageCard stage="T2" total={kpis.total} done={kpis.t2Done} remaining={kpis.total - kpis.t2Done} pct={kpis.t2Pct} overdue={kpis.t2Overdue} onClick={() => goSubtests({ t2_status: 'Done' })} />
        <StageCard stage="R1 (Sub→HDEC)" total={kpis.total} done={kpis.r1Done} remaining={kpis.total - kpis.r1Done} pct={kpis.r1Pct} overdue={kpis.r1Overdue} onClick={() => goSubtests({ r1_status: 'Submitted' })} />
        <StageCard stage="R2 (HDEC→Client)" total={kpis.total} done={kpis.r2Done} remaining={kpis.total - kpis.r2Done} pct={kpis.r2Pct} overdue={kpis.r2Overdue} onClick={() => goSubtests({ r2_status: 'Approved' })} />
      </div>


      <div className="grid gap-3 md:grid-cols-2">
        <AlertBanner
          tone="destructive"
          icon={<AlertTriangle className="h-5 w-5" />}
          title={`${kpis.overdueCount} Overdue Subtest${kpis.overdueCount === 1 ? '' : 's'}`}
          description={`Planned date is on/before Data Date (${dataDateLabel}) and not yet Done.`}
          onClick={() => goSubtests({ status: 'overdue', as_of: dataDate })}
        />
        <AlertBanner
          tone="warning"
          icon={<Clock className="h-5 w-5" />}
          title={`${kpis.atRiskCount} At-Risk Subtest${kpis.atRiskCount === 1 ? '' : 's'}`}
          description={`Planned date is within ${atRiskDays} day(s) and not yet Done.`}
          onClick={() => goSubtests({ status: 'at_risk', at_risk_days: String(atRiskDays) })}
        />
      </div>

      {/* ─── 4 Tabs ─── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Plan vs Actual - Summary</CardTitle>
          <Button variant="outline" size="sm" onClick={handleBreakdownExport}>
            <Download className="mr-1.5 h-4 w-4" />
            Excel
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={breakdownTab} onValueChange={setBreakdownTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="system">By System</TabsTrigger>
              <TabsTrigger value="subcon">By Subcontractor</TabsTrigger>
              <TabsTrigger value="subsub">By Sub-Sub</TabsTrigger>
              <TabsTrigger value="hdec">By HDEC PIC</TabsTrigger>
              <TabsTrigger value="team">By Team</TabsTrigger>
            </TabsList>
            <TabsContent value="system">
              <PlanActualTable
                rows={filteredBySystem}
                groupParam="system"
                groupHeader="System"
                today={today}
                dataDate={dataDate}
                todayLabel={todayLabel}
                dataDateLabel={dataDateLabel}
                navigate={navigate}
                keyToFilterValue={systemKeyResolver}
                emptyMessage="No matching systems."
                systemFilter={{
                  text: systemTextFilter,
                  selected: selectedSystemFilters,
                  options: systemFilterOptions,
                  onTextChange: setSystemTextFilter,
                  onSelectedChange: setSelectedSystemFilters,
                }}
              />
            </TabsContent>
            <TabsContent value="subcon">
              <PlanActualTable rows={bySubcon} groupParam="subcon" groupHeader="Subcontractor" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} />
            </TabsContent>
            <TabsContent value="subsub">
              <PlanActualTable rows={bySubsub} groupParam="subsub" groupHeader="Sub-Sub" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} />
            </TabsContent>
            <TabsContent value="hdec">
              <PlanActualTable rows={byHdec} groupParam="hdec_pic" groupHeader="HDEC PIC" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} />
            </TabsContent>
            <TabsContent value="team">
              <PlanActualTable rows={byTeam} groupParam="team" groupHeader="Team" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ─── S-Curve Combo Chart ─── */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-2">
          <button
            type="button"
            onClick={() => setScurveOpen((v) => !v)}
            className="flex items-center gap-2 text-left hover:opacity-80"
            aria-expanded={scurveOpen}
            aria-label="Toggle S-Curve chart"
          >
            {scurveOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <CardTitle className="text-base">Plan vs Actual — S-Curve</CardTitle>
          </button>
          {scurveOpen && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Date range pickers */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {formatDdMmm(scurveStart)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={new Date(scurveStart + 'T00:00:00')}
                    onSelect={(d) => d && setScurveStart(d.toISOString().slice(0, 10))}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">~</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {formatDdMmm(scurveEnd)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={new Date(scurveEnd + 'T00:00:00')}
                    onSelect={(d) => d && setScurveEnd(d.toISOString().slice(0, 10))}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {/* Day / Week toggle */}
              <div className="flex gap-1 rounded-md border p-0.5">
                <button
                  onClick={() => setScurveBucket('day')}
                  className={`px-3 py-1 text-xs rounded ${scurveBucket === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setScurveBucket('week')}
                  className={`px-3 py-1 text-xs rounded ${scurveBucket === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  Weekly
                </button>
              </div>
            </div>
          )}
        </CardHeader>
        {scurveOpen && (
          <CardContent>
            {scurve.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No data in range.</p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[360px] w-full">
              <ComposedChart data={scurve} margin={{ left: 12, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucketLabel" tick={{ fontSize: 10 }} minTickGap={20} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine yAxisId="left" x={formatDdMmm(today)} stroke="hsl(var(--destructive))" strokeDasharray="4 2" label={{ value: 'Today', fontSize: 10, fill: 'hsl(var(--destructive))' }} />
                {/* T1 stacked bar */}
                <Bar yAxisId="right" dataKey="t1Met" stackId="t1" fill="hsl(220, 70%, 40%)" name="T1 Actual" barSize={10} />
                <Bar yAxisId="right" dataKey="t1Shortfall" stackId="t1" fill="hsl(0, 72%, 50%)" name="T1 Shortfall" barSize={10} />
                <Bar yAxisId="right" dataKey="t1Excess" stackId="t1" fill="hsl(220, 80%, 25%)" name="T1 Excess" barSize={10} />
                <Bar yAxisId="right" dataKey="t1FuturePlan" stackId="t1" fill="hsl(220, 70%, 75%)" name="T1 Plan (Future)" barSize={10} />
                {/* T2 stacked bar */}
                <Bar yAxisId="right" dataKey="t2Met" stackId="t2" fill="hsl(142, 60%, 40%)" name="T2 Actual" barSize={10} />
                <Bar yAxisId="right" dataKey="t2Shortfall" stackId="t2" fill="hsl(0, 72%, 50%)" name="T2 Shortfall" barSize={10} />
                <Bar yAxisId="right" dataKey="t2Excess" stackId="t2" fill="hsl(142, 70%, 20%)" name="T2 Excess" barSize={10} />
                <Bar yAxisId="right" dataKey="t2FuturePlan" stackId="t2" fill="hsl(142, 60%, 75%)" name="T2 Plan (Future)" barSize={10} />
                {/* Lines — cumulative S-Curve (left axis) */}
                <Line yAxisId="left" type="monotone" dataKey="t1Planned" stroke="hsl(220, 65%, 55%)" strokeDasharray="5 3" strokeWidth={2} dot={false} name="T1 Planned (cum)" connectNulls={false} />
                <Line yAxisId="left" type="monotone" dataKey="t1Actual" stroke="hsl(220, 65%, 36%)" strokeWidth={2} dot={false} name="T1 Actual (cum)" connectNulls={false} />
                <Line yAxisId="left" type="monotone" dataKey="t2Planned" stroke="hsl(142, 50%, 55%)" strokeDasharray="5 3" strokeWidth={2} dot={false} name="T2 Planned (cum)" connectNulls={false} />
                <Line yAxisId="left" type="monotone" dataKey="t2Actual" stroke="hsl(0, 72%, 50%)" strokeWidth={2} dot={false} name="T2 Actual (cum)" connectNulls={false} />
              </ComposedChart>
            </ChartContainer>
          )}
        </CardContent>
        )}
      </Card>

      {/* ─── Recent Comments Feed ─── */}
      <RecentSubtestComments />

      {/* ─── Bottom split ─── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Top 10 Overdue Subtests
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topOverdue.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No overdue subtests 🎉</p>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>System</TableHead>
                      <TableHead>Item No</TableHead>
                      <TableHead>MOS</TableHead>
                      <TableHead>Subcon</TableHead>
                      <TableHead className="text-right">Days Late</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topOverdue.map(({ s, delay }) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/subtests/${s.id}`)}
                      >
                        <TableCell className="font-medium">{sysCodeById.get(s.system_id) ?? '—'}</TableCell>
                        <TableCell>{s.item_no}</TableCell>
                        <TableCell className="text-xs">{s.mos_code}</TableCell>
                        <TableCell className="text-xs truncate max-w-[120px]">{s.subcontractor_name ?? '—'}</TableCell>
                        <TableCell className="text-right font-semibold text-destructive">+{delay}d</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <PieBlock title="T1" data={t1Pie} chartConfig={chartConfig} onSliceClick={(name) => goSubtests({ t1_status: name })} />
              <PieBlock title="T2" data={t2Pie} chartConfig={chartConfig} onSliceClick={(name) => goSubtests({ t2_status: name })} />
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

/* ───────── Subcomponents ───────── */

function KpiCard({
  icon, label, value, sub, accent, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'destructive';
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={`${onClick ? 'cursor-pointer hover:bg-muted/40 transition-colors' : ''} ${accent === 'destructive' ? 'border-destructive/30' : ''}`}
    >
      <CardContent className="flex items-center gap-3 p-4">
        {icon}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className={`text-2xl font-bold ${accent === 'destructive' ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function AlertBanner({
  tone, icon, title, description, onClick,
}: {
  tone: 'destructive' | 'warning';
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  const cls = tone === 'destructive'
    ? 'border-destructive/40 bg-destructive/5'
    : 'border-amber-500/40 bg-amber-500/5';
  const iconCls = tone === 'destructive' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400';
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 ${cls}`}
    >
      <div className="flex items-center gap-3">
        <div className={iconCls}>{icon}</div>
        <div>
          <p className={`font-semibold ${iconCls}`}>{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
        View <ChevronRight className="h-4 w-4" />
      </div>
    </button>
  );
}

function VarianceCell({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground/40 tabular-nums">0</span>;
  if (value > 0) return <span className="text-green-700 dark:text-green-400 tabular-nums">+{value}</span>;
  return <span className="text-destructive font-semibold tabular-nums">{value}</span>;
}

function HeaderTotalNumber({ value, tone }: { value: number; tone?: 'done' | 'remain' | 'delay' }) {
  const cls = value === 0
    ? 'text-muted-foreground/40'
    : tone === 'done'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'remain'
        ? 'text-amber-700 dark:text-amber-400'
        : tone === 'delay'
          ? 'text-destructive'
          : 'text-foreground';
  return <span className={cn('tabular-nums font-semibold', cls)}>{value.toLocaleString()}</span>;
}

function HeaderTotalVariance({ value }: { value: number }) {
  if (value === 0) return <span className="tabular-nums font-semibold text-muted-foreground/40">0</span>;
  if (value > 0) return <span className="tabular-nums font-semibold text-green-700 dark:text-green-400">+{value.toLocaleString()}</span>;
  return <span className="tabular-nums font-semibold text-destructive">{value.toLocaleString()}</span>;
}

const STAGE_BADGE: Record<'pred' | 't1' | 't2' | 'r1' | 'r2', string> = {
  pred: 'bg-muted text-muted-foreground border-border',
  t1: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  t2: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
  r1: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  r2: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
};

const summaryNumberClass = (value: number, tone?: 'done' | 'remain') => cn(
  'tabular-nums font-semibold',
  value === 0
    ? 'text-muted-foreground/40'
    : tone === 'done'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'remain'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-foreground',
);

function StageBadge({ stage, label }: { stage: 'pred' | 't1' | 't2' | 'r1' | 'r2'; label: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STAGE_BADGE[stage]}`}>
      {label}
    </span>
  );
}

function ClickNum({ value, onClick, hideZero = false }: { value: number; onClick?: () => void; hideZero?: boolean }) {
  const zeroClass = value === 0 ? 'text-muted-foreground/40' : '';
  if (hideZero && value === 0) return <span className="tabular-nums text-muted-foreground/40" aria-label="0" />;
  if (!onClick) return <span className={cn('tabular-nums', zeroClass)}>{value}</span>;
  return (
    <button
      type="button"
      className={cn(
        'tabular-nums hover:underline',
        zeroClass,
        value !== 0 && 'underline decoration-dotted decoration-muted-foreground/30 underline-offset-2 hover:decoration-foreground'
      )}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {value}
    </button>
  );
}
function StageCard({
  stage, total, done, remaining, pct, overdue, onClick,
}: {
  stage: string;
  total: number;
  done: number;
  remaining: number;
  pct: number;
  overdue: number;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={`${onClick ? 'cursor-pointer hover:bg-muted/40 transition-colors' : ''} ${overdue > 0 ? 'border-destructive/30' : ''}`}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{stage}</p>
          {overdue > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {overdue} OD
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[11px] text-muted-foreground">Total</p>
            <p className="text-sm font-semibold text-foreground">{total.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Done</p>
            <p className="text-sm font-semibold text-foreground">{done.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Remaining</p>
            <p className="text-sm font-semibold text-foreground">{remaining.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Progress value={pct} className="h-2 flex-1" />
          <span className="text-xs font-medium text-muted-foreground w-12 text-right">{pct}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ClickVariance({ value, onClick }: { value: number; onClick?: () => void }) {
  if (!onClick) return <VarianceCell value={value} />;
  return (
    <button
      type="button"
      className="hover:underline"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <VarianceCell value={value} />
    </button>
  );
}

function SystemHeaderFilter({
  text, selected, options, onTextChange, onSelectedChange,
}: {
  text: string;
  selected: string[];
  options: string[];
  onTextChange: (value: string) => void;
  onSelectedChange: (value: string[]) => void;
}) {
  const isActive = text.trim().length > 0 || selected.length > 0;
  const toggle = (value: string) => {
    onSelectedChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };
  const clear = () => {
    onTextChange('');
    onSelectedChange([]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted/80',
            isActive ? 'text-primary' : 'text-muted-foreground/60'
          )}
          onClick={(e) => e.stopPropagation()}
          title="Filter System"
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <Input
          placeholder="Filter systems..."
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          className="mb-2 h-8 text-xs"
        />
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{selected.length ? `${selected.length} selected` : 'All systems'}</span>
          <button type="button" className="hover:underline" onClick={clear}>Clear</button>
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
          {options.map(option => (
            <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
              <Checkbox
                checked={selected.includes(option)}
                onCheckedChange={() => toggle(option)}
                className="h-3.5 w-3.5"
              />
              <span className="min-w-0 truncate" title={option}>{option}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PlanActualTable({
  rows, groupParam, groupHeader, today, dataDate, todayLabel, dataDateLabel, navigate, keyToFilterValue, emptyMessage, systemFilter,
}: {
  rows: PlanActualRow[];
  groupParam: 'system' | 'subcon' | 'subsub' | 'hdec_pic' | 'team';
  groupHeader: string;
  today: string;
  dataDate: string;
  todayLabel: string;
  dataDateLabel: string;
  navigate: (to: string) => void;
  keyToFilterValue?: (key: string) => string;
  emptyMessage?: string;
  systemFilter?: {
    text: string;
    selected: string[];
    options: string[];
    onTextChange: (value: string) => void;
    onSelectedChange: (value: string[]) => void;
  };
}) {
  if (rows.length === 0 && !systemFilter) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage ?? 'No data.'}</p>;
  }
  const filterValue = (key: string) => (keyToFilterValue ? keyToFilterValue(key) : key);
  const go = (groupKey: string, extra?: Record<string, string>) => {
    const value = filterValue(groupKey);
    const params: Record<string, string> = { source: 'dashboard', ...extra };
    if (value && value !== NONE_LABEL) params[groupParam] = value;
    navigate(`/tc/raw-data?${new URLSearchParams(params).toString()}`);
  };

  const headerTotals = useMemo(() => {
    const totals = rows.reduce((acc, row) => {
      const stages = [row.predecessor, row.t1, row.t2];
      stages.forEach((m) => {
        acc.stageTotal += row.totalSubtests;
        acc.stageDone += m.cumActual;
        acc.cumPlan += m.cumPlan;
        acc.cumActual += m.cumActual;
        acc.dataDatePlan += m.dataDatePlan;
        acc.dataDateActual += m.dataDateActual;
        acc.dataDateDelay += m.dataDateDelay;
        acc.todayPlan += m.todayPlan;
        acc.todayActual += m.todayActual;
        acc.todayDelay += m.todayDelay;
      });
      return acc;
    }, {
      stageTotal: 0,
      stageDone: 0,
      cumPlan: 0,
      cumActual: 0,
      dataDatePlan: 0,
      dataDateActual: 0,
      dataDateDelay: 0,
      todayPlan: 0,
      todayActual: 0,
      todayDelay: 0,
    });

    return {
      ...totals,
      stageRemain: totals.stageTotal - totals.stageDone,
      cumDelta: totals.cumActual - totals.cumPlan,
      dataDateDelta: totals.dataDateActual - totals.dataDatePlan,
      todayDelta: totals.todayActual - totals.todayPlan,
    };
  }, [rows]);

  type StageDef = {
    stage: 'pred' | 't1' | 't2' | 'r1' | 'r2';
    label: string;
    metrics: PlanActualMetrics;
    planTo?: string;
    actualTo?: string;
    planOn?: string;
    actualOn?: string;
    delayAsOf?: string;
    delayOn?: string;
    actualUnplannedOn?: string;
    actualOverride?: { param: string; value: string };
  };

  const colgroup = (
    <colgroup>
      <col className="w-[210px]" />
      <col className="w-[86px]" />
      <col className="w-[58px]" />
      <col className="w-[58px]" />
      <col className="w-[64px]" />
      {Array.from({ length: 11 }).map((_, i) => <col key={i} className="w-[56px]" />)}
      <col className="w-[140px]" />
    </colgroup>
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1270px]">
        <div className="overflow-y-auto [scrollbar-gutter:stable]">
          <Table className="table-fixed">
            {colgroup}
        <TableHeader className="bg-background">
          <TableRow>
            <TableHead rowSpan={3} className="text-center align-middle">
              <div className="flex items-center justify-center gap-1.5">
                <span>{groupHeader}</span>
                {systemFilter && <SystemHeaderFilter {...systemFilter} />}
              </div>
            </TableHead>
            <TableHead rowSpan={3} className="text-center align-middle">Stage</TableHead>
            <TableHead className="text-center align-bottom">Total</TableHead>
            <TableHead className="text-center align-bottom">Done</TableHead>
            <TableHead className="text-center align-bottom border-r border-border">Remain</TableHead>
            <TableHead colSpan={3} className="text-center border-l border-border bg-muted/30">To Data Date (Cumulative)</TableHead>
            <TableHead colSpan={4} className="text-center border-l border-border bg-muted/30">Data Date ({dataDateLabel})</TableHead>
            <TableHead colSpan={4} className="text-center border-l border-border bg-muted/30">Today ({todayLabel})</TableHead>
            <TableHead rowSpan={3} className="w-[140px] text-center align-middle border-l border-border">Progress</TableHead>
          </TableRow>
          <TableRow>
            <TableHead className="text-center text-[11px] text-muted-foreground/70">All</TableHead>
            <TableHead className="text-center text-[11px] text-muted-foreground/70">Done</TableHead>
            <TableHead className="text-center border-r border-border text-[11px] text-muted-foreground/70">Open</TableHead>
            <TableHead className="text-center border-l border-border text-[11px]">Plan</TableHead>
            <TableHead className="text-center text-[11px]">Actual</TableHead>
            <TableHead className="text-center text-[11px]">Δ</TableHead>
            <TableHead className="text-center border-l border-border text-[11px]">Plan</TableHead>
            <TableHead className="text-center text-[11px]">Actual</TableHead>
            <TableHead className="text-center text-[11px]">Δ</TableHead>
            <TableHead className="text-center text-[11px]">Delay</TableHead>
            <TableHead className="text-center border-l border-border text-[11px]">Plan</TableHead>
            <TableHead className="text-center text-[11px]">Actual</TableHead>
            <TableHead className="text-center text-[11px]">Δ</TableHead>
            <TableHead className="text-center text-[11px]">Delay</TableHead>
          </TableRow>
          <TableRow className="bg-muted/20 hover:bg-muted/20">
            <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={headerTotals.stageTotal} /></TableHead>
            <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={headerTotals.stageDone} tone="done" /></TableHead>
            <TableHead className="h-8 px-2 text-center border-r border-border"><HeaderTotalNumber value={headerTotals.stageRemain} tone="remain" /></TableHead>
            <TableHead className="h-8 px-2 text-center border-l border-border"><HeaderTotalNumber value={headerTotals.cumPlan} /></TableHead>
            <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={headerTotals.cumActual} /></TableHead>
            <TableHead className="h-8 px-2 text-center"><HeaderTotalVariance value={headerTotals.cumDelta} /></TableHead>
            <TableHead className="h-8 px-2 text-center border-l border-border"><HeaderTotalNumber value={headerTotals.dataDatePlan} /></TableHead>
            <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={headerTotals.dataDateActual} /></TableHead>
            <TableHead className="h-8 px-2 text-center"><HeaderTotalVariance value={headerTotals.dataDateDelta} /></TableHead>
            <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={headerTotals.dataDateDelay} tone="delay" /></TableHead>
            <TableHead className="h-8 px-2 text-center border-l border-border"><HeaderTotalNumber value={headerTotals.todayPlan} /></TableHead>
            <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={headerTotals.todayActual} /></TableHead>
            <TableHead className="h-8 px-2 text-center"><HeaderTotalVariance value={headerTotals.todayDelta} /></TableHead>
            <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={headerTotals.todayDelay} tone="delay" /></TableHead>
          </TableRow>
        </TableHeader>
          </Table>
        </div>
        <div className="max-h-[440px] overflow-y-auto [scrollbar-gutter:stable]">
          <Table className="table-fixed">
            {colgroup}
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={17} className="py-8 text-center text-sm text-muted-foreground">
                {emptyMessage ?? 'No data.'}
              </TableCell>
            </TableRow>
          ) : rows.map((r, idx) => {
            const stages: StageDef[] = [
              {
                stage: 'pred', label: 'Pred', metrics: r.predecessor,
                planTo: 'pred_planned_to',
                actualTo: 'pred_actual_to',
                planOn: 'pred_planned_on',
                actualOn: 'pred_actual_on',
                delayAsOf: 'pred_delay_asof',
                delayOn: 'pred_delay_on',
                actualUnplannedOn: 'pred_actual_unplanned_on',
              },
              {
                stage: 't1', label: 'T1', metrics: r.t1,
                planTo: 't1_planned_to',
                actualTo: 't1_actual_to',
                planOn: 't1_planned_on',
                actualOn: 't1_actual_on',
                delayAsOf: 't1_delay_asof',
                delayOn: 't1_delay_on',
                actualUnplannedOn: 't1_actual_unplanned_on',
              },
              {
                stage: 't2', label: 'T2', metrics: r.t2,
                planTo: 't2_planned_to',
                actualTo: 't2_actual_to',
                planOn: 't2_planned_on',
                actualOn: 't2_actual_on',
                delayAsOf: 't2_delay_asof',
                delayOn: 't2_delay_on',
                actualUnplannedOn: 't2_actual_unplanned_on',
              },
              {
                stage: 'r1', label: 'R1', metrics: r.r1,
                planTo: 'r1_planned_to',
                actualTo: 'r1_actual_to',
                planOn: 'r1_planned_on',
                actualOn: 'r1_actual_on',
                delayAsOf: 'r1_delay_asof',
                delayOn: 'r1_delay_on',
                actualUnplannedOn: 'r1_actual_unplanned_on',
              },
              {
                stage: 'r2', label: 'R2', metrics: r.r2,
                planTo: 'r2_planned_to',
                actualTo: 'r2_actual_to',
                planOn: 'r2_planned_on',
                actualOn: 'r2_actual_on',
                delayAsOf: 'r2_delay_asof',
                delayOn: 'r2_delay_on',
                actualUnplannedOn: 'r2_actual_unplanned_on',
              },
            ];

            return stages.map((st, i) => {
              const m = st.metrics;
              const cumD = m.cumActual - m.cumPlan;
              const dataDateD = m.dataDateActual - m.dataDatePlan;
              const todayD = m.todayActual - m.todayPlan;
              const pct = r.totalSubtests ? Math.round((m.cumActual / r.totalSubtests) * 100) : 0;
              const remain = r.totalSubtests - m.cumActual;
              const isFirst = i === 0;
              const groupBorder = idx > 0 && isFirst ? 'border-t-2 border-t-border' : '';
              return (
                <TableRow
                  key={`${r.key}-${st.stage}`}
                  className={`${groupBorder} cursor-pointer`}
                  onClick={() => go(r.key)}
                >
                  {isFirst && (
                    <>
                      <TableCell rowSpan={5} className="font-medium align-top px-2 py-1.5">{r.label}</TableCell>
                    </>
                  )}
                  <TableCell className="px-2 py-1.5 bg-muted/10">
                    <StageBadge stage={st.stage} label={st.label} />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5 bg-muted/10">
                    <span className={summaryNumberClass(r.totalSubtests)}>{r.totalSubtests}</span>
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5 bg-muted/10">
                    <span className={summaryNumberClass(m.cumActual, 'done')}>{m.cumActual}</span>
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5 bg-muted/10 border-r border-border">
                    <span className={summaryNumberClass(remain, 'remain')}>{remain}</span>
                  </TableCell>
                  {/* Cumulative (to Data Date) */}
                  <TableCell className="text-right border-l border-border text-xs px-2 py-1.5">
                    <ClickNum value={m.cumPlan} onClick={st.planTo ? () => go(r.key, { [st.planTo!]: dataDate }) : undefined} />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <ClickNum
                      value={m.cumActual}
                      onClick={
                        st.actualTo
                          ? () => go(r.key, { [st.actualTo!]: dataDate })
                          : st.actualOverride
                            ? () => go(r.key, { [st.actualOverride!.param]: st.actualOverride!.value })
                            : undefined
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <ClickVariance
                      value={cumD}
                      onClick={cumD < 0 && st.delayAsOf ? () => go(r.key, { [st.delayAsOf!]: dataDate }) : undefined}
                    />
                  </TableCell>
                  {/* Data Date */}
                  <TableCell className="text-right border-l border-border text-xs px-2 py-1.5">
                    <ClickNum value={m.dataDatePlan} onClick={st.planOn ? () => go(r.key, { [st.planOn!]: dataDate }) : undefined} />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <ClickNum value={m.dataDateActual} onClick={st.actualOn ? () => go(r.key, { [st.actualOn!]: dataDate }) : undefined} />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <ClickVariance
                      value={dataDateD}
                      onClick={
                        dataDateD < 0 && st.delayOn
                          ? () => go(r.key, { [st.delayOn!]: dataDate })
                          : dataDateD > 0 && st.actualUnplannedOn
                            ? () => go(r.key, { [st.actualUnplannedOn!]: dataDate })
                            : undefined
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5 font-semibold text-destructive">
                    <ClickNum value={m.dataDateDelay} hideZero onClick={st.delayOn ? () => go(r.key, { [st.delayOn!]: dataDate }) : undefined} />
                  </TableCell>
                  {/* Today */}
                  <TableCell className="text-right border-l border-border text-xs px-2 py-1.5">
                    <ClickNum value={m.todayPlan} onClick={st.planOn ? () => go(r.key, { [st.planOn!]: today }) : undefined} />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <ClickNum value={m.todayActual} onClick={st.actualOn ? () => go(r.key, { [st.actualOn!]: today }) : undefined} />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <ClickVariance
                      value={todayD}
                      onClick={
                        todayD < 0 && st.delayOn
                          ? () => go(r.key, { [st.delayOn!]: today })
                          : todayD > 0 && st.actualUnplannedOn
                            ? () => go(r.key, { [st.actualUnplannedOn!]: today })
                            : undefined
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5 font-semibold text-destructive">
                    <ClickNum value={m.todayDelay} hideZero onClick={st.delayOn ? () => go(r.key, { [st.delayOn!]: today }) : undefined} />
                  </TableCell>
                  <TableCell className="border-l border-border px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-[10px] text-muted-foreground w-9 text-right tabular-nums">{pct}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            });
          })}
        </TableBody>
      </Table>
        </div>
      </div>
    </div>
  );
}

function buildPie(subs: SubtestForDashboard[], field: 't1_status' | 't2_status') {
  const counts: Record<string, number> = { Done: 0, WIP: 0, Planned: 0, Hold: 0 };
  subs.forEach(s => {
    const v = s[field] ?? 'Planned';
    if (v in counts) counts[v]++;
  });
  return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
}

function PieBlock({
  title, data, chartConfig, onSliceClick,
}: {
  title: string;
  data: { name: string; value: number }[];
  chartConfig: Record<string, { label: string; color: string }>;
  onSliceClick: (name: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-center text-xs font-medium text-muted-foreground">{title} Status</p>
      <ChartContainer config={chartConfig} className="mx-auto h-[170px] w-[170px]">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={38}>
            {data.map(entry => (
              <Cell
                key={entry.name}
                fill={STATUS_COLORS[entry.name]}
                className="cursor-pointer"
                onClick={() => onSliceClick(entry.name)}
              />
            ))}
          </Pie>
          <ChartTooltip content={<ChartTooltipContent />} />
        </PieChart>
      </ChartContainer>
      <div className="mt-1 flex flex-wrap justify-center gap-2 text-[10px]">
        {data.map(d => (
          <button
            key={d.name}
            onClick={() => onSliceClick(d.name)}
            className="flex items-center gap-1 hover:underline"
          >
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: STATUS_COLORS[d.name] }} />
            {d.name} ({d.value})
          </button>
        ))}
      </div>
    </div>
  );
}
