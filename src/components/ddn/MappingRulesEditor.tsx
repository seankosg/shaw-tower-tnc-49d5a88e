import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useDdnSchema } from '@/lib/ddn/schema-cache';
import { useDdnMappingRules } from '@/lib/ddn/mapping-cache';
import type { DdnMappingRule, DdnRuleStyle } from '@/lib/ddn/mapping-types';

const STYLES: DdnRuleStyle[] = ['paragraph', 'bullet', 'heading', 'table_row'];

export function MappingRulesEditor() {
  const { data: schema } = useDdnSchema();
  const { data: rules } = useDdnMappingRules();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<DdnMappingRule> | null>(null);
  const [saving, setSaving] = useState(false);
  const [conditionText, setConditionText] = useState('');

  const filtered = useMemo(() => {
    if (!rules) return [];
    return rules.filter((r) => sectionFilter === 'all' || r.section_id === sectionFilter);
  }, [rules, sectionFilter]);

  const pick = (r: DdnMappingRule) => {
    setSelectedId(r.id);
    setDraft({ ...r });
    setConditionText(JSON.stringify(r.condition, null, 2));
  };

  const startNew = () => {
    setSelectedId(null);
    setDraft({
      rule_key: '',
      section_id: schema?.sections[0]?.id ?? 'sec1',
      display_order: 100,
      condition: { type: 'always' },
      template: '',
      style: 'paragraph',
      is_active: true,
    });
    setConditionText('{\n  "type": "always"\n}');
  };

  const save = async () => {
    if (!draft) return;
    let cond: unknown;
    try { cond = JSON.parse(conditionText); }
    catch (e) {
      toast({ title: 'Invalid condition JSON', description: (e as Error).message, variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      rule_key: draft.rule_key,
      section_id: draft.section_id,
      display_order: draft.display_order ?? 0,
      condition: cond,
      template: draft.template ?? '',
      style: draft.style ?? 'paragraph',
      notes: draft.notes ?? null,
      is_active: draft.is_active ?? true,
    };
    const op = selectedId
      ? supabase.from('ddn_mapping_rules').update(payload as never).eq('id', selectedId)
      : supabase.from('ddn_mapping_rules').insert(payload as never);
    const { error } = await op;
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved' });
    queryClient.invalidateQueries({ queryKey: ['ddn-mapping-rules'] });
    setDraft(null);
    setSelectedId(null);
  };

  const remove = async () => {
    if (!selectedId) return;
    if (!confirm('Delete this rule?')) return;
    const { error } = await supabase.from('ddn_mapping_rules').delete().eq('id', selectedId);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Deleted' });
    queryClient.invalidateQueries({ queryKey: ['ddn-mapping-rules'] });
    setDraft(null);
    setSelectedId(null);
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      <Card className="col-span-12 md:col-span-7">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <Label className="text-xs">Section</Label>
            <Select value={sectionFilter} onValueChange={setSectionFilter}>
              <SelectTrigger className="w-56 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {schema?.sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.title_en ?? s.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto">
              <Button size="sm" onClick={startNew}>+ New rule</Button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-2 py-1.5">Key</th>
                  <th className="px-2 py-1.5">Section</th>
                  <th className="px-2 py-1.5 w-12">Ord</th>
                  <th className="px-2 py-1.5">Template preview</th>
                  <th className="px-2 py-1.5 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={`border-t cursor-pointer hover:bg-muted/30 ${selectedId === r.id ? 'bg-primary/5' : ''}`} onClick={() => pick(r)}>
                    <td className="px-2 py-1 font-mono">{r.rule_key}</td>
                    <td className="px-2 py-1">{r.section_id}</td>
                    <td className="px-2 py-1 text-right">{r.display_order}</td>
                    <td className="px-2 py-1 truncate max-w-[280px]">{r.template}</td>
                    <td className="px-2 py-1">{!r.is_active && <Badge variant="outline" className="text-[10px]">off</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-12 md:col-span-5">
        <CardContent className="p-3 space-y-3">
          {!draft ? (
            <p className="text-sm text-muted-foreground">Select a rule or click <em>New rule</em>.</p>
          ) : (
            <>
              <div>
                <Label className="text-xs">Rule key</Label>
                <Input value={draft.rule_key ?? ''} onChange={(e) => setDraft({ ...draft, rule_key: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Section</Label>
                  <Select value={draft.section_id ?? ''} onValueChange={(v) => setDraft({ ...draft, section_id: v })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {schema?.sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.title_en ?? s.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Order</Label>
                  <Input type="number" value={draft.display_order ?? 0}
                         onChange={(e) => setDraft({ ...draft, display_order: parseInt(e.target.value || '0', 10) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 items-end">
                <div>
                  <Label className="text-xs">Style</Label>
                  <Select value={draft.style ?? 'paragraph'} onValueChange={(v) => setDraft({ ...draft, style: v as DdnRuleStyle })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 h-9">
                  <Switch checked={draft.is_active ?? true} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                  <span className="text-xs">Active</span>
                </div>
              </div>
              <div>
                <Label className="text-xs">Condition (JSON)</Label>
                <Textarea rows={6} className="font-mono text-xs"
                          value={conditionText}
                          onChange={(e) => setConditionText(e.target.value)} />
                <p className="text-[10px] text-muted-foreground mt-1">
                  e.g. <code>{'{"type":"eq","field":"sec1.pm_attended","value":"N"}'}</code>
                </p>
              </div>
              <div>
                <Label className="text-xs">Template</Label>
                <Textarea rows={4} value={draft.template ?? ''}
                          onChange={(e) => setDraft({ ...draft, template: e.target.value })} />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Use <code>{'{{field_key}}'}</code>, <code>{'{{date:field_key}}'}</code>, <code>{'{{list:field_key}}'}</code>, <code>{'{{computed.key}}'}</code>, <code>{'{{settings.key}}'}</code>, <code>{'{{loop:field_key}}...{{name}}...{{/loop}}'}</code>.
                </p>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} value={draft.notes ?? ''}
                          onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                {selectedId && <Button variant="destructive" size="sm" onClick={remove}>Delete</Button>}
                <Button variant="outline" size="sm" onClick={() => { setDraft(null); setSelectedId(null); }}>Cancel</Button>
                <Button size="sm" onClick={save} disabled={saving}>Save</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
