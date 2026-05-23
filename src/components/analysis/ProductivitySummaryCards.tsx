import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type DmrRow = {
  report_date: string;
  team: string | null;
  trade: string | null;
  subcontractor: string;
  workplace: string;
  manpower: number;
};

type SubtestRow = {
  subcontractor_name: string | null;
  team: string | null;
  t1_planned_date: string | null;
  t1_actual_date: string | null;
  t2_planned_date: string | null;
  t2_actual_date: string | null;
};

type DefectRow = {
  subcontractor_name: string | null;
  team: string | null;
  planned_completion_date: string | null;
  actual_completion_date: string | null;
};

interface Props {
  dmrRows: DmrRow[];
  dates: string[];
  fTeams: Set<string>;
  fSubs: Set<string>;
  fWp: Set<string>;
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase();

export default function ProductivitySummaryCards({ dmrRows, dates, fTeams, fSubs, fWp }: Props) {
  const { data: subtestData } = useQuery({
    queryKey: ['productivity_subtests'],
    queryFn: async (): Promise<SubtestRow[]> => {
      const { data, error } = await supabase
        .from('subtests')
        .select('subcontractor_name, team, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date')
        .eq('is_active', true)
        .limit(50000);
      if (error) throw error;
      return (data ?? []) as SubtestRow[];
    },
  });

  const { data: defectData } = useQuery({
    queryKey: ['productivity_defects'],
    queryFn: async (): Promise<DefectRow[]> => {
      const { data, error } = await supabase
        .from('defect_items')
        .select('subcontractor_name, team, planned_completion_date, actual_completion_date')
        .eq('is_active', true)
        .limit(50000);
      if (error) throw error;
      return (data ?? []) as DefectRow[];
    },
  });

  const showTC = fWp.has('T&C');
  const showDefect = fWp.has('Defect');

  const fSubsUpper = useMemo(() => new Set(Array.from(fSubs).map(norm)), [fSubs]);
  const fTeamsUpper = useMemo(() => new Set(Array.from(fTeams).map(norm)), [fTeams]);
  const dateSet = useMemo(() => new Set(dates), [dates]);

  const stats = useMemo(() => {
    let plannedQty = 0;
    let actualQty = 0;
    let plannedMan = 0;
    let actualMan = 0;

    // Manpower lookup: sub -> date -> wp -> man
    const manMap = new Map<string, Map<string, Map<string, number>>>();
    for (const r of dmrRows) {
      const sub = norm(r.subcontractor);
      if (!manMap.has(sub)) manMap.set(sub, new Map());
      const dm = manMap.get(sub)!;
      if (!dm.has(r.report_date)) dm.set(r.report_date, new Map());
      const wm = dm.get(r.report_date)!;
      wm.set(r.workplace, (wm.get(r.workplace) ?? 0) + r.manpower);
    }
    const getMan = (sub: string, date: string, wp: string) =>
      manMap.get(sub)?.get(date)?.get(wp) ?? 0;

    const addQty = (
      sub: string,
      date: string | null,
      wp: 'T&C' | 'Defect',
      kind: 'planned' | 'actual',
    ) => {
      if (!date || !dateSet.has(date)) return;
      const man = getMan(sub, date, wp);
      if (kind === 'planned') {
        plannedQty += 1;
        plannedMan += man;
      } else {
        actualQty += 1;
        actualMan += man;
      }
    };

    if (showTC) {
      for (const r of subtestData ?? []) {
        const sub = norm(r.subcontractor_name);
        if (!sub || !fSubsUpper.has(sub)) continue;
        if (r.team && !fTeamsUpper.has(norm(r.team))) continue;
        addQty(sub, r.t1_planned_date, 'T&C', 'planned');
        addQty(sub, r.t2_planned_date, 'T&C', 'planned');
        addQty(sub, r.t1_actual_date, 'T&C', 'actual');
        addQty(sub, r.t2_actual_date, 'T&C', 'actual');
      }
    }
    if (showDefect) {
      for (const r of defectData ?? []) {
        const sub = norm(r.subcontractor_name);
        if (!sub || !fSubsUpper.has(sub)) continue;
        if (r.team && !fTeamsUpper.has(norm(r.team))) continue;
        addQty(sub, r.planned_completion_date, 'Defect', 'planned');
        addQty(sub, r.actual_completion_date, 'Defect', 'actual');
      }
    }

    return { plannedQty, actualQty, plannedMan, actualMan };
  }, [dmrRows, dateSet, subtestData, defectData, fSubsUpper, fTeamsUpper, showTC, showDefect]);

  const days = dates.length || 1;
  const prodPlan = stats.plannedMan ? stats.plannedQty / stats.plannedMan : null;
  const prodAct = stats.actualMan ? stats.actualQty / stats.actualMan : null;
  const avgPlan = stats.plannedQty / days;
  const avgAct = stats.actualQty / days;
  const diff = prodPlan !== null && prodAct !== null ? prodAct - prodPlan : null;

  const fmt1 = (n: number | null) => (n === null ? '-' : n.toFixed(1));
  const fmtInt = (n: number) => n.toLocaleString();

  const diffColor =
    diff === null || diff === 0
      ? 'text-foreground'
      : diff > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400';
  const diffSign = diff !== null && diff > 0 ? '+' : '';

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Work Volume</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">Planned Q'ty</span>
            <span className="text-xl font-semibold tabular-nums">{fmtInt(stats.plannedQty)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">Actual Q'ty</span>
            <span className="text-xl font-semibold tabular-nums">{fmtInt(stats.actualQty)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Productivity (Nos/Man)</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">Planned</span>
            <span className="text-xl font-semibold tabular-nums">{fmt1(prodPlan)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">Actual</span>
            <span className="text-xl font-semibold tabular-nums">{fmt1(prodAct)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Average (Nos/day)</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">Plan</span>
            <span className="text-xl font-semibold tabular-nums">{fmt1(avgPlan)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">Actual</span>
            <span className="text-xl font-semibold tabular-nums">{fmt1(avgAct)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Difference (Actual − Plan)</CardTitle></CardHeader>
        <CardContent>
          <div className={`text-2xl font-semibold tabular-nums ${diffColor}`}>
            {diff === null ? '-' : `${diffSign}${diff.toFixed(1)}`}
          </div>
          <div className="text-[11px] text-muted-foreground">Nos/Man</div>
        </CardContent>
      </Card>
    </div>
  );
}
