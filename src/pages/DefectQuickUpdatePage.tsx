import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { type DefectEditScope, type DefectItem, formatPct } from '@/lib/defect-utils';

export default function DefectQuickUpdatePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<(DefectItem & { scope: DefectEditScope })[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<DefectItem>>>({});

  const search = async () => {
    const { data } = await (supabase as any).from('defect_items').select('*').eq('is_active', true).or(`issue_no.ilike.%${query}%,area_level.ilike.%${query}%,area_location.ilike.%${query}%`).limit(20);
    const withScopes = await Promise.all((data ?? []).map(async (item: DefectItem) => {
      const scopeRes = user ? await (supabase as any).rpc('get_defect_edit_scope', { _user_id: user.id, _defect_id: item.id }) : { data: 'none' };
      return { ...item, scope: (scopeRes.data ?? 'none') as DefectEditScope };
    }));
    setItems(withScopes);
  };

  const save = async (item: DefectItem & { scope: DefectEditScope }) => {
    if (!user || item.scope === 'none') return;
    const patch = edits[item.id] ?? {};
    const nextProgress = patch.actual_progress_pct ?? item.actual_progress_pct;
    const actualDatePatch = 'actual_progress_pct' in patch ? { actual_date: Number(nextProgress ?? 0) >= 100 ? (item.actual_date ?? new Date().toISOString().slice(0, 10)) : null } : {};
    const { error } = await (supabase as any).from('defect_items').update({ ...patch, ...actualDatePatch, updated_by: user.id, data_source_type: 'quick_update', row_version: item.row_version + 1 }).eq('id', item.id);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else toast({ title: 'Quick update saved' });
  };

  const setField = (id: string, field: keyof DefectItem, value: any) => setEdits((current) => ({ ...current, [id]: { ...(current[id] ?? {}), [field]: value } }));
  const val = (item: DefectItem, field: keyof DefectItem) => (edits[item.id]?.[field] ?? item[field] ?? '') as any;

  return <div className="space-y-4"><div className="flex gap-2"><Input placeholder="Search Issue No, Level, Location..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} /><Button onClick={search}>Search</Button></div>{items.map((item) => <Card key={item.id}><CardHeader><CardTitle>{item.issue_no} · {item.area_level || '—'} · {item.area_location || '—'}</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-4"><Input placeholder="Progress %" type="number" value={val(item, 'actual_progress_pct')} disabled={item.scope === 'none'} onChange={(e) => setField(item.id, 'actual_progress_pct', e.target.value ? Number(e.target.value) : null)} /><Input placeholder="Closure Status" value={val(item, 'closure_status')} disabled={item.scope === 'none'} onChange={(e) => setField(item.id, 'closure_status', e.target.value)} /><Input type="date" value={val(item, 'closed_date')} disabled={item.scope === 'none'} onChange={(e) => setField(item.id, 'closed_date', e.target.value || null)} /><Button onClick={() => save(item)} disabled={item.scope === 'none'}>Save</Button><div className="md:col-span-4 text-sm text-muted-foreground">Current progress: {formatPct(item.actual_progress_pct)} · Permission: {item.scope}</div><Textarea className="md:col-span-4" placeholder="Remarks" value={val(item, 'remarks')} disabled={item.scope === 'none'} onChange={(e) => setField(item.id, 'remarks', e.target.value)} /></CardContent></Card>)}</div>;
}
