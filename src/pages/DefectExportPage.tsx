import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function DefectExportPage() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const exportData = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).from('defect_items').select('*').eq('is_active', true).order('issue_no');
    setLoading(false);
    if (error) {
      toast({ title: 'Export failed', description: error.message, variant: 'destructive' });
      return;
    }
    const rows = (data ?? []).map((item: any) => ({
      'Issue No': item.issue_no,
      'Subcontractor Issue No': item.subcontractor_issue_no,
      Type: item.area_type,
      Level: item.area_level,
      Location: item.area_location,
      'Main Trade': item.main_trade,
      'Sub Trade': item.sub_trade,
      Status: item.status,
      'Planned Date': item.planned_date,
      'Target Date': item.target_date,
      'Closed Date': item.closed_date,
      'Actual Progress %': item.actual_progress_pct,
      'Closure Status': item.closure_status,
      Subcontractor: item.subcontractor_name,
      'Sub-Sub': item.subsub_name,
      'HDEC PIC': item.hdec_pic_name,
      Remarks: item.remarks,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Defects');
    XLSX.writeFile(wb, `defect_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: 'Export complete', description: `${rows.length} defect items exported.` });
  };

  return (
    <Card>
      <CardHeader><CardTitle>Defect Export</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Export active defect items to Excel.</p>
        <Button onClick={exportData} disabled={loading}>{loading ? 'Exporting...' : 'Export Defects'}</Button>
      </CardContent>
    </Card>
  );
}
