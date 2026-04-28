import { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  applyBulkUpdate, BULK_EDIT_MAX_ROWS, type BulkEditableField, type BulkUpdateRequest,
} from '@/lib/bulk-edit';
import { validateActualDateNotAfterDataDate, type ActualDateField } from '@/lib/defect-date-validation';
import { useLatestDataDate } from '@/hooks/useLatestDataDate';

const DEFECT_ACTUAL_DATE_FIELDS: ReadonlySet<string> = new Set([
  'actual_start_date', 'actual_completion_date', 'actual_closure_date',
]);

const BLANK = '__BLANK__';

export interface BulkEditBarProps<TRow extends { id: string }> {
  /** Selected rows (full objects so we can show before/after preview) */
  selectedRows: TRow[];
  /** Whitelist of fields that may be edited */
  fields: BulkEditableField[];
  /** Source table */
  table: BulkUpdateRequest['table'];
  /** Called after a successful (or partially successful) update so the parent can refresh state */
  onApplied: (result: { field: string; value: string | number | null; ids: string[] }) => void;
  /** Clear current selection */
  onClearSelection: () => void;
}

export function BulkEditBar<TRow extends { id: string }>({
  selectedRows, fields, table, onApplied, onClearSelection,
}: BulkEditBarProps<TRow>) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { dataDate } = useLatestDataDate();

  const [fieldName, setFieldName] = useState<string>('');
  const [rawValue, setRawValue] = useState<string>('');
  const [setBlank, setSetBlank] = useState<boolean>(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const field = useMemo(() => fields.find((f) => f.field === fieldName) ?? null, [fields, fieldName]);
  const count = selectedRows.length;
  const overLimit = count > BULK_EDIT_MAX_ROWS;

  const fieldGroups = useMemo(() => {
    const map = new Map<string, BulkEditableField[]>();
    for (const f of fields) {
      const key = f.group ?? 'Other';
      const arr = map.get(key) ?? [];
      arr.push(f);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [fields]);

  const valueIsEmpty = !setBlank && rawValue.trim() === '' && field?.inputType !== 'select';
  const valueIsUnset = !setBlank && (rawValue === '' || rawValue == null);

  const computedValue: string | number | null = setBlank
    ? null
    : field?.inputType === 'select' && rawValue === BLANK
      ? null
      : rawValue;

  const previewRows = selectedRows.slice(0, 5);

  const reset = () => {
    setFieldName('');
    setRawValue('');
    setSetBlank(false);
  };

  async function handleApply() {
    if (!user || !field) return;

    // Business rule: actual dates on defect_items cannot be later than Data Date.
    if (
      table === 'defect_items'
      && DEFECT_ACTUAL_DATE_FIELDS.has(field.field)
      && !setBlank
      && typeof computedValue === 'string'
    ) {
      const result = validateActualDateNotAfterDataDate(field.field as ActualDateField, computedValue, dataDate);
      if (!result.ok) {
        toast({ title: 'Save blocked', description: result.message, variant: 'destructive' });
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await applyBulkUpdate({
        table,
        ids: selectedRows.map((r) => r.id),
        field: field.field,
        value: computedValue,
        userId: user.id,
        changeSource: 'bulk_edit',
      });
      const blocked = result.failed;
      const ok = result.succeeded;
      toast({
        title: blocked > 0 ? 'Partially applied' : 'Bulk edit applied',
        description: `${ok} updated${blocked > 0 ? `, ${blocked} blocked by permission` : ''}.`,
        variant: blocked > 0 && ok === 0 ? 'destructive' : 'default',
      });
      onApplied({ field: field.field, value: computedValue, ids: selectedRows.map((r) => r.id) });
      setConfirmOpen(false);
      reset();
    } catch (err) {
      toast({
        title: 'Bulk edit failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (count === 0) return null;

  return (
    <>
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 shadow-sm">
        <span className="text-sm font-semibold text-primary">{count} selected</span>
        {overLimit && (
          <span className="text-xs text-destructive">
            Max {BULK_EDIT_MAX_ROWS} rows. Refine your selection.
          </span>
        )}

        <div className="ml-2 flex flex-1 flex-wrap items-center gap-2">
          <Select value={fieldName} onValueChange={(v) => { setFieldName(v); setRawValue(''); setSetBlank(false); }}>
            <SelectTrigger className="h-8 w-[220px]">
              <SelectValue placeholder="Choose field to edit…" />
            </SelectTrigger>
            <SelectContent>
              {fieldGroups.map(([group, list]) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {list.map((f) => (
                    <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          {field && (
            <>
              {field.inputType === 'select' && (
                <Select value={setBlank ? BLANK : rawValue} onValueChange={(v) => { setRawValue(v); setSetBlank(v === BLANK); }}>
                  <SelectTrigger className="h-8 w-[220px]"><SelectValue placeholder="New value…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BLANK}>(Clear / Blank)</SelectItem>
                    {(field.options ?? []).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {field.inputType === 'date' && (
                <Input type="date" className="h-8 w-[170px]" value={setBlank ? '' : rawValue} disabled={setBlank} onChange={(e) => setRawValue(e.target.value)} />
              )}
              {field.inputType === 'text' && (
                <Input type="text" className="h-8 w-[240px]" value={setBlank ? '' : rawValue} disabled={setBlank} onChange={(e) => setRawValue(e.target.value)} placeholder="New value…" />
              )}
              {field.inputType === 'textarea' && (
                <Input type="text" className="h-8 w-[260px]" value={setBlank ? '' : rawValue} disabled={setBlank} onChange={(e) => setRawValue(e.target.value)} placeholder="New value… (use dialog for long text)" />
              )}
              {field.inputType !== 'select' && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox checked={setBlank} onCheckedChange={(c) => { setSetBlank(!!c); if (c) setRawValue(''); }} />
                  Clear (set blank)
                </label>
              )}
            </>
          )}

          <Button
            size="sm"
            disabled={!field || overLimit || (valueIsEmpty && !setBlank) || (field?.inputType === 'select' && valueIsUnset && !setBlank)}
            onClick={() => setConfirmOpen(true)}
          >
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={onClearSelection}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm bulk edit</DialogTitle>
            <DialogDescription>
              You are about to set <strong>{field?.label}</strong> on <strong>{count}</strong> row{count === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded border bg-muted/30 p-2">
              <Label className="text-xs text-muted-foreground">New value</Label>
              <div className="mt-1 font-medium">
                {computedValue == null ? <span className="italic text-muted-foreground">(blank)</span> : String(computedValue)}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Preview (first {Math.min(5, count)} of {count})</Label>
              <div className="mt-1 max-h-48 overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr><th className="px-2 py-1 text-left">Row</th><th className="px-2 py-1 text-left">Before</th><th className="px-2 py-1 text-left">After</th></tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r) => {
                      const before = (r as any)[field?.field ?? ''];
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="truncate px-2 py-1 max-w-[160px]">{(r as any).issue_no ?? (r as any).subtest_id ?? r.id.slice(0, 8)}</td>
                          <td className="truncate px-2 py-1 max-w-[140px] text-muted-foreground">{before == null || before === '' ? '—' : String(before)}</td>
                          <td className="truncate px-2 py-1 max-w-[140px] font-medium">{computedValue == null ? '—' : String(computedValue)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Each change is recorded in the change log. Rows you do not have permission to edit will be skipped.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleApply} disabled={submitting}>
              {submitting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Applying…</> : `Apply to ${count} rows`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
