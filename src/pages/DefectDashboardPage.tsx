import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarIcon, CheckCircle2, Clock, Download, Filter, ListChecks, ShieldCheck, TrendingUp } from 'lucide-react';
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ALL_TEAMS, TEAM_LABELS } from '@/types/enums';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAtRiskThreshold } from '@/hooks/useAppSettings';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import { exportDefectPlanActualToExcel } from '@/lib/defect-dashboard-excel-export';
import { RecentDefectComments } from '@/components/dashboard/RecentDefectComments';
import {
  NONE_LABEL,
  aggregateDefectPlanActualByGroup,
  buildDefectSCurve,
  diffMetrics,
  isActualComplete,
  isAtRisk,
  isClosureComplete,
  isOverdue,
  isStageDelayedAsOf,
  maxDelayDays,
  todayIso,
  type DefectForDashboard,
  type DefectPlanActualMetrics,
  type DefectPlanActualRow,
} from '@/lib/defect-dashboard-utils';

const PIE_COLORS: Record<string, string> = {
  Complete: 'hsl(var(--primary))',
  'In Progress': 'hsl(var(--accent-foreground))',
  'Not Started': 'hsl(var(--muted-foreground))',
  Closed: 'hsl(var(--primary))',
  'Not Closed': 'hsl(var(--destructive))',
};

const chartConfig = {
  completionPlan: { label: 'Completion Plan', color: 'hsl(var(--muted-foreground))' },
  completionActual: { label: 'Completion Actual', color: 'hsl(var(--primary))' },
  closurePlan: { label: 'Closure Plan', color: 'hsl(var(--accent-foreground))' },
  closureActual: { label: 'Closure Actual', color: 'hsl(var(--destructive))' },
  completionMet: { label: 'Completion Met', color: 'hsl(var(--primary))' },
  completionShortfall: { label: 'Completion Shortfall', color: 'hsl(var(--destructive))' },
  completionExcess: { label: 'Completion Excess', color: 'hsl(var(--foreground))' },
  completionFuturePlan: { label: 'Completion Future Plan', color: 'hsl(var(--muted))' },
  closureMet: { label: 'Closure Met', color: 'hsl(var(--accent-foreground))' },
  closureShortfall: { label: 'Closure Shortfall', color: 'hsl(var(--destructive))' },
  closureExcess: { label: 'Closure Excess', color: 'hsl(var(--foreground))' },
  closureFuturePlan: { label: 'Closure Future Plan', color: 'hsl(var(--muted))' },
} satisfies ChartConfig;

