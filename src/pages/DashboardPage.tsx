import { useEffect, useMemo, useState } from 'react';
import { ALL_TEAMS, TEAM_LABELS, type TeamType } from '@/types/enums';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
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
  AlertTriangle, CheckCircle2, ListChecks, Clock, TrendingUp, ChevronRight, CalendarIcon, Download,
} from 'lucide-react';
import { exportPlanActualToExcel } from '@/lib/dashboard-excel-export';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import { useAtRiskThreshold } from '@/hooks/useAppSettings';
import {
  type SubtestForDashboard, type PlanActualRow, type PlanActualMetrics,
  todayIso, yesterdayIso, isOverdue, isAtRisk, maxDelayDays,
  aggregatePlanActualByGroup, buildSCurve, NONE_LABEL,
} from '@/lib/dashboard-utils';

const STATUS_COLORS: Record<string, string> = {
  Done: 'hsl(142, 71%, 45%)',
  WIP: 'hsl(43, 96%, 56%)',
  Planned: 'hsl(215, 20%, 65%)',
  Hold: 'hsl(0, 72%, 51%)',
};

interface SystemRef { id: string; system_code: string; }

export default function DashboardPage() {
  const navigate = useNavigate();
  const { value: atRiskDays } = useAtRiskThreshold();
  const [subtests, setSubtests] = useState<SubtestForDashboard[]>([]);
  const [systems, setSystems] = useState<SystemRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [scurveBucket, setScurveBucket] = useState<'day' | 'week'>('day');
  const [teamFilter, setTeamFilter] = useState<string>('all');

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
          .select('id, item_no, mos_code, system_id, subcontractor_name, subsub_name, hdec_pic_name, t1_status, t2_status, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date, pred_status, pred_planned_date, pred_actual_date, team' as any)
          .eq('is_active', true)
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data as unknown as SubtestForDashboard[]);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const sysRes = await supabase.from('system_master').select('id, system_code').eq('is_active', true);
      if (!cancelled) {
        setSubtests(all);
        setSystems(sysRes.data ?? []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const today = todayIso();
  const yesterday = yesterdayIso(today);
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

    // Overall done = T2 Done (final completion)
    const totalDone = filteredSubtests.filter(s => s.t2_status === 'Done').length;
    const remaining = total - totalDone;
    const progressPct = total ? Math.round((totalDone / total) * 1000) / 10 : 0;

    // Overdue (any stage)
    const overdueCount = filteredSubtests.filter(s => isOverdue(s, today)).length;
    const atRiskCount = filteredSubtests.filter(s => isAtRisk(s, today, atRiskDays)).length;

    // Stage-specific
    const predDone = filteredSubtests.filter(s => s.pred_status === 'Done').length;
    const predOverdue = filteredSubtests.filter(s => s.pred_planned_date && s.pred_planned_date < today && s.pred_status !== 'Done').length;
    const predPct = total ? Math.round((predDone / total) * 1000) / 10 : 0;

    const t1Done = filteredSubtests.filter(s => s.t1_status === 'Done').length;
    const t1Overdue = filteredSubtests.filter(s => s.t1_planned_date && s.t1_planned_date < today && s.t1_status !== 'Done').length;
    const t1Pct = total ? Math.round((t1Done / total) * 1000) / 10 : 0;

    const t2Done = totalDone;
    const t2Overdue = filteredSubtests.filter(s => s.t2_planned_date && s.t2_planned_date < today && s.t2_status !== 'Done').length;
    const t2Pct = progressPct;

    return {
      systemCount, total, totalDone, remaining, progressPct, overdueCount, atRiskCount,
      predDone, predOverdue, predPct,
      t1Done, t1Overdue, t1Pct,
      t2Done, t2Overdue, t2Pct,
    };
  }, [filteredSubtests, today, atRiskDays]);

  // ───── Group aggregates per tab — Plan vs Actual rows
  const bySystem = useMemo(
    () => aggregatePlanActualByGroup(filteredSubtests, today, s => s.system_id, k => sysCodeById.get(k) ?? '—'),
    [filteredSubtests, today, sysCodeById]
  );
  const bySubcon = useMemo(
    () => aggregatePlanActualByGroup(filteredSubtests, today, s => s.subcontractor_name ?? NONE_LABEL, k => k),
    [filteredSubtests, today]
  );
  const bySubsub = useMemo(
    () => aggregatePlanActualByGroup(filteredSubtests, today, s => s.subsub_name ?? NONE_LABEL, k => k),
    [filteredSubtests, today]
  );
  const byHdec = useMemo(
    () => aggregatePlanActualByGroup(filteredSubtests, today, s => s.hdec_pic_name ?? NONE_LABEL, k => k),
    [filteredSubtests, today]
  );
  const byTeam = useMemo(
    () => aggregatePlanActualByGroup(filteredSubtests, today, s => s.team ?? NONE_LABEL, k => k),
    [filteredSubtests, today]
  );
  const systemKeyResolver = useMemo(
    () => (key: string) => sysCodeById.get(key) ?? key,
    [sysCodeById]
  );

  // ───── Breakdown tab & export
  const [breakdownTab, setBreakdownTab] = useState('system');
  const { toast } = useToast();

  const breakdownDataMap: Record<string, { rows: PlanActualRow[]; header: string }> = {
    system: { rows: bySystem, header: 'System' },
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
    const { rowCount, fileName } = exportPlanActualToExcel(rows, header, today, yesterday);
    toast({ title: 'Export complete', description: `${rowCount} groups → ${fileName}` });
  };

  // ───── S-Curve
  const [scurveStart, setScurveStart] = useState('2026-04-15');
  const [scurveEnd, setScurveEnd] = useState('2026-06-07');

  const scurve = useMemo(
    () => buildSCurve(filteredSubtests, scurveBucket, scurveStart, scurveEnd, today),
    [filteredSubtests, scurveBucket, scurveStart, scurveEnd, today]
  );

  // ───── Top Overdue
  const topOverdue = useMemo(() => {
    return filteredSubtests
      .filter(s => isOverdue(s, today))
      .map(s => ({ s, delay: maxDelayDays(s, today) }))
      .sort((a, b) => b.delay - a.delay)
      .slice(0, 10);
  }, [filteredSubtests, today]);

  // ───── Pie data
  const t1Pie = useMemo(() => buildPie(filteredSubtests, 't1_status'), [filteredSubtests]);
  const t2Pie = useMemo(() => buildPie(filteredSubtests, 't2_status'), [filteredSubtests]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading dashboard...</div>;
  }

  // Navigation helpers
  const goSubtests = (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    navigate(`/?${q}`);
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
        <KpiCard icon={<ListChecks className="h-6 w-6 text-primary" />} label="Systems" value={kpis.systemCount} onClick={() => navigate('/')} />
        <KpiCard icon={<ListChecks className="h-6 w-6 text-muted-foreground" />} label="Total Subtests" value={kpis.total.toLocaleString()} onClick={() => navigate('/')} />
        <KpiCard icon={<CheckCircle2 className="h-6 w-6" style={{ color: STATUS_COLORS.Done }} />} label="Done" value={kpis.totalDone.toLocaleString()} sub="T2 completed" />
        <KpiCard icon={<Clock className="h-6 w-6 text-muted-foreground" />} label="Remaining" value={kpis.remaining.toLocaleString()} />
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
          onClick={() => goSubtests({ status: 'overdue' })}
        />
      </div>

      {/* ─── Tier 2: Stage Cards (Pred / T1 / T2) ─── */}
      <div className="grid gap-3 md:grid-cols-3">
        <StageCard stage="Predecessor" total={kpis.total} done={kpis.predDone} remaining={kpis.total - kpis.predDone} pct={kpis.predPct} overdue={kpis.predOverdue} onClick={() => goSubtests({ pred_status: 'Done' })} />
        <StageCard stage="T1" total={kpis.total} done={kpis.t1Done} remaining={kpis.total - kpis.t1Done} pct={kpis.t1Pct} overdue={kpis.t1Overdue} onClick={() => goSubtests({ t1_status: 'Done' })} />
        <StageCard stage="T2" total={kpis.total} done={kpis.t2Done} remaining={kpis.total - kpis.t2Done} pct={kpis.t2Pct} overdue={kpis.t2Overdue} onClick={() => goSubtests({ t2_status: 'Done' })} />
      </div>


      <div className="grid gap-3 md:grid-cols-2">
        <AlertBanner
          tone="destructive"
          icon={<AlertTriangle className="h-5 w-5" />}
          title={`${kpis.overdueCount} Overdue Subtest${kpis.overdueCount === 1 ? '' : 's'}`}
          description="Planned date has passed and not yet Done."
          onClick={() => goSubtests({ status: 'overdue' })}
        />
        <AlertBanner
          tone="warning"
          icon={<Clock className="h-5 w-5" />}
          title={`${kpis.atRiskCount} At-Risk Subtest${kpis.atRiskCount === 1 ? '' : 's'}`}
          description={`Planned date is within ${atRiskDays} day(s) and not yet Done.`}
          onClick={() => goSubtests({ status: 'at_risk', at_risk_days: String(atRiskDays) })}
        />
      </div>

      {/* ─── S-Curve Combo Chart ─── */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0 pb-2">
          <CardTitle className="text-base">Plan vs Actual — S-Curve</CardTitle>
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
        </CardHeader>
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
      </Card>

      {/* ─── 4 Tabs ─── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Plan vs Actual — Breakdown</CardTitle>
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
              <PlanActualTable rows={bySystem} groupParam="system" groupHeader="System" today={today} yesterday={yesterday} navigate={navigate} keyToFilterValue={systemKeyResolver} />
            </TabsContent>
            <TabsContent value="subcon">
              <PlanActualTable rows={bySubcon} groupParam="subcon" groupHeader="Subcontractor" today={today} yesterday={yesterday} navigate={navigate} />
            </TabsContent>
            <TabsContent value="subsub">
              <PlanActualTable rows={bySubsub} groupParam="subsub" groupHeader="Sub-Sub" today={today} yesterday={yesterday} navigate={navigate} />
            </TabsContent>
            <TabsContent value="hdec">
              <PlanActualTable rows={byHdec} groupParam="hdec_pic" groupHeader="HDEC PIC" today={today} yesterday={yesterday} navigate={navigate} />
            </TabsContent>
            <TabsContent value="team">
              <PlanActualTable rows={byTeam} groupParam="team" groupHeader="Team" today={today} yesterday={yesterday} navigate={navigate} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

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
  if (value === 0) return <span className="text-muted-foreground tabular-nums">0</span>;
  if (value > 0) return <span className="text-green-700 dark:text-green-400 tabular-nums">+{value}</span>;
  return <span className="text-destructive font-semibold tabular-nums">{value}</span>;
}

const STAGE_BADGE: Record<'pred' | 't1' | 't2', string> = {
  pred: 'bg-muted text-muted-foreground border-border',
  t1: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30',
  t2: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
};

function StageBadge({ stage, label }: { stage: 'pred' | 't1' | 't2'; label: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STAGE_BADGE[stage]}`}>
      {label}
    </span>
  );
}

function ClickNum({ value, onClick }: { value: number; onClick?: () => void }) {
  if (!onClick) return <span className="tabular-nums">{value}</span>;
  return (
    <button
      type="button"
      className="tabular-nums hover:underline"
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

function PlanActualTable({
  rows, groupParam, groupHeader, today, yesterday, navigate, keyToFilterValue,
}: {
  rows: PlanActualRow[];
  groupParam: 'system' | 'subcon' | 'subsub' | 'hdec_pic' | 'team';
  groupHeader: string;
  today: string;
  yesterday: string;
  navigate: (to: string) => void;
  keyToFilterValue?: (key: string) => string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>;
  }
  const filterValue = (key: string) => (keyToFilterValue ? keyToFilterValue(key) : key);
  const go = (groupKey: string, extra?: Record<string, string>) => {
    const value = filterValue(groupKey);
    const params: Record<string, string> = { ...extra };
    if (value && value !== NONE_LABEL) params[groupParam] = value;
    navigate(`/?${new URLSearchParams(params).toString()}`);
  };

  type StageDef = {
    stage: 'pred' | 't1' | 't2';
    label: string;
    metrics: PlanActualMetrics;
    planTo?: string;
    actualTo?: string;
    planOn?: string;
    actualOn?: string;
    actualOverride?: { param: string; value: string };
  };

  return (
    <div className="max-h-[520px] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead rowSpan={2} className="align-bottom">{groupHeader}</TableHead>
            <TableHead rowSpan={2} className="text-right align-bottom">Total<br /><span className="text-[10px] font-normal text-muted-foreground">Subtests</span></TableHead>
            <TableHead rowSpan={2} className="align-bottom">Stage</TableHead>
            <TableHead colSpan={3} className="text-center border-l border-border bg-muted/30">To-Yesterday (Cumulative)</TableHead>
            <TableHead colSpan={3} className="text-center border-l border-border bg-muted/30">Yesterday</TableHead>
            <TableHead colSpan={3} className="text-center border-l border-border bg-muted/30">Today</TableHead>
            <TableHead rowSpan={2} className="w-[140px] align-bottom border-l border-border">Progress</TableHead>
          </TableRow>
          <TableRow>
            <TableHead className="text-right border-l border-border text-[11px]">Plan</TableHead>
            <TableHead className="text-right text-[11px]">Actual</TableHead>
            <TableHead className="text-right text-[11px]">Δ</TableHead>
            <TableHead className="text-right border-l border-border text-[11px]">Plan</TableHead>
            <TableHead className="text-right text-[11px]">Actual</TableHead>
            <TableHead className="text-right text-[11px]">Δ</TableHead>
            <TableHead className="text-right border-l border-border text-[11px]">Plan</TableHead>
            <TableHead className="text-right text-[11px]">Actual</TableHead>
            <TableHead className="text-right text-[11px]">Δ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, idx) => {
            const stages: StageDef[] = [
              {
                stage: 'pred', label: 'Pred', metrics: r.predecessor,
                planTo: 't1_planned_to',
                actualOverride: { param: 't1_status', value: 'WIP,Done' },
                planOn: 't1_planned_on',
                actualOn: 't1_actual_on',
              },
              {
                stage: 't1', label: 'T1', metrics: r.t1,
                planTo: 't1_planned_to',
                actualTo: 't1_actual_to',
                planOn: 't1_planned_on',
                actualOn: 't1_actual_on',
              },
              {
                stage: 't2', label: 'T2', metrics: r.t2,
                planTo: 't2_planned_to',
                actualTo: 't2_actual_to',
                planOn: 't2_planned_on',
                actualOn: 't2_actual_on',
              },
            ];

            return stages.map((st, i) => {
              const m = st.metrics;
              const cumD = m.cumActual - m.cumPlan;
              const yD = m.yesterdayActual - m.yesterdayPlan;
              const todayD = m.todayActual - m.todayPlan;
              const pct = r.totalSubtests ? Math.round((m.cumActual / r.totalSubtests) * 100) : 0;
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
                      <TableCell rowSpan={3} className="font-medium align-top px-2 py-1.5">{r.label}</TableCell>
                      <TableCell rowSpan={3} className="text-right tabular-nums align-top px-2 py-1.5">{r.totalSubtests}</TableCell>
                    </>
                  )}
                  <TableCell className="px-2 py-1.5"><StageBadge stage={st.stage} label={st.label} /></TableCell>
                  {/* Cumulative (to yesterday) */}
                  <TableCell className="text-right border-l border-border text-xs px-2 py-1.5">
                    <ClickNum value={m.cumPlan} onClick={st.planTo ? () => go(r.key, { [st.planTo!]: yesterday }) : undefined} />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <ClickNum
                      value={m.cumActual}
                      onClick={
                        st.actualTo
                          ? () => go(r.key, { [st.actualTo!]: yesterday })
                          : st.actualOverride
                            ? () => go(r.key, { [st.actualOverride!.param]: st.actualOverride!.value })
                            : undefined
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <ClickVariance
                      value={cumD}
                      onClick={cumD < 0 ? () => go(r.key, { status: 'overdue' }) : undefined}
                    />
                  </TableCell>
                  {/* Yesterday */}
                  <TableCell className="text-right border-l border-border text-xs px-2 py-1.5">
                    <ClickNum value={m.yesterdayPlan} onClick={st.planOn ? () => go(r.key, { [st.planOn!]: yesterday }) : undefined} />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <ClickNum value={m.yesterdayActual} onClick={st.actualOn ? () => go(r.key, { [st.actualOn!]: yesterday }) : undefined} />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <VarianceCell value={yD} />
                  </TableCell>
                  {/* Today */}
                  <TableCell className="text-right border-l border-border text-xs px-2 py-1.5">
                    <ClickNum value={m.todayPlan} onClick={st.planOn ? () => go(r.key, { [st.planOn!]: today }) : undefined} />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <ClickNum value={m.todayActual} onClick={st.actualOn ? () => go(r.key, { [st.actualOn!]: today }) : undefined} />
                  </TableCell>
                  <TableCell className="text-right text-xs px-2 py-1.5">
                    <VarianceCell value={todayD} />
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
