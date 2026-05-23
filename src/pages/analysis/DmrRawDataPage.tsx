import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

type DmrRow = {
  id: string;
  report_date: string;
  team: 'Arch' | 'Mech' | 'Elec';
  trade: string | null;
  subcontractor: string;
  workplace: 'T&C' | 'Defect' | 'Post TOP';
  manpower: number;
};

const TEAMS = ['Arch', 'Mech', 'Elec'] as const;
const WORKPLACES = ['T&C', 'Defect', 'Post TOP'] as const;

export default function DmrRawDataPage() {
  const [rows, setRows] = useState<DmrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [team, setTeam] = useState<string>('all');
  const [workplace, setWorkplace] = useState<string>('all');
  const [sub, setSub] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('dmr_entries')
      .select('id, report_date, team, trade, subcontractor, workplace, manpower')
      .order('report_date', { ascending: false })
      .order('team', { ascending: true })
      .order('subcontractor', { ascending: true })
      .order('workplace', { ascending: true })
      .limit(1000);
    if (error) {
      toast({ title: 'Failed to load DMR', description: error.message, variant: 'destructive' });
    } else {
      setRows((data ?? []) as DmrRow[]);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (from && r.report_date < from) return false;
      if (to && r.report_date > to) return false;
      if (team !== 'all' && r.team !== team) return false;
      if (workplace !== 'all' && r.workplace !== workplace) return false;
      if (sub && !r.subcontractor.toLowerCase().includes(sub.toLowerCase())) return false;
      return true;
    });
  }, [rows, from, to, team, workplace, sub]);

  async function exportExcel() {
    const XLSX = await import('xlsx-js-style');
    const aoa = [
      ['Date', 'Team', 'Trade', 'Subcontractor', 'Workplace', 'Manpower'],
      ...filtered.map(r => [r.report_date, r.team, r.trade ?? '', r.subcontractor, r.workplace, r.manpower]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DMR');
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    XLSX.writeFile(wb, `DMR_${stamp}.xlsx`);
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">DMR Raw Data</h1>
          <p className="text-xs text-muted-foreground">Daily Manpower Report — flattened per (date, subcontractor, workplace)</p>
        </div>
        <Button size="sm" variant="outline" onClick={exportExcel} disabled={!filtered.length}>
          <Download className="mr-2 h-4 w-4" /> Excel
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        <div>
          <label className="text-[10px] text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 w-36" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 w-36" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Team</label>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {TEAMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Workplace</label>
          <Select value={workplace} onValueChange={setWorkplace}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {WORKPLACES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-[10px] text-muted-foreground">Subcontractor</label>
          <Input value={sub} onChange={e => setSub(e.target.value)} placeholder="search…" className="h-8" />
        </div>
        <div className="text-xs text-muted-foreground">
          {filtered.length.toLocaleString()} rows · Σ {filtered.reduce((a, r) => a + r.manpower, 0).toLocaleString()}
        </div>
      </div>

      <div className="rounded-md border">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Trade</TableHead>
                <TableHead>Subcontractor</TableHead>
                <TableHead>Workplace</TableHead>
                <TableHead className="text-right">Manpower</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.report_date}</TableCell>
                  <TableCell>{r.team}</TableCell>
                  <TableCell>{r.trade ?? ''}</TableCell>
                  <TableCell>{r.subcontractor}</TableCell>
                  <TableCell>{r.workplace}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.manpower}</TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
