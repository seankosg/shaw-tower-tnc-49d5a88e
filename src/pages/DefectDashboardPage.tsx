import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { AutoRefreshControl } from '@/components/dashboard/AutoRefreshControl';
import { useHeaderSlot } from '@/contexts/HeaderSlotContext';
import { useAuth } from '@/contexts/AuthContext';
import { exportDefectSCurveToExcel } from '@/lib/scurve-excel-export';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CalendarIcon, CheckCircle2, ChevronDown, ChevronRight, Clock, Download, Filter, ListChecks, ShieldCheck, TrendingUp } from 'lucide-react';
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ReferenceLine, XAxis, YAxis } from 'recharts';
import { ALL_TEAMS, TEAM_LABELS } from '@/types/enums';
import { supabase } from '@/integrations/supabase/client';
import { useDefectCache, refreshDefectCache } from '@/lib/defect-cache';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/use-toast';
import { useAtRiskThreshold } from '@/hooks/useAppSettings';
import { useMainScrollRestoration } from '@/hooks/useMainScrollRestoration';
import { cn } from '@/lib/utils';
import { DDayBadge } from '@/components/shared/DDayBadge';
import { PROJECT_COMPLETION_DDAY } from '@/lib/constants';
import { formatDdMmm } from '@/lib/format';
import { exportDefectPlanActualToExcel } from '@/lib/defect-dashboard-excel-export';
import { RecentDefectComments } from '@/components/dashboard/RecentDefectComments';
import { CriticalItemsPanel } from '@/components/dashboard/CriticalItemsPanel';
import {
  NONE_LABEL,
  aggregateDefectPlanActualByGroup,
  buildDefectSCurve,
  buildDefectSCurveAllStages,
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
  type DefectSCurveResult,
  type DefectSCurveAllResult,
  type DefectSCurveStageOpt,
} from '@/lib/defect-dashboard-utils';
import {
  ALL_DEFECT_GROUP_KEYS,
  ALL_DEFECT_STAGE_KEYS,
  DEFECT_GROUP_LABELS,
  DEFECT_STAGE_LABELS,
  DEFECT_GROUP_QUERY_PARAM,
  getDefectGroupKey,
  getDefectGroupLabel,
  type DefectScheduleGroupBy,
  type DefectScheduleStage,
} from '@/lib/defect-schedule-utils';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { usePlanMode } from '@/hooks/usePlanMode';
import { CAPTURED_BY_GROUPS, getCapturedByGroup, type CapturedByGroup } from '@/lib/captured-by-groups';

const PIE_COLORS: Record<string, string> = {
  Complete: 'hsl(var(--primary))',
  'In Progress': 'hsl(var(--accent-foreground))',
  'Not Started': 'hsl(var(--muted-foreground))',
  Closed: 'hsl(var(--primary))',
  'Not Closed': 'hsl(var(--destructive))',
};

const chartConfig = {
  plan: { label: 'Plan (cum)', color: 'hsl(var(--muted-foreground))' },
  actual: { label: 'Actual (cum)', color: 'hsl(var(--primary))' },
  variance: { label: 'Variance', color: 'hsl(var(--destructive))' },
} satisfies ChartConfig;

const GROUP_LINE_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(217 91% 60%)',
  'hsl(160 60% 45%)',
  'hsl(280 70% 60%)',
  'hsl(var(--muted-foreground))',
] as const;

const SCURVE_GROUP_NONE = 'none' as const;

