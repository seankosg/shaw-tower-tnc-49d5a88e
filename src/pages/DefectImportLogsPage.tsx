import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, Trash2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatDateTimeDdMmmYyyy, formatDdMmm, formatSignedDays } from '@/lib/format';

interface DefectBatch {
  id: string;
  uploaded_file_name: string;
  uploaded_at: string;
  status: string;
  total_rows: number | null;
  success_rows: number | null;
  skipped_rows: number | null;
  rejected_rows: number | null;
}

interface DefectRowLog {
  id: string;
  raw_row_no: number | null;
  issue_no: string | null;
  action_taken: string | null;
  reason_code: string | null;
  reason_detail: string | null;
}

interface DefectScheduleChangeAudit {
  id: string;
  raw_row_no: number | null;
  defect_id: string;
  issue_no: string;
  subcontractor_issue_no: string | null;
  planned_completion_old_date: string | null;
  planned_completion_new_date: string | null;
  planned_completion_diff_days: number | null;
  planned_closure_old_date: string | null;
  planned_closure_new_date: string | null;
  planned_closure_diff_days: number | null;
  actual_closure_old_date: string | null;
  actual_closure_new_date: string | null;
  actual_closure_diff_days: number | null;
  progress_old_pct: number | null;
  progress_new_pct: number | null;
  progress_diff_pct: number | null;
  completion_status_old: string | null;
  completion_status_new: string | null;
  closure_status_old: string | null;
  closure_status_new: string | null;
  change_source: string | null;
}

