import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { exportPunchWorkbook, type PunchItem } from '@/lib/punch-excel-utils';
import {
  PUNCH_FIELDS, getPunchFieldsByGroup,
  type PunchHealthStatus,
} from '@/lib/punch-field-registry';

const ALL = '__all__';
const PAGE_SIZE = 1000;

type ColumnMode = 'all' | 'identity' | 'schedule' | 'progress' | 'pre_engineering' | 'people';

export default function PunchExportPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [team, setTeam] = useState('');
  const [health, setHealth] = useState<'' | PunchHealthStatus>('');
  const [ready, setReady] = useState<'' | 'ready' | 'blocked'>('');
  const [dateField, setDateField] = useState<'planned_completion_date' | 'actual_completion_date' | 'planned_start_date' | 'actual_start_date'>('planned_completion_date');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [columnMode, setColumnMode] = useState<ColumnMode>('all');

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

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team).filter(Boolean) as string[])].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (team && r.team !== team) return false;
      if (health && r.health_status !== health) return false;
      if (ready === 'ready' && !r.pre_engineering_ready) return false;
      if (ready === 'blocked' && r.pre_engineering_ready) return false;
      if (dateStart || dateEnd) {
        const v = (r as any)[dateField] as string | null;
        if (!v) return false;
        if (dateStart && v < dateStart) return false;
        if (dateEnd && v > dateEnd) return false;
      }
      if (q) {
        const blob = [r.item_no, r.outstanding_work, r.location, r.subcontractor_name, r.subsub_name].filter(Boolean).join(' ').toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, team, health, ready, dateField, dateStart, dateEnd]);

  const exportData = () => {
    const fields = columnMode === 'all' ? PUNCH_FIELDS : getPunchFieldsByGroup(columnMode);
    const result = exportPunchWorkbook(filtered, { fields });
    toast({ title: 'Export complete', description: `${result.rowCount} rows exported.` });
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Punch Export</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Filter punch items and export. The file can be re-imported as-is (round-trip).
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Input placeholder="Search item no / work / location…" value={query} onChange={(e) => setQuery(e.target.value)} className="xl:col-span-2" />
          <FilterSelect value={team} placeholder="Team" options={teams.map((t) => ({ value: t, label: t }))} onChange={setTeam} />
          <FilterSelect value={health} placeholder="Health" options={['ahead', 'on_track', 'behind', 'critical'].map((v) => ({ value: v, label: v.replace('_', ' ') }))} onChange={(v) => setHealth(v as any)} />
          <FilterSelect value={ready} placeholder="Pre-Eng" options={[{ value: 'ready', label: 'Ready' }, { value: 'blocked', label: 'Blocked' }]} onChange={(v) => setReady(v as any)} />
          <Select value={dateField} onValueChange={(v) => setDateField(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="planned_completion_date">Planned Completion</SelectItem>
              <SelectItem value="actual_completion_date">Actual Completion</SelectItem>
              <SelectItem value="planned_start_date">Planned Start</SelectItem>
              <SelectItem value="actual_start_date">Actual Start</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
          <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Export Options</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Select value={columnMode} onValueChange={(v) => setColumnMode(v as ColumnMode)}>
              <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Columns</SelectItem>
                <SelectItem value="identity">Identity Only</SelectItem>
                <SelectItem value="schedule">Schedule Only</SelectItem>
                <SelectItem value="progress">Progress Only</SelectItem>
                <SelectItem value="pre_engineering">Pre-Engineering Only</SelectItem>
                <SelectItem value="people">People Only</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{filtered.length} rows matched</span>
          </div>
          <Button onClick={exportData} disabled={loading || filtered.length === 0}>
            <Download className="mr-1.5 h-4 w-4" />
            {loading ? 'Loading…' : 'Export Excel'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({ value, placeholder, options, onChange }: {
  value: string; placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? '' : next)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
