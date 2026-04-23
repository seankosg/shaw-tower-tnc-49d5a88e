import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DefectStatusBadge } from '@/components/defects/DefectStatusBadge';
import { type DefectItem, formatPct } from '@/lib/defect-utils';

export default function DefectRawDataPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<DefectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await (supabase as any).from('defect_items').select('*').eq('is_active', true).order('issue_no', { ascending: false }).limit(2000);
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
    if (!text) return items;
    return items.filter((item) => [item.issue_no, item.area_type, item.area_level, item.area_location, item.main_trade, item.sub_trade, item.description, item.subcontractor_name, item.hdec_pic_name].some((value) => String(value ?? '').toLowerCase().includes(text)));
  }, [items, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Defect Raw Data</h1>
          <p className="text-sm text-muted-foreground">Issue No based defect and incompletion work list.</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Search defects..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-72" />
          <Button variant="outline" onClick={() => navigate('/defects/import')}>Import</Button>
        </div>
      </div>
      {loading ? <div className="text-sm text-muted-foreground">Loading defects...</div> : (
        <div className="overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Issue No</TableHead><TableHead>Type</TableHead><TableHead>Level</TableHead><TableHead>Location</TableHead><TableHead>Main Trade</TableHead><TableHead>Sub Trade</TableHead><TableHead>Status</TableHead><TableHead>Progress</TableHead><TableHead>Subcontractor</TableHead><TableHead>HDEC PIC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id} className="cursor-pointer" onClick={() => navigate(`/defects/${item.id}`)}>
                  <TableCell className="font-medium">{item.issue_no}</TableCell>
                  <TableCell>{item.area_type || '—'}</TableCell>
                  <TableCell>{item.area_level || '—'}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{item.area_location || '—'}</TableCell>
                  <TableCell>{item.main_trade || '—'}</TableCell>
                  <TableCell>{item.sub_trade || '—'}</TableCell>
                  <TableCell><DefectStatusBadge status={item.closure_status ?? item.status} /></TableCell>
                  <TableCell>{formatPct(item.actual_progress_pct)}</TableCell>
                  <TableCell>{item.subcontractor_name || '—'}</TableCell>
                  <TableCell>{item.hdec_pic_name || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
