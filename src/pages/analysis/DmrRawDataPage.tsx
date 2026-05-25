import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetch-all-rows';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Download, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/types/enums';

type Team = 'Arch' | 'Mech' | 'Elec';
type Workplace = 'T&C' | 'Defect' | 'Post TOP';

type DmrRow = {
  id: string;
  report_date: string;
  team: Team;
  trade: string | null;
  subcontractor: string;
  workplace: Workplace;
  manpower: number;
};

const TEAMS: Team[] = ['Arch', 'Mech', 'Elec'];
const WORKPLACES: Workplace[] = ['T&C', 'Defect', 'Post TOP'];

const WRITE_ROLES: AppRole[] = ['user', 'senior_user', 'd_superuser', 'superuser', 'admin'];
const DELETE_ROLES: AppRole[] = ['senior_user', 'd_superuser', 'superuser', 'admin'];
const hasAny = (roles: AppRole[], allowed: AppRole[]) => roles.some(r => allowed.includes(r));

export default function DmrRawDataPage() {
  const { roles, profile } = useAuth();
  const canEdit = hasAny(roles, WRITE_ROLES);
  const canDelete = hasAny(roles, DELETE_ROLES);
  const isDSuper = roles.includes('d_superuser') && !roles.some(r => ['superuser', 'admin'].includes(r));

  const [rows, setRows] = useState<DmrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [team, setTeam] = useState<string>('all');
  const [workplace, setWorkplace] = useState<string>('all');
  const [sub, setSub] = useState('');

  const [editing, setEditing] = useState<DmrRow | null>(null);
  const [draft, setDraft] = useState<DmrRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchAllRows<DmrRow>((from, to) =>
        supabase
          .from('dmr_entries')
          .select('id, report_date, team, trade, subcontractor, workplace, manpower')
          .order('report_date', { ascending: false })
          .order('team', { ascending: true })
          .order('subcontractor', { ascending: true })
          .order('workplace', { ascending: true })
          .range(from, to),
      );
      setRows(data);
    } catch (err: any) {
      toast({ title: 'Failed to load DMR', description: err?.message ?? String(err), variant: 'destructive' });
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

  function openEdit(r: DmrRow) {
    if (!canEdit) return;
    if (isDSuper && profile?.team && r.team !== profile.team) {
      toast({ title: 'Not allowed', description: 'D.Super User can only edit rows of own team.', variant: 'destructive' });
      return;
    }
    setEditing(r);
    setDraft({ ...r });
  }

  function closeEdit() {
    setEditing(null);
    setDraft(null);
  }

  async function saveEdit() {
    if (!draft || !editing) return;
    if (!draft.subcontractor.trim()) {
      toast({ title: 'Subcontractor required', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(draft.manpower) || draft.manpower < 0) {
      toast({ title: 'Invalid manpower', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('dmr_entries')
      .update({
        report_date: draft.report_date,
        team: draft.team,
        trade: draft.trade?.trim() ? draft.trade.trim() : null,
        subcontractor: draft.subcontractor.trim(),
        workplace: draft.workplace,
        manpower: Math.round(draft.manpower),
      })
      .eq('id', editing.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved' });
    setRows(prev => prev.map(x => x.id === editing.id ? { ...draft } : x));
    closeEdit();
  }

  async function deleteRow() {
    if (!editing) return;
    if (!canDelete) return;
    if (!confirm('Delete this DMR entry?')) return;
    setSaving(true);
    const { error } = await supabase.from('dmr_entries').delete().eq('id', editing.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Deleted' });
    setRows(prev => prev.filter(x => x.id !== editing.id));
    closeEdit();
  }

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
          <p className="text-xs text-muted-foreground">
            Daily Manpower Report — flattened per (date, subcontractor, workplace)
            {canEdit ? ' · click a row to edit' : ' · read-only'}
          </p>
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
                {canEdit && <TableHead className="w-12"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const blocked = canEdit && isDSuper && profile?.team && r.team !== profile.team;
                return (
                  <TableRow
                    key={r.id}
                    className={canEdit && !blocked ? 'cursor-pointer hover:bg-muted/50' : ''}
                    onClick={() => !blocked && openEdit(r)}
                  >
                    <TableCell className="font-mono text-xs">{r.report_date}</TableCell>
                    <TableCell>{r.team}</TableCell>
                    <TableCell>{r.trade ?? ''}</TableCell>
                    <TableCell>{r.subcontractor}</TableCell>
                    <TableCell>{r.workplace}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.manpower}</TableCell>
                    {canEdit && (
                      <TableCell>
                        {!blocked && <Pencil className="h-3.5 w-3.5 text-muted-foreground" />}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {!filtered.length && (
                <TableRow><TableCell colSpan={canEdit ? 7 : 6} className="py-10 text-center text-sm text-muted-foreground">No data</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) closeEdit(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit DMR Entry</DialogTitle>
            <DialogDescription>Update the daily manpower record. Changes are subject to your role permissions.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-1">
                <label className="text-[10px] text-muted-foreground">Date</label>
                <Input type="date" value={draft.report_date}
                  onChange={e => setDraft({ ...draft, report_date: e.target.value })} className="h-8" />
              </div>
              <div className="col-span-1">
                <label className="text-[10px] text-muted-foreground">Team</label>
                <Select value={draft.team} onValueChange={v => setDraft({ ...draft, team: v as Team })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEAMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1">
                <label className="text-[10px] text-muted-foreground">Workplace</label>
                <Select value={draft.workplace} onValueChange={v => setDraft({ ...draft, workplace: v as Workplace })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WORKPLACES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1">
                <label className="text-[10px] text-muted-foreground">Manpower</label>
                <Input type="number" min={0} value={draft.manpower}
                  onChange={e => setDraft({ ...draft, manpower: Number(e.target.value) })} className="h-8" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-muted-foreground">Subcontractor</label>
                <Input value={draft.subcontractor}
                  onChange={e => setDraft({ ...draft, subcontractor: e.target.value })} className="h-8" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-muted-foreground">Trade</label>
                <Input value={draft.trade ?? ''}
                  onChange={e => setDraft({ ...draft, trade: e.target.value })} className="h-8" />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {canDelete && (
                <Button variant="destructive" size="sm" onClick={deleteRow} disabled={saving}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={closeEdit} disabled={saving}>Cancel</Button>
              <Button size="sm" onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
