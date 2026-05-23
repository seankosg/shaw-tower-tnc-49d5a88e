import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

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

function fmtDate(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  const day = String(d.getDate()).padStart(2, '0');
  const mmm = d.toLocaleDateString('en-US', { month: 'short' });
  return `${day}-${mmm}`;
}

function prod(qty: number, man: number): string {
  if (!man || !qty) return '-';
  return (qty / man).toFixed(1);
}

interface Props {
  dmrRows: DmrRow[];
  dates: string[];
  fTeams: Set<string>;
  fSubs: Set<string>;
  fWp: Set<string>;
  subs: string[];
}

export default function ProductivityTable({ dmrRows, dates, fTeams, fSubs, fWp, subs }: Props) {
  const { data: subtestData, isLoading: l1 } = useQuery({
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

  const { data: defectData, isLoading: l2 } = useQuery({
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

  // Build maps: sub -> date -> count
  const tcPlanned = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of subtestData ?? []) {
      const sub = r.subcontractor_name ?? '';
      if (!sub || !fSubs.has(sub)) continue;
      if (r.team && !fTeams.has(r.team)) continue;
      for (const d of [r.t1_planned_date, r.t2_planned_date]) {
        if (!d) continue;
        if (!m.has(sub)) m.set(sub, new Map());
        const dm = m.get(sub)!;
        dm.set(d, (dm.get(d) ?? 0) + 1);
      }
    }
    return m;
  }, [subtestData, fSubs, fTeams]);

  const tcActual = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of subtestData ?? []) {
      const sub = r.subcontractor_name ?? '';
      if (!sub || !fSubs.has(sub)) continue;
      if (r.team && !fTeams.has(r.team)) continue;
      for (const d of [r.t1_actual_date, r.t2_actual_date]) {
        if (!d) continue;
        if (!m.has(sub)) m.set(sub, new Map());
        const dm = m.get(sub)!;
        dm.set(d, (dm.get(d) ?? 0) + 1);
      }
    }
    return m;
  }, [subtestData, fSubs, fTeams]);

  const defPlanned = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of defectData ?? []) {
      const sub = r.subcontractor_name ?? '';
      if (!sub || !fSubs.has(sub)) continue;
      if (r.team && !fTeams.has(r.team)) continue;
      const d = r.planned_completion_date;
      if (!d) continue;
      if (!m.has(sub)) m.set(sub, new Map());
      const dm = m.get(sub)!;
      dm.set(d, (dm.get(d) ?? 0) + 1);
    }
    return m;
  }, [defectData, fSubs, fTeams]);

  const defActual = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of defectData ?? []) {
      const sub = r.subcontractor_name ?? '';
      if (!sub || !fSubs.has(sub)) continue;
      if (r.team && !fTeams.has(r.team)) continue;
      const d = r.actual_completion_date;
      if (!d) continue;
      if (!m.has(sub)) m.set(sub, new Map());
      const dm = m.get(sub)!;
      dm.set(d, (dm.get(d) ?? 0) + 1);
    }
    return m;
  }, [defectData, fSubs, fTeams]);

  // Manpower map: sub -> date -> workplace -> manpower
  const manMap = useMemo(() => {
    const m = new Map<string, Map<string, Map<string, number>>>();
    for (const r of dmrRows) {
      if (!m.has(r.subcontractor)) m.set(r.subcontractor, new Map());
      const dm = m.get(r.subcontractor)!;
      if (!dm.has(r.report_date)) dm.set(r.report_date, new Map());
      const wm = dm.get(r.report_date)!;
      wm.set(r.workplace, (wm.get(r.workplace) ?? 0) + r.manpower);
    }
    return m;
  }, [dmrRows]);

  function getMan(sub: string, date: string, wp: string): number {
    return manMap.get(sub)?.get(date)?.get(wp) ?? 0;
  }
  function getQty(map: Map<string, Map<string, number>>, sub: string, date: string): number {
    return map.get(sub)?.get(date) ?? 0;
  }

  // Subs that have any data
  const rowSubs = useMemo(() => {
    return subs.filter((s) => {
      if (!fSubs.has(s)) return false;
      if (showTC && (tcPlanned.has(s) || tcActual.has(s))) return true;
      if (showDefect && (defPlanned.has(s) || defActual.has(s))) return true;
      return false;
    });
  }, [subs, fSubs, showTC, showDefect, tcPlanned, tcActual, defPlanned, defActual]);

  const isLoading = l1 || l2;

  const W_SUB = 160;
  const W_METRIC = 110;
  const W_AVG = 56;

  type MetricRow = { key: string; label: string; wp: 'T&C' | 'Defect'; map: Map<string, Map<string, number>> };
  const metricRowsFor = (s: string): MetricRow[] => {
    const out: MetricRow[] = [];
    if (showTC) {
      out.push({ key: 'tcp', label: 'T&C Planned', wp: 'T&C', map: tcPlanned });
      out.push({ key: 'tca', label: 'T&C Actual', wp: 'T&C', map: tcActual });
    }
    if (showDefect) {
      out.push({ key: 'dfp', label: 'Defect Planned', wp: 'Defect', map: defPlanned });
      out.push({ key: 'dfa', label: 'Defect Actual', wp: 'Defect', map: defActual });
    }
    return out;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Productivity (Nos / Man)</CardTitle>
        <div className="text-[11px] text-muted-foreground">
          Qty ÷ matching workplace manpower. T&C = T1 + T2, Defect = completion date.
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…
          </div>
        ) : rowSubs.length === 0 || dates.length === 0 || (!showTC && !showDefect) ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No data for current selection</div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead
                    rowSpan={2}
                    className="sticky left-0 z-20 border-r bg-background align-bottom"
                    style={{ width: W_SUB, minWidth: W_SUB }}
                  >
                    Subcontractor
                  </TableHead>
                  <TableHead
                    rowSpan={2}
                    className="sticky z-20 border-r bg-background align-bottom"
                    style={{ left: W_SUB, width: W_METRIC, minWidth: W_METRIC }}
                  >
                    Metric
                  </TableHead>
                  <TableHead
                    colSpan={3}
                    className="sticky z-20 border-l border-r bg-muted text-center font-medium"
                    style={{ left: W_SUB + W_METRIC }}
                  >
                    Average
                  </TableHead>
                  {dates.map((d) => (
                    <TableHead key={d} colSpan={3} className="border-l bg-muted text-center font-medium">
                      {fmtDate(d)}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  <TableHead className="sticky z-20 border-l bg-muted text-right text-[11px] font-semibold" style={{ left: W_SUB + W_METRIC, width: W_AVG, minWidth: W_AVG }}>Qty</TableHead>
                  <TableHead className="sticky z-20 bg-muted text-right text-[11px] font-normal text-muted-foreground" style={{ left: W_SUB + W_METRIC + W_AVG, width: W_AVG, minWidth: W_AVG }}>Man</TableHead>
                  <TableHead className="sticky z-20 border-r bg-muted text-right text-[11px] font-semibold" style={{ left: W_SUB + W_METRIC + W_AVG * 2, width: W_AVG, minWidth: W_AVG }}>Nos/Man</TableHead>
                  {dates.flatMap((d) => [
                    <TableHead key={`${d}-q`} className="border-l text-right text-[11px] font-semibold">Qty</TableHead>,
                    <TableHead key={`${d}-m`} className="text-right text-[11px] font-normal text-muted-foreground">Man</TableHead>,
                    <TableHead key={`${d}-p`} className="text-right text-[11px] font-semibold">Nos/Man</TableHead>,
                  ])}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowSubs.map((s) => {
                  const mrows = metricRowsFor(s);
                  return mrows.map((mr, idx) => {
                    const isPlanned = mr.key.endsWith('p');
                    const rowBg = isPlanned ? 'bg-muted/30' : '';
                    const denom = dates.length || 1;
                    const qSum = dates.reduce((a, d) => a + getQty(mr.map, s, d), 0);
                    const mSum = dates.reduce((a, d) => a + getMan(s, d, mr.wp), 0);
                    const qAvg = Math.floor(qSum / denom);
                    const mAvg = Math.floor(mSum / denom);
                    return (
                      <TableRow key={`${s}-${mr.key}`} className={idx === 0 ? 'border-t-2' : ''}>
                        {idx === 0 && (
                          <TableCell
                            rowSpan={mrows.length}
                            className="sticky left-0 z-10 border-r bg-background align-top font-medium"
                            style={{ width: W_SUB, minWidth: W_SUB }}
                          >
                            {s}
                          </TableCell>
                        )}
                        <TableCell
                          className={`sticky z-10 border-r bg-background text-[11px] ${isPlanned ? 'text-muted-foreground' : 'font-medium'}`}
                          style={{ left: W_SUB, width: W_METRIC, minWidth: W_METRIC }}
                        >
                          {mr.label}
                        </TableCell>
                        <TableCell className={`sticky z-10 border-l bg-background text-right tabular-nums font-semibold ${qAvg === 0 ? 'text-muted-foreground/40' : ''}`} style={{ left: W_SUB + W_METRIC, width: W_AVG, minWidth: W_AVG }}>{qAvg || ''}</TableCell>
                        <TableCell className={`sticky z-10 bg-background text-right tabular-nums text-muted-foreground ${mAvg === 0 ? 'text-muted-foreground/40' : ''}`} style={{ left: W_SUB + W_METRIC + W_AVG, width: W_AVG, minWidth: W_AVG }}>{mAvg || ''}</TableCell>
                        <TableCell className="sticky z-10 border-r bg-background text-right tabular-nums font-semibold" style={{ left: W_SUB + W_METRIC + W_AVG * 2, width: W_AVG, minWidth: W_AVG }}>{prod(qSum, mSum)}</TableCell>
                        {dates.flatMap((d) => {
                          const q = getQty(mr.map, s, d);
                          const man = getMan(s, d, mr.wp);
                          return [
                            <TableCell key={`${s}-${mr.key}-${d}-q`} className={`border-l text-right tabular-nums ${rowBg} ${q === 0 ? 'text-muted-foreground/40' : ''}`}>{q || ''}</TableCell>,
                            <TableCell key={`${s}-${mr.key}-${d}-m`} className={`text-right tabular-nums text-muted-foreground ${rowBg} ${man === 0 ? 'text-muted-foreground/40' : ''}`}>{man || ''}</TableCell>,
                            <TableCell key={`${s}-${mr.key}-${d}-p`} className={`text-right tabular-nums font-semibold ${rowBg}`}>{prod(q, man)}</TableCell>,
                          ];
                        })}
                      </TableRow>
                    );
                  });
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
