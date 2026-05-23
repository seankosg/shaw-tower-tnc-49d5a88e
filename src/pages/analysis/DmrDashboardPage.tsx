import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, Loader2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

type Row = {
  report_date: string;
  team: string | null;
  trade: string | null;
  subcontractor: string;
  workplace: string;
  manpower: number;
};

const WORKPLACE_ORDER = ['T&C', 'Defect', 'Post TOP'];

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
    const next = new Set(value);
    if (next.has(o)) next.delete(o); else next.add(o);
    onChange(next);
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
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('dmr_entries')
        .select('report_date, team, trade, subcontractor, workplace, manpower')
        .order('report_date', { ascending: true })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
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

  const chartData = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filtered) m.set(r.report_date, (m.get(r.report_date) ?? 0) + r.manpower);
    return dates.map((d) => ({ date: d, manpower: m.get(d) ?? 0 }));
  }, [filtered, dates]);

  // Per-workplace chart series (one chart each)
  const chartByWp = useMemo(() => {
    const out: { wp: string; data: { date: string; manpower: number }[] }[] = [];
    const selected = workplaces.filter((w) => fWp.has(w));
    for (const wp of selected) {
      const m = new Map<string, number>();
      for (const r of filtered) if (r.workplace === wp) m.set(r.report_date, (m.get(r.report_date) ?? 0) + r.manpower);
      out.push({ wp, data: dates.map((d) => ({ date: d, manpower: m.get(d) ?? 0 })) });
    }
    return out;
  }, [filtered, dates, workplaces, fWp]);

  const yMax = useMemo(() => {
    const peakWp = Math.max(0, ...chartByWp.flatMap((c) => c.data.map((d) => d.manpower)));
    return niceMax(Math.max(peakWp, ...chartData.map((d) => d.manpower)));
  }, [chartByWp, chartData]);
  const yTicks = useMemo(() => {
    const step = yMax / 5;
    return Array.from({ length: 6 }, (_, i) => Math.round(step * i));
  }, [yMax]);

  // KPI
  const totalMandays = chartData.reduce((a, d) => a + d.manpower, 0);
  const peak = chartData.reduce((acc, d) => (d.manpower > acc.manpower ? d : acc), { date: '-', manpower: 0 });
  const daysCovered = chartData.length;
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
  // (day total computed via dayTotalByDate below)

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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total man-days</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{totalMandays}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Avg / day</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{avgPerDay}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Peak day</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{peak.manpower}</div><div className="text-[11px] text-muted-foreground">{fmtDate(peak.date)}</div></CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Days covered</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{daysCovered}</CardContent></Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {isLoading ? (
          <Card className="xl:col-span-2"><CardContent className="flex h-[280px] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</CardContent></Card>
        ) : chartByWp.length === 0 ? (
          <Card className="xl:col-span-2"><CardContent className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No workplace selected</CardContent></Card>
        ) : (
          chartByWp.map(({ wp, data }) => {
            const wpTotal = data.reduce((a, d) => a + d.manpower, 0);
            const wpPeak = data.reduce((a, d) => (d.manpower > a ? d.manpower : a), 0);
            return (
              <Card key={wp}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span>{wp}</span>
                    <span className="text-xs font-normal text-muted-foreground">Total {wpTotal} · Peak {wpPeak}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[260px] w-full">
                    {data.every((d) => d.manpower === 0) ? (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={fmtDate} />
                          <YAxis domain={[0, yMax]} ticks={yTicks} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [v, wp]} labelFormatter={(l) => fmtDate(l as string)} labelClassName="text-xs" contentStyle={{ fontSize: 12 }} />
                          <Line type="monotone" dataKey="manpower" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Breakdown by Subcontractor × Date</CardTitle></CardHeader>
        <CardContent>
          {pivotSubs.length === 0 || dates.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No rows for current filters</div>
          ) : (
            <div className="max-w-full overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="sticky left-0 z-10 border-r bg-background align-bottom">Subcontractor</TableHead>
                    {dates.map((d) => (
                      <TableHead key={d} colSpan={1 + selectedWp.length} className="border-l bg-muted/30 text-center font-medium">{fmtDate(d)}</TableHead>
                    ))}
                    <TableHead rowSpan={2} className="border-l bg-muted/30 text-right align-bottom">Row Total</TableHead>
                  </TableRow>
                  <TableRow>
                    {dates.flatMap((d) => [
                      <TableHead key={`${d}-total`} className="border-l bg-muted/50 text-right text-[11px] font-semibold">Total</TableHead>,
                      ...selectedWp.map((w) => (
                        <TableHead key={`${d}-${w}`} className="text-right text-[11px] font-normal text-muted-foreground">{w}</TableHead>
                      )),
                    ])}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pivotSubs.map((s) => (
                    <TableRow key={s}>
                      <TableCell className="sticky left-0 z-10 border-r bg-background font-medium">{s}</TableCell>
                      {dates.flatMap((d) => {
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
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="sticky left-0 z-10 border-r bg-muted/60 font-semibold">Day Total</TableCell>
                    {dates.flatMap((d) => {
                      const t = dayTotalByDate.get(d) ?? 0;
                      return [
                        <TableCell key={`tot-${d}-total`} className="border-l bg-muted/60 text-right font-bold tabular-nums">{t}</TableCell>,
                        ...selectedWp.map((w) => (
                          <TableCell key={`tot-${d}-${w}`} className="bg-muted/40 text-right font-medium tabular-nums">{colWpTotal(d, w)}</TableCell>
                        )),
                      ];
                    })}
                    <TableCell className="border-l bg-muted/60 text-right font-bold tabular-nums">{grandTotal}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
