/**
 * SchemaEditor — admin-only UI to edit field labels and option labels.
 * Phase 1 scope: edit label_ko / label_en / help_text / display_order / is_active.
 * Add/delete of fields is deferred.
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useDdnSchema } from '@/lib/ddn/schema-cache';
import type { DdnField, DdnFieldOption } from '@/lib/ddn/schema-types';

export function SchemaEditor() {
  const { data, isLoading } = useDdnSchema();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const sections = data?.sections ?? [];
  const activeSection = sectionId ?? sections[0]?.id ?? null;
  const sectionFields = useMemo(
    () => (data?.fields ?? []).filter((f) => f.section_id === activeSection),
    [data, activeSection],
  );

  const saveField = async (f: DdnField, patch: Partial<DdnField>) => {
    setSavingId(f.id);
    const { error } = await supabase.from('ddn_fields').update(patch as never).eq('id', f.id);
    setSavingId(null);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved' });
    queryClient.invalidateQueries({ queryKey: ['ddn-schema'] });
  };

  const saveOption = async (o: DdnFieldOption, patch: Partial<DdnFieldOption>) => {
    setSavingId(o.id);
    const { error } = await supabase.from('ddn_field_options').update(patch).eq('id', o.id);
    setSavingId(null);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['ddn-schema'] });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-12 md:col-span-3">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Sections</CardTitle></CardHeader>
        <CardContent className="space-y-1 p-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setSectionId(s.id)}
              className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${activeSection === s.id ? 'bg-muted font-medium' : ''}`}
            >
              {s.title_ko}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="col-span-12 md:col-span-9">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Fields</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {sectionFields.map((f) => (
            <div key={f.id} className="rounded border p-3">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">{f.field_key}</Badge>
                <Badge variant="secondary" className="text-[10px]">{f.data_type}</Badge>
                {savingId === f.id && <span className="text-xs text-muted-foreground">Saving…</span>}
              </div>
              <div className="mt-2 grid grid-cols-12 gap-2">
                <div className="col-span-12 md:col-span-6">
                  <Label className="text-xs">Label (KO)</Label>
                  <Input
                    defaultValue={f.label_ko}
                    onBlur={(e) => e.target.value !== f.label_ko && saveField(f, { label_ko: e.target.value })}
                  />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <Label className="text-xs">Label (EN)</Label>
                  <Input
                    defaultValue={f.label_en ?? ''}
                    onBlur={(e) => (e.target.value || null) !== f.label_en && saveField(f, { label_en: e.target.value || null })}
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs">Unit</Label>
                  <Input
                    defaultValue={f.unit ?? ''}
                    onBlur={(e) => (e.target.value || null) !== f.unit && saveField(f, { unit: e.target.value || null })}
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs">Order</Label>
                  <Input
                    type="number"
                    defaultValue={f.display_order}
                    onBlur={(e) => parseInt(e.target.value, 10) !== f.display_order && saveField(f, { display_order: parseInt(e.target.value, 10) })}
                  />
                </div>
                <div className="col-span-12 md:col-span-6">
                  <Label className="text-xs">Help text</Label>
                  <Input
                    defaultValue={f.help_text ?? ''}
                    onBlur={(e) => (e.target.value || null) !== f.help_text && saveField(f, { help_text: e.target.value || null })}
                  />
                </div>
              </div>
              {(f.options ?? []).length > 0 && (
                <div className="mt-3 space-y-2 rounded bg-muted/30 p-2">
                  <div className="text-xs font-medium text-muted-foreground">Options</div>
                  {(f.options ?? []).map((o) => (
                    <div key={o.id} className="grid grid-cols-12 gap-2">
                      <Badge variant="outline" className="col-span-3 self-center font-mono text-[10px]">{o.value}</Badge>
                      <Input
                        className="col-span-4"
                        defaultValue={o.label_ko}
                        onBlur={(e) => e.target.value !== o.label_ko && saveOption(o, { label_ko: e.target.value })}
                      />
                      <Input
                        className="col-span-4"
                        defaultValue={o.label_en ?? ''}
                        onBlur={(e) => (e.target.value || null) !== o.label_en && saveOption(o, { label_en: e.target.value || null })}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="col-span-1"
                        onClick={() => saveOption(o, { is_active: !o.is_active })}
                      >
                        {o.is_active ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
