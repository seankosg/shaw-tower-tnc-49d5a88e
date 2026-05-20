/**
 * CumulativePanel — renders §8 cumulative computed fields as read-only.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DdnField, DdnInputs, DdnInputValue } from '@/lib/ddn/schema-types';
import { computeField, type DdnComputedContext } from '@/lib/ddn/computed';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  fields: DdnField[];
  inputs: DdnInputs;
  onChange: (key: string, value: DdnInputValue) => void;
  disabled?: boolean;
  computedCtx: Omit<DdnComputedContext, 'inputs'>;
}

const widthClass: Record<string, string> = {
  full: 'col-span-12',
  half: 'col-span-12 md:col-span-6',
  third: 'col-span-12 md:col-span-4',
  quarter: 'col-span-12 md:col-span-3',
};

export function CumulativePanel({ fields, inputs, onChange, disabled, computedCtx }: Props) {
  const sec8Fields = fields.filter((f) => f.section_id === 'sec8');
  if (sec8Fields.length === 0) return null;
  const ctx = { ...computedCtx, inputs };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">§8. 누적 (자동 계산)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-12 gap-4">
          {sec8Fields.map((f) => (
            <div key={f.id} className={cn(widthClass[f.width] ?? widthClass.full)}>
              <Label className="text-sm font-medium">
                {f.label_ko}
                {f.unit && <span className="ml-1 text-xs text-muted-foreground">({f.unit})</span>}
              </Label>
              {f.data_type === 'number' ? (
                <Input
                  type="number"
                  className="mt-1.5"
                  value={inputs[f.field_key] === null || inputs[f.field_key] === undefined ? '' : (inputs[f.field_key] as number)}
                  disabled={disabled}
                  onChange={(e) => onChange(f.field_key, e.target.value === '' ? null : parseFloat(e.target.value))}
                />
              ) : (
                <div className="mt-1.5 rounded-md border bg-muted/30 px-3 py-2 text-sm font-mono">
                  {computeField(f.field_key, ctx)}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
