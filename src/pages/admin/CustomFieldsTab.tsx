import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCustomFields, type CustomFieldDefRow } from '@/hooks/useCustomFields';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { CustomFieldType } from '@/lib/custom-fields-cache';

type ModuleKey = 'tnc' | 'defect';

const TYPES: CustomFieldType[] = ['text', 'number', 'date', 'boolean'];

export default function CustomFieldsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: defs = [], isLoading, refetch } = useCustomFields();
  const [active, setActive] = useState<ModuleKey>('tnc');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CustomFieldDefRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return defs
      .filter((d) => d.module === active)
      .filter((d) => !s || d.field_name.toLowerCase().includes(s) || d.display_name.toLowerCase().includes(s));
  }, [defs, active, search]);

  const toggleActive = async (row: CustomFieldDefRow) => {
    const { error } = await supabase
      .from('custom_field_definitions')
      .update({ is_active: !row.is_active, updated_by: user?.id ?? null })
      .eq('id', row.id);
    if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    else { toast({ title: row.is_active ? 'Field disabled' : 'Field enabled' }); refetch(); }
  };

  const removeRow = async (row: CustomFieldDefRow) => {
    if (!confirm(`Delete custom field "${row.display_name}" (${row.field_name})?\nIf data exists, you must disable it instead.`)) return;
    const { error } = await supabase.from('custom_field_definitions').delete().eq('id', row.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Field deleted' }); refetch(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Custom System Fields</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Create user-defined fields you can map Excel headers to. Stored in JSONB; values appear in raw payload / exports.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Field
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={active} onValueChange={(v) => setActive(v as ModuleKey)}>
          <TabsList>
            <TabsTrigger value="tnc">T&amp;C</TabsTrigger>
            <TabsTrigger value="defect">Defect</TabsTrigger>
          </TabsList>
        </Tabs>

        <Input
          placeholder="Search field name or display name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />

        <div className="rounded border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Display Name</TableHead>
                <TableHead>Field Name</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[80px]">Active</TableHead>
                <TableHead className="w-[80px]">Order</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No custom fields yet.</TableCell></TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id} className={row.is_active ? '' : 'opacity-50'}>
                  <TableCell>{row.display_name}</TableCell>
                  <TableCell className="font-mono text-xs">{row.field_name}</TableCell>
                  <TableCell><Badge variant="secondary">{row.data_type}</Badge></TableCell>
                  <TableCell>
                    <Switch checked={row.is_active} onCheckedChange={() => toggleActive(row)} />
                  </TableCell>
                  <TableCell className="text-xs">{row.sort_order}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.note ?? ''}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(row)} title="Edit">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeRow(row)} title="Delete">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <FieldDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        module={active}
        userId={user?.id ?? null}
        existing={defs}
        onSaved={refetch}
      />
      <FieldDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        module={active}
        userId={user?.id ?? null}
        existing={defs}
        editing={editing}
        onSaved={refetch}
      />
    </Card>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  module: ModuleKey;
  userId: string | null;
  existing: CustomFieldDefRow[];
  editing?: CustomFieldDefRow | null;
  onSaved: () => void;
}

function FieldDialog({ open, onClose, module, userId, existing, editing, onSaved }: DialogProps) {
  const { toast } = useToast();
  const [fieldName, setFieldName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dataType, setDataType] = useState<CustomFieldType>('text');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFieldName(editing?.field_name ?? '');
      setDisplayName(editing?.display_name ?? '');
      setDataType(editing?.data_type ?? 'text');
      setSortOrder(editing?.sort_order ?? 0);
      setNote(editing?.note ?? '');
    }
  }, [open, editing]);

  const isEdit = !!editing;
  const validName = /^[a-z][a-z0-9_]{0,49}$/.test(fieldName);
  const conflict = existing.find(
    (d) => d.module === module && d.field_name === fieldName && d.id !== editing?.id,
  );

  const onSave = async () => {
    if (!validName) {
      toast({ title: 'Invalid field name', description: 'Use lowercase snake_case starting with a letter (a-z, 0-9, _).', variant: 'destructive' });
      return;
    }
    if (!displayName.trim()) {
      toast({ title: 'Display name required', variant: 'destructive' });
      return;
    }
    if (conflict) {
      toast({ title: 'Duplicate field name', variant: 'destructive' });
      return;
    }

    setSaving(true);
    if (isEdit) {
      const { error } = await supabase
        .from('custom_field_definitions')
        .update({
          display_name: displayName.trim(),
          data_type: dataType,
          sort_order: sortOrder,
          note: note || null,
          updated_by: userId,
        })
        .eq('id', editing!.id);
      setSaving(false);
      if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Field updated' });
    } else {
      const { error } = await supabase
        .from('custom_field_definitions')
        .insert({
          module,
          field_name: fieldName,
          display_name: displayName.trim(),
          data_type: dataType,
          sort_order: sortOrder,
          note: note || null,
          created_by: userId,
          updated_by: userId,
        });
      setSaving(false);
      if (error) { toast({ title: 'Create failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Field created' });
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Custom Field' : 'Add Custom Field'} — {module.toUpperCase()}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Display name, type, order, and note can be edited. Field name and module are locked. Type cannot be changed once data exists.'
              : 'Create a new field that you can then map Excel headers to. Field name is permanent.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Field Name (code identifier)</Label>
            <Input
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value.toLowerCase())}
              disabled={isEdit}
              placeholder="e.g. client_ref_no"
            />
            {!isEdit && fieldName && !validName && (
              <p className="text-xs text-destructive">
                Lowercase snake_case, must start with a letter (a-z, 0-9, _), max 50 chars.
              </p>
            )}
            {!isEdit && conflict && (
              <p className="text-xs text-destructive">A field with this name already exists in this module.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Display Name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Client Reference No" />
          </div>
          <div className="space-y-1">
            <Label>Data Type</Label>
            <Select value={dataType} onValueChange={(v) => setDataType(v as CustomFieldType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            {isEdit && editing && dataType !== editing.data_type && (
              <p className="text-xs text-amber-600">
                Type changes are blocked if any imported data already exists for this field.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Sort Order</Label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this field exists…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !validName || !!conflict || !displayName.trim()}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
