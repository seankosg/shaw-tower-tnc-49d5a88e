import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { type DefectEditScope, type DefectItem, formatPct } from '@/lib/defect-utils';
import { computeDefectStatuses } from '@/lib/defect-status';
import { validateActualDatesAgainstDataDate } from '@/lib/defect-date-validation';
import { useLatestDataDate } from '@/hooks/useLatestDataDate';

export default function DefectQuickUpdatePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { dataDate } = useLatestDataDate();
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
    const merged = { ...item, ...patch } as DefectItem;
    // Business rule: actual dates cannot be later than Data Date.
    const validation = validateActualDatesAgainstDataDate({
      actual_start_date: merged.actual_start_date,
      actual_completion_date: merged.actual_completion_date,
      actual_closure_date: merged.actual_closure_date,
    }, dataDate);
    if (!validation.ok) {
      toast({ title: 'Save blocked', description: validation.message, variant: 'destructive' });
      return;
    }
    // Recompute statuses ONLY when status-affecting inputs (dates / actual progress) were actually edited.
    // Otherwise unrelated edits (e.g. remarks, work_type) would silently flip closure_status back to "Planned".
    const userSetCompletion = 'completion_status' in patch;
    const userSetClosure = 'closure_status' in patch;
    const STATUS_INPUT_KEYS = [
      'planned_start_date',
      'planned_completion_date',
      'planned_closure_date',
      'actual_start_date',
      'actual_completion_date',
      'actual_closure_date',
      'actual_progress_pct',
    ] as const;
    const statusInputsChanged = STATUS_INPUT_KEYS.some((k) => k in patch);
    const finalPatch: any = { ...patch };
    if (statusInputsChanged) {
      const asOf = new Date().toISOString().slice(0, 10);
      const computed = computeDefectStatuses({
        planned_start_date: merged.planned_start_date,
        planned_completion_date: merged.planned_completion_date,
        planned_closure_date: merged.planned_closure_date,
        actual_start_date: merged.actual_start_date,
        actual_completion_date: merged.actual_completion_date,
        actual_closure_date: merged.actual_closure_date,
        planned_progress_pct: merged.planned_progress_pct,
        actual_progress_pct: merged.actual_progress_pct,
      }, asOf);
      if (!userSetCompletion) finalPatch.completion_status = computed.completion_status;
      if (!userSetClosure) finalPatch.closure_status = computed.closure_status;
    }
    const { error } = await (supabase as any).from('defect_items').update({ ...finalPatch, updated_by: user.id, data_source_type: 'quick_update', row_version: item.row_version + 1 }).eq('id', item.id);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else toast({ title: 'Quick update saved' });
  };

  const setField = (id: string, field: keyof DefectItem, value: any) => setEdits((current) => ({ ...current, [id]: { ...(current[id] ?? {}), [field]: value } }));
  const val = (item: DefectItem, field: keyof DefectItem) => (edits[item.id]?.[field] ?? item[field] ?? '') as any;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Search Issue No, Level, Location..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
        <Button onClick={search}>Search</Button>
      </div>
      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader><CardTitle>{item.issue_no} · {item.area_level || '—'} · {item.area_location || '—'}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <Input placeholder="Actual Progress %" type="number" value={val(item, 'actual_progress_pct')} disabled={item.scope === 'none'} onChange={(e) => setField(item.id, 'actual_progress_pct', e.target.value ? Number(e.target.value) : null)} />
            <Input type="date" placeholder="Actual Completion Date" value={val(item, 'actual_completion_date')} disabled={item.scope === 'none'} onChange={(e) => setField(item.id, 'actual_completion_date', e.target.value || null)} />
            <Input type="date" placeholder="Actual Closure Date" value={val(item, 'actual_closure_date')} disabled={item.scope === 'none'} onChange={(e) => setField(item.id, 'actual_closure_date', e.target.value || null)} />
            <Button onClick={() => save(item)} disabled={item.scope === 'none'}>Save</Button>
            <Input placeholder="Completion Status" value={val(item, 'completion_status')} disabled={item.scope === 'none'} onChange={(e) => setField(item.id, 'completion_status', e.target.value || null)} />
            <Input placeholder="Closure Status" value={val(item, 'closure_status')} disabled={item.scope === 'none'} onChange={(e) => setField(item.id, 'closure_status', e.target.value || null)} />
            <Input placeholder="Work Type" value={val(item, 'work_type')} disabled={item.scope === 'none'} onChange={(e) => setField(item.id, 'work_type', e.target.value || null)} />
            <div className="md:col-span-4 text-sm text-muted-foreground">Current actual progress: {formatPct(item.actual_progress_pct)} · Permission: {item.scope}</div>
            <Textarea className="md:col-span-4" placeholder="Remarks" value={val(item, 'remarks')} disabled={item.scope === 'none'} onChange={(e) => setField(item.id, 'remarks', e.target.value)} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
