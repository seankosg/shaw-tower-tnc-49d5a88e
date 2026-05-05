import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useDocsFieldConfig } from '@/hooks/useDocsFieldConfig';
import { useLatestDocsDataDate } from '@/hooks/useLatestDocsDataDate';
import { useAppSetting } from '@/hooks/useAppSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { computeRisk } from '@/lib/docs-risk';
import { computeOverallStatus, computeIsClosed, clearCyclesAfterClosure, applyCycleAutoFill, CYCLE_DATA_FIELDS } from '@/lib/docs-status';
import { TRADE_OPTIONS, resolveTrade } from '@/lib/docs-trade';
import { ALL_TEAMS, TEAM_LABELS } from '@/types/enums';
import { formatDateTimeDdMmmYyyy, formatDdMmmYyyy } from '@/lib/format';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────
interface DocsDrawing {
  id: string;
  project_id: string;
  sub_module: string;
  document_no: string;
  revision: string | null;
  title: string | null;
  trade: string | null;
  team: string | null;
  discipline: string | null;
  sheet_name: string | null;
  series: string | null;
  level_location: string | null;
  sequential_no: string | null;
  document_type: string | null;
  organisation_raw: string | null;
  subcontractor_id: string | null;
  subcontractor_name: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  aconex_status: string | null;
  current_status: string | null;
  is_submitted: boolean;
  transmittal_number: string | null;
  transmittal_due_date: string | null;
  days_due: number | null;
  submitted_date: string | null;
  approved_date: string | null;
  sub1_planned_date: string | null;
  sub1_submission_date: string | null;
  sub1_approval_date: string | null;
  sub1_actual_response_date: string | null;
  sub1_approval_status: string | null;
  sub2_planned_date: string | null;
  sub2_submission_date: string | null;
  sub2_approval_date: string | null;
  sub2_actual_response_date: string | null;
  sub2_approval_status: string | null;
  sub3_planned_date: string | null;
  sub3_submission_date: string | null;
  sub3_approval_date: string | null;
  sub3_actual_response_date: string | null;
  sub3_approval_status: string | null;
  remarks: string | null;
  raw_payload: Record<string, unknown> | null;
  row_version: number;
  updated_at: string | null;
  created_at: string | null;
}

interface ChangeLog {
  id: string;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  change_source: string | null;
  changed_by: string | null;
  changed_at: string;
}

type SubMaster = { id: string; name: string };

// Editable fields (mapped to docs_drawings columns)
const EDITABLE_FIELDS = [
  'revision', 'title',
  'trade', 'team', 'discipline', 'sheet_name',
  'series', 'level_location', 'sequential_no',
  'document_type',
  'organisation_raw', 'subcontractor_id', 'subcontractor_name',
  'hdec_pic_name', 'hdec_eng_name',
  'aconex_status', 'current_status', 'is_submitted',
  'transmittal_number', 'transmittal_due_date',
  'submitted_date', 'approved_date',
  'sub1_planned_date', 'sub1_submission_date', 'sub1_approval_date', 'sub1_actual_response_date', 'sub1_approval_status',
  'sub2_planned_date', 'sub2_submission_date', 'sub2_approval_date', 'sub2_actual_response_date', 'sub2_approval_status',
  'sub3_planned_date', 'sub3_submission_date', 'sub3_approval_date', 'sub3_actual_response_date', 'sub3_approval_status',
  'remarks',
] as const;

const APPROVAL_STATUS_OPTIONS = ['A', 'B', 'C', 'UR', 'WIP'];

