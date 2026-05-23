import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetch-all-rows';
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
    queryFn: () =>
      fetchAllRows<SubtestRow>((from, to) =>
        supabase
          .from('subtests')
          .select('subcontractor_name, team, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date')
          .eq('is_active', true)
          .range(from, to),
      ),
  });

  const { data: defectData } = useQuery({
    queryKey: ['productivity_defects'],
    queryFn: () =>
      fetchAllRows<DefectRow>((from, to) =>
        supabase
          .from('defect_items')
          .select('subcontractor_name, team, planned_completion_date, actual_completion_date')
          .eq('is_active', true)
          .range(from, to),
      ),
  });

  const showTC = fWp.has('T&C');
  const showDefect = fWp.has('Defect');

  const fSubsUpper = useMemo(() => new Set(Array.from(fSubs).map(norm)), [fSubs]);
  const fTeamsUpper = useMemo(() => new Set(Array.from(fTeams).map(norm)), [fTeams]);
  const dateSet = useMemo(() => new Set(dates), [dates]);

  const stats = useMemo(() => {
    let plannedQty = 0;
    let actualQty = 0;

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

    const activeSubs = new Set<string>();
    const addQty = (
      sub: string,
      date: string | null,
      kind: 'planned' | 'actual',
    ) => {
      if (!date || !dateSet.has(date)) return;
      if (kind === 'planned') plannedQty += 1;
      else actualQty += 1;
      activeSubs.add(sub);
    };

    if (showTC) {
      for (const r of subtestData ?? []) {
        const sub = norm(r.subcontractor_name);
        if (!sub || !fSubsUpper.has(sub)) continue;
        if (r.team && !fTeamsUpper.has(norm(r.team))) continue;
        addQty(sub, r.t1_planned_date, 'planned');
        addQty(sub, r.t2_planned_date, 'planned');
        addQty(sub, r.t1_actual_date, 'actual');
        addQty(sub, r.t2_actual_date, 'actual');
      }
    }
    if (showDefect) {
      for (const r of defectData ?? []) {
        const sub = norm(r.subcontractor_name);
        if (!sub || !fSubsUpper.has(sub)) continue;
        if (r.team && !fTeamsUpper.has(norm(r.team))) continue;
        addQty(sub, r.planned_completion_date, 'planned');
        addQty(sub, r.actual_completion_date, 'actual');
      }
    }

    // Manpower total: sum over (active sub × enabled wp × dates), counted once per (sub, date, wp)
    let manTotal = 0;
    const wps: string[] = [];
    if (showTC) wps.push('T&C');
    if (showDefect) wps.push('Defect');
    for (const sub of activeSubs) {
      for (const wp of wps) {
        for (const d of dates) {
          manTotal += getMan(sub, d, wp);
        }
      }
    }

    return { plannedQty, actualQty, plannedMan: manTotal, actualMan: manTotal };
  }, [dmrRows, dateSet, dates, subtestData, defectData, fSubsUpper, fTeamsUpper, showTC, showDefect]);


  const days = dates.length || 1;
  const avgVolPlan = stats.plannedQty / days;
  const avgVolAct = stats.actualQty / days;

  const manDen = stats.plannedMan > 0 ? stats.plannedMan : stats.actualMan;
  const planProdNum = manDen > 0 ? stats.plannedQty / manDen : null;
  const actProdNum = manDen > 0 ? stats.actualQty / manDen : null;
  const diffNum =
    planProdNum !== null && actProdNum !== null ? actProdNum - planProdNum : null;

  const fmt1 = (n: number) => n.toFixed(1);
  const fmt2 = (n: number) => n.toFixed(2);

  const diffColor =
    diffNum === null || diffNum === 0
      ? 'text-foreground'
      : diffNum > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400';
  const diffSign = diffNum !== null && diffNum > 0 ? '+' : '';

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Average Work Volume</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">Planned</span>
            <span className="text-xl font-semibold tabular-nums">{fmt1(avgVolPlan)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">Actual</span>
            <span className="text-xl font-semibold tabular-nums">{fmt1(avgVolAct)}</span>
          </div>
          <div className="pt-0.5 text-[11px] text-muted-foreground">Nos/day</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Average Productivity</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {(() => {
            const planProd = planProdNum !== null ? fmt2(planProdNum) : '-';
            const actProd = actProdNum !== null ? fmt2(actProdNum) : '-';
            return (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-muted-foreground">Plan</span>
                  <span className="text-xl font-semibold tabular-nums">{planProd}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-muted-foreground">Actual</span>
                  <span className="text-xl font-semibold tabular-nums">{actProd}</span>
                </div>
                <div className="pt-0.5 text-[11px] text-muted-foreground">Nos/Man</div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Difference (Actual − Plan)</CardTitle></CardHeader>
        <CardContent>
          <div className={`text-2xl font-semibold tabular-nums ${diffColor}`}>
            {diffNum === null ? '-' : `${diffSign}${fmt2(diffNum)}`}
          </div>
          <div className="text-[11px] text-muted-foreground">Nos/Man</div>
          {diffNum !== null && diffNum < 0 && planProdNum && planProdNum > 0 && (() => {
            const shortageQty = stats.plannedQty - stats.actualQty;
            const extraManTotal = shortageQty / planProdNum;
            const extraPerDay = extraManTotal / days;
            return (
              <div className="mt-2 text-[11px] text-muted-foreground">
                Need <span className="font-semibold text-foreground">+{fmt1(extraPerDay)}</span> men/day on average to reach Plan productivity
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
