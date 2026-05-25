import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle, CheckCircle2, Plus, RotateCcw, Layers } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ALL_TEAMS, type TeamType } from '@/types/enums';
import type { Database } from '@/integrations/supabase/types';
import {
  PUNCH_GATE_STATUS, PUNCH_PROCUREMENT_STATUS, PUNCH_HEALTH_LABEL,
  PUNCH_GATE_LABEL, PUNCH_PROCUREMENT_LABEL,
  PUNCH_OVERRIDABLE_SET,
  SUBTASK_STAGES, SUBTASK_STAGE_LABEL,
  type PunchGateStatus, type PunchProcurementStatus, type PunchHealthStatus,
  type SubtaskStage,
} from '@/lib/punch-field-registry';
import { AddPunchSubtaskDialog } from '@/components/punch/AddPunchSubtaskDialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

type PunchItem = Database['public']['Tables']['punch_items']['Row'];
type PunchUpdate = Database['public']['Tables']['punch_items']['Update'];

const HEALTH_CLASS: Record<PunchHealthStatus, string> = {
  ahead: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  on_track: 'bg-blue-100 text-blue-900 border-blue-300',
  behind: 'bg-amber-100 text-amber-900 border-amber-300',
  critical: 'bg-red-100 text-red-900 border-red-300',
};

