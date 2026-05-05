import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, Upload, Download, Search } from 'lucide-react';
import { formatDdMmm } from '@/lib/format';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

type WStatus = 'A' | 'B' | 'C' | 'UR' | 'WIP' | 'Planned' | null;

interface WarrantyRow {
  id: string;
  item_no: number | null;
  category: string | null;
  warranted_item: string | null;
  team: string | null;
  subcontractor_name: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  warranty_period_years: number | null;
  r_subcontract_date: string | null;
  draft_status: WStatus;
  subcon_signing_status: WStatus;
  hdec_signing_status: WStatus;
  final_status: WStatus;
  current_stage: string | null;
  current_status: string | null;
  is_resubmission: boolean;
  resubmission_seq: number;
  parent_id: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  B: 'bg-amber-100 text-amber-800 border-amber-300',
  C: 'bg-orange-100 text-orange-800 border-orange-300',
  UR: 'bg-blue-100 text-blue-800 border-blue-300',
  WIP: 'bg-purple-100 text-purple-800 border-purple-300',
  Planned: 'bg-muted text-muted-foreground border-border',
};

function StatusBadge({ value }: { value: WStatus }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', STATUS_STYLES[value])}>{value}</Badge>
  );
}

export default function DocsWarrantyRawDataPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<WarrantyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const all: WarrantyRow[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await (supabase as any)
          .from('warranty_items')
          .select('id, item_no, category, warranted_item, team, subcontractor_name, hdec_pic_name, hdec_eng_name, warranty_period_years, r_subcontract_date, draft_status, subcon_signing_status, hdec_signing_status, final_status, current_stage, current_status, is_resubmission, resubmission_seq, parent_id')
          .eq('is_active', true)
          .order('item_no', { ascending: true })
          .order('resubmission_seq', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) { console.error(error); break; }
        if (!data || data.length === 0) break;
        all.push(...(data as WarrantyRow[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      if (!cancelled) {
        setRows(all);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [
      r.item_no?.toString(), r.category, r.warranted_item, r.team,
      r.subcontractor_name, r.hdec_pic_name, r.hdec_eng_name,
    ].some((v) => v && String(v).toLowerCase().includes(q)));
  }, [rows, search]);

  const handleExport = () => {
    const data = filtered.map((r) => ({
      'No': r.item_no,
      'Category': r.category,
      'Warranted Item': r.warranted_item,
      'Team': r.team,
      'Subcontractor': r.subcontractor_name,
      'HDEC PIC': r.hdec_pic_name,
      'HDEC ENG': r.hdec_eng_name,
      'Warranty Years': r.warranty_period_years,
      'Subcontract Date': r.r_subcontract_date,
      'D.Status': r.draft_status,
      'Subcon Sign': r.subcon_signing_status,
      'HDEC Sign': r.hdec_signing_status,
      'Final Status': r.final_status,
      'Stage': r.current_stage,
      'Status': r.current_status,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Warranty');
    XLSX.writeFile(wb, `warranty-raw-data-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Warranty Deeds — Raw Data</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading…' : `${filtered.length} of ${rows.length} items`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/docs/import?sub=warranty')}>
            <Upload className="mr-2 h-4 w-4" />Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" />Export
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Items</CardTitle>
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search no, category, item, subcontractor, PIC…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-auto p-0">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No warranty items yet. Use Import to upload the SHAW List of Warranties.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">No</TableHead>
                  <TableHead className="w-[110px]">Category</TableHead>
                  <TableHead>Warranted Item</TableHead>
                  <TableHead className="w-[110px]">Team</TableHead>
                  <TableHead className="w-[180px]">Subcontractor</TableHead>
                  <TableHead className="w-[110px]">HDEC PIC</TableHead>
                  <TableHead className="w-[60px] text-right">Yrs</TableHead>
                  <TableHead className="w-[100px]">SC Date</TableHead>
                  <TableHead className="w-[70px] text-center">Draft</TableHead>
                  <TableHead className="w-[80px] text-center">Subcon</TableHead>
                  <TableHead className="w-[80px] text-center">HDEC</TableHead>
                  <TableHead className="w-[70px] text-center">Final</TableHead>
                  <TableHead className="w-[110px]">Stage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/40',
                      r.is_resubmission && 'bg-muted/20',
                    )}
                    onClick={() => navigate(`/docs/warranty/${r.id}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      {r.item_no}
                      {r.is_resubmission && (
                        <span className="ml-1 text-[10px] text-muted-foreground">·{r.resubmission_seq}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{r.category ?? '—'}</TableCell>
                    <TableCell className="text-xs">{r.warranted_item ?? '—'}</TableCell>
                    <TableCell className="text-xs">{r.team ?? '—'}</TableCell>
                    <TableCell className="text-xs">{r.subcontractor_name ?? '—'}</TableCell>
                    <TableCell className="text-xs">{r.hdec_pic_name ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{r.warranty_period_years ?? '—'}</TableCell>
                    <TableCell className="text-xs">{formatDdMmm(r.r_subcontract_date) || '—'}</TableCell>
                    <TableCell className="text-center"><StatusBadge value={r.draft_status} /></TableCell>
                    <TableCell className="text-center"><StatusBadge value={r.subcon_signing_status} /></TableCell>
                    <TableCell className="text-center"><StatusBadge value={r.hdec_signing_status} /></TableCell>
                    <TableCell className="text-center"><StatusBadge value={r.final_status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.current_stage ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
