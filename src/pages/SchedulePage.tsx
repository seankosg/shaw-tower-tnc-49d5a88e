import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, AlertTriangle, TrendingUp, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { todayIso, type SubtestForDashboard } from '@/lib/dashboard-utils';
import {
  aggregateSchedule, findCritical, findLaggingGroups, addDays,
  type ScheduleBucket, type ScheduleGroupBy, type ScheduleStageFilter,
  type ScheduleStage, type CriticalItem,
} from '@/lib/schedule-utils';
import { ScheduleMatrix } from '@/components/schedule/ScheduleMatrix';
import { CriticalWatchlist } from '@/components/schedule/CriticalWatchlist';
import { getScheduleCache, setScheduleCache } from '@/lib/schedule-cache';

const GROUP_LABELS: Record<ScheduleGroupBy, string> = {
  system: 'System',
  subcon: 'Subcontractor',
  subsub: 'Sub-Sub',
};

export default function SchedulePage() {
  const navigate = useNavigate();
  // Stabilize today across renders so memos don't re-run unnecessarily
  const today = useMemo(() => todayIso(), []);

  const [groupBy, setGroupBy] = useState<ScheduleGroupBy>('system');
  const [bucket, setBucket] = useState<ScheduleBucket>('day');
  const [stageFilter, setStageFilter] = useState<ScheduleStageFilter>('all');
  const [rangeDays, setRangeDays] = useState<number>(60);

  // Hydrate from cache for instant render
  const cached = useMemo(() => getScheduleCache(), []);
  const [subtests, setSubtests] = useState<SubtestForDashboard[]>(cached.data?.subtests ?? []);
  const [systems, setSystems] = useState<{ id: string; system_code: string }[]>(cached.data?.systems ?? []);
  const [loading, setLoading] = useState(!cached.data);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let all: SubtestForDashboard[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data } = await supabase
          .from('subtests')
          .select('id, item_no, mos_code, system_id, subcontractor_name, subsub_name, hdec_pic_name, t1_status, t2_status, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date, predecessor_status_raw, pred_status, pred_planned_date, pred_actual_date' as any)
          .eq('is_active', true)
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data as any);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const sysRes = await supabase.from('system_master').select('id, system_code').eq('is_active', true);
      if (!cancelled) {
        const sysList = sysRes.data ?? [];
        setSubtests(all);
        setSystems(sysList);
        setScheduleCache({ subtests: all, systems: sysList });
        setLoading(false);
      }
    }
    // If cache is fresh, skip fetch entirely
    if (cached.fresh) {
      setLoading(false);
      return;
    }
    load();
    return () => { cancelled = true; };
  }, [cached.fresh]);

  const sysCodeById = useMemo(() => {
    const m = new Map<string, string>();
    systems.forEach(s => m.set(s.id, s.system_code));
    return m;
  }, [systems]);

  // Range: from -14 days (history) to +rangeDays from today
  const rangeStart = useMemo(() => addDays(today, -14), [today]);
  const rangeEnd = useMemo(() => addDays(today, rangeDays), [today, rangeDays]);

  const aggregate = useMemo(
    () => aggregateSchedule(subtests, {
      groupBy, bucket, stageFilter,
      rangeStart, rangeEnd, sysCodeById,
    }),
    [subtests, groupBy, bucket, stageFilter, rangeStart, rangeEnd, sysCodeById],
  );

  const critical = useMemo(
    () => findCritical(subtests, today, 7, sysCodeById, groupBy),
    [subtests, today, sysCodeById, groupBy],
  );

  const lagging = useMemo(() => findLaggingGroups(aggregate.rows, 5), [aggregate.rows]);

  const kpis = useMemo(() => {
    let todayPlan = 0, todayActual = 0, cumPlan = 0, cumActual = 0;
    for (const r of aggregate.rows) {
      cumPlan += r.cumPlan;
      cumActual += r.cumActual;
      const todayCell = r.combined.find(c => c.bucket === today);
      if (todayCell) {
        todayPlan += todayCell.plan;
        todayActual += todayCell.actual;
      }
    }
    const variance = cumPlan ? ((cumActual - cumPlan) / cumPlan) * 100 : 0;
    const overdue = subtests.filter(s =>
      (s.t1_planned_date && s.t1_planned_date < today && s.t1_status !== 'Done') ||
      (s.t2_planned_date && s.t2_planned_date < today && s.t2_status !== 'Done')
    ).length;
    return { todayPlan, todayActual, cumPlan, cumActual, variance, criticalCount: critical.highRisk.length, overdue };
  }, [aggregate.rows, today, subtests, critical.highRisk.length]);

  // ───── Navigation handlers ─────
  const filterParamForGroup = (label: string): { key: string; value: string } => {
    const key = groupBy === 'system' ? 'system' : groupBy === 'subcon' ? 'subcon' : 'subsub';
    return { key, value: label };
  };

  const goSubtests = (params: Record<string, string>) => {
    const sp = new URLSearchParams(params);
    navigate(`/?${sp.toString()}`);
  };

  const handleCellClick = (groupKey: string, _bucketIso: string, stage: ScheduleStage | 'all') => {
    const { key, value } = filterParamForGroup(groupKey);
    const params: Record<string, string> = { [key]: value };
    if (stage === 't1' || stage === 't2') params[`${stage}_status`] = 'Planned';
    goSubtests(params);
  };

  const handleCriticalClick = (item: CriticalItem) => {
    goSubtests({ system: item.systemCode, [`${item.stage}_status`]: item.status ?? 'Planned' });
  };

  const handleGroupClick = (label: string) => {
    const { key, value } = filterParamForGroup(label);
    goSubtests({ [key]: value });
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Calendar className="h-5 w-5 text-primary" />
            Schedule Matrix
          </h1>
          <p className="text-xs text-muted-foreground">
            Plan vs Actual by {GROUP_LABELS[groupBy]} · {bucket === 'day' ? 'Daily' : 'Weekly'} · Today {today}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <ToolbarGroup label="Group">
            <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as ScheduleGroupBy)}>
              <TabsList className="h-8">
                <TabsTrigger value="system" className="h-6 px-2 text-xs">System</TabsTrigger>
                <TabsTrigger value="subcon" className="h-6 px-2 text-xs">Subcon</TabsTrigger>
                <TabsTrigger value="subsub" className="h-6 px-2 text-xs">Sub-Sub</TabsTrigger>
              </TabsList>
            </Tabs>
          </ToolbarGroup>

          <ToolbarGroup label="Bucket">
            <Tabs value={bucket} onValueChange={(v) => setBucket(v as ScheduleBucket)}>
              <TabsList className="h-8">
                <TabsTrigger value="day" className="h-6 px-2 text-xs">Day</TabsTrigger>
                <TabsTrigger value="week" className="h-6 px-2 text-xs">Week</TabsTrigger>
              </TabsList>
            </Tabs>
          </ToolbarGroup>

          <ToolbarGroup label="Stage">
            <Tabs value={stageFilter} onValueChange={(v) => setStageFilter(v as ScheduleStageFilter)}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="h-6 px-2 text-xs">All</TabsTrigger>
                <TabsTrigger value="pred" className="h-6 px-2 text-xs">Pred</TabsTrigger>
                <TabsTrigger value="t1" className="h-6 px-2 text-xs">T1</TabsTrigger>
                <TabsTrigger value="t2" className="h-6 px-2 text-xs">T2</TabsTrigger>
              </TabsList>
            </Tabs>
          </ToolbarGroup>

          <ToolbarGroup label="Range">
            <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </ToolbarGroup>

          <div className="ml-auto flex items-center gap-3 text-xs">
            <Legend />
          </div>
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <Kpi label="Today Plan" value={kpis.todayPlan} icon={<Calendar className="h-3.5 w-3.5" />} />
        <Kpi label="Today Actual" value={kpis.todayActual}
          accent={kpis.todayActual < kpis.todayPlan ? 'short' : kpis.todayActual > kpis.todayPlan ? 'over' : undefined}
          icon={<Activity className="h-3.5 w-3.5" />} />
        <Kpi label="Cum Plan" value={kpis.cumPlan} />
        <Kpi label="Cum Actual" value={kpis.cumActual}
          accent={kpis.cumActual < kpis.cumPlan ? 'short' : kpis.cumActual > kpis.cumPlan ? 'over' : undefined} />
        <Kpi label="Variance"
          value={`${kpis.variance >= 0 ? '+' : ''}${kpis.variance.toFixed(1)}%`}
          accent={kpis.variance < 0 ? 'short' : kpis.variance > 0 ? 'over' : undefined}
          icon={<TrendingUp className="h-3.5 w-3.5" />} />
        <Kpi label="Critical (≤7d)" value={kpis.criticalCount}
          accent={kpis.criticalCount > 0 ? 'short' : undefined}
          icon={<AlertTriangle className="h-3.5 w-3.5" />} />
        <Kpi label="Overdue" value={kpis.overdue}
          accent={kpis.overdue > 0 ? 'short' : undefined} />
      </div>

      {/* Matrix + Watchlist */}
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          {loading ? (
            <Skeleton className="h-[500px] w-full" />
          ) : (
            <ScheduleMatrix
              data={aggregate}
              bucket={bucket}
              stageFilter={stageFilter}
              today={today}
              groupHeader={GROUP_LABELS[groupBy]}
              onCellClick={handleCellClick}
            />
          )}
        </div>
        {!loading && (
          <CriticalWatchlist
            highRisk={critical.highRisk}
            t1Bottleneck={critical.t1Bottleneck}
            lagging={lagging}
            onItemClick={handleCriticalClick}
            onGroupClick={handleGroupClick}
          />
        )}
      </div>
    </div>
  );
}

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Kpi({ label, value, accent, icon }: {
  label: string;
  value: number | string;
  accent?: 'short' | 'over';
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-0.5 p-2.5">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {icon}{label}
        </div>
        <div className={cn(
          'text-lg font-semibold tabular-nums leading-tight',
          accent === 'short' && 'text-schedule-short',
          accent === 'over' && 'text-schedule-over',
        )}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
      <LegendDot color="bg-schedule-plan" label="Plan" />
      <LegendDot color="bg-schedule-actual" label="Actual" />
      <LegendDot color="bg-schedule-over" label="Over" />
      <LegendDot color="bg-schedule-short" label="Short" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('inline-block h-2 w-3 rounded-sm', color)} />
      {label}
    </span>
  );
}
