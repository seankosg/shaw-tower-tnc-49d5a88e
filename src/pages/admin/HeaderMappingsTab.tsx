import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useHeaderMappings, type HeaderMappingRow } from '@/hooks/useHeaderMappings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Lock, Plus, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomFields } from '@/hooks/useCustomFields';

type ModuleKey = 'tnc' | 'defect';

// System field whitelists (target_field column) — keep in sync with parsers.
const TNC_FIELDS = [
  'system','item_no','team','level','equipment','description',
  'mos_1','mos_2','mos_3','mos_4','mos_5','mos_code','subtest_id',
  't1_planned_date','t1_status','t2_planned_date','t2_status',
  'predecessor_status_raw','subcontractor_name','subsub_name','hdec_pic_name',
  'r1_status','r2_status','r1_report_ref',
  'r1_target_submission_date','r1_actual_submission_date',
  'r2_target_submission_date','r2_actual_submission_date',
  'r2_target_approval_date','r2_actual_approval_date',
  'aconex_ref_no','remarks','punchlist_comments','source','updated_at',
] as const;

const DEFECT_FIELDS = [
  'id','issue_no','defect_type','area_raw','area_location','area_level','description','status',
  'trade_detail','priority','main_trade','sub_trade',
  'subcontractor_name','subsub_name','hdec_pic_name','hdec_eng_name',
  'remarks','aconex_comments','hdec_comments',
  'planned_start_date','planned_completion_date','planned_closure_date',
  'actual_start_date','actual_completion_date','actual_closure_date',
  'planned_progress_pct','actual_progress_pct','completion_status','closure_status',
  'work_type','subcontractor_issue_no','subcontractor_issue_source',
] as const;