function OverrideBadge({
  isOverridden, meta, onRevert, disabled,
}: { isOverridden: boolean; meta?: any; onRevert: () => void; disabled?: boolean }) {
  if (!isOverridden) {
    return <Badge variant="outline" className="text-[9px] font-normal text-muted-foreground border-dashed">Auto</Badge>;
  }
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1">
            <Badge
              variant="outline"
              className="text-[9px] font-medium border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              ● Manual
            </Badge>
            <button
              type="button"
              disabled={disabled}
              onClick={onRevert}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              title="Revert to auto-calculated value"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div>Manually overridden</div>
          {meta?.at && <div className="text-muted-foreground">at {new Date(meta.at).toLocaleString()}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function FieldLabel({
  text, field, summary, overrideFields, onRevert, disabled,
}: {
  text: string;
  field: string;
  summary: boolean;
  overrideFields: Record<string, any>;
  onRevert: (f: string) => void;
  disabled?: boolean;
}) {
  if (!summary || !PUNCH_OVERRIDABLE_SET.has(field)) {
    return <Label className="text-xs">{text}</Label>;
  }
  const meta = overrideFields?.[field];
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs">{text}</Label>
      <OverrideBadge isOverridden={!!meta} meta={meta} onRevert={() => onRevert(field)} disabled={disabled} />
    </div>
  );
}

function GateCard({
  title, field, status, date, statusOptions, statusLabel,
  onStatusChange, onDateChange, disabled, summary, overrideFields, onRevert,
}: {
  title: string;
  field: string;
  status: string;
  date: string | null;
  statusOptions: readonly string[];
  statusLabel: Record<string, string>;
  onStatusChange: (v: string) => void;
  onDateChange: (v: string | null) => void;
  disabled?: boolean;
  summary: boolean;
  overrideFields: Record<string, any>;
  onRevert: (f: string) => void;
}) {
  const isApproved = status === 'approved' || status === 'secured';
  const isNotReq = status === 'not_required';
  const overridden = summary && !!overrideFields?.[field];
  return (
    <Card className={cn(
      'transition-colors',
      isApproved && 'border-emerald-300',
      !isApproved && !isNotReq && 'border-amber-300',
      overridden && 'ring-1 ring-amber-400',
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{title}</span>
          <div className="flex items-center gap-2">
            {isApproved && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            {!isApproved && !isNotReq && <AlertCircle className="h-4 w-4 text-amber-600" />}
            {summary && (
              <OverrideBadge isOverridden={overridden} meta={overrideFields?.[field]} onRevert={() => onRevert(field)} disabled={disabled} />
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Select value={status} onValueChange={onStatusChange} disabled={disabled}>
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {statusOptions.map((o) => (
              <SelectItem key={o} value={o}>{statusLabel[o]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          disabled={disabled}
          value={date ?? ''}
          onChange={(e) => onDateChange(e.target.value || null)}
          className="h-9"
        />
      </CardContent>
    </Card>
  );
}

export default function PunchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, roles } = useAuth();

  const [item, setItem] = useState<PunchItem | null>(null);
  const [draft, setDraft] = useState<PunchUpdate>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parent, setParent] = useState<{ id: string; item_no: string | null } | null>(null);
  const [children, setChildren] = useState<PunchItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const isReadOnlyRole = useMemo(() =>
    roles.length === 0 || roles.every((r) => r === 'guest' || r === 'super_guest'),
    [roles],
  );
  const isDSuperOutOfTeam = useMemo(() => {
    if (!item || !profile) return false;
    if (!roles.includes('d_superuser')) return false;
    if (roles.some((r) => r === 'admin' || r === 'superuser' || r === 'senior_user' || r === 'user')) return false;
    return profile.team !== item.team;
  }, [roles, profile, item]);
  const disabled = isReadOnlyRole || isDSuperOutOfTeam;

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.from('punch_items').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      toast({ title: 'Failed to load punch item', description: error?.message ?? 'Not found', variant: 'destructive' });
      setLoading(false); return;
    }
    setItem(data);
    setDraft({});
    if ((data as any).parent_id) {
      const { data: p } = await supabase.from('punch_items').select('id,item_no').eq('id', (data as any).parent_id).maybeSingle();
      setParent(p ?? null);
    } else {
      setParent(null);
    }
    if ((data as any).is_summary) {
      const { data: kids } = await supabase.from('punch_items').select('*').eq('parent_id', data.id).order('subtask_stage').order('item_no');
      setChildren(kids ?? []);
    } else {
      setChildren([]);
    }
    setLoading(false);
  }, [id, toast]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!item) return <div className="p-6 text-sm text-muted-foreground">Punch item not found.</div>;

  const merged = { ...item, ...draft } as PunchItem;
  const dirty = Object.keys(draft).length > 0;
  const isSummary = !!(item as any).is_summary;
  const overrideFields: Record<string, any> = ((item as any).override_fields as Record<string, any>) ?? {};
  const overrideCount = Object.keys(overrideFields).length;

  function patch<K extends keyof PunchUpdate>(field: K, value: PunchUpdate[K]) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function handleRevert(field: string) {
    if (!item) return;
    const { error } = await (supabase as any).rpc('revert_summary_field', {
      p_summary_id: item.id, p_field: field,
    });
    if (error) {
      toast({ title: 'Revert failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Reverted to auto', description: field });
    await reload();
  }

  async function handleSave() {
    if (!item || !dirty) return;
    setSaving(true);
    const fields = Object.keys(draft);
    const summaryOverrideFields = isSummary ? fields.filter((f) => PUNCH_OVERRIDABLE_SET.has(f)) : [];
    const normalFields = fields.filter((f) => !summaryOverrideFields.includes(f));

    // 1) override RPCs for any overridable fields touched on a Summary row
    for (const f of summaryOverrideFields) {
      const v = (draft as any)[f];
      const { error } = await (supabase as any).rpc('override_summary_field', {
        p_summary_id: item.id,
        p_field: f,
        p_value: v == null ? null : v,
      });
      if (error) {
        setSaving(false);
        toast({ title: 'Override failed', description: `${f}: ${error.message}`, variant: 'destructive' });
        return;
      }
    }

    // 2) regular update for the remaining fields (skip for summary if empty)
    if (normalFields.length > 0) {
      const updatePayload: any = {};
      for (const f of normalFields) updatePayload[f] = (draft as any)[f];
      updatePayload.updated_by = profile?.user_id ?? null;
      const { error, data, count } = await supabase
        .from('punch_items')
        .update(updatePayload, { count: 'exact' })
        .eq('id', item.id)
        .eq('row_version', item.row_version)
        .select('*')
        .maybeSingle();
      if (error) {
        setSaving(false);
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
        return;
      }
      if (count === 0 || !data) {
        setSaving(false);
        toast({ title: 'Conflict — reloading', variant: 'destructive' });
        await reload();
        return;
      }
    }

    setSaving(false);
    toast({ title: 'Saved' });
    await reload();
  }

  async function handleRevertAll() {
    if (!item) return;
    for (const f of Object.keys(overrideFields)) {
      await (supabase as any).rpc('revert_summary_field', { p_summary_id: item.id, p_field: f });
    }
    toast({ title: 'All overrides reverted' });
    await reload();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/punch/raw-data')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold truncate">{item.item_no || '—'}</h1>
              {isSummary && (
                <Badge variant="outline" className="text-[10px] border-primary/40 bg-primary/5 text-primary">
                  <Layers className="h-3 w-3 mr-1" /> Summary
                </Badge>
              )}
              {(item as any).subtask_stage && (
                <Badge variant="outline" className="text-[10px]">
                  {SUBTASK_STAGE_LABEL[(item as any).subtask_stage as SubtaskStage]}
                </Badge>
              )}
              {overrideCount > 0 && (
                <Badge variant="outline" className="text-[10px] border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  {overrideCount} Manual
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">{item.outstanding_work}</p>
            {parent && (
              <p className="text-[11px] text-muted-foreground">
                Parent: <Link to={`/punch/${parent.id}`} className="text-primary hover:underline">{parent.item_no ?? parent.id}</Link>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {merged.health_status && (
            <Badge variant="outline" className={cn('text-xs', HEALTH_CLASS[merged.health_status])}>
              {PUNCH_HEALTH_LABEL[merged.health_status]}
            </Badge>
          )}
          {!(item as any).parent_id && !disabled && (
            <Button onClick={() => setAddOpen(true)} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Subtask
            </Button>
          )}
          {isSummary && overrideCount > 0 && !disabled && (
            <Button onClick={handleRevertAll} variant="outline" size="sm">
              <RotateCcw className="h-4 w-4 mr-1" /> Revert all overrides
            </Button>
          )}
          <Button onClick={handleSave} disabled={!dirty || saving || disabled} size="sm">
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {disabled && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {isDSuperOutOfTeam
            ? `Read-only: this item belongs to team "${item.team}" but your team is "${profile?.team}".`
            : 'Read-only: your role does not have edit permission.'}
        </div>
      )}

      {isSummary && (
        <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          This is a <strong>Summary</strong>. Progress, dates and gates are auto-rolled-up from {children.length} subtask{children.length === 1 ? '' : 's'}. Edit any of those fields to override; revert with the ↺ button.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Identity & Classification</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Item No</Label><Input value={merged.item_no ?? ''} onChange={(e) => patch('item_no', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">Critical Level</Label><Input value={merged.critical_level ?? ''} onChange={(e) => patch('critical_level', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div className="col-span-2"><Label className="text-xs">Outstanding Work</Label><Textarea value={merged.outstanding_work ?? ''} onChange={(e) => patch('outstanding_work', e.target.value)} disabled={disabled} rows={2} /></div>
              <div><Label className="text-xs">Category 1</Label><Input value={merged.category1 ?? ''} onChange={(e) => patch('category1', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">Category 2</Label><Input value={merged.category2 ?? ''} onChange={(e) => patch('category2', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">Category 3</Label><Input value={merged.category3 ?? ''} onChange={(e) => patch('category3', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">Work Type</Label><Input value={merged.work_type ?? ''} onChange={(e) => patch('work_type', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">Level</Label><Input value={merged.level ?? ''} onChange={(e) => patch('level', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">Location</Label><Input value={merged.location ?? ''} onChange={(e) => patch('location', e.target.value || null)} disabled={disabled} className="h-9" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">People & Team</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Team</Label>
                <Select value={merged.team ?? ''} onValueChange={(v) => patch('team', (v || null) as TeamType | null)} disabled={disabled}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {ALL_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Subcontractor</Label><Input value={merged.subcontractor_name ?? ''} onChange={(e) => patch('subcontractor_name', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">Sub-Sub</Label><Input value={merged.subsub_name ?? ''} onChange={(e) => patch('subsub_name', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">HDEC PIC</Label><Input value={merged.hdec_pic_name ?? ''} onChange={(e) => patch('hdec_pic_name', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">HDEC Engineer</Label><Input value={merged.hdec_eng_name ?? ''} onChange={(e) => patch('hdec_eng_name', e.target.value || null)} disabled={disabled} className="h-9" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Schedule & Progress</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel text="Planned Start" field="planned_start_date" summary={isSummary} overrideFields={overrideFields} onRevert={handleRevert} disabled={disabled} />
                <Input type="date" value={merged.planned_start_date ?? ''} onChange={(e) => patch('planned_start_date', e.target.value || null)} disabled={disabled} className={cn('h-9', isSummary && overrideFields.planned_start_date && 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30')} />
              </div>
              <div>
                <FieldLabel text="Actual Start" field="actual_start_date" summary={isSummary} overrideFields={overrideFields} onRevert={handleRevert} disabled={disabled} />
                <Input type="date" value={merged.actual_start_date ?? ''} onChange={(e) => patch('actual_start_date', e.target.value || null)} disabled={disabled} className={cn('h-9', isSummary && overrideFields.actual_start_date && 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30')} />
              </div>
              <div>
                <FieldLabel text="Planned Completion" field="planned_completion_date" summary={isSummary} overrideFields={overrideFields} onRevert={handleRevert} disabled={disabled} />
                <Input type="date" value={merged.planned_completion_date ?? ''} onChange={(e) => patch('planned_completion_date', e.target.value || null)} disabled={disabled} className={cn('h-9', isSummary && overrideFields.planned_completion_date && 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30')} />
              </div>
              <div>
                <FieldLabel text="Actual Completion" field="actual_completion_date" summary={isSummary} overrideFields={overrideFields} onRevert={handleRevert} disabled={disabled} />
                <Input type="date" value={merged.actual_completion_date ?? ''} onChange={(e) => patch('actual_completion_date', e.target.value || null)} disabled={disabled} className={cn('h-9', isSummary && overrideFields.actual_completion_date && 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30')} />
              </div>
              <div>
                <FieldLabel text="Planned %" field="planned_progress_pct" summary={isSummary} overrideFields={overrideFields} onRevert={handleRevert} disabled={disabled} />
                <Input
                  type="number" step="0.1" min="0" max="100"
                  value={merged.planned_progress_pct ?? ''}
                  onChange={(e) => patch('planned_progress_pct', e.target.value === '' ? null : Number(e.target.value))}
                  disabled={disabled || (!isSummary)}
                  className={cn('h-9', !isSummary && 'bg-muted', isSummary && overrideFields.planned_progress_pct && 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30')}
                />
              </div>
              <div>
                <FieldLabel text="Actual %" field="actual_progress_pct" summary={isSummary} overrideFields={overrideFields} onRevert={handleRevert} disabled={disabled} />
                <Input
                  type="number" step="0.1" min="0" max="100"
                  value={merged.actual_progress_pct ?? ''}
                  onChange={(e) => patch('actual_progress_pct', e.target.value === '' ? null : Number(e.target.value))}
                  disabled={disabled}
                  className={cn('h-9', isSummary && overrideFields.actual_progress_pct && 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30')}
                />
              </div>
              <div>
                <Label className="text-xs">Variance %</Label>
                <Input value={merged.progress_variance_pct?.toFixed(1) ?? ''} disabled className="h-9 bg-muted" />
              </div>
              <div><Label className="text-xs">Completion Status</Label><Input value={merged.completion_status ?? ''} onChange={(e) => patch('completion_status', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">Data Date</Label><Input type="date" value={merged.data_date ?? ''} onChange={(e) => patch('data_date', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">Weight</Label><Input type="number" step="0.01" value={merged.weight ?? 1} onChange={(e) => patch('weight', Number(e.target.value))} disabled={disabled || isSummary} className={cn('h-9', isSummary && 'bg-muted')} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Remarks</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={merged.remarks ?? ''} onChange={(e) => patch('remarks', e.target.value || null)} disabled={disabled} rows={3} />
            </CardContent>
          </Card>

          {isSummary && children.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Subtasks ({children.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {SUBTASK_STAGES.map((s) => {
                  const inStage = children
                    .filter((c) => (c as any).subtask_stage === s)
                    .sort((a, b) => {
                      const da = a.planned_start_date ?? '';
                      const db = b.planned_start_date ?? '';
                      if (!da && !db) return 0;
                      if (!da) return 1; // NULL last
                      if (!db) return -1;
                      return da.localeCompare(db);
                    });
                  if (inStage.length === 0) return null;
                  return (
                    <div key={s}>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{SUBTASK_STAGE_LABEL[s]}</Badge>
                        <span className="text-xs text-muted-foreground">{inStage.length}</span>
                      </div>
                      <div className="space-y-1">
                        {inStage.map((c) => (
                          <Link
                            key={c.id}
                            to={`/punch/${c.id}`}
                            className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs hover:bg-muted/50"
                          >
                            <span className="flex-1 truncate">
                              <span className="font-mono text-muted-foreground mr-2">{c.item_no}</span>
                              {c.outstanding_work}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {c.actual_progress_pct == null ? '—' : `${Number(c.actual_progress_pct).toFixed(0)}%`}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pre-Engineering Gates</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <GateCard
                title="Material Approval" field="material_approval_status"
                status={merged.material_approval_status} date={merged.material_approval_date}
                statusOptions={PUNCH_GATE_STATUS} statusLabel={PUNCH_GATE_LABEL}
                onStatusChange={(v) => patch('material_approval_status', v as PunchGateStatus)}
                onDateChange={(v) => patch('material_approval_date', v)}
                disabled={disabled} summary={isSummary} overrideFields={overrideFields} onRevert={handleRevert}
              />
              <GateCard
                title="Material Procurement" field="material_procurement_status"
                status={merged.material_procurement_status} date={merged.material_procurement_date}
                statusOptions={PUNCH_PROCUREMENT_STATUS} statusLabel={PUNCH_PROCUREMENT_LABEL}
                onStatusChange={(v) => patch('material_procurement_status', v as PunchProcurementStatus)}
                onDateChange={(v) => patch('material_procurement_date', v)}
                disabled={disabled} summary={isSummary} overrideFields={overrideFields} onRevert={handleRevert}
              />
              <GateCard
                title="Drawing Approval" field="drawing_approval_status"
                status={merged.drawing_approval_status} date={merged.drawing_approval_date}
                statusOptions={PUNCH_GATE_STATUS} statusLabel={PUNCH_GATE_LABEL}
                onStatusChange={(v) => patch('drawing_approval_status', v as PunchGateStatus)}
                onDateChange={(v) => patch('drawing_approval_date', v)}
                disabled={disabled} summary={isSummary} overrideFields={overrideFields} onRevert={handleRevert}
              />
              <GateCard
                title="MOS Approval" field="mos_approval_status"
                status={merged.mos_approval_status} date={merged.mos_approval_date}
                statusOptions={PUNCH_GATE_STATUS} statusLabel={PUNCH_GATE_LABEL}
                onStatusChange={(v) => patch('mos_approval_status', v as PunchGateStatus)}
                onDateChange={(v) => patch('mos_approval_date', v)}
                disabled={disabled} summary={isSummary} overrideFields={overrideFields} onRevert={handleRevert}
              />

              {(merged.pre_engineering_blockers?.length ?? 0) > 0 && (
                <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <div className="font-medium mb-1">Blockers</div>
                  <div className="flex flex-wrap gap-1">
                    {merged.pre_engineering_blockers.map((b) => (
                      <Badge key={b} variant="outline" className="text-[10px] border-amber-400 bg-amber-100/60 dark:bg-amber-950/40">{b}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AddPunchSubtaskDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        parentId={item.id}
        parentItemNo={item.item_no}
        parentTeam={item.team as TeamType | null}
        parentIsSummary={isSummary}
        defaults={(() => {
          // If there are existing subtasks, prefill from the one with latest planned_start_date.
          // Otherwise, fall back to the parent (Summary) values.
          const sortedKids = [...children]
            .filter((c) => c.planned_start_date)
            .sort((a, b) => (b.planned_start_date ?? '').localeCompare(a.planned_start_date ?? ''));
          const src = sortedKids[0] ?? item;
          return {
            outstanding_work: src.outstanding_work,
            location: src.location,
            main_trade: src.main_trade,
            sub_trade: src.sub_trade,
            work_type: src.work_type,
            team: (src.team ?? null) as TeamType | null,
            planned_start_date: src.planned_start_date,
            planned_completion_date: src.planned_completion_date,
            weight: src.weight == null ? null : String(src.weight),
            remarks: src.remarks,
          };
        })()}
        onCreated={(newId) => navigate(`/punch/${newId}`)}
      />

    </div>
  );
}
