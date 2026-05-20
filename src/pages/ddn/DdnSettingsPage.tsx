import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useDdnSettings } from '@/lib/ddn/schema-cache';
import { SchemaEditor } from '@/components/ddn/SchemaEditor';
import type { DdnSettings } from '@/lib/ddn/schema-types';

const NUMERIC_KEYS: (keyof DdnSettings)[] = [
  'letter_no_next','ld_daily_rate_sgd','ld_cap_sgd','pm_daily_rate_sgd',
  'hdec_manday_rate_sgd','hdec_korean_md_rate_sgd','admin_overhead_pct',
  'avg_ncr_external_cost','avg_def_external_cost',
];

const TEXT_KEYS: (keyof DdnSettings)[] = ['master_notice_ref','letter_no_prefix'];
const DATE_KEYS: (keyof DdnSettings)[] = ['master_notice_date','day1_date','pm_absence_start_date','contract_completion_date'];

export default function DdnSettingsPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes('admin');
  const { data, isLoading } = useDdnSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<DdnSettings>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  if (!isAdmin) {
    return <p className="text-sm text-amber-600">Admin only.</p>;
  }

  const set = (k: keyof DdnSettings, v: unknown) => setForm((p) => ({ ...p, [k]: v as never }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('ddn_settings')
      .update(form as never)
      .eq('id', 'singleton');
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved' });
    queryClient.invalidateQueries({ queryKey: ['ddn-settings'] });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <Tabs defaultValue="cost">
      <TabsList>
        <TabsTrigger value="cost">Cost &amp; References</TabsTrigger>
        <TabsTrigger value="schema">Form Schema Editor</TabsTrigger>
      </TabsList>

      <TabsContent value="cost" className="mt-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Cost &amp; References</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-3">
              {TEXT_KEYS.map((k) => (
                <div key={k} className="col-span-12 md:col-span-6">
                  <Label className="text-xs">{k}</Label>
                  <Input value={(form[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} />
                </div>
              ))}
              {DATE_KEYS.map((k) => (
                <div key={k} className="col-span-12 md:col-span-6">
                  <Label className="text-xs">{k}</Label>
                  <Input type="date" value={(form[k] as string) ?? ''} onChange={(e) => set(k, e.target.value || null)} />
                </div>
              ))}
              {NUMERIC_KEYS.map((k) => (
                <div key={k} className="col-span-12 md:col-span-4">
                  <Label className="text-xs">{k}</Label>
                  <Input
                    type="number"
                    value={form[k] === null || form[k] === undefined ? '' : (form[k] as number)}
                    onChange={(e) => set(k, e.target.value === '' ? null : parseFloat(e.target.value))}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={save} disabled={saving}>Save</Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="schema" className="mt-3">
        <SchemaEditor />
      </TabsContent>
    </Tabs>
  );
}
