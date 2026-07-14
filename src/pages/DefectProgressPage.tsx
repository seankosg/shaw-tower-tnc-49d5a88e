import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertTriangle, Calendar as CalendarIcon, CalendarSearch, ChevronsLeft, ChevronsRight, Download, TrendingUp } from 'lucide-react';
import { ALL_TEAMS, TEAM_LABELS } from '@/types/enums';
import { useDefectCache } from '@/lib/defect-cache';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import { useLatestDataDate } from '@/hooks/useLatestDataDate';
import { type DefectItem, todayIso } from '@/lib/defect-utils';
import {
  ALL_DEFECT_STAGE_KEYS,
  ALL_DEFECT_GROUP_KEYS,
  DEFECT_GROUP_LABELS,
  DEFECT_GROUP_QUERY_PARAM,
  addDays,
  aggregateDefectSchedule,
  findDefectCritical,
  findDefectLaggingGroups,
  getDefectStageKeys,
  isDefectStageActualUpTo,
  isDefectStageDelayedAsOf,
  isDefectStagePlannedOn,
  isDefectStagePlannedUpTo,
  type DefectCriticalItem,
  type DefectScheduleBucket,
  type DefectScheduleGroupBy,
  type DefectScheduleStage,
  type DefectScheduleStageFilter,
} from '@/lib/defect-schedule-utils';
import { DefectScheduleMatrix } from '@/components/defects/DefectScheduleMatrix';
import { DefectCriticalWatchlist } from '@/components/defects/DefectCriticalWatchlist';
import { exportDefectScheduleToExcel } from '@/lib/defect-schedule-excel-export';
import { exportDefectArrayToExcel } from '@/lib/defect-excel-export';
import { useDefectFieldConfig } from '@/hooks/useDefectFieldConfig';
import { usePlanMode, type PlanMode } from '@/hooks/usePlanMode';
import { useAuth } from '@/contexts/AuthContext';
import { USER_TYPE_LABELS } from '@/types/enums';

