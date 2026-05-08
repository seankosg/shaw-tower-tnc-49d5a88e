import { useEffect, useMemo, useState } from 'react';
import {
  Archive, ChevronDown, ClipboardCopy, Copy, FileSpreadsheet, Loader2,
  MoreHorizontal, ShieldAlert, Users, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  applyBulkUpdate, BULK_CHUNK_ROWS, chunkArray, type BulkEditableField, type BulkUpdateRequest,
} from '@/lib/bulk-edit';
import {
  copyRowsAsTsv, exportSelectedToXlsx, getEditableScopeMap,
  type BulkEntity, type ExportColumn,
} from '@/lib/bulk-actions';
import { validateActualDateNotAfterDataDate, type ActualDateField } from '@/lib/defect-date-validation';
import { useLatestDataDate } from '@/hooks/useLatestDataDate';
import { BulkDuplicateDialog } from '@/components/raw-data/dialogs/BulkDuplicateDialog';
import { BulkReassignDialog } from '@/components/raw-data/dialogs/BulkReassignDialog';
import { BulkDeleteDialog } from '@/components/raw-data/dialogs/BulkDeleteDialog';
import type { ReassignField } from '@/components/raw-data/dialogs/BulkReassignDialog';

const DEFECT_ACTUAL_DATE_FIELDS: ReadonlySet<string> = new Set([
  'actual_start_date', 'actual_completion_date', 'actual_closure_date',
]);

const BLANK = '__BLANK__';

export interface BulkActionBarProps<TRow extends { id: string }> {
  /** Selected rows (full objects so we can preview before/after) */
  selectedRows: TRow[];
  /** Whitelist of fields that may be edited */
  fields: BulkEditableField[];
  /** Source table */
  table: BulkUpdateRequest['table'];
  /** Logical entity name — used for permission RPC + reassign field config */
  entity: BulkEntity;
  /** Visible columns for export / TSV (in the user's column order) */
  exportColumns: ExportColumn[];
  /** Reassign field config (limited to assignment-style fields) */
  reassignFields: ReassignField[];
  /** Called after a successful (or partial) bulk edit */
  onApplied: (result: { field: string; value: string | number | null; ids: string[] }) => void;
  /** Called after duplicate / delete / reassign so parent can refetch */
  onMutated?: () => void;
  /** Clear current selection */
  onClearSelection: () => void;
}