function normalizeAlias(mod: ModuleKey, raw: string): string {
  if (mod === 'tnc') {
    return raw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  // defect: cleanHeader strips trailing "(H)" (kept for parity), then collapse separators
  return raw.replace(/\s*\(H\)\s*$/i, '').trim()
    .toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function HeaderMappingsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: mappings = [], isLoading, refetch } = useHeaderMappings();
  const { data: customFields = [] } = useCustomFields();
  const [active, setActive] = useState<ModuleKey>('tnc');
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<HeaderMappingRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [testHeader, setTestHeader] = useState('');

  const customForActive = useMemo(
    () => customFields.filter((f) => f.module === active && f.is_active)
      .map((f) => ({ value: `custom:${f.field_name}`, label: `[Custom] ${f.display_name} (${f.data_type})` })),
    [customFields, active],
  );
  const fieldList = active === 'tnc' ? TNC_FIELDS : DEFECT_FIELDS;

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return mappings
      .filter((m) => m.module === active)
      .filter((m) => !s || m.header_alias.toLowerCase().includes(s) || m.target_field.toLowerCase().includes(s));
  }, [mappings, active, search]);

  const testResult = useMemo(() => {
    if (!testHeader.trim()) return null;
    const norm = normalizeAlias(active, testHeader);
    const hit = mappings.find((m) => m.module === active && m.header_alias === norm && m.is_active);
    return { norm, target: hit?.target_field ?? null, isSystem: hit?.is_system ?? false };
  }, [testHeader, active, mappings]);

  const toggleActive = async (row: HeaderMappingRow) => {
    const { error } = await supabase
      .from('import_header_mappings')
      .update({ is_active: !row.is_active, updated_by: user?.id ?? null })
      .eq('id', row.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: row.is_active ? 'Mapping disabled' : 'Mapping enabled' });
      refetch();
    }
  };

  const removeRow = async (row: HeaderMappingRow) => {
    if (row.is_system) {
      toast({ title: 'Protected', description: 'System mapping cannot be deleted.', variant: 'destructive' });
      return;
    }
    if (!confirm(`Delete mapping "${row.header_alias}" → ${row.target_field}?`)) return;
    const { error } = await supabase.from('import_header_mappings').delete().eq('id', row.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Mapping deleted' }); refetch(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Excel Header Mappings</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Map raw Excel column headers to system fields. System mappings are locked to prevent breaking imports.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Mapping
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={active} onValueChange={(v) => setActive(v as ModuleKey)}>
          <TabsList>
            <TabsTrigger value="tnc">T&amp;C</TabsTrigger>
            <TabsTrigger value="defect">Defect</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Test tool */}
        <div className="rounded border p-3 bg-muted/30 space-y-2">
          <Label className="text-xs font-semibold">Mapping Test</Label>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Paste an Excel header to preview the mapping…"
              value={testHeader}
              onChange={(e) => setTestHeader(e.target.value)}
              className="max-w-md"
            />
            {testResult && (
              <div className="text-xs space-x-2">
                <span className="text-muted-foreground">normalized:</span>
                <code className="bg-background px-1 rounded">{testResult.norm}</code>
                <span className="text-muted-foreground">→</span>
                {testResult.target ? (
                  <Badge variant={testResult.isSystem ? 'default' : 'secondary'}>
                    {testResult.target}{testResult.isSystem ? ' (system)' : ''}
                  </Badge>
                ) : (
                  <Badge variant="outline">no match (will fall back / be ignored)</Badge>
                )}
              </div>
            )}
          </div>
        </div>

        <Input
          placeholder="Search alias or target field…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />

        <div className="rounded border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[10px]"></TableHead>
                <TableHead>Header Alias (normalized)</TableHead>
                <TableHead>Target Field</TableHead>
                <TableHead className="w-[80px]">Active</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No mappings.</TableCell></TableRow>
              )}
              {filtered.map((row) => (
                <TableRow key={row.id} className={row.is_active ? '' : 'opacity-50'}>
                  <TableCell>{row.is_system && <Lock className="h-3 w-3 text-muted-foreground" />}</TableCell>
                  <TableCell className="font-mono text-xs">{row.header_alias}</TableCell>
                  <TableCell><Badge variant="secondary">{row.target_field}</Badge></TableCell>
                  <TableCell>
                    <Switch checked={row.is_active} onCheckedChange={() => toggleActive(row)} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.note ?? ''}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" disabled={row.is_system} onClick={() => setEditTarget(row)} title={row.is_system ? 'System (locked)' : 'Edit'}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" disabled={row.is_system} onClick={() => removeRow(row)} title={row.is_system ? 'System (locked)' : 'Delete'}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <MappingDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        module={active}
        fieldList={fieldList as readonly string[]}
        customOptions={customForActive}
        existing={mappings}
        userId={user?.id ?? null}
        onSaved={refetch}
      />
      <MappingDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        module={active}
        fieldList={fieldList as readonly string[]}
        customOptions={customForActive}
        existing={mappings}
        userId={user?.id ?? null}
        editing={editTarget}
        onSaved={refetch}
      />
    </Card>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  module: ModuleKey;
  fieldList: readonly string[];
  customOptions?: { value: string; label: string }[];
  existing: HeaderMappingRow[];
  userId: string | null;
  editing?: HeaderMappingRow | null;
  onSaved: () => void;
}

function MappingDialog({ open, onClose, module, fieldList, customOptions = [], existing, userId, editing, onSaved }: DialogProps) {
  const { toast } = useToast();
  const [alias, setAlias] = useState('');
  const [target, setTarget] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync state when dialog opens
  useEffect(() => {
    if (open) {
      setAlias(editing?.header_alias ?? '');
      setTarget(editing?.target_field ?? '');
      setNote(editing?.note ?? '');
    }
  }, [open, editing]);

  const normalized = normalizeAlias(module, alias);

  const conflict = existing.find(
    (m) => m.module === module && m.header_alias === normalized && m.id !== editing?.id,
  );

  const onSave = async () => {
    if (!normalized) { toast({ title: 'Alias required', variant: 'destructive' }); return; }
    if (!target) { toast({ title: 'Target field required', variant: 'destructive' }); return; }
    if (conflict) { toast({ title: 'Duplicate alias', description: `Already mapped to ${conflict.target_field}`, variant: 'destructive' }); return; }

    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from('import_header_mappings')
        .update({
          header_alias: normalized,
          target_field: target,
          note: note || null,
          updated_by: userId,
        })
        .eq('id', editing.id);
      setSaving(false);
      if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Mapping updated' });
    } else {
      const { error } = await supabase
        .from('import_header_mappings')
        .insert({
          module,
          header_alias: normalized,
          target_field: target,
          note: note || null,
          updated_by: userId,
        });
      setSaving(false);
      if (error) { toast({ title: 'Create failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Mapping added' });
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Mapping' : 'Add Mapping'} — {module.toUpperCase()}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Header Alias (raw — will be normalized)</Label>
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. HDEC PIC" />
            {alias && (
              <p className="text-xs text-muted-foreground">
                Stored as: <code className="bg-muted px-1 rounded">{normalized}</code>
              </p>
            )}
            {conflict && (
              <p className="text-xs text-destructive">
                Conflict: alias already maps to <code>{conflict.target_field}</code>
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Target Field</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue placeholder="Select system field…" /></SelectTrigger>
              <SelectContent>
                {fieldList.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
                {customOptions.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs text-muted-foreground border-t mt-1">Custom Fields</div>
                    {customOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this alias exists…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !!conflict}>{editing ? 'Save' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

