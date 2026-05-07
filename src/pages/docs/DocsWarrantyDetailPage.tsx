import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useDocsFieldConfig } from '@/hooks/useDocsFieldConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatDateTimeDdMmmYyyy } from '@/lib/format';
import {
  WarrantyCycleProgress,
} from '@/components/docs/WarrantyCycleProgress';
import {
  WARRANTY_STATUS_BADGE,
  computeWarrantyOverallStatus,
  WARRANTY_OVERALL_STATUS_COLOR,
  type WarrantyStatusToken,
} from '@/lib/docs-warranty-status';

interface WarrantyComment {
  id: string;
  warranty_item_id: string;
  author_user_id: string;
  parent_comment_id: string | null;
  type: string;
  message: string;
  recipients: string[];
  edited: boolean;
  created_at: string;
  updated_at: string;
}

const STATUS_FIELDS = new Set([
  'draft_status',
  'subcon_signing_status',
  'hdec_signing_status',
  'final_status',
]);

const DATE_FIELDS = new Set([
  'r_subcontract_date',
  'draft_planned_date',
  'draft_actual_date',
  'draft_response_planned_date',
  'draft_response_actual_date',
  'subcon_signing_planned_date',
  'subcon_signing_actual_date',
  'hdec_signing_planned_date',
  'hdec_signing_actual_date',
  'final_planned_date',
  'final_actual_date',
]);

const NUMBER_FIELDS = new Set(['warranty_period_years']);

const STATUS_OPTIONS: WarrantyStatusToken[] = ['A', 'B', 'C', 'UR', 'WIP', 'Planned'];

const IDENTITY_FIELDS = [
  'item_no', 'category', 'warranted_item', 'team',
  'subcontractor_name', 'hdec_pic_name', 'hdec_eng_name',
  'warranty_period_years', 'contract_spec_ref',
] as const;

const SCHEDULE_R_FIELDS = [
  'r_subcontract_date', 'r_works_description', 'r_acra_reg_no',
  'r_acra_address', 'r_brief_description', 'r_director_1',
  'r_director_2', 'r_witness', 'acra_info_status',
] as const;

const STAGE_GROUPS: Array<{ title: string; fields: string[] }> = [
  {
    title: 'Draft',
    fields: ['draft_planned_date', 'draft_actual_date', 'draft_response_planned_date', 'draft_response_actual_date', 'draft_status'],
  },
  {
    title: 'Subcontractor Signing',
    fields: ['subcon_signing_planned_date', 'subcon_signing_actual_date', 'subcon_signing_status'],
  },
  {
    title: 'HDEC Signing',
    fields: ['hdec_signing_planned_date', 'hdec_signing_actual_date', 'hdec_signing_status'],
  },
  {
    title: 'Final',
    fields: ['final_planned_date', 'final_actual_date', 'final_status'],
  },
];

