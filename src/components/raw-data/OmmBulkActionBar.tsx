import { useMemo, useState } from 'react';
import { Archive, ChevronDown, Copy, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  applyOmmBulkUpdate,
  applyOmmBulkSoftDelete,
  applyOmmBulkDuplicate,
  OMM_BULK_MAX_ROWS,
  type OmmBulkResult,
} from '@/lib/omm-bulk-actions';

export type OmmBulkInputType = 'select' | 'date' | 'text' | 'number';

export interface OmmBulkField {
  field: string;
  label: string;
  inputType: OmmBulkInputType;
  group?: string;
  options?: { value: string; label: string }[];
  /** Show extra warning text in the confirm dialog (e.g. response B/C resubmission). */
  warning?: string;
}

const BLANK = '__BLANK__';

interface Props<TRow extends { id: string }> {
  selectedRows: TRow[];
  fields: OmmBulkField[];
  onApplied: (info: { field: string; value: string | number | null; ids: string[] }) => void;
  onClearSelection: () => void;
  onMutated?: () => void;
}

export function OmmBulkActionBar<TRow extends { id: string }>({
  selectedRows,
  fields,
  onApplied,
  onClearSelection,
  onMutated,
}: Props<TRow>) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [fieldName, setFieldName] = useState('');
  const [rawValue, setRawValue] = useState('');
  const [setBlank, setSetBlank] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [resetActuals, setResetActuals] = useState(true);
  const [resetResponses, setResetResponses] = useState(true);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const count = selectedRows.length;
  const overLimit = count > OMM_BULK_MAX_ROWS;

  const field = useMemo(() => fields.find((f) => f.field === fieldName) ?? null, [fields, fieldName]);

  const fieldGroups = useMemo(() => {
    const map = new Map<string, OmmBulkField[]>();
    for (const f of fields) {
      const key = f.group ?? 'Other';
      const arr = map.get(key) ?? [];
      arr.push(f);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [fields]);

  const computedValue: string | number | null = setBlank
    ? null
    : field?.inputType === 'select' && rawValue === BLANK
      ? null
      : field?.inputType === 'number' && rawValue !== ''
        ? Number(rawValue)
        : rawValue === ''
          ? null
          : rawValue;

  const previewRows = selectedRows.slice(0, 5);

  function reset() {
    setFieldName('');
    setRawValue('');
    setSetBlank(false);
  }

  async function runEdit() {
    if (!user || !field) return;
    setSubmitting(true);
    try {
      const ids = selectedRows.map((r) => r.id);
      const result: OmmBulkResult = await applyOmmBulkUpdate({
        ids,
        field: field.field,
        value: computedValue,
        userId: user.id,
      });
      const blocked = result.failed;
      const ok = result.succeeded;
      toast({
        title: blocked > 0 ? 'Partially applied' : 'Bulk edit applied',
        description: `${ok} updated${blocked > 0 ? `, ${blocked} blocked` : ''}.`,
        variant: blocked > 0 && ok === 0 ? 'destructive' : 'default',
      });
      onApplied({ field: field.field, value: computedValue, ids });
      onMutated?.();
      setConfirmOpen(false);
      reset();
    } catch (err) {
      toast({ title: 'Bulk edit failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  async function runDuplicate() {
    if (!user) return;
    setSubmitting(true);
    try {
      const result = await applyOmmBulkDuplicate({
        rows: selectedRows,
        resetActuals,
        resetResponses,
        userId: user.id,
      });
      toast({
        title: result.failed > 0 ? 'Partially duplicated' : 'Duplicated',
        description: `${result.succeeded} new row${result.succeeded === 1 ? '' : 's'} created${result.failed > 0 ? `, ${result.failed} failed` : ''}.`,
        variant: result.failed > 0 && result.succeeded === 0 ? 'destructive' : 'default',
      });
      setDuplicateOpen(false);
      onMutated?.();
      onClearSelection();
    } catch (err) {
      toast({ title: 'Duplicate failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  async function runDelete() {
    if (!user) return;
    setSubmitting(true);
    try {
      const ids = selectedRows.map((r) => r.id);
      const result = await applyOmmBulkSoftDelete({ ids, userId: user.id });
      toast({
        title: result.failed > 0 ? 'Partially hidden' : 'Hidden',
        description: `${result.succeeded} row${result.succeeded === 1 ? '' : 's'} hidden${result.failed > 0 ? `, ${result.failed} blocked` : ''}.`,
        variant: result.failed > 0 && result.succeeded === 0 ? 'destructive' : 'default',
      });
      setDeleteOpen(false);
      onMutated?.();
      onClearSelection();
    } catch (err) {
      toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  if (count === 0) return null;

  return (
    <>
      <div className="sticky top-0 z-30 rounded-lg border border-border border-l-2 border-l-primary bg-card px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2 pr-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-sm font-semibold">{count} selected</span>
            {overLimit && (
              <span className="text-xs text-destructive">
                Max {OMM_BULK_MAX_ROWS} rows. Refine your selection.
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Select
              value={fieldName}
              onValueChange={(v) => {
                setFieldName(v);
                setRawValue('');
                setSetBlank(false);
              }}
            >
              <SelectTrigger className="h-8 w-[200px]">
                <SelectValue placeholder="Edit field…" />
              </SelectTrigger>
              <SelectContent>
                {fieldGroups.map(([group, list]) => (
                  <SelectGroup key={group}>
                    <SelectLabel>{group}</SelectLabel>
                    {list.map((f) => (
                      <SelectItem key={f.field} value={f.field}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>

            {field && (
              <>
                {field.inputType === 'select' && (
                  <Select
                    value={setBlank ? BLANK : rawValue}
                    onValueChange={(v) => {
                      setRawValue(v);
                      setSetBlank(v === BLANK);
                    }}
                  >
                    <SelectTrigger className="h-8 w-[200px]">
                      <SelectValue placeholder="New value…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={BLANK}>(Clear / Blank)</SelectItem>
                      {(field.options ?? []).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.inputType === 'date' && (
                  <Input
                    type="date"
                    className="h-8 w-[160px]"
                    value={setBlank ? '' : rawValue}
                    disabled={setBlank}
                    onChange={(e) => setRawValue(e.target.value)}
                  />
                )}
                {field.inputType === 'number' && (
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="h-8 w-[120px]"
                    value={setBlank ? '' : rawValue}
                    disabled={setBlank}
                    onChange={(e) => setRawValue(e.target.value)}
                    placeholder="0"
                  />
                )}
                {field.inputType === 'text' && (
                  <Input
                    type="text"
                    className="h-8 w-[220px]"
                    value={setBlank ? '' : rawValue}
                    disabled={setBlank}
                    onChange={(e) => setRawValue(e.target.value)}
                    placeholder="New value…"
                  />
                )}
                {field.inputType !== 'select' && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox
                      checked={setBlank}
                      onCheckedChange={(c) => {
                        setSetBlank(!!c);
                        if (c) setRawValue('');
                      }}
                    />
                    Blank
                  </label>
                )}
              </>
            )}

            <Button
              size="sm"
              disabled={
                !field ||
                overLimit ||
                (!setBlank &&
                  rawValue === '' &&
                  field?.inputType !== 'select')
              }
              onClick={() => setConfirmOpen(true)}
            >
              Apply
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={overLimit}
              onClick={() => setDuplicateOpen(true)}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8">
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Export selected
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const XLSX = await import('xlsx');
                      const aoa: unknown[][] = [];
                      const cols = [
                        'sn',
                        'category_group',
                        'category',
                        'work_trade_material',
                        'subcontractor_name',
                        'pdf_required_qty',
                        'pdf_actual_qty',
                        'hardcopy_required_qty',
                        'hardcopy_actual_qty',
                        'draft_response_status',
                        'final_response_status',
                      ];
                      aoa.push(cols);
                      for (const r of selectedRows as any[]) {
                        aoa.push(cols.map((c) => (r as any)[c] ?? ''));
                      }
                      const ws = XLSX.utils.aoa_to_sheet(aoa);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'OMM Selected');
                      XLSX.writeFile(wb, `omm-selected-${new Date().toISOString().slice(0, 10)}.xlsx`);
                      toast({ title: 'Export ready', description: `${selectedRows.length} rows exported.` });
                    } catch (err) {
                      toast({ title: 'Export failed', description: (err as Error).message, variant: 'destructive' });
                    }
                  }}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Download .xlsx
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              variant="outline"
              className="h-8 text-warning"
              disabled={overLimit}
              onClick={() => setDeleteOpen(true)}
            >
              <Archive className="mr-1.5 h-3.5 w-3.5" /> Hide
            </Button>

            <Button size="sm" variant="ghost" className="h-8" onClick={onClearSelection}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Confirm bulk-edit */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm bulk edit</DialogTitle>
            <DialogDescription>
              You are about to set <strong>{field?.label}</strong> on <strong>{count}</strong> row
              {count === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded border bg-muted/30 p-2">
              <Label className="text-xs text-muted-foreground">New value</Label>
              <div className="mt-1 font-medium">
                {computedValue == null ? (
                  <span className="italic text-muted-foreground">(blank)</span>
                ) : (
                  String(computedValue)
                )}
              </div>
            </div>
            {field?.warning &&
              (computedValue === 'B' || computedValue === 'C') && (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  ⚠ {field.warning}
                </div>
              )}
            <div>
              <Label className="text-xs text-muted-foreground">
                Preview (first {Math.min(5, count)} of {count})
              </Label>
              <div className="mt-1 max-h-48 overflow-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-2 py-1 text-left">Row</th>
                      <th className="px-2 py-1 text-left">Before</th>
                      <th className="px-2 py-1 text-left">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r) => {
                      const before = (r as any)[field?.field ?? ''];
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="truncate px-2 py-1 max-w-[160px]">
                            {(r as any).sn ?? r.id.slice(0, 8)}
                          </td>
                          <td className="truncate px-2 py-1 max-w-[140px] text-muted-foreground">
                            {before == null || before === '' ? '—' : String(before)}
                          </td>
                          <td className="truncate px-2 py-1 max-w-[140px] font-medium">
                            {computedValue == null ? '—' : String(computedValue)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={runEdit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Applying…
                </>
              ) : (
                `Apply to ${count} rows`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate */}
      <Dialog open={duplicateOpen} onOpenChange={(o) => !submitting && setDuplicateOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate {count} OMM row{count === 1 ? '' : 's'}</DialogTitle>
            <DialogDescription>
              Creates a fresh copy of each selected row. Resubmission linkage and audit
              metadata are reset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={resetActuals}
                onCheckedChange={(c) => setResetActuals(!!c)}
              />
              Clear actual dates (draft / final / response)
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={resetResponses}
                onCheckedChange={(c) => setResetResponses(!!c)}
              />
              Clear response statuses (Draft / Final A/B/C)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={runDuplicate} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Duplicating…
                </>
              ) : (
                `Duplicate ${count} rows`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Soft delete */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !submitting && setDeleteOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hide {count} OMM row{count === 1 ? '' : 's'}</DialogTitle>
            <DialogDescription>
              Sets <code>is_active = false</code>. Rows can be restored later from
              the database. No record is permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={runDelete} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Hiding…
                </>
              ) : (
                `Hide ${count} rows`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
