import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DefectStatusBadge } from '@/components/defects/DefectStatusBadge';
import { type DefectItem, formatPct } from '@/lib/defect-utils';
import { useDefectFieldConfig } from '@/hooks/useDefectFieldConfig';

const RAW_FIELDS = ['issue_no', 'subcontractor_issue_no', 'subcontractor_issue_source', 'area_type', 'area_level', 'area_location', 'main_trade', 'sub_trade', 'closure_status', 'actual_progress_pct', 'subcontractor_name', 'hdec_pic_name'];

export default function DefectRawDataPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [items, setItems] = useState<DefectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(params.get('q') ?? '');
  const { isFieldVisible, getLabel, sortFieldNames } = useDefectFieldConfig();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await (supabase as any).from('defect_items').select('*').eq('is_active', true).order('issue_no', { ascending: false }).limit(5000);
      if (!cancelled) {
        setItems(data ?? []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !text || [item.issue_no, item.subcontractor_issue_no, item.subcontractor_issue_source, item.area_type, item.area_level, item.area_location, item.main_trade, item.sub_trade, item.description, item.subcontractor_name, item.subsub_name, item.hdec_pic_name]
        .some((value) => String(value ?? '').toLowerCase().includes(text));
      return matchesQuery
        && (!params.get('team') || item.team === params.get('team'))
        && (!params.get('subcontractor') || item.subcontractor_name === params.get('subcontractor'))
        && (!params.get('subsub') || item.subsub_name === params.get('subsub'))
        && (!params.get('hdecPic') || item.hdec_pic_name === params.get('hdecPic'))
        && (!params.get('level') || item.area_level === params.get('level'))
        && (!params.get('mainTrade') || item.main_trade === params.get('mainTrade'))
        && (!params.get('subTrade') || item.sub_trade === params.get('subTrade'))
        && (!params.get('dateStart') || (item.target_date ?? item.planned_date ?? '') >= params.get('dateStart')!)
        && (!params.get('dateEnd') || (item.target_date ?? item.planned_date ?? '') <= params.get('dateEnd')!);
    });
  }, [items, query, params]);

  const fields = sortFieldNames(RAW_FIELDS).filter(isFieldVisible);
  const renderValue = (item: DefectItem, field: string) => {
    if (field === 'closure_status') return <DefectStatusBadge status={item.closure_status ?? item.status} />;
    if (field === 'actual_progress_pct') return formatPct(item.actual_progress_pct);
    return String((item as any)[field] ?? '—');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Defect Raw Data</h1>
          <p className="text-sm text-muted-foreground">Issue No and subcontractor issue tracking data.</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Search issue, subcontractor issue no..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-80" />
          <Button variant="outline" onClick={() => navigate('/defects/import')}>Import</Button>
        </div>
      </div>
      {loading ? <div className="text-sm text-muted-foreground">Loading defects...</div> : (
        <div className="overflow-auto rounded-md border">
          <Table>
            <TableHeader><TableRow>{fields.map((field) => <TableHead key={field}>{getLabel(field)}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/defects/${item.id}`)}>
                  {fields.map((field) => <TableCell key={field} className={field === 'issue_no' ? 'font-medium' : field === 'area_location' ? 'max-w-[220px] truncate' : ''}>{renderValue(item, field)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
