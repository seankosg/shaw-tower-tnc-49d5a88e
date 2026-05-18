import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { AutoRefreshControl } from '@/components/dashboard/AutoRefreshControl';
import { useHeaderSlot } from '@/contexts/HeaderSlotContext';
import { useNavigate } from 'react-router-dom';
import {
  ListChecks,
  Wrench, CalendarArrowUp, CalendarArrowDown,
  Package, Hammer, PencilRuler,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { PunchItem } from '@/lib/punch-excel-utils';
import { PUNCH_HEALTH_LABEL, PUNCH_GATE_LABEL, type PunchHealthStatus } from '@/lib/punch-field-registry';
import {
  isCompleted, isWip, isNotStarted, isCompletionOverdue, isStartDelayed,
  isCriticalDelay, isBehindSchedule, isBlockedByPreEng, isReadyButNotStarted,
  isDueWithin, isPlannedToStartWithin, dominantBlocker, blockersFor,
  weightedProgress, simpleAverageProgress, groupProgressMatrix, recoveryPriorityScore,
  suggestedRecoveryAction, computePunchDqCounts, PUNCH_DQ_LABEL, topDelayingParties,
  summarizeByCriticalLevel, CRITICAL_LEVEL_ACCENT,
  type PunchBlockerKind, type PunchDqKey, type CriticalLevelSummary,
} from '@/lib/punch-dashboard-utils';

const PAGE_SIZE = 1000;

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDashDate(iso?: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const mon = MONTH_ABBR[Number(mo) - 1] ?? mo;
  const currentYear = new Date().getFullYear();
  return Number(y) === currentYear ? `${d}-${mon}` : `${d}-${mon}-${y}`;
}
const HEALTH_COLORS: Record<PunchHealthStatus, string> = {
  ahead: 'bg-emerald-500',
  on_track: 'bg-blue-500',
  behind: 'bg-amber-500',
  critical: 'bg-red-500',
};

type GroupBy = 'team' | 'main_trade' | 'subcontractor_name' | 'hdec_pic_name';
const GROUP_LABEL: Record<GroupBy, string> = {
  team: 'Team',
  main_trade: 'Main Trade',
  subcontractor_name: 'Subcontractor',
  hdec_pic_name: 'HDEC PIC',
};

type SortKey = 'overdue' | 'critical' | 'variance' | 'remaining' | 'completion';

export default function PunchDashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<PunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('team');
  const [sortKey, setSortKey] = useState<SortKey>('overdue');
  const [lookahead, setLookahead] = useState<'7' | '14'>('7');

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const fetchData = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    const all: PunchItem[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('punch_items').select('*').eq('is_active', true)
        .order('item_no', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...(data as PunchItem[]));
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    if (!mountedRef.current) return;
    setRows(all);
    if (!opts.silent) setLoading(false);
  }, [toast]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const autoRefresh = useAutoRefresh({
    storageKey: 'punch',
    onRefresh: () => fetchData({ silent: true }),
  });

  useHeaderSlot(
    <AutoRefreshControl state={autoRefresh} />,
    [autoRefresh.enabled, autoRefresh.intervalMs, autoRefresh.lastUpdatedAt, autoRefresh.isRefreshing],
  );

  const asOf = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const total = rows.length;
    const completed = rows.filter(isCompleted).length;
    const wip = rows.filter(isWip).length;
    const notStarted = rows.filter(isNotStarted).length;
    const blocked = rows.filter(isBlockedByPreEng).length;
    const overdue = rows.filter((r) => isCompletionOverdue(r, asOf)).length;
    const startDelayed = rows.filter((r) => isStartDelayed(r, asOf)).length;
    const critical = rows.filter((r) => isCriticalDelay(r, asOf)).length;
    const behind = rows.filter(isBehindSchedule).length;
    const dueThisWeek = rows.filter((r) => isDueWithin(r, 7, asOf)).length;
    const due14 = rows.filter((r) => isDueWithin(r, 14, asOf)).length;
    const startThisWeek = rows.filter((r) => isPlannedToStartWithin(r, 7, asOf)).length;
    const wipDueSoon = rows.filter((r) => isWip(r) && isDueWithin(r, 7, asOf)).length;
    const readyButNotStarted = rows.filter(isReadyButNotStarted).length;

    const w = weightedProgress(rows);
    const avg = simpleAverageProgress(rows);

    const health: Record<PunchHealthStatus, number> = { ahead: 0, on_track: 0, behind: 0, critical: 0 };
    rows.forEach((r) => { if (r.health_status) health[r.health_status]++; });

    const blockerCounts: Record<PunchBlockerKind | 'multiple', number> = {
      material_approval: 0, material_procurement: 0, drawing_approval: 0, mos_approval: 0, multiple: 0,
    };
    rows.forEach((r) => {
      const bs = blockersFor(r);
      if (bs.length === 1) blockerCounts[bs[0]]++;
      else if (bs.length > 1) blockerCounts.multiple++;
    });

    const gates = {
      material_approval: { approved: 0, pending: 0, not_required: 0 },
      material_procurement: { secured: 0, partially_secured: 0, pending: 0, not_required: 0 },
      drawing_approval: { approved: 0, pending: 0, not_required: 0 },
      mos_approval: { approved: 0, pending: 0, not_required: 0 },
    };
    rows.forEach((r) => {
      (gates.material_approval as any)[r.material_approval_status]++;
      (gates.material_procurement as any)[r.material_procurement_status]++;
      (gates.drawing_approval as any)[r.drawing_approval_status]++;
      (gates.mos_approval as any)[r.mos_approval_status]++;
    });

    return {
      total, completed, wip, notStarted, blocked, overdue, startDelayed, critical, behind,
      dueThisWeek, due14, startThisWeek, wipDueSoon, readyButNotStarted,
      w, avg, health, blockerCounts, gates,
    };
  }, [rows, asOf]);

  const matrix = useMemo(() => {
    const m = groupProgressMatrix(rows, (r) => String((r as any)[groupBy] ?? ''), asOf);
    const sorted = [...m].sort((a, b) => {
      switch (sortKey) {
        case 'critical': return b.critical - a.critical;
        case 'variance': return a.variance - b.variance;
        case 'remaining': return b.remaining - a.remaining;
        case 'completion': return a.completionPct - b.completionPct;
        default: return b.overdue - a.overdue;
      }
    });
    return sorted;
  }, [rows, groupBy, sortKey, asOf]);

  const recovery = useMemo(() => {
    return [...rows]
      .filter((r) => !isCompleted(r))
      .map((r) => ({ r, score: recoveryPriorityScore(r, asOf) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
  }, [rows, asOf]);

  const dqCounts = useMemo(() => computePunchDqCounts(rows), [rows]);
  const criticalLevelSummary = useMemo(() => summarizeByCriticalLevel(rows), [rows]);
  const topSubcons = useMemo(() => topDelayingParties(rows, (r) => r.subcontractor_name ?? '', 5, asOf), [rows, asOf]);
  const topPics = useMemo(() => topDelayingParties(rows, (r) => r.hdec_pic_name ?? '', 5, asOf), [rows, asOf]);

  const go = (qs: string) => navigate(`/punch/raw-data?${qs}`);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Punch (Minor O/S Work) — Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading ? 'Loading…' : `${stats.total} items tracked · as of ${asOf}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/punch/raw-data')}>Open Raw Data</Button>
        </div>
      </div>

      {/* ── Tier 1: Progress (진도율) ───────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <ProgressKpiCard
          label="Completion"
          percent={stats.total ? (stats.completed / stats.total) * 100 : 0}
          sub={`${stats.completed.toLocaleString()} / ${stats.total.toLocaleString()} items`}
          barTone="emerald"
          onClick={() => go('completionStatus=Completed')}
        />
        <ProgressKpiCard
          label="Weighted Actual"
          percent={stats.w.actual}
          sub="Progress (weighted by qty)"
          barTone="emerald"
        />
        <ProgressKpiCard
          label="Weighted Planned"
          percent={stats.w.planned}
          sub="Plan as of today"
          barTone="neutral"
        />
        <VarianceKpiCard
          label="Variance"
          value={stats.w.variance}
          sub="Actual − Planned"
        />
      </div>

      {/* ── Tier 1.5: Status Mix ────────────────────────────────────────── */}
      <StatusMixBar
        total={stats.total}
        completed={stats.completed}
        wip={stats.wip}
        notStarted={stats.notStarted}
        onSegmentClick={(seg) => {
          if (seg === 'completed') go('completionStatus=Completed');
          else if (seg === 'wip') go('completionStatus=WIP');
          else go('completionStatus=Not Started');
        }}
      />

      {/* ── Tier 2: Risk & Delay (우려사항) ─────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <RiskKpiCard
          label="Overdue"
          count={stats.overdue}
          percent={pctNum(stats.overdue, stats.total)}
          sub="Past planned completion"
          tone="danger"
          onClick={() => go('status=overdue')}
        />
        <RiskKpiCard
          label="Critical Delay"
          count={stats.critical}
          percent={pctNum(stats.critical, stats.total)}
          sub=">14d overdue or Critical"
          tone="danger"
          onClick={() => go('health=critical')}
        />
        <RiskKpiCard
          label="Behind Schedule"
          count={stats.behind}
          percent={pctNum(stats.behind, stats.total)}
          sub="Health = behind"
          tone="warning"
          onClick={() => go('health=behind')}
        />
        <RiskKpiCard
          label="Pre-Eng Blocked"
          count={stats.blocked}
          percent={pctNum(stats.blocked, stats.total)}
          sub="Awaiting pre-engineering"
          tone="warning"
          onClick={() => go('pre_eng=blocked')}
        />
      </div>

      {/* ── Critical Level Summary (Summary of Work) ───────────────────── */}
      {criticalLevelSummary.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Summary of Work</CardTitle>
            <p className="text-xs text-muted-foreground">
              Items grouped by Critical Level with main category, Pre-Engineering readiness,
              schedule window and overall weighted progress.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {criticalLevelSummary.map((s) => (
              <CriticalLevelRowCard key={s.level} summary={s} go={go} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Progress Overview + Health ─────────────────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Progress Overview {stats.w.hasWeight && <Badge variant="outline" className="ml-2 text-[10px]">weighted</Badge>}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressLine label="Weighted Planned" value={stats.w.planned} />
            <ProgressLine label="Weighted Actual" value={stats.w.actual} accent="emerald" />
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Weighted Variance (Actual − Planned)</div>
              <div className={cn('text-2xl font-semibold tabular-nums mt-1',
                stats.w.variance >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {signed(stats.w.variance)}%
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="rounded-md border p-2">
                <div>Simple Avg Planned</div>
                <div className="text-base font-medium text-foreground tabular-nums">{stats.avg.planned.toFixed(1)}%</div>
              </div>
              <div className="rounded-md border p-2">
                <div>Simple Avg Actual</div>
                <div className="text-base font-medium text-foreground tabular-nums">{stats.avg.actual.toFixed(1)}%</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {false && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Health Distribution</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(stats.health) as PunchHealthStatus[]).map((h) => {
              const count = stats.health[h];
              const p = stats.total ? (count / stats.total) * 100 : 0;
              return (
                <button key={h} onClick={() => go(`health=${h}`)} className="w-full text-left">
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{PUNCH_HEALTH_LABEL[h]}</span>
                    <span className="text-muted-foreground tabular-nums">{count} ({p.toFixed(0)}%)</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full transition-all', HEALTH_COLORS[h])} style={{ width: `${p}%` }} />
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
        )}
      </div>

      {false && (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Schedule Control</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <ControlCell label="Start Delayed" value={stats.startDelayed} hint="Planned start passed, no actual start" tone="warning" onClick={() => go('status=start_delayed')} />
          <ControlCell label="Completion Overdue" value={stats.overdue} hint="Past planned completion" tone="danger" onClick={() => go('status=overdue')} />
          <ControlCell label="Due This Week" value={stats.dueThisWeek} hint="Planned within 7 days" onClick={() => go('due=this_week')} />
          <ControlCell label="Critical Delay" value={stats.critical} hint=">14 days overdue or Critical health" tone="danger" onClick={() => go('status=critical')} />
        </CardContent>
      </Card>
      )}

      {/* ── Pre-Engineering Readiness ──────────────────────────────────── */}
      {false && (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Pre-Engineering Readiness</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <ControlCell label="Material Approval Pending" value={stats.blockerCounts.material_approval}
            tone={stats.blockerCounts.material_approval ? 'warning' : undefined}
            onClick={() => go('blocker=material_approval')} />
          <ControlCell label="Material Procurement Pending" value={stats.blockerCounts.material_procurement}
            tone={stats.blockerCounts.material_procurement ? 'warning' : undefined}
            onClick={() => go('blocker=material_procurement')} />
          <ControlCell label="Drawing Approval Pending" value={stats.blockerCounts.drawing_approval}
            tone={stats.blockerCounts.drawing_approval ? 'warning' : undefined}
            onClick={() => go('blocker=drawing_approval')} />
          <ControlCell label="MOS Approval Pending" value={stats.blockerCounts.mos_approval}
            tone={stats.blockerCounts.mos_approval ? 'warning' : undefined}
            onClick={() => go('blocker=mos_approval')} />
          <ControlCell label="Multiple Blockers" value={stats.blockerCounts.multiple}
            tone={stats.blockerCounts.multiple ? 'danger' : undefined}
            onClick={() => go('blocker=multiple')} />
          <ControlCell label="Ready · Not Started" value={stats.readyButNotStarted}
            hint="Pre-eng done but field work not started"
            onClick={() => go('status=ready_not_started')} />
        </CardContent>
      </Card>
      )}

      {/* Existing detailed gate breakdown */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Pre-Engineering Gates (Detail)</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <GateBreakdown title="Material Approval" data={stats.gates.material_approval} total={stats.total} />
          <GateBreakdown title="Material Procurement" data={stats.gates.material_procurement} total={stats.total} />
          <GateBreakdown title="Drawing Approval" data={stats.gates.drawing_approval} total={stats.total} />
          <GateBreakdown title="MOS Approval" data={stats.gates.mos_approval} total={stats.total} />
        </CardContent>
      </Card>

      {/* ── Lookahead ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Lookahead</CardTitle>
          <Tabs value={lookahead} onValueChange={(v) => setLookahead(v as '7' | '14')}>
            <TabsList className="h-7">
              <TabsTrigger value="7" className="text-xs px-2 py-0.5">7 days</TabsTrigger>
              <TabsTrigger value="14" className="text-xs px-2 py-0.5">14 days</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <Tabs value={lookahead}>
            <TabsContent value="7" className="m-0 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <ControlCell label="Due in 7d" value={stats.dueThisWeek} onClick={() => go('due=this_week')} />
              <ControlCell label="Planned to Start ≤7d" value={stats.startThisWeek} onClick={() => go('start_due=7')} />
              <ControlCell label="WIP Due ≤7d" value={stats.wipDueSoon} onClick={() => go('status=wip&due=this_week')} />
              <ControlCell label="Should Have Started" value={stats.startDelayed} tone="warning" onClick={() => go('status=start_delayed')} />
            </TabsContent>
            <TabsContent value="14" className="m-0 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <ControlCell label="Due in 14d" value={stats.due14} onClick={() => go('due=next_14_days')} />
              <ControlCell label="Planned to Start ≤14d" value={rows.filter((r) => isPlannedToStartWithin(r, 14, asOf)).length} onClick={() => go('start_due=14')} />
              <ControlCell label="WIP Due ≤14d" value={rows.filter((r) => isWip(r) && isDueWithin(r, 14, asOf)).length} onClick={() => go('status=wip&due=next_14_days')} />
              <ControlCell label="Should Have Started" value={stats.startDelayed} tone="warning" onClick={() => go('status=start_delayed')} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Progress Matrix ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
          <CardTitle className="text-base">Progress Matrix</CardTitle>
          <div className="flex gap-2">
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(GROUP_LABEL) as GroupBy[]).map((k) =>
                  <SelectItem key={k} value={k} className="text-xs">Group: {GROUP_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="overdue" className="text-xs">Sort: Overdue ↓</SelectItem>
                <SelectItem value="critical" className="text-xs">Sort: Critical ↓</SelectItem>
                <SelectItem value="variance" className="text-xs">Sort: Variance ↑</SelectItem>
                <SelectItem value="remaining" className="text-xs">Sort: Remaining ↓</SelectItem>
                <SelectItem value="completion" className="text-xs">Sort: Completion% ↑</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{GROUP_LABEL[groupBy]}</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Done</TableHead>
                <TableHead className="text-right">WIP</TableHead>
                <TableHead className="text-right">Not Started</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Critical</TableHead>
                <TableHead className="text-right">Blocked</TableHead>
                <TableHead className="text-right">Comp.%</TableHead>
                <TableHead className="text-right">W.Planned</TableHead>
                <TableHead className="text-right">W.Actual</TableHead>
                <TableHead className="text-right">Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-6">No data.</TableCell></TableRow>
              ) : matrix.map((row) => {
                const param = groupParam(groupBy);
                const qs = `${param}=${encodeURIComponent(row.key)}`;
                return (
                  <TableRow key={row.key} className="cursor-pointer hover:bg-muted/40" onClick={() => go(qs)}>
                    <TableCell className="font-medium">{row.key}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700">{row.completed}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.wip}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.notStarted}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', row.overdue && 'text-red-600 font-medium')}>{row.overdue}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', row.critical && 'text-red-700 font-semibold')}>{row.critical}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', row.blocked && 'text-amber-600')}>{row.blocked}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.completionPct.toFixed(0)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{row.weightedPlanned.toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{row.weightedActual.toFixed(1)}%</TableCell>
                    <TableCell className={cn('text-right tabular-nums', row.variance >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {signed(row.variance)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Recovery Priority (hidden) ───────────────────────────────── */}
      {false && (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Today's Recovery Priority Items</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Score</TableHead>
                <TableHead>Item No</TableHead>
                <TableHead>Outstanding Works</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead>Subcon</TableHead>
                <TableHead>HDEC PIC</TableHead>
                <TableHead>Planned Comp.</TableHead>
                <TableHead className="text-right">Plan %</TableHead>
                <TableHead className="text-right">Act %</TableHead>
                <TableHead className="text-right">Var%</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Blocker</TableHead>
                <TableHead className="text-right">Days OD</TableHead>
                <TableHead>Suggested Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recovery.length === 0 ? (
                <TableRow><TableCell colSpan={16} className="text-center text-muted-foreground py-6">No items need attention.</TableCell></TableRow>
              ) : recovery.map(({ r, score }) => {
                const od = r.planned_completion_date && !r.actual_completion_date && r.planned_completion_date < asOf
                  ? Math.round((Date.parse(asOf) - Date.parse(r.planned_completion_date)) / 86_400_000) : 0;
                const plan = Number(r.planned_progress_pct) || 0;
                const act = Number(r.actual_progress_pct) || 0;
                const variance = act - plan;
                const blk = dominantBlocker(r);
                return (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/punch/${r.id}`)}>
                    <TableCell className="tabular-nums font-semibold">{Math.round(score)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.item_no}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={r.outstanding_work || ''}>{r.outstanding_work}</TableCell>
                    <TableCell className="text-xs max-w-[140px] truncate" title={(r as any).location || ''}>{(r as any).location || '—'}</TableCell>
                    <TableCell className="text-xs">{r.team || '—'}</TableCell>
                    <TableCell className="text-xs">{(r as any).main_trade || '—'}</TableCell>
                    <TableCell className="text-xs">{r.subcontractor_name || '—'}</TableCell>
                    <TableCell className="text-xs">{r.hdec_pic_name || '—'}</TableCell>
                    <TableCell className="text-xs tabular-nums">{formatDashDate(r.planned_completion_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{plan.toFixed(0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{act.toFixed(0)}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', variance < 0 ? 'text-red-600' : 'text-emerald-600')}>{signed(variance)}</TableCell>
                    <TableCell>{r.health_status
                      ? <Badge variant="outline" className={cn('text-[10px]', healthBadge(r.health_status))}>{PUNCH_HEALTH_LABEL[r.health_status]}</Badge>
                      : '—'}</TableCell>
                    <TableCell className="text-xs">{blk ? blk === 'multiple' ? 'Multiple' : blockerLabel(blk) : '—'}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', od > 0 && 'text-red-600 font-medium')}>{od || '—'}</TableCell>
                    <TableCell className="text-xs">{suggestedRecoveryAction(r, asOf)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      {/* ── Daily Meeting Action View (hidden) ───────────────────────── */}
      {false && (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Daily Meeting Action View</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <ControlCell label="Recovery Priority Items" value={recovery.length} hint="Top action list above" tone="danger" />
          <ControlCell label="Due This Week" value={stats.dueThisWeek} onClick={() => go('due=this_week')} />
          <ControlCell label="Blocked" value={stats.blocked} tone={stats.blocked ? 'warning' : undefined} onClick={() => go('pre_eng=blocked')} />
          <ControlCell label="Ready / Not Started" value={stats.readyButNotStarted} onClick={() => go('status=ready_not_started')} />
          <div className="md:col-span-2 lg:col-span-2 rounded-md border p-3">
            <div className="text-sm font-medium mb-2">Top Delaying Subcontractors</div>
            <div className="space-y-1">
              {topSubcons.length === 0
                ? <div className="text-xs text-muted-foreground">None.</div>
                : topSubcons.map((p) => (
                  <button key={p.key} onClick={() => go(`subcontractor=${encodeURIComponent(p.key)}`)}
                    className="w-full flex items-baseline justify-between text-xs hover:bg-muted/40 rounded px-1.5 py-1">
                    <span className="truncate max-w-[60%]">{p.key}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <span className="text-red-600">{p.critical}C</span> · <span className="text-amber-600">{p.overdue}O</span> · {p.blocked}B / {p.total}
                    </span>
                  </button>
                ))}
            </div>
          </div>
          <div className="md:col-span-2 lg:col-span-2 rounded-md border p-3">
            <div className="text-sm font-medium mb-2">Top Responsible HDEC PICs</div>
            <div className="space-y-1">
              {topPics.length === 0
                ? <div className="text-xs text-muted-foreground">None.</div>
                : topPics.map((p) => (
                  <button key={p.key} onClick={() => go(`hdecPic=${encodeURIComponent(p.key)}`)}
                    className="w-full flex items-baseline justify-between text-xs hover:bg-muted/40 rounded px-1.5 py-1">
                    <span className="truncate max-w-[60%]">{p.key}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <span className="text-red-600">{p.critical}C</span> · <span className="text-amber-600">{p.overdue}O</span> · {p.blocked}B / {p.total}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>
      )}



      {false && (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Punch Data Quality</CardTitle></CardHeader>
        <CardContent className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {(Object.keys(PUNCH_DQ_LABEL) as PunchDqKey[]).map((k) => (
            <ControlCell key={k} label={PUNCH_DQ_LABEL[k]} value={dqCounts[k]}
              tone={dqCounts[k] ? 'warning' : undefined}
              onClick={() => go(`dq=${k}`)} />
          ))}
        </CardContent>
      </Card>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function CriticalLevelRowCard({
  summary,
  go,
}: {
  summary: CriticalLevelSummary;
  go: (qs: string) => void;
}) {
  const accent = CRITICAL_LEVEL_ACCENT[summary.level];
  const levelParam = `criticalLevel=${encodeURIComponent(summary.level)}`;

  const catCount = (name: string) =>
    summary.mainCategories.find((c) => c.name === name)?.count ?? 0;

  const actual = Math.max(0, Math.min(100, Math.round(summary.progressActual)));

  const chipWidth = 'min-w-[8.5rem]';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card p-4',
        'cursor-pointer transition hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2',
        accent.ring,
      )}
      onClick={() => go(levelParam)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') go(levelParam); }}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1.5', accent.bar)} />
      <div className="pl-3 flex flex-col gap-3">
        <div className="flex items-start gap-4">
          <div className="flex flex-col gap-2 w-28 shrink-0">
            <span className="text-2xl font-bold tracking-tight text-foreground leading-tight">
              {summary.level}
            </span>
            <MetaChip icon={<ListChecks className="h-3.5 w-3.5" />} label="Items" value={summary.total.toLocaleString()} />
          </div>
          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <MetaChip icon={<Package className="h-3.5 w-3.5" />} label="Material" value={catCount('Material').toLocaleString()} className={chipWidth} />
              <MetaChip icon={<Hammer className="h-3.5 w-3.5" />} label="Physical Work" value={catCount('Physical Work').toLocaleString()} className={chipWidth} />
              <MetaChip icon={<PencilRuler className="h-3.5 w-3.5" />} label="Design" value={catCount('Design').toLocaleString()} className={chipWidth} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <MetaChip icon={<Wrench className="h-3.5 w-3.5" />} label="Pre-Eng" value={`${summary.preEngReady}/${summary.total}`} className={chipWidth} />
              <MetaChip icon={<CalendarArrowUp className="h-3.5 w-3.5" />} label="Earliest" value={formatDashDate(summary.earliestStart)} className={chipWidth} />
              <MetaChip icon={<CalendarArrowDown className="h-3.5 w-3.5" />} label="Latest" value={formatDashDate(summary.latestFinish)} className={chipWidth} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground w-32 shrink-0">
            Overall Progress
          </span>
          <Progress value={actual} className="h-2 flex-1" />
          <span className="text-sm font-semibold tabular-nums w-12 text-right">{actual}%</span>
        </div>
      </div>
    </div>
  );
}

function MetaChip({
  icon, label, value, className, title,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs',
        className,
      )}
      title={title}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground truncate">{value}</span>
    </span>
  );
}


function KpiCard({ label, value, icon, accent, accentTone, tone, onClick }: {
  label: string; value: number | string; icon?: React.ReactNode;
  accent?: string; accentTone?: 'pos' | 'neg';
  tone?: 'danger' | 'warning'; onClick?: () => void;
}) {
  const toneClass = tone === 'danger' ? 'border-red-300' : tone === 'warning' ? 'border-amber-300' : '';
  const interactive = onClick ? 'cursor-pointer hover:bg-muted/40' : '';
  return (
    <Card className={cn(toneClass, interactive)} onClick={onClick}>
      <CardContent className="pt-3 pb-3 px-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
          {icon}
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          {accent && (
            <div className={cn('text-[11px] tabular-nums',
              accentTone === 'pos' ? 'text-emerald-600' : accentTone === 'neg' ? 'text-red-600' : 'text-muted-foreground')}>
              {accent}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ControlCell({ label, value, hint, tone, onClick }: {
  label: string; value: number; hint?: string; tone?: 'danger' | 'warning'; onClick?: () => void;
}) {
  const toneClass = tone === 'danger' ? 'border-red-300 bg-red-50/40 dark:bg-red-950/20'
    : tone === 'warning' ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20' : '';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('rounded-md border p-3 text-left transition-colors hover:bg-muted/50', toneClass)}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </button>
  );
}

function ProgressLine({ label, value, accent }: { label: string; value: number; accent?: 'emerald' }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{value.toFixed(1)}%</span>
      </div>
      <Progress value={value} className={cn('mt-1 h-2', accent === 'emerald' && '[&>div]:bg-emerald-500')} />
    </div>
  );
}

function pctNum(n: number, d: number): number {
  return d > 0 ? (n / d) * 100 : 0;
}

function ProgressKpiCard({ label, percent, sub, barTone, onClick }: {
  label: string; percent: number; sub?: string;
  barTone?: 'emerald' | 'neutral'; onClick?: () => void;
}) {
  const pctSafe = Math.max(0, Math.min(100, percent));
  const barColor = barTone === 'emerald' ? 'bg-emerald-500' : 'bg-foreground/60';
  const interactive = onClick ? 'cursor-pointer hover:bg-muted/40 transition-colors' : '';
  return (
    <Card className={cn(interactive)} onClick={onClick}>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">{pctSafe.toFixed(1)}%</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full transition-all', barColor)} style={{ width: `${pctSafe}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function VarianceKpiCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const positive = value >= 0;
  const color = positive ? 'text-emerald-600' : 'text-red-600';
  const stripe = positive ? 'border-l-emerald-500' : 'border-l-red-500';
  return (
    <Card className={cn('border-l-4', stripe)}>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn('mt-1 text-3xl font-semibold tabular-nums', color)}>
          {positive ? '+' : ''}{value.toFixed(1)}%
        </div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        <div className="mt-3 text-[11px] text-muted-foreground">
          {positive ? 'Ahead of plan' : 'Behind plan'}
        </div>
      </CardContent>
    </Card>
  );
}

function RiskKpiCard({ label, count, percent, sub, tone, onClick }: {
  label: string; count: number; percent: number; sub?: string;
  tone?: 'danger' | 'warning'; onClick?: () => void;
}) {
  const stripe = tone === 'danger' ? 'border-l-red-500' : tone === 'warning' ? 'border-l-amber-500' : 'border-l-muted-foreground/30';
  const countColor = tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-700 dark:text-amber-500' : '';
  const interactive = onClick ? 'cursor-pointer hover:bg-muted/40 transition-colors' : '';
  return (
    <Card className={cn('border-l-4', stripe, interactive)} onClick={onClick}>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className={cn('text-3xl font-semibold tabular-nums', countColor)}>{count.toLocaleString()}</div>
          <div className="text-sm text-muted-foreground tabular-nums">{percent.toFixed(1)}%</div>
        </div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function StatusMixBar({ total, completed, wip, notStarted, onSegmentClick }: {
  total: number; completed: number; wip: number; notStarted: number;
  onSegmentClick?: (seg: 'completed' | 'wip' | 'not_started') => void;
}) {
  const pCompleted = pctNum(completed, total);
  const pWip = pctNum(wip, total);
  const pNot = pctNum(notStarted, total);
  const segments: Array<{ key: 'completed' | 'wip' | 'not_started'; label: string; count: number; pct: number; color: string }> = [
    { key: 'completed', label: 'Completed', count: completed, pct: pCompleted, color: 'bg-emerald-500' },
    { key: 'wip', label: 'WIP', count: wip, pct: pWip, color: 'bg-blue-500' },
    { key: 'not_started', label: 'Not Started', count: notStarted, pct: pNot, color: 'bg-muted-foreground/40' },
  ];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Status Mix</div>
          <div className="text-xs text-muted-foreground tabular-nums">Total {total.toLocaleString()}</div>
        </div>
        <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {segments.map((s) => s.pct > 0 && (
            <button
              key={s.key}
              type="button"
              onClick={() => onSegmentClick?.(s.key)}
              className={cn('h-full transition-opacity hover:opacity-80', s.color)}
              style={{ width: `${s.pct}%` }}
              title={`${s.label}: ${s.count} (${s.pct.toFixed(1)}%)`}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
          {segments.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-sm', s.color)} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-medium tabular-nums">{s.count.toLocaleString()}</span>
              <span className="text-muted-foreground tabular-nums">({s.pct.toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function GateBreakdown({ title, data, total }: { title: string; data: Record<string, number>; total: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="space-y-1">
        {Object.entries(data).map(([status, count]) => {
          const p = total ? (count / total) * 100 : 0;
          const label = (PUNCH_GATE_LABEL as any)[status] ?? status.replace(/_/g, ' ');
          const color = status === 'approved' || status === 'secured' ? 'bg-emerald-500'
            : status === 'pending' ? 'bg-amber-500'
            : status === 'partially_secured' ? 'bg-blue-500'
            : 'bg-muted-foreground/30';
          return (
            <div key={status}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="capitalize">{label}</span>
                <span className="text-muted-foreground tabular-nums">{count}</span>
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full', color)} style={{ width: `${p}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

function pct(num: number, denom: number): string {
  return denom ? `${((num / denom) * 100).toFixed(1)}%` : '—';
}

function signed(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(1);
}

function groupParam(g: GroupBy): string {
  switch (g) {
    case 'team': return 'team';
    case 'main_trade': return 'mainTrade';
    case 'subcontractor_name': return 'subcontractor';
    case 'hdec_pic_name': return 'hdecPic';
  }
}

function healthBadge(h: PunchHealthStatus): string {
  switch (h) {
    case 'critical': return 'border-red-400 text-red-700 bg-red-50';
    case 'behind': return 'border-amber-400 text-amber-700 bg-amber-50';
    case 'on_track': return 'border-blue-400 text-blue-700 bg-blue-50';
    case 'ahead': return 'border-emerald-400 text-emerald-700 bg-emerald-50';
  }
}

function blockerLabel(b: PunchBlockerKind): string {
  switch (b) {
    case 'material_approval': return 'Mat. Approval';
    case 'material_procurement': return 'Mat. Procurement';
    case 'drawing_approval': return 'Drawing Approval';
    case 'mos_approval': return 'MOS Approval';
  }
}

// Suppress unused import (type-only Badge)
void Badge;
