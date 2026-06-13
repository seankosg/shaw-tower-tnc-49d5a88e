import { Button } from '@/components/ui/button';
import { AlertTriangle, Shield } from 'lucide-react';

interface RowLike {
  id: string;
  is_critical?: boolean | null;
}

interface Props<T extends RowLike> {
  isAdmin: boolean;
  selectedRows: T[];
  pending: Map<string, boolean>;
  setPending: (updater: (prev: Map<string, boolean>) => Map<string, boolean>) => void;
}

/**
 * Admin-only bulk Critical toggle bar.
 * Populates the existing critical pending map for selected rows; the floating
 * CriticalPendingBar then commits to DB and reflects in the Critical Issue Board.
 */
export function CriticalBulkBar<T extends RowLike>({ isAdmin, selectedRows, pending, setPending }: Props<T>) {
  if (!isAdmin) return null;
  if (selectedRows.length === 0) return null;

  const applyBulk = (next: boolean) => {
    setPending((prev) => {
      const map = new Map(prev);
      for (const row of selectedRows) {
        const original = !!row.is_critical;
        if (next === original) map.delete(row.id);
        else map.set(row.id, next);
      }
      return map;
    });
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2">
      <Shield className="h-4 w-4 text-amber-600" />
      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
        Admin · {selectedRows.length} selected
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 border-amber-500/60 text-xs"
        onClick={() => applyBulk(true)}
      >
        <AlertTriangle className="mr-1 h-3 w-3 text-amber-600" />
        Mark Critical
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => applyBulk(false)}
      >
        Unmark Critical
      </Button>
      <span className="text-[11px] text-muted-foreground">
        Changes are queued — confirm via the Pending Critical bar to apply.
      </span>
    </div>
  );
}
