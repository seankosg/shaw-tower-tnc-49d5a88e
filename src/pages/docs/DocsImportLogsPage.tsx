import { Fragment, useEffect, useState } from 'react';
import { ChevronLeft, Loader2, Trash2, ChevronDown, ChevronRight, Download } from 'lucide-react';
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
import { formatDateTimeDdMmmYyyy, formatDdMmm, formatDuration } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchAllByUploadId } from '@/lib/fetch-all-rows';
import { FieldLog, FieldLogTable, FieldLogSummaryChips, OUTCOME_LABELS, downloadFieldLevelCsv } from '@/components/import/FieldLogTable';

interface DocsBatch {
  id: string;
  uploaded_file_name: string;
  uploaded_at: string;
  status: string;
  total_rows: number | null;
  success_rows: number | null;
  skipped_rows: number | null;
  rejected_rows: number | null;
  uploaded_by: string | null;
  data_date: string | null;
  sub_module: string | null;
}

interface DocsRowLog {
  id: string;
  raw_row_no: number | null;
  document_no: string | null;
  action_taken: string | null;
  reason_code: string | null;
  reason_detail: string | null;
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

const SUB_MODULE_LABELS: Record<string, string> = {
  as_built: 'As-Built',
  omm: 'OMM',
  warranty: 'Warranty',
  spare_part: 'Spare Part',
};

const SUB_MODULE_COLORS: Record<string, string> = {
  as_built: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  omm: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  warranty: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  spare_part: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
};

const KEY_FIELD_LABELS: Record<string, string> = {
  as_built: 'Document No',
  omm: 'SN',
  warranty: 'Warranty No',
  spare_part: 'SN',
};

export default function DocsImportLogsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { isAdminOrSuperuser } = useAuth();
  const canDelete = isAdminOrSuperuser || import.meta.env.DEV;

