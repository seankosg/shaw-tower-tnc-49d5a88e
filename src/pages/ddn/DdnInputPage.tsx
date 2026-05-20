import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useDdnSchema, useDdnSettings, useDdnEntry } from '@/lib/ddn/schema-cache';
import { useDdnAutoSave } from '@/lib/ddn/auto-save';
import { useDdnAutoFill } from '@/lib/ddn/auto-fill';
import { DynamicForm } from '@/components/ddn/DynamicForm';
import { CumulativePanel } from '@/components/ddn/CumulativePanel';
import { AutoFillBanner } from '@/components/ddn/AutoFillBanner';
import { toast } from 'sonner';
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
  const { data: autoFill, isFetching: autoFetching, refetch: refetchAuto } = useDdnAutoFill(entryDate);

  const onChange = (key: string, value: DdnInputValue) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const isEmpty = (v: unknown) => {
    if (v === null || v === undefined || v === '') return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  };

  const applyAutoFill = (overwrite: boolean) => {
    if (!autoFill) return;
    setInputs((prev) => {
      const next = { ...prev };
      let n = 0;
      for (const [k, entry] of Object.entries(autoFill.map)) {
        if (overwrite || isEmpty(next[k])) {
          next[k] = entry.value as DdnInputValue;
          n++;
        }
      }
      toast.success(`Applied ${n} auto-filled field${n === 1 ? '' : 's'}`);
      return next;
    });
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
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            {!canEdit && <span className="text-amber-600 font-medium">Read-only</span>}
            <span>Auto-save: {state}</span>
            <Button asChild size="sm" variant="outline">
              <Link to={`/ddn/preview?date=${entryDate}`}>Preview →</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <AutoFillBanner
        result={autoFill}
        isFetching={autoFetching}
        disabled={!canEdit}
        onRefresh={() => refetchAuto()}
        onApplyEmpty={() => applyAutoFill(false)}
        onOverwrite={() => {
          if (window.confirm('Overwrite all auto-fillable fields with values from raw data?')) {
            applyAutoFill(true);
          }
        }}
      />

      <DynamicForm
        sections={schema.sections}
        fields={schema.fields}
        inputs={inputs}
        onChange={onChange}
        disabled={!canEdit}
        computedCtx={computedCtx}
        autoMap={autoFill?.map}
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
