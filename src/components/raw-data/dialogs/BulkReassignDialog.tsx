import { useMemo, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { applyBulkReassign, type BulkEntity, type ReassignFieldChange } from '@/lib/bulk-actions';
import { BULK_CHUNK_ROWS, chunkArray } from '@/lib/bulk-edit';
import { cn } from '@/lib/utils';

export interface ReassignField {
  field: string;
  label: string;
  options: { value: string; label: string }[];
}

type Mode = 'keep' | 'set' | 'clear';
interface FieldState { mode: Mode; value: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entity: BulkEntity;
  fields: ReassignField[];
  ids: string[];
  editableIds: string[];
  onDone: () => void;
}

export function BulkReassignDialog({ open, onOpenChange, entity, fields, ids, editableIds, onDone }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<Record<string, FieldState>>(() =>
    Object.fromEntries(fields.map((f) => [f.field, { mode: 'keep' as Mode, value: '' }])),
  );

  const skipped = ids.length - editableIds.length;

  const changes: ReassignFieldChange[] = useMemo(() => {
    const out: ReassignFieldChange[] = [];
    for (const f of fields) {
      const s = state[f.field];
      if (!s) continue;
      if (s.mode === 'set' && s.value) out.push({ field: f.field, value: s.value });
      else if (s.mode === 'clear') out.push({ field: f.field, value: null });
    }
    return out;
  }, [state, fields]);

  function setField(field: string, patch: Partial<FieldState>) {
    setState((prev) => ({ ...prev, [field]: { ...prev[field], ...patch } }));
  }

  async function handleConfirm() {
    if (!user || changes.length === 0) return;
    setBusy(true);
    try {
      const batches = chunkArray(editableIds, BULK_CHUNK_ROWS);
      let succeeded = 0;
      let failed = 0;
      for (let i = 0; i < batches.length; i++) {
        if (batches.length > 1) {
          toast({ title: `Reassigning… (batch ${i + 1}/${batches.length})`, description: `${succeeded} updated so far.` });
        }
        // eslint-disable-next-line no-await-in-loop
        const r = await applyBulkReassign({ entity, ids: batches[i], changes, userId: user.id });
        succeeded += r.succeeded;
        failed += r.failed;
      }
      const fieldList = changes.map((c) => c.field).join(', ');
      toast({
        title: 'Reassignment applied',
        description: `Updated ${fieldList} on up to ${succeeded} rows${failed ? ` · ${failed} blocked` : ''}${skipped ? ` · ${skipped} skipped (no permission)` : ''}.`,
        variant: failed > 0 && succeeded === 0 ? 'destructive' : 'default',
      });
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast({ title: 'Reassign failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-xl border-l-2 border-l-primary">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> Reassign responsibility
          </DialogTitle>
          <DialogDescription>
            Set or clear assignment fields on selected rows. Choose <strong>—</strong> to leave a field unchanged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <div className="font-medium">{editableIds.length} editable row{editableIds.length === 1 ? '' : 's'}</div>
            {skipped > 0 && <div className="text-xs text-muted-foreground">{skipped} skipped (no permission)</div>}
          </div>

          <div className="grid grid-cols-1 gap-3">
            {fields.map((f) => {
              const s = state[f.field];
              return (
                <div key={f.field} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{f.label}</div>
                    <div className="inline-flex overflow-hidden rounded-md border">
                      {(['keep', 'set', 'clear'] as Mode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setField(f.field, { mode: m, ...(m !== 'set' ? { value: '' } : {}) })}
                          className={cn(
                            'px-2.5 py-1 text-xs transition-colors',
                            s.mode === m ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
                          )}
                        >
                          {m === 'keep' ? '—' : m === 'set' ? 'Set' : 'Clear'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {s.mode === 'set' && (
                    <Select value={s.value} onValueChange={(v) => setField(f.field, { value: v })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Pick a value…" /></SelectTrigger>
                      <SelectContent>
                        {f.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {s.mode === 'clear' && (
                    <div className="text-xs italic text-muted-foreground">Will set to (blank)</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || changes.length === 0 || editableIds.length === 0}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Apply {changes.length} field{changes.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
