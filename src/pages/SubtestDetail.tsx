import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { DataSourceTag } from '@/components/shared/DataSourceTag';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { TC_STATUS_OPTIONS, TEAM_LABELS } from '@/types/enums';
import type { TcStatus, DataSource, ChangeSource, TeamType } from '@/types/enums';
import { invalidateSubtestCache } from '@/lib/subtest-cache';
import { formatDateTimeDdMmmYyyy } from '@/lib/format';
import { SubtestComments } from '@/components/defects/SubtestComments';
import { Badge } from '@/components/ui/badge';
import { MessageSquare } from 'lucide-react';

interface SubtestDetail {
  id: string;
  project_id: string;
  system_id: string;
  subtest_id: string;
  item_no: string;
  mos_code: string;
  mos_sequence: number | null;
  level: string | null;
  equipment: string | null;
  description: string | null;
  t1_planned_date: string | null;
  t1_actual_date: string | null;
  t1_status: TcStatus | null;
  t2_planned_date: string | null;
  t2_actual_date: string | null;
  t2_status: TcStatus | null;
  r1_status: string | null;
  aconex_ref_no: string | null;
  r2_status: string | null;
  remarks: string | null;
  punchlist_comments: string | null;
  predecessor_status_raw: string | null;
  pred_status: TcStatus | null;
  pred_planned_date: string | null;
  pred_actual_date: string | null;
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  data_source_type: DataSource | null;
  team: TeamType | null;
  updated_at: string;
  row_version: number;
  system_master: { system_code: string } | null;
}

interface ChangeLog {
  id: string;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
  change_source: ChangeSource | null;
}

type EditScope = 'none' | 'assigned' | 'team' | 'full';
const RESPONSIBILITY_FIELDS = ['subcontractor_name', 'subsub_name', 'hdec_pic_name'] as const;

