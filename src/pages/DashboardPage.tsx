import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import { AlertTriangle, CheckCircle2, Clock, ListChecks } from 'lucide-react';
import type { TcStatus } from '@/types/enums';
import { formatDdMmm } from '@/lib/format';

interface SubtestRow {
  id: string;
  subtest_id: string;
  item_no: string;
  mos_code: string;
  system_id: string;
  t1_status: TcStatus | null;
  t2_status: TcStatus | null;
  t1_planned_date: string | null;
  t1_actual_date: string | null;
  t2_planned_date: string | null;
  t2_actual_date: string | null;
  system_master?: { system_code: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  Done: 'hsl(142, 71%, 45%)',
  WIP: 'hsl(43, 96%, 56%)',
  Planned: 'hsl(215, 20%, 65%)',
  Hold: 'hsl(0, 72%, 51%)',
};

const PIE_COLORS = ['hsl(142, 71%, 45%)', 'hsl(43, 96%, 56%)', 'hsl(215, 20%, 65%)', 'hsl(0, 72%, 51%)'];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [subtests, setSubtests] = useState<SubtestRow[]>([]);
  const [systems, setSystems] = useState<{ id: string; system_code: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [subRes, sysRes] = await Promise.all([
        supabase
          .from('subtests')
          .select('id, subtest_id, item_no, mos_code, system_id, t1_status, t2_status, t1_planned_date, t1_actual_date, t2_planned_date, t2_actual_date, system_master(system_code)')
          .eq('is_active', true)
          .limit(5000),
        supabase.from('system_master').select('id, system_code').eq('is_active', true),
      ]);
      if (subRes.data) setSubtests(subRes.data as unknown as SubtestRow[]);
      if (sysRes.data) setSystems(sysRes.data);
      setLoading(false);
    }
    load();
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const total = subtests.length;
    const t1Done = subtests.filter(s => s.t1_status === 'Done').length;
    const t2Done = subtests.filter(s => s.t2_status === 'Done').length;
    const delayed = subtests.filter(s =>
      (s.t1_planned_date && s.t1_planned_date < today && s.t1_status !== 'Done') ||
      (s.t2_planned_date && s.t2_planned_date < today && s.t2_status !== 'Done')
    ).length;
    return {
      total,
      t1Rate: total ? Math.round((t1Done / total) * 100) : 0,
      t2Rate: total ? Math.round((t2Done / total) * 100) : 0,
      delayed,
    };
  }, [subtests, today]);

  // System-wise progress
  const systemProgress = useMemo(() => {
    const sysMap = new Map<string, { code: string; Done: number; WIP: number; Planned: number; Hold: number }>();
    systems.forEach(s => sysMap.set(s.id, { code: s.system_code, Done: 0, WIP: 0, Planned: 0, Hold: 0 }));
    subtests.forEach(s => {
      const entry = sysMap.get(s.system_id);
      if (!entry) return;
      const st = s.t1_status || 'Planned';
      if (st in entry) (entry as any)[st]++;
    });
    return Array.from(sysMap.values())
      .filter(v => v.Done + v.WIP + v.Planned + v.Hold > 0)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [subtests, systems]);

  // T1/T2 status distribution for pie
  const t1Distribution = useMemo(() => {
    const counts: Record<string, number> = { Done: 0, WIP: 0, Planned: 0, Hold: 0 };
    subtests.forEach(s => { counts[s.t1_status || 'Planned']++; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [subtests]);

  const t2Distribution = useMemo(() => {
    const counts: Record<string, number> = { Done: 0, WIP: 0, Planned: 0, Hold: 0 };
    subtests.forEach(s => { counts[s.t2_status || 'Planned']++; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [subtests]);

  // Monthly completion trend
  const monthlyTrend = useMemo(() => {
    const months = new Map<string, { t1: number; t2: number }>();
    subtests.forEach(s => {
      if (s.t1_actual_date) {
        const m = s.t1_actual_date.slice(0, 7);
        const entry = months.get(m) || { t1: 0, t2: 0 };
        entry.t1++;
        months.set(m, entry);
      }
      if (s.t2_actual_date) {
        const m = s.t2_actual_date.slice(0, 7);
        const entry = months.get(m) || { t1: 0, t2: 0 };
        entry.t2++;
        months.set(m, entry);
      }
    });
    return Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));
  }, [subtests]);

  // Delayed subtests
  const delayedRows = useMemo(() => {
    return subtests.filter(s =>
      (s.t1_planned_date && s.t1_planned_date < today && s.t1_status !== 'Done') ||
      (s.t2_planned_date && s.t2_planned_date < today && s.t2_status !== 'Done')
    ).slice(0, 50);
  }, [subtests, today]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading dashboard...</div>;
  }

  const chartConfig = {
    Done: { label: 'Done', color: STATUS_COLORS.Done },
    WIP: { label: 'WIP', color: STATUS_COLORS.WIP },
    Planned: { label: 'Planned', color: STATUS_COLORS.Planned },
    Hold: { label: 'Hold', color: STATUS_COLORS.Hold },
    t1: { label: 'T1 Completions', color: 'hsl(220, 65%, 36%)' },
    t2: { label: 'T2 Completions', color: 'hsl(142, 71%, 45%)' },
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-foreground">Executive Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ListChecks className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Total Subtests</p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">T1 Completion</p>
              <p className="text-2xl font-bold text-foreground">{stats.t1Rate}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">T2 Completion</p>
              <p className="text-2xl font-bold text-foreground">{stats.t2Rate}%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-sm text-muted-foreground">Delayed</p>
              <p className="text-2xl font-bold text-foreground">{stats.delayed}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* System Progress Bar Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">System Progress (T1)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={systemProgress} layout="vertical" margin={{ left: 60, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="code" width={56} tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="Done" stackId="a" fill={STATUS_COLORS.Done} />
                <Bar dataKey="WIP" stackId="a" fill={STATUS_COLORS.WIP} />
                <Bar dataKey="Planned" stackId="a" fill={STATUS_COLORS.Planned} />
                <Bar dataKey="Hold" stackId="a" fill={STATUS_COLORS.Hold} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* T1/T2 Pie Charts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-center text-xs font-medium text-muted-foreground">T1 Status</p>
                <ChartContainer config={chartConfig} className="mx-auto h-[130px] w-[130px]">
                  <PieChart>
                    <Pie data={t1Distribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                      {t1Distribution.map((entry, i) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
              </div>
              <div>
                <p className="mb-1 text-center text-xs font-medium text-muted-foreground">T2 Status</p>
                <ChartContainer config={chartConfig} className="mx-auto h-[130px] w-[130px]">
                  <PieChart>
                    <Pie data={t2Distribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                      {t2Distribution.map((entry, i) => (
                        <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend */}
      {monthlyTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Monthly Completion Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <LineChart data={monthlyTrend} margin={{ left: 16, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Line type="monotone" dataKey="t1" stroke="hsl(220, 65%, 36%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="t2" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Delayed Subtests Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Delayed Subtests ({delayedRows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {delayedRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No delayed subtests</p>
          ) : (
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>System</TableHead>
                    <TableHead>Item No</TableHead>
                    <TableHead>MOS Code</TableHead>
                    <TableHead>T1 Status</TableHead>
                    <TableHead>T1 Planned</TableHead>
                    <TableHead>T2 Status</TableHead>
                    <TableHead>T2 Planned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {delayedRows.map(row => {
                    const sys = systems.find(s => s.id === row.system_id);
                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/subtests/${row.id}`)}
                      >
                        <TableCell className="font-medium">{sys?.system_code ?? '—'}</TableCell>
                        <TableCell>{row.item_no}</TableCell>
                        <TableCell>{row.mos_code}</TableCell>
                        <TableCell>
                          <Badge variant={row.t1_status === 'Done' ? 'default' : 'secondary'}>
                            {row.t1_status ?? '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDdMmm(row.t1_planned_date)}</TableCell>
                        <TableCell>
                          <Badge variant={row.t2_status === 'Done' ? 'default' : 'secondary'}>
                            {row.t2_status ?? '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDdMmm(row.t2_planned_date)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
