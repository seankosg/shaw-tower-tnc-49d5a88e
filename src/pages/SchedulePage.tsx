import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, AlertTriangle, TrendingUp, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
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
  const [hidePast, setHidePast] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('schedule_hide_past') === '1';
  });

  useEffect(() => {
    localStorage.setItem('schedule_hide_past', hidePast ? '1' : '0');
  }, [hidePast]);

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
      rangeStart, rangeEnd, today, sysCodeById,
    }),
    [subtests, groupBy, bucket, stageFilter, rangeStart, rangeEnd, today, sysCodeById],
  );

  const critical = useMemo(
    () => findCritical(subtests, today, 7, sysCodeById, groupBy),
    [subtests, today, sysCodeById, groupBy],
  );

  const lagging = useMemo(() => findLaggingGroups(aggregate.rows, 5), [aggregate.rows]);

  // Past-date hiding: slice buckets/cells to only today-and-future
  const visibleData = useMemo(() => {
    if (!hidePast) return aggregate;
    const startIdx = aggregate.buckets.findIndex(b => b >= today);
    if (startIdx <= 0) return aggregate;
    const buckets = aggregate.buckets.slice(startIdx);
    const rows = aggregate.rows.map(r => ({
      ...r,
      combined: r.combined.slice(startIdx),
      stages: {
        pred: { ...r.stages.pred, cells: r.stages.pred.cells.slice(startIdx) },
        t1:   { ...r.stages.t1,   cells: r.stages.t1.cells.slice(startIdx) },
        t2:   { ...r.stages.t2,   cells: r.stages.t2.cells.slice(startIdx) },
      },
    }));
    return { ...aggregate, buckets, rows };
  }, [aggregate, hidePast, today]);

  const kpis = useMemo(() => {
    let cumPlan = 0, cumActual = 0;
    for (const r of aggregate.rows) {
      cumPlan += r.cumPlan;
      cumActual += r.cumActual;
    }
    const variance = cumPlan ? ((cumActual - cumPlan) / cumPlan) * 100 : 0;
    const progressPct = cumPlan ? (cumActual / cumPlan) * 100 : 0;
    const overdue = subtests.filter(s =>
      (s.t1_planned_date && s.t1_planned_date < today && s.t1_status !== 'Done') ||
      (s.t2_planned_date && s.t2_planned_date < today && s.t2_status !== 'Done')
    ).length;
    // Upcoming 7-day plan: count planned T1/T2 dates in [today, today+7]
    const upcomingEnd = addDays(today, 7);
    let upcoming7Plan = 0;
    for (const s of subtests) {
      if (s.t1_planned_date && s.t1_planned_date >= today && s.t1_planned_date <= upcomingEnd) upcoming7Plan++;
      if (s.t2_planned_date && s.t2_planned_date >= today && s.t2_planned_date <= upcomingEnd) upcoming7Plan++;
    }
    return { cumPlan, cumActual, variance, progressPct, criticalCount: critical.highRisk.length, overdue, upcoming7Plan, upcomingEnd };
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

  const handleCellClick = (
    groupKey: string,
    bucketIso: string,
    stage: ScheduleStage | 'all',
    field: 'planned' | 'actual',
  ) => {
    const { key, value } = filterParamForGroup(groupKey);
    const params: Record<string, string> = { [key]: value };

    // Bucket date range: day = single day, week = 7-day window
    const dateFrom = bucketIso;
    const dateTo = bucket === 'week' ? addDays(bucketIso, 6) : bucketIso;
    params.date_from = dateFrom;
    params.date_to = dateTo;
    params.date_field = field;

    // Stage scope (sub-row click) and matching status
    if (stage === 't1' || stage === 't2' || stage === 'pred') {
      params.stage = stage;
    }
    // Plan bar counts by planned_date regardless of status — don't constrain status.
    // Actual bar implies completion — keep Done filter.
    if (field === 'actual') {
      params.cell_status = 'Done';
    }

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
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setHidePast(p => !p)}
              title={hidePast ? 'Show past dates' : 'Hide past dates'}
            >
              {hidePast ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
              <span className="ml-1">{hidePast ? 'Show past' : 'Hide past'}</span>
            </Button>
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi
          label="Cumulative Progress"
          value={
            kpis.cumPlan > 0
              ? `${kpis.cumActual}/${kpis.cumPlan} (${kpis.progressPct.toFixed(0)}%)`
              : `${kpis.cumActual}/${kpis.cumPlan}`
          }
          subValue={
            kpis.cumPlan > 0
              ? `Variance ${kpis.variance >= 0 ? '+' : ''}${kpis.variance.toFixed(1)}%`
              : undefined
          }
          accent={
            kpis.cumPlan > 0 && kpis.progressPct < 90 ? 'short'
            : kpis.cumPlan > 0 && kpis.cumActual > kpis.cumPlan ? 'over'
            : undefined
          }
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
        <Kpi
          label="Overdue"
          value={kpis.overdue}
          accent={kpis.overdue > 0 ? 'short' : undefined}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          onClick={kpis.overdue > 0 ? () => navigate('/?overdue=1') : undefined}
        />
        <Kpi
          label="Critical (≤7d)"
          value={kpis.criticalCount}
          accent={kpis.criticalCount > 0 ? 'short' : undefined}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          onClick={kpis.criticalCount > 0 ? () => navigate('/?at_risk=1') : undefined}
        />
        <Kpi
          label="Upcoming 7d Plan"
          value={kpis.upcoming7Plan}
          icon={<Calendar className="h-3.5 w-3.5" />}
          onClick={
            kpis.upcoming7Plan > 0
              ? () => navigate(`/?date_from=${today}&date_to=${kpis.upcomingEnd}&date_field=planned`)
              : undefined
          }
        />
      </div>

      {/* Matrix + Watchlist */}
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          {loading ? (
            <Skeleton className="h-[500px] w-full" />
          ) : (
            <ScheduleMatrix
              data={visibleData}
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

function Kpi({ label, value, subValue, accent, icon, onClick }: {
  label: string;
  value: number | string;
  subValue?: string;
  accent?: 'short' | 'over';
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Card
      onClick={onClick}
      className={cn(onClick && 'cursor-pointer transition-colors hover:bg-accent/40')}
    >
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
        {subValue && (
          <div className="text-[10px] text-muted-foreground tabular-nums">{subValue}</div>
        )}
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
