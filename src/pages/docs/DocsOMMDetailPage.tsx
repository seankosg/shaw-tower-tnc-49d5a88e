import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import { formatDateTimeDdMmmYyyy } from '@/lib/format';
import { OmmStatusBadge } from '@/components/docs/OmmStatusBadge';
import { OmmCopyQuantityCell } from '@/components/docs/OmmCopyQuantityCell';
import { OmmCycleProgress } from '@/components/docs/OmmCycleProgress';
import { useDocsFieldConfig } from '@/hooks/useDocsFieldConfig';
import { ALL_TEAMS, TEAM_LABELS, type TeamType } from '@/types/enums';
import { OMM_CATEGORY_LABELS } from '@/lib/docs-omm-status';
import { OmmComments } from '@/components/comments/OmmComments';
import { useCommonMasters, unionWithLegacy, type MasterOption } from '@/hooks/useCommonMasters';

const IDENTITY_FIELDS = [
  'sn',
  'category_group',
  'category',
  'team',
  'section',
  'trade',
  'subcontractor_name',
  'work_trade_material',
  'training_required',
  'hdec_pic_name',
  'hdec_eng_name',
] as const;

const QUANTITY_FIELDS = [
  'pdf_required_qty',
  'pdf_actual_qty',
  'hardcopy_required_qty',
  'hardcopy_actual_qty',
] as const;

const SUB1_FIELDS = [
  'sub1_planned_date',
  'sub1_actual_date',
  'sub1_response_date',
  'sub1_response_status',
] as const;

const SUB2_FIELDS = [
  'sub2_planned_date',
  'sub2_actual_date',
  'sub2_response_planned_date',
  'sub2_response_actual_date',
  'sub2_response_status',
] as const;

const SUB3_FIELDS = [
  'sub3_planned_date',
  'sub3_actual_date',
  'sub3_response_planned_date',
  'sub3_response_actual_date',
  'sub3_response_status',
] as const;

const FINAL_FIELDS = [
  'final_planned_date',
  'final_actual_date',
  'final_response_planned_date',
  'final_response_actual_date',
  'final_response_status',
] as const;

const WORKFLOW_FIELDS = [
  'instruction_date',
  ...SUB1_FIELDS,
  ...SUB2_FIELDS,
  ...SUB3_FIELDS,
  ...FINAL_FIELDS,
] as const;

const DATE_FIELDS = new Set<string>([
  'instruction_date',
  'sub1_planned_date',
  'sub1_actual_date',
  'sub1_response_date',
  'sub2_planned_date',
  'sub2_actual_date',
  'sub2_response_planned_date',
  'sub2_response_actual_date',
  'sub3_planned_date',
  'sub3_actual_date',
  'sub3_response_planned_date',
  'sub3_response_actual_date',
  'final_planned_date',
  'final_actual_date',
  'final_response_planned_date',
  'final_response_actual_date',
]);

const NUMBER_FIELDS = new Set<string>([
  'pdf_required_qty',
  'pdf_actual_qty',
  'hardcopy_required_qty',
  'hardcopy_actual_qty',
]);

const ABC_FIELDS = new Set<string>([
  'sub1_response_status',
  'sub2_response_status',
  'sub3_response_status',
  'final_response_status',
]);
const TRAINING_OPTIONS = ['Done', 'Not Yet', 'N/S'];

