import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatPct } from '@/lib/defect-utils';
import { formatDateTimeDdMmmYyyy, formatDdMmm } from '@/lib/format';

interface RevisionRow {
  id: string;
  defect_id: string;
  issue_no: string;
  subcontractor_issue_no: string | null;
  planned_old_date: string | null;
  planned_new_date: string | null;
  planned_diff_days: number | null;
  target_old_date: string | null;
  target_new_date: string | null;
  target_diff_days: number | null;
  closed_old_date: string | null;
  closed_new_date: string | null;
  closed_diff_days: number | null;
  progress_old_pct: number | null;
  progress_new_pct: number | null;
  progress_diff_pct: number | null;
  closure_status_old: string | null;
  closure_status_new: string | null;
  created_at: string;
  change_source: string | null;
  defect_items?: { area_type: string | null; area_level: string | null; area_location: string | null; main_trade: string | null; sub_trade: string | null; team: string | null; subcontractor_name: string | null; subsub_name: string | null; hdec_pic_name: string | null } | null;
}

export default function DefectScheduleRevisionPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RevisionRow[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (supabase as any)
      .from('defect_schedule_change_audit')
      .select('*, defect_items(area_type, area_level, area_location, main_trade, sub_trade, team, subcontractor_name, subsub_name, hdec_pic_name)')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }: any) => setRows(data ?? []));
  }, []);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return rows;
    return rows.filter((row) => [row.issue_no, row.subcontractor_issue_no, row.defect_items?.area_level, row.defect_items?.area_location, row.defect_items?.main_trade, row.defect_items?.sub_trade, row.defect_items?.subcontractor_name, row.defect_items?.hdec_pic_name].some((value) => String(value ?? '').toLowerCase().includes(text)));
  }, [rows, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">Defect Schedule Revision</h1><p className="text-sm text-muted-foreground">Schedule, progress, and closure changes.</p></div>
        <div className="flex gap-2"><Input placeholder="Search revisions..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-72" /><Button variant="outline" onClick={() => setQuery('')}>Clear Filters</Button></div>
      </div>
      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Issue No</TableHead><TableHead>Type</TableHead><TableHead>Level</TableHead><TableHead>Location</TableHead><TableHead>Main Trade</TableHead><TableHead>Sub Trade</TableHead><TableHead>Planned</TableHead><TableHead>Target</TableHead><TableHead>Closed</TableHead><TableHead>Progress</TableHead><TableHead>Closure Status</TableHead><TableHead>Source</TableHead><TableHead>Changed At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{filtered.map((row) => (
            <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/defects/${row.defect_id}`)}>
              <TableCell className="font-medium">{row.issue_no}</TableCell>
              <TableCell>{row.defect_items?.area_type || '—'}</TableCell>
              <TableCell>{row.defect_items?.area_level || '—'}</TableCell>
              <TableCell className="max-w-[220px] truncate">{row.defect_items?.area_location || '—'}</TableCell>
              <TableCell>{row.defect_items?.main_trade || '—'}</TableCell>
              <TableCell>{row.defect_items?.sub_trade || '—'}</TableCell>
              <TableCell><Delta oldValue={row.planned_old_date} newValue={row.planned_new_date} diff={row.planned_diff_days} /></TableCell>
              <TableCell><Delta oldValue={row.target_old_date} newValue={row.target_new_date} diff={row.target_diff_days} /></TableCell>
              <TableCell><Delta oldValue={row.closed_old_date} newValue={row.closed_new_date} diff={row.closed_diff_days} /></TableCell>
              <TableCell><Delta oldValue={formatPct(row.progress_old_pct)} newValue={formatPct(row.progress_new_pct)} diff={row.progress_diff_pct} suffix="%" /></TableCell>
              <TableCell>{row.closure_status_old || row.closure_status_new ? `${row.closure_status_old ?? '—'} → ${row.closure_status_new ?? '—'}` : '—'}</TableCell>
              <TableCell><Badge variant="outline">{row.change_source || '—'}</Badge></TableCell>
              <TableCell>{formatDateTimeDdMmmYyyy(row.created_at)}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
    </div>
  );
}

function Delta({ oldValue, newValue, diff, suffix = 'd' }: { oldValue?: string | null; newValue?: string | null; diff?: number | null; suffix?: string }) {
  if (!oldValue && !newValue) return <span className="text-muted-foreground">—</span>;
  return <div className="text-xs"><div>{formatDdMmm(oldValue)} → {formatDdMmm(newValue)}</div>{diff != null && <div className="text-muted-foreground">{diff > 0 ? '+' : ''}{diff}{suffix}</div>}</div>;
}
