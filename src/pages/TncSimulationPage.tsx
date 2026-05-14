import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, FlaskConical, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { SimulationLineChart } from '@/components/simulation/SimulationLineChart';
import { ToAchieveBand } from '@/components/simulation/ToAchieveBand';
import { QtyVsPlanBanner } from '@/components/simulation/QtyVsPlanBanner';

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
import { useLatestSubtestDataDate } from '@/hooks/useLatestSubtestDataDate';
import type { SubtestForDashboard } from '@/lib/dashboard-utils';
import {
  ALL_TNC_SIM_STAGES,
  TNC_SIM_STAGE_LABELS,
  addDays,
  buildTncSimulationSeries,
  computeStageLagDays,
  simulateAllTncStages,
  simulateByTeam,
  DELAY_MODE_LABELS,
  type TncSimStage,
  type DelayMode,
  type SimOptions,
} from '@/lib/tnc-simulation';

const STAGE_COLORS: Record<TncSimStage, string> = {
  t1: 'hsl(var(--chart-1, 215 90% 55%))',
  t2: 'hsl(var(--chart-2, 142 70% 45%))',
  r1: 'hsl(var(--chart-3, 25 90% 55%))',
  r2a: 'hsl(var(--chart-4, 280 70% 55%))',
};

export default function TncSimulationPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { dataDate, source: dataDateSource } = useLatestSubtestDataDate();

  const [items, setItems] = useState<SubtestForDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastCalcAt, setLastCalcAt] = useState<Date | null>(null);

  const loadData = useMemo(() => async () => {
    setLoading(true);
    let all: SubtestForDashboard[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data } = await (supabase as any)
        .from('subtests')
        .select('*')
        .order('item_no')
        .range(from, from + PAGE - 1);
      if (!data?.length) break;
      all = all.concat(data as SubtestForDashboard[]);
      if (data.length < PAGE) break;
    }
    setItems(all);
    setLastCalcAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ───── Controls ─────
  const [teamFilter, setTeamFilter] = useState<string>(searchParams.get('team') || 'all');
  const [stages, setStages] = useState<TncSimStage[]>(() => {
    const raw = searchParams.get('stages');
    if (!raw) return [...ALL_TNC_SIM_STAGES];
    const parts = raw.split(',').filter(Boolean) as TncSimStage[];
    const valid = parts.filter(s => (ALL_TNC_SIM_STAGES as string[]).includes(s));
    return valid.length ? valid : [...ALL_TNC_SIM_STAGES];
  });
  const [rangeDays, setRangeDays] = useState<number>(Number(searchParams.get('range') || 7));
  const [delayMode, setDelayMode] = useState<DelayMode>(() => {
    const raw = searchParams.get('delay');
    if (raw === 'shift-today' || raw === 'penalty' || raw === 'learned' || raw === 'optimistic') return raw;
    return 'penalty';
  });

  // Default target: fixed to 2026-05-22 regardless of data date.
  // Overridden by ?target= URL param when present.
  const defaultTarget = '2026-05-22';
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
    setOrDel('stages', stages.length === ALL_TNC_SIM_STAGES.length ? '' : stages.join(','), '');
    setOrDel('range', String(rangeDays), '7');
    setOrDel('target', targetIso, defaultTarget);
    setOrDel('delay', delayMode, 'penalty');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [teamFilter, stages, rangeDays, targetIso, defaultTarget, delayMode, searchParams, setSearchParams]);

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

  // S1: compute lag from the full population (not the team-filtered subset).
  // Otherwise small teams silently fall below n=5 and learned mode degrades to optimistic.
  const lagDays = useMemo(() => computeStageLagDays(items), [items]);
  const opts: SimOptions = useMemo(
    () => ({ mode: delayMode, dataDate, lagDays, enforceSequential: true }),
    [delayMode, dataDate, lagDays],
  );

  const series = useMemo(
    () => buildTncSimulationSeries(filteredItems, rangeStart, rangeEnd, dataDate, opts),
    [filteredItems, rangeStart, rangeEnd, dataDate, opts],
  );

  const stageResults = useMemo(
    () => simulateAllTncStages(filteredItems, targetIso, opts, ALL_TNC_SIM_STAGES),
    [filteredItems, targetIso, opts],
  );

  const teamRows = useMemo(
    () => simulateByTeam(filteredItems, targetIso, opts),
    [filteredItems, targetIso, opts],
  );

  const goRawRemaining = (stage: TncSimStage) => {
    // B2: route to SubtestList using the new generic "remaining" filter so
    // it works for all 4 stages (incl. R1/R2A) and means
    // "stage's actual completion not reached by <asOf>".
    const sp = new URLSearchParams({
      source: 'simulation',
      remaining_stage: stage,
      remaining_asof: targetIso,
    });
    if (teamFilter !== 'all') sp.set('team', teamFilter);
    navigate(`/tc/raw-data?${sp.toString()}`);
  };

  const forecastSubLabel = (() => {
    switch (delayMode) {
      case 'optimistic':  return 'not-done · planned ≤ target';
      case 'shift-today': return 'not-done · planned (or today) ≤ target';
      case 'penalty':     return 'not-done · on-time planned ≤ target';
      case 'learned':     return 'not-done · planned + lag ≤ target';
    }
  })();

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <FlaskConical className="h-5 w-5 text-primary" />
            T&amp;C Simulation
          </h1>
          <p className="text-xs text-muted-foreground">
            Quantity-based cumulative progress forecast per stage · Data Date{' '}
            <span className="font-medium">{dataDate}</span>
            {dataDateSource === 'fallback' && ' (fallback)'} · Target{' '}
            <span className="font-medium">{targetIso}</span> · N ={' '}
            <span className="font-medium">{filteredItems.length}</span>
            {lastCalcAt && (
              <> · Last calculated <span className="font-medium">{lastCalcAt.toLocaleTimeString()}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            Recalculate
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/tc/progress')}>
            <TrendingUp className="mr-1.5 h-4 w-4" />
            Open Progress
          </Button>
        </div>
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
                const next = (v as TncSimStage[]).filter(s => (ALL_TNC_SIM_STAGES as string[]).includes(s));
                setStages(next.length ? ALL_TNC_SIM_STAGES.filter(k => next.includes(k)) : [...ALL_TNC_SIM_STAGES]);
              }}
              className="gap-1"
            >
              {ALL_TNC_SIM_STAGES.map(s => (
                <ToggleGroupItem key={s} value={s} className="h-9 px-3 text-xs">
                  {TNC_SIM_STAGE_LABELS[s]}
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

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Delay Handling</span>
            <Select value={delayMode} onValueChange={(v) => setDelayMode(v as DelayMode)}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="optimistic">{DELAY_MODE_LABELS.optimistic}</SelectItem>
                <SelectItem value="shift-today">{DELAY_MODE_LABELS['shift-today']}</SelectItem>
                <SelectItem value="penalty">{DELAY_MODE_LABELS.penalty}</SelectItem>
                <SelectItem value="learned">{DELAY_MODE_LABELS.learned}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-[400px] w-full" />
      ) : filteredItems.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No subtests in scope.</CardContent></Card>
      ) : (
        <>
          {/* Stage summary cards */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
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
                        {TNC_SIM_STAGE_LABELS[st]}
                      </span>
                      <Badge variant="outline" className="text-[10px]">@ {targetIso}</Badge>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-bold tabular-nums" style={{ color: STAGE_COLORS[st] }}>
                        {r.predictedPct.toFixed(1)}%
                      </span>
                      <span className="text-xs text-muted-foreground">predicted</span>
                    </div>
                    <QtyVsPlanBanner count={r.behindNowCount} pct={r.behindNowPct} dataDate={dataDate} />
                    {r.delayedCount > 0 && (() => {
                      const days = Math.max(0, Math.round((Date.parse(targetIso) - Date.parse(dataDate)) / 86400000));
                      const includesDelayed = delayMode !== 'penalty';
                      const recoverPerDay = delayMode === 'penalty' && days > 0
                        ? Math.ceil((Math.max(0, r.predicted - r.doneActual) + r.delayedCount) / days)
                        : null;
                      return (
                        <div className="mt-2 rounded-sm bg-rose-50 px-2 py-1 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {r.delayedCount} delayed ·{' '}
                            {delayMode === 'optimistic' && 'kept at original planned date'}
                            {delayMode === 'shift-today' && `shifted to ${dataDate}`}
                            {delayMode === 'penalty' && 'excluded from forecast'}
                            {delayMode === 'learned' && `shifted +${Math.round(lagDays[st] ?? 0)}d (avg lag)`}
                          </div>
                          {includesDelayed && (
                            <div className="pl-4 text-[10px] opacity-80">
                              incl. {r.delayedCount} delayed item{r.delayedCount === 1 ? '' : 's'} in daily target
                            </div>
                          )}
                          {recoverPerDay !== null && (
                            <div className="pl-4 text-[10px] opacity-90">
                              excl. {r.delayedCount} delayed · to recover: ~{recoverPerDay}/day
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <ToAchieveBand
                      doneActual={r.doneActual}
                      predicted={r.predicted}
                      actualPct={r.actualPct}
                      predictedPct={r.predictedPct}
                      dataDate={dataDate}
                      targetIso={targetIso}
                      color={STAGE_COLORS[st]}
                    />
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <Stat label="Done now" value={`${r.actualPct.toFixed(1)}%`} sub={`${r.doneActual}/${r.total}`} />
                      <Stat label="Plan" value={`${r.planPct.toFixed(1)}%`} sub={`${r.planOnly}/${r.total}`} />
                      <Stat
                        label="Gap @ Target"
                        value={`${r.gapPct >= 0 ? '+' : ''}${r.gapPct.toFixed(1)}%`}
                        valueClass={r.gapPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}
                      />
                      <Stat label="Forecast new" value={`${r.forecast}`} sub={forecastSubLabel} />
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
              <SimulationLineChart
                data={series}
                stages={stages.map(st => ({
                  key: st,
                  label: TNC_SIM_STAGE_LABELS[st],
                  color: STAGE_COLORS[st],
                }))}
                dataDate={dataDate}
                targetIso={targetIso}
              />
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
                        <TableCell className="font-medium">{TNC_SIM_STAGE_LABELS[st]}</TableCell>
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
                        <TableHead key={st} className="text-right">{TNC_SIM_STAGE_LABELS[st]}</TableHead>
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
  const hue = (clamped / 100) * 140;
  return `hsl(${hue.toFixed(0)} 70% 92%)`;
}
