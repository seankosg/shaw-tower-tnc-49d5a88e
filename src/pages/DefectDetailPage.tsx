import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useDefectFieldConfig } from '@/hooks/useDefectFieldConfig';
import { daysDiff } from '@/lib/defect-parser';
import { DEFECT_RESPONSIBILITY_FIELDS, DEFECT_REVISION_FIELDS, type DefectEditScope, type DefectItem, formatPct } from '@/lib/defect-utils';

export default function DefectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [record, setRecord] = useState<DefectItem | null>(null);
  const [form, setForm] = useState<Partial<DefectItem>>({});
  const [scope, setScope] = useState<DefectEditScope>('none');
  const [logs, setLogs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const { isFieldVisible, isFieldRequired, getLabel } = useDefectFieldConfig();

  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data } = await (supabase as any).from('defect_items').select('*').eq('id', id).single();
      setRecord(data);
      setForm(data ?? {});
      if (user) {
        const scopeRes = await (supabase as any).rpc('get_defect_edit_scope', { _user_id: user.id, _defect_id: id });
        setScope((scopeRes.data as DefectEditScope) ?? 'none');
      }
      const logRes = await (supabase as any).from('defect_change_log').select('*').eq('defect_id', id).order('changed_at', { ascending: false }).limit(50);
      setLogs(logRes.data ?? []);
    }
    load();
  }, [id, user]);

  const canEdit = scope !== 'none';
  const canEditResponsibility = scope === 'team' || scope === 'full';

  const updateField = (field: keyof DefectItem, value: any) => setForm((current) => ({ ...current, [field]: value }));

  const revisionPayload = (field: string, before: any, after: any) => ({
    defect_id: record!.id, project_id: record!.project_id, issue_no: record!.issue_no, subcontractor_issue_no: form.subcontractor_issue_no ?? record!.subcontractor_issue_no,
    planned_old_date: field === 'planned_date' ? before : null, planned_new_date: field === 'planned_date' ? after : null, planned_diff_days: field === 'planned_date' ? daysDiff(before, after) : null,
    target_old_date: field === 'target_date' ? before : null, target_new_date: field === 'target_date' ? after : null, target_diff_days: field === 'target_date' ? daysDiff(before, after) : null,
    closed_old_date: field === 'closed_date' ? before : null, closed_new_date: field === 'closed_date' ? after : null, closed_diff_days: field === 'closed_date' ? daysDiff(before, after) : null,
    progress_old_pct: field === 'actual_progress_pct' ? before : null, progress_new_pct: field === 'actual_progress_pct' ? after : null, progress_diff_pct: field === 'actual_progress_pct' ? Number(after ?? 0) - Number(before ?? 0) : null,
    closure_status_old: field === 'closure_status' ? before : null, closure_status_new: field === 'closure_status' ? after : null,
    created_by: user?.id, change_source: 'app_direct_input',
  });

  const handleSave = async () => {
    if (!record || !user || !canEdit) return;
    setSaving(true);
    const payload: any = { ...form, updated_by: user.id, data_source_type: 'app_direct_input', row_version: record.row_version + 1 };
    if (!canEditResponsibility) DEFECT_RESPONSIBILITY_FIELDS.forEach((field) => delete payload[field]);
    const { error } = await (supabase as any).from('defect_items').update(payload).eq('id', record.id);
    if (error) {
      setSaving(false);
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    for (const [field, value] of Object.entries(payload)) {
      if (String((record as any)[field] ?? '') !== String(value ?? '') && field in record) {
        await (supabase as any).from('defect_change_log').insert({ defect_id: record.id, changed_field: field, old_value: String((record as any)[field] ?? ''), new_value: String(value ?? ''), changed_by: user.id, change_source: 'app_direct_input' });
        if ((DEFECT_REVISION_FIELDS as readonly string[]).includes(field)) await (supabase as any).from('defect_schedule_change_audit').insert(revisionPayload(field, (record as any)[field], value));
      }
    }
    setSaving(false);
    toast({ title: 'Defect saved' });
    navigate('/defects/raw-data');
  };

  const rawEntries = useMemo(() => Object.entries(record?.raw_payload ?? {}).slice(0, 80), [record]);
  if (!record) return <div className="text-sm text-muted-foreground">Loading defect...</div>;

  const inputClass = 'h-9';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><Button variant="outline" onClick={() => navigate(-1)}>Back</Button>{canEdit && <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>}</div>
      <Card><CardHeader><CardTitle>Defect Detail · {record.issue_no}</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">
        <Field field="issue_no" label={getLabel('issue_no')} value={form.issue_no} required={isFieldRequired('issue_no')} disabled onChange={(v) => updateField('issue_no', v)} />
        {isFieldVisible('subcontractor_issue_no') && <Field field="subcontractor_issue_no" label={getLabel('subcontractor_issue_no')} value={form.subcontractor_issue_no} required={isFieldRequired('subcontractor_issue_no')} disabled={!canEdit} onChange={(v) => updateField('subcontractor_issue_no', v)} />}
        {isFieldVisible('subcontractor_issue_source') && <Field field="subcontractor_issue_source" label={getLabel('subcontractor_issue_source')} value={form.subcontractor_issue_source} required={isFieldRequired('subcontractor_issue_source')} disabled={!canEdit} onChange={(v) => updateField('subcontractor_issue_source', v)} />}
        <Field label="Type" value={form.area_type} disabled={!canEdit} onChange={(v) => updateField('area_type', v)} />
        <Field label="Level" value={form.area_level} disabled={!canEdit} onChange={(v) => updateField('area_level', v)} />
        <Field label="Location" value={form.area_location} disabled={!canEdit} onChange={(v) => updateField('area_location', v)} />
        <Field label="Main Trade" value={form.main_trade} disabled={!canEdit} onChange={(v) => updateField('main_trade', v)} />
        <Field label="Sub Trade" value={form.sub_trade} disabled={!canEdit} onChange={(v) => updateField('sub_trade', v)} />
        <Field label="Subcontractor" value={form.subcontractor_name} disabled={!canEditResponsibility} onChange={(v) => updateField('subcontractor_name', v)} />
        <Field label="Sub-Sub" value={form.subsub_name} disabled={!canEditResponsibility} onChange={(v) => updateField('subsub_name', v)} />
        <Field label="HDEC PIC" value={form.hdec_pic_name} disabled={!canEditResponsibility} onChange={(v) => updateField('hdec_pic_name', v)} />
        <Field label="Planned Date" type="date" value={form.planned_date} disabled={!canEdit} onChange={(v) => updateField('planned_date', v)} />
        <Field label="Target Date" type="date" value={form.target_date} disabled={!canEdit} onChange={(v) => updateField('target_date', v)} />
        <Field label="Closed Date" type="date" value={form.closed_date} disabled={!canEdit} onChange={(v) => updateField('closed_date', v)} />
        <Field label="Actual Progress %" type="number" value={form.actual_progress_pct} disabled={!canEdit} onChange={(v) => updateField('actual_progress_pct', v === '' ? null : Number(v))} />
        <Field label="Closure Status" value={form.closure_status} disabled={!canEdit} onChange={(v) => updateField('closure_status', v)} />
        <div className="md:col-span-3 space-y-1"><label className="text-xs font-medium text-muted-foreground">Description</label><Textarea value={String(form.description ?? '')} disabled={!canEdit} onChange={(e) => updateField('description', e.target.value)} /></div>
        <div className="md:col-span-3 space-y-1"><label className="text-xs font-medium text-muted-foreground">Remarks</label><Textarea value={String(form.remarks ?? '')} disabled={!canEdit} onChange={(e) => updateField('remarks', e.target.value)} /></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Raw Payload</CardTitle></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-2">{rawEntries.map(([k, v]) => <div key={k} className="rounded-md border p-2 text-xs"><div className="text-muted-foreground">{k.replace(/\s*\(H\)\s*$/i, '')}</div><div className="font-medium">{String(v || '—')}</div></div>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Change History</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Old</TableHead><TableHead>New</TableHead><TableHead>Changed At</TableHead></TableRow></TableHeader><TableBody>{logs.map((log) => <TableRow key={log.id}><TableCell>{log.changed_field}</TableCell><TableCell>{log.old_value}</TableCell><TableCell>{log.new_value}</TableCell><TableCell>{new Date(log.changed_at).toLocaleString()}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </div>
  );
}

function Field({ label, value, onChange, disabled, type = 'text', required }: { field?: string; label: string; value: any; onChange: (value: string) => void; disabled?: boolean; type?: string; required?: boolean }) {
  return <div className="space-y-1"><label className="text-xs font-medium text-muted-foreground">{label}{required ? ' *' : ''}</label><Input className="h-9" type={type} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} /></div>;
}
