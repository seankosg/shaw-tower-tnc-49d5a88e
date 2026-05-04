import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatDdMmm } from '@/lib/format';
import { computeOMMStatus, OMM_STATUS_BADGE_VARIANT } from '@/lib/docs-omm-status';

interface OMMRow {
  id: string;
  sn: string | null;
  category: string | null;
  contract_doc: string | null;
  work_trade_material: string | null;
  contractor_supplier: string | null;
  draft_target_date: string | null;
  draft_actual_date: string | null;
  submission_target_date: string | null;
  submission_actual_date: string | null;
  approved_date: string | null;
  remarks: string | null;
}

export default function DocsOMMRawDataPage() {
  const [rows, setRows] = useState<OMMRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('docs_omm')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('sn', { ascending: true })
        .limit(2000);
      if (!cancelled) {
        if (error) toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
        setRows((data ?? []) as OMMRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">OMM Manuals — Raw Data</h1>
        <Badge variant="outline" className="text-xs">{rows.length} rows</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operation &amp; Maintenance Manual List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No OMM records yet. Use the Import page to upload an OMM list.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cat</TableHead>
                    <TableHead>S/N</TableHead>
                    <TableHead>Contract Doc</TableHead>
                    <TableHead>Work / Trade / Material</TableHead>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Draft Target</TableHead>
                    <TableHead>Draft Actual</TableHead>
                    <TableHead>Submission Target</TableHead>
                    <TableHead>Submission Actual</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const status = computeOMMStatus(r);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.category ?? ''}</TableCell>
                        <TableCell>{r.sn ?? ''}</TableCell>
                        <TableCell className="font-mono text-xs">{r.contract_doc ?? ''}</TableCell>
                        <TableCell>{r.work_trade_material ?? ''}</TableCell>
                        <TableCell>{r.contractor_supplier ?? ''}</TableCell>
                        <TableCell>{formatDdMmm(r.draft_target_date)}</TableCell>
                        <TableCell>{formatDdMmm(r.draft_actual_date)}</TableCell>
                        <TableCell>{formatDdMmm(r.submission_target_date)}</TableCell>
                        <TableCell>{formatDdMmm(r.submission_actual_date)}</TableCell>
                        <TableCell>{formatDdMmm(r.approved_date)}</TableCell>
                        <TableCell>
                          <Badge variant={OMM_STATUS_BADGE_VARIANT[status]} className="text-[10px]">
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.remarks ?? ''}</TableCell>
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
