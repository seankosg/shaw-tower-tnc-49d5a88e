import { memo } from 'react';
import { AlertTriangle, Clock, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { DEFECT_STAGE_LABELS, type DefectCriticalItem, type DefectLaggingGroup } from '@/lib/defect-schedule-utils';

interface DefectCriticalWatchlistProps {
  highRisk: DefectCriticalItem[];
  closureBottleneck: DefectCriticalItem[];
  lagging: DefectLaggingGroup[];
  onItemClick?: (item: DefectCriticalItem) => void;
  onGroupClick?: (groupLabel: string) => void;
}

export const DefectCriticalWatchlist = memo(function DefectCriticalWatchlist({
  highRisk,
  closureBottleneck,
  lagging,
  onItemClick,
  onGroupClick,
}: DefectCriticalWatchlistProps) {
  return (
    <div className="flex w-[320px] shrink-0 flex-col gap-3">
      <Section
        title="High Risk"
        icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
        empty="No items at risk."
        count={highRisk.length}
        accent="destructive"
      >
        {highRisk.slice(0, 12).map(item => (
          <RiskRow key={`${item.defectId}-${item.stage}`} item={item} onClick={onItemClick} />
        ))}
      </Section>

      <Section
        title="Closure Bottleneck"
        icon={<Clock className="h-4 w-4 text-warning" />}
        empty="No closure bottlenecks."
        count={closureBottleneck.length}
        accent="warning"
      >
        {closureBottleneck.slice(0, 8).map(item => (
          <RiskRow key={`bn-${item.defectId}`} item={item} onClick={onItemClick} hint="Completion overdue" />
        ))}
      </Section>

      <Section
        title="Lagging Groups"
        icon={<TrendingDown className="h-4 w-4 text-warning" />}
        empty="All groups on track."
        count={lagging.length}
      >
        {lagging.map(g => {
          const pct = Math.round(g.ratio * 100);
          return (
            <button
              key={g.key}
              type="button"
              onClick={onGroupClick ? () => onGroupClick(g.label) : undefined}
              className="flex w-full flex-col gap-1 rounded-md border border-border/60 bg-card px-2.5 py-2 text-left text-xs hover:bg-accent/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium" title={g.label}>{g.label}</span>
                <span className={cn(
                  'shrink-0 tabular-nums font-semibold',
                  pct < 70 ? 'text-destructive' : pct < 90 ? 'text-warning' : 'text-muted-foreground',
                )}>{pct}%</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                <span>{g.cumActual} / {g.cumPlan}</span>
                <span>{g.total} stages</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded bg-muted">
                <div
                  className={cn(
                    'h-full',
                    pct < 70 ? 'bg-destructive' : pct < 90 ? 'bg-warning' : 'bg-primary',
                  )}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </button>
          );
        })}
      </Section>
    </div>
  );
});

function Section({
  title, icon, children, empty, count, accent,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  empty: string;
  count: number;
  accent?: 'destructive' | 'warning';
}) {
  return (
    <Card>
      <CardHeader className="px-3 py-2">
        <CardTitle className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5">{icon}{title}</span>
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            accent === 'destructive' ? 'bg-destructive/15 text-destructive'
              : accent === 'warning' ? 'bg-warning/15 text-warning'
              : 'bg-muted text-muted-foreground',
          )}>{count}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 px-3 pb-3 pt-0">
        {count === 0 ? (
          <div className="py-2 text-center text-[11px] text-muted-foreground">{empty}</div>
        ) : children}
      </CardContent>
    </Card>
  );
}

function RiskRow({ item, onClick, hint }: { item: DefectCriticalItem; onClick?: (i: DefectCriticalItem) => void; hint?: string }) {
  const dangerLevel = item.daysLeft < 0 ? 'overdue' : item.daysLeft <= 3 ? 'high' : 'med';
  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(item) : undefined}
      className="flex w-full flex-col gap-0.5 rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-left text-[11px] hover:bg-accent/40"
    >
      <div className="flex items-center gap-1.5">
        <span className={cn(
          'inline-flex h-4 min-w-7 items-center justify-center rounded px-1 text-[9px] font-bold',
          item.stage === 'start' && 'bg-secondary text-secondary-foreground',
          item.stage === 'completion' && 'bg-primary/20 text-primary',
          item.stage === 'closure' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
        )}>
          {DEFECT_STAGE_LABELS[item.stage]}
        </span>
        <span className="truncate font-medium" title={`${item.issueNo}${item.scNo ? ` · ${item.scNo}` : ''}`}>
          {item.issueNo}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">
          <span className={cn(
            'font-semibold',
            dangerLevel === 'overdue' ? 'text-destructive' : dangerLevel === 'high' ? 'text-warning' : 'text-muted-foreground',
          )}>
            {item.daysLeft < 0 ? `${-item.daysLeft}d late` : `${item.daysLeft}d`}
          </span>
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="truncate">{item.trade || '—'} · {item.group}</span>
        {hint && <span className="ml-2 shrink-0 text-warning">{hint}</span>}
      </div>
    </button>
  );
}
