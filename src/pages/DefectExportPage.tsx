import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useDefectFieldConfig } from '@/hooks/useDefectFieldConfig';
import { exportDefectsWorkbook, filterDefectsForExport, resolveDefectExportColumns, type DefectColumnMode, type DefectExportFilters } from '@/lib/defect-export-utils';
import { type DefectItem } from '@/lib/defect-utils';
import { ALL_TEAMS, TEAM_LABELS } from '@/types/enums';

const ALL = '__all__';
const EMPTY_FILTERS: DefectExportFilters = {
  query: '', team: '', status: '', subcontractor: '', subsub: '', hdecPic: '', mainTrade: '', subTrade: '', level: '',
  dateField: 'planned_date', dateStart: '', dateEnd: '',
};

export default function DefectExportPage() {
  const [items, setItems] = useState<DefectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<DefectExportFilters>(EMPTY_FILTERS);
  const [columnMode, setColumnMode] = useState<DefectColumnMode>('visible');
  const { toast } = useToast();
  const { fields } = useDefectFieldConfig();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).from('defect_items').select('*').eq('is_active', true).order('issue_no').limit(5000);
      if (!cancelled) {
        if (error) toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
        setItems(data ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const setFilter = <K extends keyof DefectExportFilters>(key: K, value: DefectExportFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const unique = (field: keyof DefectItem) => [...new Set(items.map((item) => String(item[field] ?? '')).filter(Boolean))].sort();
  const filtered = useMemo(() => filterDefectsForExport(items, filters), [items, filters]);

  const exportData = () => {
    const columns = resolveDefectExportColumns(columnMode, fields);
    const result = exportDefectsWorkbook(filtered, { columns, configs: fields, filters });
    toast({ title: 'Export complete', description: `${result.rowCount} defect items exported.` });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Defect Advanced Export</h1>
        <p className="text-sm text-muted-foreground">Filter defects and export Defects, Summary, and Export Info sheets.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Input placeholder="Issue, subcontractor no, location..." value={filters.query} onChange={(e) => setFilter('query', e.target.value)} className="xl:col-span-2" />
          <FilterSelect value={filters.team} placeholder="Team" options={ALL_TEAMS.map((team) => ({ value: team, label: TEAM_LABELS[team] }))} onChange={(v) => setFilter('team', v)} />
          <FilterSelect value={filters.status} placeholder="Status" options={['Open', 'Closed', 'Done', 'WIP', 'Hold'].map((v) => ({ value: v, label: v }))} onChange={(v) => setFilter('status', v)} />
          <FilterSelect value={filters.subcontractor} placeholder="Subcontractor" options={unique('subcontractor_name').map((v) => ({ value: v, label: v }))} onChange={(v) => setFilter('subcontractor', v)} />
          <FilterSelect value={filters.subsub} placeholder="Sub-Sub" options={unique('subsub_name').map((v) => ({ value: v, label: v }))} onChange={(v) => setFilter('subsub', v)} />
          <FilterSelect value={filters.hdecPic} placeholder="HDEC PIC" options={unique('hdec_pic_name').map((v) => ({ value: v, label: v }))} onChange={(v) => setFilter('hdecPic', v)} />
          <FilterSelect value={filters.mainTrade} placeholder="Main Trade" options={unique('main_trade').map((v) => ({ value: v, label: v }))} onChange={(v) => setFilter('mainTrade', v)} />
          <FilterSelect value={filters.subTrade} placeholder="Sub Trade" options={unique('sub_trade').map((v) => ({ value: v, label: v }))} onChange={(v) => setFilter('subTrade', v)} />
          <FilterSelect value={filters.level} placeholder="Level" options={unique('area_level').map((v) => ({ value: v, label: v }))} onChange={(v) => setFilter('level', v)} />
          <Select value={filters.dateField} onValueChange={(value) => setFilter('dateField', value as DefectExportFilters['dateField'])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="planned_date">Planned Date</SelectItem><SelectItem value="target_date">Target Date</SelectItem><SelectItem value="actual_date">Actual Date</SelectItem><SelectItem value="closed_date">Closed Date</SelectItem><SelectItem value="updated_at">Updated Date</SelectItem></SelectContent></Select>
          <Input type="date" value={filters.dateStart} onChange={(e) => setFilter('dateStart', e.target.value)} />
          <Input type="date" value={filters.dateEnd} onChange={(e) => setFilter('dateEnd', e.target.value)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Export Options</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Select value={columnMode} onValueChange={(value) => setColumnMode(value as DefectColumnMode)}><SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Columns</SelectItem><SelectItem value="visible">Visible / Field Config Columns</SelectItem><SelectItem value="responsibility">Responsibility Fields</SelectItem><SelectItem value="schedule">Schedule Fields</SelectItem><SelectItem value="progress">Progress Fields</SelectItem></SelectContent></Select>
            <span className="text-sm text-muted-foreground">{filtered.length} rows matched</span>
          </div>
          <Button onClick={exportData} disabled={loading}>{loading ? 'Loading...' : 'Export Excel'}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({ value, placeholder, options, onChange }: { value: string; placeholder: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? '' : next)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent><SelectItem value={ALL}>{placeholder}</SelectItem>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}
