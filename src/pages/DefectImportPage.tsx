import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { daysDiff, parseDefectExcel, type ParsedDefectRow } from '@/lib/defect-parser';

const trackedFields = ['planned_date', 'target_date', 'closed_date', 'actual_progress_pct', 'closure_status'] as const;

function changed(a: unknown, b: unknown) {
  return String(a ?? '') !== String(b ?? '');
}

export default function DefectImportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedDefectRow[]>([]);
  const [headers, setHeaders] = useState<{ originalHeader: string; displayName: string }[]>([]);
  const [running, setRunning] = useState(false);

  const onFile = async (selected: File | null) => {
    setFile(selected);
    setPreview([]);
    setHeaders([]);
    if (!selected) return;
    const parsed = await parseDefectExcel(selected);
    setPreview(parsed.rows.slice(0, 20));
    setHeaders(parsed.headers.map(({ originalHeader, displayName }) => ({ originalHeader, displayName })));
  };

  const importRows = async () => {
    if (!file || !user) return;
    setRunning(true);
    const parsed = await parseDefectExcel(file);
    const batchRes = await (supabase as any).from('defect_upload_batches').insert({ uploaded_file_name: file.name, uploaded_by: user.id, status: 'processing', total_rows: parsed.rows.length }).select('id').single();
    const uploadId = batchRes.data?.id;
    let success = 0, skipped = 0, rejected = 0;

    for (const row of parsed.rows) {
      if (!row.issue_no) {
        rejected++;
        await (supabase as any).from('defect_upload_row_logs').insert({ upload_id: uploadId, raw_row_no: row.rawRowNo, action_taken: 'rejected', reason_code: 'missing_issue_no', reason_detail: 'Issue No is required' });
        continue;
      }
      const existingRes = await (supabase as any).from('defect_items').select('*').eq('issue_no', row.issue_no).maybeSingle();
      const existing = existingRes.data;
      const payload = { ...row, rawRowNo: undefined, source_upload_id: uploadId, data_source_type: 'defect_import', updated_by: user.id, row_version: (existing?.row_version ?? 0) + 1 };

      if (existing) {
        const hasAnyChange = Object.entries(payload).some(([key, value]) => key !== 'raw_payload' && key !== 'row_version' && key !== 'updated_by' && key !== 'source_upload_id' && changed(existing[key], value));
        if (!hasAnyChange) {
          skipped++;
          await (supabase as any).from('defect_upload_row_logs').insert({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'skipped' });
          continue;
        }
        await (supabase as any).from('defect_items').update(payload).eq('id', existing.id);
        for (const field of trackedFields) {
          if (changed(existing[field], (row as any)[field])) {
            await (supabase as any).from('defect_schedule_change_audit').insert({
              upload_id: uploadId, defect_id: existing.id, project_id: existing.project_id, issue_no: row.issue_no, subcontractor_issue_no: row.subcontractor_issue_no, raw_row_no: row.rawRowNo,
              planned_old_date: field === 'planned_date' ? existing.planned_date : null, planned_new_date: field === 'planned_date' ? row.planned_date : null, planned_diff_days: field === 'planned_date' ? daysDiff(existing.planned_date, row.planned_date) : null,
              target_old_date: field === 'target_date' ? existing.target_date : null, target_new_date: field === 'target_date' ? row.target_date : null, target_diff_days: field === 'target_date' ? daysDiff(existing.target_date, row.target_date) : null,
              closed_old_date: field === 'closed_date' ? existing.closed_date : null, closed_new_date: field === 'closed_date' ? row.closed_date : null, closed_diff_days: field === 'closed_date' ? daysDiff(existing.closed_date, row.closed_date) : null,
              progress_old_pct: field === 'actual_progress_pct' ? existing.actual_progress_pct : null, progress_new_pct: field === 'actual_progress_pct' ? row.actual_progress_pct : null, progress_diff_pct: field === 'actual_progress_pct' ? Number(row.actual_progress_pct ?? 0) - Number(existing.actual_progress_pct ?? 0) : null,
              closure_status_old: field === 'closure_status' ? existing.closure_status : null, closure_status_new: field === 'closure_status' ? row.closure_status : null,
              created_by: user.id, change_source: 'excel_import',
            });
          }
        }
        success++;
        await (supabase as any).from('defect_upload_row_logs').insert({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'updated' });
      } else {
        const inserted = await (supabase as any).from('defect_items').insert(payload).select('id').single();
        success++;
        await (supabase as any).from('defect_upload_row_logs').insert({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'inserted' });
        if (inserted.data?.id) await (supabase as any).from('defect_daily_snapshots').insert({ defect_id: inserted.data.id, issue_no: row.issue_no, planned_date: row.planned_date, actual_progress_pct: row.actual_progress_pct, closure_status: row.closure_status, closed_date: row.closed_date, created_by: user.id });
      }
    }

    await (supabase as any).from('defect_upload_batches').update({ status: 'completed', processed_rows: parsed.rows.length, success_rows: success, skipped_rows: skipped, rejected_rows: rejected }).eq('id', uploadId);
    setRunning(false);
    toast({ title: 'Defect import complete', description: `${success} success, ${skipped} skipped, ${rejected} rejected.` });
    navigate('/defects/raw-data');
  };

  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle>Defect Import</CardTitle></CardHeader><CardContent className="space-y-4">
        <Input type="file" accept=".xlsx,.xls" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        <div className="flex gap-2"><Button onClick={importRows} disabled={!file || running}>{running ? 'Importing...' : 'Start Import'}</Button><Button variant="outline" onClick={() => navigate('/defects/import/logs')}>View Logs</Button></div>
      </CardContent></Card>
      {headers.length > 0 && <Card><CardHeader><CardTitle>Header Mapping</CardTitle></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-3">{headers.map((h) => <div key={h.originalHeader} className="rounded-md border p-2 text-xs"><div className="text-muted-foreground">{h.originalHeader}</div><div className="font-medium">{h.displayName}</div></div>)}</div></CardContent></Card>}
      {preview.length > 0 && <Card><CardHeader><CardTitle>Preview</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Issue No</TableHead><TableHead>Type</TableHead><TableHead>Level</TableHead><TableHead>Location</TableHead><TableHead>Main Trade</TableHead><TableHead>Sub Trade</TableHead></TableRow></TableHeader><TableBody>{preview.map((row) => <TableRow key={`${row.rawRowNo}-${row.issue_no}`}><TableCell>{row.issue_no}</TableCell><TableCell>{row.area_type}</TableCell><TableCell>{row.area_level}</TableCell><TableCell>{row.area_location}</TableCell><TableCell>{row.main_trade}</TableCell><TableCell>{row.sub_trade}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
    </div>
  );
}
