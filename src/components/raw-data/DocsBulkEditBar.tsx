import { useState } from 'react';
import { X, Edit2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { applyBulkUpdate, type BulkEditableField } from '@/lib/bulk-edit';
import { cn } from '@/lib/utils';

interface DocsBulkEditBarProps<TRow extends { id: string }> {
  selectedRows: TRow[];
  fields: BulkEditableField[];
  onApplied: (result: {
    field: string;
    value: string | number | boolean | null;
    ids: string[];
    extraUpdates?: Record<string, string | number | boolean | null>;
  }) => void;
  onClearSelection: () => void;
}

/**
 * Simplified bulk-edit bar for ABD Raw Data. Mirrors the UX of the shared
 * BulkActionBar but uses applyBulkUpdate directly against `docs_drawings`
 * (no RPC-based scope/cascade dependencies).
 */
export function DocsBulkEditBar<TRow extends { id: string }>({
  selectedRows,
  fields,
  onApplied,
  onClearSelection,
}: DocsBulkEditBarProps<TRow>) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<string>('');
  const [value, setValue] = useState<string>('');
  const [busy, setBusy] = useState(false);

  if (selectedRows.length === 0) return null;

  const selectedField = fields.find((f) => f.field === field);

  const apply = async () => {
    if (!user || !selectedField) return;
    setBusy(true);
    try {
      const ids = selectedRows.map((r) => r.id);

      // Coerce string -> typed value depending on inputType
      let submitValue: string | number | boolean | null;
      let extraUpdates: Record<string, string | number | boolean | null> | undefined;

      if (value === '' || value === '__CLEAR__') {
        submitValue = null;
      } else if (selectedField.inputType === 'boolean') {
        submitValue = value === 'true';
      } else if (selectedField.inputType === 'number') {
        const n = Number(value);
        submitValue = Number.isFinite(n) ? n : null;
      } else {
        submitValue = value;
      }

      // Subcontractor: when picking from master, also write companion name field
      if (selectedField.field === 'subcontractor_id' && selectedField.companionFields?.includes('subcontractor_name')) {
        const opt = (selectedField.options ?? []).find((o) => o.value === value);
        const name = opt && value !== '' && value !== '__CLEAR__' ? opt.label : null;
        extraUpdates = { subcontractor_name: name };
      }

      const res = await applyBulkUpdate({
        table: 'docs_drawings',
        ids,
        field: selectedField.field,
        value: submitValue,
        userId: user.id,
        changeSource: 'bulk_edit',
        extraUpdates,
      });
      if (res.failed > 0) {
        toast({
          title: 'Bulk update partially failed',
          description: `${res.succeeded} updated, ${res.failed} failed.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Bulk update applied', description: `${res.succeeded} drawing(s) updated.` });
      }
      onApplied({ field: selectedField.field, value: submitValue, ids, extraUpdates });
      setOpen(false);
      setField('');
      setValue('');
    } catch (err: any) {
      toast({ title: 'Bulk update failed', description: err.message ?? String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const grouped = fields.reduce<Record<string, BulkEditableField[]>>((acc, f) => {
    const key = f.group ?? 'General';
    (acc[key] ||= []).push(f);
    return acc;
  }, {});

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
      <span className="text-sm font-medium text-primary">{selectedRows.length} selected</span>

      {!open ? (
        <Button size="sm" variant="default" onClick={() => setOpen(true)}>
          <Edit2 className="mr-1.5 h-3.5 w-3.5" /> Bulk edit
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={field} onValueChange={(v) => { setField(v); setValue(''); }}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder="Pick a field..." />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{group}</div>
                  {items.map((f) => (
                    <SelectItem key={f.field} value={f.field} className="text-xs">
                      {f.label}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>

          {selectedField && selectedField.inputType === 'select' && (
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder="Pick a value..." />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__CLEAR__" className="text-xs italic text-muted-foreground">— Clear —</SelectItem>
                {(selectedField.options ?? []).map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {selectedField && (selectedField.inputType === 'text' || selectedField.inputType === 'textarea') && (
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="New value (empty = clear)" className="h-8 w-[220px] text-xs" />
          )}

          {selectedField && selectedField.inputType === 'date' && (
            <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-[160px] text-xs" />
          )}

          <Button size="sm" disabled={!field || busy} onClick={apply}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setField(''); setValue(''); }}>Cancel</Button>
        </div>
      )}

      <Button size="sm" variant="ghost" className={cn('ml-auto h-7 text-xs')} onClick={onClearSelection}>
        <X className="mr-1 h-3.5 w-3.5" /> Clear selection
      </Button>
    </div>
  );
}