export default function DocsOMMDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, roles } = useAuth();
  const { toast } = useToast();
  const { getLabel, isFieldVisible, sortFieldNames, isFieldEditable } = useDocsFieldConfig('omm');

  const [row, setRow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  // Comments handled by <OmmComments />

  const masters = useCommonMasters();

  // Row-level edit permission — mirrors `docs_omm` RLS policy:
  //   admin / superuser / senior_user / user → all rows
  //   d_superuser → only when profile.team matches row.team
  //   guest / super_guest / no role → none
  const isPrivileged = roles.some((r) => ['admin', 'superuser', 'senior_user', 'user'].includes(r));
  const isDSuper = roles.includes('d_superuser');
  const rowTeam = (row as any)?.team ?? null;
  const teamMatches = !!profile?.team && !!rowTeam && profile.team === rowTeam;
  const canEditRow = isPrivileged || (isDSuper && teamMatches);

  // Per-field gate — combines row permission + field config `editable_to_roles`
  const canEditField = (field: string) => {
    if (!canEditRow) return false;
    return isFieldEditable(field, roles);
  };

  // Reason text for read-only banner
  const readOnlyReason = (() => {
    if (canEditRow) return null;
    if (isDSuper && rowTeam && profile?.team && !teamMatches) {
      return `Read-only — D.Super User can only edit OMM records of their own team (your team: ${profile.team}, this row: ${rowTeam}).`;
    }
    if (isDSuper && !profile?.team) {
      return 'Read-only — your profile has no team assigned. Contact admin.';
    }
    return 'Read-only — your role does not allow editing OMM records.';
  })();

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await (supabase as any).from('docs_omm').select('*').eq('id', id).maybeSingle();
    setRow(data);

    const logRes = await (supabase as any)
      .from('docs_change_log')
      .select('*')
      .eq('record_id', id)
      .eq('sub_module', 'omm')
      .order('changed_at', { ascending: false })
      .limit(50);
    setLogs(logRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Scroll to #comments anchor
  useEffect(() => {
    if (!row || location.hash !== '#comments') return;
    const t = window.setTimeout(() => {
      document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(t);
  }, [row, location.hash]);

  // Master options merged with current row's legacy values
  const subOptions = useMemo(
    () => unionWithLegacy(masters.subcontractorOptions, [row?.subcontractor_name]),
    [masters.subcontractorOptions, row?.subcontractor_name],
  );
  const picOptions = useMemo(
    () => unionWithLegacy(masters.hdecPicOptions, [row?.hdec_pic_name]),
    [masters.hdecPicOptions, row?.hdec_pic_name],
  );
  const engOptions = useMemo(
    () => unionWithLegacy(masters.hdecEngOptions, [row?.hdec_eng_name]),
    [masters.hdecEngOptions, row?.hdec_eng_name],
  );

  const save = async (field: string, value: any) => {
    if (!id || !row) return;
    if ((row as any)[field] === value) return;
    setSaving(true);
    const patch: any = { [field]: value, updated_by: user?.id ?? null };
    const { error } = await (supabase as any).from('docs_omm').update(patch).eq('id', id);
    setSaving(false);
    if (error) {
      const msg = /row-level security|policy|permission/i.test(error.message)
        ? 'You do not have permission to edit this record.'
        : error.message;
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved' });
    setRow({ ...row, [field]: value });
    // refresh change log
    const logRes = await (supabase as any)
      .from('docs_change_log')
      .select('*')
      .eq('record_id', id)
      .eq('sub_module', 'omm')
      .order('changed_at', { ascending: false })
      .limit(50);
    setLogs(logRes.data ?? []);
  };




  const visibleSorted = (fields: readonly string[]) =>
    sortFieldNames(fields.filter((f) => isFieldVisible(f)));

  const identitySorted = useMemo(() => visibleSorted(IDENTITY_FIELDS), [sortFieldNames, isFieldVisible]);
  const quantitySorted = useMemo(() => visibleSorted(QUANTITY_FIELDS), [sortFieldNames, isFieldVisible]);
  const workflowSorted = useMemo(() => visibleSorted(WORKFLOW_FIELDS), [sortFieldNames, isFieldVisible]);

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
        Loading…
      </div>
    );
  }
  if (!row) {
    return (
      <div className="p-8 text-center text-sm">
        <p>OMM record not found.</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigate('/docs/omm')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to OMM
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/docs/omm')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold">
          {row.sn ?? '—'} <span className="text-muted-foreground">— {row.work_trade_material ?? ''}</span>
        </h1>
        <OmmStatusBadge row={row} />
        {row.is_resubmission ? (
          <Badge variant="outline" className="text-[10px]">Resubmission #{row.resubmission_seq}</Badge>
        ) : null}
        <div className="ml-auto text-xs text-muted-foreground">
          Updated {formatDateTimeDdMmmYyyy(row.updated_at)}
        </div>
        <Button variant="outline" size="sm" onClick={() => document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })}>
          <MessageSquare className="h-4 w-4 mr-1" /> Comments
        </Button>
      </div>

      {readOnlyReason && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {readOnlyReason}
        </div>
      )}

      {/* Identity */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {identitySorted.map((f) => (
            <FieldEditor
              key={f}
              field={f}
              label={getLabel(f)}
              value={(row as any)[f]}
              disabled={!canEditField(f) || saving}
              onSave={(v) => save(f, v)}
              subOptions={subOptions}
              picOptions={picOptions}
              engOptions={engOptions}
            />
          ))}
        </CardContent>
      </Card>

      {/* Copy Quantities */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Copy Quantities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-6">
            <div>
              <Label className="text-xs">Readible PDF</Label>
              <OmmCopyQuantityCell required={row.pdf_required_qty} actual={row.pdf_actual_qty} label="PDF" />
            </div>
            <div>
              <Label className="text-xs">Hardcopy</Label>
              <OmmCopyQuantityCell required={row.hardcopy_required_qty} actual={row.hardcopy_actual_qty} label="HC" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
            {quantitySorted.map((f) => (
              <FieldEditor
                key={f}
                field={f}
                label={getLabel(f)}
                value={(row as any)[f]}
                disabled={!canEditField(f) || saving}
                onSave={(v) => save(f, v)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Workflow */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <OmmCycleProgress row={row} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t">
            {workflowSorted.map((f) => (
              <FieldEditor
                key={f}
                field={f}
                label={getLabel(f)}
                value={(row as any)[f]}
                disabled={!canEditField(f) || saving || (f === 'final_response_status' && (row.draft_response_status ?? '').toUpperCase() !== 'A')}
                onSave={(v) => save(f, v)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Remarks */}
      {isFieldVisible('remarks') && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">{getLabel('remarks')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              defaultValue={row.remarks ?? ''}
              disabled={!canEditField('remarks') || saving}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (row.remarks ?? '')) save('remarks', v || null);
              }}
              rows={3}
            />
          </CardContent>
        </Card>
      )}

      {/* Change History */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Change History</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No changes logged.</p>
          ) : (
            <div className="space-y-1 text-xs max-h-80 overflow-y-auto">
              {logs.map((l) => (
                <div key={l.id} className="grid grid-cols-[140px_140px_1fr] gap-2 border-b py-1">
                  <span className="text-muted-foreground">{formatDateTimeDdMmmYyyy(l.changed_at)}</span>
                  <span className="font-medium">{getLabel(l.changed_field) || l.changed_field}</span>
                  <span>
                    <span className="text-muted-foreground line-through">{l.old_value ?? '—'}</span>
                    {' → '}
                    <span>{l.new_value ?? '—'}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comments */}
      <Card id="comments">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Comments</CardTitle>
        </CardHeader>
        <CardContent>
          <OmmComments
            ommId={id!}
            ommTeam={(row as any)?.team ?? null}
            hdecPicName={(row as any)?.hdec_pic_name ?? null}
            hdecEngName={(row as any)?.hdec_eng_name ?? null}
            subcontractorName={(row as any)?.subcontractor_name ?? null}
            subsubName={(row as any)?.subsub_name ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Field editor ----------
interface FieldEditorProps {
  field: string;
  label: string;
  value: any;
  disabled?: boolean;
  onSave: (v: any) => void;
  subOptions?: MasterOption[];
  picOptions?: MasterOption[];
  engOptions?: MasterOption[];
}

function FieldEditor({ field, label, value, disabled, onSave, subOptions, picOptions, engOptions }: FieldEditorProps) {
  // Date
  if (DATE_FIELDS.has(field)) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Input
          type="date"
          className="h-8"
          defaultValue={value ?? ''}
          disabled={disabled}
          onBlur={(e) => {
            const v = e.target.value || null;
            if (v !== (value ?? null)) onSave(v);
          }}
        />
      </div>
    );
  }
  // Number
  if (NUMBER_FIELDS.has(field)) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Input
          type="number"
          className="h-8"
          defaultValue={value ?? ''}
          disabled={disabled}
          onBlur={(e) => {
            const raw = e.target.value;
            const v = raw === '' ? null : Number(raw);
            if (v !== (value ?? null)) onSave(v);
          }}
        />
      </div>
    );
  }
  // A/B/C status
  if (ABC_FIELDS.has(field)) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Select
          value={value ?? '__none__'}
          disabled={disabled}
          onValueChange={(v) => onSave(v === '__none__' ? null : v)}
        >
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            <SelectItem value="A">A</SelectItem>
            <SelectItem value="B">B</SelectItem>
            <SelectItem value="C">C</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  // Team
  if (field === 'team') {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Select
          value={value ?? '__none__'}
          disabled={disabled}
          onValueChange={(v) => onSave(v === '__none__' ? null : v)}
        >
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {ALL_TEAMS.map((t) => (
              <SelectItem key={t} value={t}>{TEAM_LABELS[t as TeamType]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  // Category Group
  if (field === 'category_group') {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Select
          value={value ?? '__none__'}
          disabled={disabled}
          onValueChange={(v) => onSave(v === '__none__' ? null : v)}
        >
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {Object.keys(OMM_CATEGORY_LABELS).map((k) => (
              <SelectItem key={k} value={k}>{OMM_CATEGORY_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  // Training required
  if (field === 'training_required') {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Select
          value={value ?? '__none__'}
          disabled={disabled}
          onValueChange={(v) => onSave(v === '__none__' ? null : v)}
        >
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {TRAINING_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  // Master-driven dropdowns (subcontractor / HDEC PIC / HDEC ENG)
  if (field === 'subcontractor_name' || field === 'hdec_pic_name' || field === 'hdec_eng_name') {
    const opts =
      field === 'subcontractor_name' ? subOptions : field === 'hdec_pic_name' ? picOptions : engOptions;
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Select
          value={value ?? '__none__'}
          disabled={disabled}
          onValueChange={(v) => onSave(v === '__none__' ? null : v)}
        >
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {(opts ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  // Default text
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        className="h-8"
        defaultValue={value ?? ''}
        disabled={disabled}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== (value ?? '')) onSave(v || null);
        }}
      />
    </div>
  );
}