// ─── Helpers ──────────────────────────────────────────────────────────────
function toDateInput(value: unknown): string {
  if (value == null || value === '') return '';
  const text = String(value);
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text)?.[1];
  if (iso) return iso;
  const d = new Date(text);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function formatMaybeDate(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value !== 'string') return String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? formatDdMmmYyyy(value) : value;
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function DocsDrawingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { toast } = useToast();
  const { isFieldVisible, getLabel } = useDocsFieldConfig();
  const { dataDate } = useLatestDocsDataDate('as_built');
  const { value: leadDays } = useAppSetting<number>('docs_lead_days_as_built', 30);

  const canEdit = useMemo(
    () => roles.some((r) => ['admin', 'superuser', 'd_superuser', 'senior_user', 'user'].includes(r)),
    [roles],
  );

  const [record, setRecord] = useState<DocsDrawing | null>(null);
  const [form, setForm] = useState<Partial<DocsDrawing>>({});
  const [logs, setLogs] = useState<ChangeLog[]>([]);
  const [scDate, setScDate] = useState<string | null>(null);
  const [subOptions, setSubOptions] = useState<SubMaster[]>([]);
  const [statusPool, setStatusPool] = useState<{
    aconex_status: string[];
    current_status: string[];
    document_type: string[];
    discipline: string[];
    series: string[];
    organisation_raw: string[];
    hdec_pic_name: string[];
    hdec_eng_name: string[];
  }>({
    aconex_status: [], current_status: [], document_type: [], discipline: [],
    series: [], organisation_raw: [], hdec_pic_name: [], hdec_eng_name: [],
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load drawing + change log
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [drawRes, logRes] = await Promise.all([
        (supabase as any).from('docs_drawings').select('*').eq('id', id).maybeSingle(),
        (supabase as any).from('docs_change_log').select('*').eq('drawing_id', id).order('changed_at', { ascending: false }).limit(50),
      ]);
      if (cancelled) return;
      const data = drawRes.data as DocsDrawing | null;
      setRecord(data);
      setForm(data ? { ...data } : {});
      setLogs((logRes.data ?? []) as ChangeLog[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Load Substantial Completion date for risk computation
  useEffect(() => {
    if (!record?.project_id) return;
    (async () => {
      const { data } = await supabase.from('app_settings').select('value').eq('key', `docs_sc_date_${record.project_id}`).maybeSingle();
      if (data && typeof data.value === 'string') setScDate(data.value);
    })();
  }, [record?.project_id]);

  // Load subcontractor master + suggestion pools (project-scoped distinct values)
  useEffect(() => {
    if (!record?.project_id) return;
    let cancelled = false;
    (async () => {
      const [subRes, poolRes] = await Promise.all([
        (supabase as any).from('subcontractor_master').select('id, name, type').eq('is_active', true).order('name'),
        (supabase as any)
          .from('docs_drawings')
          .select('aconex_status, current_status, document_type, discipline, series, organisation_raw, hdec_pic_name, hdec_eng_name')
          .eq('project_id', record.project_id)
          .eq('is_active', true)
          .limit(5000),
      ]);
      if (cancelled) return;
      const allSubs = ((subRes.data ?? []) as Array<SubMaster & { type: string }>)
        .filter((r) => r.type === 'sub' || r.type === 'subsub')
        .map(({ id: sid, name }) => ({ id: sid, name }));
      setSubOptions(allSubs);

      const collect = (key: keyof typeof statusPool) => {
        const set = new Set<string>();
        for (const row of (poolRes.data ?? []) as any[]) {
          const v = (row?.[key] ?? '').toString().trim();
          if (v) set.add(v);
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
      };
      setStatusPool({
        aconex_status: collect('aconex_status'),
        current_status: collect('current_status'),
        document_type: collect('document_type'),
        discipline: collect('discipline'),
        series: collect('series'),
        organisation_raw: collect('organisation_raw'),
        hdec_pic_name: collect('hdec_pic_name'),
        hdec_eng_name: collect('hdec_eng_name'),
      });
    })();
    return () => { cancelled = true; };
  }, [record?.project_id]);

  const updateField = <K extends keyof DocsDrawing>(field: K, value: DocsDrawing[K]) =>
    setForm((cur) => ({ ...cur, [field]: value }));

  const handleSubcontractorChange = (subId: string | null) => {
    if (subId == null) {
      setForm((cur) => ({ ...cur, subcontractor_id: null, subcontractor_name: null }));
      return;
    }
    const match = subOptions.find((s) => s.id === subId);
    setForm((cur) => ({
      ...cur,
      subcontractor_id: subId,
      subcontractor_name: match?.name ?? cur.subcontractor_name ?? null,
    }));
  };

  const handleSave = async () => {
    if (!record || !user || !canEdit) return;
    setSaving(true);

    // Build payload + diff
    const payload: any = {
      row_version: record.row_version + 1,
      updated_by: user.id,
      data_source_type: 'app_direct_input',
    };
    const changes: { field: string; oldValue: any; newValue: any; source: string }[] = [];

    // 1) Collect user-edited values into payload.
    for (const field of EDITABLE_FIELDS) {
      const next = (form as any)[field];
      const normalized = next === '' || next === undefined ? null : next;
      payload[field] = normalized;
    }

    // 2a) Auto-fill cycle planned/approval dates (S_N+7 → A_N, R_N+7 → P_{N+1} on B/C).
    //     Fills empty values only — user-entered values are preserved.
    // 2b) Auto-clear later cycles when an earlier cycle is 'A' (cleanup wins over auto-fill).
    const filled = applyCycleAutoFill({ ...record, ...payload });
    const cleaned = clearCyclesAfterClosure(filled);
    for (const n of [1, 2, 3] as const) {
      for (const f of CYCLE_DATA_FIELDS) {
        const key = `sub${n}_${f}`;
        payload[key] = (cleaned as any)[key] ?? null;
      }
    }

    // 2c) Auto-sync current_status to computed Overall Status (single source of truth).
    payload.current_status = computeOverallStatus(cleaned as any, dataDate);

    // 3) Diff against the original record (so cleanup-driven nullifications log too).
    for (const field of EDITABLE_FIELDS) {
      const prev = (record as any)[field] ?? null;
      const newVal = payload[field] ?? null;
      const prevStr = prev == null ? '' : String(prev);
      const nextStr = newVal == null ? '' : String(newVal);
      if (prevStr === nextStr) continue;
      const isCycleField = /^sub[123]_/.test(field);
      // If user did NOT edit this field but it changed via cleanup/auto-fill, mark source.
      const userVal = (form as any)[field];
      const userNorm = userVal === '' || userVal === undefined ? null : userVal;
      const userTouched = String(userNorm ?? '') !== prevStr;
      let source = 'app_direct_input';
      if (!userTouched && isCycleField) {
        source = newVal == null ? 'auto_close_cleanup' : 'auto_fill';
      }
      changes.push({ field, oldValue: prev, newValue: newVal, source });
    }

    const { error } = await (supabase as any).from('docs_drawings').update(payload).eq('id', record.id);
    if (error) {
      setSaving(false);
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }

    if (changes.length > 0) {
      await (supabase as any).from('docs_change_log').insert(
        changes.map(({ field, oldValue, newValue, source }) => ({
          drawing_id: record.id,
          changed_field: field,
          old_value: oldValue == null ? null : String(oldValue),
          new_value: newValue == null ? null : String(newValue),
          change_source: source,
          changed_by: user.id,
        })),
      );
    }

    // Reload
    const [drawRes, logRes] = await Promise.all([
      (supabase as any).from('docs_drawings').select('*').eq('id', record.id).maybeSingle(),
      (supabase as any).from('docs_change_log').select('*').eq('drawing_id', record.id).order('changed_at', { ascending: false }).limit(50),
    ]);
    const fresh = drawRes.data as DocsDrawing | null;
    if (fresh) { setRecord(fresh); setForm({ ...fresh }); }
    setLogs((logRes.data ?? []) as ChangeLog[]);
    setSaving(false);
    toast({ title: 'Saved', description: changes.length > 0 ? `${changes.length} field(s) updated.` : 'No changes detected.' });
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!record) return <div className="p-6 text-sm text-muted-foreground">Drawing not found.</div>;

  const risk = computeRisk(form.is_submitted ?? record.is_submitted, scDate, leadDays ?? 30);
  const overallStatus = computeOverallStatus(form as any, dataDate);
  const isClosed = computeIsClosed(form as any);
  const tradeDerived = resolveTrade(form as any);

  // Build Subcontractor Select options preserving legacy values
  const subSelectOptions = (() => {
    const list = subOptions.map((s) => ({ value: s.id, label: s.name }));
    const curId = form.subcontractor_id ?? '';
    if (curId && !subOptions.some((s) => s.id === curId)) {
      list.unshift({ value: curId, label: form.subcontractor_name ?? '(legacy)' });
    }
    return list;
  })();

  // Raw payload entries (read-only)
  const rawEntries = Object.entries(record.raw_payload ?? {}).slice(0, 80);

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/docs/raw-data'); }}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>
        {canEdit && (
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        )}
      </div>

      {/* Item Detail Card */}
      <Card className={cn(isClosed && 'bg-muted/40 border-muted')}>
        <CardHeader>
          <CardTitle className={cn('flex flex-wrap items-center gap-x-6 gap-y-2 text-lg', isClosed && 'text-muted-foreground')}>
            <span className="font-mono">ITEM DETAIL — {record.document_no}</span>
            {isClosed && (
              <Badge className="bg-muted text-muted-foreground hover:bg-muted text-[10px] uppercase tracking-wide">Closed</Badge>
            )}
            <Badge className={cn('text-[10px]',
              risk === 'red' ? 'bg-red-100 text-red-800 hover:bg-red-100'
              : risk === 'amber' ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
              : 'bg-green-100 text-green-800 hover:bg-green-100',
              isClosed && 'opacity-60',
            )}>RISK: {risk.toUpperCase()}</Badge>
            <Badge variant="outline" className="text-[10px]">Overall: {overallStatus}</Badge>
            <Badge variant="outline" className="text-[10px]">Trade (derived): {tradeDerived}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Identification */}
          <Section title="Identification">
            <ReadonlyField label={getLabel('document_no')} value={record.document_no} />
            <Field label={getLabel('revision')} value={form.revision} disabled={!canEdit} onChange={(v) => updateField('revision', v)} />
            {isFieldVisible('title') && <Field label={getLabel('title')} value={form.title} disabled={!canEdit} onChange={(v) => updateField('title', v)} />}
            {isFieldVisible('series') && <Field label={getLabel('series')} value={form.series} disabled={!canEdit} onChange={(v) => updateField('series', v)} />}
            {isFieldVisible('level_location') && <Field label={getLabel('level_location')} value={form.level_location} disabled={!canEdit} onChange={(v) => updateField('level_location', v)} />}
            {isFieldVisible('sequential_no') && <Field label={getLabel('sequential_no')} value={form.sequential_no} disabled={!canEdit} onChange={(v) => updateField('sequential_no', v)} />}
          </Section>

          {/* Classification */}
          <Section title="Classification">
            {isFieldVisible('trade') && (
              <SelectField
                label={getLabel('trade')}
                value={form.trade}
                options={TRADE_OPTIONS.map((t) => ({ value: t, label: t }))}
                disabled={!canEdit}
                onChange={(v) => updateField('trade', v)}
              />
            )}
            {isFieldVisible('discipline') && (
              <SelectField label={getLabel('discipline')} value={form.discipline} options={statusPool.discipline.map((v) => ({ value: v, label: v }))} disabled={!canEdit} onChange={(v) => updateField('discipline', v)} allowFreeText />
            )}
            {isFieldVisible('team') && (
              <SelectField
                label={getLabel('team') || 'Team'}
                value={form.team}
                options={ALL_TEAMS.map((t) => ({ value: t, label: TEAM_LABELS[t] }))}
                disabled={!canEdit}
                onChange={(v) => updateField('team', v)}
              />
            )}
            {isFieldVisible('sheet_name') && <Field label={getLabel('sheet_name')} value={form.sheet_name} disabled={!canEdit} onChange={(v) => updateField('sheet_name', v)} />}
            {isFieldVisible('document_type') && (
              <SelectField label={getLabel('document_type')} value={form.document_type} options={statusPool.document_type.map((v) => ({ value: v, label: v }))} disabled={!canEdit} onChange={(v) => updateField('document_type', v)} allowFreeText />
            )}
          </Section>

          {/* Cycle / Status */}
          <Section title="Cycle / Status">
            {isFieldVisible('aconex_status') && (
              <SelectField label={getLabel('aconex_status')} value={form.aconex_status} options={statusPool.aconex_status.map((v) => ({ value: v, label: v }))} disabled={!canEdit} onChange={(v) => updateField('aconex_status', v)} allowFreeText />
            )}
            {isFieldVisible('current_status') && (
              <SelectField label={getLabel('current_status')} value={form.current_status} options={statusPool.current_status.map((v) => ({ value: v, label: v }))} disabled={!canEdit} onChange={(v) => updateField('current_status', v)} allowFreeText />
            )}
            {isFieldVisible('is_submitted') && (
              <SelectField
                label={getLabel('is_submitted')}
                value={form.is_submitted == null ? null : (form.is_submitted ? 'true' : 'false')}
                options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
                disabled={!canEdit}
                onChange={(v) => updateField('is_submitted', (v === 'true') as any)}
                clearable={false}
              />
            )}
            {isFieldVisible('transmittal_number') && <Field label={getLabel('transmittal_number')} value={form.transmittal_number} disabled={!canEdit} onChange={(v) => updateField('transmittal_number', v)} />}
            {isFieldVisible('transmittal_due_date') && <Field type="date" label={getLabel('transmittal_due_date')} value={toDateInput(form.transmittal_due_date)} disabled={!canEdit} onChange={(v) => updateField('transmittal_due_date', v)} />}
            <ReadonlyField label={getLabel('days_due')} value={record.days_due} />
          </Section>

          {/* Parties */}
          <Section title="Parties">
            {isFieldVisible('organisation_raw') && (
              <SelectField label={getLabel('organisation_raw')} value={form.organisation_raw} options={statusPool.organisation_raw.map((v) => ({ value: v, label: v }))} disabled={!canEdit} onChange={(v) => updateField('organisation_raw', v)} allowFreeText />
            )}
            {isFieldVisible('subcontractor_name') && (
              <SelectField
                label={getLabel('subcontractor_name')}
                value={form.subcontractor_id}
                options={subSelectOptions}
                disabled={!canEdit}
                onChange={(v) => handleSubcontractorChange(v)}
              />
            )}
            {isFieldVisible('hdec_pic_name') && (
              <SelectField label={getLabel('hdec_pic_name')} value={form.hdec_pic_name} options={statusPool.hdec_pic_name.map((v) => ({ value: v, label: v }))} disabled={!canEdit} onChange={(v) => updateField('hdec_pic_name', v)} allowFreeText />
            )}
            {isFieldVisible('hdec_eng_name') && (
              <SelectField label={getLabel('hdec_eng_name')} value={form.hdec_eng_name} options={statusPool.hdec_eng_name.map((v) => ({ value: v, label: v }))} disabled={!canEdit} onChange={(v) => updateField('hdec_eng_name', v)} allowFreeText />
            )}
          </Section>

          {/* Submission cycles */}
          {[1, 2, 3].map((n) => (
            <Section key={n} title={`Submission ${n}`}>
              <Field type="date" label={getLabel(`sub${n}_planned_date`)} value={toDateInput((form as any)[`sub${n}_planned_date`])} disabled={!canEdit} onChange={(v) => updateField(`sub${n}_planned_date` as any, v)} />
              <Field type="date" label={getLabel(`sub${n}_submission_date`)} value={toDateInput((form as any)[`sub${n}_submission_date`])} disabled={!canEdit} onChange={(v) => updateField(`sub${n}_submission_date` as any, v)} />
              <Field type="date" label={getLabel(`sub${n}_approval_date`)} value={toDateInput((form as any)[`sub${n}_approval_date`])} disabled={!canEdit} onChange={(v) => updateField(`sub${n}_approval_date` as any, v)} />
              <Field type="date" label={getLabel(`sub${n}_actual_response_date`)} value={toDateInput((form as any)[`sub${n}_actual_response_date`])} disabled={!canEdit} onChange={(v) => updateField(`sub${n}_actual_response_date` as any, v)} />
              <SelectField
                label={getLabel(`sub${n}_approval_status`)}
                value={(form as any)[`sub${n}_approval_status`]}
                options={APPROVAL_STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
                disabled={!canEdit}
                onChange={(v) => updateField(`sub${n}_approval_status` as any, v)}
              />
            </Section>
          ))}

          {/* Dates */}
          <Section title="Dates">
            {isFieldVisible('submitted_date') && <Field type="date" label={getLabel('submitted_date')} value={toDateInput(form.submitted_date)} disabled={!canEdit} onChange={(v) => updateField('submitted_date', v)} />}
            {isFieldVisible('approved_date') && <Field type="date" label={getLabel('approved_date')} value={toDateInput(form.approved_date)} disabled={!canEdit} onChange={(v) => updateField('approved_date', v)} />}
          </Section>

          {/* Remarks */}
          {isFieldVisible('remarks') && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{getLabel('remarks')}</label>
              <Textarea
                value={String(form.remarks ?? '')}
                disabled={!canEdit}
                onChange={(e) => updateField('remarks', e.target.value)}
                rows={3}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Raw Payload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Raw Payload
            <Badge variant="outline" className="text-[10px]">Aconex</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rawEntries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No raw payload data.</div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {rawEntries.map(([k, v]) => (
                <div key={k} className="rounded-md border p-2 text-xs">
                  <div className="text-muted-foreground">{k}</div>
                  <div className="font-medium break-words">{v == null || v === '' ? '—' : String(v)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change History Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change History</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No change history.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Field</TableHead>
                  <TableHead>Old</TableHead>
                  <TableHead>New</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Changed At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{log.changed_field}</TableCell>
                    <TableCell className="text-xs">{formatMaybeDate(log.old_value)}</TableCell>
                    <TableCell className="text-xs">{formatMaybeDate(log.new_value)}</TableCell>
                    <TableCell className="text-xs">{log.change_source ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTimeDdMmmYyyy(log.changed_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="grid gap-3 md:grid-cols-3">{children}</div>
    </div>
  );
}

function Field({
  label, value, onChange, disabled, type = 'text',
}: {
  label: string; value: any; onChange: (value: string) => void; disabled?: boolean; type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input className="h-9" type={type} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-foreground">
        {value == null || value === '' ? '—' : String(value)}
      </div>
    </div>
  );
}

const NONE_TOKEN = '__none__';

function SelectField({
  label, value, options, onChange, disabled, allowFreeText = false, clearable = true,
}: {
  label: string;
  value: any;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
  disabled?: boolean;
  allowFreeText?: boolean;
  clearable?: boolean;
}) {
  // If allowFreeText and current value isn't in options, prepend it so it's preserved
  const cur = value == null || value === '' ? NONE_TOKEN : String(value);
  const list = (() => {
    if (cur !== NONE_TOKEN && allowFreeText && !options.some((o) => o.value === cur)) {
      return [{ value: cur, label: cur }, ...options];
    }
    return options;
  })();
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={cur} onValueChange={(v) => onChange(v === NONE_TOKEN ? null : v)} disabled={disabled}>
        <SelectTrigger className={cn('h-9', disabled && 'bg-muted text-foreground')}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent className="max-h-72 bg-popover">
          {clearable && <SelectItem value={NONE_TOKEN}>— None —</SelectItem>}
          {list.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