export default function DefectProgressPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useMemo(() => todayIso(), []);
  const { toast } = useToast();

  const [groupBy, setGroupBy] = useState<DefectScheduleGroupBy[]>(() => {
    const raw = searchParams.get('group');
    if (!raw) return ['team'];
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean) as DefectScheduleGroupBy[];
    const valid = parts.filter(p => (ALL_DEFECT_GROUP_KEYS as string[]).includes(p));
    return valid.length > 0 ? valid : ['team'];
  });
  const isAllGroups = groupBy.length === ALL_DEFECT_GROUP_KEYS.length;
  const groupBySpec = groupBy.length === 1 ? groupBy[0] : groupBy;
  const primaryGroup: DefectScheduleGroupBy = groupBy[0] ?? 'team';
  const groupHeaderLabel = groupBy.map(g => DEFECT_GROUP_LABELS[g]).join(' · ');
  const [bucket, setBucket] = useState<DefectScheduleBucket>((searchParams.get('bucket') as DefectScheduleBucket) || 'day');
  const [stageFilter, setStageFilter] = useState<DefectScheduleStage[]>(() => {
    const raw = searchParams.get('stage_view');
    if (!raw || raw === 'all') return [...ALL_DEFECT_STAGE_KEYS];
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean) as DefectScheduleStage[];
    const valid = parts.filter(p => (ALL_DEFECT_STAGE_KEYS as string[]).includes(p));
    return valid.length > 0 ? valid : [...ALL_DEFECT_STAGE_KEYS];
  });
  const isAllStages = stageFilter.length === ALL_DEFECT_STAGE_KEYS.length;
  const stageFilterArg: DefectScheduleStageFilter = isAllStages ? 'all' : stageFilter.length === 1 ? stageFilter[0] : stageFilter;

  const [asOfMode, setAsOfMode] = useState<'dataDate' | 'today'>((searchParams.get('asof_mode') as 'dataDate' | 'today') || 'dataDate');
  const [teamFilter, setTeamFilter] = useState<string>(searchParams.get('team') || 'all');
  const [rangeDays, setRangeDays] = useState<number>(Number(searchParams.get('range') || 60));
  const [hidePast, setHidePast] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return searchParams.get('hide_past') === '1' || localStorage.getItem('defect_schedule_hide_past') === '1';
  });
  const [showRiskPanel, setShowRiskPanel] = useState(searchParams.get('risk_panel') === '1');
  const [pickedDate, setPickedDate] = useState<Date | undefined>(() => searchParams.get('picked') ? new Date(`${searchParams.get('picked')}T00:00:00`) : new Date());
  const [pickedField, setPickedField] = useState<'planned' | 'actual'>((searchParams.get('picked_field') as 'planned' | 'actual') || 'planned');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [planMode, setPlanMode] = usePlanMode();
  const [cscTab, setCscTab] = useState<'pre' | 'post'>(() => (searchParams.get('csc') === 'post' ? 'post' : 'pre'));

  // URL → planMode (URL has priority on mount; subsequent changes propagate URL ↔ store)
  useEffect(() => {
    const urlMode = searchParams.get('plan_mode');
    if ((urlMode === 'baseline' || urlMode === 'remaining') && urlMode !== planMode) {
      setPlanMode(urlMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('defect_schedule_hide_past', hidePast ? '1' : '0');
  }, [hidePast]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDelete = (key: string, value: string, defaultValue: string) => {
      if (!value || value === defaultValue) next.delete(key);
      else next.set(key, value);
    };
    setOrDelete('group', groupBy.join(','), 'team');
    setOrDelete('bucket', bucket, 'day');
    setOrDelete('stage_view', isAllStages ? '' : stageFilter.join(','), '');
    setOrDelete('asof_mode', asOfMode, 'dataDate');
    setOrDelete('team', teamFilter, 'all');
    setOrDelete('range', String(rangeDays), '60');
    setOrDelete('hide_past', hidePast ? '1' : '', '');
    setOrDelete('risk_panel', showRiskPanel ? '1' : '', '');
    setOrDelete('picked', pickedDate ? format(pickedDate, 'yyyy-MM-dd') : '', format(new Date(), 'yyyy-MM-dd'));
    setOrDelete('picked_field', pickedField, 'planned');
    setOrDelete('plan_mode', planMode, 'remaining');
    setOrDelete('csc', cscTab === 'post' ? 'post' : '', '');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [groupBy, bucket, stageFilter, isAllStages, asOfMode, teamFilter, rangeDays, hidePast, showRiskPanel, pickedDate, pickedField, planMode, cscTab, searchParams, setSearchParams]);

  const { items: cachedItems, initialLoaded } = useDefectCache();
  const allItems = cachedItems as unknown as DefectItem[];
  const items = useMemo(
    () => allItems.filter(d => cscTab === 'post' ? (d as any).is_post_csc === true : (d as any).is_post_csc !== true),
    [allItems, cscTab],
  );
  const loading = !initialLoaded;

  const { dataDate, source: dataDateSource } = useLatestDataDate();
  const asOfDate = asOfMode === 'dataDate' ? dataDate : today;
  const asOfLabel = asOfMode === 'dataDate' ? 'Data Date' : 'Today';

  const rangeStart = useMemo(() => addDays(today, -14), [today]);
  const rangeEnd = useMemo(() => addDays(today, rangeDays), [today, rangeDays]);

  const filteredItems = useMemo(
    () => teamFilter === 'all' ? items : items.filter(s => s.team === teamFilter),
    [items, teamFilter],
  );

  const aggregate = useMemo(
    () => aggregateDefectSchedule(filteredItems, {
      groupBy: groupBySpec, bucket, stageFilter: stageFilterArg, rangeStart, rangeEnd, asOfDate, planMode,
    }),
    [filteredItems, groupBySpec, bucket, stageFilterArg, rangeStart, rangeEnd, asOfDate, planMode],
  );

  const critical = useMemo(
    () => findDefectCritical(filteredItems, today, 7, primaryGroup),
    [filteredItems, today, primaryGroup],
  );

  const lagging = useMemo(() => findDefectLaggingGroups(aggregate.rows, 5), [aggregate.rows]);

  const visibleData = useMemo(() => {
    if (!hidePast) return aggregate;
    const startIdx = aggregate.buckets.findIndex(b => b >= today);
    if (startIdx <= 0) return aggregate;
    const buckets = aggregate.buckets.slice(startIdx);
    const rows = aggregate.rows.map(r => ({
      ...r,
      combined: r.combined.slice(startIdx),
      stages: {
        start: { ...r.stages.start, cells: r.stages.start.cells.slice(startIdx) },
        completion: { ...r.stages.completion, cells: r.stages.completion.cells.slice(startIdx) },
        closure: { ...r.stages.closure, cells: r.stages.closure.cells.slice(startIdx) },
      },
    }));
    return { ...aggregate, buckets, rows };
  }, [aggregate, hidePast, today]);

  const kpis = useMemo(() => {
    let cumPlan = 0, cumActual = 0;
    const stages = getDefectStageKeys(stageFilterArg);
    let totalStages = 0, doneStages = 0;
    for (const s of filteredItems) {
      totalStages += stages.length;
      for (const st of stages) {
        const doneAsOf = isDefectStageActualUpTo(s, st, dataDate);
        const countPlan = isDefectStagePlannedUpTo(s, st, dataDate) && (planMode === 'baseline' || !doneAsOf);
        if (countPlan) cumPlan++;
        if (doneAsOf) {
          cumActual++;
          doneStages++;
        }
      }
    }
    const variance = cumPlan ? ((cumActual - cumPlan) / cumPlan) * 100 : 0;
    const progressPct = totalStages ? (doneStages / totalStages) * 100 : 0;
    const overdue = filteredItems.reduce(
      (count, s) => count + stages.filter(st => isDefectStageDelayedAsOf(s, st, dataDate)).length,
      0,
    );
    const upcomingEnd = addDays(today, 7);
    let upcoming7Plan = 0;
    for (const s of filteredItems) {
      for (const st of stages) {
        // Remaining mode: skip if stage already done as-of today.
        if (planMode === 'remaining' && isDefectStageActualUpTo(s, st, today)) continue;
        for (let d = today; d <= upcomingEnd; d = addDays(d, 1)) {
          if (isDefectStagePlannedOn(s, st, d)) upcoming7Plan++;
        }
      }
    }
    return { cumPlan, cumActual, variance, progressPct, doneStages, totalStages, criticalCount: critical.highRisk.length, overdue, upcoming7Plan, upcomingEnd };
  }, [stageFilterArg, filteredItems, critical.highRisk.length, dataDate, today, planMode]);

  // ───── Navigation ─────
  const filterValueFor = (label: string) => label === '(None)' || label === '—' ? '__EMPTY__' : label;

  const persistentFilterParams = (): Record<string, string> => {
    const out: Record<string, string> = {};
    if (teamFilter && teamFilter !== 'all') out.team = teamFilter;
    return out;
  };

  const goRaw = (params: Record<string, string>) => {
    const sp = new URLSearchParams({ source: 'progress', ...persistentFilterParams(), ...params });
    navigate(`/defects/raw-data?${sp.toString()}`);
  };

  const groupKeyToParams = (rowKey: string): Record<string, string> => {
    const parts = rowKey.split(' · ');
    const out: Record<string, string> = {};
    groupBy.forEach((dim, i) => {
      const raw = parts[i];
      if (raw === undefined) return;
      out[DEFECT_GROUP_QUERY_PARAM[dim]] = filterValueFor(raw);
    });
    return out;
  };

  const handleCellClick = (
    groupKey: string,
    bucketIso: string,
    stage: DefectScheduleStage | 'all',
    field: 'planned' | 'actual',
  ) => {
    const params: Record<string, string> = {
      ...groupKeyToParams(groupKey),
    };
    const dateFrom = bucketIso;
    const dateTo = bucket === 'week' ? addDays(bucketIso, 6) : bucketIso;
    params.dateStart = dateFrom;
    params.dateEnd = dateTo;
    if (stage !== 'all') {
      params.stage = stage;
      // dateField — map planned/actual to the underlying date column for this stage
      const fieldMap: Record<DefectScheduleStage, { planned: string; actual: string }> = {
        start: { planned: 'planned_start_date', actual: 'actual_start_date' },
        completion: { planned: 'planned_completion_date', actual: 'actual_completion_date' },
        closure: { planned: 'planned_closure_date', actual: 'actual_closure_date' },
      };
      params.dateField = fieldMap[stage][field];
    } else {
      // Combined: default to completion's planned/actual date as a sensible filter
      params.dateField = field === 'planned' ? 'planned_completion_date' : 'actual_completion_date';
    }
    goRaw(params);
  };

  const handleCriticalClick = (item: DefectCriticalItem) => {
    goRaw({ overdue: 'true', stage: item.stage, asOf: dataDate });
  };

  const handleGroupClick = (label: string) => {
    goRaw(groupKeyToParams(label));
  };

  const handleExport = () => {
    if (!visibleData.rows.length) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }
    const { rowCount, fileName } = exportDefectScheduleToExcel(visibleData, {
      groupHeader: groupHeaderLabel,
      stageFilter: stageFilterArg,
      bucket,
      today,
      dataDate,
      asOfLabel,
      planMode,
    });
    toast({ title: 'Export complete', description: `${rowCount} groups → ${fileName}` });
  };

  const { fields: defectFieldConfig } = useDefectFieldConfig();
  const { profile } = useAuth();

  const handleRowsExport = () => {
    if (!filteredItems.length) {
      toast({ title: 'No rows to export', variant: 'destructive' });
      return;
    }
    const filterParts = [
      `team=${teamFilter}`,
      `group=${groupBy.join('+')}`,
      `bucket=${bucket}`,
      `stages=${Array.isArray(stageFilterArg) ? stageFilterArg.join('+') : String(stageFilterArg)}`,
      `range=${rangeDays}d`,
      `asOf=${asOfLabel}(${asOfDate})`,
      `hidePast=${hidePast ? '1' : '0'}`,
    ];
    try {
      const { rowCount, fileName } = exportDefectArrayToExcel({
        rows: filteredItems as any[],
        fieldConfig: defectFieldConfig,
        meta: {
          userName: profile?.name || profile?.login_id || 'Unknown',
          userType: profile?.user_type ? USER_TYPE_LABELS[profile.user_type] : '',
        },
        sourceLabel: 'Defect Progress → Filtered rows',
        filterSummary: filterParts.join(' · '),
        fileStem: `SHAW_Defects_Progress_${cscTab === 'post' ? 'PostCSC' : 'PreCSC'}`,
      });
      toast({ title: 'Export complete', description: `${rowCount} rows → ${fileName}` });
    } catch (err) {
      console.error('Excel export failed', err);
      toast({ title: 'Export failed', description: String((err as Error)?.message ?? err), variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Defect Progress Status
          </h1>
          <p className="text-xs text-muted-foreground">
            Track planned vs actual progress by {groupHeaderLabel} · {bucket === 'day' ? 'Daily' : 'Weekly'} view · Data Date {formatDdMmm(dataDate)}{dataDateSource === 'fallback' && ' (fallback)'} · Today {formatDdMmm(today)} · Cumulative: {asOfLabel} · Plan: {planMode === 'remaining' ? 'Remaining' : 'Baseline'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" />
            Excel (Matrix)
          </Button>
          <Button variant="outline" size="sm" onClick={handleRowsExport}>
            <Download className="mr-1.5 h-4 w-4" />
            Excel (Rows)
          </Button>
        </div>
      </div>

      {/* CSC Tabs */}
      <Tabs value={cscTab} onValueChange={(v) => setCscTab(v as 'pre' | 'post')}>
        <TabsList>
          <TabsTrigger value="pre">Pre CSC</TabsTrigger>
          <TabsTrigger value="post">Post CSC</TabsTrigger>
        </TabsList>
      </Tabs>


      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <ToolbarGroup label="Group">
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={isAllGroups ? 'default' : 'outline'}
                className="h-8 px-2 text-xs"
                onClick={() => setGroupBy([...ALL_DEFECT_GROUP_KEYS])}
                title="Select all groups"
              >
                All
              </Button>
              <ToggleGroup
                type="multiple"
                value={isAllGroups ? [] : groupBy}
                onValueChange={(vals) => {
                  const next = (vals as DefectScheduleGroupBy[]).filter(v => (ALL_DEFECT_GROUP_KEYS as string[]).includes(v));
                  if (next.length === 0) {
                    setGroupBy(['team']);
                    return;
                  }
                  // Preserve canonical order so URL/labels stay stable.
                  setGroupBy(ALL_DEFECT_GROUP_KEYS.filter(k => next.includes(k)));
                }}
                className="gap-1 flex-wrap"
              >
                {ALL_DEFECT_GROUP_KEYS.map(k => (
                  <ToggleGroupItem
                    key={k}
                    value={k}
                    className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {DEFECT_GROUP_LABELS[k]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </ToolbarGroup>

          <ToolbarGroup label="Team">
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {ALL_TEAMS.map(t => (
                  <SelectItem key={t} value={t}>{TEAM_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ToolbarGroup>

          <ToolbarGroup label="Bucket">
            <Tabs value={bucket} onValueChange={(v) => setBucket(v as DefectScheduleBucket)}>
              <TabsList className="h-8">
                <TabsTrigger value="day" className="h-6 px-2 text-xs">Day</TabsTrigger>
                <TabsTrigger value="week" className="h-6 px-2 text-xs">Week</TabsTrigger>
              </TabsList>
            </Tabs>
          </ToolbarGroup>

          <ToolbarGroup label="Stage">
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={isAllStages ? 'default' : 'outline'}
                className="h-8 px-2 text-xs"
                onClick={() => setStageFilter([...ALL_DEFECT_STAGE_KEYS])}
                title="Show all stages"
              >
                All
              </Button>
              <ToggleGroup
                type="multiple"
                value={isAllStages ? [] : stageFilter}
                onValueChange={(vals) => {
                  const next = (vals as DefectScheduleStage[]).filter(v => (ALL_DEFECT_STAGE_KEYS as string[]).includes(v));
                  if (next.length === 0) {
                    setStageFilter([...ALL_DEFECT_STAGE_KEYS]);
                    return;
                  }
                  setStageFilter(ALL_DEFECT_STAGE_KEYS.filter(k => next.includes(k)));
                }}
                className="gap-1"
              >
                <ToggleGroupItem value="start" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Start</ToggleGroupItem>
                <ToggleGroupItem value="completion" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Comp</ToggleGroupItem>
                <ToggleGroupItem value="closure" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Close</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </ToolbarGroup>

          <ToolbarGroup label="As-of">
            <Tabs value={asOfMode} onValueChange={(v) => setAsOfMode(v as 'dataDate' | 'today')}>
              <TabsList className="h-8">
                <TabsTrigger value="dataDate" className="h-6 px-2 text-xs">Data Date</TabsTrigger>
                <TabsTrigger value="today" className="h-6 px-2 text-xs">Today</TabsTrigger>
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

          <ToolbarGroup label="Lookup">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-2 text-xs">
                  <CalendarSearch className="h-3.5 w-3.5" />
                  <span className="ml-1">{pickedDate ? format(pickedDate, 'yyyy-MM-dd') : 'Pick a date'}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={pickedDate}
                  onSelect={(d) => { if (!d) return; setPickedDate(d); setPickerOpen(false); }}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
            <Tabs value={pickedField} onValueChange={(v) => setPickedField(v as 'planned' | 'actual')}>
              <TabsList className="h-8">
                <TabsTrigger value="planned" className="h-6 px-2 text-xs">Plan</TabsTrigger>
                <TabsTrigger value="actual" className="h-6 px-2 text-xs">Actual</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={!pickedDate}
              onClick={() => {
                if (!pickedDate) return;
                const iso = format(pickedDate, 'yyyy-MM-dd');
                const params: Record<string, string> = {
                  source: 'progress_lookup',
                  dateStart: iso,
                  dateEnd: iso,
                };
                const stage = stageFilter.length === 1 ? stageFilter[0] : 'completion';
                const fieldMap: Record<DefectScheduleStage, { planned: string; actual: string }> = {
                  start: { planned: 'planned_start_date', actual: 'actual_start_date' },
                  completion: { planned: 'planned_completion_date', actual: 'actual_completion_date' },
                  closure: { planned: 'planned_closure_date', actual: 'actual_closure_date' },
                };
                params.dateField = fieldMap[stage][pickedField];
                if (stageFilter.length === 1) params.stage = stage;
                navigate(`/defects/raw-data?${new URLSearchParams(params).toString()}`);
              }}
            >
              Go
            </Button>
            <span className="text-[10px] text-muted-foreground">
              Applies current Stage filter. Group/Bucket/Range are view-only.
            </span>
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
          value={`${kpis.progressPct.toFixed(0)}%`}
          subValue={
            kpis.totalStages > 0
              ? `${kpis.doneStages}/${kpis.totalStages} stages done · Up to Data Date${kpis.cumPlan > 0 ? ` · Var ${kpis.variance >= 0 ? '+' : ''}${kpis.variance.toFixed(1)}%` : ''}`
              : '0/0'
          }
          accent={
            kpis.totalStages > 0 && kpis.progressPct < 30 ? 'short'
            : kpis.totalStages > 0 && kpis.progressPct >= 90 ? 'over'
            : undefined
          }
          progressPct={kpis.totalStages > 0 ? kpis.progressPct : undefined}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
        />
        <Kpi
          label="Delay Up to Data Date"
          value={kpis.overdue}
          accent={kpis.overdue > 0 ? 'short' : undefined}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          onClick={kpis.overdue > 0 ? () => goRaw({ overdue: 'true', asOf: dataDate }) : undefined}
        />
        <Kpi
          label="Critical (≤7d)"
          value={kpis.criticalCount}
          accent={kpis.criticalCount > 0 ? 'short' : undefined}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          onClick={kpis.criticalCount > 0 ? () => goRaw({ atRisk: 'true', atRiskDays: '7' }) : undefined}
        />
        <Kpi
          label="Upcoming 7d Plan"
          value={kpis.upcoming7Plan}
          icon={<CalendarIcon className="h-3.5 w-3.5" />}
          onClick={
            kpis.upcoming7Plan > 0
              ? () => goRaw({ dateStart: today, dateEnd: kpis.upcomingEnd, dateField: 'planned_completion_date' })
              : undefined
          }
        />
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={planMode}
            onValueChange={(v) => { if (v === 'baseline' || v === 'remaining') setPlanMode(v); }}
            className="gap-1"
          >
            <ToggleGroupItem value="remaining" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Remaining</ToggleGroupItem>
            <ToggleGroupItem value="baseline" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Baseline</ToggleGroupItem>
          </ToggleGroup>
          <span className="text-[10px] text-muted-foreground">
            {planMode === 'remaining' ? 'Excludes already-done plans' : 'All planned dates count'}
          </span>
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setShowRiskPanel(prev => !prev)}
          >
            {showRiskPanel ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
            <span className="ml-1">{showRiskPanel ? 'Hide Risk Panel' : 'Show Risk Panel'}</span>
          </Button>
        </div>
      </div>

      {/* Matrix + Watchlist */}
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          {loading ? (
            <Skeleton className="h-[500px] w-full" />
          ) : (
            <DefectScheduleMatrix
              data={visibleData}
              bucket={bucket}
              stageFilter={stageFilterArg}
              today={today}
              asOfLabel={asOfLabel}
              groupHeader={groupHeaderLabel}
              onCellClick={handleCellClick}
            />
          )}
        </div>
        {!loading && showRiskPanel && (
          <DefectCriticalWatchlist
            highRisk={critical.highRisk}
            closureBottleneck={critical.closureBottleneck}
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
    <div className="flex w-full sm:w-auto items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Kpi({ label, value, subValue, accent, icon, onClick, progressPct }: {
  label: string;
  value: number | string;
  subValue?: string;
  accent?: 'short' | 'over';
  icon?: React.ReactNode;
  onClick?: () => void;
  progressPct?: number;
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
        {progressPct !== undefined && (
          <Progress
            value={Math.min(100, progressPct)}
            className={cn(
              'mt-1 h-1.5',
              accent === 'short' && '[&>div]:bg-schedule-short',
              accent === 'over' && '[&>div]:bg-schedule-over',
            )}
          />
        )}
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