export default function DocsWarrantyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, roles } = useAuth();
  const { toast } = useToast();
  const { getLabel, isFieldVisible, isFieldEditable } = useDocsFieldConfig('warranty');

  const [row, setRow] = useState<any | null>(null);
  const [siblings, setSiblings] = useState<any[]>([]);
  const [comments, setComments] = useState<WarrantyComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isPrivileged = roles.some((r) => ['admin', 'superuser', 'senior_user'].includes(r));
  const isDSuper = roles.includes('d_superuser');
  const teamMatches = !!profile?.team && !!row?.team && profile.team === row.team;
  const canEditRow = isPrivileged || (isDSuper && teamMatches);
  const canEditField = (field: string) => canEditRow && isFieldEditable(field, roles);
  const canModifyComments = roles.some((r) => ['admin', 'superuser'].includes(r));

  const [editingComment, setEditingComment] = useState<WarrantyComment | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [editCreatedAt, setEditCreatedAt] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const toLocalInput = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const reloadComments = async () => {
    if (!id) return;
    const cmtRes = await (supabase as any)
      .from('warranty_comments')
      .select('*')
      .eq('warranty_item_id', id)
      .order('created_at', { ascending: true });
    setComments((cmtRes.data ?? []) as WarrantyComment[]);
  };

  const openEdit = (c: WarrantyComment) => {
    setEditingComment(c);
    setEditMessage(c.message.replace(/\s*<!--\s*migrated_from_thread:[^>]+-->\s*$/g, '').trim());
    setEditCreatedAt(toLocalInput(c.created_at));
  };

  const saveEdit = async () => {
    if (!editingComment) return;
    const msg = editMessage.trim();
    if (!msg || !editCreatedAt) {
      toast({ title: 'Message and date are required', variant: 'destructive' });
      return;
    }
    setEditSaving(true);
    const { error } = await (supabase as any).from('warranty_comments').update({
      message: msg,
      created_at: new Date(editCreatedAt).toISOString(),
      edited: true,
    }).eq('id', editingComment.id);
    setEditSaving(false);
    if (error) {
      const friendly = /row-level security|policy|permission/i.test(error.message)
        ? 'You do not have permission to edit this comment.'
        : error.message;
      toast({ title: 'Update failed', description: friendly, variant: 'destructive' });
      return;
    }
    toast({ title: 'Comment updated' });
    setEditingComment(null);
    await reloadComments();
  };

  const deleteComment = async (c: WarrantyComment) => {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    const { error } = await (supabase as any).from('warranty_comments').delete().eq('id', c.id);
    if (error) {
      const friendly = /row-level security|policy|permission/i.test(error.message)
        ? 'You do not have permission to delete this comment.'
        : error.message;
      toast({ title: 'Delete failed', description: friendly, variant: 'destructive' });
      return;
    }
    toast({ title: 'Comment deleted' });
    await reloadComments();
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await (supabase as any).from('warranty_items').select('*').eq('id', id).maybeSingle();
    if (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    setRow(data);

    if (data) {
      const [sibRes, cmtRes, logRes] = await Promise.all([
        (supabase as any).from('warranty_items')
          .select('id, item_no, resubmission_seq, is_resubmission, parent_id, current_stage, current_status')
          .eq('item_no', data.item_no).eq('is_active', true)
          .order('resubmission_seq', { ascending: true }),
        (supabase as any).from('warranty_comments')
          .select('*').eq('warranty_item_id', id).order('created_at', { ascending: true }),
        (supabase as any).from('docs_change_log')
          .select('*').eq('record_id', id).eq('sub_module', 'warranty')
          .order('changed_at', { ascending: false }).limit(50),
      ]);
      setSiblings(sibRes.data ?? []);
      setComments((cmtRes.data ?? []) as WarrantyComment[]);
      setLogs(logRes.data ?? []);
    }
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

  const addComment = async () => {
    if (!id || !newComment.trim() || !user) return;
    const { error } = await (supabase as any).from('warranty_comments').insert({
      warranty_item_id: id,
      author_user_id: user.id,
      message: newComment.trim(),
      type: 'comment',
    });
    if (error) {
      toast({ title: 'Comment failed', description: error.message, variant: 'destructive' });
      return;
    }
    setNewComment('');
    const cmtRes = await (supabase as any)
      .from('warranty_comments')
      .select('*')
      .eq('warranty_item_id', id)
      .order('created_at', { ascending: true });
    setComments((cmtRes.data ?? []) as WarrantyComment[]);
  };

  const save = async (field: string, value: any) => {
    if (!id || !row) return;
    if ((row as any)[field] === value) return;
    setSaving(true);
    const patch: any = { [field]: value, updated_by: user?.id ?? null };
    const { error } = await (supabase as any).from('warranty_items').update(patch).eq('id', id);
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
  };

  const overall = useMemo(() => row ? computeWarrantyOverallStatus(row) : null, [row]);

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
        <p>Warranty record not found.</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigate('/docs/warranty')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Warranty
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/docs/warranty')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold">
          #{row.item_no} <span className="text-muted-foreground">— {row.warranted_item ?? ''}</span>
        </h1>
        {overall && (
          <Badge variant="outline" className={cn('text-[11px]', WARRANTY_OVERALL_STATUS_COLOR[overall])}>
            {overall}
          </Badge>
        )}
        {row.is_resubmission ? (
          <Badge variant="outline" className="text-[10px]">Resubmission #{row.resubmission_seq}</Badge>
        ) : null}
        <div className="ml-auto text-xs text-muted-foreground">
          Updated {formatDateTimeDdMmmYyyy(row.updated_at)}
        </div>
        <Button variant="outline" size="sm" onClick={() => document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })}>
          <MessageSquare className="h-4 w-4 mr-1" /> Comments
          {comments.length > 0 && <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[10px]">{comments.length}</Badge>}
        </Button>
      </div>

      {!canEditRow && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Read-only — your role does not allow editing this Warranty record.
        </div>
      )}

      {/* Resubmission siblings */}
      {siblings.length > 1 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Resubmission History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {siblings.map((s) => (
                <button
                  key={s.id}
                  className={cn(
                    'rounded border px-2 py-1 text-xs hover:bg-muted/50',
                    s.id === row.id && 'bg-primary text-primary-foreground border-primary',
                  )}
                  onClick={() => navigate(`/docs/warranty/${s.id}`)}
                >
                  {s.is_resubmission ? `#${s.item_no}·${s.resubmission_seq}` : `#${s.item_no} (Original)`}
                  {s.current_status && <span className="ml-1 opacity-70">— {s.current_status}</span>}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Identity */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {IDENTITY_FIELDS.filter(isFieldVisible).map((f) => (
            <FieldEditor
              key={f} field={f} label={getLabel(f)}
              value={(row as any)[f]}
              disabled={!canEditField(f) || saving || f === 'item_no'}
              onSave={(v) => save(f, v)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Workflow */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <WarrantyCycleProgress row={row} />
          {STAGE_GROUPS.map((g) => {
            const fields = g.fields.filter(isFieldVisible);
            if (fields.length === 0) return null;
            return (
              <div key={g.title} className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {fields.map((f) => (
                    <FieldEditor
                      key={f} field={f} label={getLabel(f)}
                      value={(row as any)[f]}
                      disabled={!canEditField(f) || saving}
                      onSave={(v) => save(f, v)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Schedule R */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Schedule R (ACRA / Subcontract)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {SCHEDULE_R_FIELDS.filter(isFieldVisible).map((f) => (
            <FieldEditor
              key={f} field={f} label={getLabel(f)}
              value={(row as any)[f]}
              disabled={!canEditField(f) || saving}
              onSave={(v) => save(f, v)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Comments (includes migrated discussion threads) */}
      <Card id="comments">
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comments <span className="text-muted-foreground font-normal">({comments.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="rounded border p-2 text-xs">
              <div className="text-muted-foreground">{formatDateTimeDdMmmYyyy(c.created_at)}</div>
              <div className="mt-1 whitespace-pre-wrap">{c.message.replace(/\s*<!--\s*migrated_from_thread:[^>]+-->\s*$/g, '').trim()}</div>
            </div>
          ))}
          <div className="flex gap-2 pt-2 border-t">
            <Input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment…"
              disabled={!user}
            />
            <Button size="sm" onClick={addComment} disabled={!newComment.trim() || saving || !user}>
              Post
            </Button>
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function FieldEditor({
  field, label, value, disabled, onSave,
}: { field: string; label: string; value: any; disabled?: boolean; onSave: (v: any) => void }) {
  if (DATE_FIELDS.has(field)) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Input
          type="date" className="h-8" defaultValue={value ?? ''} disabled={disabled}
          onBlur={(e) => { const v = e.target.value || null; if (v !== (value ?? null)) onSave(v); }}
        />
      </div>
    );
  }
  if (NUMBER_FIELDS.has(field)) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Input
          type="number" className="h-8" defaultValue={value ?? ''} disabled={disabled}
          onBlur={(e) => { const raw = e.target.value; const v = raw === '' ? null : Number(raw); if (v !== (value ?? null)) onSave(v); }}
        />
      </div>
    );
  }
  if (STATUS_FIELDS.has(field)) {
    return (
      <div>
        <Label className="text-xs">{label}</Label>
        <Select value={value ?? '__none__'} disabled={disabled} onValueChange={(v) => onSave(v === '__none__' ? null : v)}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">—</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] border', WARRANTY_STATUS_BADGE[s])}>{s}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  // Long text
  if (field === 'r_works_description' || field === 'r_brief_description' || field === 'r_acra_address') {
    return (
      <div className="md:col-span-2">
        <Label className="text-xs">{label}</Label>
        <Textarea
          defaultValue={value ?? ''} disabled={disabled} rows={2}
          onBlur={(e) => { const v = e.target.value.trim(); if (v !== (value ?? '')) onSave(v || null); }}
        />
      </div>
    );
  }
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        className="h-8" defaultValue={value ?? ''} disabled={disabled}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (value ?? '')) onSave(v || null); }}
      />
    </div>
  );
}

