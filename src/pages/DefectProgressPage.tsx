import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DefectProgressMatrix } from '@/components/defects/DefectProgressMatrix';
import { DefectDailyCumulativeChart } from '@/components/defects/DefectDailyCumulativeChart';
import { aggregateDefectProgress, defaultDefectDateRange, type DefectProgressBucket, type DefectProgressDateField, type DefectProgressGroupBy } from '@/lib/defect-progress-utils';
import { type DefectItem } from '@/lib/defect-utils';

const GROUP_LABELS: Record<DefectProgressGroupBy, string> = {
  team: 'Team',
  subcontractor_name: 'Subcontractor',
  subsub_name: 'Sub-Subcontractor',
  hdec_pic_name: 'HDEC PIC',
  area_level: 'Level',
  main_trade: 'Main Trade',
  sub_trade: 'Sub Trade',
  work_type: 'Work Type',
};

export default function DefectProgressPage() {
  const [items, setItems] = useState<DefectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<DefectProgressGroupBy>('team');
  const [bucket, setBucket] = useState<DefectProgressBucket>('week');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [chartMode, setChartMode] = useState<'daily' | 'cumulative'>('cumulative');
  const [dateField, setDateField] = useState<DefectProgressDateField>('planned_completion_date');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any).from('defect_items').select('*').eq('is_active', true).limit(5000);
      if (!cancelled) {
        const rows = (data ?? []) as DefectItem[];
        const range = defaultDefectDateRange(rows);
        setItems(rows);
        setStart(range.start);
        setEnd(range.end);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const matrix = useMemo(() => start && end ? aggregateDefectProgress(items, { groupBy, bucket, start, end, dateField }) : { buckets: [], rows: [] }, [items, groupBy, bucket, start, end, dateField]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading defect progress...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Defect Progress Matrix</h1>
        <p className="text-sm text-muted-foreground">Plan / Actual progress by group and date bucket.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Controls</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <Select value={groupBy} onValueChange={(value) => setGroupBy(value as DefectProgressGroupBy)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(GROUP_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={bucket} onValueChange={(value) => setBucket(value as DefectProgressBucket)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">Daily</SelectItem><SelectItem value="week">Weekly</SelectItem></SelectContent></Select>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          <Select value={dateField} onValueChange={(value) => setDateField(value as DefectProgressDateField)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="planned_completion_date">Planned Completion Date</SelectItem><SelectItem value="planned_closure_date">Planned Closure Date</SelectItem></SelectContent></Select>
          <Select value={chartMode} onValueChange={(value) => setChartMode(value as 'daily' | 'cumulative')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">Daily Chart</SelectItem><SelectItem value="cumulative">Cumulative Chart</SelectItem></SelectContent></Select>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Daily / Cumulative Chart</CardTitle></CardHeader>
        <CardContent><DefectDailyCumulativeChart items={items} start={start} end={end} bucket={bucket} dateField={dateField} cumulative={chartMode === 'cumulative'} /></CardContent>
      </Card>
      <DefectProgressMatrix rows={matrix.rows} buckets={matrix.buckets} bucket={bucket} groupBy={groupBy} dateField={dateField} />
    </div>
  );
}
