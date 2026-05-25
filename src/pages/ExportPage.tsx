import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetch-all-rows';
import XLSX from 'xlsx-js-style';
import { Button } from '@/components/ui/button';
import { isoToExcelSerial, isoTimestampToExcelSerial, DATE_NUMFMT, DATETIME_NUMFMT } from '@/lib/excel-date-cell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { TcStatus, DataSource } from '@/types/enums';
import { TC_STATUS_OPTIONS, DATA_SOURCE_LABELS } from '@/types/enums';
import { useSearchParams } from 'react-router-dom';


export default function ExportPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [systems, setSystems] = useState<{ id: string; system_code: string }[]>([]);
  const [systemFilter, setSystemFilter] = useState(searchParams.get('system') || 'all');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (systemFilter === 'all') next.delete('system'); else next.set('system', systemFilter);
    if (statusFilter === 'all') next.delete('status'); else next.set('status', statusFilter);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [systemFilter, statusFilter, searchParams, setSearchParams]);

  useEffect(() => {
    supabase.from('system_master').select('id, system_code').eq('is_active', true)
      .then(({ data }) => { if (data) setSystems(data); });
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      let query = supabase
        .from('subtests')
        .select('item_no, equipment, subtest_id, mos_code, description, predecessor_status_raw, t1_planned_date, t1_status, t2_planned_date, t2_status, subcontractor_name, subsub_name, hdec_pic_name, data_source_type, updated_at, system_master!inner(system_code)')
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (systemFilter !== 'all') {
        const sys = systems.find(s => s.system_code === systemFilter);
        if (sys) query = query.eq('system_id', sys.id);
      }
      if (statusFilter !== 'all') {
        query = query.or(`t1_status.eq.${statusFilter},t2_status.eq.${statusFilter}`);
      }

      const { data, error } = await query.limit(5000);
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: 'No data to export', variant: 'destructive' });
        setExporting(false);
        return;
      }

      const headers = [
        'System', 'Item No', 'Equipment', 'Subtest ID', 'MOS Code', 'Description',
        'Predecessor Status', 'T1 Planned', 'T1 Status', 'T2 Planned', 'T2 Status',
        'Subcontractor', 'Sub-Sub', 'HDEC PIC', 'Source', 'Updated',
      ];
      // index of date / datetime columns
      const DATE_COL_IDX = new Set([7, 9]);     // T1 Planned, T2 Planned
      const DATETIME_COL_IDX = new Set([15]);   // Updated

      const rawRows = data.map((r: any) => [
        r.system_master?.system_code || '',
        r.item_no,
        r.equipment || '',
        r.subtest_id,
        r.mos_code,
        r.description || '',
        r.predecessor_status_raw || '',
        r.t1_planned_date || '',
        r.t1_status || '',
        r.t2_planned_date || '',
        r.t2_status || '',
        r.subcontractor_name || '',
        r.subsub_name || '',
        r.hdec_pic_name || '',
        r.data_source_type ? (DATA_SOURCE_LABELS[r.data_source_type as DataSource] || r.data_source_type) : '',
        r.updated_at || '',
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers]);
      for (let r = 0; r < rawRows.length; r++) {
        const rowIdx = r + 1; // header at row 0
        for (let c = 0; c < headers.length; c++) {
          const value = rawRows[r][c];
          const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
          if (DATE_COL_IDX.has(c)) {
            const serial = isoToExcelSerial(value as string);
            if (serial != null) {
              ws[addr] = { t: 'n', v: serial, z: DATE_NUMFMT };
              continue;
            }
          } else if (DATETIME_COL_IDX.has(c)) {
            const serial = isoTimestampToExcelSerial(value as string);
            if (serial != null) {
              ws[addr] = { t: 'n', v: serial, z: DATETIME_NUMFMT };
              continue;
            }
          }
          ws[addr] = { t: 's', v: value == null ? '' : String(value) };
        }
      }
      const lastCol = XLSX.utils.encode_col(headers.length - 1);
      ws['!ref'] = `A1:${lastCol}${rawRows.length + 1}`;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Subtests');

      // Auto-size columns
      ws['!cols'] = headers.map((key, c) => ({
        wch: Math.max(
          key.length,
          ...rawRows.map(row => String(row[c] ?? '').length),
        ) + 2,
      }));

      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      XLSX.writeFile(wb, `SHAW_TC_Export_${date}.xlsx`);
      toast({ title: 'Export complete', description: `${rawRows.length} rows exported` });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    }
    setExporting(false);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Export Data</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export Options</CardTitle>
          <CardDescription>Select filters and export to Excel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={systemFilter} onValueChange={setSystemFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Systems" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Systems</SelectItem>
                {systems.map(s => (
                  <SelectItem key={s.id} value={s.system_code}>{s.system_code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {TC_STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleExport} disabled={exporting}>
            <Download className="mr-1.5 h-4 w-4" />
            {exporting ? 'Exporting...' : 'Download Excel'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
