import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Loader2, X } from 'lucide-react';

interface Props {
  pending: Map<string, boolean>;
  table: 'defect_items' | 'subtests';
  onApplied: (applied: Map<string, boolean>) => void;
  onDiscard: () => void;
}

export function CriticalPendingBar({ pending, table, onApplied, onDiscard }: Props) {
  const [busy, setBusy] = useState(false);
  if (pending.size === 0) return null;
  const entries = [...pending.entries()];
  const toRegister = entries.filter(([, v]) => v === true).map(([id]) => id);
  const toUnregister = entries.filter(([, v]) => v === false).map(([id]) => id);

  const apply = async () => {
    setBusy(true);
    try {
      if (toRegister.length) {
        const { error } = await (supabase as any).from(table).update({ is_critical: true }).in('id', toRegister);
        if (error) throw error;
      }
      if (toUnregister.length) {
        const { error } = await (supabase as any).from(table).update({ is_critical: false }).in('id', toUnregister);
        if (error) throw error;
      }
      onApplied(new Map(pending));
      toast({
        title: 'Critical updates applied',
        description: `${toRegister.length} registered · ${toUnregister.length} unregistered`,
      });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-lg border border-amber-500/60 bg-background px-4 py-2 shadow-lg">
      <span className="text-sm">
        <span className="font-medium text-amber-600">Pending Critical changes:</span>{' '}
        <span className="text-foreground">{toRegister.length} to register</span>
        {' · '}
        <span className="text-foreground">{toUnregister.length} to unregister</span>
      </span>
      <Button size="sm" onClick={apply} disabled={busy} className="bg-amber-600 hover:bg-amber-700 text-white">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Register to Critical Issue Board
      </Button>
      <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>
        <X className="h-3.5 w-3.5" /> Discard
      </Button>
    </div>
  );
}
