import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { downloadDocxFromStorage } from '@/lib/ddn/docx-generator';
import type { DdnEntry } from '@/lib/ddn/schema-types';

function useDdnEntries(from: string, to: string, status: string) {
  return useQuery({
    queryKey: ['ddn-entries', from, to, status],
    queryFn: async () => {
      let q = supabase.from('ddn_entries').select('*').gte('entry_date', from).lte('entry_date', to)
        .order('entry_date', { ascending: false });
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DdnEntry[];
    },
  });
}

function isoMonthsAgo(n: number) {
  const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10);
}
function todayIso() { return new Date().toISOString().slice(0, 10); }

export default function DdnHistoryPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [from, setFrom] = useState(isoMonthsAgo(3));
  const [to, setTo] = useState(todayIso());
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [zipBusy, setZipBusy] = useState(false);

  const { data: rows = [], isLoading } = useDdnEntries(from, to, status);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const downloadable = useMemo(() => rows.filter((r) => r.generated_docx_path), [rows]);

  const toggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };

  const handleSingle = async (r: DdnEntry) => {
    if (!r.generated_docx_path) return;
    try {
      await downloadDocxFromStorage(r.generated_docx_path);
    } catch (e) {
      toast({ title: 'Download failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const handleZip = async () => {
    const targets = downloadable.filter((r) => selected.has(r.id));
    if (targets.length === 0) {
      toast({ title: 'Nothing selected', description: 'Pick rows with a DOCX to ZIP.' });
      return;
    }
    setZipBusy(true);
    try {
      const zip = new JSZip();
      for (const r of targets) {
        const { data, error } = await supabase.storage.from('daily-notices').download(r.generated_docx_path!);
        if (error) throw error;
        const name = `${r.entry_date}_${(r.letter_no ?? 'DDN').replace(/[^\w.-]+/g, '_')}.docx`;
        zip.file(name, await data.arrayBuffer());
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `daily-notices_${from}_${to}.zip`);
    } catch (e) {
      toast({ title: 'ZIP failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setZipBusy(false);
    }
  };

  const handleDelete = async (r: DdnEntry) => {
    if (!confirm(`Delete generated file for ${r.entry_date}?`)) return;
    try {
      if (r.generated_docx_path) {
        await supabase.storage.from('daily-notices').remove([r.generated_docx_path]);
      }
      const { error } = await supabase.from('ddn_entries')
        .update({ generated_docx_path: null, status: 'draft' })
        .eq('id', r.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['ddn-entries'] });
      toast({ title: 'Removed' });
    } catch (e) {
      toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <select className="block h-9 rounded-md border bg-background px-2 text-sm"
              value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="finalized">Finalized</option>
              <option value="sent">Sent</option>
            </select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={handleZip} disabled={zipBusy || selected.size === 0}>
              {zipBusy ? 'Zipping…' : `ZIP selected (${[...selected].filter((id) => downloadable.find((r) => r.id === id)).length})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Entries ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No entries in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Letter No</th>
                    <th className="px-3 py-2 text-left">Day</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">File</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                      </td>
                      <td className="px-3 py-2 font-mono">{r.entry_date}</td>
                      <td className="px-3 py-2 font-mono">{r.letter_no ?? '—'}</td>
                      <td className="px-3 py-2">{r.day_n ?? '—'}</td>
                      <td className="px-3 py-2">
                        <Badge variant={r.status === 'finalized' ? 'default' : r.status === 'sent' ? 'outline' : 'secondary'}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[18rem]">
                        {r.generated_docx_path ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right space-x-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/ddn/preview?date=${r.entry_date}`}>Preview</Link>
                        </Button>
                        <Button variant="outline" size="sm" disabled={!r.generated_docx_path}
                          onClick={() => handleSingle(r)}>Download</Button>
                        <Button variant="ghost" size="sm" className="text-destructive"
                          onClick={() => handleDelete(r)} disabled={!r.generated_docx_path}>Remove</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
