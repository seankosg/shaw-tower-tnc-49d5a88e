import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Download, Search } from 'lucide-react';
import {
  SPARE_PART_STATUS_BADGE_VARIANT,
  normalizeSparePartStatus,
} from '@/lib/docs-spare-part-status';
import { formatDdMmm } from '@/lib/format';

interface SparePartRow {
  id: string;
  sn: string | null;
  level: string | null;
  category: string | null;
  sub_category: string | null;
  parent_item: string | null;
  material: string | null;
  spec_ref: string | null;
  location: string | null;
  floor_level: string | null;
  item_type: string | null;
  specification: string | null;
  size: string | null;
  spares_requirements: string | null;
  unit: string | null;
  spares_quantity: string | null;
  storage_area_required: string | null;
  status: string | null;
  po_status: string | null;
  material_lead_time: string | null;
  planned_confirm_date: string | null;
  actual_confirm_date: string | null;
  direction_to_subcon_date: string | null;
  eta_date: string | null;
  planned_po_date: string | null;
  actual_po_date: string | null;
  planned_delivery_date: string | null;
  actual_delivery_date: string | null;
  subcontractor_name: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  team: string | null;
  trade: string | null;
  remarks: string | null;
}

function fmtDate(v: string | null): string {
  if (!v) return '';
  return formatDdMmm(String(v).slice(0, 10));
}

