import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { formatDdMmm } from '@/lib/format';
import { OmmStatusBadge } from '@/components/docs/OmmStatusBadge';
import { OmmCopyQuantityCell } from '@/components/docs/OmmCopyQuantityCell';

export default function DocsOMMDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [row, setRow] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await (supabase as any).from('docs_omm').select('*').eq('id', id).maybeSingle();
    setRow(data);
    const { data: cmts } = await (supabase as any)
      .from('omm_comments').select('*').eq('omm_id', id).order('created_at', { ascending: true });
    setComments(cmts ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  const save = async (patch: any) => {
    if (!id) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from('docs_omm').update({ ...patch, updated_by: user?.id ?? null }).eq('id', id);
    setSaving(false);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Saved' }); load(); }
  };

  const addComment = async () => {
    if (!id || !newComment.trim() || !user) return;
    const { error } = await (supabase as any).from('omm_comments').insert({
      omm_id: id, author_user_id: user.id, message: newComment.trim(), type: 'comment',
    });
    if (error) toast({ title: 'Comment failed', description: error.message, variant: 'destructive' });
    else { setNewComment(''); load(); }
  };

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</div>;
  if (!row) return <div className="p-8 text-center text-sm">OMM record not found.</div>;

  return (
    <div className="space-y-4 p-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/docs/omm')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-semibold">{row.sn} — {row.work_trade_material ?? ''}</h1>
        <OmmStatusBadge row={row} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Identity</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="SN" value={row.sn} />
          <Field label="Category Group" value={row.category_group} />
          <Field label="Category (Team)" value={row.category} />
          <Field label="Section" value={row.section} />
          <Field label="Subcontractor" value={row.subcontractor_name} />
          <Field label="Training Required" value={row.training_required} />
          <Field label="HDEC PIC" value={row.hdec_pic_name} />
          <Field label="HDEC Eng" value={row.hdec_eng_name} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Copy Quantities</CardTitle></CardHeader>
        <CardContent className="flex gap-4 text-sm">
          <div>
            <Label className="text-xs">Readible PDF</Label>
            <OmmCopyQuantityCell required={row.pdf_required_qty} actual={row.pdf_actual_qty} label="PDF" />
          </div>
          <div>
            <Label className="text-xs">Hardcopy</Label>
            <OmmCopyQuantityCell required={row.hardcopy_required_qty} actual={row.hardcopy_actual_qty} label="HC" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Workflow</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Instruction Date" value={formatDdMmm(row.instruction_date)} />
          <Field label="Draft Planned" value={formatDdMmm(row.draft_planned_date)} />
          <Field label="Draft Actual" value={formatDdMmm(row.draft_actual_date)} />
          <Field label="Draft Response" value={formatDdMmm(row.draft_response_date)} />
          <div>
            <Label className="text-xs">Draft Resp Status</Label>
            <Select value={row.draft_response_status ?? '__none__'}
              onValueChange={(v) => save({ draft_response_status: v === '__none__' ? null : v })}>
              <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Field label="Final Planned" value={formatDdMmm(row.final_planned_date)} />
          <Field label="Final Actual" value={formatDdMmm(row.final_actual_date)} />
          <Field label="Final Resp Planned" value={formatDdMmm(row.final_response_planned_date)} />
          <Field label="Final Resp Actual" value={formatDdMmm(row.final_response_actual_date)} />
          <div>
            <Label className="text-xs">Final Resp Status</Label>
            <Select
              value={row.final_response_status ?? '__none__'}
              onValueChange={(v) => save({ final_response_status: v === '__none__' ? null : v })}
              disabled={row.draft_response_status !== 'A'}
            >
              <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Remarks</CardTitle></CardHeader>
        <CardContent>
          <Textarea defaultValue={row.remarks ?? ''} onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (row.remarks ?? '')) save({ remarks: v || null });
          }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Comments</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
          {comments.map((c) => (
            <div key={c.id} className="rounded border p-2 text-xs">
              <div className="text-muted-foreground">{new Date(c.created_at).toLocaleString()}</div>
              <div className="mt-1 whitespace-pre-wrap">{c.message}</div>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment…" />
            <Button size="sm" onClick={addComment} disabled={!newComment.trim() || saving}>Post</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="text-sm">{value ?? <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}
