import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ExternalLink, Filter as FilterIcon } from 'lucide-react';
import { formatDdMmm } from '@/lib/format';
import { computeOmmStatus, computeOmmCopyAlert } from '@/lib/docs-omm-status';
import { OmmStatusBadge } from '@/components/docs/OmmStatusBadge';
import { OmmCopyQuantityCell } from '@/components/docs/OmmCopyQuantityCell';
import { useDocsFieldConfig } from '@/hooks/useDocsFieldConfig';

interface OMMRow {
  id: string;
  sn: string | null;
  category: string | null;
  category_group: string | null;
  section: string | null;
  work_trade_material: string | null;
  subcontractor_name: string | null;
  team: string | null;
  training_required: string | null;
  pdf_required_qty: number | null;
  pdf_actual_qty: number | null;
  hardcopy_required_qty: number | null;
  hardcopy_actual_qty: number | null;
  instruction_date: string | null;
  draft_planned_date: string | null;
  draft_actual_date: string | null;
  draft_response_date: string | null;
  draft_response_status: string | null;
  final_planned_date: string | null;
  final_actual_date: string | null;
  final_response_planned_date: string | null;
  final_response_actual_date: string | null;
  final_response_status: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  remarks: string | null;
  is_resubmission: boolean;
  resubmission_seq: number;
  parent_id: string | null;
  current_stage: string | null;
  current_status: string | null;
}