export default function DocsSparePartRawDataPage() {
  const [rows, setRows] = useState<SparePartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { toast } = useToast();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('docs_spare_part')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('sn', { ascending: true })
      .limit(2000);
    if (error) toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
    setRows((data ?? []) as SparePartRow[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const blob = [
        r.sn, r.parent_item, r.material, r.spec_ref, r.location, r.floor_level,
        r.item_type, r.specification, r.size, r.spares_requirements,
        r.subcontractor_name, r.hdec_pic_name, r.hdec_eng_name, r.team, r.trade,
        r.status, r.po_status, r.remarks,
      ].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search]);

  const handleExport = useCallback(async () => {
    try {
      const XLSX = (await import('xlsx-js-style')).default;
      const { isoToExcelSerial, DATE_NUMFMT } = await import('@/lib/excel-date-cell');
      const { STYLE_TITLE, STYLE_META_LABEL, STYLE_META_VALUE, STYLE_HEADER, STYLE_DATA, setCell, setDateCell } =
        await import('@/lib/excel-export');

      const DATE_KEYS = new Set([
        'planned_confirm_date','actual_confirm_date','direction_to_subcon_date','eta_date',
        'planned_po_date','actual_po_date','planned_delivery_date','actual_delivery_date',
      ]);
      const cols: Array<[keyof SparePartRow, string]> = [
        ['category', 'Cat'], ['sn', 'S/N'], ['parent_item', 'Parent Item'],
        ['sub_category', 'Sub-category'], ['material', 'Material Description'],
        ['spec_ref', 'Spec Ref'], ['location', 'Location'], ['floor_level', 'Floor Level'],
        ['item_type', 'Type'], ['specification', 'Specification'], ['size', 'Size'],
        ['spares_requirements', 'Spares Requirements'], ['unit', 'Unit'],
        ['spares_quantity', 'Quantity'], ['storage_area_required', 'Storage Area'],
        ['status', 'Status'], ['material_lead_time', 'Material Lead Time'],
        ['planned_confirm_date', 'Planned Confirmation Date'],
        ['actual_confirm_date', 'Actual Confirmation Date'],
        ['direction_to_subcon_date', 'Direction to Subcon Date'],
        ['eta_date', 'ETA Date'],
        ['planned_po_date', 'Planned PO Issuance Date'],
        ['actual_po_date', 'Actual PO Issuance Date'],
        ['po_status', 'PO Status'],
        ['planned_delivery_date', 'Planned Delivery Date'],
        ['actual_delivery_date', 'Actual Delivery Date'],
        ['subcontractor_name', 'Subcontractor'], ['hdec_pic_name', 'HDEC PIC'],
        ['hdec_eng_name', 'HDEC ENG'], ['team', 'Team'], ['trade', 'Trade'],
        ['remarks', 'Remarks'],
      ];

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const fileTs = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;

      const headerRow = cols.map(([, l]) => l);
      const aoa: any[][] = [
        ['SHAW Spare Parts — Raw Data Export'],
        [`Exported: ${ts}  by  ${profile?.name ?? '—'}`],
        ['Source: Spare Parts (direct)'],
        [`Search: ${search.trim() ? `"${search.trim()}"` : '(none)'}`],
        ['Filters: (none)'],
        ['Sort: Category ↑, S/N ↑'],
        [],
        headerRow,
        ...filtered.map((r) => cols.map(([k]) => {
          const v = (r as any)[k];
          if (v == null || v === '') return '';
          return DATE_KEYS.has(k as string) ? '' : v;
        })),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      const colCount = headerRow.length;
      const merges: any[] = [];
      for (let r = 0; r < 6; r++) merges.push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
      ws['!merges'] = merges;
      ws['!cols'] = cols.map(([k]) => ({ wch: k === 'material' || k === 'specification' ? 32 : DATE_KEYS.has(k as string) ? 12 : 16 }));

      setCell(ws, 0, 0, aoa[0][0], STYLE_TITLE);
      for (let r = 1; r <= 5; r++) setCell(ws, r, 0, aoa[r][0], r === 1 ? STYLE_META_LABEL : STYLE_META_VALUE);
      for (let c = 0; c < headerRow.length; c++) setCell(ws, 7, c, headerRow[c], STYLE_HEADER);

      for (let r = 0; r < filtered.length; r++) {
        const row = filtered[r];
        for (let c = 0; c < cols.length; c++) {
          const [k] = cols[c];
          const v = (row as any)[k];
          if (DATE_KEYS.has(k as string)) {
            const serial = isoToExcelSerial(v ?? null);
            if (serial != null) {
              setDateCell(ws, 8 + r, c, serial, STYLE_DATA, DATE_NUMFMT);
              continue;
            }
          }
          setCell(ws, 8 + r, c, v ?? '', STYLE_DATA);
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Spare Parts');
      XLSX.writeFile(wb, `SHAW_SpareParts_${fileTs}.xlsx`);
      toast({ title: 'Export complete', description: `${filtered.length} rows exported.` });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err?.message ?? String(err), variant: 'destructive' });
    }
  }, [filtered, search, profile, toast]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Spare Parts — Raw Data</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{filtered.length} / {rows.length} rows</Badge>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export Excel
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Spare Stock Quantities Summary</CardTitle>
          <div className="relative w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder="Search S/N, material, subcon, ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? 'No spare part records yet. Use the Import page to upload a Spare Stock list.'
                : 'No rows match the search.'}
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
                    <TableHead>Location</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>PO Status</TableHead>
                    <TableHead>Lead Time</TableHead>
                    <TableHead>Planned PO</TableHead>
                    <TableHead>Actual PO</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Planned Delivery</TableHead>
                    <TableHead>Actual Delivery</TableHead>
                    <TableHead>Subcontractor</TableHead>
                    <TableHead>HDEC PIC</TableHead>
                    <TableHead>HDEC ENG</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const norm = normalizeSparePartStatus(r.status);
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/docs/spare-part/${r.id}`)}
                      >
                        <TableCell>{r.category ?? ''}</TableCell>
                        <TableCell className="font-mono text-xs">{r.sn ?? ''}</TableCell>
                        <TableCell>{r.parent_item ?? ''}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{r.material ?? ''}</TableCell>
                        <TableCell>{r.location ?? ''}</TableCell>
                        <TableCell>{r.floor_level ?? ''}</TableCell>
                        <TableCell>{r.item_type ?? ''}</TableCell>
                        <TableCell>{r.size ?? ''}</TableCell>
                        <TableCell>{r.spares_quantity ?? ''}</TableCell>
                        <TableCell>{r.unit ?? ''}</TableCell>
                        <TableCell>
                          {r.status ? (
                            <Badge variant={SPARE_PART_STATUS_BADGE_VARIANT[norm]} className="text-[10px]">
                              {r.status}
                            </Badge>
                          ) : ''}
                        </TableCell>
                        <TableCell>
                          {r.po_status ? <Badge variant="outline" className="text-[10px]">{r.po_status}</Badge> : ''}
                        </TableCell>
                        <TableCell>{r.material_lead_time ?? ''}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.planned_po_date)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.actual_po_date)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.eta_date)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.planned_delivery_date)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.actual_delivery_date)}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{r.subcontractor_name ?? ''}</TableCell>
                        <TableCell>{r.hdec_pic_name ?? ''}</TableCell>
                        <TableCell>{r.hdec_eng_name ?? ''}</TableCell>
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
