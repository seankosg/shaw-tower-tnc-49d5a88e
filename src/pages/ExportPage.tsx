import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { TcStatus, DataSource } from '@/types/enums';
import { TC_STATUS_OPTIONS, DATA_SOURCE_LABELS } from '@/types/enums';

export default function ExportPage() {
  const { toast } = useToast();
  const [systems, setSystems] = useState<{ id: string; system_code: string }[]>([]);
  const [systemFilter, setSystemFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    supabase.from('system_master').select('id, system_code').eq('is_active', true)
      .then(({ data }) => { if (data) setSystems(data); });
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      let query = supabase
        .from('subtests')
        .select('item_no, equipment, subtest_id, mos_code, description, predecessor_status_raw, t1_planned_date, t1_status, t2_planned_date, t2_status, subcontractor_name, hdec_pic_name, data_source_type, updated_at, system_master!inner(system_code)')
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

      const rows = data.map((r: any) => ({
        'System': r.system_master?.system_code || '',
        'Item No': r.item_no,
        'Equipment': r.equipment || '',
        'Subtest ID': r.subtest_id,
        'MOS Code': r.mos_code,
        'Description': r.description || '',
        'Predecessor Status': r.predecessor_status_raw || '',
        'T1 Planned': r.t1_planned_date || '',
        'T1 Status': r.t1_status || '',
        'T2 Planned': r.t2_planned_date || '',
        'T2 Status': r.t2_status || '',
        'Subcontractor': r.subcontractor_name || '',
        'HDEC PIC': r.hdec_pic_name || '',
        'Source': r.data_source_type ? (DATA_SOURCE_LABELS[r.data_source_type as DataSource] || r.data_source_type) : '',
        'Updated': r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Subtests');

      // Auto-size columns
      const colWidths = Object.keys(rows[0]).map(key => ({
        wch: Math.max(key.length, ...rows.map(r => String((r as any)[key]).length)).toString().length + 2,
      }));
      ws['!cols'] = colWidths;

      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      XLSX.writeFile(wb, `SHAW_TC_Export_${date}.xlsx`);
      toast({ title: 'Export complete', description: `${rows.length} rows exported` });
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
