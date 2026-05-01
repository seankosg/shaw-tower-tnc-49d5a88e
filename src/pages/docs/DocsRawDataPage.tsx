import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppSetting } from '@/hooks/useAppSettings';
import { computeRisk } from '@/lib/docs-risk';

interface Row {
  id: string;
  document_no: string;
  revision: string | null;
  title: string | null;
  discipline: string | null;
  organisation_raw: string | null;
  aconex_status: string | null;
  is_submitted: boolean;
  submitted_date: string | null;
  approved_date: string | null;
  project_id: string;
}

export default function DocsRawDataPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [scDateMap, setScDateMap] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { value: leadDays } = useAppSetting<number>('docs_lead_days_as_built', 30);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('docs_drawings')
        .select('id, document_no, revision, title, discipline, organisation_raw, aconex_status, is_submitted, submitted_date, approved_date, project_id')
        .eq('sub_module', 'as_built')
        .eq('is_active', true)
        .order('document_no');
      if (data) setRows(data as Row[]);
      const { data: settings } = await supabase
        .from('app_settings').select('key, value').like('key', 'docs_sc_date_%');
      if (settings) {
        const map: Record<string, string> = {};
        for (const s of settings) {
          const projectId = s.key.replace('docs_sc_date_', '');
          if (typeof s.value === 'string') map[projectId] = s.value;
        }
        setScDateMap(map);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.document_no.toLowerCase().includes(q)
      || (r.title?.toLowerCase().includes(q) ?? false)
      || (r.discipline?.toLowerCase().includes(q) ?? false);
  });

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">As-Built Drawings</h1>
        <p className="text-sm text-muted-foreground">{filtered.length.toLocaleString()} drawings</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drawings Register</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search document no / title / discipline…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4 max-w-md"
          />
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document No</TableHead>
                    <TableHead>Rev</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Discipline</TableHead>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 500).map(r => {
                    const risk = computeRisk(r.is_submitted, scDateMap[r.project_id], leadDays);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">
                          <Link to={`/docs/${r.id}`} className="text-primary hover:underline">{r.document_no}</Link>
                        </TableCell>
                        <TableCell className="text-xs">{r.revision || '—'}</TableCell>
                        <TableCell className="max-w-md truncate text-xs">{r.title || '—'}</TableCell>
                        <TableCell className="text-xs">{r.discipline || '—'}</TableCell>
                        <TableCell className="text-xs">{r.organisation_raw || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={r.is_submitted ? 'default' : 'outline'} className="text-[10px]">
                            {r.aconex_status || (r.is_submitted ? 'Submitted' : 'Pending')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            risk === 'red' ? 'bg-red-100 text-red-800 hover:bg-red-100'
                            : risk === 'amber' ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
                            : 'bg-green-100 text-green-800 hover:bg-green-100'
                          }>
                            {risk.toUpperCase()}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filtered.length > 500 && (
                <p className="p-2 text-center text-xs text-muted-foreground">Showing first 500 of {filtered.length}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
