import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Search, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { TcStatus } from '@/types/enums';
import { TC_STATUS_OPTIONS } from '@/types/enums';

interface SubtestCard {
  id: string;
  subtest_id: string;
  item_no: string;
  mos_code: string;
  description: string | null;
  equipment: string | null;
  t1_status: TcStatus | null;
  t2_status: TcStatus | null;
  t1_planned_date: string | null;
  t2_planned_date: string | null;
  t1_actual_date: string | null;
  t2_actual_date: string | null;
  predecessor_status_raw: string | null;
  pred_status: TcStatus | null;
  pred_planned_date: string | null;
  pred_actual_date: string | null;
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  row_version: number;
  system_code: string;
}

type EditScope = 'none' | 'assigned' | 'team' | 'full';
const RESPONSIBILITY_FIELDS = ['subcontractor_name', 'subsub_name', 'hdec_pic_name'] as const;

export default function MobileUpdatePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SubtestCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState<Record<string, Partial<SubtestCard>>>({});
  const [editScopes, setEditScopes] = useState<Record<string, EditScope>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    const q = query.trim();
    const { data } = await supabase
      .from('subtests')
      .select('id, subtest_id, item_no, mos_code, description, equipment, t1_status, t2_status, t1_planned_date, t2_planned_date, t1_actual_date, t2_actual_date, predecessor_status_raw, pred_status, pred_planned_date, pred_actual_date, subcontractor_name, subsub_name, hdec_pic_name, row_version, system_master!inner(system_code)' as any)
      .eq('is_active', true)
      .or(`subtest_id.ilike.%${q}%,item_no.ilike.%${q}%`)
      .limit(20);

    if (data) {
      const mapped = data.map((r: any) => ({ ...r, system_code: r.system_master?.system_code ?? '' }));
      setResults(mapped);
      if (user?.id) {
        const scopeEntries = await Promise.all(mapped.map(async (r: SubtestCard) => {
          const { data: scope } = await (supabase as any).rpc('get_subtest_edit_scope', {
            _user_id: user.id,
            _subtest_id: r.id,
          });
          return [r.id, (scope || 'none') as EditScope] as const;
        }));
        setEditScopes(Object.fromEntries(scopeEntries));
      } else {
        setEditScopes({});
      }
    }
    setLoading(false);
  };

  const updateField = (id: string, field: string, value: any) => {
    setEdits(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const saveCard = async (card: SubtestCard) => {
    const changes = edits[card.id];
    if (!changes || Object.keys(changes).length === 0) return;
    const scope = editScopes[card.id] || 'none';
    if (scope === 'none') return;
    setSaving(card.id);

    const updates: Record<string, any> = { ...changes };
    if (scope === 'assigned') {
      RESPONSIBILITY_FIELDS.forEach(field => delete updates[field]);
    }
    updates.data_source_type = 'mobile_input';
    updates.row_version = card.row_version + 1;

    // Auto-fill actual dates only when empty (preserve existing)
    const today = new Date().toISOString().slice(0, 10);
    if (changes.t1_status === 'Done' && !card.t1_actual_date && changes.t1_actual_date === undefined) {
      updates.t1_actual_date = today;
    }
    if (changes.t2_status === 'Done' && !card.t2_actual_date && changes.t2_actual_date === undefined) {
      updates.t2_actual_date = today;
    }
    if (changes.pred_status === 'Done' && !card.pred_actual_date && changes.pred_actual_date === undefined) {
      updates.pred_actual_date = today;
    }

    const { error } = await supabase.from('subtests').update(updates as any).eq('id', card.id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved successfully' });
      setEdits(prev => { const n = { ...prev }; delete n[card.id]; return n; });
      // Refresh
      setResults(prev => prev.map(r => r.id === card.id ? { ...r, ...changes, row_version: card.row_version + 1 } : r));
    }
    setSaving(null);
  };

  const getVal = (card: SubtestCard, field: keyof SubtestCard) => {
    return edits[card.id]?.[field] !== undefined ? edits[card.id]![field] : card[field];
  };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold tracking-tight">Quick Update</h1>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Subtest ID or Item No..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            className="pl-8"
          />
        </div>
        <Button onClick={search} disabled={loading}>Search</Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Searching...</p>}

      <div className="space-y-3">
        {results.map(card => {
          const hasChanges = edits[card.id] && Object.keys(edits[card.id]).length > 0;
          const scope = editScopes[card.id] || 'none';
          const canSave = scope !== 'none';
          const canEditResponsibility = scope === 'team' || scope === 'full';
          return (
            <Card key={card.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{card.subtest_id} <span className="text-muted-foreground font-normal">({card.system_code})</span></span>
                  {canSave && (
                    <Button size="sm" disabled={!hasChanges || saving === card.id} onClick={() => saveCard(card)}>
                      <Save className="mr-1 h-3.5 w-3.5" />
                      {saving === card.id ? 'Saving...' : 'Save'}
                    </Button>
                  )}
                </CardTitle>
                {card.description && <p className="text-xs text-muted-foreground">{card.description}</p>}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">T1 Status</label>
                    <Select
                      value={(getVal(card, 't1_status') as string) || '__null__'}
                      onValueChange={v => updateField(card.id, 't1_status', v === '__null__' ? null : v)}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__null__">—</SelectItem>
                        {TC_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">T2 Status</label>
                    <Select
                      value={(getVal(card, 't2_status') as string) || '__null__'}
                      onValueChange={v => updateField(card.id, 't2_status', v === '__null__' ? null : v)}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__null__">—</SelectItem>
                        {TC_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Predecessor Status</label>
                    <Select
                      value={(getVal(card, 'pred_status') as string) || '__null__'}
                      onValueChange={v => updateField(card.id, 'pred_status', v === '__null__' ? null : v)}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__null__">—</SelectItem>
                        {TC_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Pred Planned</label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={(getVal(card, 'pred_planned_date') as string) || ''}
                        onChange={e => updateField(card.id, 'pred_planned_date', e.target.value || null)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Pred Actual</label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={(getVal(card, 'pred_actual_date') as string) || ''}
                        onChange={e => updateField(card.id, 'pred_actual_date', e.target.value || null)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Predecessor Raw</label>
                    <Input
                      className="h-8 text-xs"
                      value={(getVal(card, 'predecessor_status_raw') as string) || ''}
                      onChange={e => updateField(card.id, 'predecessor_status_raw', e.target.value || null)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Subcontractor</label>
                    <Input
                      className="h-8 text-xs"
                      value={(getVal(card, 'subcontractor_name') as string) || ''}
                      disabled={!canEditResponsibility}
                      onChange={e => updateField(card.id, 'subcontractor_name', e.target.value || null)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Sub-Sub</label>
                    <Input
                      className="h-8 text-xs"
                      value={(getVal(card, 'subsub_name') as string) || ''}
                      disabled={!canEditResponsibility}
                      onChange={e => updateField(card.id, 'subsub_name', e.target.value || null)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">HDEC PIC</label>
                    <Input
                      className="h-8 text-xs"
                      value={(getVal(card, 'hdec_pic_name') as string) || ''}
                      disabled={!canEditResponsibility}
                      onChange={e => updateField(card.id, 'hdec_pic_name', e.target.value || null)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