export default function DefectDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { value: atRiskDays } = useAtRiskThreshold();
  const { toast } = useToast();
  const [items, setItems] = useState<DefectForDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataDate, setDataDate] = useState(todayIso());
  const [teamFilter, setTeamFilter] = useState(searchParams.get('team') || 'all');
  const [breakdownTab, setBreakdownTab] = useState(searchParams.get('tab') || 'subcon');
  const [scurveBucket, setScurveBucket] = useState<'day' | 'week'>((searchParams.get('bucket') as 'day' | 'week') || 'day');
  const [scurveStart, setScurveStart] = useState(searchParams.get('scurve_start') || '2026-04-15');
  const [scurveEnd, setScurveEnd] = useState(searchParams.get('scurve_end') || '2026-06-07');
  const [subTradeTextFilter, setSubTradeTextFilter] = useState(searchParams.get('sub_trade_text') || '');
  const [selectedSubTradeFilters, setSelectedSubTradeFilters] = useState<string[]>(searchParams.get('sub_trades')?.split(',').filter(Boolean) || []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      let all: DefectForDashboard[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data } = await (supabase as any).from('defect_items').select('*').eq('is_active', true).order('issue_no').range(from, from + PAGE - 1);
        if (!data?.length) break;
        all = all.concat(data as DefectForDashboard[]);
        if (data.length < PAGE) break;
      }
      const latestImport = await (supabase as any).from('defect_upload_batches').select('data_date').eq('status', 'completed').not('data_date', 'is', null).order('data_date', { ascending: false }).order('uploaded_at', { ascending: false }).limit(1).maybeSingle();
      if (!cancelled) {
        setItems(all);
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
  const filteredItems = useMemo(() => teamFilter === 'all' ? items : items.filter((item) => item.team === teamFilter), [items, teamFilter]);

  const kpis = useMemo(() => {
    const total = filteredItems.length;
    const actualDone = filteredItems.filter(isActualComplete).length;
    const closureDone = filteredItems.filter(isClosureComplete).length;
    const completionPct = total ? Math.round((actualDone / total) * 1000) / 10 : 0;
    const overallProgressPct = total ? Math.round((closureDone / total) * 1000) / 10 : 0;
    const difference = actualDone - closureDone;
    const overdueCount = filteredItems.filter((item) => isOverdue(item, dataDate)).length;
    const atRiskCount = filteredItems.filter((item) => isAtRisk(item, today, atRiskDays)).length;
    const startOverdue = filteredItems.filter((item) => isStageDelayedAsOf(item, 'start', dataDate)).length;
    const completionOverdue = filteredItems.filter((item) => isStageDelayedAsOf(item, 'completion', dataDate)).length;
    const closureOverdue = filteredItems.filter((item) => isStageDelayedAsOf(item, 'closure', dataDate)).length;
    return { total, actualDone, closureDone, difference, completionPct, overallProgressPct, overdueCount, atRiskCount, startOverdue, completionOverdue, closureOverdue };
  }, [filteredItems, today, dataDate, atRiskDays]);

  const bySubTrade = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => i.sub_trade ?? NONE_LABEL, k => k), [filteredItems, today, dataDate]);
  const bySubcon = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => i.subcontractor_name ?? NONE_LABEL, k => k), [filteredItems, today, dataDate]);
  const bySubsub = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => i.subsub_name ?? NONE_LABEL, k => k), [filteredItems, today, dataDate]);
  const byHdec = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => i.hdec_pic_name ?? NONE_LABEL, k => k), [filteredItems, today, dataDate]);
  const byHdecEng = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => (i as any).hdec_eng_name ?? NONE_LABEL, k => k), [filteredItems, today, dataDate]);
  const byTeam = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => i.team ?? NONE_LABEL, k => k === NONE_LABEL ? k : (TEAM_LABELS[k as keyof typeof TEAM_LABELS] ?? k)), [filteredItems, today, dataDate]);
  const byWorkType = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => (i as any).work_type ?? NONE_LABEL, k => k), [filteredItems, today, dataDate]);
  const subTradeFilterOptions = useMemo(() => Array.from(new Set(bySubTrade.map(row => row.label))).sort((a, b) => a.localeCompare(b)), [bySubTrade]);
  const filteredBySubTrade = useMemo(() => {
    const text = subTradeTextFilter.trim().toLowerCase();
    return bySubTrade.filter(row => (!text || row.label.toLowerCase().includes(text)) && (!selectedSubTradeFilters.length || selectedSubTradeFilters.includes(row.label)));
  }, [bySubTrade, subTradeTextFilter, selectedSubTradeFilters]);

  const breakdownDataMap: Record<string, { rows: DefectPlanActualRow[]; header: string; param: GroupParam }> = {
    subTrade: { rows: filteredBySubTrade, header: 'Sub Trade', param: 'subTrade' },
    subcon: { rows: bySubcon, header: 'Subcontractor', param: 'subcontractor' },
    subsub: { rows: bySubsub, header: 'Sub-Sub', param: 'subsub' },
    hdec: { rows: byHdec, header: 'HDEC PIC', param: 'hdecPic' },
    hdecEng: { rows: byHdecEng, header: 'HDEC ENG', param: 'hdecEng' },
    team: { rows: byTeam, header: 'Team', param: 'team' },
    workType: { rows: byWorkType, header: 'Work Type', param: 'workType' },
  };

  const scurve = useMemo(() => buildDefectSCurve(filteredItems, scurveBucket, scurveStart, scurveEnd, today), [filteredItems, scurveBucket, scurveStart, scurveEnd, today]);
  const topOverdue = useMemo(() => filteredItems.map(item => ({ item, delay: maxDelayDays(item, dataDate) })).filter(row => row.delay > 0 && !isClosureComplete(row.item)).sort((a, b) => b.delay - a.delay).slice(0, 10), [filteredItems, dataDate]);
  const actualPie = useMemo(() => buildActualPie(filteredItems), [filteredItems]);
  const closurePie = useMemo(() => buildClosurePie(filteredItems), [filteredItems]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDelete = (key: string, value: string, defaultValue: string) => value && value !== defaultValue ? next.set(key, value) : next.delete(key);
    setOrDelete('team', teamFilter, 'all');
    setOrDelete('tab', breakdownTab, 'subcon');
    setOrDelete('bucket', scurveBucket, 'day');
    setOrDelete('scurve_start', scurveStart, '2026-04-15');
    setOrDelete('scurve_end', scurveEnd, '2026-06-07');
    setOrDelete('sub_trade_text', subTradeTextFilter, '');
    selectedSubTradeFilters.length ? next.set('sub_trades', selectedSubTradeFilters.join(',')) : next.delete('sub_trades');
    setSearchParams(next, { replace: true });
  }, [teamFilter, breakdownTab, scurveBucket, scurveStart, scurveEnd, subTradeTextFilter, selectedSubTradeFilters]);

  const goRaw = (params: Record<string, string>) => navigate(`/defects/raw-data?${new URLSearchParams({ source: 'dashboard', ...params }).toString()}`);
  const handleBreakdownExport = () => {
    const { rows, header } = breakdownDataMap[breakdownTab] ?? breakdownDataMap.subcon;
    if (!rows.length) return toast({ title: 'No data to export', variant: 'destructive' });
    const { rowCount, fileName } = exportDefectPlanActualToExcel(rows, header, today, dataDate);
    toast({ title: 'Export complete', description: `${rowCount} groups → ${fileName}` });
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading defect dashboard...</div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Defect Executive Dashboard</h1>
        <div className="flex items-center gap-3">
          <Select value={teamFilter} onValueChange={setTeamFilter}><SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Teams</SelectItem>{ALL_TEAMS.map(team => <SelectItem key={team} value={team}>{TEAM_LABELS[team]}</SelectItem>)}</SelectContent></Select>
          <p className="text-xs text-muted-foreground">At-Risk threshold: ≤ {atRiskDays} day{atRiskDays === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <KpiCard icon={<ListChecks className="h-6 w-6 text-muted-foreground" />} label="Total Defects" value={kpis.total.toLocaleString()} onClick={() => goRaw({})} />
        <KpiCard icon={<CheckCircle2 className="h-6 w-6 text-primary" />} label="Completion Done" value={kpis.actualDone.toLocaleString()} sub={`${kpis.completionPct}% completed`} onClick={() => goRaw({ actualComplete: 'true' })} />
        <KpiCard icon={<Clock className="h-6 w-6 text-muted-foreground" />} label="Open Defect" value={(kpis.total - kpis.actualDone).toLocaleString()} sub="Total − Completion" onClick={() => goRaw({ actualComplete: 'false' })} />
        <KpiCard icon={<ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />} label="Closure Done" value={kpis.closureDone.toLocaleString()} sub={`${kpis.overallProgressPct}% closed`} onClick={() => goRaw({ closureComplete: 'true' })} />
        <KpiCard icon={<Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />} label="Remain Inspection" value={kpis.difference.toLocaleString()} sub="검측 대기" onClick={() => goRaw({ actualComplete: 'true', closureComplete: 'false' })} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={<AlertTriangle className="h-6 w-6 text-destructive" />} label="Overdue - Start" value={kpis.startOverdue} accent="destructive" sub="Start 지연" onClick={() => goRaw({ overdue: 'true', stage: 'start', asOf: dataDate })} />
        <KpiCard icon={<AlertTriangle className="h-6 w-6 text-destructive" />} label="Overdue - Completion" value={kpis.completionOverdue} accent="destructive" sub="Completion 지연" onClick={() => goRaw({ overdue: 'true', stage: 'completion', asOf: dataDate })} />
        <KpiCard icon={<AlertTriangle className="h-6 w-6 text-destructive" />} label="Overdue - Closure" value={kpis.closureOverdue} accent="destructive" sub="Closure 지연" onClick={() => goRaw({ overdue: 'true', stage: 'closure', asOf: dataDate })} />
        <Card className="flex flex-col justify-center p-4">
          <div className="mb-1 flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Overall Progress</p></div>
          <p className="text-xl font-bold text-foreground">{kpis.overallProgressPct}%</p>
          <Progress value={kpis.overallProgressPct} className="mt-1 h-2" />
          <p className="mt-1 text-[10px] text-muted-foreground">Closure / Total</p>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <StageCard stage="Completion" total={kpis.total} done={kpis.actualDone} remaining={kpis.total - kpis.actualDone} pct={kpis.completionPct} overdue={kpis.completionOverdue} onClick={() => goRaw({ actualComplete: 'false' })} />
        <StageCard stage="Closure" total={kpis.total} done={kpis.closureDone} remaining={kpis.total - kpis.closureDone} pct={kpis.overallProgressPct} overdue={kpis.closureOverdue} onClick={() => goRaw({ closureComplete: 'false' })} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <AlertBanner tone="destructive" title={`${kpis.overdueCount} Overdue Defect${kpis.overdueCount === 1 ? '' : 's'}`} description={`Planned date is on/before Data Date (${dataDateLabel}) and not yet complete.`} onClick={() => goRaw({ overdue: 'true', asOf: dataDate })} />
        <AlertBanner tone="warning" title={`${kpis.atRiskCount} At-Risk Defect${kpis.atRiskCount === 1 ? '' : 's'}`} description={`Planned date is within ${atRiskDays} day(s) and not yet complete.`} onClick={() => goRaw({ atRisk: 'true', atRiskDays: String(atRiskDays) })} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-base">Plan vs Actual - Summary</CardTitle><Button variant="outline" size="sm" onClick={handleBreakdownExport}><Download className="mr-1.5 h-4 w-4" />Excel</Button></CardHeader>
        <CardContent>
          <Tabs value={breakdownTab} onValueChange={setBreakdownTab}>
            <TabsList className="h-auto flex-wrap"><TabsTrigger value="subTrade">By Sub Trade</TabsTrigger><TabsTrigger value="subcon">By Subcontractor</TabsTrigger><TabsTrigger value="subsub">By Sub-Sub</TabsTrigger><TabsTrigger value="hdec">By HDEC PIC</TabsTrigger><TabsTrigger value="hdecEng">By HDEC ENG</TabsTrigger><TabsTrigger value="team">By Team</TabsTrigger><TabsTrigger value="workType">By Work Type</TabsTrigger></TabsList>
            <TabsContent value="subTrade"><PlanActualTable rows={filteredBySubTrade} groupParam="subTrade" groupHeader="Sub Trade" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} filter={{ text: subTradeTextFilter, selected: selectedSubTradeFilters, options: subTradeFilterOptions, onTextChange: setSubTradeTextFilter, onSelectedChange: setSelectedSubTradeFilters }} /></TabsContent>
            <TabsContent value="subcon"><PlanActualTable rows={bySubcon} groupParam="subcontractor" groupHeader="Subcontractor" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} /></TabsContent>
            <TabsContent value="subsub"><PlanActualTable rows={bySubsub} groupParam="subsub" groupHeader="Sub-Sub" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} /></TabsContent>
            <TabsContent value="hdec"><PlanActualTable rows={byHdec} groupParam="hdecPic" groupHeader="HDEC PIC" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} /></TabsContent>
            <TabsContent value="hdecEng"><PlanActualTable rows={byHdecEng} groupParam="hdecEng" groupHeader="HDEC ENG" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} /></TabsContent>
            <TabsContent value="team"><PlanActualTable rows={byTeam} groupParam="team" groupHeader="Team" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} /></TabsContent>
            <TabsContent value="workType"><PlanActualTable rows={byWorkType} groupParam="workType" groupHeader="Work Type" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col space-y-2 pb-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0"><CardTitle className="text-base">Plan vs Actual — S-Curve</CardTitle><div className="flex flex-wrap items-center gap-2"><DateButton value={scurveStart} onChange={setScurveStart} /><span className="text-xs text-muted-foreground">~</span><DateButton value={scurveEnd} onChange={setScurveEnd} /><div className="flex gap-1 rounded-md border p-0.5"><button onClick={() => setScurveBucket('day')} className={cn('rounded px-3 py-1 text-xs', scurveBucket === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>Daily</button><button onClick={() => setScurveBucket('week')} className={cn('rounded px-3 py-1 text-xs', scurveBucket === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>Weekly</button></div></div></CardHeader>
        <CardContent>{scurve.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No data in range.</p> : <ChartContainer config={chartConfig} className="h-[360px] w-full"><ComposedChart data={scurve} margin={{ left: 12, right: 16, top: 8, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="bucketLabel" tick={{ fontSize: 10 }} minTickGap={20} /><YAxis yAxisId="left" tick={{ fontSize: 11 }} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} /><ChartTooltip content={<ChartTooltipContent />} /><Legend wrapperStyle={{ fontSize: 11 }} /><ReferenceLine yAxisId="left" x={formatDdMmm(today)} stroke="hsl(var(--destructive))" strokeDasharray="4 2" label={{ value: 'Today', fontSize: 10, fill: 'hsl(var(--destructive))' }} /><Bar yAxisId="right" dataKey="completionMet" stackId="completion" fill="var(--color-completionMet)" name="Completion Met" barSize={10} /><Bar yAxisId="right" dataKey="completionShortfall" stackId="completion" fill="var(--color-completionShortfall)" name="Completion Shortfall" barSize={10} /><Bar yAxisId="right" dataKey="completionExcess" stackId="completion" fill="var(--color-completionExcess)" name="Completion Excess" barSize={10} /><Bar yAxisId="right" dataKey="completionFuturePlan" stackId="completion" fill="var(--color-completionFuturePlan)" name="Completion Plan (Future)" barSize={10} /><Bar yAxisId="right" dataKey="closureMet" stackId="closure" fill="var(--color-closureMet)" name="Closure Met" barSize={10} /><Bar yAxisId="right" dataKey="closureShortfall" stackId="closure" fill="var(--color-closureShortfall)" name="Closure Shortfall" barSize={10} /><Bar yAxisId="right" dataKey="closureExcess" stackId="closure" fill="var(--color-closureExcess)" name="Closure Excess" barSize={10} /><Bar yAxisId="right" dataKey="closureFuturePlan" stackId="closure" fill="var(--color-closureFuturePlan)" name="Closure Plan (Future)" barSize={10} /><Line yAxisId="left" type="monotone" dataKey="completionPlan" stroke="var(--color-completionPlan)" strokeDasharray="5 3" strokeWidth={2} dot={false} name="Completion Plan (cum)" /><Line yAxisId="left" type="monotone" dataKey="completionActual" stroke="var(--color-completionActual)" strokeWidth={2} dot={false} name="Completion Actual (cum)" /><Line yAxisId="left" type="monotone" dataKey="closurePlan" stroke="var(--color-closurePlan)" strokeDasharray="5 3" strokeWidth={2} dot={false} name="Closure Plan (cum)" /><Line yAxisId="left" type="monotone" dataKey="closureActual" stroke="var(--color-closureActual)" strokeWidth={2} dot={false} name="Closure Actual (cum)" /></ComposedChart></ChartContainer>}</CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-destructive" />Top 10 Overdue Defects</CardTitle></CardHeader><CardContent>{topOverdue.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No overdue defects</p> : <Table><TableHeader><TableRow><TableHead>Sub Trade</TableHead><TableHead>Issue No</TableHead><TableHead>Level</TableHead><TableHead>Subcontractor</TableHead><TableHead className="text-right">Days Late</TableHead></TableRow></TableHeader><TableBody>{topOverdue.map(({ item, delay }) => <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/defects/${item.id}`)}><TableCell className="font-medium">{item.sub_trade || '—'}</TableCell><TableCell>{item.issue_no}</TableCell><TableCell>{item.area_level || '—'}</TableCell><TableCell className="max-w-[120px] truncate text-xs">{item.subcontractor_name || '—'}</TableCell><TableCell className="text-right font-semibold text-destructive">+{delay}d</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Status Distribution</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 gap-2"><PieBlock title="Completion" data={actualPie} onSliceClick={(name) => goRaw(name === 'Complete' ? { actualComplete: 'true' } : {})} /><PieBlock title="Closure" data={closurePie} onSliceClick={(name) => goRaw(name === 'Closed' ? { closureComplete: 'true' } : {})} /></div></CardContent></Card>
      </div>
    </div>
  );
}

