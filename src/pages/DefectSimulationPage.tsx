import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, FlaskConical, TrendingUp, AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from 'recharts';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ALL_TEAMS, TEAM_LABELS } from '@/types/enums';
import { useLatestDataDate } from '@/hooks/useLatestDataDate';
import { type DefectItem, todayIso } from '@/lib/defect-utils';
import {
  ALL_DEFECT_STAGE_KEYS,
  DEFECT_STAGE_LABELS,
  addDays,
  type DefectScheduleStage,
} from '@/lib/defect-schedule-utils';
import {
  buildDefectSimulationSeries,
  computeStageLagDays,
  simulateAllDefectStages,
  simulateByTeam,
  DELAY_MODE_LABELS,
  type DelayMode,
  type SimOptions,
} from '@/lib/defect-simulation';

const STAGE_COLORS: Record<DefectScheduleStage, string> = {
  start: 'hsl(var(--chart-1, 215 90% 55%))',
  completion: 'hsl(var(--chart-2, 142 70% 45%))',
  closure: 'hsl(var(--chart-3, 25 90% 55%))',
};

export default function DefectSimulationPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useMemo(() => todayIso(), []);
  const { dataDate, source: dataDateSource } = useLatestDataDate();

  const [items, setItems] = useState<DefectItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let all: DefectItem[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data } = await (supabase as any)
          .from('defect_items')
          .select('*')
          .eq('is_active', true)
          .order('issue_no')
          .range(from, from + PAGE - 1);
        if (!data?.length) break;
        all = all.concat(data as DefectItem[]);
        if (data.length < PAGE) break;
      }
      if (!cancelled) {
        setItems(all);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ───── Controls ─────
  const [teamFilter, setTeamFilter] = useState<string>(searchParams.get('team') || 'all');
  const [stages, setStages] = useState<DefectScheduleStage[]>(() => {
    const raw = searchParams.get('stages');
    if (!raw) return [...ALL_DEFECT_STAGE_KEYS];
    const parts = raw.split(',').filter(Boolean) as DefectScheduleStage[];
    const valid = parts.filter(s => (ALL_DEFECT_STAGE_KEYS as string[]).includes(s));
    return valid.length ? valid : [...ALL_DEFECT_STAGE_KEYS];
  });
  const [rangeDays, setRangeDays] = useState<number>(Number(searchParams.get('range') || 7));
  const [delayMode, setDelayMode] = useState<DelayMode>(() => {
    const raw = searchParams.get('delay');
    if (raw === 'shift-today' || raw === 'penalty' || raw === 'learned' || raw === 'optimistic') return raw;
    return 'optimistic';
  });

  const defaultTarget = useMemo(() => addDays(dataDate, 30), [dataDate]);
  const [target, setTarget] = useState<Date>(() => {
    const raw = searchParams.get('target');
    if (raw) return new Date(`${raw}T00:00:00`);
    return new Date(`${defaultTarget}T00:00:00`);
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const targetIso = format(target, 'yyyy-MM-dd');

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDel = (k: string, v: string, def: string) => {
      if (!v || v === def) next.delete(k);
      else next.set(k, v);
    };
    setOrDel('team', teamFilter, 'all');
    setOrDel('stages', stages.length === ALL_DEFECT_STAGE_KEYS.length ? '' : stages.join(','), '');
    setOrDel('range', String(rangeDays), '7');
    setOrDel('target', targetIso, defaultTarget);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [teamFilter, stages, rangeDays, targetIso, defaultTarget, searchParams, setSearchParams]);

  const filteredItems = useMemo(
    () => teamFilter === 'all' ? items : items.filter(it => it.team === teamFilter),
    [items, teamFilter],
  );

  const rangeStart = useMemo(
    () => (rangeDays >= 0 ? dataDate : addDays(dataDate, rangeDays)),
    [dataDate, rangeDays],
  );
  const rangeEnd = useMemo(
    () => (rangeDays >= 0 ? addDays(dataDate, rangeDays) : dataDate),
    [dataDate, rangeDays],
  );

  const series = useMemo(
    () => buildDefectSimulationSeries(filteredItems, rangeStart, rangeEnd, dataDate),
    [filteredItems, rangeStart, rangeEnd, dataDate],
  );

  const stageResults = useMemo(
    () => simulateAllDefectStages(filteredItems, targetIso, ALL_DEFECT_STAGE_KEYS),
    [filteredItems, targetIso],
  );

  const teamRows = useMemo(
    () => simulateByTeam(filteredItems, targetIso),
    [filteredItems, targetIso],
  );

  const goRawRemaining = (stage: DefectScheduleStage) => {
    const sp = new URLSearchParams({
      source: 'simulation',
      stage,
      asOf: targetIso,
      overdue: 'true',
    });
    if (teamFilter !== 'all') sp.set('team', teamFilter);
    navigate(`/defects/raw-data?${sp.toString()}`);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <FlaskConical className="h-5 w-5 text-primary" />
            Defect Simulation
          </h1>
          <p className="text-xs text-muted-foreground">
            Quantity-based cumulative progress forecast per stage · Data Date{' '}
            <span className="font-medium">{dataDate}</span>
            {dataDateSource === 'fallback' && ' (fallback)'} · Target{' '}
            <span className="font-medium">{targetIso}</span> · N ={' '}
            <span className="font-medium">{filteredItems.length}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/defects/progress')}>
          <TrendingUp className="mr-1.5 h-4 w-4" />
          Open Progress
        </Button>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Target Date</span>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-[180px] justify-start font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {targetIso}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={target}
                  onSelect={(d) => { if (d) { setTarget(d); setPickerOpen(false); } }}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Team</span>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {ALL_TEAMS.map(t => (
                  <SelectItem key={t} value={t}>{TEAM_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Stages</span>
            <ToggleGroup
              type="multiple"
              value={stages}
              onValueChange={(v) => {
                const next = (v as DefectScheduleStage[]).filter(s => (ALL_DEFECT_STAGE_KEYS as string[]).includes(s));
                setStages(next.length ? ALL_DEFECT_STAGE_KEYS.filter(k => next.includes(k)) : [...ALL_DEFECT_STAGE_KEYS]);
              }}
              className="gap-1"
            >
              {ALL_DEFECT_STAGE_KEYS.map(s => (
                <ToggleGroupItem key={s} value={s} className="h-9 px-3 text-xs">
                  {DEFECT_STAGE_LABELS[s]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Chart Range</span>
            <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-14">-14 days</SelectItem>
                <SelectItem value="-7">-7 days</SelectItem>
                <SelectItem value="-3">-3 days</SelectItem>
                <SelectItem value="3">+3 days</SelectItem>
                <SelectItem value="7">+7 days</SelectItem>
                <SelectItem value="14">+14 days</SelectItem>
                <SelectItem value="21">+21 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-[400px] w-full" />
      ) : filteredItems.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No defects in scope.</CardContent></Card>
      ) : (
        <>
          {/* Stage summary cards */}
          <div className="grid gap-3 md:grid-cols-3">
            {stages.map(st => {
              const r = stageResults[st];
              return (
                <Card key={st} className="relative overflow-hidden">
                  <div
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ background: STAGE_COLORS[st] }}
                  />
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {DEFECT_STAGE_LABELS[st]}
                      </span>
                      <Badge variant="outline" className="text-[10px]">@ {targetIso}</Badge>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-bold tabular-nums" style={{ color: STAGE_COLORS[st] }}>
                        {r.predictedPct.toFixed(1)}%
                      </span>
                      <span className="text-xs text-muted-foreground">predicted</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <Stat label="Done now" value={`${r.actualPct.toFixed(1)}%`} sub={`${r.doneActual}/${r.total}`} />
                      <Stat label="Plan" value={`${r.planPct.toFixed(1)}%`} sub={`${r.planOnly}/${r.total}`} />
                      <Stat
                        label="Gap vs Plan"
                        value={`${r.gapPct >= 0 ? '+' : ''}${r.gapPct.toFixed(1)}%`}
                        valueClass={r.gapPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}
                      />
                      <Stat label="Forecast new" value={`${r.forecast}`} sub="not-done · planned ≤ target" />
                    </div>
                    {r.noPlan > 0 && (
                      <div className="mt-2 flex items-center gap-1 rounded-sm bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        {r.noPlan} item(s) without planned date — never reaches 100%
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-7 px-2 text-xs"
                      onClick={() => goRawRemaining(st)}
                    >
                      View remaining →
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Line chart */}
          <Card>
            <CardContent className="p-3">
              <div className="mb-2 px-1 text-sm font-medium">Cumulative Progress (%)</div>
              <div className="h-[360px] w-full">
                <ResponsiveContainer>
                  <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => v.slice(5)}
                      minTickGap={20}
                    />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip
                      contentStyle={{ fontSize: 12 }}
                      formatter={(v: number | null) => v == null ? '—' : `${v.toFixed(1)}%`}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine x={dataDate} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" label={{ value: 'Data Date', fontSize: 10, position: 'insideTopRight' }} />
                    <ReferenceLine x={targetIso} stroke="hsl(var(--primary))" strokeDasharray="3 3" label={{ value: 'Target', fontSize: 10, position: 'insideTopRight' }} />
                    {stages.map(st => (
                      <Line
                        key={`${st}-plan`}
                        type="monotone"
                        dataKey={`${st}_plan`}
                        name={`${DEFECT_STAGE_LABELS[st]} · Plan`}
                        stroke={STAGE_COLORS[st]}
                        strokeDasharray="4 3"
                        dot={false}
                        strokeWidth={1.5}
                        connectNulls
                      />
                    ))}
                    {stages.map(st => (
                      <Line
                        key={`${st}-actual`}
                        type="monotone"
                        dataKey={`${st}_actual`}
                        name={`${DEFECT_STAGE_LABELS[st]} · Actual`}
                        stroke={STAGE_COLORS[st]}
                        dot={false}
                        strokeWidth={2.5}
                        connectNulls
                      />
                    ))}
                    {stages.map(st => (
                      <Line
                        key={`${st}-pred`}
                        type="monotone"
                        dataKey={`${st}_predicted`}
                        name={`${DEFECT_STAGE_LABELS[st]} · Predicted`}
                        stroke={STAGE_COLORS[st]}
                        strokeDasharray="1 3"
                        dot={false}
                        strokeWidth={2}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Detail table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Done now</TableHead>
                    <TableHead className="text-right">Plan @ Target</TableHead>
                    <TableHead className="text-right">Predicted @ Target</TableHead>
                    <TableHead className="text-right">Gap</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">No-plan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stages.map(st => {
                    const r = stageResults[st];
                    const remaining = r.total - r.predicted;
                    return (
                      <TableRow key={st}>
                        <TableCell className="font-medium">{DEFECT_STAGE_LABELS[st]}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.actualPct.toFixed(1)}% <span className="text-xs text-muted-foreground">({r.doneActual})</span></TableCell>
                        <TableCell className="text-right tabular-nums">{r.planPct.toFixed(1)}% <span className="text-xs text-muted-foreground">({r.planOnly})</span></TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{r.predictedPct.toFixed(1)}% <span className="text-xs text-muted-foreground">({r.predicted})</span></TableCell>
                        <TableCell className={cn('text-right tabular-nums', r.gapPct >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                          {r.gapPct >= 0 ? '+' : ''}{r.gapPct.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => goRawRemaining(st)}>
                            {remaining}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.noPlan}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Team breakdown */}
          {teamRows.length > 1 && (
            <Card>
              <CardContent className="p-0">
                <div className="border-b px-4 py-2 text-sm font-medium">Team Breakdown · Predicted % @ {targetIso}</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      {stages.map(st => (
                        <TableHead key={st} className="text-right">{DEFECT_STAGE_LABELS[st]}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamRows.map(tr => (
                      <TableRow key={tr.team}>
                        <TableCell className="font-medium">{tr.team}</TableCell>
                        <TableCell className="text-right tabular-nums">{tr.count}</TableCell>
                        {stages.map(st => {
                          const v = tr[st].predictedPct;
                          return (
                            <TableCell
                              key={st}
                              className="text-right tabular-nums"
                              style={{ background: heat(v) }}
                            >
                              {v.toFixed(1)}%
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <span className={cn('font-medium tabular-nums', valueClass)}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

/** Heatmap-ish background, low → red, high → green. */
function heat(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  // 0 → red(0), 100 → green(140)
  const hue = (clamped / 100) * 140;
  return `hsl(${hue.toFixed(0)} 70% 92%)`;
}
