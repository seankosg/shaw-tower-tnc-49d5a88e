import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { SPARE_PART_STATUS_BADGE_VARIANT, normalizeSparePartStatus } from '@/lib/docs-spare-part-status';

interface SparePartRow {
  id: string;
  sn: string | null;
  category: string | null;
  parent_item: string | null;
  material: string | null;
  spec_ref: string | null;
  spares_requirements: string | null;
  unit: string | null;
  spares_quantity: string | null;
  storage_area_required: string | null;
  status: string | null;
  remarks: string | null;
}

export default function DocsSparePartRawDataPage() {
  const [rows, setRows] = useState<SparePartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('docs_spare_part')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('sn', { ascending: true })
        .limit(2000);
      if (!cancelled) {
        if (error) toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
        setRows((data ?? []) as SparePartRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Spare Parts — Raw Data</h1>
        <Badge variant="outline" className="text-xs">{rows.length} rows</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spare Stock Quantities Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No spare part records yet. Use the Import page to upload a Spare Stock list.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cat</TableHead>
                    <TableHead>S/N</TableHead>
                    <TableHead>Parent Item</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Spec Ref</TableHead>
                    <TableHead>Requirements</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Storage Area</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const norm = normalizeSparePartStatus(r.status);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.category ?? ''}</TableCell>
                        <TableCell>{r.sn ?? ''}</TableCell>
                        <TableCell>{r.parent_item ?? ''}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{r.material ?? ''}</TableCell>
                        <TableCell className="font-mono text-xs">{r.spec_ref ?? ''}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.spares_requirements ?? ''}</TableCell>
                        <TableCell>{r.unit ?? ''}</TableCell>
                        <TableCell>{r.spares_quantity ?? ''}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.storage_area_required ?? ''}</TableCell>
                        <TableCell>
                          {r.status ? (
                            <Badge variant={SPARE_PART_STATUS_BADGE_VARIANT[norm]} className="text-[10px]">
                              {r.status}
                            </Badge>
                          ) : ''}
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
