import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart';
import {
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ReferenceLine,
} from 'recharts';
import {
  AlertTriangle, CheckCircle2, ListChecks, Clock, TrendingUp, ChevronRight,
} from 'lucide-react';
import { useAtRiskThreshold } from '@/hooks/useAppSettings';
import {
  type SubtestForDashboard, type PlanActualRow, type PlanActualMetrics,
  todayIso, isOverdue, isAtRisk, maxDelayDays,
  aggregateTests, aggregatePlanActualByGroup, buildSCurve, NONE_LABEL,
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
  const [scurveBucket, setScurveBucket] = useState<'day' | 'week'>('week');

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
          .select('id, item_no, mos_code, system_id, subcontractor_name, subsub_name, hdec_pic_name, t1_status, t2_status, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date')
          .eq('is_active', true)
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data as SubtestForDashboard[]);
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
  const sysCodeById = useMemo(() => {
    const m = new Map<string, string>();
    systems.forEach(s => m.set(s.id, s.system_code));
    return m;
  }, [systems]);

  // ───── Top KPIs
  const kpis = useMemo(() => {
    const tests = aggregateTests(subtests);
    let testsDone = 0, testsWip = 0, testsNot = 0;
    for (const v of tests.values()) {
      if (v === 'done') testsDone++;
      else if (v === 'in_progress') testsWip++;
      else testsNot++;
    }
    const total = subtests.length;
    const t1Done = subtests.filter(s => s.t1_status === 'Done').length;
    const t2Done = subtests.filter(s => s.t2_status === 'Done').length;
    const overdueCount = subtests.filter(s => isOverdue(s, today)).length;
    const atRiskCount = subtests.filter(s => isAtRisk(s, today, atRiskDays)).length;
    return {
      totalTests: tests.size,
      testsDone, testsWip, testsNot,
      totalSubtests: total,
      t1Pct: total ? Math.round((t1Done / total) * 100) : 0,
      t2Pct: total ? Math.round((t2Done / total) * 100) : 0,
      overdueCount, atRiskCount,
    };
  }, [subtests, today, atRiskDays]);

  // ───── Group aggregates per tab — Plan vs Actual rows
  const bySystem = useMemo(
    () => aggregatePlanActualByGroup(subtests, today, s => s.system_id, k => sysCodeById.get(k) ?? '—'),
    [subtests, today, sysCodeById]
  );
  const bySubcon = useMemo(
    () => aggregatePlanActualByGroup(subtests, today, s => s.subcontractor_name ?? NONE_LABEL, k => k),
    [subtests, today]
  );
  const bySubsub = useMemo(
    () => aggregatePlanActualByGroup(subtests, today, s => s.subsub_name ?? NONE_LABEL, k => k),
    [subtests, today]
  );
  const byHdec = useMemo(
    () => aggregatePlanActualByGroup(subtests, today, s => s.hdec_pic_name ?? NONE_LABEL, k => k),
    [subtests, today]
  );
  // bySystem uses system_id as key; URL filter expects system_code
  const systemKeyResolver = useMemo(
    () => (key: string) => sysCodeById.get(key) ?? key,
    [sysCodeById]
  );

  // ───── S-Curve
  const scurve = useMemo(
    () => buildSCurve(subtests, scurveBucket, scurveBucket === 'day' ? 90 : undefined),
    [subtests, scurveBucket]
  );

  // ───── Top Overdue
  const topOverdue = useMemo(() => {
    return subtests
      .filter(s => isOverdue(s, today))
      .map(s => ({ s, delay: maxDelayDays(s, today) }))
      .sort((a, b) => b.delay - a.delay)
      .slice(0, 10);
  }, [subtests, today]);

  // ───── Pie data
  const t1Pie = useMemo(() => buildPie(subtests, 't1_status'), [subtests]);
  const t2Pie = useMemo(() => buildPie(subtests, 't2_status'), [subtests]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading dashboard...</div>;
  }

  // Navigation helpers
  const goSubtests = (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    navigate(`/?${q}`);
  };

  const chartConfig = {
    t1Planned: { label: 'T1 Planned', color: 'hsl(220, 65%, 55%)' },
    t1Actual: { label: 'T1 Actual', color: 'hsl(220, 65%, 36%)' },
    t2Planned: { label: 'T2 Planned', color: 'hsl(142, 50%, 55%)' },
    t2Actual: { label: 'T2 Actual', color: 'hsl(142, 71%, 35%)' },
    Done: { label: 'Done', color: STATUS_COLORS.Done },
    WIP: { label: 'WIP', color: STATUS_COLORS.WIP },
    Planned: { label: 'Planned', color: STATUS_COLORS.Planned },
    Hold: { label: 'Hold', color: STATUS_COLORS.Hold },
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">T&C Executive Dashboard</h1>
        <p className="text-xs text-muted-foreground">
          At-Risk threshold: ≤ {atRiskDays} day{atRiskDays === 1 ? '' : 's'} (configurable in Admin → Settings)
        </p>
      </div>

      {/* ─── KPI Strip ─── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={<ListChecks className="h-7 w-7 text-primary" />} label="Total Tests" value={kpis.totalTests} onClick={() => navigate('/')} />
        <KpiCard icon={<CheckCircle2 className="h-7 w-7" style={{ color: STATUS_COLORS.Done }} />} label="Tests Done" value={kpis.testsDone} sub={kpis.totalTests ? `${Math.round(kpis.testsDone / kpis.totalTests * 100)}%` : undefined} />
        <KpiCard icon={<TrendingUp className="h-7 w-7" style={{ color: STATUS_COLORS.WIP }} />} label="Tests In Progress" value={kpis.testsWip} />
        <KpiCard icon={<Clock className="h-7 w-7 text-muted-foreground" />} label="Tests Not Started" value={kpis.testsNot} />
        <KpiCard icon={<ListChecks className="h-7 w-7 text-muted-foreground" />} label="Total Subtests" value={kpis.totalSubtests} onClick={() => navigate('/')} />
        <KpiCard icon={<CheckCircle2 className="h-7 w-7 text-primary" />} label="T1 Done %" value={`${kpis.t1Pct}%`} onClick={() => goSubtests({ t1_status: 'Done' })} />
        <KpiCard icon={<CheckCircle2 className="h-7 w-7 text-primary" />} label="T2 Done %" value={`${kpis.t2Pct}%`} onClick={() => goSubtests({ t2_status: 'Done' })} />
        <KpiCard
          icon={<AlertTriangle className="h-7 w-7 text-destructive" />}
          label="Overdue"
          value={kpis.overdueCount}
          accent="destructive"
          onClick={() => goSubtests({ status: 'overdue' })}
        />
      </div>

      {/* ─── Alert Banners ─── */}
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

      {/* ─── S-Curve ─── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Plan vs Actual — Cumulative S-Curve</CardTitle>
          <div className="flex gap-1 rounded-md border p-0.5">
            <button
              onClick={() => setScurveBucket('day')}
              className={`px-3 py-1 text-xs rounded ${scurveBucket === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              Daily (90d)
            </button>
            <button
              onClick={() => setScurveBucket('week')}
              className={`px-3 py-1 text-xs rounded ${scurveBucket === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              Weekly
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {scurve.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No data in range.</p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <LineChart data={scurve} margin={{ left: 12, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tick={{ fontSize: 10 }} minTickGap={20} />
                <YAxis tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine x={today} stroke="hsl(var(--destructive))" strokeDasharray="4 2" label={{ value: 'Today', fontSize: 10, fill: 'hsl(var(--destructive))' }} />
                <Line type="monotone" dataKey="t1Planned" stroke="hsl(220, 65%, 55%)" strokeDasharray="5 3" strokeWidth={2} dot={false} name="T1 Planned" />
                <Line type="monotone" dataKey="t1Actual" stroke="hsl(220, 65%, 36%)" strokeWidth={2} dot={false} name="T1 Actual" />
                <Line type="monotone" dataKey="t2Planned" stroke="hsl(142, 50%, 55%)" strokeDasharray="5 3" strokeWidth={2} dot={false} name="T2 Planned" />
                <Line type="monotone" dataKey="t2Actual" stroke="hsl(142, 71%, 35%)" strokeWidth={2} dot={false} name="T2 Actual" />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* ─── 4 Tabs ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Plan vs Actual — Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="system">
            <TabsList>
              <TabsTrigger value="system">By System</TabsTrigger>
              <TabsTrigger value="subcon">By Subcontractor</TabsTrigger>
              <TabsTrigger value="subsub">By Sub-Sub</TabsTrigger>
              <TabsTrigger value="hdec">By HDEC PIC</TabsTrigger>
            </TabsList>
            <TabsContent value="system">
              <PlanActualTable rows={bySystem} groupParam="system" today={today} navigate={navigate} keyToFilterValue={systemKeyResolver} />
            </TabsContent>
            <TabsContent value="subcon">
              <PlanActualTable rows={bySubcon} groupParam="subcon" today={today} navigate={navigate} />
            </TabsContent>
            <TabsContent value="subsub">
              <PlanActualTable rows={bySubsub} groupParam="subsub" today={today} navigate={navigate} />
            </TabsContent>
            <TabsContent value="hdec">
              <PlanActualTable rows={byHdec} groupParam="hdec_pic" today={today} navigate={navigate} />
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

interface GroupRow {
  key: string;
  label: string;
  totalTests: number;
  testsDone: number;
  testsInProgress: number;
  testsNotStarted: number;
  overdueSubtests: number;
  t1DonePct: number;
  t2DonePct: number;
}

function GroupTable({
  rows, groupParam, navigate,
}: {
  rows: GroupRow[];
  groupParam: 'system' | 'subcon' | 'subsub' | 'hdec_pic';
  navigate: (to: string) => void;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No data.</p>;
  }
  const go = (groupKey: string, extra?: Record<string, string>) => {
    const value = groupKey === NONE_LABEL ? '' : groupKey;
    const params: Record<string, string> = { ...extra };
    if (value) params[groupParam] = value;
    navigate(`/?${new URLSearchParams(params).toString()}`);
  };
  return (
    <div className="max-h-[420px] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead>Group</TableHead>
            <TableHead className="text-right">Tests</TableHead>
            <TableHead className="text-right">Done</TableHead>
            <TableHead className="text-right">WIP</TableHead>
            <TableHead className="text-right">Not Started</TableHead>
            <TableHead className="text-right">Overdue</TableHead>
            <TableHead className="text-right">T1 %</TableHead>
            <TableHead className="text-right">T2 %</TableHead>
            <TableHead className="w-[120px]">Progress</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => {
            const donePct = r.totalTests ? Math.round((r.testsDone / r.totalTests) * 100) : 0;
            return (
              <TableRow key={r.key} className="cursor-pointer" onClick={() => go(r.key)}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right">{r.totalTests}</TableCell>
                <TableCell className="text-right text-green-700 dark:text-green-400">{r.testsDone}</TableCell>
                <TableCell className="text-right text-amber-700 dark:text-amber-400">{r.testsInProgress}</TableCell>
                <TableCell className="text-right text-muted-foreground">{r.testsNotStarted}</TableCell>
                <TableCell
                  className={`text-right font-semibold ${r.overdueSubtests > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
                  onClick={(e) => { e.stopPropagation(); go(r.key, { status: 'overdue' }); }}
                >
                  {r.overdueSubtests > 0 ? `+${r.overdueSubtests}` : '0'}
                </TableCell>
                <TableCell className="text-right">{r.t1DonePct}%</TableCell>
                <TableCell className="text-right">{r.t2DonePct}%</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={donePct} className="h-2" />
                    <span className="text-xs text-muted-foreground w-9 text-right">{donePct}%</span>
                  </div>
                </TableCell>
              </TableRow>
            );
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
