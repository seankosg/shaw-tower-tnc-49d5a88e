import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDdMmm, formatSignedDays } from '@/lib/format';

type Stage = 'pred' | 't1' | 't2';

interface ScheduleChangeAudit {
  id: string;
  created_at: string;
  raw_row_no: number | null;
  project_id: string;
  system_id: string;
  item_no: string;
  mos_code: string;
  subtest_code: string | null;
  subtest_id: string;
  pred_old_date: string | null;
  pred_new_date: string | null;
  pred_diff_days: number | null;
  pred_prev_gap_days: number | null;
  pred_cur_gap_days: number | null;
  t1_old_date: string | null;
  t1_new_date: string | null;
  t1_diff_days: number | null;
  t1_prev_gap_days: number | null;
  t1_cur_gap_days: number | null;
  t2_old_date: string | null;
  t2_new_date: string | null;
  t2_diff_days: number | null;
  t2_prev_gap_days: number | null;
  t2_cur_gap_days: number | null;
}

const stageGroups = ['pred', 't1', 't2'] as const;
const stageLabels: Record<Stage, string> = { pred: 'Pred', t1: 'T1', t2: 'T2' };

const formatGap = (value: number | null | undefined) => value == null ? '—' : String(value);
const diffClass = (value: number | null) =>
  value == null ? '' : value > 0 ? 'text-destructive font-medium' : value < 0 ? 'text-primary font-medium' : 'text-muted-foreground';

function StageCells({ row, stage }: { row: ScheduleChangeAudit; stage: Stage }) {
  const oldDate = row[`${stage}_old_date` as keyof ScheduleChangeAudit] as string | null;
  const newDate = row[`${stage}_new_date` as keyof ScheduleChangeAudit] as string | null;
  const diff = row[`${stage}_diff_days` as keyof ScheduleChangeAudit] as number | null;
  const prevGap = row[`${stage}_prev_gap_days` as keyof ScheduleChangeAudit] as number | null;
  const curGap = row[`${stage}_cur_gap_days` as keyof ScheduleChangeAudit] as number | null;

  return (
    <>
      <TableCell className="text-xs whitespace-nowrap">{formatDdMmm(oldDate)}</TableCell>
      <TableCell className="text-xs whitespace-nowrap">{formatDdMmm(newDate)}</TableCell>
      <TableCell className={`text-xs text-right ${diffClass(diff)}`}>{formatSignedDays(diff)}</TableCell>
      <TableCell className="text-xs text-right">{formatGap(prevGap)}</TableCell>
      <TableCell className="text-xs text-right">{formatGap(curGap)}</TableCell>
    </>
  );
}

export default function ScheduleRevisionPage() {
  const navigate = useNavigate();
  const [changes, setChanges] = useState<ScheduleChangeAudit[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [systemCodes, setSystemCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [auditRes, projectRes, systemRes] = await Promise.all([
        supabase
          .from('schedule_change_audit')
          .select('*')
          .order('created_at', { ascending: false })
          .order('raw_row_no', { ascending: true })
          .limit(500),
        supabase.from('projects').select('id, project_code, project_name').eq('is_active', true),
        supabase.from('system_master').select('id, system_code').eq('is_active', true),
      ]);

      if (cancelled) return;
      setChanges((auditRes.data as ScheduleChangeAudit[]) ?? []);
      setProjectNames(Object.fromEntries((projectRes.data ?? []).map(p => [p.id, p.project_code || p.project_name])));
      setSystemCodes(Object.fromEntries((systemRes.data ?? []).map(s => [s.id, s.system_code])));
      setLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const changeCountLabel = useMemo(() => `${changes.length.toLocaleString()} revisions`, [changes.length]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <CalendarClock className="h-5 w-5 text-primary" />
            Schedule Revision
          </h1>
          <p className="text-xs text-muted-foreground">
            Pred / T1 / T2 planned date revision history · Recent 500 records · {changeCountLabel}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4">
              <Skeleton className="h-[520px] w-full" />
            </div>
          ) : (
            <div className="max-h-[680px] overflow-auto rounded-md border-0">
              <Table className="min-w-[1680px]">
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead rowSpan={2} className="text-xs whitespace-nowrap">Changed At</TableHead>
                    <TableHead rowSpan={2} className="text-xs">Project</TableHead>
                    <TableHead rowSpan={2} className="text-xs">System</TableHead>
                    <TableHead rowSpan={2} className="text-xs">Row</TableHead>
                    <TableHead rowSpan={2} className="text-xs">Item No</TableHead>
                    <TableHead rowSpan={2} className="text-xs">MOS Code</TableHead>
                    <TableHead rowSpan={2} className="text-xs">Subtest ID</TableHead>
                    {stageGroups.map(stage => <TableHead key={stage} colSpan={5} className="text-center text-xs border-l">{stageLabels[stage]}</TableHead>)}
                  </TableRow>
                  <TableRow>
                    {stageGroups.flatMap(stage => ['Old date', 'New date', 'Diff', 'Prev.Gap', 'Cur.Gap'].map(label => (
                      <TableHead key={`${stage}-${label}`} className="text-xs whitespace-nowrap border-l first:border-l-0">{label}</TableHead>
                    )))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changes.length === 0 ? (
                    <TableRow><TableCell colSpan={22} className="py-8 text-center text-muted-foreground">No schedule revisions</TableCell></TableRow>
                  ) : changes.map(row => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/subtests/${row.subtest_id}`)}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{projectNames[row.project_id] || '—'}</TableCell>
                      <TableCell className="text-xs">{systemCodes[row.system_id] || '—'}</TableCell>
                      <TableCell className="text-xs">{row.raw_row_no ?? '—'}</TableCell>
                      <TableCell className="text-xs">{row.item_no}</TableCell>
                      <TableCell className="text-xs">{row.mos_code}</TableCell>
                      <TableCell className="text-xs">{row.subtest_code || '—'}</TableCell>
                      {stageGroups.map(stage => <StageCells key={stage} row={row} stage={stage} />)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}