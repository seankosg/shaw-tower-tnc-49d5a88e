import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
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
  type PunchGateStatus, type PunchProcurementStatus, type PunchHealthStatus,
} from '@/lib/punch-field-registry';

type PunchItem = Database['public']['Tables']['punch_items']['Row'];
type PunchUpdate = Database['public']['Tables']['punch_items']['Update'];

const HEALTH_CLASS: Record<PunchHealthStatus, string> = {
  ahead: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  on_track: 'bg-blue-100 text-blue-900 border-blue-300',
  behind: 'bg-amber-100 text-amber-900 border-amber-300',
  critical: 'bg-red-100 text-red-900 border-red-300',
};

function DateInput({
  value, onChange, disabled,
}: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  return (
    <Input
      type="date"
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-9"
    />
  );
}

function GateCard({
  title, status, date, statusOptions, statusLabel, onStatusChange, onDateChange, disabled,
}: {
  title: string;
  status: string;
  date: string | null;
  statusOptions: readonly string[];
  statusLabel: Record<string, string>;
  onStatusChange: (v: string) => void;
  onDateChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const isApproved = status === 'approved' || status === 'secured';
  const isNotReq = status === 'not_required';
  return (
    <Card className={cn('transition-colors', isApproved && 'border-emerald-300', !isApproved && !isNotReq && 'border-amber-300')}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{title}</span>
          {isApproved && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          {!isApproved && !isNotReq && <AlertCircle className="h-4 w-4 text-amber-600" />}
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
        <DateInput value={date} onChange={onDateChange} disabled={disabled} />
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

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from('punch_items').select('*').eq('id', id).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast({ title: 'Failed to load punch item', description: error?.message ?? 'Not found', variant: 'destructive' });
        setLoading(false);
        return;
      }
      setItem(data);
      setDraft({});
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, toast]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!item) return <div className="p-6 text-sm text-muted-foreground">Punch item not found.</div>;

  const merged = { ...item, ...draft } as PunchItem;
  const dirty = Object.keys(draft).length > 0;

  function patch<K extends keyof PunchUpdate>(field: K, value: PunchUpdate[K]) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function handleSave() {
    if (!item || !dirty) return;
    setSaving(true);
    const { data, error, count } = await supabase
      .from('punch_items')
      .update({ ...draft, updated_by: profile?.user_id ?? null }, { count: 'exact' })
      .eq('id', item.id)
      .eq('row_version', item.row_version)
      .select('*')
      .maybeSingle();
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    if (count === 0 || !data) {
      toast({
        title: 'Conflict detected',
        description: 'Another user updated this item. Reloading latest version.',
        variant: 'destructive',
      });
      const { data: fresh } = await supabase.from('punch_items').select('*').eq('id', item.id).maybeSingle();
      if (fresh) setItem(fresh);
      setDraft({});
      return;
    }
    setItem(data);
    setDraft({});
    toast({ title: 'Saved' });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/punch/raw-data')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-lg font-semibold">{item.item_no || '—'}</h1>
            <p className="text-xs text-muted-foreground line-clamp-1">{item.outstanding_work}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {merged.health_status && (
            <Badge variant="outline" className={cn('text-xs', HEALTH_CLASS[merged.health_status])}>
              {PUNCH_HEALTH_LABEL[merged.health_status]}
            </Badge>
          )}
          {merged.pre_engineering_ready
            ? <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-xs">Pre-Eng Ready</Badge>
            : <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-xs">Pre-Eng Blocked</Badge>}
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
              <div><Label className="text-xs">Planned Start</Label><DateInput value={merged.planned_start_date} onChange={(v) => patch('planned_start_date', v)} disabled={disabled} /></div>
              <div><Label className="text-xs">Actual Start</Label><DateInput value={merged.actual_start_date} onChange={(v) => patch('actual_start_date', v)} disabled={disabled} /></div>
              <div><Label className="text-xs">Planned Completion</Label><DateInput value={merged.planned_completion_date} onChange={(v) => patch('planned_completion_date', v)} disabled={disabled} /></div>
              <div><Label className="text-xs">Actual Completion</Label><DateInput value={merged.actual_completion_date} onChange={(v) => patch('actual_completion_date', v)} disabled={disabled} /></div>
              <div>
                <Label className="text-xs">Planned %</Label>
                <Input value={merged.planned_progress_pct?.toFixed(1) ?? ''} disabled className="h-9 bg-muted" />
              </div>
              <div>
                <Label className="text-xs">Actual %</Label>
                <Input
                  type="number" step="0.1" min="0" max="100"
                  value={merged.actual_progress_pct ?? ''}
                  onChange={(e) => patch('actual_progress_pct', e.target.value === '' ? null : Number(e.target.value))}
                  disabled={disabled}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Variance %</Label>
                <Input value={merged.progress_variance_pct?.toFixed(1) ?? ''} disabled className="h-9 bg-muted" />
              </div>
              <div><Label className="text-xs">Completion Status</Label><Input value={merged.completion_status ?? ''} onChange={(e) => patch('completion_status', e.target.value || null)} disabled={disabled} className="h-9" /></div>
              <div><Label className="text-xs">Data Date</Label><DateInput value={merged.data_date} onChange={(v) => patch('data_date', v)} disabled={disabled} /></div>
              <div><Label className="text-xs">Weight</Label><Input type="number" step="0.01" value={merged.weight ?? 1} onChange={(e) => patch('weight', Number(e.target.value))} disabled={disabled} className="h-9" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Remarks</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={merged.remarks ?? ''} onChange={(e) => patch('remarks', e.target.value || null)} disabled={disabled} rows={3} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Pre-Engineering Gates</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <GateCard
                title="Material Approval"
                status={merged.material_approval_status}
                date={merged.material_approval_date}
                statusOptions={PUNCH_GATE_STATUS}
                statusLabel={PUNCH_GATE_LABEL}
                onStatusChange={(v) => patch('material_approval_status', v as PunchGateStatus)}
                onDateChange={(v) => patch('material_approval_date', v)}
                disabled={disabled}
              />
              <GateCard
                title="Material Procurement"
                status={merged.material_procurement_status}
                date={merged.material_procurement_date}
                statusOptions={PUNCH_PROCUREMENT_STATUS}
                statusLabel={PUNCH_PROCUREMENT_LABEL}
                onStatusChange={(v) => patch('material_procurement_status', v as PunchProcurementStatus)}
                onDateChange={(v) => patch('material_procurement_date', v)}
                disabled={disabled}
              />
              <GateCard
                title="Drawing Approval"
                status={merged.drawing_approval_status}
                date={merged.drawing_approval_date}
                statusOptions={PUNCH_GATE_STATUS}
                statusLabel={PUNCH_GATE_LABEL}
                onStatusChange={(v) => patch('drawing_approval_status', v as PunchGateStatus)}
                onDateChange={(v) => patch('drawing_approval_date', v)}
                disabled={disabled}
              />
              <GateCard
                title="MOS Approval"
                status={merged.mos_approval_status}
                date={merged.mos_approval_date}
                statusOptions={PUNCH_GATE_STATUS}
                statusLabel={PUNCH_GATE_LABEL}
                onStatusChange={(v) => patch('mos_approval_status', v as PunchGateStatus)}
                onDateChange={(v) => patch('mos_approval_date', v)}
                disabled={disabled}
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
    </div>
  );
}
