import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { formatDdMmm } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';
import {
  PUNCH_GATE_LABEL,
  PUNCH_HEALTH_LABEL,
  type PunchGateStatus,
  type PunchProcurementStatus,
  type PunchHealthStatus,
} from '@/lib/punch-field-registry';

type PunchItem = Database['public']['Tables']['punch_items']['Row'];

const PAGE_SIZE = 1000;

const HEALTH_BADGE_CLASS: Record<PunchHealthStatus, string> = {
  ahead: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200',
  on_track: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950 dark:text-blue-200',
  behind: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200',
  critical: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200',
};

const GATE_DOT: Record<PunchGateStatus, string> = {
  not_required: 'bg-muted-foreground/30',
  pending: 'bg-amber-500',
  approved: 'bg-emerald-500',
};

const PROC_DOT: Record<PunchProcurementStatus, string> = {
  not_required: 'bg-muted-foreground/30',
  pending: 'bg-amber-500',
  partially_secured: 'bg-blue-500',
  secured: 'bg-emerald-500',
};

function GateDots({ row }: { row: PunchItem }) {
  const items: Array<{ label: string; color: string; status: string }> = [
    { label: 'Material Approval', color: GATE_DOT[row.material_approval_status], status: PUNCH_GATE_LABEL[row.material_approval_status] },
    { label: 'Material Procurement', color: PROC_DOT[row.material_procurement_status], status: row.material_procurement_status.replace(/_/g, ' ') },
    { label: 'Drawing Approval', color: GATE_DOT[row.drawing_approval_status], status: PUNCH_GATE_LABEL[row.drawing_approval_status] },
    { label: 'MOS Approval', color: GATE_DOT[row.mos_approval_status], status: PUNCH_GATE_LABEL[row.mos_approval_status] },
  ];
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center gap-1">
        {items.map((it) => (
          <Tooltip key={it.label}>
            <TooltipTrigger asChild>
              <span className={cn('inline-block h-2.5 w-2.5 rounded-full', it.color)} />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div className="font-medium">{it.label}</div>
              <div className="text-muted-foreground capitalize">{it.status}</div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

function HealthBadge({ status }: { status: PunchHealthStatus | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn('px-2 py-0.5 text-[10px] font-medium', HEALTH_BADGE_CLASS[status])}>
      {PUNCH_HEALTH_LABEL[status]}
    </Badge>
  );
}

function VarianceCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const cls = value > 0 ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-muted-foreground';
  const sign = value > 0 ? '+' : '';
  return <span className={cn('tabular-nums font-medium', cls)}>{sign}{value.toFixed(1)}%</span>;
}

function PctCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return <span className="tabular-nums">{value.toFixed(1)}%</span>;
}

export default function PunchRawDataPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<PunchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState<PunchHealthStatus | 'all'>('all');
  const [readyFilter, setReadyFilter] = useState<'all' | 'ready' | 'blocked'>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const all: PunchItem[] = [];
      let from = 0;
      // chunked fetch to bypass 1000-row limit
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from('punch_items')
          .select('*')
          .eq('is_active', true)
          .order('item_no', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) {
          toast({ title: 'Failed to load punch items', description: error.message, variant: 'destructive' });
          break;
        }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      if (!cancelled) {
        setRows(all);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (healthFilter !== 'all' && r.health_status !== healthFilter) return false;
      if (readyFilter === 'ready' && !r.pre_engineering_ready) return false;
      if (readyFilter === 'blocked' && r.pre_engineering_ready) return false;
      if (!q) return true;
      const blob = [
        r.item_no, r.outstanding_work, r.location, r.level, r.subcontractor_name,
        r.subsub_name, r.hdec_pic_name, r.team, r.work_type, r.category1, r.category2,
      ].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search, healthFilter, readyFilter]);

  const stats = useMemo(() => ({
    total: rows.length,
    critical: rows.filter((r) => r.health_status === 'critical').length,
    behind: rows.filter((r) => r.health_status === 'behind').length,
    blocked: rows.filter((r) => !r.pre_engineering_ready).length,
  }), [rows]);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Punch (Minor O/S Work) — Raw Data</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {stats.total} items · {stats.critical} critical · {stats.behind} behind · {stats.blocked} pre-eng blocked
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item no / work / location / subcontractor"
            className="h-9 w-[360px] pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Health:</span>
          {(['all', 'ahead', 'on_track', 'behind', 'critical'] as const).map((h) => (
            <Button
              key={h}
              size="sm"
              variant={healthFilter === h ? 'default' : 'outline'}
              className="h-7 px-2 text-xs capitalize"
              onClick={() => setHealthFilter(h)}
            >
              {h === 'all' ? 'All' : h.replace('_', ' ')}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Pre-Eng:</span>
          {(['all', 'ready', 'blocked'] as const).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={readyFilter === r ? 'default' : 'outline'}
              className="h-7 px-2 text-xs capitalize"
              onClick={() => setReadyFilter(r)}
            >
              {r}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded border">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-[110px]">Item No</TableHead>
              <TableHead className="min-w-[260px]">Outstanding Work</TableHead>
              <TableHead className="w-[120px]">Location</TableHead>
              <TableHead className="w-[80px]">Team</TableHead>
              <TableHead className="w-[160px]">Subcontractor</TableHead>
              <TableHead className="w-[110px]">Planned End</TableHead>
              <TableHead className="w-[110px]">Actual End</TableHead>
              <TableHead className="w-[80px] text-right">Planned %</TableHead>
              <TableHead className="w-[80px] text-right">Actual %</TableHead>
              <TableHead className="w-[80px] text-right">Variance</TableHead>
              <TableHead className="w-[90px]">Health</TableHead>
              <TableHead className="w-[140px]">Pre-Eng Gates</TableHead>
              <TableHead className="w-[90px]">Ready</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={13} className="text-center py-12 text-muted-foreground text-sm">Loading…</TableCell></TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={13} className="text-center py-12 text-muted-foreground text-sm">No punch items match the current filters.</TableCell></TableRow>
            )}
            {!loading && filtered.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/punch/${r.id}`)}
              >
                <TableCell className="font-mono text-xs">{r.item_no || '—'}</TableCell>
                <TableCell className="text-sm">
                  <div className="line-clamp-2">{r.outstanding_work}</div>
                </TableCell>
                <TableCell className="text-xs">{[r.level, r.location].filter(Boolean).join(' / ') || '—'}</TableCell>
                <TableCell className="text-xs">{r.team || '—'}</TableCell>
                <TableCell className="text-xs truncate max-w-[160px]">{r.subcontractor_name || '—'}</TableCell>
                <TableCell className="text-xs">{r.planned_completion_date ? formatDdMmm(r.planned_completion_date) : '—'}</TableCell>
                <TableCell className="text-xs">{r.actual_completion_date ? formatDdMmm(r.actual_completion_date) : '—'}</TableCell>
                <TableCell className="text-right text-xs"><PctCell value={r.planned_progress_pct} /></TableCell>
                <TableCell className="text-right text-xs"><PctCell value={r.actual_progress_pct} /></TableCell>
                <TableCell className="text-right text-xs"><VarianceCell value={r.progress_variance_pct} /></TableCell>
                <TableCell><HealthBadge status={r.health_status} /></TableCell>
                <TableCell><GateDots row={r} /></TableCell>
                <TableCell>
                  {r.pre_engineering_ready ? (
                    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] dark:bg-emerald-950 dark:text-emerald-200">Ready</Badge>
                  ) : (
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px] dark:bg-amber-950 dark:text-amber-200 gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Blocked
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {(r.pre_engineering_blockers || []).length > 0
                            ? r.pre_engineering_blockers.join(', ')
                            : 'Pre-engineering not complete'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
