import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import type {
  SimilarDecisionAction, SimilarMasterDecision,
} from '@/lib/subcontractor-master-sync';

interface Props {
  open: boolean;
  decisions: SimilarMasterDecision[];
  isRunning?: boolean;
  onSetAction: (key: string, action: SimilarDecisionAction) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Shared dialog for resolving "imported name vs existing master" name conflicts
 *  (≤2 character edit distance). Used by Defect / DMR / Punch / Docs / TnC importers. */
export function SimilarMasterDialog({ open, decisions, isRunning, onSetAction, onCancel, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Possible Existing Subcontractors Found</DialogTitle>
          <DialogDescription>
            The imported names below differ from existing master entries by only a few characters.
            Choose whether to use the existing master or register the imported name as new.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-md border">
          <div className="grid grid-cols-[1fr_1fr_220px] gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>Imported Name</span>
            <span>Similar Existing Master</span>
            <span>Action</span>
          </div>
          {decisions.map((decision) => (
            <div key={decision.key} className="grid grid-cols-[1fr_1fr_220px] items-center gap-3 border-b px-3 py-3 last:border-b-0">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{decision.importedName}</div>
                <div className="text-xs text-muted-foreground">
                  {decision.kind === 'subsub' ? `Sub-sub · Parent: ${decision.parentName}` : 'Subcontractor'}
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{decision.existingName}</div>
                <div className="text-xs text-muted-foreground">{decision.distance} char diff</div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button" size="sm"
                  variant={decision.action === 'use_existing' ? 'default' : 'outline'}
                  onClick={() => onSetAction(decision.key, 'use_existing')}
                >
                  Use Existing
                </Button>
                <Button
                  type="button" size="sm"
                  variant={decision.action === 'register_new' ? 'default' : 'outline'}
                  onClick={() => onSetAction(decision.key, 'register_new')}
                >
                  Register New
                </Button>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm} disabled={decisions.some((d) => !d.action) || !!isRunning}>
            Continue Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
