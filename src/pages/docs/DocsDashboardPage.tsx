import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAppSetting } from '@/hooks/useAppSettings';
import { computeRisk, type RiskLevel } from '@/lib/docs-risk';
import { FileText, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

interface DrawingRow {
  id: string;
  document_no: string;
  title: string | null;
  discipline: string | null;
  is_submitted: boolean;
  project_id: string;
}

export default function DocsDashboardPage() {
  const [rows, setRows] = useState<DrawingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scDateMap, setScDateMap] = useState<Record<string, string>>({});
  const { value: leadDays } = useAppSetting<number>('docs_lead_days_as_built', 30);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('docs_drawings')
        .select('id, document_no, title, discipline, is_submitted, project_id')
        .eq('sub_module', 'as_built')
        .eq('is_active', true);
      if (!cancelled && data) setRows(data as DrawingRow[]);

      // Load all SC date settings
      const { data: settings } = await supabase
        .from('app_settings')
        .select('key, value')
        .like('key', 'docs_sc_date_%');
      if (!cancelled && settings) {
        const map: Record<string, string> = {};
        for (const s of settings) {
          const projectId = s.key.replace('docs_sc_date_', '');
          if (typeof s.value === 'string') map[projectId] = s.value;
        }
        setScDateMap(map);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const riskBuckets = useMemo(() => {
    const buckets: Record<RiskLevel, number> = { green: 0, amber: 0, red: 0 };
    for (const r of rows) {
      const sc = scDateMap[r.project_id];
      const lvl = computeRisk(r.is_submitted, sc, leadDays);
      buckets[lvl]++;
    }
    return buckets;
  }, [rows, scDateMap, leadDays]);

  const total = rows.length;
  const submitted = rows.filter(r => r.is_submitted).length;
  const pending = total - submitted;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Docs Management — As-Built Drawings</h1>
        <p className="text-sm text-muted-foreground">As-Built 도면 제출 현황 대시보드</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={<FileText className="h-5 w-5" />} label="Total Drawings" value={total} />
        <KpiCard icon={<CheckCircle2 className="h-5 w-5 text-green-600" />} label="Approved" value={submitted} />
        <KpiCard icon={<Clock className="h-5 w-5 text-amber-600" />} label="Pending" value={pending} />
        <KpiCard icon={<AlertTriangle className="h-5 w-5 text-red-600" />} label="Red Risk" value={riskBuckets.red} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk Distribution</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Green: {riskBuckets.green}</Badge>
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Amber: {riskBuckets.amber}</Badge>
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Red: {riskBuckets.red}</Badge>
        </CardContent>
      </Card>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && total === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            아직 업로드된 도면이 없습니다. <strong>Import</strong> 탭에서 As-Built 등록부를 업로드하세요.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted p-2">{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
        </div>
      </CardContent>
    </Card>
  );
}
