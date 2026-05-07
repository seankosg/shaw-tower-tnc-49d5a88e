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
import { useDocsFieldConfig } from '@/hooks/useDocsFieldConfig';
import { ALL_TEAMS, TEAM_LABELS, type TeamType } from '@/types/enums';
import {
  SPARE_PART_STATUS_BADGE_VARIANT,
  SPARE_PART_CATEGORY_LABELS,
  normalizeSparePartStatus,
} from '@/lib/docs-spare-part-status';
import { SparePartComments } from '@/components/comments/SparePartComments';
import { useCommonMasters, unionWithLegacy, type MasterOption } from '@/hooks/useCommonMasters';

const OVERVIEW_FIELDS = ['category', 'sn', 'parent_item', 'material', 'spec_ref', 'status'] as const;
const REQUIREMENTS_FIELDS = ['spares_requirements', 'unit', 'spares_quantity', 'storage_area_required'] as const;
const ASSIGNMENT_FIELDS = ['team', 'trade', 'subcontractor_name', 'hdec_pic_name', 'hdec_eng_name'] as const;

const CATEGORY_FIELDS = new Set<string>(['category']);
const STATUS_FIELDS = new Set<string>(['status']);

export default function DocsSparePartDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, roles } = useAuth();
  const { toast } = useToast();
  const { getLabel, isFieldVisible, sortFieldNames, isFieldEditable } = useDocsFieldConfig('spare_part');

  const [row, setRow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  const masters = useCommonMasters();

  const isPrivileged = roles.some((r) => ['admin', 'superuser', 'senior_user', 'user'].includes(r));
  const isDSuper = roles.includes('d_superuser');
  const rowTeam = row?.team ?? null;
  const teamMatches = !!profile?.team && !!rowTeam && profile.team === rowTeam;
  const canEditRow = isPrivileged || (isDSuper && teamMatches);

  const canEditField = (field: string) => {
    if (!canEditRow) return false;
    return isFieldEditable(field, roles);
  };

  const readOnlyReason = (() => {
    if (canEditRow) return null;
    if (isDSuper && rowTeam && profile?.team && !teamMatches) {
      return `Read-only — D.Super User can only edit Spare Part records of their own team (your team: ${profile.team}, this row: ${rowTeam}).`;
    }
    if (isDSuper && !profile?.team) {
      return 'Read-only — your profile has no team assigned. Contact admin.';
    }
    return 'Read-only — your role does not allow editing Spare Part records.';
  })();

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await (supabase as any).from('docs_spare_part').select('*').eq('id', id).maybeSingle();
    setRow(data);
    const logRes = await (supabase as any)
      .from('docs_change_log')
      .select('*')
      .eq('record_id', id)
      .eq('sub_module', 'spare_part')
      .order('changed_at', { ascending: false })
      .limit(50);
    setLogs(logRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    if (!row || location.hash !== '#comments') return;
    const t = window.setTimeout(() => {
      document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => window.clearTimeout(t);
  }, [row, location.hash]);

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
    if (row[field] === value) return;
    setSaving(true);
    const patch: any = { [field]: value, updated_by: user?.id ?? null };
    const { error } = await (supabase as any).from('docs_spare_part').update(patch).eq('id', id);
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
    const logRes = await (supabase as any)
      .from('docs_change_log')
      .select('*')
      .eq('record_id', id)
      .eq('sub_module', 'spare_part')
      .order('changed_at', { ascending: false })
      .limit(50);
    setLogs(logRes.data ?? []);
  };

  const visibleSorted = (fields: readonly string[]) =>
    sortFieldNames(fields.filter((f) => isFieldVisible(f)));

  const overviewSorted = useMemo(() => visibleSorted(OVERVIEW_FIELDS), [sortFieldNames, isFieldVisible]);
  const requirementsSorted = useMemo(() => visibleSorted(REQUIREMENTS_FIELDS), [sortFieldNames, isFieldVisible]);
  const assignmentSorted = useMemo(() => visibleSorted(ASSIGNMENT_FIELDS), [sortFieldNames, isFieldVisible]);

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
        <p>Spare Part record not found.</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigate('/docs/spare-part')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Spare Parts
        </Button>
      </div>
    );
  }

  const statusNorm = normalizeSparePartStatus(row.status);

  return (
    <div className="space-y-4 p-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/docs/spare-part')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold">
          {row.sn ?? '—'}
          {row.parent_item ? <span className="text-muted-foreground"> — {row.parent_item}</span> : null}
        </h1>
        {row.category ? (
          <Badge variant="outline" className="text-[10px]">
            {row.category} {SPARE_PART_CATEGORY_LABELS[row.category] ?? ''}
          </Badge>
        ) : null}
        {row.status ? (
          <Badge variant={SPARE_PART_STATUS_BADGE_VARIANT[statusNorm]} className="text-[10px]">
            {row.status}
          </Badge>
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

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Overview</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {overviewSorted.map((f) => (
            <FieldEditor
              key={f}
              field={f}
              label={getLabel(f)}
              value={row[f]}
              disabled={!canEditField(f) || saving}
              onSave={(v) => save(f, v)}
              subOptions={subOptions}
              picOptions={picOptions}
              engOptions={engOptions}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Spare Requirements</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {requirementsSorted.map((f) => (
            <FieldEditor
              key={f}
              field={f}
              label={getLabel(f)}
              value={row[f]}
              disabled={!canEditField(f) || saving}
              onSave={(v) => save(f, v)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Assignment</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {assignmentSorted.map((f) => (
            <FieldEditor
              key={f}
              field={f}
              label={getLabel(f)}
              value={row[f]}
              disabled={!canEditField(f) || saving}
              onSave={(v) => save(f, v)}
              subOptions={subOptions}
              picOptions={picOptions}
              engOptions={engOptions}
            />
          ))}
        </CardContent>
      </Card>

      {isFieldVisible('remarks') && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm">{getLabel('remarks')}</CardTitle></CardHeader>
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

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Change History</CardTitle></CardHeader>
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

      <Card id="comments">
        <CardHeader className="py-3"><CardTitle className="text-sm">Comments</CardTitle></CardHeader>
        <CardContent>
          <SparePartComments
            sparePartId={id!}
            sparePartTeam={row?.team ?? null}
            hdecPicName={row?.hdec_pic_name ?? null}
            hdecEngName={row?.hdec_eng_name ?? null}
            subcontractorName={row?.subcontractor_name ?? null}
            subsubName={null}
          />
        </CardContent>
      </Card>
    </div>
  );
}

interface FieldEditorProps {
  field: string;
  label: string;
  value: any;
  disabled?: boolean;
  onSave: (v: any) => void;
  subOptions?: SuggestOption[];
  picOptions?: SuggestOption[];
  engOptions?: SuggestOption[];
}

function FieldEditor({ field, label, value, disabled, onSave, subOptions, picOptions, engOptions }: FieldEditorProps) {
  if (CATEGORY_FIELDS.has(field)) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Select value={value ?? '__none__'} disabled={disabled} onValueChange={(v) => onSave(v === '__none__' ? null : v)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {Object.keys(SPARE_PART_CATEGORY_LABELS).map((k) => (
              <SelectItem key={k} value={k}>{k} — {SPARE_PART_CATEGORY_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (STATUS_FIELDS.has(field)) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Input
          className="h-8"
          defaultValue={value ?? ''}
          disabled={disabled}
          placeholder="e.g. Ordered, In Stock, Pending, Short"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (value ?? '')) onSave(v || null);
          }}
        />
      </div>
    );
  }
  if (field === 'team') {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Select value={value ?? '__none__'} disabled={disabled} onValueChange={(v) => onSave(v === '__none__' ? null : v)}>
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
  if (field === 'subcontractor_name' || field === 'hdec_pic_name' || field === 'hdec_eng_name') {
    const opts = field === 'subcontractor_name' ? subOptions : field === 'hdec_pic_name' ? picOptions : engOptions;
    return (
      <div>
        <SuggestField
          label={label}
          value={value ?? ''}
          options={(opts ?? []).map((o) => o.name)}
          disabled={disabled}
          onChange={(v) => onSave(v && v.trim() ? v.trim() : null)}
        />
      </div>
    );
  }
  if (field === 'spares_requirements' || field === 'storage_area_required') {
    return (
      <div className="md:col-span-2">
        <Label className="text-xs">{label}</Label>
        <Textarea
          className="min-h-[64px] text-sm"
          defaultValue={value ?? ''}
          disabled={disabled}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (value ?? '')) onSave(v || null);
          }}
          rows={2}
        />
      </div>
    );
  }
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
