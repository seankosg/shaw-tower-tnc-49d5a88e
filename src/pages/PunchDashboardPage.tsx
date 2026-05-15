import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import type { PunchItem } from '@/lib/punch-excel-utils';
import {
  PUNCH_HEALTH_LABEL, PUNCH_GATE_LABEL,
  type PunchHealthStatus,
} from '@/lib/punch-field-registry';

const PAGE_SIZE = 1000;

const HEALTH_COLORS: Record<PunchHealthStatus, string> = {
  ahead: 'bg-emerald-500',
  on_track: 'bg-blue-500',
  behind: 'bg-amber-500',
  critical: 'bg-red-500',
};

export default function PunchDashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<PunchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
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
      if (!cancelled) { setRows(all); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const stats = useMemo(() => {
    const total = rows.length;
    const completed = rows.filter((r) => r.actual_completion_date).length;
    const wip = rows.filter((r) => r.actual_start_date && !r.actual_completion_date).length;
    const notStarted = rows.filter((r) => !r.actual_start_date).length;
    const blocked = rows.filter((r) => !r.pre_engineering_ready).length;
    const overdue = rows.filter((r) => {
      if (r.actual_completion_date || !r.planned_completion_date) return false;
      return r.planned_completion_date < new Date().toISOString().slice(0, 10);
    }).length;

    const plannedAvg = rows.length
      ? rows.reduce((s, r) => s + (Number(r.planned_progress_pct) || 0), 0) / rows.length : 0;
    const actualAvg = rows.length
      ? rows.reduce((s, r) => s + (Number(r.actual_progress_pct) || 0), 0) / rows.length : 0;

    const health: Record<PunchHealthStatus, number> = { ahead: 0, on_track: 0, behind: 0, critical: 0 };
    rows.forEach((r) => { if (r.health_status) health[r.health_status]++; });

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

    const teamMap = new Map<string, { total: number; done: number; blocked: number }>();
    rows.forEach((r) => {
      const k = r.team || 'Unassigned';
      const cur = teamMap.get(k) ?? { total: 0, done: 0, blocked: 0 };
      cur.total++;
      if (r.actual_completion_date) cur.done++;
      if (!r.pre_engineering_ready) cur.blocked++;
      teamMap.set(k, cur);
    });

    return { total, completed, wip, notStarted, blocked, overdue, plannedAvg, actualAvg, health, gates, byTeam: [...teamMap.entries()].sort((a, b) => b[1].total - a[1].total) };
  }, [rows]);

  const variance = stats.actualAvg - stats.plannedAvg;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Punch (Minor O/S Work) — Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading ? 'Loading…' : `${stats.total} items tracked`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/punch/raw-data')}>Open Raw Data</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Items" value={stats.total} icon={<Clock className="h-4 w-4 text-muted-foreground" />} />
        <KpiCard label="Completed" value={stats.completed} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          accent={stats.total ? `${((stats.completed / stats.total) * 100).toFixed(1)}%` : '—'} />
        <KpiCard label="Overdue" value={stats.overdue} icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
          tone={stats.overdue > 0 ? 'danger' : undefined} />
        <KpiCard label="Pre-Eng Blocked" value={stats.blocked} icon={<AlertCircle className="h-4 w-4 text-amber-600" />}
          tone={stats.blocked > 0 ? 'warning' : undefined} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Progress Overview</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Planned (avg)</span>
                <span className="tabular-nums font-medium">{stats.plannedAvg.toFixed(1)}%</span>
              </div>
              <Progress value={stats.plannedAvg} className="mt-1 h-2" />
            </div>
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Actual (avg)</span>
                <span className="tabular-nums font-medium">{stats.actualAvg.toFixed(1)}%</span>
              </div>
              <Progress value={stats.actualAvg} className="mt-1 h-2" />
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Variance (Actual − Planned)</div>
              <div className={cn('text-2xl font-semibold tabular-nums mt-1',
                variance >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {variance >= 0 ? '+' : ''}{variance.toFixed(1)}%
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <MiniBox label="WIP" value={stats.wip} />
              <MiniBox label="Not Started" value={stats.notStarted} />
              <MiniBox label="Done" value={stats.completed} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Health Distribution</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(Object.keys(stats.health) as PunchHealthStatus[]).map((h) => {
              const count = stats.health[h];
              const pct = stats.total ? (count / stats.total) * 100 : 0;
              return (
                <div key={h}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="capitalize">{PUNCH_HEALTH_LABEL[h]}</span>
                    <span className="text-muted-foreground tabular-nums">{count} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full transition-all', HEALTH_COLORS[h])} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Pre-Engineering Gates</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <GateBreakdown title="Material Approval" data={stats.gates.material_approval} total={stats.total} />
          <GateBreakdown title="Material Procurement" data={stats.gates.material_procurement} total={stats.total} />
          <GateBreakdown title="Drawing Approval" data={stats.gates.drawing_approval} total={stats.total} />
          <GateBreakdown title="MOS Approval" data={stats.gates.mos_approval} total={stats.total} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">By Team</CardTitle></CardHeader>
        <CardContent>
          {stats.byTeam.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No team data.</div>
          ) : (
            <div className="space-y-2">
              {stats.byTeam.map(([team, t]) => {
                const donePct = t.total ? (t.done / t.total) * 100 : 0;
                return (
                  <div key={team} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{team}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {t.done}/{t.total} done · {t.blocked} blocked
                      </div>
                    </div>
                    <Progress value={donePct} className="mt-2 h-1.5" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, icon, accent, tone }: {
  label: string; value: number; icon?: React.ReactNode; accent?: string;
  tone?: 'danger' | 'warning';
}) {
  const toneClass = tone === 'danger' ? 'border-red-300' : tone === 'warning' ? 'border-amber-300' : '';
  return (
    <Card className={toneClass}>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{label}</div>
          {icon}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
          {accent && <div className="text-xs text-muted-foreground">{accent}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function GateBreakdown({ title, data, total }: { title: string; data: Record<string, number>; total: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="space-y-1">
        {Object.entries(data).map(([status, count]) => {
          const pct = total ? (count / total) * 100 : 0;
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
                <div className={cn('h-full', color)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Suppress unused import (type-only Badge)
void Badge;
