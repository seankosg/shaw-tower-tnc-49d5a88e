import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DefectKpiCard } from '@/components/defects/DefectKpiCard';
import { DefectDailyCumulativeChart } from '@/components/defects/DefectDailyCumulativeChart';
import { DefectStatusBadge } from '@/components/defects/DefectStatusBadge';
import { defaultDefectDateRange } from '@/lib/defect-progress-utils';
import { type DefectItem, formatPct, isClosedDefect, isOverdueDefect } from '@/lib/defect-utils';

export default function DefectDashboardPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<DefectItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await (supabase as any).from('defect_items').select('*').eq('is_active', true).order('updated_at', { ascending: false }).limit(1000);
      if (!cancelled) {
        setItems(data ?? []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const metrics = useMemo(() => {
    const total = items.length;
    const closed = items.filter(isClosedDefect).length;
    const overdue = items.filter((item) => isOverdueDefect(item)).length;
    const dueThisWeek = items.filter((item) => {
      const due = item.target_date ?? item.planned_date;
      if (!due || isClosedDefect(item)) return false;
      const diff = (new Date(due).getTime() - Date.now()) / 86400000;
      return diff >= 0 && diff <= 7;
    }).length;
    const progress = total ? Math.round((closed / total) * 1000) / 10 : 0;
    const avgProgress = total ? Math.round(items.reduce((sum, item) => sum + Number(item.actual_progress_pct ?? 0), 0) / total * 10) / 10 : 0;
    return { total, closed, open: total - closed, overdue, dueThisWeek, progress, avgProgress };
  }, [items]);

  const byLevel = useMemo(() => {
    const map = new Map<string, { total: number; closed: number }>();
    items.forEach((item) => {
      const key = item.area_level || '—';
      const current = map.get(key) ?? { total: 0, closed: 0 };
      current.total += 1;
      if (isClosedDefect(item)) current.closed += 1;
      map.set(key, current);
    });
    return Array.from(map.entries()).map(([level, row]) => ({ level, ...row })).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [items]);

  const range = useMemo(() => defaultDefectDateRange(items), [items]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading defect dashboard...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Defect Dashboard</h1>
          <p className="text-sm text-muted-foreground">Defect and incompletion work overview.</p>
        </div>
        <Button onClick={() => navigate('/defects/raw-data')}>View Raw Data</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <DefectKpiCard title="Total Items" value={metrics.total} />
        <DefectKpiCard title="Open Items" value={metrics.open} />
        <DefectKpiCard title="Closed Items" value={metrics.closed} />
        <DefectKpiCard title="Overdue" value={metrics.overdue} />
        <DefectKpiCard title="Due This Week" value={metrics.dueThisWeek} />
        <DefectKpiCard title="Progress" value={formatPct(metrics.progress)} hint={`Avg ${formatPct(metrics.avgProgress)}`} />
      </div>
      <Card>
        <CardHeader><CardTitle>Daily / Cumulative Progress</CardTitle></CardHeader>
        <CardContent><DefectDailyCumulativeChart items={items} start={range.start} end={range.end} bucket="week" dateField="planned_date" cumulative /></CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Top Levels</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Level</TableHead><TableHead>Total</TableHead><TableHead>Closed</TableHead><TableHead>Progress</TableHead></TableRow></TableHeader>
              <TableBody>{byLevel.map((row) => <TableRow key={row.level}><TableCell>{row.level}</TableCell><TableCell>{row.total}</TableCell><TableCell>{row.closed}</TableCell><TableCell>{formatPct(row.total ? (row.closed / row.total) * 100 : 0)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent Updates</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Issue No</TableHead><TableHead>Level</TableHead><TableHead>Status</TableHead><TableHead>Progress</TableHead></TableRow></TableHeader>
              <TableBody>{items.slice(0, 10).map((item) => <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/defects/${item.id}`)}><TableCell className="font-medium">{item.issue_no}</TableCell><TableCell>{item.area_level || '—'}</TableCell><TableCell><DefectStatusBadge status={item.closure_status ?? item.status} /></TableCell><TableCell>{formatPct(item.actual_progress_pct)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
