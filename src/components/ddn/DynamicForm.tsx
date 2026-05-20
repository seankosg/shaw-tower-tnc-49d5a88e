/**
 * DynamicForm — renders DDN sections + fields from metaschema.
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Plus, X, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  DdnField,
  DdnSection,
  DdnInputs,
  DdnInputValue,
  DdnDelayedItem,
} from '@/lib/ddn/schema-types';
import { computeField, type DdnComputedContext } from '@/lib/ddn/computed';
import type { AutoMap, AutoEntry } from '@/lib/ddn/auto-fill-types';
import { AutoFillBadge } from './AutoFillBadge';

interface Props {
  sections: DdnSection[];
  fields: DdnField[];
  inputs: DdnInputs;
  onChange: (key: string, value: DdnInputValue) => void;
  disabled?: boolean;
  computedCtx: Omit<DdnComputedContext, 'inputs'>;
  autoMap?: AutoMap;
}

const widthClass: Record<string, string> = {
  full: 'col-span-12',
  half: 'col-span-12 md:col-span-6',
  third: 'col-span-12 md:col-span-4',
  quarter: 'col-span-12 md:col-span-3',
};

export function DynamicForm({ sections, fields, inputs, onChange, disabled, computedCtx, autoMap }: Props) {
  const fieldsBySection = useMemo(() => {
    const map = new Map<string, DdnField[]>();
    for (const f of fields) {
      const arr = map.get(f.section_id) ?? [];
      arr.push(f);
      map.set(f.section_id, arr);
    }
    return map;
  }, [fields]);

  const isVisible = (f: DdnField): boolean => {
    const c = f.conditional_on;
    if (!c) return true;
    const parent = inputs[c.field_key];
    if (c.equals !== undefined) return parent === c.equals;
    if (c.contains !== undefined) return Array.isArray(parent) && (parent as string[]).includes(c.contains);
    return true;
  };

  const visibleSections = sections.filter((s) => s.id !== 'sec8');

  return (
    <div className="space-y-4">
      {visibleSections.map((s) => {
        const secFields = (fieldsBySection.get(s.id) ?? []).filter(isVisible);
        if (secFields.length === 0) return null;
        return (
          <Card key={s.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{s.title_ko}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-12 gap-4">
                {secFields.map((f) => (
                  <div key={f.id} className={cn(widthClass[f.width] ?? widthClass.full)}>
                    <FieldRenderer
                      field={f}
                      value={inputs[f.field_key]}
                      onChange={(v) => onChange(f.field_key, v)}
                      disabled={disabled}
                      computedCtx={{ ...computedCtx, inputs }}
                      auto={autoMap?.[f.field_key]}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

interface FieldProps {
  field: DdnField;
  value: DdnInputValue;
  onChange: (v: DdnInputValue) => void;
  disabled?: boolean;
  computedCtx: DdnComputedContext;
  auto?: AutoEntry;
}

function isEmpty(v: DdnInputValue): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function FieldRenderer({ field, value, onChange, disabled, computedCtx, auto }: FieldProps) {
  const empty = isEmpty(value);
  const showPlaceholder = auto && empty;
  const placeholderStr = showPlaceholder ? String(formatAutoPreview(auto.value)) : undefined;

  const label = (
    <div className="flex items-center justify-between">
      <Label className="text-sm font-medium">
        {field.label_ko}
        {field.required && <span className="ml-1 text-destructive">*</span>}
        {field.unit && <span className="ml-1 text-xs text-muted-foreground">({field.unit})</span>}
        {auto && <AutoFillBadge entry={auto} />}
      </Label>
      {auto && !disabled && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          title="Apply auto-filled value"
          onClick={() => onChange(auto.value)}
        >
          <RotateCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );

  switch (field.data_type) {
    case 'text':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            value={(value as string) ?? ''}
            disabled={disabled}
            placeholder={placeholderStr}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-1.5">
          {label}
          <Textarea
            value={(value as string) ?? ''}
            disabled={disabled}
            placeholder={placeholderStr}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />
        </div>
      );

    case 'number':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="number"
            value={value === null || value === undefined ? '' : (value as number)}
            disabled={disabled}
            placeholder={placeholderStr}
            onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
          />
        </div>
      );

    case 'date':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="date"
            value={(value as string) ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || null)}
          />
        </div>
      );

    case 'time':
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type="time"
            value={(value as string) ?? ''}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value || null)}
          />
        </div>
      );

    case 'radio_yn':
      return (
        <div className="space-y-1.5">
          {label}
          <RadioGroup
            value={(value as string) ?? ''}
            onValueChange={(v) => onChange(v)}
            disabled={disabled}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id={`${field.field_key}-y`} value="Y" />
              <Label htmlFor={`${field.field_key}-y`} className="cursor-pointer">Y</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id={`${field.field_key}-n`} value="N" />
              <Label htmlFor={`${field.field_key}-n`} className="cursor-pointer">N</Label>
            </div>
          </RadioGroup>
        </div>
      );

    case 'radio':
      return (
        <div className="space-y-1.5">
          {label}
          <RadioGroup
            value={(value as string) ?? ''}
            onValueChange={(v) => onChange(v)}
            disabled={disabled}
            className="flex flex-wrap gap-4"
          >
            {(field.options ?? []).map((o) => (
              <div key={o.id} className="flex items-center gap-2">
                <RadioGroupItem id={`${field.field_key}-${o.value}`} value={o.value} />
                <Label htmlFor={`${field.field_key}-${o.value}`} className="cursor-pointer">{o.label_ko}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      );

    case 'checkbox_multi': {
      const current = (value as string[]) ?? [];
      return (
        <div className="space-y-1.5">
          {label}
          <div className="flex flex-col gap-2">
            {(field.options ?? []).map((o) => {
              const checked = current.includes(o.value);
              return (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(c) => {
                      if (c) onChange([...current, o.value]);
                      else onChange(current.filter((v) => v !== o.value));
                    }}
                  />
                  {o.label_ko}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    case 'computed': {
      const val = computeField(field.field_key, computedCtx);
      return (
        <div className="space-y-1.5">
          {label}
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono">{val}</div>
        </div>
      );
    }

    case 'repeatable_group':
      return <DelayedItemsField field={field} value={value as DdnDelayedItem[] | null} onChange={onChange} disabled={disabled} />;

    case 'heading':
      return <h4 className="mt-2 text-sm font-semibold text-muted-foreground">{field.label_ko}</h4>;

    default:
      return null;
  }
}

function formatAutoPreview(v: DdnInputValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return `${v.length} item(s)`;
  if (typeof v === 'object') return '';
  return String(v);
}

function DelayedItemsField({
  field, value, onChange, disabled,
}: {
  field: DdnField;
  value: DdnDelayedItem[] | null;
  onChange: (v: DdnInputValue) => void;
  disabled?: boolean;
}) {
  const items = value ?? [];
  const reasons = field.options ?? [];

  const update = (idx: number, patch: Partial<DdnDelayedItem>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{field.label_ko}</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...items, { name: '', reasons: [] }])}
        >
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">No delayed items.</p>
      )}
      {items.map((it, idx) => (
        <div key={idx} className="space-y-2 rounded border bg-muted/20 p-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="항목명"
              value={it.name}
              disabled={disabled}
              onChange={(e) => update(idx, { name: e.target.value })}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled}
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
            {reasons.map((r) => {
              const checked = it.reasons.includes(r.value);
              return (
                <label key={r.id} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(c) => {
                      const nextReasons = c
                        ? [...it.reasons, r.value]
                        : it.reasons.filter((x) => x !== r.value);
                      update(idx, { reasons: nextReasons });
                    }}
                  />
                  {r.label_ko}
                </label>
              );
            })}
          </div>
          {it.reasons.includes('other') && (
            <Input
              placeholder="기타 사유"
              value={it.other_reason ?? ''}
              disabled={disabled}
              onChange={(e) => update(idx, { other_reason: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}
