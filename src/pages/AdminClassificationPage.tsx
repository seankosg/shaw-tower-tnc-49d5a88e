import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

interface RuleRow {
  id: string;
  keyword: string;
  main_trade: string;
  sub_trade: string;
  work_type: string;
  priority: number;
  is_active: boolean;
}

interface FallbackRow {
  id: string;
  field_discipline: string;
  main_trade: string;
  sub_trade: string;
  work_type: string;
  is_active: boolean;
}

interface WorkscopeRow {
  id: string;
  label: string;
  full_name: string;
  keywords: string[];
  match_priority: number;
  is_active: boolean;
}

interface WorkTypeRow {
  id: string;
  trade: string;
  name: string;
  sub_match: string[];
  desc_keywords: string[];
  default_main_trade: string | null;
  default_sub_trade: string | null;
  match_order: number;
  is_active: boolean;
}

interface AliasRow {
  id: string;
  raw_label: string;
  canonical_label: string;
  is_active: boolean;
}

const csvToArr = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const arrToCsv = (a: string[] | null | undefined) => (a ?? []).join(', ');

export default function AdminClassificationPage() {
  const { toast } = useToast();
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [fallbacks, setFallbacks] = useState<FallbackRow[]>([]);
  const [workscopes, setWorkscopes] = useState<WorkscopeRow[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkTypeRow[]>([]);
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [newRule, setNewRule] = useState<Partial<RuleRow>>({ priority: 100, is_active: true });
  const [newFb, setNewFb] = useState<Partial<FallbackRow>>({ is_active: true });
  const [newWs, setNewWs] = useState<{ label?: string; full_name?: string; keywords?: string; match_priority?: number; is_active?: boolean }>({ match_priority: 100, is_active: true });
  const [newWt, setNewWt] = useState<{ trade?: string; name?: string; sub_match?: string; desc_keywords?: string; default_main_trade?: string; default_sub_trade?: string; match_order?: number; is_active?: boolean }>({ match_order: 100, is_active: true });
  const [newAl, setNewAl] = useState<Partial<AliasRow>>({ is_active: true });

  const load = async () => {
    const [r, f, ws, wt, al] = await Promise.all([
      (supabase as any).from('defect_classification_rules').select('*').order('priority').order('keyword'),
      (supabase as any).from('defect_discipline_fallback').select('*').order('field_discipline'),
      (supabase as any).from('defect_subcontractor_workscope').select('*').order('match_priority').order('label'),
      (supabase as any).from('defect_work_types').select('*').order('match_order').order('name'),
      (supabase as any).from('defect_classification_alias').select('*').order('raw_label'),
    ]);
    setRules((r.data ?? []) as RuleRow[]);
    setFallbacks((f.data ?? []) as FallbackRow[]);
    setWorkscopes((ws.data ?? []) as WorkscopeRow[]);
    setWorkTypes((wt.data ?? []) as WorkTypeRow[]);
    setAliases((al.data ?? []) as AliasRow[]);
  };

  useEffect(() => { load(); }, []);

  const addRule = async () => {
    if (!newRule.keyword || !newRule.main_trade || !newRule.sub_trade || !newRule.work_type) {
      toast({ title: 'All fields required', variant: 'destructive' }); return;
    }
    const { error } = await (supabase as any).from('defect_classification_rules').insert({ ...newRule, keyword: String(newRule.keyword).toLowerCase().trim() });
    if (error) { toast({ title: 'Insert failed', description: error.message, variant: 'destructive' }); return; }
    setNewRule({ priority: 100, is_active: true });
    load();
  };

  const updateRule = async (id: string, patch: Partial<RuleRow>) => {
    await (supabase as any).from('defect_classification_rules').update(patch).eq('id', id);
    load();
  };

  const deleteRule = async (id: string) => {
    await (supabase as any).from('defect_classification_rules').delete().eq('id', id);
    load();
  };

  const addFb = async () => {
    if (!newFb.field_discipline || !newFb.main_trade || !newFb.sub_trade || !newFb.work_type) {
      toast({ title: 'All fields required', variant: 'destructive' }); return;
    }
    const { error } = await (supabase as any).from('defect_discipline_fallback').insert({ ...newFb, field_discipline: String(newFb.field_discipline).toLowerCase().trim() });
    if (error) { toast({ title: 'Insert failed', description: error.message, variant: 'destructive' }); return; }
    setNewFb({ is_active: true });
    load();
  };

  const updateFb = async (id: string, patch: Partial<FallbackRow>) => {
    await (supabase as any).from('defect_discipline_fallback').update(patch).eq('id', id);
    load();
  };

  const deleteFb = async (id: string) => {
    await (supabase as any).from('defect_discipline_fallback').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Defect Classification</h1>
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Keyword Rules</TabsTrigger>
          <TabsTrigger value="fallback">Discipline Fallback</TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <Card>
            <CardHeader><CardTitle>Keyword Rules ({rules.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-7 mb-4">
                <Input placeholder="keyword" value={newRule.keyword ?? ''} onChange={(e) => setNewRule({ ...newRule, keyword: e.target.value })} />
                <Input placeholder="main_trade" value={newRule.main_trade ?? ''} onChange={(e) => setNewRule({ ...newRule, main_trade: e.target.value })} />
                <Input placeholder="sub_trade" value={newRule.sub_trade ?? ''} onChange={(e) => setNewRule({ ...newRule, sub_trade: e.target.value })} />
                <Input placeholder="work_type" value={newRule.work_type ?? ''} onChange={(e) => setNewRule({ ...newRule, work_type: e.target.value })} />
                <Input type="number" placeholder="priority" value={newRule.priority ?? 100} onChange={(e) => setNewRule({ ...newRule, priority: Number(e.target.value) })} />
                <Switch checked={newRule.is_active ?? true} onCheckedChange={(v) => setNewRule({ ...newRule, is_active: v })} />
                <Button onClick={addRule}><Plus className="h-4 w-4 mr-1" />Add</Button>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Keyword</TableHead><TableHead>Main Trade</TableHead><TableHead>Sub Trade</TableHead><TableHead>Work Type</TableHead><TableHead>Priority</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><Input value={r.keyword} onBlur={(e) => updateRule(r.id, { keyword: e.target.value.toLowerCase().trim() })} onChange={(e) => setRules((cur) => cur.map((x) => x.id === r.id ? { ...x, keyword: e.target.value } : x))} /></TableCell>
                      <TableCell><Input value={r.main_trade} onBlur={(e) => updateRule(r.id, { main_trade: e.target.value })} onChange={(e) => setRules((cur) => cur.map((x) => x.id === r.id ? { ...x, main_trade: e.target.value } : x))} /></TableCell>
                      <TableCell><Input value={r.sub_trade} onBlur={(e) => updateRule(r.id, { sub_trade: e.target.value })} onChange={(e) => setRules((cur) => cur.map((x) => x.id === r.id ? { ...x, sub_trade: e.target.value } : x))} /></TableCell>
                      <TableCell><Input value={r.work_type} onBlur={(e) => updateRule(r.id, { work_type: e.target.value })} onChange={(e) => setRules((cur) => cur.map((x) => x.id === r.id ? { ...x, work_type: e.target.value } : x))} /></TableCell>
                      <TableCell><Input type="number" value={r.priority} onBlur={(e) => updateRule(r.id, { priority: Number(e.target.value) })} onChange={(e) => setRules((cur) => cur.map((x) => x.id === r.id ? { ...x, priority: Number(e.target.value) } : x))} /></TableCell>
                      <TableCell><Switch checked={r.is_active} onCheckedChange={(v) => updateRule(r.id, { is_active: v })} /></TableCell>
                      <TableCell><Button size="icon" variant="ghost" onClick={() => deleteRule(r.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fallback">
          <Card>
            <CardHeader><CardTitle>Discipline Fallback ({fallbacks.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-6 mb-4">
                <Input placeholder="field_discipline" value={newFb.field_discipline ?? ''} onChange={(e) => setNewFb({ ...newFb, field_discipline: e.target.value })} />
                <Input placeholder="main_trade" value={newFb.main_trade ?? ''} onChange={(e) => setNewFb({ ...newFb, main_trade: e.target.value })} />
                <Input placeholder="sub_trade" value={newFb.sub_trade ?? ''} onChange={(e) => setNewFb({ ...newFb, sub_trade: e.target.value })} />
                <Input placeholder="work_type" value={newFb.work_type ?? ''} onChange={(e) => setNewFb({ ...newFb, work_type: e.target.value })} />
                <Switch checked={newFb.is_active ?? true} onCheckedChange={(v) => setNewFb({ ...newFb, is_active: v })} />
                <Button onClick={addFb}><Plus className="h-4 w-4 mr-1" />Add</Button>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Field Discipline</TableHead><TableHead>Main Trade</TableHead><TableHead>Sub Trade</TableHead><TableHead>Work Type</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {fallbacks.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell><Input value={f.field_discipline} onBlur={(e) => updateFb(f.id, { field_discipline: e.target.value.toLowerCase().trim() })} onChange={(e) => setFallbacks((cur) => cur.map((x) => x.id === f.id ? { ...x, field_discipline: e.target.value } : x))} /></TableCell>
                      <TableCell><Input value={f.main_trade} onBlur={(e) => updateFb(f.id, { main_trade: e.target.value })} onChange={(e) => setFallbacks((cur) => cur.map((x) => x.id === f.id ? { ...x, main_trade: e.target.value } : x))} /></TableCell>
                      <TableCell><Input value={f.sub_trade} onBlur={(e) => updateFb(f.id, { sub_trade: e.target.value })} onChange={(e) => setFallbacks((cur) => cur.map((x) => x.id === f.id ? { ...x, sub_trade: e.target.value } : x))} /></TableCell>
                      <TableCell><Input value={f.work_type} onBlur={(e) => updateFb(f.id, { work_type: e.target.value })} onChange={(e) => setFallbacks((cur) => cur.map((x) => x.id === f.id ? { ...x, work_type: e.target.value } : x))} /></TableCell>
                      <TableCell><Switch checked={f.is_active} onCheckedChange={(v) => updateFb(f.id, { is_active: v })} /></TableCell>
                      <TableCell><Button size="icon" variant="ghost" onClick={() => deleteFb(f.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
