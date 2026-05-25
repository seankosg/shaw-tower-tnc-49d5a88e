import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetch-all-rows';
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
    queryFn: () =>
      fetchAllRows<SubtestRow>((from, to) =>
        supabase
          .from('subtests')
          .select('subcontractor_name, team, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date')
          .eq('is_active', true)
          .range(from, to),
      ),
  });

  const { data: defectData, isLoading: l2 } = useQuery({
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

  // Normalize subcontractor/team names (case-insensitive match against DMR canonical list)
  const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase();
  const fSubsUpper = useMemo(() => new Set(Array.from(fSubs).map(norm)), [fSubs]);
  const fTeamsUpper = useMemo(() => new Set(Array.from(fTeams).map(norm)), [fTeams]);

  const tcPlanned = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of subtestData ?? []) {
      const sub = norm(r.subcontractor_name);
      if (!sub || !fSubsUpper.has(sub)) continue;
      if (r.team && !fTeamsUpper.has(norm(r.team))) continue;
      for (const d of [r.t1_planned_date, r.t2_planned_date]) {
        if (!d) continue;
        if (!m.has(sub)) m.set(sub, new Map());
        const dm = m.get(sub)!;
        dm.set(d, (dm.get(d) ?? 0) + 1);
      }
    }
    return m;
  }, [subtestData, fSubsUpper, fTeamsUpper]);

  const tcActual = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of subtestData ?? []) {
      const sub = norm(r.subcontractor_name);
      if (!sub || !fSubsUpper.has(sub)) continue;
      if (r.team && !fTeamsUpper.has(norm(r.team))) continue;
      for (const d of [r.t1_actual_date, r.t2_actual_date]) {
        if (!d) continue;
        if (!m.has(sub)) m.set(sub, new Map());
        const dm = m.get(sub)!;
        dm.set(d, (dm.get(d) ?? 0) + 1);
      }
    }
    return m;
  }, [subtestData, fSubsUpper, fTeamsUpper]);

  const defPlanned = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of defectData ?? []) {
      const sub = norm(r.subcontractor_name);
      if (!sub || !fSubsUpper.has(sub)) continue;
      if (r.team && !fTeamsUpper.has(norm(r.team))) continue;
      const d = r.planned_completion_date;
      if (!d) continue;
      if (!m.has(sub)) m.set(sub, new Map());
      const dm = m.get(sub)!;
      dm.set(d, (dm.get(d) ?? 0) + 1);
    }
    return m;
  }, [defectData, fSubsUpper, fTeamsUpper]);

  const defActual = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of defectData ?? []) {
      const sub = norm(r.subcontractor_name);
      if (!sub || !fSubsUpper.has(sub)) continue;
      if (r.team && !fTeamsUpper.has(norm(r.team))) continue;
      const d = r.actual_completion_date;
      if (!d) continue;
      if (!m.has(sub)) m.set(sub, new Map());
      const dm = m.get(sub)!;
      dm.set(d, (dm.get(d) ?? 0) + 1);
    }
    return m;
  }, [defectData, fSubsUpper, fTeamsUpper]);

  // Manpower map keyed by normalized sub name
  const manMap = useMemo(() => {
    const m = new Map<string, Map<string, Map<string, number>>>();
    for (const r of dmrRows) {
      const sub = norm(r.subcontractor);
      if (!m.has(sub)) m.set(sub, new Map());
      const dm = m.get(sub)!;
      if (!dm.has(r.report_date)) dm.set(r.report_date, new Map());
      const wm = dm.get(r.report_date)!;
      wm.set(r.workplace, (wm.get(r.workplace) ?? 0) + r.manpower);
    }
    return m;
  }, [dmrRows]);

  function getMan(sub: string, date: string, wp: string): number {
    return manMap.get(norm(sub))?.get(date)?.get(wp) ?? 0;
  }
  function getQty(map: Map<string, Map<string, number>>, sub: string, date: string): number {
    return map.get(norm(sub))?.get(date) ?? 0;
  }

  const rowSubs = useMemo(() => {
    return subs.filter((s) => {
      if (!fSubs.has(s)) return false;
      const k = norm(s);
      if (showTC && (tcPlanned.has(k) || tcActual.has(k))) return true;
      if (showDefect && (defPlanned.has(k) || defActual.has(k))) return true;
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
        ) : (() => {
          // Total rows (one per active metric) summed across visible rowSubs
          const totalMetrics: MetricRow[] = [];
          if (showTC) {
            totalMetrics.push({ key: 'tcp', label: 'T&C Planned', wp: 'T&C', map: tcPlanned });
            totalMetrics.push({ key: 'tca', label: 'T&C Actual', wp: 'T&C', map: tcActual });
          }
          if (showDefect) {
            totalMetrics.push({ key: 'dfp', label: 'Defect Planned', wp: 'Defect', map: defPlanned });
            totalMetrics.push({ key: 'dfa', label: 'Defect Actual', wp: 'Defect', map: defActual });
          }
          const denom = dates.length || 1;
          const sumQty = (mr: MetricRow, d: string) =>
            rowSubs.reduce((a, s) => a + getQty(mr.map, s, d), 0);
          const sumMan = (wp: 'T&C' | 'Defect', d: string) =>
            rowSubs.reduce((a, s) => a + getMan(s, d, wp), 0);

          // Sticky offset constants (px). Header rows fixed at 32px each.
          const H_HEAD = 32;
          const TOP_HEAD_1 = 0;
          const TOP_HEAD_2 = H_HEAD;
          const TOP_TOTAL_BASE = H_HEAD * 2;
          const Z_HEAD = 40;
          const Z_HEAD_LEFT = 50;
          const Z_TOTAL = 30;
          const Z_TOTAL_LEFT = 35;

          return (
          <div className="max-w-full overflow-auto max-h-[70vh]">
            <Table className="text-xs">
              <TableHeader>
                <TableRow style={{ height: H_HEAD }}>
                  <TableHead
                    rowSpan={2}
                    className="sticky left-0 border-r bg-background align-bottom"
                    style={{ top: TOP_HEAD_1, width: W_SUB, minWidth: W_SUB, zIndex: Z_HEAD_LEFT }}
                  >
                    Subcontractor
                  </TableHead>
                  <TableHead
                    rowSpan={2}
                    className="sticky border-r bg-background align-bottom"
                    style={{ top: TOP_HEAD_1, left: W_SUB, width: W_METRIC, minWidth: W_METRIC, zIndex: Z_HEAD_LEFT }}
                  >
                    Metric
                  </TableHead>
                  <TableHead
                    colSpan={3}
                    className="sticky border-l border-r bg-muted text-center font-medium"
                    style={{ top: TOP_HEAD_1, left: W_SUB + W_METRIC, zIndex: Z_HEAD_LEFT }}
                  >
                    Average
                  </TableHead>
                  {dates.map((d) => (
                    <TableHead key={d} colSpan={3} className="sticky border-l bg-muted text-center font-medium" style={{ top: TOP_HEAD_1, zIndex: Z_HEAD }}>
                      {fmtDate(d)}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow style={{ height: H_HEAD }}>
                  <TableHead className="sticky border-l bg-muted text-right text-[11px] font-semibold" style={{ top: TOP_HEAD_2, left: W_SUB + W_METRIC, width: W_AVG, minWidth: W_AVG, zIndex: Z_HEAD_LEFT }}>Qty</TableHead>
                  <TableHead className="sticky bg-muted text-right text-[11px] font-normal text-muted-foreground" style={{ top: TOP_HEAD_2, left: W_SUB + W_METRIC + W_AVG, width: W_AVG, minWidth: W_AVG, zIndex: Z_HEAD_LEFT }}>Man</TableHead>
                  <TableHead className="sticky border-r bg-muted text-right text-[11px] font-semibold" style={{ top: TOP_HEAD_2, left: W_SUB + W_METRIC + W_AVG * 2, width: W_AVG, minWidth: W_AVG, zIndex: Z_HEAD_LEFT }}>Nos/Man</TableHead>
                  {dates.flatMap((d) => [
                    <TableHead key={`${d}-q`} className="sticky border-l bg-muted text-right text-[11px] font-semibold" style={{ top: TOP_HEAD_2, zIndex: Z_HEAD }}>Qty</TableHead>,
                    <TableHead key={`${d}-m`} className="sticky bg-muted text-right text-[11px] font-normal text-muted-foreground" style={{ top: TOP_HEAD_2, zIndex: Z_HEAD }}>Man</TableHead>,
                    <TableHead key={`${d}-p`} className="sticky bg-muted text-right text-[11px] font-semibold" style={{ top: TOP_HEAD_2, zIndex: Z_HEAD }}>Nos/Man</TableHead>,
                  ])}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  type GrandRow = { key: 'plan' | 'actual'; label: string; metrics: MetricRow[] };
                  const grandRows: GrandRow[] = [];
                  const plannedMetrics = totalMetrics.filter((m) => m.key.endsWith('p'));
                  const actualMetrics = totalMetrics.filter((m) => m.key.endsWith('a'));
                  if (plannedMetrics.length > 0) grandRows.push({ key: 'plan', label: 'Plan (Total)', metrics: plannedMetrics });
                  if (actualMetrics.length > 0) grandRows.push({ key: 'actual', label: 'Actual (Total)', metrics: actualMetrics });
                  const grandQty = (g: GrandRow, d: string) => g.metrics.reduce((a, mr) => a + sumQty(mr, d), 0);
                  const grandMan = (g: GrandRow, d: string) => {
                    const wps = new Set(g.metrics.map((m) => m.wp));
                    let total = 0;
                    for (const wp of wps) total += sumMan(wp, d);
                    return total;
                  };
                  const totalRowCount = grandRows.length + totalMetrics.length;
                  return (
                    <>
                      {grandRows.map((g, gIdx) => {
                        const top = TOP_TOTAL_BASE + H_HEAD * gIdx;
                        const qSum = dates.reduce((a, d) => a + grandQty(g, d), 0);
                        const mSum = dates.reduce((a, d) => a + grandMan(g, d), 0);
                        const qAvg = Math.floor(qSum / denom);
                        const mAvg = Math.floor(mSum / denom);
                        const isFirst = gIdx === 0;
                        const isLastGrand = gIdx === grandRows.length - 1;
                        const borderCls = `${isFirst ? 'border-t-2' : ''} ${isLastGrand ? 'border-b' : ''}`;
                        return (
                          <TableRow key={`grand-${g.key}`} className={`${borderCls} bg-muted font-bold whitespace-nowrap`} style={{ height: H_HEAD }}>
                            {isFirst && (
                              <TableCell
                                rowSpan={totalRowCount}
                                className="sticky left-0 border-r bg-muted align-middle text-center font-bold"
                                style={{ top: TOP_TOTAL_BASE, width: W_SUB, minWidth: W_SUB, zIndex: Z_TOTAL_LEFT }}
                              >
                                Total
                              </TableCell>
                            )}
                            <TableCell
                              className="sticky border-r bg-muted text-[11px] font-bold"
                              style={{ top, left: W_SUB, width: W_METRIC, minWidth: W_METRIC, zIndex: Z_TOTAL_LEFT }}
                            >
                              {g.label}
                            </TableCell>
                            <TableCell className="sticky border-l bg-muted text-right tabular-nums font-bold" style={{ top, left: W_SUB + W_METRIC, width: W_AVG, minWidth: W_AVG, zIndex: Z_TOTAL_LEFT }}>{qAvg || ''}</TableCell>
                            <TableCell className="sticky bg-muted text-right tabular-nums text-muted-foreground font-bold" style={{ top, left: W_SUB + W_METRIC + W_AVG, width: W_AVG, minWidth: W_AVG, zIndex: Z_TOTAL_LEFT }}>{mAvg || ''}</TableCell>
                            <TableCell className="sticky border-r bg-muted text-right tabular-nums font-bold" style={{ top, left: W_SUB + W_METRIC + W_AVG * 2, width: W_AVG, minWidth: W_AVG, zIndex: Z_TOTAL_LEFT }}>{prod(qSum, mSum)}</TableCell>
                            {dates.flatMap((d) => {
                              const q = grandQty(g, d);
                              const man = grandMan(g, d);
                              return [
                                <TableCell key={`grand-${g.key}-${d}-q`} className="sticky border-l bg-muted text-right tabular-nums font-bold" style={{ top, zIndex: Z_TOTAL }}>{q || ''}</TableCell>,
                                <TableCell key={`grand-${g.key}-${d}-m`} className="sticky bg-muted text-right tabular-nums text-muted-foreground font-bold" style={{ top, zIndex: Z_TOTAL }}>{man || ''}</TableCell>,
                                <TableCell key={`grand-${g.key}-${d}-p`} className="sticky bg-muted text-right tabular-nums font-bold" style={{ top, zIndex: Z_TOTAL }}>{prod(q, man)}</TableCell>,
                              ];
                            })}
                          </TableRow>
                        );
                      })}
                      {totalMetrics.map((mr, idx) => {
                        const top = TOP_TOTAL_BASE + H_HEAD * (grandRows.length + idx);
                        const qSum = dates.reduce((a, d) => a + sumQty(mr, d), 0);
                        const mSum = dates.reduce((a, d) => a + sumMan(mr.wp, d), 0);
                        const qAvg = Math.floor(qSum / denom);
                        const mAvg = Math.floor(mSum / denom);
                        const isLast = idx === totalMetrics.length - 1;
                        const borderCls = `${isLast ? 'border-b-2' : ''}`;
                        return (
                          <TableRow key={`total-${mr.key}`} className={`${borderCls} bg-muted font-bold whitespace-nowrap`} style={{ height: H_HEAD }}>
                            <TableCell
                              className="sticky border-r bg-muted text-[11px] font-semibold"
                              style={{ top, left: W_SUB, width: W_METRIC, minWidth: W_METRIC, zIndex: Z_TOTAL_LEFT }}
                            >
                              {mr.label}
                            </TableCell>
                            <TableCell className="sticky border-l bg-muted text-right tabular-nums font-bold" style={{ top, left: W_SUB + W_METRIC, width: W_AVG, minWidth: W_AVG, zIndex: Z_TOTAL_LEFT }}>{qAvg || ''}</TableCell>
                            <TableCell className="sticky bg-muted text-right tabular-nums text-muted-foreground font-bold" style={{ top, left: W_SUB + W_METRIC + W_AVG, width: W_AVG, minWidth: W_AVG, zIndex: Z_TOTAL_LEFT }}>{mAvg || ''}</TableCell>
                            <TableCell className="sticky border-r bg-muted text-right tabular-nums font-bold" style={{ top, left: W_SUB + W_METRIC + W_AVG * 2, width: W_AVG, minWidth: W_AVG, zIndex: Z_TOTAL_LEFT }}>{prod(qSum, mSum)}</TableCell>
                            {dates.flatMap((d) => {
                              const q = sumQty(mr, d);
                              const man = sumMan(mr.wp, d);
                              return [
                                <TableCell key={`total-${mr.key}-${d}-q`} className="sticky border-l bg-muted text-right tabular-nums font-bold" style={{ top, zIndex: Z_TOTAL }}>{q || ''}</TableCell>,
                                <TableCell key={`total-${mr.key}-${d}-m`} className="sticky bg-muted text-right tabular-nums text-muted-foreground font-bold" style={{ top, zIndex: Z_TOTAL }}>{man || ''}</TableCell>,
                                <TableCell key={`total-${mr.key}-${d}-p`} className="sticky bg-muted text-right tabular-nums font-bold" style={{ top, zIndex: Z_TOTAL }}>{prod(q, man)}</TableCell>,
                              ];
                            })}
                          </TableRow>
                        );
                      })}
                    </>
                  );
                })()}

                {rowSubs.map((s) => {
                  const mrows = metricRowsFor(s);
                  return mrows.map((mr, idx) => {
                    const isPlanned = mr.key.endsWith('p');
                    const rowBg = isPlanned ? 'bg-muted/30' : '';
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
          );
        })()}
      </CardContent>
    </Card>
  );
}