export function BulkActionBar<TRow extends { id: string }>({
  selectedRows, fields, table, entity, exportColumns, reassignFields,
  onApplied, onMutated, onClearSelection,
}: BulkActionBarProps<TRow>) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { dataDate } = useLatestDataDate();

  // ---- Bulk-edit (inline) state ----
  const [fieldName, setFieldName] = useState<string>('');
  const [rawValue, setRawValue] = useState<string>('');
  const [setBlank, setSetBlank] = useState<boolean>(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ---- Action dialogs ----
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'soft' | 'hard' | null>(null);

  // ---- Permissions ----
  const [scopeLoading, setScopeLoading] = useState(false);
  const [editableIds, setEditableIds] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const count = selectedRows.length;
  const chunkCount = Math.max(1, Math.ceil(count / BULK_CHUNK_ROWS));
  const willChunk = count > BULK_CHUNK_ROWS;
  const editableCount = editableIds.length;
  const skippedCount = Math.max(0, count - editableCount);

  // Resolve permissions whenever selection changes
  useEffect(() => {
    if (!user || count === 0) { setEditableIds([]); return; }
    let cancelled = false;
    setScopeLoading(true);
    (async () => {
      try {
        const r = await getEditableScopeMap(entity, selectedRows.map((r) => r.id), user.id);
        if (!cancelled) setEditableIds(r.editableIds);
      } finally {
        if (!cancelled) setScopeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entity, user, count, selectedRows]);

  // Resolve admin flag once
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any).rpc('is_admin_or_superuser', { _user_id: user.id });
      if (!cancelled) setIsAdmin(!!data);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const field = useMemo(() => fields.find((f) => f.field === fieldName) ?? null, [fields, fieldName]);

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

  function reset() {
    setFieldName('');
    setRawValue('');
    setSetBlank(false);
  }

  async function handleApplyEdit() {
    if (!user || !field) return;

    if (
      table === 'defect_items'
      && DEFECT_ACTUAL_DATE_FIELDS.has(field.field)
      && !setBlank
      && typeof computedValue === 'string'
    ) {
      const result = validateActualDateNotAfterDataDate(field.field as ActualDateField, computedValue, dataDate, { allowToday: true });
      if (!result.ok) {
        toast({ title: 'Save blocked', description: result.message, variant: 'destructive' });
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await applyBulkUpdate({
        table, ids: selectedRows.map((r) => r.id), field: field.field, value: computedValue,
        userId: user.id, changeSource: 'bulk_edit',
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
      toast({ title: 'Bulk edit failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExportXlsx() {
    try {
      const fileName = `${entity}-selected-${new Date().toISOString().slice(0, 10)}.xlsx`;
      await exportSelectedToXlsx({ rows: selectedRows, columns: exportColumns, fileName });
      toast({ title: 'Export ready', description: `${selectedRows.length} rows exported.` });
    } catch (err) {
      toast({ title: 'Export failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  async function handleCopyTsv() {
    try {
      const r = await copyRowsAsTsv({ rows: selectedRows, columns: exportColumns });
      toast({ title: 'Copied to clipboard', description: `${r.rowCount} rows × ${r.colCount} columns.` });
    } catch (err) {
      toast({ title: 'Copy failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  if (count === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="sticky top-0 z-30 rounded-lg border border-border border-l-2 border-l-primary bg-card px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* ───── Status pill ───── */}
          <div className="flex items-center gap-2 pr-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-sm font-semibold">
              {count} selected
            </span>
            <span className="text-xs text-muted-foreground">
              ·{' '}
              {scopeLoading ? (
                <Loader2 className="inline h-3 w-3 animate-spin" />
              ) : (
                <>
                  Editable <span className="font-medium text-foreground">{editableCount}</span>
                  {skippedCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="ml-1 cursor-help underline decoration-dotted">
                          · Skipped <span className="font-medium text-foreground">{skippedCount}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>You don't have edit permission on these rows.</TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}
            </span>
            {willChunk && (
              <span className="text-xs text-muted-foreground">
                · Will run in {chunkCount} batches of {BULK_CHUNK_ROWS}
              </span>
            )}
          </div>

          {/* ───── Bulk edit (primary) ───── */}
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Select value={fieldName} onValueChange={(v) => { setFieldName(v); setRawValue(''); setSetBlank(false); }}>
              <SelectTrigger className="h-8 w-[200px]">
                <SelectValue placeholder="Edit field…" />
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
                    <SelectTrigger className="h-8 w-[200px]"><SelectValue placeholder="New value…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={BLANK}>(Clear / Blank)</SelectItem>
                      {(field.options ?? []).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.inputType === 'date' && (
                  <Input type="date" className="h-8 w-[160px]" value={setBlank ? '' : rawValue} disabled={setBlank} onChange={(e) => setRawValue(e.target.value)} />
                )}
                {(field.inputType === 'text' || field.inputType === 'textarea') && (
                  <Input type="text" className="h-8 w-[220px]" value={setBlank ? '' : rawValue} disabled={setBlank} onChange={(e) => setRawValue(e.target.value)} placeholder="New value…" />
                )}
                {field.inputType !== 'select' && (
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Checkbox checked={setBlank} onCheckedChange={(c) => { setSetBlank(!!c); if (c) setRawValue(''); }} />
                    Blank
                  </label>
                )}
              </>
            )}

            <Button
              size="sm"
              disabled={!field || submitting || (valueIsEmpty && !setBlank) || (field?.inputType === 'select' && valueIsUnset && !setBlank)}
              onClick={() => setConfirmOpen(true)}
            >
              Apply
            </Button>
          </div>

          {/* ───── Secondary actions ───── */}
          <div className="flex items-center gap-1.5">
            {(table === 'subtests' || table === 'defect_items') && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 font-bold text-destructive hover:text-destructive"
                disabled={editableCount === 0 || submitting}
                onClick={async () => {
                  if (!user) return;
                  setSubmitting(true);
                  try {
                    const batches = chunkArray(editableIds, BULK_CHUNK_ROWS);
                    let ok = 0;
                    let failed = 0;
                    for (let i = 0; i < batches.length; i++) {
                      const slice = batches[i];
                      if (batches.length > 1) {
                        toast({ title: `Registering… (batch ${i + 1}/${batches.length})`, description: `${ok} done so far.` });
                      }
                      // eslint-disable-next-line no-await-in-loop
                      const { data, error } = await (supabase as any)
                        .from(table)
                        .update({ is_critical: true })
                        .in('id', slice)
                        .select('id');
                      if (error) { failed += slice.length; continue; }
                      const n = (data ?? []).length;
                      ok += n;
                      failed += slice.length - n;
                    }
                    toast({
                      title: 'Registered to Critical Issue Board',
                      description: `${ok} item${ok === 1 ? '' : 's'} registered${failed > 0 ? `, ${failed} blocked` : ''}${skippedCount > 0 ? `, ${skippedCount} skipped (no permission)` : ''}.`,
                      variant: failed > 0 && ok === 0 ? 'destructive' : 'default',
                    });
                    onApplied({ field: 'is_critical', value: 'true', ids: editableIds });
                    onMutated?.();
                    onClearSelection();
                  } catch (err) {
                    toast({ title: 'Register failed', description: (err as Error).message, variant: 'destructive' });
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Register to Critical Issue Board
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={editableCount === 0 || overLimit}
              onClick={() => setDuplicateOpen(true)}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={editableCount === 0 || overLimit || reassignFields.length === 0}
              onClick={() => setReassignOpen(true)}
            >
              <Users className="mr-1.5 h-3.5 w-3.5" /> Reassign
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8">
                  <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Export
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportXlsx}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Download .xlsx
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyTsv}>
                  <ClipboardCopy className="mr-2 h-4 w-4" /> Copy as TSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 px-2">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuItem
                  className="text-warning focus:text-warning"
                  disabled={editableCount === 0}
                  onClick={() => setDeleteMode('soft')}
                >
                  <Archive className="mr-2 h-4 w-4" /> Hide rows (soft delete)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        disabled={!isAdmin || editableCount === 0}
                        onClick={() => setDeleteMode('hard')}
                      >
                        <ShieldAlert className="mr-2 h-4 w-4" /> Delete permanently…
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  {!isAdmin && <TooltipContent>Admin / Superuser only.</TooltipContent>}
                </Tooltip>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" variant="ghost" className="h-8" onClick={onClearSelection}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ───── Bulk-edit confirm dialog (kept identical to old behavior) ───── */}
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
            <Button onClick={handleApplyEdit} disabled={submitting}>
              {submitting ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Applying…</> : `Apply to ${count} rows`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── Action dialogs ───── */}
      <BulkDuplicateDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        entity={entity}
        rows={selectedRows}
        editableIds={editableIds}
        onDone={() => { onMutated?.(); onClearSelection(); }}
      />
      <BulkReassignDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        entity={entity}
        fields={reassignFields}
        ids={selectedRows.map((r) => r.id)}
        editableIds={editableIds}
        onDone={() => { onMutated?.(); onClearSelection(); }}
      />
      {deleteMode && (
        <BulkDeleteDialog
          open={!!deleteMode}
          onOpenChange={(o) => { if (!o) setDeleteMode(null); }}
          entity={entity}
          mode={deleteMode}
          rows={selectedRows}
          editableIds={deleteMode === 'hard' ? selectedRows.map((r) => r.id) : editableIds}
          onDone={() => { onMutated?.(); onClearSelection(); setDeleteMode(null); }}
        />
      )}
    </TooltipProvider>
  );
}