const statusColor: Record<string, string> = {
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const actionColor: Record<string, string> = {
  inserted: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  updated: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  skipped: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const diffClass = (v: number | null | undefined) =>
  v == null ? '' : v > 0 ? 'text-destructive font-medium' : v < 0 ? 'text-primary font-medium' : 'text-muted-foreground';

const formatPercent = (v: number | null | undefined) => (v == null ? '—' : `${v}%`);
const formatSignedPercent = (v: number | null | undefined) => {
  if (v == null) return '—';
  return `${v > 0 ? '+' : ''}${v}%`;
};

function DateChangeCells({ oldDate, newDate, diff }: { oldDate: string | null; newDate: string | null; diff: number | null }) {
  return (
    <>
      <TableCell className="text-xs whitespace-nowrap">{formatDdMmm(oldDate)}</TableCell>
      <TableCell className="text-xs whitespace-nowrap">{formatDdMmm(newDate)}</TableCell>
      <TableCell className={`text-xs text-right ${diffClass(diff)}`}>{formatSignedDays(diff)}</TableCell>
    </>
  );
}

export default function DefectImportLogsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { isAdminOrSuperuser } = useAuth();
  const canDelete = isAdminOrSuperuser || import.meta.env.DEV;

  const [batches, setBatches] = useState<DefectBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(searchParams.get('batch'));
  const [detailTab, setDetailTab] = useState(searchParams.get('tab') || 'rows');
  const [rowLogs, setRowLogs] = useState<DefectRowLog[]>([]);
  const [scheduleChanges, setScheduleChanges] = useState<DefectScheduleChangeAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { void fetchBatches(); }, []);

  useEffect(() => {
    if (selectedBatch) void loadBatchDetails(selectedBatch);
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedBatch) next.set('batch', selectedBatch);
    else next.delete('batch');
    if (selectedBatch && detailTab !== 'rows') next.set('tab', detailTab);
    else next.delete('tab');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [selectedBatch, detailTab, searchParams, setSearchParams]);

  const fetchBatches = async () => {
    setLoading(true);
    const { data } = await supabase.from('defect_upload_batches')
      .select('id, uploaded_file_name, uploaded_at, status, total_rows, success_rows, skipped_rows, rejected_rows')
      .order('uploaded_at', { ascending: false }).limit(100);
    setBatches(data ?? []);
    setLoading(false);
  };

  const selectBatch = async (id: string) => {
    setSelectedBatch(id);
    await loadBatchDetails(id);
  };

  const loadBatchDetails = async (id: string) => {
    const { data } = await supabase.from('defect_upload_row_logs')
      .select('id, raw_row_no, issue_no, action_taken, reason_code, reason_detail')
      .eq('upload_id', id).order('raw_row_no', { ascending: true }).limit(500);
    setRowLogs(data ?? []);

    const { data: changes } = await supabase.from('defect_schedule_change_audit')
      .select('id, raw_row_no, defect_id, issue_no, subcontractor_issue_no, planned_old_date, planned_new_date, planned_diff_days, target_old_date, target_new_date, target_diff_days, closed_old_date, closed_new_date, closed_diff_days, progress_old_pct, progress_new_pct, progress_diff_pct, closure_status_old, closure_status_new, change_source')
      .eq('upload_id', id).order('raw_row_no', { ascending: true }).limit(500);
    setScheduleChanges((changes as DefectScheduleChangeAudit[]) ?? []);
  };

  const deleteBatch = async (batch: DefectBatch) => {
    setDeletingId(batch.id);
    try {
      const { error } = await (supabase as any).rpc('delete_defect_import_batch', { _batch_id: batch.id });
      if (error) throw error;

      toast({ title: 'Batch deleted', description: `Removed ${batch.uploaded_file_name} and its defect data` });
      if (selectedBatch === batch.id) setSelectedBatch(null);
      await fetchBatches();
    } catch (e: any) {
      const message = e?.message?.includes('permission')
        ? 'You do not have permission to delete this import batch.'
        : 'Delete failed. Please try again or contact administrator.';
      console.error('Defect import batch delete failed', e);
      toast({ title: 'Delete failed', description: message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => selectedBatch ? setSelectedBatch(null) : navigate('/defects/import')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {selectedBatch ? 'Import Row Details' : 'Import History'}
        </h1>
      </div>

      {!selectedBatch ? (
        <Card>
          <CardContent className="pt-4">
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">File</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">Success</TableHead>
                    <TableHead className="text-xs text-right">Skipped</TableHead>
                    <TableHead className="text-xs text-right">Rejected</TableHead>
                    {canDelete && <TableHead className="text-xs w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={canDelete ? 9 : 8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : batches.length === 0 ? (
                    <TableRow><TableCell colSpan={canDelete ? 9 : 8} className="text-center py-8 text-muted-foreground">No import history</TableCell></TableRow>
                  ) : batches.map((b) => (
                    <TableRow key={b.id} className="hover:bg-muted/50">
                      <TableCell className="text-xs font-medium cursor-pointer" onClick={() => selectBatch(b.id)}>{b.uploaded_file_name}</TableCell>
                      <TableCell className="text-xs cursor-pointer" onClick={() => selectBatch(b.id)}>Defect</TableCell>
                      <TableCell className="text-xs cursor-pointer whitespace-nowrap" onClick={() => selectBatch(b.id)}>{formatDateTimeDdMmmYyyy(b.uploaded_at)}</TableCell>
                      <TableCell className="cursor-pointer" onClick={() => selectBatch(b.id)}>
                        <Badge variant="outline" className={`text-xs ${statusColor[b.status] || ''}`}>{b.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right cursor-pointer" onClick={() => selectBatch(b.id)}>{b.total_rows ?? 0}</TableCell>
                      <TableCell className="text-xs text-right cursor-pointer" onClick={() => selectBatch(b.id)}>{b.success_rows ?? 0}</TableCell>
                      <TableCell className="text-xs text-right cursor-pointer" onClick={() => selectBatch(b.id)}>{b.skipped_rows ?? 0}</TableCell>
                      <TableCell className="text-xs text-right cursor-pointer" onClick={() => selectBatch(b.id)}>{b.rejected_rows ?? 0}</TableCell>
                      {canDelete && (
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" disabled={deletingId === b.id}>
                                {deletingId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete import batch?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete <strong>{b.uploaded_file_name}</strong>, defect items imported from it, schedule change audits, snapshots, and row logs. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteBatch(b)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {batches.find((b) => b.id === selectedBatch)?.uploaded_file_name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={detailTab} onValueChange={setDetailTab}>
              <TabsList>
                <TabsTrigger value="rows">Row Logs</TabsTrigger>
                <TabsTrigger value="schedule">Schedule Changes</TabsTrigger>
              </TabsList>
              <TabsContent value="rows">
                <div className="rounded-md border max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Row</TableHead>
                        <TableHead className="text-xs">Issue No</TableHead>
                        <TableHead className="text-xs">Action</TableHead>
                        <TableHead className="text-xs">Reason</TableHead>
                        <TableHead className="text-xs">Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rowLogs.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No row logs</TableCell></TableRow>
                      ) : rowLogs.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">{r.raw_row_no}</TableCell>
                          <TableCell className="text-xs">{r.issue_no || '—'}</TableCell>
                          <TableCell>
                            {r.action_taken ? (
                              <Badge variant="outline" className={`text-xs ${actionColor[r.action_taken] || ''}`}>{r.action_taken}</Badge>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-xs">{r.reason_code || '—'}</TableCell>
                          <TableCell className="text-xs truncate max-w-[320px]">{r.reason_detail || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="schedule">
                <div className="rounded-md border max-h-[560px] overflow-auto">
                  <Table className="min-w-[1450px]">
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead rowSpan={2} className="text-xs">Row</TableHead>
                        <TableHead rowSpan={2} className="text-xs">Issue No</TableHead>
                        <TableHead rowSpan={2} className="text-xs">Subcon Issue No</TableHead>
                        <TableHead colSpan={3} className="text-center text-xs border-l">Planned Completion</TableHead>
                        <TableHead colSpan={3} className="text-center text-xs border-l">Planned Closure</TableHead>
                        <TableHead colSpan={3} className="text-center text-xs border-l">Actual Closure</TableHead>
                        <TableHead colSpan={3} className="text-center text-xs border-l">Progress</TableHead>
                        <TableHead colSpan={2} className="text-center text-xs border-l">Completion Status</TableHead>
                        <TableHead colSpan={2} className="text-center text-xs border-l">Closure Status</TableHead>
                        <TableHead rowSpan={2} className="text-xs border-l">Source</TableHead>
                      </TableRow>
                      <TableRow>
                        {['Old date', 'New date', 'Diff', 'Old date', 'New date', 'Diff', 'Old date', 'New date', 'Diff', 'Old %', 'New %', 'Diff', 'Old', 'New', 'Old', 'New'].map((label, idx) => (
                          <TableHead key={`${label}-${idx}`} className="text-xs whitespace-nowrap border-l first:border-l-0">{label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scheduleChanges.length === 0 ? (
                        <TableRow><TableCell colSpan={20} className="text-center py-8 text-muted-foreground">No schedule changes</TableCell></TableRow>
                      ) : scheduleChanges.map((r) => (
                        <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/defects/${r.defect_id}`)}>
                          <TableCell className="text-xs">{r.raw_row_no ?? '—'}</TableCell>
                          <TableCell className="text-xs">{r.issue_no}</TableCell>
                          <TableCell className="text-xs">{r.subcontractor_issue_no || '—'}</TableCell>
                          <DateChangeCells oldDate={r.planned_completion_old_date} newDate={r.planned_completion_new_date} diff={r.planned_completion_diff_days} />
                          <DateChangeCells oldDate={r.planned_closure_old_date} newDate={r.planned_closure_new_date} diff={r.planned_closure_diff_days} />
                          <DateChangeCells oldDate={r.actual_closure_old_date} newDate={r.actual_closure_new_date} diff={r.actual_closure_diff_days} />
                          <TableCell className="text-xs text-right">{formatPercent(r.progress_old_pct)}</TableCell>
                          <TableCell className="text-xs text-right">{formatPercent(r.progress_new_pct)}</TableCell>
                          <TableCell className={`text-xs text-right ${diffClass(r.progress_diff_pct)}`}>{formatSignedPercent(r.progress_diff_pct)}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{r.completion_status_old || '—'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{r.completion_status_new || '—'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{r.closure_status_old || '—'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{r.closure_status_new || '—'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{r.change_source || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}