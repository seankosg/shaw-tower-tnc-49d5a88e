import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, FileText, BookOpen, Boxes, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import {
  loadDashboardData,
  MODULE_META,
  type DashboardData,
} from '@/lib/docs-dashboard-data';
import { DocsModuleKpiCard } from '@/components/docs/DocsModuleKpiCard';
import { DocsRiskMatrix } from '@/components/docs/DocsRiskMatrix';
import { DocsModuleDetailCard } from '@/components/docs/DocsModuleDetailCard';
import { DocsSubmissionTrendChart } from '@/components/docs/DocsSubmissionTrendChart';
import { DocsCrossCutTabs } from '@/components/docs/DocsCrossCutTabs';

export default function DocsDashboardPage() {
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState<Date>(() => new Date());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadDashboardData({ asOf })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asOf]);

  const modules = useMemo(
    () => (data ? [data.abd, data.omm, data.spare_part, data.warranty] : []),
    [data],
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Docs Management Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            As-Built / O&amp;M / Spare Part / Warranty submission status
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('justify-start gap-2 font-normal')}>
              <CalendarIcon className="h-4 w-4" />
              Data Date: {format(asOf, 'yyyy-MM-dd')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={asOf}
              onSelect={(d) => d && setAsOf(d)}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Section 1 — KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data ? (
          <>
            <DocsModuleKpiCard
              icon={FileText}
              label={MODULE_META.abd.short}
              total={data.abd.total}
              submitted={data.abd.submitted}
              red={data.abd.risk.red}
              onClick={() => navigate(MODULE_META.abd.route)}
            />
            <DocsModuleKpiCard
              icon={BookOpen}
              label={MODULE_META.omm.short}
              total={data.omm.total}
              submitted={data.omm.submitted}
              red={data.omm.risk.red}
              onClick={() => navigate(MODULE_META.omm.route)}
            />
            <DocsModuleKpiCard
              icon={Boxes}
              label={MODULE_META.spare_part.short}
              total={data.spare_part.total}
              submitted={data.spare_part.submitted}
              red={data.spare_part.risk.red}
              onClick={() => navigate(MODULE_META.spare_part.route)}
            />
            <DocsModuleKpiCard
              icon={ShieldCheck}
              label={MODULE_META.warranty.short}
              total={0}
              submitted={0}
              red={0}
              disabled
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[120px] animate-pulse rounded-md border border-border/60 bg-muted/30" />
          ))
        )}
      </div>

      {/* Section 2 — Risk matrix */}
      {data && <DocsRiskMatrix modules={modules} />}

      {/* Section 3 — Per-module detail */}
      {data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DocsModuleDetailCard stats={data.abd} icon={FileText} />
          <DocsModuleDetailCard stats={data.omm} icon={BookOpen} />
          <DocsModuleDetailCard stats={data.spare_part} icon={Boxes} />
          <DocsModuleDetailCard stats={data.warranty} icon={ShieldCheck} comingSoon />
        </div>
      )}

      {/* Section 4 — Trend */}
      {data && <DocsSubmissionTrendChart data={data} asOf={asOf} />}

      {/* Section 5 — Cross-cut tabs */}
      {data && <DocsCrossCutTabs modules={modules} />}

      {loading && !data && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