export default function DocsOMMRawDataPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isFieldVisible, getLabel } = useDocsFieldConfig('omm');
  const [rows, setRows] = useState<OMMRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [mismatchOnly, setMismatchOnly] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('docs_omm')
      .select('*')
      .eq('is_active', true)
      .order('category_group', { ascending: true, nullsFirst: false })
      .order('sn', { ascending: true })
      .order('resubmission_seq', { ascending: true })
      .limit(2000);
    if (error) toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
    setRows((data ?? []) as OMMRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.category_group) set.add(r.category_group);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (groupFilter !== 'all' && r.category_group !== groupFilter) return false;
      if (mismatchOnly && !computeOmmCopyAlert(r).hasMismatch) return false;
      if (!q) return true;
      return [
        r.sn, r.category, r.category_group, r.section, r.work_trade_material,
        r.subcontractor_name, r.hdec_pic_name, r.hdec_eng_name, r.remarks,
      ].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [rows, search, groupFilter, mismatchOnly]);

  const mismatchCount = useMemo(
    () => rows.filter((r) => computeOmmCopyAlert(r).hasMismatch).length,
    [rows],
  );

  const updateField = async (id: string, field: keyof OMMRow, value: any) => {
    const { error } = await (supabase as any)
      .from('docs_omm')
      .update({ [field]: value, updated_by: user?.id ?? null })
      .eq('id', id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: `${String(field)} updated` });
      load();
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">OMM Manuals — Raw Data</h1>
          <p className="text-sm text-muted-foreground">Operation &amp; Maintenance Manual list, status &amp; copy quantities.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{filtered.length} / {rows.length} rows</Badge>
          {mismatchCount > 0 && (
            <Badge variant="outline" className="border-rose-300 text-rose-700">
              {mismatchCount} copy mismatch{mismatchCount === 1 ? '' : 'es'}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate('/docs/omm/import')}>Import</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search SN / trade / sub-contractor…"
                className="h-9 w-[280px] pl-7"
                value={search} onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch checked={mismatchOnly} onCheckedChange={setMismatchOnly} id="mismatch-only" />
              <Label htmlFor="mismatch-only" className="text-xs cursor-pointer flex items-center gap-1">
                <FilterIcon className="h-3 w-3" /> Copy mismatch only
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No OMM records. Use the Import page to upload.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">SN</TableHead>
                    {isFieldVisible('category_group') && <TableHead>{getLabel('category_group')}</TableHead>}
                    {isFieldVisible('category') && <TableHead>{getLabel('category')}</TableHead>}
                    {isFieldVisible('work_trade_material') && <TableHead>Work / Trade / Material</TableHead>}
                    {isFieldVisible('subcontractor_name') && <TableHead>Subcontractor</TableHead>}
                    <TableHead className="text-center">PDF (act/req)</TableHead>
                    <TableHead className="text-center">HC (act/req)</TableHead>
                    {isFieldVisible('draft_planned_date') && <TableHead>Draft Plan</TableHead>}
                    {isFieldVisible('draft_actual_date') && <TableHead>Draft Actual</TableHead>}
                    {isFieldVisible('draft_response_status') && <TableHead className="text-center">Draft Resp</TableHead>}
                    {isFieldVisible('final_planned_date') && <TableHead>Final Plan</TableHead>}
                    {isFieldVisible('final_actual_date') && <TableHead>Final Actual</TableHead>}
                    {isFieldVisible('final_response_status') && <TableHead className="text-center">Final Resp</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const status = computeOmmStatus(r);
                    const isResub = r.is_resubmission;
                    return (
                      <TableRow key={r.id} className={isResub ? 'bg-muted/30' : undefined}>
                        <TableCell className={`font-mono text-xs ${isResub ? 'pl-6' : ''}`}>
                          {isResub && <span className="text-muted-foreground mr-1">↳</span>}
                          {r.sn}
                        </TableCell>
                        {isFieldVisible('category_group') && <TableCell className="text-xs">{r.category_group ?? ''}</TableCell>}
                        {isFieldVisible('category') && <TableCell className="text-xs">{r.category ?? ''}</TableCell>}
                        {isFieldVisible('work_trade_material') && (
                          <TableCell className="text-xs max-w-[280px] truncate" title={r.work_trade_material ?? ''}>
                            {r.work_trade_material ?? ''}
                          </TableCell>
                        )}
                        {isFieldVisible('subcontractor_name') && <TableCell className="text-xs">{r.subcontractor_name ?? ''}</TableCell>}
                        <TableCell className="text-center">
                          <OmmCopyQuantityCell required={r.pdf_required_qty} actual={r.pdf_actual_qty} />
                        </TableCell>
                        <TableCell className="text-center">
                          <OmmCopyQuantityCell required={r.hardcopy_required_qty} actual={r.hardcopy_actual_qty} />
                        </TableCell>
                        {isFieldVisible('draft_planned_date') && <TableCell className="text-xs">{formatDdMmm(r.draft_planned_date)}</TableCell>}
                        {isFieldVisible('draft_actual_date') && <TableCell className="text-xs">{formatDdMmm(r.draft_actual_date)}</TableCell>}
                        {isFieldVisible('draft_response_status') && (
                          <TableCell className="text-center">
                            <ResponseStatusEditor
                              value={r.draft_response_status}
                              onChange={(v) => updateField(r.id, 'draft_response_status', v)}
                            />
                          </TableCell>
                        )}
                        {isFieldVisible('final_planned_date') && <TableCell className="text-xs">{formatDdMmm(r.final_planned_date)}</TableCell>}
                        {isFieldVisible('final_actual_date') && <TableCell className="text-xs">{formatDdMmm(r.final_actual_date)}</TableCell>}
                        {isFieldVisible('final_response_status') && (
                          <TableCell className="text-center">
                            <ResponseStatusEditor
                              value={r.final_response_status}
                              onChange={(v) => updateField(r.id, 'final_response_status', v)}
                              disabled={r.draft_response_status !== 'A'}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <OmmStatusBadge row={r} />
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => navigate(`/docs/omm/${r.id}`)}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResponseStatusEditor({
  value, onChange, disabled,
}: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  return (
    <Select
      value={value ?? '__none__'}
      onValueChange={(v) => onChange(v === '__none__' ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">—</SelectItem>
        <SelectItem value="A">A</SelectItem>
        <SelectItem value="B">B</SelectItem>
        <SelectItem value="C">C</SelectItem>
      </SelectContent>
    </Select>
  );
}
