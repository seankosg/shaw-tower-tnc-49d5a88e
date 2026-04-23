import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface Batch { id: string; uploaded_file_name: string; uploaded_at: string; status: string; total_rows: number; success_rows: number; skipped_rows: number; rejected_rows: number; }
interface Log { id: string; raw_row_no: number | null; issue_no: string | null; action_taken: string | null; reason_code: string | null; reason_detail: string | null; }

export default function DefectImportLogsPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { (supabase as any).from('defect_upload_batches').select('*').order('uploaded_at', { ascending: false }).limit(100).then(({ data }: any) => setBatches(data ?? [])); }, []);
  useEffect(() => {
    if (!selected) return;
    (supabase as any).from('defect_upload_row_logs').select('*').eq('upload_id', selected).order('raw_row_no').limit(500).then(({ data }: any) => setLogs(data ?? []));
  }, [selected]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <Card>
        <CardHeader><CardTitle>Defect Import Logs</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow><TableHead>File</TableHead><TableHead>Status</TableHead><TableHead>Rows</TableHead></TableRow></TableHeader><TableBody>
            {batches.map((b) => <TableRow key={b.id} className="cursor-pointer" onClick={() => setSelected(b.id)}><TableCell className="max-w-[260px] truncate">{b.uploaded_file_name}<div className="text-xs text-muted-foreground">{new Date(b.uploaded_at).toLocaleString()}</div></TableCell><TableCell><Badge variant="outline">{b.status}</Badge></TableCell><TableCell>{b.success_rows}/{b.total_rows}</TableCell></TableRow>)}
          </TableBody></Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Row Logs</CardTitle></CardHeader>
        <CardContent>
          <Table><TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Issue No</TableHead><TableHead>Action</TableHead><TableHead>Reason Code</TableHead><TableHead>Reason Detail</TableHead></TableRow></TableHeader><TableBody>
            {logs.map((log) => <TableRow key={log.id}><TableCell>{log.raw_row_no}</TableCell><TableCell>{log.issue_no}</TableCell><TableCell>{log.action_taken}</TableCell><TableCell>{log.reason_code || '—'}</TableCell><TableCell>{log.reason_detail || '—'}</TableCell></TableRow>)}
          </TableBody></Table>
        </CardContent>
      </Card>
    </div>
  );
}
