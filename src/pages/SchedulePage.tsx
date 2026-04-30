import { useEffect, useMemo, useState } from 'react';
import { ALL_TEAMS, TEAM_LABELS, type TeamType } from '@/types/enums';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, AlertTriangle, TrendingUp, ChevronsLeft, ChevronsRight, CalendarSearch, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { exportScheduleToExcel } from '@/lib/schedule-excel-export';
import { exportSubtestsArrayToExcel } from '@/lib/excel-export';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { useAuth } from '@/contexts/AuthContext';
import { USER_TYPE_LABELS } from '@/types/enums';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { todayIso, yesterdayIso, type SubtestForDashboard } from '@/lib/dashboard-utils';
import { formatDdMmm } from '@/lib/format';
import { ALL_STAGE_KEYS, getStageKeys, isStageActualUpTo, isStageDelayedAsOf, isStagePlannedOn, isStagePlannedUpTo } from '@/lib/stage-metrics';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  hdec: 'PIC',
  team: 'Team',
};

export default function SchedulePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Stabilize today across renders so memos don't re-run unnecessarily
  const today = useMemo(() => todayIso(), []);

  const [groupBy, setGroupBy] = useState<ScheduleGroupBy>((searchParams.get('group') as ScheduleGroupBy) || 'system');
  const [bucket, setBucket] = useState<ScheduleBucket>((searchParams.get('bucket') as ScheduleBucket) || 'day');
  const [stageFilter, setStageFilter] = useState<ScheduleStage[]>(() => {
    const raw = searchParams.get('stage_view');
    if (!raw || raw === 'all') return [...ALL_STAGE_KEYS];
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean) as ScheduleStage[];
    const valid = parts.filter(p => (ALL_STAGE_KEYS as string[]).includes(p));
    return valid.length > 0 ? valid : [...ALL_STAGE_KEYS];
  });
  const isAllStages = stageFilter.length === ALL_STAGE_KEYS.length;
  // Pass to downstream consumers: 'all' sentinel when fully selected, single string when one, otherwise array.
  const stageFilterArg: ScheduleStageFilter = isAllStages
    ? 'all'
    : stageFilter.length === 1
      ? stageFilter[0]
      : stageFilter;
  const [asOfMode, setAsOfMode] = useState<'dataDate' | 'today'>((searchParams.get('asof_mode') as 'dataDate' | 'today') || 'dataDate');
  const [dataDate, setDataDate] = useState(() => yesterdayIso(today));
  const [teamFilter, setTeamFilter] = useState<string>(searchParams.get('team') || 'all');
  const [systemTextFilter, setSystemTextFilter] = useState(searchParams.get('system_text') || '');
  const [selectedSystemFilters, setSelectedSystemFilters] = useState<string[]>(searchParams.get('systems')?.split(',').filter(Boolean) || []);
  const [rangeDays, setRangeDays] = useState<number>(Number(searchParams.get('range') || 60));
  const [hidePast, setHidePast] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return searchParams.get('hide_past') === '1' || localStorage.getItem('schedule_hide_past') === '1';
  });
  const [showRiskPanel, setShowRiskPanel] = useState(searchParams.get('risk_panel') === '1');
  const [pickedDate, setPickedDate] = useState<Date | undefined>(() => searchParams.get('picked') ? new Date(`${searchParams.get('picked')}T00:00:00`) : new Date());
  const [pickedField, setPickedField] = useState<'planned' | 'actual'>((searchParams.get('picked_field') as 'planned' | 'actual') || 'planned');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('schedule_hide_past', hidePast ? '1' : '0');
  }, [hidePast]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDelete = (key: string, value: string, defaultValue: string) => {
      if (!value || value === defaultValue) next.delete(key);
      else next.set(key, value);
    };
    setOrDelete('group', groupBy, 'system');
    setOrDelete('bucket', bucket, 'day');
    setOrDelete('stage_view', isAllStages ? '' : stageFilter.join(','), '');
    setOrDelete('asof_mode', asOfMode, 'dataDate');
    setOrDelete('team', teamFilter, 'all');
    setOrDelete('system_text', systemTextFilter, '');
    setOrDelete('systems', selectedSystemFilters.join(','), '');
    setOrDelete('range', String(rangeDays), '60');
    setOrDelete('hide_past', hidePast ? '1' : '', '');
    setOrDelete('risk_panel', showRiskPanel ? '1' : '', '');
    setOrDelete('picked', pickedDate ? format(pickedDate, 'yyyy-MM-dd') : '', format(new Date(), 'yyyy-MM-dd'));
    setOrDelete('picked_field', pickedField, 'planned');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [groupBy, bucket, stageFilter, isAllStages, asOfMode, teamFilter, systemTextFilter, selectedSystemFilters, rangeDays, hidePast, showRiskPanel, pickedDate, pickedField, searchParams, setSearchParams]);

  useEffect(() => {
    if (groupBy === 'system') return;
    setSystemTextFilter('');
    setSelectedSystemFilters([]);
  }, [groupBy]);

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
          .select('id, item_no, mos_code, system_id, subcontractor_name, subsub_name, hdec_pic_name, t1_status, t2_status, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date, predecessor_status_raw, pred_status, pred_planned_date, pred_actual_date, r1_status, r1_target_submission_date, r1_actual_submission_date, r2_status, r2_target_approval_date, r2_actual_approval_date, team' as any)
          .eq('is_active', true)
          .range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data as any);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const [sysRes, latestImport] = await Promise.all([
        supabase.from('system_master').select('id, system_code').eq('is_active', true),
        supabase
          .from('upload_batches')
          .select('data_date')
          .eq('status', 'completed')
          .not('data_date', 'is', null)
          .order('data_date', { ascending: false })
          .order('uploaded_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!cancelled) {
        const sysList = sysRes.data ?? [];
        setSubtests(all);
        setSystems(sysList);
        if (latestImport.data?.data_date) setDataDate(latestImport.data.data_date);
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

  const filteredSubtests = useMemo(
    () => teamFilter === 'all' ? subtests : subtests.filter(s => s.team === teamFilter),
    [subtests, teamFilter],
  );

  const asOfDate = asOfMode === 'dataDate' ? dataDate : today;
  const asOfLabel = asOfMode === 'dataDate' ? 'Data Date' : 'Today';

  const aggregate = useMemo(
    () => aggregateSchedule(filteredSubtests, {
      groupBy, bucket, stageFilter: stageFilterArg,
      rangeStart, rangeEnd, asOfDate, sysCodeById,
    }),
    [filteredSubtests, groupBy, bucket, stageFilterArg, rangeStart, rangeEnd, asOfDate, sysCodeById],
  );

  const systemFilterOptions = useMemo(
    () => Array.from(new Set(aggregate.rows.map(r => r.label))).sort((a, b) => a.localeCompare(b)),
    [aggregate.rows],
  );

  const filteredAggregate = useMemo(() => {
    if (groupBy !== 'system') return aggregate;
    const text = systemTextFilter.trim().toLowerCase();
    const rows = aggregate.rows.filter(r => {
      const matchesText = !text || r.label.toLowerCase().includes(text);
      const matchesSelection = selectedSystemFilters.length === 0 || selectedSystemFilters.includes(r.label);
      return matchesText && matchesSelection;
    });
    return { ...aggregate, rows };
  }, [aggregate, groupBy, systemTextFilter, selectedSystemFilters]);

  const critical = useMemo(
    () => findCritical(filteredSubtests, today, 7, sysCodeById, groupBy),
    [filteredSubtests, today, sysCodeById, groupBy],
  );

  const lagging = useMemo(() => findLaggingGroups(filteredAggregate.rows, 5), [filteredAggregate.rows]);

  // Past-date hiding: slice buckets/cells to only today-and-future
  const visibleData = useMemo(() => {
    if (!hidePast) return filteredAggregate;
    const startIdx = filteredAggregate.buckets.findIndex(b => b >= today);
    if (startIdx <= 0) return filteredAggregate;
    const buckets = filteredAggregate.buckets.slice(startIdx);
    const rows = filteredAggregate.rows.map(r => ({
      ...r,
      combined: r.combined.slice(startIdx),
      stages: {
        pred: { ...r.stages.pred, cells: r.stages.pred.cells.slice(startIdx) },
        t1:   { ...r.stages.t1,   cells: r.stages.t1.cells.slice(startIdx) },
        t2:   { ...r.stages.t2,   cells: r.stages.t2.cells.slice(startIdx) },
        r1:   { ...r.stages.r1,   cells: r.stages.r1.cells.slice(startIdx) },
        r2s:  { ...r.stages.r2s,  cells: r.stages.r2s.cells.slice(startIdx) },
        r2a:  { ...r.stages.r2a,  cells: r.stages.r2a.cells.slice(startIdx) },
      },
    }));
    return { ...filteredAggregate, buckets, rows };
  }, [filteredAggregate, hidePast, today]);

  const kpis = useMemo(() => {
    let cumPlan = 0, cumActual = 0;
    const stages = getStageKeys(stageFilterArg);
    let totalStages = 0, doneStages = 0;
    for (const s of filteredSubtests) {
      totalStages += stages.length;
      for (const st of stages) {
        if (isStagePlannedUpTo(s, st, dataDate)) cumPlan++;
        if (isStageActualUpTo(s, st, dataDate)) {
          cumActual++;
          doneStages++;
        }
      }
    }
    const variance = cumPlan ? ((cumActual - cumPlan) / cumPlan) * 100 : 0;
    const progressPct = totalStages ? (doneStages / totalStages) * 100 : 0;
    const overdue = filteredSubtests.reduce(
      (count, s) => count + stages.filter(st => isStageDelayedAsOf(s, st, dataDate)).length,
      0,
    );
    const upcomingEnd = addDays(today, 7);
    let upcoming7Plan = 0;
    for (const s of filteredSubtests) {
      for (const st of stages) {
        for (let d = today; d <= upcomingEnd; d = addDays(d, 1)) {
          if (isStagePlannedOn(s, st, d)) upcoming7Plan++;
        }
      }
    }
    return { cumPlan, cumActual, variance, progressPct, doneStages, totalStages, criticalCount: critical.highRisk.length, overdue, upcoming7Plan, upcomingEnd };
  }, [stageFilterArg, filteredSubtests, critical.highRisk.length, dataDate, today]);

  // ───── Navigation handlers ─────
  const filterParamForGroup = (label: string): { key: string; value: string } => {
    const key = groupBy === 'system' ? 'system' : groupBy === 'subcon' ? 'subcon' : groupBy === 'hdec' ? 'hdec_pic' : groupBy === 'team' ? 'team' : 'subsub';
    return { key, value: label };
  };

  const filterValueForGroup = (label: string) =>
    label === '(None)' || label === '—' ? '__EMPTY__' : label;

  const goSubtests = (params: Record<string, string>) => {
    const sp = new URLSearchParams(params);
    navigate(`/tc/raw-data?${sp.toString()}`);
  };

  const handleCellClick = (
    groupKey: string,
    bucketIso: string,
    stage: ScheduleStage | 'all',
    field: 'planned' | 'actual',
  ) => {
    const { key, value } = filterParamForGroup(groupKey);
    const params: Record<string, string> = {
      [key]: filterValueForGroup(value),
      source: 'schedule_cell',
    };

    // Bucket date range: day = single day, week = 7-day window
    const dateFrom = bucketIso;
    const dateTo = bucket === 'week' ? addDays(bucketIso, 6) : bucketIso;
    params.date_from = dateFrom;
    params.date_to = dateTo;
    params.date_field = field;

    // Stage scope (sub-row click) and matching status
    if (stage === 't1' || stage === 't2' || stage === 'pred' || stage === 'r1' || stage === 'r2s' || stage === 'r2a') {
      params.stage = stage;
    }
    // Plan counts by planned_date regardless of status. Actual implies completed actual_date.
    if (field === 'actual') {
      params.cell_status = 'Done';
    }

    goSubtests(params);
  };

  const handleCriticalClick = (item: CriticalItem) => {
    goSubtests({ source: 'schedule_critical', system: item.systemCode, [`${item.stage}_status`]: item.status ?? 'Planned' });
  };

  const handleGroupClick = (label: string) => {
    const { key, value } = filterParamForGroup(label);
    goSubtests({ source: 'schedule_group', [key]: value });
  };
  const { toast } = useToast();
  const { fields: fieldConfigRows } = useFieldConfig();
  const { profile } = useAuth();
  const handleScheduleExport = () => {
    if (!visibleData.rows.length) {
      toast({ title: 'No data to export', variant: 'destructive' });
      return;
    }
    const { rowCount, fileName } = exportScheduleToExcel(visibleData, {
      groupHeader: GROUP_LABELS[groupBy],
      stageFilter: stageFilterArg,
      bucket,
      today,
      dataDate,
      asOfLabel,
    });
    toast({ title: 'Export complete', description: `${rowCount} groups → ${fileName}` });
  };

  // Build the same row set the page is actually showing (after team / system filters),
  // then export every row using the Subtest Master List Excel layout.
  const handleRowsExport = () => {
    // Apply the page's filters to get the raw row list.
    let rowsForExport = filteredSubtests as any[];

    // System group filters (text + selected list) only apply when grouped by system.
    if (groupBy === 'system') {
      const text = systemTextFilter.trim().toLowerCase();
      const selected = new Set(selectedSystemFilters);
      rowsForExport = rowsForExport.filter((r) => {
        const code = sysCodeById.get(r.system_id) ?? '';
        const matchesText = !text || code.toLowerCase().includes(text);
        const matchesSelection = selected.size === 0 || selected.has(code || '(None)');
        return matchesText && matchesSelection;
      });
    }

    // Inject system_code so the Excel column resolves like in the master list.
    const enriched = rowsForExport.map((r) => ({
      ...r,
      system_code: r.system_code ?? sysCodeById.get(r.system_id) ?? '',
    }));

    if (enriched.length === 0) {
      toast({ title: 'No rows to export', variant: 'destructive' });
      return;
    }

    const filterParts: string[] = [
      `team=${teamFilter}`,
      `group=${groupBy}`,
      `bucket=${bucket}`,
      `stages=${Array.isArray(stageFilterArg) ? stageFilterArg.join('+') : String(stageFilterArg)}`,
      `range=${rangeDays}d`,
      `asOf=${asOfLabel}(${asOfDate})`,
      `hidePast=${hidePast ? '1' : '0'}`,
    ];
    if (groupBy === 'system' && (systemTextFilter || selectedSystemFilters.length)) {
      filterParts.push(
        `system_text="${systemTextFilter}"`,
        `systems=[${selectedSystemFilters.join(', ')}]`,
      );
    }

    try {
      const { rowCount, fileName } = exportSubtestsArrayToExcel({
        rows: enriched,
        fieldConfig: fieldConfigRows,
        meta: {
          userName: profile?.name || profile?.login_id || 'Unknown',
          userType: profile?.user_type ? USER_TYPE_LABELS[profile.user_type] : '',
        },
        sourceLabel: 'Progress → Filtered rows',
        filterSummary: filterParts.join(' · '),
        fileStem: 'SHAW_Subtests_Progress',
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
            Progress Status
          </h1>
          <p className="text-xs text-muted-foreground">
            Track planned vs actual progress by {GROUP_LABELS[groupBy]} · {bucket === 'day' ? 'Daily' : 'Weekly'} view · Data Date {formatDdMmm(dataDate)} · Today {formatDdMmm(today)} · Cumulative: {asOfLabel}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleScheduleExport}>
          <Download className="mr-1.5 h-4 w-4" />
          Excel
        </Button>
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
                <TabsTrigger value="hdec" className="h-6 px-2 text-xs">PIC</TabsTrigger>
                <TabsTrigger value="team" className="h-6 px-2 text-xs">Team</TabsTrigger>
              </TabsList>
            </Tabs>
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
            <Tabs value={bucket} onValueChange={(v) => setBucket(v as ScheduleBucket)}>
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
                onClick={() => setStageFilter([...ALL_STAGE_KEYS])}
                title="Show all stages"
              >
                All
              </Button>
              <ToggleGroup
                type="multiple"
                value={isAllStages ? [] : stageFilter}
                onValueChange={(vals) => {
                  const next = (vals as ScheduleStage[]).filter(v =>
                    (ALL_STAGE_KEYS as string[]).includes(v),
                  );
                  // If user deselects everything, restore ALL.
                  if (next.length === 0) {
                    setStageFilter([...ALL_STAGE_KEYS]);
                    return;
                  }
                  setStageFilter(ALL_STAGE_KEYS.filter(k => next.includes(k)));
                }}
                className="gap-1"
              >
                <ToggleGroupItem value="pred" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Pred</ToggleGroupItem>
                <ToggleGroupItem value="t1" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">T1</ToggleGroupItem>
                <ToggleGroupItem value="t2" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">T2</ToggleGroupItem>
                <ToggleGroupItem value="r1" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">R1S</ToggleGroupItem>
                <ToggleGroupItem value="r2s" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">R2S</ToggleGroupItem>
                <ToggleGroupItem value="r2a" className="h-8 px-2 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">R2A</ToggleGroupItem>
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
                  onSelect={(d) => {
                    if (!d) return;
                    setPickedDate(d);
                    setPickerOpen(false);
                  }}
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
                  source: 'schedule_lookup',
                  date_from: iso,
                  date_to: iso,
                  date_field: pickedField,
                };
                if (pickedField === 'actual') params.cell_status = 'Done';
                if (stageFilter.length === 1) params.stage = stageFilter[0];
                navigate(`/tc/raw-data?${new URLSearchParams(params).toString()}`);
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
          onClick={kpis.overdue > 0 ? () => navigate(`/tc/raw-data?source=schedule_kpi&status=overdue&as_of=${dataDate}`) : undefined}
        />
        <Kpi
          label="Critical (≤7d)"
          value={kpis.criticalCount}
          accent={kpis.criticalCount > 0 ? 'short' : undefined}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          onClick={kpis.criticalCount > 0 ? () => navigate('/tc/raw-data?source=schedule_kpi&status=at_risk&at_risk_days=7') : undefined}
        />
        <Kpi
          label="Upcoming 7d Plan"
          value={kpis.upcoming7Plan}
          icon={<CalendarIcon className="h-3.5 w-3.5" />}
          onClick={
            kpis.upcoming7Plan > 0
              ? () => navigate(`/tc/raw-data?source=schedule_kpi&date_from=${today}&date_to=${kpis.upcomingEnd}&date_field=planned`)
              : undefined
          }
        />
      </div>

      {/* Matrix + Watchlist */}
      <div className="flex items-center justify-end gap-2">
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
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          {loading ? (
            <Skeleton className="h-[500px] w-full" />
          ) : (
            <ScheduleMatrix
              data={visibleData}
              bucket={bucket}
              stageFilter={stageFilterArg}
              today={today}
              asOfLabel={asOfLabel}
              groupHeader={GROUP_LABELS[groupBy]}
              onCellClick={handleCellClick}
              systemFilter={groupBy === 'system' ? {
                text: systemTextFilter,
                selected: selectedSystemFilters,
                options: systemFilterOptions,
                onTextChange: setSystemTextFilter,
                onSelectedChange: setSelectedSystemFilters,
              } : undefined}
            />
          )}
        </div>
        {!loading && showRiskPanel && (
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
