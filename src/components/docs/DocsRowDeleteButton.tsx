import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { softDeleteDocsRow, type DocsSoftDeleteTable } from '@/lib/docs-soft-delete';

interface Props {
  table: DocsSoftDeleteTable;
  id: string;
  /** Short label shown in the confirmation (e.g. document_no, sn, item_no). */
  recordLabel?: string | null;
  onDeleted?: (id: string) => void;
  /** Hide button entirely when role can't delete. Default: always show, server enforces. */
  disabled?: boolean;
  /** 'icon' (default, for table rows) or 'button' (with label, for detail page headers). */
  variant?: 'icon' | 'button';
}

/**
 * Trash button for a single Docs raw-data row.
 * Performs a soft delete (is_active=false). The row stays in the database
 * but is filtered out of every list, dashboard, statistic, and export.
 */
export function DocsRowDeleteButton({ table, id, recordLabel, onDeleted, disabled }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!user) return;
    setBusy(true);
    const r = await softDeleteDocsRow(table, id, user.id);
    setBusy(false);
    if (!r.ok) {
      toast({ title: 'Delete failed', description: r.error, variant: 'destructive' });
      return;
    }
    toast({
      title: 'Deleted',
      description: `${recordLabel ? `“${recordLabel}” ` : ''}removed from all views.`,
    });
    setOpen(false);
    onDeleted?.(id);
  }

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        title="Delete row"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              {recordLabel ? <strong className="text-foreground">{recordLabel}</strong> : 'This row'}{' '}
              will be hidden from all dashboards, statistics, exports, and reports.
              The record stays in the database but cannot be opened. Re-importing the
              same key will restore it. Only an administrator can recover it manually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirm(); }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