  const [batches, setBatches] = useState<DocsBatch[]>([]);
  const [uploaderNames, setUploaderNames] = useState<Record<string, string>>({});
  const [durationsMs, setDurationsMs] = useState<Record<string, number>>({});
  const [selectedBatch, setSelectedBatch] = useState<string | null>(searchParams.get('batch'));
  const [detailTab, setDetailTab] = useState(searchParams.get('tab') || 'rows');
  const [rowLogs, setRowLogs] = useState<DocsRowLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [rowSearch, setRowSearch] = useState<string>('');
  const [renderLimit, setRenderLimit] = useState<number>(500);
  const [fieldLogs, setFieldLogs] = useState<FieldLog[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [subModuleFilter, setSubModuleFilter] = useState<string>(searchParams.get('sub') || 'all');

  useEffect(() => { void fetchBatches(); }, []);
  useEffect(() => { if (selectedBatch) void loadBatchDetails(selectedBatch); }, []);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedBatch) next.set('batch', selectedBatch); else next.delete('batch');
    if (selectedBatch && detailTab !== 'rows') next.set('tab', detailTab); else next.delete('tab');
    if (!selectedBatch && subModuleFilter !== 'all') next.set('sub', subModuleFilter); else next.delete('sub');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [selectedBatch, detailTab, subModuleFilter, searchParams, setSearchParams]);

  const fetchBatches = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from('docs_upload_batches')
      .select('id, uploaded_file_name, uploaded_at, status, total_rows, success_rows, skipped_rows, rejected_rows, uploaded_by, data_date, sub_module')
      .order('uploaded_at', { ascending: false }).limit(100);
    const list = (data ?? []) as DocsBatch[];
    setBatches(list);
    setLoading(false);

    const uploaderIds = Array.from(new Set(list.map(b => b.uploaded_by).filter(Boolean))) as string[];
    if (uploaderIds.length) {
      const { data: profs } = await supabase.from('profiles').select('user_id, name, login_id').in('user_id', uploaderIds);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.user_id] = p.name || p.login_id || ''; });
      setUploaderNames(map);
    } else setUploaderNames({});

    const batchIds = list.map(b => b.id);
    if (batchIds.length) {
      const { data: logs } = await (supabase as any).from('docs_upload_row_logs')
        .select('upload_id, processed_at').in('upload_id', batchIds);
      const maxByBatch: Record<string, number> = {};
      (logs ?? []).forEach((l: any) => {
        const t = new Date(l.processed_at).getTime();
        if (!maxByBatch[l.upload_id] || t > maxByBatch[l.upload_id]) maxByBatch[l.upload_id] = t;
      });
      const durs: Record<string, number> = {};
      list.forEach(b => {
        const end = maxByBatch[b.id];
        if (end) durs[b.id] = end - new Date(b.uploaded_at).getTime();
      });
      setDurationsMs(durs);
    } else setDurationsMs({});
  };

  const selectBatch = async (id: string) => {
    setSelectedBatch(id);
    await loadBatchDetails(id);
  };

  const loadBatchDetails = async (id: string) => {
    setActionFilter('all'); setReasonFilter('all'); setOutcomeFilter('all');
    setRowSearch(''); setRenderLimit(500); setExpandedRows(new Set());
    try {
      const rows = await fetchAllByUploadId<DocsRowLog>(
        'docs_upload_row_logs',
        'id, raw_row_no, document_no, action_taken, reason_code, reason_detail',
        id,
      );
      setRowLogs(rows);
    } catch (e) {
      console.error('Failed to load docs row logs', e);
      setRowLogs([]);
    }
    try {
      const fl = await fetchAllByUploadId<FieldLog>(
        'import_field_logs',
        'id, raw_row_no, field_name, outcome, raw_value, applied_value, previous_value, reason_code, reason_detail',
        id,
      );
      setFieldLogs(fl.filter(f => true)); // table is already filtered by upload_id; kind filter not needed (one batch = one kind)
    } catch (e) {
      console.error('Failed to load field logs', e);
      setFieldLogs([]);
    }
  };

  const deleteBatch = async (batch: DocsBatch) => {
    setDeletingId(batch.id);
    try {
      const { error } = await (supabase as any).rpc('delete_docs_import_batch', { _batch_id: batch.id });
      if (error) throw error;
      toast({ title: 'Batch deleted', description: `Removed ${batch.uploaded_file_name} and its logs.` });
      if (selectedBatch === batch.id) setSelectedBatch(null);
      await fetchBatches();
    } catch (e: any) {
      console.error('Docs import batch delete failed', e);
      toast({
        title: 'Delete failed',
        description: e?.message?.includes('permission')
          ? 'You do not have permission to delete this import batch.'
          : 'Delete failed. Please try again or contact administrator.',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => selectedBatch ? setSelectedBatch(null) : navigate('/docs/import')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">
          {selectedBatch ? 'Import Row Details' : 'Docs Import History'}
        </h1>
      </div>

      {!selectedBatch ? (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Sub-module:</span>
              <Select value={subModuleFilter} onValueChange={setSubModuleFilter}>
                <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="as_built">As-Built</SelectItem>
                  <SelectItem value="omm">OMM</SelectItem>
                  <SelectItem value="warranty">Warranty</SelectItem>
                  <SelectItem value="spare_part">Spare Part</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">File</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Uploader</TableHead>
                    <TableHead className="text-xs">Data Date</TableHead>
                    <TableHead className="text-xs text-right">Duration</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">Success</TableHead>
                    <TableHead className="text-xs text-right">Skipped</TableHead>
                    <TableHead className="text-xs text-right">Rejected</TableHead>
                    {canDelete && <TableHead className="text-xs w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const visibleBatches = subModuleFilter === 'all'
                      ? batches
                      : batches.filter(b => (b.sub_module ?? '') === subModuleFilter);
                    if (loading) {
                      return <TableRow><TableCell colSpan={canDelete ? 12 : 11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>;
                    }
                    if (visibleBatches.length === 0) {
                      return <TableRow><TableCell colSpan={canDelete ? 12 : 11} className="text-center py-8 text-muted-foreground">No import history</TableCell></TableRow>;
                    }
                    return visibleBatches.map((b) => {
                      const uploader = b.uploaded_by ? (uploaderNames[b.uploaded_by] || '—') : '—';
                      const dur = durationsMs[b.id];
                      const subKey = b.sub_module ?? '';
                      const subLabel = SUB_MODULE_LABELS[subKey] || (subKey || '—');
                      return (
                        <TableRow key={b.id} className="hover:bg-muted/50">
                          <TableCell className="text-xs font-medium cursor-pointer" onClick={() => selectBatch(b.id)}>{b.uploaded_file_name}</TableCell>
                          <TableCell className="cursor-pointer" onClick={() => selectBatch(b.id)}>
                            <Badge variant="outline" className={`text-xs ${SUB_MODULE_COLORS[subKey] || ''}`}>{subLabel}</Badge>
                          </TableCell>
                        <TableCell className="text-xs cursor-pointer whitespace-nowrap" onClick={() => selectBatch(b.id)}>{formatDateTimeDdMmmYyyy(b.uploaded_at)}</TableCell>
                        <TableCell className="text-xs cursor-pointer" onClick={() => selectBatch(b.id)}>{uploader}</TableCell>
                        <TableCell className="text-xs cursor-pointer whitespace-nowrap" onClick={() => selectBatch(b.id)}>{formatDdMmm(b.data_date)}</TableCell>
                        <TableCell className="text-xs text-right cursor-pointer whitespace-nowrap" onClick={() => selectBatch(b.id)} title={dur != null ? `${dur} ms` : ''}>{formatDuration(dur)}</TableCell>
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
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" disabled={deletingId === b.id} title="Delete batch (removes logs only; drawing data is preserved)">
                                  {deletingId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete import batch?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This permanently removes the batch <strong>{b.uploaded_file_name}</strong> along with its row logs, field logs, and change logs.
                                    Drawings imported by this batch are preserved (only their link to this batch is cleared).
                                    To re-import cleanly, delete the batch then run the import again.
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
                      );
                    });
                  })()}
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
              </TabsList>
              <TabsContent value="rows">
                {(() => {
                  const actionCounts = rowLogs.reduce<Record<string, number>>((acc, r) => {
                    const k = r.action_taken || 'unknown';
                    acc[k] = (acc[k] || 0) + 1;
                    return acc;
                  }, {});
                  const reasonOptions = Array.from(new Set(rowLogs.map(r => r.reason_code).filter(Boolean) as string[])).sort();

                  const fieldLogsByRow = new Map<number, FieldLog[]>();
                  for (const fl of fieldLogs) {
                    if (fl.raw_row_no == null) continue;
                    const arr = fieldLogsByRow.get(fl.raw_row_no) || [];
                    arr.push(fl);
                    fieldLogsByRow.set(fl.raw_row_no, arr);
                  }
                  const outcomeCounts: Record<string, number> = {};
                  for (const fl of fieldLogs) outcomeCounts[fl.outcome] = (outcomeCounts[fl.outcome] || 0) + 1;
                  const outcomeOptions = Object.keys(outcomeCounts).sort();

                  const filtered = rowLogs.filter(r => {
                    if (actionFilter !== 'all' && (r.action_taken || '') !== actionFilter) return false;
                    if (reasonFilter !== 'all') {
                      if (reasonFilter === '__none__') { if (r.reason_code) return false; }
                      else if (r.reason_code !== reasonFilter) return false;
                    }
                    if (outcomeFilter !== 'all') {
                      const fls = r.raw_row_no != null ? fieldLogsByRow.get(r.raw_row_no) : undefined;
                      if (!fls || !fls.some(f => f.outcome === outcomeFilter)) return false;
                    }
                    if (rowSearch.trim() && String(r.raw_row_no ?? '') !== rowSearch.trim()) return false;
                    return true;
                  });
                  const visible = filtered.slice(0, renderLimit);
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          <Badge variant="outline">Total {rowLogs.length}</Badge>
                          {['inserted', 'updated', 'skipped', 'rejected'].map(a => (
                            <Badge key={a} variant="outline" className={actionColor[a]}>
                              {a} {actionCounts[a] || 0}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex-1" />
                        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setRenderLimit(500); }}>
                          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Action" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All actions</SelectItem>
                            <SelectItem value="inserted">inserted</SelectItem>
                            <SelectItem value="updated">updated</SelectItem>
                            <SelectItem value="skipped">skipped</SelectItem>
                            <SelectItem value="rejected">rejected</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={reasonFilter} onValueChange={(v) => { setReasonFilter(v); setRenderLimit(500); }}>
                          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Reason" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All reasons</SelectItem>
                            <SelectItem value="__none__">(no reason)</SelectItem>
                            {reasonOptions.map(rc => (<SelectItem key={rc} value={rc}>{rc}</SelectItem>))}
                          </SelectContent>
                        </Select>
                        <Select value={outcomeFilter} onValueChange={(v) => { setOutcomeFilter(v); setRenderLimit(500); }}>
                          <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Field outcome" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All field outcomes</SelectItem>
                            {outcomeOptions.map(o => (
                              <SelectItem key={o} value={o}>{OUTCOME_LABELS[o] || o} ({outcomeCounts[o]})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={rowSearch}
                          onChange={(e) => { setRowSearch(e.target.value); setRenderLimit(500); }}
                          placeholder="Row #"
                          className="h-8 w-[100px] text-xs"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          disabled={fieldLogs.length === 0}
                          onClick={() => downloadFieldLevelCsv(fieldLogs, `docs-field-logs-${selectedBatch}.csv`)}
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          Field-level CSV
                        </Button>
                      </div>
                      {fieldLogs.length > 0 && (
                        <div className="mb-3">
                          <FieldLogSummaryChips logs={fieldLogs} />
                        </div>
                      )}
                      <div className="rounded-md border max-h-[500px] overflow-auto">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-background">
                            <TableRow>
                              <TableHead className="text-xs w-8"></TableHead>
                              <TableHead className="text-xs">Row</TableHead>
                              <TableHead className="text-xs">Document No</TableHead>
                              <TableHead className="text-xs">Action</TableHead>
                              <TableHead className="text-xs">Reason</TableHead>
                              <TableHead className="text-xs">Detail</TableHead>
                              <TableHead className="text-xs">Fields</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filtered.length === 0 ? (
                              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No row logs</TableCell></TableRow>
                            ) : visible.map((r) => {
                              const fls = r.raw_row_no != null ? fieldLogsByRow.get(r.raw_row_no) || [] : [];
                              const isExpanded = expandedRows.has(r.id);
                              const toggle = () => {
                                setExpandedRows(prev => {
                                  const next = new Set(prev);
                                  if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                                  return next;
                                });
                              };
                              return (
                                <Fragment key={r.id}>
                                  <TableRow className={fls.length > 0 ? 'cursor-pointer' : ''} onClick={fls.length > 0 ? toggle : undefined}>
                                    <TableCell className="text-xs">
                                      {fls.length > 0 ? (
                                        isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                                      ) : null}
                                    </TableCell>
                                    <TableCell className="text-xs">{r.raw_row_no}</TableCell>
                                    <TableCell className="text-xs">{r.document_no || '—'}</TableCell>
                                    <TableCell>
                                      {r.action_taken ? (
                                        <Badge variant="outline" className={`text-xs ${actionColor[r.action_taken] || ''}`}>{r.action_taken}</Badge>
                                      ) : '—'}
                                    </TableCell>
                                    <TableCell className="text-xs">{r.reason_code || '—'}</TableCell>
                                    <TableCell className="text-xs max-w-[360px] whitespace-normal break-words">{r.reason_detail || '—'}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{fls.length || '—'}</TableCell>
                                  </TableRow>
                                  {isExpanded && fls.length > 0 && (
                                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                                      <TableCell colSpan={7} className="p-2">
                                        <FieldLogTable logs={fls} />
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                        <span>Showing {visible.length} of {filtered.length} {filtered.length !== rowLogs.length ? `(filtered from ${rowLogs.length})` : ''} · {fieldLogs.length} field logs</span>
                        {visible.length < filtered.length && (
                          <Button variant="outline" size="sm" onClick={() => setRenderLimit(l => l + 500)}>Show 500 more</Button>
                        )}
                      </div>
                    </>
                  );
                })()}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
