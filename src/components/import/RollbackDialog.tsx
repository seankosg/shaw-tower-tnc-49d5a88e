import { useEffect, useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export type RollbackKind = 'tnc' | 'defect' | 'punch';

interface PreviewResult {
  insert_count: number;
  update_count: number;
  conflict_count: number;
}

interface Props {
  kind: RollbackKind;
  batchId: string;
  fileName: string;
  onDone?: () => void;
}

const PREVIEW_FN = {
  tnc: 'preview_rollback_upload_batch',
  defect: 'preview_rollback_defect_import_batch',
  punch: 'preview_rollback_punch_import_batch',
} as const;

const ROLLBACK_FN = {
  tnc: 'rollback_upload_batch',
  defect: 'rollback_defect_import_batch',
  punch: 'rollback_punch_import_batch',
} as const;

export function RollbackDialog({ kind, batchId, fileName, onDone }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [force, setForce] = useState(false);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setForce(false);
      return;
    }
    void loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc(PREVIEW_FN[kind], { _batch_id: batchId });
      if (error) throw error;
      setPreview(data as PreviewResult);
    } catch (e: any) {
      toast({
        title: 'Preview failed',
        description: e?.message || 'Could not load rollback preview',
        variant: 'destructive',
      });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const runRollback = async () => {
    setRunning(true);
    try {
      const { data, error } = await (supabase as any).rpc(ROLLBACK_FN[kind], {
        _batch_id: batchId,
        _force: force,
      });
      if (error) throw error;
      const r = data as { restored_count: number; deleted_count: number; skipped_count: number };
      toast({
        title: 'Rollback complete',
        description: `Restored ${r.restored_count}, removed ${r.deleted_count}, skipped ${r.skipped_count}.`,
      });
      setOpen(false);
      onDone?.();
    } catch (e: any) {
      toast({
        title: 'Rollback failed',
        description: e?.message || 'Could not rollback this batch',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="Rollback this batch (revert changes only)"
          onClick={(e) => e.stopPropagation()}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Rollback import batch?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Revert only the changes made by <strong>{fileName}</strong>. Other users' edits and
                later batches are preserved.
              </p>

              {loading || !preview ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating impact…
                </div>
              ) : (
                <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                  <div className="flex justify-between">
                    <span>Rows added by this batch (will be deactivated):</span>
                    <span className="font-medium">{preview.insert_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Field updates to revert (to previous values):</span>
                    <span className="font-medium">{preview.update_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Conflicts (changed again after this batch):</span>
                    <span
                      className={
                        preview.conflict_count > 0 ? 'font-medium text-destructive' : 'font-medium'
                      }
                    >
                      {preview.conflict_count}
                    </span>
                  </div>
                </div>
              )}

              {preview && preview.conflict_count > 0 && (
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={force}
                    onCheckedChange={(v) => setForce(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Force restore conflicted fields too (overwrites later changes — use with care)
                  </span>
                </label>
              )}

              {kind === 'tnc' && (
                <p className="text-xs text-muted-foreground">
                  Note: T&amp;C rollback uses change history only (no daily snapshots).
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void runRollback();
            }}
            disabled={running || loading || !preview}
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
            Rollback
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