export default function DefectDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { value: atRiskDays } = useAtRiskThreshold();
  const { toast } = useToast();
  const { profile, roles } = useAuth();
  const scurveChartRef = useRef<HTMLDivElement | null>(null);
  const { items: cachedItems, initialLoaded } = useDefectCache();
  const items = cachedItems as unknown as DefectForDashboard[];
  const loading = !initialLoaded;
  useMainScrollRestoration(!loading);
  const [dataDate, setDataDate] = useState(todayIso());
  const [teamFilter, setTeamFilter] = useState<string[]>(() => {
    const raw = searchParams.get('team');
    if (!raw || raw === 'all') return [];
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  });
  const [breakdownTab, setBreakdownTab] = useState(searchParams.get('tab') || 'subcon');
  const [scurveBucket, setScurveBucket] = useState<'day' | 'week'>((searchParams.get('bucket') as 'day' | 'week') || 'day');
  const [scurveOpen, setScurveOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('defect-dashboard.scurve.open') === '1';
  });
  useEffect(() => {
    try { localStorage.setItem('defect-dashboard.scurve.open', scurveOpen ? '1' : '0'); } catch {}
  }, [scurveOpen]);
  const [scurveStart, setScurveStart] = useState(searchParams.get('scurve_start') || '2026-04-15');
  const [scurveEnd, setScurveEnd] = useState(searchParams.get('scurve_end') || '2026-06-07');
  const [scurveStage, setScurveStage] = useState<DefectSCurveStageOpt>(() => {
    const raw = searchParams.get('stage_view');
    const first = raw?.split(',').map(s => s.trim()).find(Boolean);
    if (first === 'all') return 'all';
    return (first && (ALL_DEFECT_STAGE_KEYS as string[]).includes(first)) ? (first as DefectScheduleStage) : 'completion';
  });
  const [scurveGroup, setScurveGroup] = useState<DefectScheduleGroupBy | typeof SCURVE_GROUP_NONE>(() => {
    const raw = searchParams.get('group');
    const first = raw?.split(',').map(s => s.trim()).find(Boolean);
    if (!first || first === SCURVE_GROUP_NONE) return SCURVE_GROUP_NONE;
    return (ALL_DEFECT_GROUP_KEYS as string[]).includes(first) ? (first as DefectScheduleGroupBy) : SCURVE_GROUP_NONE;
  });
  const [scurveGroupValues, setScurveGroupValues] = useState<string[]>(() => {
    const raw = searchParams.get('group_values');
    return raw ? raw.split(',').filter(Boolean) : [];
  });
  const [hiddenScurveSeries, setHiddenScurveSeries] = useState<Set<string>>(new Set());
  const [subTradeTextFilter, setSubTradeTextFilter] = useState(searchParams.get('sub_trade_text') || '');
  const [selectedSubTradeFilters, setSelectedSubTradeFilters] = useState<string[]>(searchParams.get('sub_trades')?.split(',').filter(Boolean) || []);
  const [planMode, setPlanMode] = usePlanMode();

  // URL plan_mode wins on mount, then state propagates to URL.
  useEffect(() => {
    const urlMode = searchParams.get('plan_mode');
    if ((urlMode === 'baseline' || urlMode === 'remaining') && urlMode !== planMode) {
      setPlanMode(urlMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetchDataDate = useCallback(async () => {
    const latestImport = await (supabase as any)
      .from('defect_upload_batches')
      .select('data_date')
      .eq('status', 'completed')
      .not('data_date', 'is', null)
      .order('data_date', { ascending: false })
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestImport.data?.data_date) setDataDate(latestImport.data.data_date);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refetchDataDate();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [refetchDataDate]);

  const autoRefresh = useAutoRefresh({
    storageKey: 'defect',
    onRefresh: async () => {
      refreshDefectCache();
      await refetchDataDate();
    },
  });

  useHeaderSlot(
    <AutoRefreshControl state={autoRefresh} />,
    [autoRefresh.enabled, autoRefresh.intervalMs, autoRefresh.lastUpdatedAt, autoRefresh.isRefreshing],
  );

  const today = todayIso();
  const dataDateLabel = formatDdMmm(dataDate);
  const todayLabel = formatDdMmm(today);
  const filteredItems = useMemo(() => teamFilter.length === 0 ? items : items.filter((item) => item.team && teamFilter.includes(item.team)), [items, teamFilter]);

  const criticalDefects = useMemo(
    () => filteredItems.filter((it: any) => it.is_critical).map((it: any) => ({
      id: it.id,
      primary: it.issue_no,
      secondary: it.area_level,
      team: it.team ?? null,
      subcontractor: it.subcontractor_name,
      status: it.closure_status || it.completion_status || it.status || '—',
      main_trade: it.main_trade ?? null,
      sub_trade: it.sub_trade ?? null,
      work_type: it.work_type ?? null,
      registered_at: it.critical_marked_at ?? null,
      registered_by_name: it.critical_marked_by_name ?? null,
    })),
    [filteredItems],
  );

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
    const inDisputeCount = filteredItems.filter((item) => item.closure_status === 'InD').length;

    // Priority 분류별 집계 (Cat A / Cat B / No Cat / Total)
    const CAT_A = 'Cat A - Major Defect (Before SC)';
    const CAT_B = 'Cat B - Minor Defect';
    const bucketize = (rows: typeof filteredItems) => {
      const t = rows.length;
      const c = rows.filter(isActualComplete).length;
      const z = rows.filter(isClosureComplete).length;
      const od = rows.filter((i) => isStageDelayedAsOf(i, 'completion', dataDate)).length;
      return {
        total: t,
        completion: c,
        closure: z,
        completionPct: t ? Math.round((c / t) * 1000) / 10 : 0,
        closurePct: t ? Math.round((z / t) * 1000) / 10 : 0,
        overdue: od,
      };
    };
    const catA = filteredItems.filter((i) => (i as any).priority === CAT_A);
    const catB = filteredItems.filter((i) => (i as any).priority === CAT_B);
    const noCat = filteredItems.filter((i) => !(i as any).priority);
    const byPriority = {
      total: bucketize(filteredItems),
      catA: bucketize(catA),
      catB: bucketize(catB),
      noCat: bucketize(noCat),
    };

    return { total, actualDone, closureDone, difference, completionPct, overallProgressPct, overdueCount, atRiskCount, startOverdue, completionOverdue, closureOverdue, inDisputeCount, byPriority };
  }, [filteredItems, today, dataDate, atRiskDays]);


  const bySubTrade = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => i.sub_trade ?? NONE_LABEL, k => k, planMode), [filteredItems, today, dataDate, planMode]);
  const bySubcon = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => i.subcontractor_name ?? NONE_LABEL, k => k, planMode), [filteredItems, today, dataDate, planMode]);
  const bySubsub = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => i.subsub_name ?? NONE_LABEL, k => k, planMode), [filteredItems, today, dataDate, planMode]);
  const byHdec = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => i.hdec_pic_name ?? NONE_LABEL, k => k, planMode), [filteredItems, today, dataDate, planMode]);
  const byHdecEng = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => (i as any).hdec_eng_name ?? NONE_LABEL, k => k, planMode), [filteredItems, today, dataDate, planMode]);
  const byTeam = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => i.team ?? NONE_LABEL, k => k === NONE_LABEL ? k : (TEAM_LABELS[k as keyof typeof TEAM_LABELS] ?? k), planMode), [filteredItems, today, dataDate, planMode]);
  const byWorkType = useMemo(() => aggregateDefectPlanActualByGroup(filteredItems, today, dataDate, i => (i as any).work_type ?? NONE_LABEL, k => k, planMode), [filteredItems, today, dataDate, planMode]);
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

  // Available group-value options for the secondary dropdown (based on team-filtered items, excluding group-value filter itself).
  const groupValueOptions = useMemo(() => {
    if (scurveGroup === SCURVE_GROUP_NONE) return [] as { key: string; label: string }[];
    const seen = new Map<string, string>();
    for (const it of filteredItems) {
      const k = getDefectGroupKey(it, scurveGroup);
      if (!seen.has(k)) seen.set(k, getDefectGroupLabel(scurveGroup, k));
    }
    return Array.from(seen.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredItems, scurveGroup]);

  // Items used for S-Curve: apply secondary group-value filter on top of team filter.
  const scurveItems = useMemo(() => {
    if (scurveGroup === SCURVE_GROUP_NONE || scurveGroupValues.length === 0) return filteredItems;
    return filteredItems.filter(it => scurveGroupValues.includes(getDefectGroupKey(it, scurveGroup)));
  }, [filteredItems, scurveGroup, scurveGroupValues]);

  const scurve: DefectSCurveResult = useMemo(() => buildDefectSCurve(scurveItems, {
    granularity: scurveBucket,
    startDate: scurveStart,
    endDate: scurveEnd,
    today,
    stage: scurveStage === 'all' ? 'completion' : scurveStage,
    groupBy: scurveGroup === SCURVE_GROUP_NONE ? null : scurveGroup,
    planMode,
  }), [scurveItems, scurveBucket, scurveStart, scurveEnd, today, scurveStage, scurveGroup, planMode]);
  const scurveAll: DefectSCurveAllResult | null = useMemo(() => {
    if (scurveStage !== 'all') return null;
    return buildDefectSCurveAllStages(scurveItems, {
      granularity: scurveBucket,
      startDate: scurveStart,
      endDate: scurveEnd,
      today,
      groupBy: scurveGroup === SCURVE_GROUP_NONE ? null : scurveGroup,
      planMode,
    });
  }, [scurveItems, scurveBucket, scurveStart, scurveEnd, today, scurveStage, scurveGroup, planMode]);

  const handleSCurveExport = async () => {
    const hasData = scurveStage === 'all' ? (scurveAll?.buckets.length ?? 0) > 0 : scurve.buckets.length > 0;
    if (!hasData) {
      toast({ title: 'No data to export', description: 'S-Curve has no points in the selected range.', variant: 'destructive' });
      return;
    }
    try {
      const filters: Array<[string, string]> = [
        ['Stage', scurveStage === 'all' ? 'All stages' : (DEFECT_STAGE_LABELS[scurveStage as DefectScheduleStage] ?? scurveStage)],
        ['Team', teamFilter.length === 0 ? 'All teams' : teamFilter.map(t => TEAM_LABELS[t as keyof typeof TEAM_LABELS] ?? t).join(', ')],
        ['Group by', scurveGroup === SCURVE_GROUP_NONE ? 'None' : DEFECT_GROUP_LABELS[scurveGroup as DefectScheduleGroupBy]],
        ['Plan mode', planMode === 'remaining' ? 'Remaining' : 'Baseline'],
      ];
      if (scurveGroupValues.length > 0) filters.push(['Group values', scurveGroupValues.join(', ')]);
      const { rowCount, fileName } = await exportDefectSCurveToExcel({
        stage: scurveStage,
        single: scurveStage === 'all' ? undefined : scurve,
        all: scurveStage === 'all' ? scurveAll ?? undefined : undefined,
        hiddenSeries: hiddenScurveSeries,
        today,
        bucket: scurveBucket,
        rangeStart: scurveStart,
        rangeEnd: scurveEnd,
        filters,
        totalIncluded: scurveItems.length,
        exportedByName: profile?.name || profile?.login_id || 'unknown',
        exportedByRole: roles[0] || profile?.user_type || 'user',
        chartElement: scurveChartRef.current,
      });
      toast({ title: 'Export complete', description: `${rowCount} buckets → ${fileName}` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Export failed', description: msg, variant: 'destructive' });
    }
  };
  const topOverdue = useMemo(() => filteredItems.map(item => ({ item, delay: maxDelayDays(item, dataDate) })).filter(row => row.delay > 0 && !isClosureComplete(row.item)).sort((a, b) => b.delay - a.delay).slice(0, 10), [filteredItems, dataDate]);
  const actualPie = useMemo(() => buildActualPie(filteredItems), [filteredItems]);
  const closurePie = useMemo(() => buildClosurePie(filteredItems), [filteredItems]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDelete = (key: string, value: string, defaultValue: string) => value && value !== defaultValue ? next.set(key, value) : next.delete(key);
    teamFilter.length ? next.set('team', teamFilter.join(',')) : next.delete('team');
    setOrDelete('tab', breakdownTab, 'subcon');
    setOrDelete('bucket', scurveBucket, 'day');
    setOrDelete('scurve_start', scurveStart, '2026-04-15');
    setOrDelete('scurve_end', scurveEnd, '2026-06-07');
    setOrDelete('stage_view', scurveStage, 'completion');
    setOrDelete('group', scurveGroup, SCURVE_GROUP_NONE);
    scurveGroupValues.length ? next.set('group_values', scurveGroupValues.join(',')) : next.delete('group_values');
    setOrDelete('sub_trade_text', subTradeTextFilter, '');
    selectedSubTradeFilters.length ? next.set('sub_trades', selectedSubTradeFilters.join(',')) : next.delete('sub_trades');
    setOrDelete('plan_mode', planMode, 'remaining');
    setSearchParams(next, { replace: true });
  }, [teamFilter, breakdownTab, scurveBucket, scurveStart, scurveEnd, scurveStage, scurveGroup, scurveGroupValues, subTradeTextFilter, selectedSubTradeFilters, planMode]);

  const goRaw = (params: Record<string, string>) => navigate(`/defects/raw-data?${new URLSearchParams({ source: 'dashboard', ...params }).toString()}`);
  const handleBreakdownExport = () => {
    const { rows, header } = breakdownDataMap[breakdownTab] ?? breakdownDataMap.subcon;
    if (!rows.length) return toast({ title: 'No data to export', variant: 'destructive' });
    const { rowCount, fileName } = exportDefectPlanActualToExcel(rows, header, today, dataDate, planMode);
    toast({ title: 'Export complete', description: `${rowCount} groups → ${fileName}` });
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading defect dashboard...</div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Defect Executive Dashboard</h1>
          <DDayBadge targetDate={PROJECT_COMPLETION_DDAY} />
        </div>
        <div className="flex items-center gap-3">
          <ToggleGroup type="multiple" value={teamFilter} onValueChange={setTeamFilter} className="gap-1 flex-wrap">
            {ALL_TEAMS.map((team) => (
              <ToggleGroupItem key={team} value={team} className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                {TEAM_LABELS[team]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">At-Risk threshold: ≤ {atRiskDays} day{atRiskDays === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <KpiCard icon={<ListChecks className="h-6 w-6 text-muted-foreground" />} label="Total Defects" value={kpis.total.toLocaleString()} onClick={() => goRaw({})} />
        <KpiCard icon={<CheckCircle2 className="h-6 w-6 text-primary" />} label="Completion Done" value={kpis.actualDone.toLocaleString()} sub={`${kpis.completionPct}% completed`} progress={kpis.completionPct} onClick={() => goRaw({ actualComplete: 'true' })} />
        <KpiCard icon={<Clock className="h-6 w-6 text-muted-foreground" />} label="Open Defect" value={(kpis.total - kpis.actualDone).toLocaleString()} sub="Total − Completion" progress={100 - kpis.completionPct} progressTone="destructive" onClick={() => goRaw({ actualComplete: 'false' })} />
        <KpiCard icon={<ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />} label="Closure Done" value={kpis.closureDone.toLocaleString()} sub={`${kpis.overallProgressPct}% closed`} progress={kpis.overallProgressPct} onClick={() => goRaw({ closureComplete: 'true' })} />
        <KpiCard icon={<Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />} label="Remain Inspection" value={kpis.difference.toLocaleString()} sub="검측 대기" onClick={() => goRaw({ actualComplete: 'true', closureComplete: 'false' })} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard icon={<AlertTriangle className="h-6 w-6 text-destructive" />} label="Overdue - Start" value={kpis.startOverdue} accent="destructive" sub="Start 지연" onClick={() => goRaw({ overdue: 'true', stage: 'start', asOf: dataDate })} />
        <KpiCard icon={<AlertTriangle className="h-6 w-6 text-destructive" />} label="Overdue - Completion" value={kpis.completionOverdue} accent="destructive" sub="Completion 지연" onClick={() => goRaw({ overdue: 'true', stage: 'completion', asOf: dataDate })} />
        <KpiCard icon={<AlertCircle className="h-6 w-6 text-purple-600 dark:text-purple-400" />} label="In Dispute" value={kpis.inDisputeCount} sub="LL 이견 알람" onClick={() => goRaw({ closureStatus: 'InD' })} />
        <KpiCard icon={<AlertTriangle className="h-6 w-6 text-destructive" />} label="Overdue - Closure" value={kpis.closureOverdue} accent="destructive" sub="Closure 지연" onClick={() => goRaw({ overdue: 'true', stage: 'closure', asOf: dataDate })} />
        <Card className="flex flex-col justify-center p-4">
          <div className="mb-1 flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Overall Progress</p></div>
          <p className="text-xl font-bold text-foreground">{kpis.overallProgressPct}%</p>
          <Progress value={kpis.overallProgressPct} className="mt-1 h-2" />
          <p className="mt-1 text-[10px] text-muted-foreground">Closure / Total</p>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          { label: 'Total', stats: kpis.byPriority.total, priority: null },
          { label: 'Cat. A', stats: kpis.byPriority.catA, priority: 'Cat A - Major Defect (Before SC)' },
          { label: 'Cat. B', stats: kpis.byPriority.catB, priority: 'Cat B - Minor Defect' },
          { label: 'No Cat.', stats: kpis.byPriority.noCat, priority: '__EMPTY__' },
        ] as const).map(({ label, stats, priority }) => {
          const teamParam: Record<string, string> = teamFilter.length ? { team: teamFilter.join(',') } : {};
          const pParam: Record<string, string> = priority ? { priority } : {};
          return (
            <PriorityCard
              key={label}
              label={label}
              stats={stats}
              onCardClick={() => goRaw({ ...teamParam, ...pParam })}
              onCompletionClick={() => goRaw({ ...teamParam, ...pParam, actualComplete: 'true' })}
              onClosureClick={() => goRaw({ ...teamParam, ...pParam, closureComplete: 'true' })}
              onOverdueClick={() => goRaw({ ...teamParam, ...pParam, overdue: 'true', stage: 'completion', asOf: dataDate })}
            />
          );
        })}
      </div>




      {!roles.includes('guest') && (
        <CapturedByStatsSection
          items={filteredItems}
          kpis={kpis}
          onCardClick={(name) => goRaw({ capturedBy: name })}
          onMetricClick={(name, metric) => {
            const params: Record<string, string> = { capturedBy: name };
            if (metric === 'completed') params.actualComplete = 'true';
            else if (metric === 'closed') params.closureComplete = 'true';
            else if (metric === 'dispute') params.closureStatus = 'InD';
            else if (metric === 'priCatA') params.priority = 'Cat A - Major Defect (Before SC)';
            else if (metric === 'priCatB') params.priority = 'Cat B - Minor Defect';
            else if (metric === 'priNoCat') params.priority = '__EMPTY__';
            goRaw(params);
          }}
          onGroupClick={(group) => goRaw({ capturedByGroup: group })}
          showDebug={roles.includes('admin') || roles.includes('superuser')}
        />
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Plan vs Actual - Summary</CardTitle>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Plan</span>
            <ToggleGroup
              type="single"
              size="sm"
              value={planMode}
              onValueChange={(v) => { if (v === 'baseline' || v === 'remaining') setPlanMode(v); }}
              className="gap-1"
            >
              <ToggleGroupItem value="remaining" className="h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Remaining</ToggleGroupItem>
              <ToggleGroupItem value="baseline" className="h-7 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Baseline</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleBreakdownExport}><Download className="mr-1.5 h-4 w-4" />Excel</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={breakdownTab} onValueChange={setBreakdownTab}>
            <TabsList className="h-auto flex-wrap"><TabsTrigger value="subTrade">By Sub Trade</TabsTrigger><TabsTrigger value="subcon">By Subcontractor</TabsTrigger><TabsTrigger value="subsub">By Sub-Sub</TabsTrigger><TabsTrigger value="hdec">By HDEC PIC</TabsTrigger><TabsTrigger value="hdecEng">By HDEC ENG</TabsTrigger><TabsTrigger value="team">By Team</TabsTrigger><TabsTrigger value="workType">By Work Type</TabsTrigger></TabsList>
            <TabsContent value="subTrade"><PlanActualTable rows={filteredBySubTrade} groupParam="subTrade" groupHeader="Sub Trade" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} planMode={planMode} filter={{ text: subTradeTextFilter, selected: selectedSubTradeFilters, options: subTradeFilterOptions, onTextChange: setSubTradeTextFilter, onSelectedChange: setSelectedSubTradeFilters }} /></TabsContent>
            <TabsContent value="subcon"><PlanActualTable rows={bySubcon} groupParam="subcontractor" groupHeader="Subcontractor" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} planMode={planMode} /></TabsContent>
            <TabsContent value="subsub"><PlanActualTable rows={bySubsub} groupParam="subsub" groupHeader="Sub-Sub" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} planMode={planMode} /></TabsContent>
            <TabsContent value="hdec"><PlanActualTable rows={byHdec} groupParam="hdecPic" groupHeader="HDEC PIC" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} planMode={planMode} /></TabsContent>
            <TabsContent value="hdecEng"><PlanActualTable rows={byHdecEng} groupParam="hdecEng" groupHeader="HDEC ENG" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} planMode={planMode} /></TabsContent>
            <TabsContent value="team"><PlanActualTable rows={byTeam} groupParam="team" groupHeader="Team" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} planMode={planMode} /></TabsContent>
            <TabsContent value="workType"><PlanActualTable rows={byWorkType} groupParam="workType" groupHeader="Work Type" today={today} dataDate={dataDate} todayLabel={todayLabel} dataDateLabel={dataDateLabel} navigate={navigate} planMode={planMode} /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => setScurveOpen((v) => !v)} className="flex items-center gap-2 text-left hover:opacity-80" aria-expanded={scurveOpen} aria-label="Toggle S-Curve chart">
              {scurveOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <CardTitle className="text-base">Plan vs Actual — S-Curve <span className="ml-1 text-xs font-normal text-muted-foreground">({planMode})</span></CardTitle>
            </button>
            {scurveOpen && (
              <div className="flex flex-wrap items-center gap-2">
                <DateButton value={scurveStart} onChange={setScurveStart} />
                <span className="text-xs text-muted-foreground">~</span>
                <DateButton value={scurveEnd} onChange={setScurveEnd} />
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleSCurveExport}>
                  <Download className="h-3.5 w-3.5" />
                  Export Excel
                </Button>
              </div>
            )}
          </div>
          {scurveOpen && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <SCurveToolbarGroup label="Stage">
                <ToggleGroup
                  type="single"
                  value={scurveStage}
                  onValueChange={(v) => v && setScurveStage(v as DefectSCurveStageOpt)}
                  className="gap-1"
                >
                  {ALL_DEFECT_STAGE_KEYS.map((k) => (
                    <ToggleGroupItem key={k} value={k} className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                      {DEFECT_STAGE_LABELS[k]}
                    </ToggleGroupItem>
                  ))}
                  <ToggleGroupItem value="all" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    All
                  </ToggleGroupItem>
                </ToggleGroup>
              </SCurveToolbarGroup>

              <SCurveToolbarGroup label="Group">
                <Select
                  value={scurveGroup}
                  onValueChange={(v) => {
                    setScurveGroup(v as DefectScheduleGroupBy | typeof SCURVE_GROUP_NONE);
                    setScurveGroupValues([]);
                  }}
                >
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SCURVE_GROUP_NONE}>None</SelectItem>
                    {ALL_DEFECT_GROUP_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>{DEFECT_GROUP_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SCurveToolbarGroup>

              {scurveGroup !== SCURVE_GROUP_NONE && (
                <SCurveToolbarGroup label={`${DEFECT_GROUP_LABELS[scurveGroup as DefectScheduleGroupBy]} values`}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs justify-between min-w-[180px]">
                        <span className="truncate">
                          {scurveGroupValues.length === 0
                            ? 'All'
                            : scurveGroupValues.length <= 2
                              ? scurveGroupValues
                                  .map((k) => groupValueOptions.find((o) => o.key === k)?.label ?? k)
                                  .join(', ')
                              : `${scurveGroupValues.length} selected`}
                        </span>
                        <ChevronDown className="ml-2 h-3 w-3 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-2" align="start">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b">
                        <span className="text-xs font-medium text-muted-foreground">
                          {scurveGroupValues.length} / {groupValueOptions.length} selected
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setScurveGroupValues([])}
                          disabled={scurveGroupValues.length === 0}
                        >
                          Clear
                        </Button>
                      </div>
                      <div className="max-h-[280px] overflow-y-auto space-y-1">
                        {groupValueOptions.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2 text-center">No values</p>
                        ) : (
                          groupValueOptions.map((opt) => {
                            const checked = scurveGroupValues.includes(opt.key);
                            return (
                              <label
                                key={opt.key}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-xs"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(c) => {
                                    setScurveGroupValues((prev) =>
                                      c ? [...prev, opt.key] : prev.filter((k) => k !== opt.key),
                                    );
                                  }}
                                />
                                <span className="truncate flex-1">{opt.label}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {scurveGroupValues.length > 0 && (
                    <div className="flex flex-wrap gap-1 ml-2 max-w-[400px]">
                      {scurveGroupValues.slice(0, 4).map((k) => {
                        const label = groupValueOptions.find((o) => o.key === k)?.label ?? k;
                        return (
                          <Badge key={k} variant="secondary" className="h-6 gap-1 text-[11px]">
                            <span className="truncate max-w-[120px]">{label}</span>
                            <button
                              onClick={() => setScurveGroupValues((prev) => prev.filter((x) => x !== k))}
                              className="hover:text-destructive"
                              aria-label={`Remove ${label}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                      {scurveGroupValues.length > 4 && (
                        <Badge variant="outline" className="h-6 text-[11px]">+{scurveGroupValues.length - 4}</Badge>
                      )}
                    </div>
                  )}
                </SCurveToolbarGroup>
              )}

              <SCurveToolbarGroup label="Team">
                <ToggleGroup type="multiple" value={teamFilter} onValueChange={setTeamFilter} className="gap-1 flex-wrap">
                  {ALL_TEAMS.map((t) => (
                    <ToggleGroupItem key={t} value={t} className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                      {TEAM_LABELS[t]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </SCurveToolbarGroup>

              <SCurveToolbarGroup label="Bucket">
                <Tabs value={scurveBucket} onValueChange={(v) => setScurveBucket(v as 'day' | 'week')}>
                  <TabsList className="h-8">
                    <TabsTrigger value="day" className="h-6 px-2 text-xs">Day</TabsTrigger>
                    <TabsTrigger value="week" className="h-6 px-2 text-xs">Week</TabsTrigger>
                  </TabsList>
                </Tabs>
              </SCurveToolbarGroup>
            </div>
          )}
        </CardHeader>
        {scurveOpen && (
          <CardContent className="space-y-3" ref={scurveChartRef}>
            {scurveStage === 'all' && scurveAll ? (
              <>
                <SCurveAllKpiStrip scurveAll={scurveAll} today={today} windowStart={scurveStart} windowEnd={scurveEnd} />
                {scurveAll.buckets.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">No data in range.</p>
                ) : (
                  <SCurveChartsAllStages
                    scurveAll={scurveAll}
                    onBucketClick={(bucketIso) => {
                      const start = new Date(bucketIso + 'T00:00:00Z');
                      const end = new Date(start);
                      if (scurveBucket === 'week') end.setUTCDate(end.getUTCDate() + 6);
                      const dateTo = end.toISOString().slice(0, 10);
                      goRaw({ dateField: 'planned_completion_date', dateFrom: bucketIso, dateTo });
                    }}
                  />
                )}
                <p className="text-[11px] text-muted-foreground">
                  All-stage view: Group breakdown disabled. Stacked bars show daily Plan/Actual workload across Start, Completion, Closure.
                </p>
              </>
            ) : (
              <>
                <SCurveKpiStrip scurve={scurve} today={today} stage={scurveStage as DefectScheduleStage} windowStart={scurveStart} windowEnd={scurveEnd} />
                {scurve.buckets.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">No data in range.</p>
                ) : (
                  <SCurveCharts
                    scurve={scurve}
                    today={today}
                    hidden={hiddenScurveSeries}
                    onToggleSeries={(key) => {
                      setHiddenScurveSeries((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        return next;
                      });
                    }}
                    onBucketClick={(bucketIso) => {
                      const dateField = scurveStage === 'start' ? 'planned_start_date'
                        : scurveStage === 'completion' ? 'planned_completion_date'
                        : 'planned_closure_date';
                      const start = new Date(bucketIso + 'T00:00:00Z');
                      const end = new Date(start);
                      if (scurveBucket === 'week') end.setUTCDate(end.getUTCDate() + 6);
                      const dateTo = end.toISOString().slice(0, 10);
                      goRaw({ dateField, dateFrom: bucketIso, dateTo });
                    }}
                  />
                )}
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* ─── Recent Comments Feed ─── */}
      <RecentDefectComments />


      <CriticalItemsPanel
        items={criticalDefects}
        rowHref={(id) => `/defects/${id}`}
        rawDataHref="/defects"
        primaryLabel="Issue No"
        secondaryLabel="Level"
        showTradeColumns
        tableName="defect_items"
      />
    </div>
  );
}

type GroupParam = 'subTrade' | 'subcontractor' | 'subsub' | 'hdecPic' | 'hdecEng' | 'team' | 'workType';
type StageKey = 'completion' | 'closure' | 'difference';

interface PriorityStats { total: number; completion: number; closure: number; completionPct: number; closurePct: number; overdue: number }
function PriorityCard({ label, stats, onCardClick, onCompletionClick, onClosureClick, onOverdueClick }: { label: string; stats: PriorityStats; onCardClick?: () => void; onCompletionClick?: () => void; onClosureClick?: () => void; onOverdueClick?: () => void }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const odActive = stats.overdue > 0;
  return (
    <Card onClick={onCardClick} className={cn(onCardClick && 'cursor-pointer transition-colors hover:bg-muted/40')}>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
            <button
              type="button"
              onClick={(e) => { stop(e); if (odActive) onOverdueClick?.(); }}
              disabled={!odActive}
              title="Overdue vs plan (Completion)"
              className={cn(
                'shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums border transition-colors',
                odActive
                  ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 cursor-pointer'
                  : 'border-muted bg-muted/30 text-muted-foreground/60 cursor-default',
              )}
            >
              OD {stats.overdue.toLocaleString()}
            </button>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.total.toLocaleString()}</p>
        </div>
        <button type="button" onClick={(e) => { stop(e); onCompletionClick?.(); }} className="text-left transition-colors hover:bg-muted/30 rounded px-1 -mx-1 py-0.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Completion</span>
            <span className="tabular-nums"><span className="font-medium text-foreground">{stats.completion.toLocaleString()}</span> / {stats.total.toLocaleString()} ({stats.completionPct}%)</span>
          </div>
          <Progress value={Math.max(0, Math.min(100, stats.completionPct))} className="mt-1 h-1.5" />
        </button>
        <button type="button" onClick={(e) => { stop(e); onClosureClick?.(); }} className="text-left transition-colors hover:bg-muted/30 rounded px-1 -mx-1 py-0.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Closure</span>
            <span className="tabular-nums"><span className="font-medium text-foreground">{stats.closure.toLocaleString()}</span> / {stats.total.toLocaleString()} ({stats.closurePct}%)</span>
          </div>
          <Progress value={Math.max(0, Math.min(100, stats.closurePct))} className="mt-1 h-1.5 [&>div]:bg-emerald-500" />
        </button>
      </CardContent>
    </Card>
  );
}

function KpiCard({ icon, label, value, sub, accent, progress, progressTone, onClick }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: 'destructive'; progress?: number; progressTone?: 'default' | 'destructive'; onClick?: () => void }) {
  return <Card onClick={onClick} className={cn(onClick && 'cursor-pointer transition-colors hover:bg-muted/40', accent === 'destructive' && 'border-destructive/30')}><CardContent className="flex items-center gap-3 p-4">{icon}<div className="min-w-0 flex-1"><p className="truncate text-xs text-muted-foreground">{label}</p><p className={cn('text-2xl font-bold', accent === 'destructive' ? 'text-destructive' : 'text-foreground')}>{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}{typeof progress === 'number' && <Progress value={Math.max(0, Math.min(100, progress))} className={cn('mt-1.5 h-1.5', progressTone === 'destructive' && '[&>div]:bg-destructive')} />}</div></CardContent></Card>;
}

function AlertBanner({ tone, title, description, onClick }: { tone: 'destructive' | 'warning' | 'dispute'; title: string; description: string; onClick: () => void }) { const cls = tone === 'destructive' ? 'border-destructive/40 bg-destructive/5 text-destructive' : tone === 'dispute' ? 'border-purple-500/40 bg-purple-500/5 text-purple-700 dark:text-purple-300' : 'border-primary/40 bg-primary/5 text-primary'; const Icon = tone === 'dispute' ? AlertCircle : AlertTriangle; return <button onClick={onClick} className={cn('flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40', cls)}><div className="flex items-center gap-3"><Icon className="h-5 w-5" /><div><p className="font-semibold">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div></div><span className="text-sm font-medium text-muted-foreground">View</span></button>; }

type CapturedByMetric = 'total' | 'completed' | 'closed' | 'dispute';
interface CapturedByStat { name: string; total: number; completed: number; closed: number; dispute: number }

function CapturedByStatsSection({
  items, kpis, onCardClick, onMetricClick, onGroupClick, showDebug,
}: {
  items: DefectForDashboard[];
  kpis: { total: number; actualDone: number; closureDone: number; inDisputeCount: number };
  onCardClick: (name: string) => void;
  onMetricClick: (name: string, metric: CapturedByMetric) => void;
  onGroupClick: (group: CapturedByGroup) => void;
  showDebug: boolean;
}) {
  const { stats, unknown, totals } = useMemo(() => {
    const map = new Map<string, CapturedByStat>();
    const unknown: CapturedByStat = { name: '__unknown__', total: 0, completed: 0, closed: 0, dispute: 0 };
    for (const it of items) {
      const raw = (it as any).captured_by_name as string | null | undefined;
      const name = raw && String(raw).trim() ? String(raw).trim() : null;
      const bucket = name ? (map.get(name) ?? { name, total: 0, completed: 0, closed: 0, dispute: 0 }) : unknown;
      bucket.total += 1;
      if (isActualComplete(it as any)) bucket.completed += 1;
      if (isClosureComplete(it as any)) bucket.closed += 1;
      if (String((it as any).closure_status ?? '') === 'InD') bucket.dispute += 1;
      if (name) map.set(name, bucket);
    }
    const stats = [...map.values()].sort((a, b) => b.total - a.total);
    const totals = stats.reduce((acc, s) => ({
      total: acc.total + s.total, completed: acc.completed + s.completed,
      closed: acc.closed + s.closed, dispute: acc.dispute + s.dispute,
    }), { total: 0, completed: 0, closed: 0, dispute: 0 });
    return { stats, unknown, totals };
  }, [items]);

  const checks = useMemo(() => {
    const rows = [
      { label: 'Total', sum: totals.total, kpi: kpis.total, unknown: unknown.total },
      { label: 'Completed', sum: totals.completed, kpi: kpis.actualDone, unknown: unknown.completed },
      { label: 'Closed', sum: totals.closed, kpi: kpis.closureDone, unknown: unknown.closed },
      { label: 'In Dispute', sum: totals.dispute, kpi: kpis.inDisputeCount, unknown: unknown.dispute },
    ].map((r) => ({ ...r, expected: r.kpi - r.unknown, delta: r.sum - (r.kpi - r.unknown) }));
    return rows;
  }, [totals, unknown, kpis]);

  const allOk = checks.every((c) => c.delta === 0);

  useEffect(() => {
    if (!showDebug || allOk) return;
    // eslint-disable-next-line no-console
    console.warn('[CapturedBy reconcile] Mismatch', checks);
  }, [showDebug, allOk, checks]);

  // Rows annotated with group (computed before any early return to keep hook order stable).
  const rowsWithGroup = useMemo(
    () => stats.map((s) => ({ ...s, group: (getCapturedByGroup(s.name) ?? 'Other') as CapturedByGroup })),
    [stats],
  );

  const groupTotals = useMemo(() => {
    const map = new Map<CapturedByGroup, { total: number; completed: number; closed: number; dispute: number }>();
    for (const r of rowsWithGroup) {
      const t = map.get(r.group) ?? { total: 0, completed: 0, closed: 0, dispute: 0 };
      t.total += r.total; t.completed += r.completed; t.closed += r.closed; t.dispute += r.dispute;
      map.set(r.group, t);
    }
    return map;
  }, [rowsWithGroup]);

  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'All' | CapturedByGroup>('All');
  const [nameFilter, setNameFilter] = useState<string[]>([]);
  type SortKey = 'name' | 'total' | 'completed' | 'closed' | 'dispute';
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'total', dir: 'desc' });

  const tabRows = useMemo(
    () => activeTab === 'All' ? rowsWithGroup : rowsWithGroup.filter((r) => r.group === activeTab),
    [rowsWithGroup, activeTab],
  );

  const visibleRows = useMemo(() => {
    const filtered = nameFilter.length ? tabRows.filter((r) => nameFilter.includes(r.name)) : tabRows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
      const k = sort.key;
      if (k === 'name') return a.name.localeCompare(b.name) * dir;
      return ((a[k] as number) - (b[k] as number)) * dir;
    });
    return sorted;
  }, [tabRows, nameFilter, sort]);

  const visibleTotals = useMemo(
    () => visibleRows.reduce(
      (acc, r) => ({
        total: acc.total + r.total, completed: acc.completed + r.completed,
        closed: acc.closed + r.closed, dispute: acc.dispute + r.dispute,
      }),
      { total: 0, completed: 0, closed: 0, dispute: 0 },
    ),
    [visibleRows],
  );

  if (stats.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">No "Captured By" data available.</p>
      </Card>
    );
  }

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const sortIcon = (key: SortKey) => sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '';

  const tabs: Array<'All' | CapturedByGroup> = ['All', ...CAPTURED_BY_GROUPS];
  const tabCount = (t: 'All' | CapturedByGroup) =>
    t === 'All' ? rowsWithGroup.length : rowsWithGroup.filter((r) => r.group === t).length;

  const fmtPct = (num: number, denom: number) => denom === 0 ? '—' : `${Math.round((num / denom) * 100)}%`;

  const toggleName = (n: string) =>
    setNameFilter((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
  const filtersActive = nameFilter.length > 0 || activeTab !== 'All';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <CardTitle className="text-base">Captured By — Defect Statistics</CardTitle>
        </button>
        <p className="text-xs text-muted-foreground tabular-nums">
          {stats.length} person{stats.length === 1 ? '' : 's'} · Unknown {unknown.total}
        </p>
      </CardHeader>
      {!collapsed && (
        <CardContent className="space-y-2 pt-0">
          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
            {tabs.map((t) => {
              const n = tabCount(t);
              const active = activeTab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setActiveTab(t); setNameFilter([]); }}
                  className={cn(
                    'rounded px-3 py-1 text-xs font-medium transition-colors',
                    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {t} <span className="ml-1 tabular-nums text-muted-foreground">({n})</span>
                </button>
              );
            })}
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="align-middle">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => toggleSort('name')} className="flex items-center gap-1 text-xs font-semibold hover:underline">
                        Name <span className="text-[10px] text-muted-foreground">{sortIcon('name')}</span>
                      </button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              'inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted/80',
                              nameFilter.length ? 'text-primary' : 'text-muted-foreground/60',
                            )}
                            title="Filter names"
                          >
                            <Filter className="h-3 w-3" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="max-h-72 w-56 overflow-auto p-2" align="start">
                          <div className="mb-1 flex items-center gap-2 px-1">
                            <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => setNameFilter(tabRows.map((r) => r.name))}>Select all</button>
                            <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => setNameFilter([])}>Clear all</button>
                          </div>
                          {tabRows.map((r) => (
                            <label key={r.name} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
                              <Checkbox checked={nameFilter.includes(r.name)} onCheckedChange={() => toggleName(r.name)} className="h-3.5 w-3.5" />
                              <span className="flex-1 truncate">{r.name}</span>
                              <span className="text-[10px] text-muted-foreground tabular-nums">{r.total}</span>
                            </label>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableHead>
                  {(['total', 'completed', 'closed', 'dispute'] as const).map((k) => (
                    <TableHead key={k} className="w-[140px] align-middle text-right">
                      <button type="button" onClick={() => toggleSort(k)} className="ml-auto flex items-center gap-1 text-xs font-semibold hover:underline">
                        {k === 'total' ? 'Total' : k === 'completed' ? 'Completed' : k === 'closed' ? 'Closed' : 'In Dispute'}
                        <span className="text-[10px] text-muted-foreground">{sortIcon(k)}</span>
                      </button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell className="py-1.5 text-xs">
                    {filtersActive ? `TOTAL (n=${visibleRows.length})` : `TOTAL (n=${visibleRows.length})`}
                  </TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums">{visibleTotals.total}</TableCell>
                  <TableCell className="py-1.5 text-right">
                    <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{visibleTotals.completed}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">{fmtPct(visibleTotals.completed, visibleTotals.total)}</span>
                  </TableCell>
                  <TableCell className="py-1.5 text-right">
                    <span className="tabular-nums text-primary">{visibleTotals.closed}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">{fmtPct(visibleTotals.closed, visibleTotals.total)}</span>
                  </TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums text-purple-700 dark:text-purple-300">{visibleTotals.dispute}</TableCell>
                </TableRow>
                {visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">No matches.</TableCell>
                  </TableRow>
                ) : visibleRows.map((r) => (
                  <TableRow key={r.name} className="cursor-pointer" onClick={() => onCardClick(r.name)}>
                    <TableCell className="py-1.5 text-xs font-medium text-foreground">{r.name}</TableCell>
                    <TableCell className="py-1.5 text-right">
                      <ClickNum value={r.total} onClick={() => onMetricClick(r.name, 'total')} />
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <button type="button" className={cn('tabular-nums hover:underline', r.completed === 0 ? 'text-muted-foreground/40' : 'font-semibold text-emerald-700 dark:text-emerald-400')} onClick={(e) => { e.stopPropagation(); onMetricClick(r.name, 'completed'); }}>{r.completed}</button>
                      <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">{fmtPct(r.completed, r.total)}</span>
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <button type="button" className={cn('tabular-nums hover:underline', r.closed === 0 ? 'text-muted-foreground/40' : 'font-semibold text-primary')} onClick={(e) => { e.stopPropagation(); onMetricClick(r.name, 'closed'); }}>{r.closed}</button>
                      <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">{fmtPct(r.closed, r.total)}</span>
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <button type="button" className={cn('tabular-nums hover:underline', r.dispute === 0 ? 'text-muted-foreground/40' : 'font-semibold text-purple-700 dark:text-purple-300')} onClick={(e) => { e.stopPropagation(); onMetricClick(r.name, 'dispute'); }}>{r.dispute}</button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className={cn(
            'rounded-md border p-2 text-xs',
            allOk ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300',
          )}>
            {allOk ? (
              <span className="font-medium">✓ All totals reconcile with summary cards (Unknown excluded: {unknown.total}).</span>
            ) : (
              <div className="space-y-0.5">
                <p className="font-medium">⚠ Reconciliation mismatch detected:</p>
                {checks.map((c) => (
                  <p key={c.label} className="tabular-nums">
                    {c.label}: Σ={c.sum} / KPI={c.kpi} (Unknown={c.unknown}, expected={c.expected}, Δ={c.delta > 0 ? '+' : ''}{c.delta})
                  </p>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function MiniMetric({ label, value, tone, onClick }: { label: string; value: number; tone?: 'emerald' | 'primary' | 'purple'; onClick: () => void }) {
  const toneCls = tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-400'
    : tone === 'primary' ? 'text-primary'
    : tone === 'purple' ? 'text-purple-700 dark:text-purple-300'
    : 'text-foreground';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="rounded px-1 py-0.5 transition-colors hover:bg-muted"
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('text-base font-bold tabular-nums', value === 0 && 'text-muted-foreground/40', value !== 0 && toneCls)}>{value}</p>
    </button>
  );
}
function DateButton({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8 gap-1 text-xs"><CalendarIcon className="h-3.5 w-3.5" />{formatDdMmm(value)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><Calendar mode="single" selected={new Date(value + 'T00:00:00')} onSelect={(d) => d && onChange(d.toISOString().slice(0, 10))} className={cn('p-3 pointer-events-auto')} /></PopoverContent></Popover>; }
function HeaderTotalNumber({ value, tone }: { value: number; tone?: 'done' | 'remain' | 'delay' }) { return <span className={cn('tabular-nums font-semibold', value === 0 ? 'text-muted-foreground/40' : tone === 'done' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'remain' ? 'text-amber-700 dark:text-amber-400' : tone === 'delay' ? 'text-destructive' : 'text-foreground')}>{value.toLocaleString()}</span>; }
function VarianceCell({ value, invert = false }: { value: number; invert?: boolean }) {
  if (value === 0) return <span className="text-muted-foreground/40 tabular-nums">0</span>;
  // invert=true (Difference 행): 양수=적체(빨강), 음수=빠름(초록)
  const positiveBad = invert;
  if (value > 0) return <span className={cn('tabular-nums', positiveBad ? 'font-semibold text-destructive' : 'text-green-700 dark:text-green-400')}>+{value}</span>;
  return <span className={cn('tabular-nums', positiveBad ? 'text-green-700 dark:text-green-400' : 'font-semibold text-destructive')}>{value}</span>;
}
function ClickNum({ value, onClick, hideZero = false }: { value: number; onClick?: () => void; hideZero?: boolean }) {
  if (hideZero && value === 0) return <span className="tabular-nums text-muted-foreground/40" />;
  return onClick
    ? <button
        type="button"
        className={cn(
          'tabular-nums hover:underline',
          value === 0 && 'text-muted-foreground/40',
          value !== 0 && 'underline decoration-dotted decoration-muted-foreground/30 underline-offset-2 hover:decoration-foreground'
        )}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
      >{value}</button>
    : <span className={cn('tabular-nums', value === 0 && 'text-muted-foreground/40')}>{value}</span>;
}
function ClickVariance({ value, invert = false, onClick }: { value: number; invert?: boolean; onClick?: () => void }) {
  if (!onClick) return <VarianceCell value={value} invert={invert} />;
  return (
    <button type="button" className="hover:underline" onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <VarianceCell value={value} invert={invert} />
    </button>
  );
}
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
  planMode = 'baseline',
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
  planMode?: 'baseline' | 'remaining';
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
                  <TableHead key={`${label}-${i}`} className={cn('h-8 text-center text-[11px]', [0, 3, 7].includes(i) && 'border-l border-border')}>
                    {label === 'Plan' ? (
                      <span>Plan<span className="ml-0.5 text-[9px] text-muted-foreground">({planMode === 'remaining' ? 'remaining' : 'baseline'})</span></span>
                    ) : label}
                  </TableHead>
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
                        <TableCell className="px-2 py-1.5 text-right text-xs">
                          <ClickVariance
                            value={dataDateDelta}
                            invert={isDiff}
                            onClick={
                              isDiff
                                ? rowClick
                                : dataDateDelta < 0
                                  ? () => go(row.key, { dueOn: dataDate, stage: stage.stage })
                                  : dataDateDelta > 0
                                    ? () => go(row.key, { unplannedActualOn: dataDate, stage: stage.stage })
                                    : undefined
                            }
                          />
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs font-semibold text-destructive">
                          <ClickNum value={metrics.dataDateDelay} hideZero onClick={isDiff ? rowClick : () => go(row.key, { dueOn: dataDate, stage: stage.stage })} />
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
                        <TableCell className="px-2 py-1.5 text-right text-xs">
                          <ClickVariance
                            value={todayDelta}
                            invert={isDiff}
                            onClick={
                              isDiff
                                ? rowClick
                                : todayDelta < 0
                                  ? () => go(row.key, { dueOn: today, stage: stage.stage })
                                  : todayDelta > 0
                                    ? () => go(row.key, { unplannedActualOn: today, stage: stage.stage })
                                    : undefined
                            }
                          />
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-right text-xs font-semibold text-destructive">
                          <ClickNum value={metrics.todayDelay} hideZero onClick={isDiff ? rowClick : () => go(row.key, { dueOn: today, stage: stage.stage })} />
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

function SCurveToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SCurveKpiStrip({ scurve, today, stage, windowStart, windowEnd }: {
  scurve: DefectSCurveResult;
  today: string;
  stage: DefectScheduleStage;
  windowStart: string;
  windowEnd: string;
}) {
  const idx = scurve.todayIndex >= 0 ? scurve.todayIndex : scurve.buckets.length - 1;
  const plan = scurve.total.plan[idx] ?? 0;
  const actual = scurve.total.actual[idx] ?? 0;
  const delta = (actual ?? 0) - plan;
  const pct = plan > 0 ? (delta / plan) * 100 : 0;
  const stageLabel = stage === 'start' ? 'Start' : stage === 'completion' ? 'Completion' : 'Closure';
  const sign = delta > 0 ? '+' : '';
  const accentClass = delta < 0 ? 'text-destructive' : delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground';
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Stage</span>
        <span className="text-sm font-semibold">{stageLabel}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Plan (cum)</span>
        <span className="text-sm font-semibold tabular-nums">{plan.toLocaleString()}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Actual (cum)</span>
        <span className="text-sm font-semibold tabular-nums">{(actual ?? 0).toLocaleString()}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Δ Variance</span>
        <span className={cn('text-sm font-semibold tabular-nums', accentClass)}>
          {sign}{delta.toLocaleString()} <span className="text-[10px] font-normal">({sign}{pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="ml-auto flex flex-col text-right">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Today / Window</span>
        <span className="text-xs">{formatDdMmm(today)} · {formatDdMmm(windowStart)} ~ {formatDdMmm(windowEnd)}</span>
      </div>
    </div>
  );
}

function SCurveCharts({ scurve, today, hidden, onToggleSeries, onBucketClick }: {
  scurve: DefectSCurveResult;
  today: string;
  hidden: Set<string>;
  onToggleSeries: (key: string) => void;
  onBucketClick: (bucketIso: string) => void;
}) {
  const showGroupsForData = scurve.groups.length > 0;
  // Build chart data row per bucket — each series exposes its own keys for line chart.
  // In group mode, omit total* fields so Recharts' Y-axis auto-domain is driven only by
  // the visible per-group lines (otherwise the unfiltered total inflates the scale and
  // visually flattens the group lines to the X axis).
  const data = scurve.bucketLabels.map((label, i) => {
    const row: Record<string, any> = {
      bucket: scurve.buckets[i],
      bucketLabel: label,
      __isFuture: scurve.todayIndex >= 0 && i > scurve.todayIndex,
    };
    if (!showGroupsForData) {
      const prevPlan = i > 0 ? (scurve.total.plan[i - 1] ?? 0) : 0;
      const planInc = (scurve.total.plan[i] ?? 0) - prevPlan;
      const curActual = scurve.total.actual[i];
      const prevActual = i > 0 ? scurve.total.actual[i - 1] : 0;
      const actualInc = curActual == null ? null : (curActual - (prevActual ?? 0));
      row.totalPlan = scurve.total.plan[i];
      row.totalActual = scurve.total.actual[i];
      row.variance = scurve.total.variance[i];
      row.planInc = planInc;
      row.actualInc = actualInc;
    } else {
      // Group mode: daily bars + variance use the sum of the selected group series so
      // they stay consistent with the KPI strip and the visible cumulative lines.
      let planSum = 0;
      let actualSum = 0;
      let anyActualNull = false;
      for (const g of scurve.groups) {
        planSum += g.plan[i] ?? 0;
        const a = g.actual[i];
        if (a == null) anyActualNull = true; else actualSum += a;
      }
      const prevPlanSum = i > 0
        ? scurve.groups.reduce((s, g) => s + (g.plan[i - 1] ?? 0), 0)
        : 0;
      const prevActualSum = i > 0
        ? scurve.groups.reduce((s, g) => s + (g.actual[i - 1] ?? 0), 0)
        : 0;
      const planInc = planSum - prevPlanSum;
      const actualInc = anyActualNull ? null : (actualSum - prevActualSum);
      row.planInc = planInc;
      row.actualInc = actualInc;
      row.variance = anyActualNull ? null : (actualInc! - planInc);
    }
    scurve.groups.forEach((g) => {
      row[`g_plan_${g.key}`] = g.plan[i];
      row[`g_actual_${g.key}`] = g.actual[i];
    });
    return row;
  });

  const todayLabel = (() => {
    const idx = scurve.todayIndex;
    if (idx < 0) return null;
    return scurve.bucketLabels[idx] ?? null;
  })();

  const showGroups = scurve.groups.length > 0;

  const lineCfg: ChartConfig = {
    planInc: { label: 'Plan (daily)', color: 'hsl(var(--muted-foreground))' },
    actualInc: { label: 'Actual (daily)', color: 'hsl(var(--primary))' },
    totalPlan: { label: 'Plan (cum)', color: 'hsl(var(--muted-foreground))' },
    totalActual: { label: 'Actual (cum)', color: 'hsl(var(--primary))' },
    ...Object.fromEntries(scurve.groups.flatMap((g, i) => [
      [`g_plan_${g.key}`, { label: `${g.label} Plan`, color: GROUP_LINE_COLORS[i % GROUP_LINE_COLORS.length] }],
      [`g_actual_${g.key}`, { label: `${g.label} Actual`, color: GROUP_LINE_COLORS[i % GROUP_LINE_COLORS.length] }],
    ])),
  } as ChartConfig;

  const varianceCfg: ChartConfig = {
    variance: { label: 'Δ Actual − Plan', color: 'hsl(var(--destructive))' },
  };

  return (
    <div className="space-y-2">
      {/* Cumulative lines */}
      <ChartContainer config={lineCfg} className="h-[300px] w-full">
        <ComposedChart data={data} margin={{ left: 12, right: 16, top: 8, bottom: 0 }}
          onClick={(e: any) => { if (e?.activeLabel) {
            const idx = scurve.bucketLabels.indexOf(e.activeLabel);
            if (idx >= 0) onBucketClick(scurve.buckets[idx]);
          } }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bucketLabel" tick={{ fontSize: 10 }} minTickGap={20} />
          <YAxis yAxisId="cum" tick={{ fontSize: 11 }} allowDecimals={false} domain={['auto', 'auto']} />
          <YAxis yAxisId="bar" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} domain={['auto', 'auto']} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            onClick={(o: any) => o?.dataKey && onToggleSeries(String(o.dataKey))}
          />
          {todayLabel && (
            <ReferenceLine yAxisId="cum" x={todayLabel} stroke="hsl(var(--destructive))" strokeDasharray="4 2" label={{ value: 'Today', fontSize: 10, fill: 'hsl(var(--destructive))' }} />
          )}
          <Bar yAxisId="bar" dataKey="planInc" fill="hsla(0, 0%, 50%, 0.35)" name={showGroups ? 'Plan (daily, sum)' : 'Plan (daily)'} hide={hidden.has('planInc')} barSize={6} />
          <Bar yAxisId="bar" dataKey="actualInc" fill="hsla(217, 91%, 60%, 0.55)" name={showGroups ? 'Actual (daily, sum)' : 'Actual (daily)'} hide={hidden.has('actualInc')} barSize={6} />

          {!showGroups && (
            <>
              <Line yAxisId="cum" type="monotone" dataKey="totalPlan" stroke="var(--color-totalPlan)" strokeDasharray="5 3" strokeWidth={2} dot={false} name="Plan (cum)" hide={hidden.has('totalPlan')} />
              <Line yAxisId="cum" type="monotone" dataKey="totalActual" stroke="var(--color-totalActual)" strokeWidth={2.5} dot={false} name="Actual (cum)" hide={hidden.has('totalActual')} connectNulls={false} />
            </>
          )}
          {showGroups && scurve.groups.map((g, i) => (
            <Line
              key={`plan-${g.key}`}
              yAxisId="cum"
              type="monotone"
              dataKey={`g_plan_${g.key}`}
              stroke={GROUP_LINE_COLORS[i % GROUP_LINE_COLORS.length]}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              dot={false}
              name={`${g.label} Plan`}
              hide={hidden.has(`g_plan_${g.key}`)}
            />
          ))}
          {showGroups && scurve.groups.map((g, i) => (
            <Line
              key={`actual-${g.key}`}
              yAxisId="cum"
              type="monotone"
              dataKey={`g_actual_${g.key}`}
              stroke={GROUP_LINE_COLORS[i % GROUP_LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              name={`${g.label} Actual`}
              hide={hidden.has(`g_actual_${g.key}`)}
              connectNulls={false}
            />
          ))}
        </ComposedChart>
      </ChartContainer>

      {/* Variance bars (total only) */}
      <ChartContainer config={varianceCfg} className="h-[140px] w-full">
        <ComposedChart data={data} margin={{ left: 12, right: 16, top: 4, bottom: 0 }}
          onClick={(e: any) => { if (e?.activeLabel) {
            const idx = scurve.bucketLabels.indexOf(e.activeLabel);
            if (idx >= 0) onBucketClick(scurve.buckets[idx]);
          } }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bucketLabel" tick={{ fontSize: 10 }} minTickGap={20} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} domain={['auto', 'auto']} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {todayLabel && <ReferenceLine x={todayLabel} stroke="hsl(var(--destructive))" strokeDasharray="4 2" />}
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Bar dataKey="variance" name="Δ Actual − Plan" barSize={8}>
            {data.map((row, i) => (
              <Cell key={i} fill={row.variance == null ? 'hsl(var(--muted))' : (row.variance < 0 ? 'hsl(var(--destructive))' : 'hsl(160 60% 45%)')} />
            ))}
          </Bar>
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

// ─── All-Stage variants ─────────────────────────────────────────────────────

const STAGE_COLORS: Record<DefectScheduleStage, { line: string; bar: string }> = {
  start:      { line: 'hsl(217, 91%, 60%)',  bar: 'hsla(217, 91%, 60%, 0.45)' },
  completion: { line: 'hsl(38, 92%, 50%)',   bar: 'hsla(38, 92%, 50%, 0.45)'  },
  closure:    { line: 'hsl(160, 60%, 45%)',  bar: 'hsla(160, 60%, 45%, 0.45)' },
};

function SCurveAllKpiStrip({ scurveAll, today, windowStart, windowEnd }: {
  scurveAll: DefectSCurveAllResult;
  today: string;
  windowStart: string;
  windowEnd: string;
}) {
  const idx = scurveAll.todayIndex >= 0 ? scurveAll.todayIndex : scurveAll.buckets.length - 1;
  const stages: DefectScheduleStage[] = ['start', 'completion', 'closure'];
  const labels: Record<DefectScheduleStage, string> = { start: 'Start', completion: 'Completion', closure: 'Closure' };
  return (
    <div className="flex flex-wrap items-stretch gap-2 rounded-md border bg-muted/30 px-3 py-2">
      {stages.map((s) => {
        const series = scurveAll.byStage[s];
        const plan = series.plan[idx] ?? 0;
        const actual = series.actual[idx] ?? 0;
        const delta = (actual ?? 0) - plan;
        const pct = plan > 0 ? (delta / plan) * 100 : 0;
        const sign = delta > 0 ? '+' : '';
        const accent = delta < 0 ? 'text-destructive' : delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground';
        return (
          <div key={s} className="flex flex-col gap-0.5 rounded border-l-4 px-3 py-1" style={{ borderLeftColor: STAGE_COLORS[s].line }}>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{labels[s]}</span>
            <span className="text-xs tabular-nums">
              <span className="text-muted-foreground">P</span> {plan.toLocaleString()} · <span className="text-muted-foreground">A</span> {(actual ?? 0).toLocaleString()}
            </span>
            <span className={cn('text-xs font-semibold tabular-nums', accent)}>
              Δ {sign}{delta.toLocaleString()} ({sign}{pct.toFixed(1)}%)
            </span>
          </div>
        );
      })}
      <div className="ml-auto flex flex-col text-right">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Today / Window</span>
        <span className="text-xs">{formatDdMmm(today)} · {formatDdMmm(windowStart)} ~ {formatDdMmm(windowEnd)}</span>
      </div>
    </div>
  );
}

function SCurveChartsAllStages({ scurveAll, onBucketClick }: {
  scurveAll: DefectSCurveAllResult;
  onBucketClick: (bucketIso: string) => void;
}) {
  const stages: DefectScheduleStage[] = ['start', 'completion', 'closure'];
  const stageLabel: Record<DefectScheduleStage, string> = { start: 'Start', completion: 'Comp', closure: 'Close' };

  // Detect group mode: any stage has at least one per-group series.
  const groupKeys: string[] = (() => {
    const seen = new Set<string>();
    for (const s of stages) for (const g of scurveAll.byStageGroups[s]) seen.add(g.key);
    return Array.from(seen);
  })();
  const isGroupMode = groupKeys.length > 0;

  // Build a label lookup per group key (use the first stage that has it).
  const groupLabelByKey = new Map<string, string>();
  for (const s of stages) {
    for (const g of scurveAll.byStageGroups[s]) {
      if (!groupLabelByKey.has(g.key)) groupLabelByKey.set(g.key, g.label);
    }
  }

  const data = scurveAll.bucketLabels.map((label, i) => {
    const row: Record<string, any> = {
      bucket: scurveAll.buckets[i],
      bucketLabel: label,
      __isFuture: scurveAll.todayIndex >= 0 && i > scurveAll.todayIndex,
    };
    if (!isGroupMode) {
      // Non-group mode: per-stage totals + daily increments + variance.
      for (const s of stages) {
        const series = scurveAll.byStage[s];
        const prevPlan = i > 0 ? (series.plan[i - 1] ?? 0) : 0;
        const planInc = (series.plan[i] ?? 0) - prevPlan;
        const cur = series.actual[i];
        const prev = i > 0 ? series.actual[i - 1] : 0;
        const actualInc = cur == null ? null : (cur - (prev ?? 0));
        row[`planInc_${s}`] = planInc;
        row[`actualInc_${s}`] = actualInc;
        row[`cumPlan_${s}`] = series.plan[i];
        row[`cumActual_${s}`] = series.actual[i];
        row[`variance_${s}`] = series.variance[i];
      }
    } else {
      // Group mode: per stage × per group cumulative lines + Stage-level daily bars (sum of selected groups).
      // Variance = sum of selected groups per stage.
      for (const s of stages) {
        let planSum = 0;
        let actualSum = 0;
        let anyActualNull = false;
        for (const g of scurveAll.byStageGroups[s]) {
          row[`gp_${s}_${g.key}`] = g.plan[i];
          row[`ga_${s}_${g.key}`] = g.actual[i];
          planSum += g.plan[i] ?? 0;
          const a = g.actual[i];
          if (a == null) anyActualNull = true; else actualSum += a;
        }
        const prevPlanSum = i > 0
          ? scurveAll.byStageGroups[s].reduce((sum, g) => sum + (g.plan[i - 1] ?? 0), 0)
          : 0;
        const prevActualSum = i > 0
          ? scurveAll.byStageGroups[s].reduce((sum, g) => sum + (g.actual[i - 1] ?? 0), 0)
          : 0;
        const planInc = planSum - prevPlanSum;
        row[`planInc_${s}`] = planInc;
        row[`actualInc_${s}`] = anyActualNull ? null : (actualSum - prevActualSum);
        row[`variance_${s}`] = anyActualNull ? null : ((actualSum - prevActualSum) - planInc);
      }
    }
    return row;
  });

  const todayLabel = scurveAll.todayIndex >= 0 ? (scurveAll.bucketLabels[scurveAll.todayIndex] ?? null) : null;

  const cfg: ChartConfig = isGroupMode
    ? Object.fromEntries([
        ...stages.flatMap((s) => [
          [`planInc_${s}`,   { label: `${stageLabel[s]} Plan (daily)`,   color: STAGE_COLORS[s].bar }],
          [`actualInc_${s}`, { label: `${stageLabel[s]} Actual (daily)`, color: STAGE_COLORS[s].line }],
        ]),
        ...stages.flatMap((s) =>
          groupKeys.flatMap((gk) => {
            const color = STAGE_COLORS[s].line;
            const gLabel = groupLabelByKey.get(gk) ?? gk;
            return [
              [`gp_${s}_${gk}`, { label: `${stageLabel[s]} · ${gLabel} Plan`,   color }],
              [`ga_${s}_${gk}`, { label: `${stageLabel[s]} · ${gLabel} Actual`, color }],
            ];
          }),
        ),
      ]) as ChartConfig
    : (Object.fromEntries(stages.flatMap((s) => [
        [`planInc_${s}`,    { label: `${stageLabel[s]} Plan (daily)`,    color: STAGE_COLORS[s].bar }],
        [`actualInc_${s}`,  { label: `${stageLabel[s]} Actual (daily)`,  color: STAGE_COLORS[s].line }],
        [`cumPlan_${s}`,    { label: `${stageLabel[s]} Plan (cum)`,      color: STAGE_COLORS[s].line }],
        [`cumActual_${s}`,  { label: `${stageLabel[s]} Actual (cum)`,    color: STAGE_COLORS[s].line }],
      ])) as ChartConfig);

  const varianceCfg: ChartConfig = Object.fromEntries(stages.map((s) => [
    `variance_${s}`, { label: `${stageLabel[s]} Δ`, color: STAGE_COLORS[s].line },
  ])) as ChartConfig;

  // Group stroke pattern in group mode: differentiate groups by dash style (color encodes stage).
  const GROUP_DASH: (string | undefined)[] = [
    undefined,    // 1st group: solid
    '6 3',        // 2nd: long dash
    '2 3',        // 3rd: dotted
    '8 3 2 3',    // 4th: dash-dot
    '4 2 2 2',    // 5th
    '10 4',       // 6th
  ];

  return (
    <div className="space-y-2">
      {/* Cumulative lines + (non-group only) stacked daily bars */}
      <ChartContainer config={cfg} className="h-[340px] w-full">
        <ComposedChart data={data} margin={{ left: 12, right: 16, top: 8, bottom: 0 }}
          onClick={(e: any) => { if (e?.activeLabel) {
            const idx = scurveAll.bucketLabels.indexOf(e.activeLabel);
            if (idx >= 0) onBucketClick(scurveAll.buckets[idx]);
          } }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bucketLabel" tick={{ fontSize: 10 }} minTickGap={20} />
          <YAxis yAxisId="cum" tick={{ fontSize: 11 }} allowDecimals={false} domain={['auto', 'auto']} />
          <YAxis yAxisId="bar" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} domain={['auto', 'auto']} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {todayLabel && (
            <ReferenceLine yAxisId="cum" x={todayLabel} stroke="hsl(var(--destructive))" strokeDasharray="4 2" label={{ value: 'Today', fontSize: 10, fill: 'hsl(var(--destructive))' }} />
          )}
          {stages.map((s) => (
            <Bar key={`plan-${s}`} yAxisId="bar" dataKey={`planInc_${s}`} stackId="plan" fill={STAGE_COLORS[s].bar} name={`${stageLabel[s]} Plan (daily)`} barSize={10} />
          ))}
          {stages.map((s) => (
            <Bar key={`actual-${s}`} yAxisId="bar" dataKey={`actualInc_${s}`} stackId="actual" fill={STAGE_COLORS[s].line} name={`${stageLabel[s]} Actual (daily)`} barSize={10} />
          ))}
          {!isGroupMode && (
            <>
              {stages.map((s) => (
                <Line key={`cumPlan-${s}`} yAxisId="cum" type="monotone" dataKey={`cumPlan_${s}`} stroke={STAGE_COLORS[s].line} strokeDasharray="5 3" strokeWidth={1.5} dot={false} name={`${stageLabel[s]} Plan (cum)`} />
              ))}
              {stages.map((s) => (
                <Line key={`cumActual-${s}`} yAxisId="cum" type="monotone" dataKey={`cumActual_${s}`} stroke={STAGE_COLORS[s].line} strokeWidth={2.5} dot={false} name={`${stageLabel[s]} Actual (cum)`} connectNulls={false} />
              ))}
            </>
          )}
          {isGroupMode && stages.flatMap((s) =>
            groupKeys.flatMap((gk, idx) => {
              const stageColor = STAGE_COLORS[s].line;
              const gLabel = groupLabelByKey.get(gk) ?? gk;
              const dash = GROUP_DASH[idx % GROUP_DASH.length];
              return [
                <Line
                  key={`gp-${s}-${gk}`}
                  yAxisId="cum"
                  type="monotone"
                  dataKey={`gp_${s}_${gk}`}
                  stroke={stageColor}
                  strokeDasharray={dash}
                  strokeOpacity={0.85}
                  strokeWidth={1.75}
                  dot={false}
                  name={`${stageLabel[s]} · ${gLabel} Plan`}
                />,
                <Line
                  key={`ga-${s}-${gk}`}
                  yAxisId="cum"
                  type="monotone"
                  dataKey={`ga_${s}_${gk}`}
                  stroke={stageColor}
                  strokeDasharray={dash}
                  strokeWidth={2}
                  dot={false}
                  name={`${stageLabel[s]} · ${gLabel} Actual`}
                  connectNulls={false}
                />,
              ];
            })
          )}
        </ComposedChart>
      </ChartContainer>

      {/* Variance bars per stage (grouped) — sum of selected groups in group mode */}
      <ChartContainer config={varianceCfg} className="h-[160px] w-full">
        <ComposedChart data={data} margin={{ left: 12, right: 16, top: 4, bottom: 0 }}
          onClick={(e: any) => { if (e?.activeLabel) {
            const idx = scurveAll.bucketLabels.indexOf(e.activeLabel);
            if (idx >= 0) onBucketClick(scurveAll.buckets[idx]);
          } }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bucketLabel" tick={{ fontSize: 10 }} minTickGap={20} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} domain={['auto', 'auto']} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {todayLabel && <ReferenceLine x={todayLabel} stroke="hsl(var(--destructive))" strokeDasharray="4 2" />}
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {stages.map((s) => (
            <Bar key={`var-${s}`} dataKey={`variance_${s}`} fill={STAGE_COLORS[s].line} name={`${stageLabel[s]} Δ`} barSize={6} />
          ))}
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}


