import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { SPARE_PART_STATUS_BADGE_VARIANT, normalizeSparePartStatus } from '@/lib/docs-spare-part-status';

interface SparePartRow {
  id: string;
  sn: string | null;
  sn_outline: string | null;
  level: string | null;
  category: string | null;
  parent_item: string | null;
  sub_category: string | null;
  material: string | null;
  spec_ref: string | null;
  spares_requirements: string | null;
  unit: string | null;
  spares_quantity: string | null;
  storage_area_required: string | null;
  status: string | null;
  remarks: string | null;
}

type LevelFilter = 'leaf' | 'all' | 'category' | 'parent' | 'subcategory';

const LEVEL_LABEL: Record<string, string> = {
  category: 'Cat',
  parent: 'Parent',
  subcategory: 'Sub',
  leaf: 'Leaf',
};

const LEVEL_BADGE: Record<string, 'default' | 'secondary' | 'outline'> = {
  category: 'default',
  parent: 'secondary',
  subcategory: 'outline',
  leaf: 'outline',
};

export default function DocsSparePartRawDataPage() {
  const [rows, setRows] = useState<SparePartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('leaf');
  const { toast } = useToast();
  const navigate = useNavigate();

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('docs_spare_part')
      .select('*')
      .eq('is_active', true)
      .order('sn', { ascending: true })
      .limit(2000);
    if (error) toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
    setRows((data ?? []) as SparePartRow[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void reload(); }, [reload]);

  const filtered = useMemo(() => {
    if (levelFilter === 'all') return rows;
    return rows.filter((r) => (r.level ?? 'leaf') === levelFilter);
  }, [rows, levelFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Spare Parts — Raw Data</h1>
        <Badge variant="outline" className="text-xs">{filtered.length} / {rows.length} rows</Badge>
      </div>

      <Tabs value={levelFilter} onValueChange={(v) => setLevelFilter(v as LevelFilter)}>
        <TabsList>
          <TabsTrigger value="leaf">Leaf only</TabsTrigger>
          <TabsTrigger value="subcategory">Sub-category</TabsTrigger>
          <TabsTrigger value="parent">Parent</TabsTrigger>
          <TabsTrigger value="category">Category</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spare Stock Quantities Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No spare part records yet. Use the Import page to upload a Spare Stock list.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>S/N</TableHead>
                    <TableHead>Outline</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Sub-category</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Spec Ref</TableHead>
                    <TableHead>Requirements</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Storage Area</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const norm = normalizeSparePartStatus(r.status);
                    const lvl = r.level ?? 'leaf';
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/docs/spare-part/${r.id}`)}
                      >
                        <TableCell className="font-mono text-xs">{r.sn ?? ''}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.sn_outline ?? ''}</TableCell>
                        <TableCell>
                          <Badge variant={LEVEL_BADGE[lvl] ?? 'outline'} className="text-[10px]">
                            {LEVEL_LABEL[lvl] ?? lvl}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{r.category ?? ''}</TableCell>
                        <TableCell>{r.parent_item ?? ''}</TableCell>
                        <TableCell>{r.sub_category ?? ''}</TableCell>
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
