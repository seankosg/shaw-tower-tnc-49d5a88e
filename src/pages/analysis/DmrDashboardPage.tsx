import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetch-all-rows';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, Loader2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import ProductivityTable from '@/components/analysis/ProductivityTable';
import ProductivitySummaryCards from '@/components/analysis/ProductivitySummaryCards';

type Row = {
  report_date: string;
  team: string | null;
  trade: string | null;
  subcontractor: string;
  workplace: string;
  manpower: number;
};

const WORKPLACE_ORDER = ['T&C', 'Defect', 'Post TOP'];

const COLORS = [
  'hsl(var(--primary))',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#6366f1',
];

function fmtDate(iso: string): string {
  if (!iso || iso === '-') return '-';
  const d = new Date(iso + 'T00:00:00');
  const day = String(d.getDate()).padStart(2, '0');
  const mmm = d.toLocaleDateString('en-US', { month: 'short' });
  return `${day}-${mmm}`;
}

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const steps = [10, 25, 50, 100, 150, 200, 250, 500, 750, 1000, 1500, 2000, 5000, 10000];
  for (const s of steps) if (v <= s) return s;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / pow) * pow;
}

function MultiFilter({
  label, options, value, onChange,
}: { label: string; options: string[]; value: Set<string>; onChange: (s: Set<string>) => void }) {
  const allSelected = value.size === options.length;
  const summary = allSelected ? 'All' : value.size === 0 ? 'None' : `${value.size} selected`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-between">
          <span className="truncate text-xs"><span className="text-muted-foreground">{label}:</span> {summary}</span>
          <ChevronDown className="ml-2 h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="mb-1 flex items-center gap-2 border-b pb-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => onChange(c ? new Set(options) : new Set())}
            id={`${label}-all`}
          />
          <label htmlFor={`${label}-all`} className="cursor-pointer text-xs font-medium">All</label>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {options.map((o) => {
            const id = `${label}-${o}`;
            const checked = value.has(o);
            return (
              <div key={o} className="flex items-center gap-2 px-1 py-0.5">
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={(c) => {
                    const next = new Set(value);
                    if (c) next.add(o); else next.delete(o);
                    onChange(next);
                  }}
                />
                <label htmlFor={id} className="cursor-pointer truncate text-xs">{o}</label>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TabFilter({
  label, options, value, onChange,
}: { label: string; options: string[]; value: Set<string>; onChange: (s: Set<string>) => void }) {
  const allSelected = value.size === options.length;
  const toggle = (o: string) => {
    if (allSelected) {
      // All 상태에서 탭 누르면 해당 탭만 선택 (single select)
      onChange(new Set([o]));
    } else if (value.size === 1 && value.has(o)) {
      // 한 개만 선택된 상태에서 같은 탭 다시 누르면 All로 해제
      onChange(new Set(options));
    } else {
      // 다른 탭 누르면 해당 탭만 선택
      onChange(new Set([o]));
    }
  };
  return (
    <div className="flex items-start gap-2">
      <div className="w-28 shrink-0 pt-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-1 flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onChange(new Set(options))}
          className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
            allSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'
          }`}
        >
          All
        </button>
        {options.map((o) => {
          const active = !allSelected && value.has(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DmrDashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dmr_entries_all'],
    queryFn: (): Promise<Row[]> =>
      fetchAllRows<Row>((from, to) =>
        supabase
          .from('dmr_entries')
          .select('report_date, team, trade, subcontractor, workplace, manpower')
          .order('report_date', { ascending: true })
          .range(from, to),
      ),
  });

  const rows = data ?? [];

  const teams = useMemo(() => Array.from(new Set(rows.map((r) => r.team).filter(Boolean) as string[])).sort(), [rows]);
  const trades = useMemo(() => Array.from(new Set(rows.map((r) => r.trade).filter(Boolean) as string[])).sort(), [rows]);
  const subs = useMemo(() => Array.from(new Set(rows.map((r) => r.subcontractor))).sort((a, b) => a.localeCompare(b)), [rows]);
  const workplaces = useMemo(() => {
    const seen = Array.from(new Set(rows.map((r) => r.workplace)));
    return WORKPLACE_ORDER.filter((w) => seen.includes(w)).concat(seen.filter((w) => !WORKPLACE_ORDER.includes(w)));
  }, [rows]);

  const [selTeams, setSelTeams] = useState<Set<string> | null>(null);
  const [selTrades, setSelTrades] = useState<Set<string> | null>(null);
  const [selSubs, setSelSubs] = useState<Set<string> | null>(null);
  const [selWp, setSelWp] = useState<Set<string> | null>(null);

  const fTeams = selTeams ?? new Set(teams);
  const fTrades = selTrades ?? new Set(trades);
  const fSubs = selSubs ?? new Set(subs);
  const fWp = selWp ?? new Set(workplaces);

  const filtered = useMemo(() => rows.filter((r) => {
    if (r.team && !fTeams.has(r.team)) return false;
    if (r.trade && !fTrades.has(r.trade)) return false;
    if (!fSubs.has(r.subcontractor)) return false;
    if (!fWp.has(r.workplace)) return false;
    return true;
  }), [rows, fTeams, fTrades, fSubs, fWp]);

  const dates = useMemo(() => Array.from(new Set(filtered.map((r) => r.report_date))).sort(), [filtered]);
  const tableDates = useMemo(() => [...dates].reverse(), [dates]);

  const [chartGroupBy, setChartGroupBy] = useState<'trade' | 'workplace'>('trade');

  // One combined chart grouped by Trade or Workplace (different colored lines)
  const selectedTrades = useMemo(() => trades.filter((t) => fTrades.has(t)), [trades, fTrades]);
  const selectedWpForChart = useMemo(() => workplaces.filter((w) => fWp.has(w)), [workplaces, fWp]);
  const chartKeys = chartGroupBy === 'trade' ? selectedTrades : selectedWpForChart;

  const chartByTrade = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of filtered) {
      if (!m.has(r.report_date)) m.set(r.report_date, new Map());
      const t = m.get(r.report_date)!;
      const key = chartGroupBy === 'trade' ? (r.trade ?? 'Unknown') : r.workplace;
      t.set(key, (t.get(key) ?? 0) + r.manpower);
    }
    return dates.map((d) => {
      const entry: Record<string, number | string> = { date: d };
      for (const k of chartKeys) {
        entry[k] = m.get(d)?.get(k) ?? 0;
      }
      return entry;
    });
  }, [filtered, dates, chartKeys, chartGroupBy]);

  const yMax = useMemo(() => {
    let peak = 0;
    for (const row of chartByTrade) {
      for (const k of chartKeys) {
        const v = Number(row[k] ?? 0);
        if (v > peak) peak = v;
      }
    }
    return niceMax(peak);
  }, [chartByTrade, chartKeys]);
  const yTicks = useMemo(() => {
    const step = yMax / 5;
    return Array.from({ length: 6 }, (_, i) => Math.round(step * i));
  }, [yMax]);

  // KPI
  const totalMandays = useMemo(() => {
    let sum = 0;
    for (const row of chartByTrade) {
      for (const k of chartKeys) sum += Number(row[k] ?? 0);
    }
    return sum;
  }, [chartByTrade, chartKeys]);
  const peak = useMemo(() => {
    let max = 0;
    let maxDate = '-';
    for (const row of chartByTrade) {
      let daySum = 0;
      for (const k of chartKeys) daySum += Number(row[k] ?? 0);
      if (daySum > max) { max = daySum; maxDate = String(row.date); }
    }
    return { date: maxDate, manpower: max };
  }, [chartByTrade, chartKeys]);
  const daysCovered = chartByTrade.length;
  const avgPerDay = daysCovered ? Math.round((totalMandays / daysCovered) * 10) / 10 : 0;

  // Pivot
  const selectedWp = useMemo(() => workplaces.filter((w) => fWp.has(w)), [workplaces, fWp]);
  const pivotSubs = useMemo(() => Array.from(new Set(filtered.map((r) => r.subcontractor))).sort((a, b) => a.localeCompare(b)), [filtered]);

  // Map: subcontractor -> date -> workplace -> sum
  const pivot = useMemo(() => {
    const m = new Map<string, Map<string, Map<string, number>>>();
    for (const r of filtered) {
      if (!m.has(r.subcontractor)) m.set(r.subcontractor, new Map());
      const d = m.get(r.subcontractor)!;
      if (!d.has(r.report_date)) d.set(r.report_date, new Map());
      const w = d.get(r.report_date)!;
      w.set(r.workplace, (w.get(r.workplace) ?? 0) + r.manpower);
    }
    return m;
  }, [filtered]);

  function cellVal(sub: string, date: string, wp: string): number {
    return pivot.get(sub)?.get(date)?.get(wp) ?? 0;
  }
  function dateTotal(sub: string, date: string): number {
    return selectedWp.reduce((a, w) => a + cellVal(sub, date, w), 0);
  }
  function rowTotal(sub: string): number {
    return dates.reduce((a, d) => a + dateTotal(sub, d), 0);
  }
  function colWpTotal(date: string, wp: string): number {
    return pivotSubs.reduce((a, s) => a + cellVal(s, date, wp), 0);
  }

  const dayTotalByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dates) m.set(d, pivotSubs.reduce((a, s) => a + dateTotal(s, d), 0));
    return m;
  }, [dates, pivotSubs, pivot, selectedWp]);

  const grandTotal = totalMandays;

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">DMR Dashboard</h1>
        <p className="text-xs text-muted-foreground">Daily manpower trends from DMR Raw Data. Filters apply to chart and table.</p>
      </div>

      <div className="space-y-2">
        <TabFilter label="Team" options={teams} value={fTeams} onChange={(s) => setSelTeams(s)} />
        <TabFilter label="Trade" options={trades} value={fTrades} onChange={(s) => setSelTrades(s)} />
        <TabFilter label="Workplace" options={workplaces} value={fWp} onChange={(s) => setSelWp(s)} />
        <div className="flex items-start gap-2">
          <div className="w-28 shrink-0 pt-2 text-xs font-medium text-muted-foreground">Subcontractor</div>
          <div className="flex-1">
            <MultiFilter label="Subcontractor" options={subs} value={fSubs} onChange={(s) => setSelSubs(s)} />
          </div>
        </div>
      </div>

      <div className="text-[22px] font-bold text-primary truncate">
        Subcontractor: {fSubs.size === subs.length ? 'All' : Array.from(fSubs).join(', ')}
      </div>

      <ProductivitySummaryCards
        dmrRows={filtered}
        dates={dates}
        fTeams={fTeams}
        fSubs={fSubs}
        fWp={fWp}
      />

      <ProductivityTable
        dmrRows={filtered}
        dates={tableDates}
        fTeams={fTeams}
        fSubs={fSubs}
        fWp={fWp}
        subs={subs}
      />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-sm">Daily Manpower by {chartGroupBy === 'trade' ? 'Trade' : 'Workplace'}</CardTitle>
            </div>
            <div className="inline-flex shrink-0 rounded-md border bg-background p-0.5">
              {(['trade', 'workplace'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setChartGroupBy(m)}
                  className={`rounded px-2.5 py-1 text-xs transition-colors ${
                    chartGroupBy === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {m === 'trade' ? 'Trade' : 'Workplace'}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>
            ) : chartByTrade.length === 0 || chartKeys.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data for current selection</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartByTrade} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={fmtDate} />
                  <YAxis domain={[0, yMax]} ticks={yTicks} tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(l) => fmtDate(l as string)}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {chartKeys.map((k, i) => (
                    <Line
                      key={k}
                      type="monotone"
                      dataKey={k}
                      name={k}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Breakdown by Subcontractor × Date</CardTitle></CardHeader>
        <CardContent>
          {pivotSubs.length === 0 || dates.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No rows for current filters</div>
          ) : (() => {
            const denom = dates.length || 1;
            const avgTotal = (s: string) => Math.floor(rowTotal(s) / denom);
            const avgWp = (s: string, w: string) =>
              Math.floor(dates.reduce((a, d) => a + cellVal(s, d, w), 0) / denom);
            // Sticky left offsets (px)
            const W_SUB = 160;
            const W_AVG = 64;
            const leftAvgTotal = W_SUB;
            const leftAvgWp = (i: number) => W_SUB + W_AVG * (i + 1);
            const avgGroupCols = 1 + selectedWp.length;

            // Sticky constants (match ProductivityTable)
            const H_HEAD = 32;
            const TOP_HEAD_1 = 0;
            const TOP_HEAD_2 = H_HEAD;
            const TOP_TOTAL_BASE = H_HEAD * 2;
            const Z_HEAD = 40;
            const Z_HEAD_LEFT = 50;
            const Z_TOTAL = 30;
            const Z_TOTAL_LEFT = 35;

            // Totals helpers
            const wpAvgAll = (w: string) =>
              Math.floor(dates.reduce((a, d) => a + colWpTotal(d, w), 0) / denom);
            const wpSumAll = (w: string) =>
              dates.reduce((a, d) => a + colWpTotal(d, w), 0);
            const grandAvg = Math.floor(grandTotal / denom);
            const totalRowCount = 1 + selectedWp.length;

            return (
            <div className="max-w-full overflow-auto max-h-[70vh]">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow style={{ height: H_HEAD }}>
                    <TableHead rowSpan={2} className="sticky left-0 border-r bg-background align-bottom" style={{ top: TOP_HEAD_1, width: W_SUB, minWidth: W_SUB, zIndex: Z_HEAD_LEFT }}>Subcontractor</TableHead>
                    <TableHead colSpan={avgGroupCols} className="sticky border-l bg-muted text-center font-medium" style={{ top: TOP_HEAD_1, left: leftAvgTotal, zIndex: Z_HEAD_LEFT }}>Average</TableHead>
                    {tableDates.map((d) => (
                      <TableHead key={d} colSpan={1 + selectedWp.length} className="sticky border-l bg-muted/30 text-center font-medium" style={{ top: TOP_HEAD_1, zIndex: Z_HEAD }}>{fmtDate(d)}</TableHead>
                    ))}
                    <TableHead rowSpan={2} className="sticky border-l bg-muted/30 text-right align-bottom" style={{ top: TOP_HEAD_1, zIndex: Z_HEAD }}>Row Total</TableHead>
                  </TableRow>
                  <TableRow style={{ height: H_HEAD }}>
                    <TableHead className="sticky border-l bg-muted text-right text-[11px] font-semibold" style={{ top: TOP_HEAD_2, left: leftAvgTotal, width: W_AVG, minWidth: W_AVG, zIndex: Z_HEAD_LEFT }}>Total</TableHead>
                    {selectedWp.map((w, i) => (
                      <TableHead key={`avg-${w}`} className="sticky bg-muted text-right text-[11px] font-normal text-muted-foreground" style={{ top: TOP_HEAD_2, left: leftAvgWp(i), width: W_AVG, minWidth: W_AVG, zIndex: Z_HEAD_LEFT }}>{w}</TableHead>
                    ))}
                    {tableDates.flatMap((d) => [
                      <TableHead key={`${d}-total`} className="sticky border-l bg-muted/50 text-right text-[11px] font-semibold" style={{ top: TOP_HEAD_2, zIndex: Z_HEAD }}>Total</TableHead>,
                      ...selectedWp.map((w) => (
                        <TableHead key={`${d}-${w}`} className="sticky bg-muted text-right text-[11px] font-normal text-muted-foreground" style={{ top: TOP_HEAD_2, zIndex: Z_HEAD }}>{w}</TableHead>
                      )),
                    ])}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Grand Total row */}
                  <TableRow className="border-t-2 bg-muted font-bold whitespace-nowrap" style={{ height: H_HEAD }}>
                    <TableCell
                      rowSpan={totalRowCount}
                      className="sticky left-0 border-r bg-muted align-middle text-center font-bold"
                      style={{ top: TOP_TOTAL_BASE, width: W_SUB, minWidth: W_SUB, zIndex: Z_TOTAL_LEFT }}
                    >
                      Total
                    </TableCell>
                    <TableCell className="sticky border-l bg-muted text-right tabular-nums font-bold" style={{ top: TOP_TOTAL_BASE, left: leftAvgTotal, width: W_AVG, minWidth: W_AVG, zIndex: Z_TOTAL_LEFT }}>{grandAvg || ''}</TableCell>
                    {selectedWp.map((w, i) => {
                      const v = wpAvgAll(w);
                      return <TableCell key={`grand-avg-${w}`} className="sticky bg-muted text-right tabular-nums text-muted-foreground font-bold" style={{ top: TOP_TOTAL_BASE, left: leftAvgWp(i), width: W_AVG, minWidth: W_AVG, zIndex: Z_TOTAL_LEFT }}>{v || ''}</TableCell>;
                    })}
                    {tableDates.flatMap((d) => {
                      const t = dayTotalByDate.get(d) ?? 0;
                      return [
                        <TableCell key={`grand-${d}-total`} className="sticky border-l bg-muted text-right tabular-nums font-bold" style={{ top: TOP_TOTAL_BASE, zIndex: Z_TOTAL }}>{t || ''}</TableCell>,
                        ...selectedWp.map((w) => {
                          const v = colWpTotal(d, w);
                          return <TableCell key={`grand-${d}-${w}`} className="sticky bg-muted text-right tabular-nums text-muted-foreground font-bold" style={{ top: TOP_TOTAL_BASE, zIndex: Z_TOTAL }}>{v || ''}</TableCell>;
                        }),
                      ];
                    })}
                    <TableCell className="sticky border-l bg-muted text-right tabular-nums font-bold" style={{ top: TOP_TOTAL_BASE, zIndex: Z_TOTAL }}>{grandTotal || ''}</TableCell>
                  </TableRow>

                  {/* Per-workplace Total rows */}
                  {selectedWp.map((wRow, wIdx) => {
                    const top = TOP_TOTAL_BASE + H_HEAD * (1 + wIdx);
                    const wAvg = wpAvgAll(wRow);
                    const wSum = wpSumAll(wRow);
                    const isLast = wIdx === selectedWp.length - 1;
                    return (
                      <TableRow key={`total-wp-${wRow}`} className={`${isLast ? 'border-b-2' : ''} bg-muted/70 font-bold`} style={{ height: H_HEAD }}>
                        <TableCell className="sticky border-l bg-muted/70 text-right tabular-nums font-bold" style={{ top, left: leftAvgTotal, width: W_AVG, minWidth: W_AVG, zIndex: Z_TOTAL_LEFT }}>{wAvg || ''}</TableCell>
                        {selectedWp.map((w, i) => {
                          const v = w === wRow ? wAvg : 0;
                          return <TableCell key={`total-wp-${wRow}-avg-${w}`} className="sticky bg-muted/70 text-right tabular-nums text-muted-foreground font-bold" style={{ top, left: leftAvgWp(i), width: W_AVG, minWidth: W_AVG, zIndex: Z_TOTAL_LEFT }}>{v || ''}</TableCell>;
                        })}
                        {tableDates.flatMap((d) => {
                          const t = colWpTotal(d, wRow);
                          return [
                            <TableCell key={`total-wp-${wRow}-${d}-total`} className="sticky border-l bg-muted/70 text-right tabular-nums font-bold" style={{ top, zIndex: Z_TOTAL }}>{t || ''}</TableCell>,
                            ...selectedWp.map((w) => {
                              const v = w === wRow ? t : 0;
                              return <TableCell key={`total-wp-${wRow}-${d}-${w}`} className="sticky bg-muted/70 text-right tabular-nums text-muted-foreground font-bold" style={{ top, zIndex: Z_TOTAL }}>{v || ''}</TableCell>;
                            }),
                          ];
                        })}
                        <TableCell className="sticky border-l bg-muted/70 text-right tabular-nums font-bold" style={{ top, zIndex: Z_TOTAL }}>{wSum || ''}</TableCell>
                      </TableRow>
                    );
                  })}

                  {pivotSubs.map((s) => {
                    const at = avgTotal(s);
                    return (
                    <TableRow key={s}>
                      <TableCell className="sticky left-0 z-10 border-r bg-background font-medium" style={{ width: W_SUB, minWidth: W_SUB }}>{s}</TableCell>
                      <TableCell className={`sticky z-10 border-l bg-background text-right font-semibold tabular-nums ${at === 0 ? 'text-muted-foreground/50' : ''}`} style={{ left: leftAvgTotal, width: W_AVG, minWidth: W_AVG }}>{at}</TableCell>
                      {selectedWp.map((w, i) => {
                        const v = avgWp(s, w);
                        return <TableCell key={`avg-${s}-${w}`} className={`sticky z-10 bg-background text-right tabular-nums ${v === 0 ? 'text-muted-foreground/40' : ''}`} style={{ left: leftAvgWp(i), width: W_AVG, minWidth: W_AVG }}>{v}</TableCell>;
                      })}
                      {tableDates.flatMap((d) => {
                        const total = dateTotal(s, d);
                        return [
                          <TableCell key={`${s}-${d}-total`} className={`border-l bg-muted/30 text-right font-semibold tabular-nums ${total === 0 ? 'text-muted-foreground/50' : ''}`}>{total}</TableCell>,
                          ...selectedWp.map((w) => {
                            const v = cellVal(s, d, w);
                            return <TableCell key={`${s}-${d}-${w}`} className={`text-right tabular-nums ${v === 0 ? 'text-muted-foreground/40' : ''}`}>{v}</TableCell>;
                          }),
                        ];
                      })}
                      <TableCell className={`border-l bg-muted/30 text-right font-semibold tabular-nums ${rowTotal(s) === 0 ? 'text-muted-foreground/50' : ''}`}>{rowTotal(s)}</TableCell>
                    </TableRow>
                  );})}
                </TableBody>
              </Table>
            </div>
            );
          })()}

        </CardContent>
      </Card>
    </div>
  );
}
