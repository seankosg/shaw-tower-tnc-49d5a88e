import { useEffect, useMemo, useState } from 'react';
import { Archive, Loader2, ShieldAlert } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { applyBulkDelete, previewBulkDelete, type BulkEntity, type CascadePreview } from '@/lib/bulk-actions';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entity: BulkEntity;
  mode: 'soft' | 'hard';
  rows: any[];
  editableIds: string[];
  onDone: () => void;
}

const CASCADE_LABELS: Record<string, string> = {
  subtests: 'Subtests',
  defects: 'Defect items',
  comments: 'Comments',
  comment_reads: 'Comment read marks',
  change_log: 'Change log entries',
  schedule_audit: 'Schedule audit entries',
  daily_snapshots: 'Daily snapshots',
  sc_no_history: 'SC No history',
};

export function BulkDeleteDialog({ open, onOpenChange, entity, mode, rows, editableIds, onDone }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [preview, setPreview] = useState<CascadePreview | null>(null);

  const editableRows = rows.filter((r) => editableIds.includes(r.id));
  const skipped = rows.length - editableRows.length;
  const labelKey = entity === 'subtest' ? 'subtest_id' : 'issue_no';

  // Load cascade preview only for hard mode
  useEffect(() => {
    if (!open || mode !== 'hard') { setPreview(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const p = await previewBulkDelete(entity, editableIds);
        if (!cancelled) setPreview(p);
      } catch (err) {
        if (!cancelled) toast({ title: 'Preview failed', description: (err as Error).message, variant: 'destructive' });
      }
    })();
    return () => { cancelled = true; };
  }, [open, mode, entity, editableIds, toast]);

  useEffect(() => {
    if (!open) setConfirmText('');
  }, [open]);

  const canConfirm = useMemo(() => {
    if (editableRows.length === 0) return false;
    if (mode === 'hard') return confirmText === 'DELETE';
    return true;
  }, [mode, confirmText, editableRows.length]);

  async function handleConfirm() {
    if (!user) return;
    setBusy(true);
    try {
      const r = await applyBulkDelete({ entity, ids: editableIds, mode, userId: user.id });
      const action = mode === 'soft' ? 'hidden' : 'permanently deleted';
      toast({
        title: mode === 'soft' ? 'Soft delete complete' : 'Permanent delete complete',
        description: `${r.succeeded} ${action}${r.failed ? ` · ${r.failed} blocked` : ''}${skipped ? ` · ${skipped} skipped (no permission)` : ''}.`,
        variant: r.failed > 0 && r.succeeded === 0 ? 'destructive' : 'default',
      });
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  const isHard = mode === 'hard';

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent
        className={cn(
          'sm:max-w-lg',
          isHard ? 'border-l-4 border-l-destructive' : 'border-l-4 border-l-warning',
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isHard ? (
              <ShieldAlert className="h-4 w-4 text-destructive" />
            ) : (
              <Archive className="h-4 w-4 text-warning" />
            )}
            {isHard ? 'Delete permanently' : 'Hide rows (soft delete)'}
          </DialogTitle>
          <DialogDescription>
            {isHard
              ? 'This permanently removes the selected rows and all related comments, change logs, and audit entries. This cannot be undone.'
              : 'Selected rows will be hidden from raw data and reports. They can be restored later by an administrator.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <div className="font-medium">
              {editableRows.length} row{editableRows.length === 1 ? '' : 's'} will be {isHard ? 'permanently deleted' : 'hidden'}
            </div>
            {skipped > 0 && (
              <div className="text-xs text-muted-foreground">{skipped} skipped (no permission)</div>
            )}
          </div>

          {isHard && preview && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Cascade impact</div>
              <div className="overflow-hidden rounded border">
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(preview).map(([k, v]) => (
                      <tr key={k} className="border-t first:border-t-0">
                        <td className="px-2 py-1">{CASCADE_LABELS[k] ?? k}</td>
                        <td className="px-2 py-1 text-right font-mono">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Preview (first {Math.min(5, editableRows.length)} of {editableRows.length})
            </div>
            <div className="max-h-32 overflow-auto rounded border">
              <table className="w-full text-xs">
                <tbody>
                  {editableRows.slice(0, 5).map((r) => (
                    <tr key={r.id} className="border-t first:border-t-0">
                      <td className="truncate px-2 py-1">{r[labelKey] ?? r.id.slice(0, 8)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {isHard && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                Type <span className="font-mono font-semibold text-destructive">DELETE</span> to confirm.
              </div>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="h-8 font-mono"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || busy}
            variant={isHard ? 'destructive' : 'default'}
            className={cn(!isHard && 'bg-amber-600 text-white hover:bg-amber-700')}
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {isHard
              ? `Delete ${editableRows.length} row${editableRows.length === 1 ? '' : 's'}`
              : `Hide ${editableRows.length} row${editableRows.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