export default function SubtestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { toast } = useToast();
  const { isAdminOrSuperuser, user } = useAuth();
  const { isFieldVisible } = useFieldConfig();
  const [record, setRecord] = useState<SubtestDetail | null>(null);
  const [form, setForm] = useState<Partial<SubtestDetail>>({});
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([]);
  const [canEditRecord, setCanEditRecord] = useState(false);
  const [editScope, setEditScope] = useState<EditScope>('none');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentCount, setCommentCount] = useState(0);

  useEffect(() => {
    if (id) {
      fetchRecord();
      fetchChangeLogs();
    }
  }, [id, user?.id]);

  const fetchRecord = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('subtests')
      .select('*, system_master(system_code)')
      .eq('id', id!)
      .single();
    if (data) {
      const d = data as any;
      setRecord(d);
      if (user?.id) {
        const { data: scope } = await (supabase as any).rpc('get_subtest_edit_scope', {
          _user_id: user.id,
          _subtest_id: d.id,
        });
        const nextScope = (scope || 'none') as EditScope;
        setEditScope(nextScope);
        setCanEditRecord(nextScope !== 'none');
      } else {
        setEditScope('none');
        setCanEditRecord(false);
      }
      setForm({
        t1_planned_date: d.t1_planned_date,
        t1_actual_date: d.t1_actual_date,
        t1_status: d.t1_status,
        t2_planned_date: d.t2_planned_date,
        t2_actual_date: d.t2_actual_date,
        t2_status: d.t2_status,
        r1_status: d.r1_status,
        aconex_ref_no: d.aconex_ref_no,
        r2_status: d.r2_status,
        remarks: d.remarks,
        punchlist_comments: d.punchlist_comments,
        predecessor_status_raw: d.predecessor_status_raw,
        pred_status: d.pred_status,
        pred_planned_date: d.pred_planned_date,
        pred_actual_date: d.pred_actual_date,
        subcontractor_name: d.subcontractor_name,
        subsub_name: d.subsub_name,
        hdec_pic_name: d.hdec_pic_name,
      });
    }
    setLoading(false);
  };

  const fetchChangeLogs = async () => {
    const { data } = await supabase
      .from('subtest_change_log')
      .select('*')
      .eq('subtest_id', id!)
      .order('changed_at', { ascending: false })
      .limit(50);
    if (data) setChangeLogs(data as ChangeLog[]);
  };

  const handleSave = async () => {
    if (!record || !user?.id || !canEditRecord) return;
    setSaving(true);
    const canEditResponsibility = editScope === 'team' || editScope === 'full';

    // Build change log entries
    const changes: { field: string; old_val: string | null; new_val: string | null }[] = [];
    const editableFields = [
      't1_planned_date', 't1_actual_date', 't1_status',
      't2_planned_date', 't2_actual_date', 't2_status',
      'r1_status', 'aconex_ref_no', 'r2_status',
      'remarks', 'punchlist_comments',
      'predecessor_status_raw', 'pred_status', 'pred_planned_date', 'pred_actual_date',
      'subcontractor_name', 'subsub_name', 'hdec_pic_name',
    ] as const;

    for (const field of editableFields) {
      if (!canEditResponsibility && RESPONSIBILITY_FIELDS.includes(field as any)) continue;
      const oldVal = (record as any)[field];
      const newVal = (form as any)[field];
      if (oldVal !== newVal) {
        changes.push({ field, old_val: oldVal ?? null, new_val: newVal ?? null });
      }
    }

    const updatePayload: Record<string, any> = {
      t1_planned_date: form.t1_planned_date || null,
      t1_actual_date: form.t1_actual_date || null,
      t1_status: form.t1_status || null,
      t2_planned_date: form.t2_planned_date || null,
      t2_actual_date: form.t2_actual_date || null,
      t2_status: form.t2_status || null,
      r1_status: form.r1_status || null,
      aconex_ref_no: form.aconex_ref_no || null,
      r2_status: form.r2_status || null,
      remarks: form.remarks || null,
      punchlist_comments: form.punchlist_comments || null,
      predecessor_status_raw: form.predecessor_status_raw || null,
      pred_status: form.pred_status || null,
      pred_planned_date: form.pred_planned_date || null,
      pred_actual_date: form.pred_actual_date || null,
      updated_by: user.id,
      data_source_type: 'app_direct_input' as DataSource,
      row_version: record.row_version + 1,
    };

    if (canEditResponsibility) {
      updatePayload.subcontractor_name = form.subcontractor_name || null;
      updatePayload.subsub_name = form.subsub_name || null;
      updatePayload.hdec_pic_name = form.hdec_pic_name || null;
    }

    const { error } = await supabase
      .from('subtests')
      .update(updatePayload as any)
      .eq('id', record.id);

    if (error) {
      toast({ title: 'Save Failed', description: error.message, variant: 'destructive' });
    } else {
      // Insert change logs
      if (changes.length > 0) {
        await supabase.from('subtest_change_log').insert(
          changes.map(c => ({
            subtest_id: record.id,
            changed_field: c.field,
            old_value: c.old_val,
            new_value: c.new_val,
            changed_by: user.id,
            change_source: 'app_direct_input' as ChangeSource,
          }))
        );
      }
      toast({ title: 'Saved', description: 'Subtest updated successfully.' });
      invalidateSubtestCache();
      fetchRecord();
      fetchChangeLogs();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!record) return;
    setDeleting(true);
    const { error } = await supabase
      .from('subtests')
      .delete()
      .eq('id', record.id);
    if (error) {
      toast({ title: 'Delete Failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deleted', description: `Subtest ${record.subtest_id} has been deleted.` });
      invalidateSubtestCache();
      navigate('/raw-data');
    }
    setDeleting(false);
  };

  const updateField = (field: string, value: any) => {
    setForm(prev => {
      const updated = { ...prev, [field]: value || null };
      // Auto-set actual date when status changes to "Done"
      const today = new Date().toISOString().split('T')[0];
      if (field === 't1_status') {
        if (value === 'Done' && !prev.t1_actual_date) {
          updated.t1_actual_date = today;
        }
      }
      if (field === 't2_status') {
        if (value === 'Done' && !prev.t2_actual_date) {
          updated.t2_actual_date = today;
        }
      }
      if (field === 'pred_status') {
        if (value === 'Done' && !prev.pred_actual_date) {
          updated.pred_actual_date = today;
        }
      }
      return updated;
    });
  };

  const canEditResponsibility = editScope === 'team' || editScope === 'full';

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>;
  }

  if (!record) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Subtest not found.</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/tc/raw-data'); }}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-lg font-semibold">{record.subtest_id}</h1>
        <DataSourceTag source={record.data_source_type} />
      </div>

      {/* Info header */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Subtest Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><Label className="text-xs text-muted-foreground">System</Label><div>{record.system_master?.system_code}</div></div>
          <div><Label className="text-xs text-muted-foreground">Item No</Label><div>{record.item_no}</div></div>
          <div><Label className="text-xs text-muted-foreground">MOS Code</Label><div>{record.mos_code}</div></div>
          {isFieldVisible('level') && (
            <div><Label className="text-xs text-muted-foreground">Level</Label><div>{record.level || '—'}</div></div>
          )}
          {isFieldVisible('equipment') && (
            <div><Label className="text-xs text-muted-foreground">Equipment</Label><div>{record.equipment || '—'}</div></div>
          )}
          {isFieldVisible('description') && (
            <div className="col-span-2"><Label className="text-xs text-muted-foreground">Description</Label><div>{record.description || '—'}</div></div>
          )}
          <div><Label className="text-xs text-muted-foreground">Team</Label><div>{record.team ? TEAM_LABELS[record.team] : '—'}</div></div>
        </CardContent>
      </Card>

      {/* Editable fields */}
      {(isFieldVisible('t1_status') || isFieldVisible('t1_planned_date')) && (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">T1 — Internal Test</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isFieldVisible('t1_status') && (
          <div className="space-y-1.5">
            <Label className="text-xs">T1 Status</Label>
            <Select value={form.t1_status || '_blank'} onValueChange={v => updateField('t1_status', v === '_blank' ? null : v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_blank">— Blank —</SelectItem>
                {TC_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          )}
          {isFieldVisible('t1_planned_date') && (
          <div className="space-y-1.5">
            <Label className="text-xs">T1 Planned Date</Label>
            <Input type="date" className="h-9" value={form.t1_planned_date || ''} onChange={e => updateField('t1_planned_date', e.target.value)} />
          </div>
          )}
        </CardContent>
      </Card>
      )}

      {(isFieldVisible('t2_status') || isFieldVisible('t2_planned_date')) && (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">T2 — RTO Witness Test</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isFieldVisible('t2_status') && (
          <div className="space-y-1.5">
            <Label className="text-xs">T2 Status</Label>
            <Select value={form.t2_status || '_blank'} onValueChange={v => updateField('t2_status', v === '_blank' ? null : v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_blank">— Blank —</SelectItem>
                {TC_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          )}
          {isFieldVisible('t2_planned_date') && (
          <div className="space-y-1.5">
            <Label className="text-xs">T2 Planned Date</Label>
            <Input type="date" className="h-9" value={form.t2_planned_date || ''} onChange={e => updateField('t2_planned_date', e.target.value)} />
          </div>
          )}
        </CardContent>
      </Card>
      )}

      {(isFieldVisible('r1_status') || isFieldVisible('aconex_ref_no') || isFieldVisible('r2_status') || isFieldVisible('remarks') || isFieldVisible('punchlist_comments')) && (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">Additional Fields</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {isFieldVisible('r1_status') && (
          <div className="space-y-1.5">
            <Label className="text-xs">R1 Status</Label>
            <Input className="h-9" value={form.r1_status || ''} onChange={e => updateField('r1_status', e.target.value)} />
          </div>
          )}
          {isFieldVisible('aconex_ref_no') && (
          <div className="space-y-1.5">
            <Label className="text-xs">Aconex Ref No</Label>
            <Input className="h-9" value={form.aconex_ref_no || ''} onChange={e => updateField('aconex_ref_no', e.target.value)} />
          </div>
          )}
          {isFieldVisible('r2_status') && (
          <div className="space-y-1.5">
            <Label className="text-xs">R2 Status</Label>
            <Input className="h-9" value={form.r2_status || ''} onChange={e => updateField('r2_status', e.target.value)} />
          </div>
          )}
          {isFieldVisible('remarks') && (
          <div className="space-y-1.5 md:col-span-3">
            <Label className="text-xs">Remarks</Label>
            <Textarea value={form.remarks || ''} onChange={e => updateField('remarks', e.target.value)} rows={2} />
          </div>
          )}
          {isFieldVisible('punchlist_comments') && (
          <div className="space-y-1.5 md:col-span-3">
            <Label className="text-xs">Punchlist Comments</Label>
            <Textarea value={form.punchlist_comments || ''} onChange={e => updateField('punchlist_comments', e.target.value)} rows={2} />
          </div>
          )}
        </CardContent>
      </Card>
      )}

      {(isFieldVisible('predecessor_status_raw') || isFieldVisible('subcontractor_name') || isFieldVisible('subsub_name') || isFieldVisible('hdec_pic_name')) && (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">Predecessor & Responsibility</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {isFieldVisible('predecessor_status_raw') && (
          <>
          <div className="space-y-1.5">
            <Label className="text-xs">Predecessor Status</Label>
            <Select value={form.pred_status || '_blank'} onValueChange={v => updateField('pred_status', v === '_blank' ? null : v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_blank">— Blank —</SelectItem>
                {TC_STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Predecessor Planned</Label>
            <Input type="date" className="h-9" value={form.pred_planned_date || ''} onChange={e => updateField('pred_planned_date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Predecessor Actual</Label>
            <Input type="date" className="h-9" value={form.pred_actual_date || ''} onChange={e => updateField('pred_actual_date', e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label className="text-xs">Predecessor Raw (Excel original)</Label>
            <Input className="h-9" value={form.predecessor_status_raw || ''} onChange={e => updateField('predecessor_status_raw', e.target.value)} placeholder="e.g. Done or 2026-03-15" />
          </div>
          </>
          )}
          {isFieldVisible('subcontractor_name') && (
          <div className="space-y-1.5">
            <Label className="text-xs">Subcontractor</Label>
            <Input className="h-9" value={form.subcontractor_name || ''} disabled={!canEditResponsibility} onChange={e => updateField('subcontractor_name', e.target.value)} />
          </div>
          )}
          {isFieldVisible('subsub_name') && (
          <div className="space-y-1.5">
            <Label className="text-xs">Sub-Sub</Label>
            <Input className="h-9" value={form.subsub_name || ''} disabled={!canEditResponsibility} onChange={e => updateField('subsub_name', e.target.value)} />
          </div>
          )}
          {isFieldVisible('hdec_pic_name') && (
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">HDEC PIC</Label>
            <Input className="h-9" value={form.hdec_pic_name || ''} disabled={!canEditResponsibility} onChange={e => updateField('hdec_pic_name', e.target.value)} />
          </div>
          )}
        </CardContent>
      </Card>
      )}

      {(isAdminOrSuperuser || canEditRecord) && (
        <div className="flex justify-between">
          {isAdminOrSuperuser ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={deleting}>
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {deleting ? 'Deleting...' : 'Delete Subtest'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Subtest</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{record.subtest_id}</strong>? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : <div />}
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}

      {/* Change History */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">Change History</CardTitle>
        </CardHeader>
        <CardContent>
          {changeLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No changes recorded yet.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Field</TableHead>
                    <TableHead className="text-xs">Old Value</TableHead>
                    <TableHead className="text-xs">New Value</TableHead>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Changed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changeLogs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs font-medium">{log.changed_field}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.old_value || '—'}</TableCell>
                      <TableCell className="text-xs">{log.new_value || '—'}</TableCell>
                      <TableCell className="text-xs">{log.change_source || '—'}</TableCell>
                      <TableCell className="text-xs">{formatDateTimeDdMmmYyyy(log.changed_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comments */}
      {record && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Comments
              {commentCount > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                  {commentCount}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SubtestComments
              subtestId={record.id}
              subtestTeam={(record as any).team ?? null}
              onCountChange={setCommentCount}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
