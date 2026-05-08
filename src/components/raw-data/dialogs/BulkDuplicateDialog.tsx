import { useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  applyBulkDuplicate, type BulkEntity, type DuplicateOptions,
} from '@/lib/bulk-actions';
import { BULK_CHUNK_ROWS, chunkArray } from '@/lib/bulk-edit';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entity: BulkEntity;
  rows: any[];
  /** Editable subset (rest are skipped) */
  editableIds: string[];
  onDone: () => void;
}

export function BulkDuplicateDialog({ open, onOpenChange, entity, rows, editableIds, onDone }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<DuplicateOptions>({
    resetActualDates: true,
    resetProgressStatus: true,
  });

  const editableRows = rows.filter((r) => editableIds.includes(r.id));
  const skipped = rows.length - editableRows.length;
  const labelKey = entity === 'subtest' ? 'subtest_id' : entity === 'drawing' ? 'document_no' : 'issue_no';

  async function handleConfirm() {
    if (!user) return;
    setBusy(true);
    try {
      const r = await applyBulkDuplicate({ entity, rows: editableRows, options: opts, userId: user.id });
      toast({
        title: 'Duplicate complete',
        description: `${r.succeeded} new row${r.succeeded === 1 ? '' : 's'} created${r.failed ? ` · ${r.failed} failed` : ''}${skipped ? ` · ${skipped} skipped (no permission)` : ''}.`,
        variant: r.failed > 0 && r.succeeded === 0 ? 'destructive' : 'default',
      });
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast({ title: 'Duplicate failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg border-l-2 border-l-primary">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-primary" /> Duplicate rows
          </DialogTitle>
          <DialogDescription>
            Creates new copies of the selected rows. Original rows are not modified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <div className="font-medium">
              {editableRows.length} row{editableRows.length === 1 ? '' : 's'} → {editableRows.length} new row{editableRows.length === 1 ? '' : 's'}
            </div>
            {skipped > 0 && (
              <div className="text-xs text-muted-foreground">
                {skipped} skipped (no permission)
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Options</div>
            <label className="flex items-start gap-2 rounded-md border px-3 py-2 hover:bg-accent/40 cursor-pointer">
              <Checkbox
                checked={opts.resetActualDates}
                onCheckedChange={(c) => setOpts((o) => ({ ...o, resetActualDates: !!c }))}
                className="mt-0.5"
              />
              <span>
                <div className="font-medium">Reset actual dates</div>
                <div className="text-xs text-muted-foreground">
                  {entity === 'subtest'
                    ? 'T1/T2/Pred/R1/R2 actual dates'
                    : entity === 'drawing'
                      ? 'Submitted / approved / sub1–3 actual dates'
                      : 'Actual start/completion/closure dates'} will be cleared on the copies.
                </div>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-md border px-3 py-2 hover:bg-accent/40 cursor-pointer">
              <Checkbox
                checked={opts.resetProgressStatus}
                onCheckedChange={(c) => setOpts((o) => ({ ...o, resetProgressStatus: !!c }))}
                className="mt-0.5"
              />
              <span>
                <div className="font-medium">Reset progress / status</div>
                <div className="text-xs text-muted-foreground">
                  Status fields {entity === 'defect' ? 'and actual progress %' : entity === 'drawing' ? 'and submitted flag' : ''} will be cleared on the copies.
                </div>
              </span>
            </label>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Preview (first {Math.min(5, editableRows.length)} of {editableRows.length})
            </div>
            <div className="max-h-40 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr><th className="px-2 py-1 text-left">Source</th></tr>
                </thead>
                <tbody>
                  {editableRows.slice(0, 5).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="truncate px-2 py-1">{r[labelKey] ?? r.id.slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || editableRows.length === 0}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Duplicate {editableRows.length} row{editableRows.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
