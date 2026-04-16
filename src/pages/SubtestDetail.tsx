import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataSourceTag } from '@/components/shared/DataSourceTag';
import { ArrowLeft, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TC_STATUS_OPTIONS } from '@/types/enums';
import type { TcStatus, DataSource, ChangeSource } from '@/types/enums';

interface SubtestDetail {
  id: string;
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
  data_source_type: DataSource | null;
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

export default function SubtestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [record, setRecord] = useState<SubtestDetail | null>(null);
  const [form, setForm] = useState<Partial<SubtestDetail>>({});
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchRecord();
      fetchChangeLogs();
    }
  }, [id]);

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
    if (!record || !user) return;
    setSaving(true);

    // Build change log entries
    const changes: { field: string; old_val: string | null; new_val: string | null }[] = [];
    const editableFields = [
      't1_planned_date', 't1_actual_date', 't1_status',
      't2_planned_date', 't2_actual_date', 't2_status',
      'r1_status', 'aconex_ref_no', 'r2_status',
      'remarks', 'punchlist_comments',
    ] as const;

    for (const field of editableFields) {
      const oldVal = (record as any)[field];
      const newVal = (form as any)[field];
      if (oldVal !== newVal) {
        changes.push({ field, old_val: oldVal ?? null, new_val: newVal ?? null });
      }
    }

    const { error } = await supabase
      .from('subtests')
      .update({
        ...form,
        updated_by: user.id,
        data_source_type: 'app_direct_input' as DataSource,
        row_version: record.row_version + 1,
      })
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
      fetchRecord();
      fetchChangeLogs();
    }
    setSaving(false);
  };

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value || null }));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>;
  }

  if (!record) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Subtest not found.</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
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
          <div><Label className="text-xs text-muted-foreground">Level</Label><div>{record.level || '—'}</div></div>
          <div><Label className="text-xs text-muted-foreground">Equipment</Label><div>{record.equipment || '—'}</div></div>
          <div className="col-span-2"><Label className="text-xs text-muted-foreground">Description</Label><div>{record.description || '—'}</div></div>
        </CardContent>
      </Card>

      {/* Editable fields */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">T1 — Internal Test</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <div className="space-y-1.5">
            <Label className="text-xs">T1 Planned Date</Label>
            <Input type="date" className="h-9" value={form.t1_planned_date || ''} onChange={e => updateField('t1_planned_date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">T1 Actual Date</Label>
            <Input type="date" className="h-9" value={form.t1_actual_date || ''} onChange={e => updateField('t1_actual_date', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">T2 — RTO Witness Test</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <div className="space-y-1.5">
            <Label className="text-xs">T2 Planned Date</Label>
            <Input type="date" className="h-9" value={form.t2_planned_date || ''} onChange={e => updateField('t2_planned_date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">T2 Actual Date</Label>
            <Input type="date" className="h-9" value={form.t2_actual_date || ''} onChange={e => updateField('t2_actual_date', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">Additional Fields</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">R1 Status</Label>
            <Input className="h-9" value={form.r1_status || ''} onChange={e => updateField('r1_status', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Aconex Ref No</Label>
            <Input className="h-9" value={form.aconex_ref_no || ''} onChange={e => updateField('aconex_ref_no', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">R2 Status</Label>
            <Input className="h-9" value={form.r2_status || ''} onChange={e => updateField('r2_status', e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label className="text-xs">Remarks</Label>
            <Textarea value={form.remarks || ''} onChange={e => updateField('remarks', e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label className="text-xs">Punchlist Comments</Label>
            <Textarea value={form.punchlist_comments || ''} onChange={e => updateField('punchlist_comments', e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

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
                      <TableCell className="text-xs">{new Date(log.changed_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
