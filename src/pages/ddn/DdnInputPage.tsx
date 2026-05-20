import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useDdnSchema, useDdnSettings, useDdnEntry } from '@/lib/ddn/schema-cache';
import { useDdnAutoSave } from '@/lib/ddn/auto-save';
import { DynamicForm } from '@/components/ddn/DynamicForm';
import { CumulativePanel } from '@/components/ddn/CumulativePanel';
import type { DdnInputs, DdnInputValue } from '@/lib/ddn/schema-types';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function DdnInputPage() {
  const { roles } = useAuth();
  const canEdit = roles.includes('superuser') || roles.includes('admin');

  const [entryDate, setEntryDate] = useState(todayIso());
  const { data: schema, isLoading: schemaLoading } = useDdnSchema();
  const { data: settings } = useDdnSettings();
  const { data: existing } = useDdnEntry(entryDate);

  const [inputs, setInputs] = useState<DdnInputs>({});

  useEffect(() => {
    setInputs((existing?.inputs as DdnInputs) ?? {});
  }, [existing?.id, entryDate]);

  const dayN = useMemo(() => {
    if (!settings?.day1_date) return null;
    const ms = new Date(entryDate).getTime() - new Date(settings.day1_date).getTime();
    return Math.floor(ms / 86400000) + 1;
  }, [settings?.day1_date, entryDate]);

  const { state } = useDdnAutoSave({ entryDate, inputs, dayN, enabled: canEdit });

  const onChange = (key: string, value: DdnInputValue) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  if (schemaLoading) return <p className="text-sm text-muted-foreground">Loading schema…</p>;
  if (!schema) return <p className="text-sm text-muted-foreground">No schema.</p>;

  const computedCtx = { settings: settings ?? null, today: entryDate, history: undefined };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <Label className="text-xs">Entry date</Label>
            <Input type="date" className="w-44" value={entryDate} onChange={(e) => setEntryDate(e.target.value || todayIso())} />
          </div>
          <div>
            <Label className="text-xs">Day N</Label>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono w-24">{dayN ?? '—'}</div>
          </div>
          <Badge variant={existing?.status === 'finalized' ? 'default' : 'secondary'}>
            {existing?.status ?? 'draft'}
          </Badge>
          <div className="ml-auto text-xs text-muted-foreground">
            {!canEdit && <span className="text-amber-600 font-medium">Read-only · </span>}
            Auto-save: {state}
          </div>
        </CardContent>
      </Card>

      <DynamicForm
        sections={schema.sections}
        fields={schema.fields}
        inputs={inputs}
        onChange={onChange}
        disabled={!canEdit}
        computedCtx={computedCtx}
      />

      <CumulativePanel
        fields={schema.fields}
        inputs={inputs}
        onChange={onChange}
        disabled={!canEdit}
        computedCtx={computedCtx}
      />
    </div>
  );
}