type GroupParam = 'subTrade' | 'subcontractor' | 'subsub' | 'hdecPic' | 'hdecEng' | 'team' | 'workType';
type StageKey = 'completion' | 'closure' | 'difference';

function KpiCard({ icon, label, value, sub, accent, onClick }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: 'destructive'; onClick?: () => void }) {
  return <Card onClick={onClick} className={cn(onClick && 'cursor-pointer transition-colors hover:bg-muted/40', accent === 'destructive' && 'border-destructive/30')}><CardContent className="flex items-center gap-3 p-4">{icon}<div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{label}</p><p className={cn('text-2xl font-bold', accent === 'destructive' ? 'text-destructive' : 'text-foreground')}>{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div></CardContent></Card>;
}

function StageCard({ stage, total, done, remaining, pct, overdue, onClick }: { stage: string; total: number; done: number; remaining: number; pct: number; overdue: number; onClick?: () => void }) {
  return <Card onClick={onClick} className={cn(onClick && 'cursor-pointer transition-colors hover:bg-muted/40', overdue > 0 && 'border-destructive/30')}><CardContent className="space-y-2 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-foreground">{stage}</p>{overdue > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"><AlertTriangle className="h-3 w-3" />{overdue} OD</span>}</div><div className="grid grid-cols-3 gap-2 text-center"><MiniStat label="Total" value={total} /><MiniStat label="Done" value={done} /><MiniStat label="Remaining" value={remaining} /></div><div className="flex items-center gap-2"><Progress value={pct} className="h-2 flex-1" /><span className="w-12 text-right text-xs font-medium text-muted-foreground">{pct}%</span></div></CardContent></Card>;
}

function MiniStat({ label, value }: { label: string; value: number }) { return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-sm font-semibold text-foreground">{value.toLocaleString()}</p></div>; }
function AlertBanner({ tone, title, description, onClick }: { tone: 'destructive' | 'warning'; title: string; description: string; onClick: () => void }) { const cls = tone === 'destructive' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-primary/40 bg-primary/5 text-primary'; return <button onClick={onClick} className={cn('flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40', cls)}><div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5" /><div><p className="font-semibold">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div></div><span className="text-sm font-medium text-muted-foreground">View</span></button>; }
function DateButton({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8 gap-1 text-xs"><CalendarIcon className="h-3.5 w-3.5" />{formatDdMmm(value)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><Calendar mode="single" selected={new Date(value + 'T00:00:00')} onSelect={(d) => d && onChange(d.toISOString().slice(0, 10))} className={cn('p-3 pointer-events-auto')} /></PopoverContent></Popover>; }
function HeaderTotalNumber({ value, tone }: { value: number; tone?: 'done' | 'remain' | 'delay' }) { return <span className={cn('tabular-nums font-semibold', value === 0 ? 'text-muted-foreground/40' : tone === 'done' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'remain' ? 'text-amber-700 dark:text-amber-400' : tone === 'delay' ? 'text-destructive' : 'text-foreground')}>{value.toLocaleString()}</span>; }
function VarianceCell({ value, invert = false }: { value: number; invert?: boolean }) {
  if (value === 0) return <span className="text-muted-foreground/40 tabular-nums">0</span>;
  // invert=true (Difference 행): 양수=적체(빨강), 음수=빠름(초록)
  const positiveBad = invert;
  if (value > 0) return <span className={cn('tabular-nums', positiveBad ? 'font-semibold text-destructive' : 'text-green-700 dark:text-green-400')}>+{value}</span>;
  return <span className={cn('tabular-nums', positiveBad ? 'text-green-700 dark:text-green-400' : 'font-semibold text-destructive')}>{value}</span>;
}
function ClickNum({ value, onClick, hideZero = false }: { value: number; onClick?: () => void; hideZero?: boolean }) { if (hideZero && value === 0) return <span className="tabular-nums text-muted-foreground/40" />; return onClick ? <button type="button" className={cn('tabular-nums hover:underline', value === 0 && 'text-muted-foreground/40')} onClick={(e) => { e.stopPropagation(); onClick(); }}>{value}</button> : <span className={cn('tabular-nums', value === 0 && 'text-muted-foreground/40')}>{value}</span>; }
function StageBadge({ stage, label }: { stage: StageKey; label: string }) {
  const cls = stage === 'completion'
    ? 'bg-primary/10 text-primary border-primary/30'
    : stage === 'closure'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
      : 'bg-muted text-muted-foreground border-dashed border-border';
  return <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold', cls)}>{label}</span>;
}
function FilterDropdown({ text, selected, options, onTextChange, onSelectedChange }: { text: string; selected: string[]; options: string[]; onTextChange: (v: string) => void; onSelectedChange: (v: string[]) => void }) { const toggle = (value: string) => onSelectedChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]); return <Popover><PopoverTrigger asChild><button type="button" className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted/80" onClick={(e) => e.stopPropagation()}><Filter className="h-3.5 w-3.5" /></button></PopoverTrigger><PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}><Input placeholder="Filter sub trades..." value={text} onChange={(e) => onTextChange(e.target.value)} className="mb-2 h-8 text-xs" /><button type="button" className="mb-2 text-[11px] text-muted-foreground hover:underline" onClick={() => { onTextChange(''); onSelectedChange([]); }}>Clear</button><div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">{options.map(option => <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50"><Checkbox checked={selected.includes(option)} onCheckedChange={() => toggle(option)} className="h-3.5 w-3.5" /><span className="min-w-0 truncate">{option}</span></label>)}</div></PopoverContent></Popover>; }

interface StageDef {
  stage: StageKey;
  label: string;
  metrics: DefectPlanActualMetrics;
  planField: string | null;
  actualField: string | null;
  doneParam: string | null;
  isDifference: boolean;
}

function PlanActualTable({
  rows,
  groupParam,
  groupHeader,
  today,
  dataDate,
  todayLabel,
  dataDateLabel,
  navigate,
  filter,
}: {
  rows: DefectPlanActualRow[];
  groupParam: GroupParam;
  groupHeader: string;
  today: string;
  dataDate: string;
  todayLabel: string;
  dataDateLabel: string;
  navigate: (to: string) => void;
  filter?: {
    text: string;
    selected: string[];
    options: string[];
    onTextChange: (v: string) => void;
    onSelectedChange: (v: string[]) => void;
  };
}) {
  const go = (groupKey: string, extra?: Record<string, string>) => {
    const params: Record<string, string> = { source: 'dashboard', ...extra };
    if (groupKey && groupKey !== NONE_LABEL) params[groupParam] = groupKey;
    navigate(`/defects/raw-data?${new URLSearchParams(params).toString()}`);
  };

  const totals = rows.reduce(
    (acc, row) => {
      const d = diffMetrics(row);
      ([
        { metrics: row.completion, isDiff: false },
        { metrics: row.closure, isDiff: false },
        { metrics: d, isDiff: true },
      ]).forEach(({ metrics, isDiff }) => {
        acc.stageTotal += isDiff ? metrics.cumActual : row.totalDefects;
        acc.stageDone += metrics.cumActual;
        acc.cumPlan += metrics.cumPlan;
        acc.cumActual += metrics.cumActual;
        acc.dataDatePlan += metrics.dataDatePlan;
        acc.dataDateActual += metrics.dataDateActual;
        acc.dataDateDelay += metrics.dataDateDelay;
        acc.todayPlan += metrics.todayPlan;
        acc.todayActual += metrics.todayActual;
        acc.todayDelay += metrics.todayDelay;
      });
      return acc;
    },
    { stageTotal: 0, stageDone: 0, cumPlan: 0, cumActual: 0, dataDatePlan: 0, dataDateActual: 0, dataDateDelay: 0, todayPlan: 0, todayActual: 0, todayDelay: 0 },
  );

  const header = {
    ...totals,
    stageRemain: totals.stageTotal - totals.stageDone,
    cumDelta: totals.cumActual - totals.cumPlan,
    dataDateDelta: totals.dataDateActual - totals.dataDatePlan,
    todayDelta: totals.todayActual - totals.todayPlan,
  };

  const colgroup = (
    <colgroup>
      <col className="w-[210px]" />
      <col className="w-[86px]" />
      <col className="w-[58px]" />
      <col className="w-[58px]" />
      <col className="w-[64px]" />
      {Array.from({ length: 11 }).map((_, i) => (
        <col key={i} className="w-[56px]" />
      ))}
      <col className="w-[140px]" />
    </colgroup>
  );

  const stageDefs = (row: DefectPlanActualRow): StageDef[] => [
    { stage: 'completion', label: 'Completion', metrics: row.completion, planField: 'planned_completion_date', actualField: 'actual_completion_date', doneParam: 'actualComplete', isDifference: false },
    { stage: 'closure', label: 'Closure', metrics: row.closure, planField: 'planned_closure_date', actualField: 'actual_closure_date', doneParam: 'closureComplete', isDifference: false },
    { stage: 'difference', label: 'Difference', metrics: diffMetrics(row), planField: null, actualField: null, doneParam: null, isDifference: true },
  ];

  const subheads = ['Plan', 'Actual', 'Δ', 'Plan', 'Actual', 'Δ', 'Delay', 'Plan', 'Actual', 'Δ', 'Delay'];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1270px]">
        <div className="rounded-t-md border border-b-0 bg-background">
          <Table className="table-fixed">
            {colgroup}
            <TableHeader className="bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead rowSpan={3} className="h-8 text-center align-middle">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>{groupHeader}</span>
                    {filter && <FilterDropdown {...filter} />}
                  </div>
                </TableHead>
                <TableHead rowSpan={3} className="h-8 text-center align-middle">Stage</TableHead>
                <TableHead className="h-8 text-center align-bottom">Total</TableHead>
                <TableHead className="h-8 text-center align-bottom">Done</TableHead>
                <TableHead className="h-8 border-r border-border text-center align-bottom">Remain</TableHead>
                <TableHead colSpan={3} className="h-8 border-l border-border bg-muted/30 text-center">To Data Date (Cumulative)</TableHead>
                <TableHead colSpan={4} className="h-8 border-l border-border bg-muted/30 text-center">Data Date ({dataDateLabel})</TableHead>
                <TableHead colSpan={4} className="h-8 border-l border-border bg-muted/30 text-center">Today ({todayLabel})</TableHead>
                <TableHead rowSpan={3} className="h-8 border-l border-border text-center align-middle">Progress</TableHead>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 text-center text-[11px]">All</TableHead>
                <TableHead className="h-8 text-center text-[11px]">Done</TableHead>
                <TableHead className="h-8 border-r border-border text-center text-[11px]">Open</TableHead>
                {subheads.map((label, i) => (
                  <TableHead key={`${label}-${i}`} className={cn('h-8 text-center text-[11px]', [0, 3, 7].includes(i) && 'border-l border-border')}>{label}</TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={header.stageTotal} /></TableHead>
                <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={header.stageDone} tone="done" /></TableHead>
                <TableHead className="h-8 border-r border-border px-2 text-center"><HeaderTotalNumber value={header.stageRemain} tone="remain" /></TableHead>
                <TableHead className="h-8 border-l border-border px-2 text-center"><HeaderTotalNumber value={header.cumPlan} /></TableHead>
                <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={header.cumActual} /></TableHead>
                <TableHead className="h-8 px-2 text-center"><VarianceCell value={header.cumDelta} /></TableHead>
                <TableHead className="h-8 border-l border-border px-2 text-center"><HeaderTotalNumber value={header.dataDatePlan} /></TableHead>
                <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={header.dataDateActual} /></TableHead>
                <TableHead className="h-8 px-2 text-center"><VarianceCell value={header.dataDateDelta} /></TableHead>
                <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={header.dataDateDelay} tone="delay" /></TableHead>
                <TableHead className="h-8 border-l border-border px-2 text-center"><HeaderTotalNumber value={header.todayPlan} /></TableHead>
                <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={header.todayActual} /></TableHead>
                <TableHead className="h-8 px-2 text-center"><VarianceCell value={header.todayDelta} /></TableHead>
                <TableHead className="h-8 px-2 text-center"><HeaderTotalNumber value={header.todayDelay} tone="delay" /></TableHead>
              </TableRow>
            </TableHeader>
          </Table>
        </div>

        <div className="max-h-[440px] overflow-y-auto rounded-b-md border" style={{ scrollbarGutter: 'stable' }}>
          <Table className="table-fixed">
            {colgroup}
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={17} className="py-8 text-center text-sm text-muted-foreground">No data.</TableCell>
                </TableRow>
              ) : (
                rows.map((row, rowIndex) =>
                  stageDefs(row).map((stage, stageIndex) => {
                    const metrics = stage.metrics;
                    const remain = row.totalDefects - metrics.cumActual;
                    const cumDelta = metrics.cumActual - metrics.cumPlan;
                    const dataDateDelta = metrics.dataDateActual - metrics.dataDatePlan;
                    const todayDelta = metrics.todayActual - metrics.todayPlan;
                    const progress = row.totalDefects ? Math.round((metrics.cumActual / row.totalDefects) * 100) : 0;
                    const isDiff = stage.isDifference;
                    const rowExtra = isDiff ? { actualComplete: 'true', closureComplete: 'false' } : undefined;
                    const rowClick = () => go(row.key, rowExtra);

                    return (
                      <TableRow
                        key={`${row.key}-${stage.stage}`}
                        className={cn(
                          'cursor-pointer hover:bg-muted/40',
                          rowIndex > 0 && stageIndex === 0 && 'border-t-2 border-t-border',
                          isDiff && 'bg-muted/20',
                        )}
                        onClick={rowClick}
                      >
                        {stageIndex === 0 && (
                          <TableCell rowSpan={3} className="px-2 py-2 align-top font-medium">
                            <button
                              type="button"
                              className="max-w-full truncate text-left hover:underline"
                              onClick={(event) => { event.stopPropagation(); go(row.key); }}
                            >
                              {row.label}
                            </button>
                          </TableCell>
                        )}
                        <TableCell className={cn('bg-muted/10 px-2 py-1.5', isDiff && 'border-y border-dashed border-muted-foreground/30')}>
                          <StageBadge stage={stage.stage} label={stage.label} />
                        </TableCell>
                        <TableCell className="bg-muted/10 px-2 py-1.5 text-right text-xs tabular-nums">{(isDiff ? metrics.cumActual : row.totalDefects).toLocaleString()}</TableCell>
                        <TableCell className="bg-muted/10 px-2 py-1.5 text-right text-xs font-semibold text-primary tabular-nums">{metrics.cumActual.toLocaleString()}</TableCell>
                        <TableCell className="border-r border-border bg-muted/10 px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground tabular-nums">
                          {isDiff ? (0).toLocaleString() : remain.toLocaleString()}
                        </TableCell>
                        <TableCell className="border-l border-border px-2 py-1.5 text-right text-xs">
                          {isDiff
                            ? <ClickNum value={metrics.cumPlan} onClick={rowClick} />
                            : <ClickNum value={metrics.cumPlan} onClick={() => go(row.key, { dateField: stage.planField!, dateEnd: dataDate })} />}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs">
                          {isDiff
                            ? <ClickNum value={metrics.cumActual} onClick={rowClick} />
                            : <ClickNum value={metrics.cumActual} onClick={() => go(row.key, { dateField: stage.actualField!, dateEnd: dataDate, [stage.doneParam!]: 'true' })} />}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs"><VarianceCell value={cumDelta} invert={isDiff} /></TableCell>
                        <TableCell className="border-l border-border px-2 py-1.5 text-right text-xs">
                          {isDiff
                            ? <ClickNum value={metrics.dataDatePlan} onClick={rowClick} />
                            : <ClickNum value={metrics.dataDatePlan} onClick={() => go(row.key, { dateField: stage.planField!, dateStart: dataDate, dateEnd: dataDate })} />}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs">
                          {isDiff
                            ? <ClickNum value={metrics.dataDateActual} onClick={rowClick} />
                            : <ClickNum value={metrics.dataDateActual} onClick={() => go(row.key, { dateField: stage.actualField!, dateStart: dataDate, dateEnd: dataDate, [stage.doneParam!]: 'true' })} />}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs"><VarianceCell value={dataDateDelta} invert={isDiff} /></TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs font-semibold text-destructive">
                          <ClickNum value={metrics.dataDateDelay} hideZero onClick={() => go(row.key, { overdue: 'true', asOf: dataDate })} />
                        </TableCell>
                        <TableCell className="border-l border-border px-2 py-1.5 text-right text-xs">
                          {isDiff
                            ? <ClickNum value={metrics.todayPlan} onClick={rowClick} />
                            : <ClickNum value={metrics.todayPlan} onClick={() => go(row.key, { dateField: stage.planField!, dateStart: today, dateEnd: today })} />}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs">
                          {isDiff
                            ? <ClickNum value={metrics.todayActual} onClick={rowClick} />
                            : <ClickNum value={metrics.todayActual} onClick={() => go(row.key, { dateField: stage.actualField!, dateStart: today, dateEnd: today, [stage.doneParam!]: 'true' })} />}
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs"><VarianceCell value={todayDelta} invert={isDiff} /></TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs font-semibold text-destructive">
                          <ClickNum value={metrics.todayDelay} hideZero onClick={() => go(row.key, { overdue: 'true', asOf: today })} />
                        </TableCell>
                        <TableCell className="border-l border-border px-2 py-1.5">
                          {isDiff ? (
                            <span className="text-[10px] text-muted-foreground/50">—</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Progress value={progress} className="h-1.5 flex-1" />
                              <span className="w-9 text-right text-[10px] text-muted-foreground tabular-nums">{progress}%</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }),
                )
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function buildActualPie(items: DefectForDashboard[]) { const complete = items.filter(isActualComplete).length; const inProgress = items.filter(item => !isActualComplete(item) && Number(item.actual_progress_pct ?? 0) > 0).length; const notStarted = items.length - complete - inProgress; return [{ name: 'Complete', value: complete }, { name: 'In Progress', value: inProgress }, { name: 'Not Started', value: notStarted }].filter(item => item.value > 0); }
function buildClosurePie(items: DefectForDashboard[]) { const closed = items.filter(isClosureComplete).length; return [{ name: 'Closed', value: closed }, { name: 'Not Closed', value: items.length - closed }].filter(item => item.value > 0); }
function PieBlock({ title, data, onSliceClick }: { title: string; data: { name: string; value: number }[]; onSliceClick: (name: string) => void }) { return <div><p className="mb-1 text-center text-xs font-medium text-muted-foreground">{title}</p><ChartContainer config={Object.fromEntries(data.map(d => [d.name, { label: d.name, color: PIE_COLORS[d.name] }]))} className="mx-auto h-[170px] w-[170px]"><PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={38}>{data.map(entry => <Cell key={entry.name} fill={PIE_COLORS[entry.name]} className="cursor-pointer" onClick={() => onSliceClick(entry.name)} />)}</Pie><ChartTooltip content={<ChartTooltipContent />} /></PieChart></ChartContainer><div className="mt-1 flex flex-wrap justify-center gap-2 text-[10px]">{data.map(d => <button key={d.name} onClick={() => onSliceClick(d.name)} className="flex items-center gap-1 hover:underline"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: PIE_COLORS[d.name] }} />{d.name} ({d.value})</button>)}</div></div>; }
