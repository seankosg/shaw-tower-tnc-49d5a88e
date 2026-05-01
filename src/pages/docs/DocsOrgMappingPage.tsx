import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface Alias { id: string; raw_label: string; subcontractor_id: string | null; is_active: boolean; }
interface Sub { id: string; name: string; }

export default function DocsOrgMappingPage() {
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newSubId, setNewSubId] = useState('');
  const { toast } = useToast();

  const reload = async () => {
    const [{ data: a }, { data: s }] = await Promise.all([
      supabase.from('docs_org_alias').select('*').order('raw_label'),
      supabase.from('subcontractor_master').select('id, name').eq('is_active', true).order('name'),
    ]);
    if (a) setAliases(a as Alias[]);
    if (s) setSubs(s as Sub[]);
  };
  useEffect(() => { reload(); }, []);

  const add = async () => {
    if (!newLabel.trim()) return;
    const { error } = await supabase.from('docs_org_alias').insert({
      raw_label: newLabel.trim(),
      subcontractor_id: newSubId || null,
    });
    if (error) toast({ title: '추가 실패', description: error.message, variant: 'destructive' });
    else { setNewLabel(''); setNewSubId(''); reload(); }
  };

  const remove = async (id: string) => {
    await supabase.from('docs_org_alias').delete().eq('id', id);
    reload();
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Org Mapping</h1>
        <p className="text-sm text-muted-foreground">Aconex organisation 라벨을 협력사로 매핑합니다.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Add Mapping</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="Raw label (예: HDEC ELEC SUB1)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          <select value={newSubId} onChange={e => setNewSubId(e.target.value)} className="rounded border px-2 text-sm">
            <option value="">— select subcontractor —</option>
            {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button onClick={add} disabled={!newLabel.trim()}>Add</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Mappings ({aliases.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Raw Label</TableHead>
                <TableHead>Subcontractor</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aliases.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.raw_label}</TableCell>
                  <TableCell className="text-xs">{subs.find(s => s.id === a.subcontractor_id)?.name || '—'}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => remove(a.id)}>Delete</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
