import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ArrowRight, LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MODULE_META, type ModuleStats } from '@/lib/docs-dashboard-data';

interface Props {
  stats: ModuleStats;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export function DocsModuleDetailCard({ stats, icon: Icon, comingSoon }: Props) {
  const navigate = useNavigate();
  const meta = MODULE_META[stats.module];
  const pct = stats.total > 0 ? Math.round((stats.submitted / stats.total) * 100) : 0;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-muted p-1.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-base">{meta.label}</CardTitle>
        </div>
        {comingSoon && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Coming soon
          </span>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {comingSoon ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Warranty workflow visualisation will be available in Phase 3.
          </p>
        ) : stats.total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No data — upload a register on the <strong>Import</strong> tab.
          </p>
        ) : (
          <>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Submission progress</span>
                <span className="tabular-nums text-sm font-medium">
                  {stats.submitted.toLocaleString()} / {stats.total.toLocaleString()} ({pct}%)
                </span>
              </div>
              <Progress value={pct} className="mt-2 h-2" />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Pending" value={stats.pending} />
              <Stat label="Overdue" value={stats.overdue} tone={stats.overdue > 0 ? 'danger' : undefined} />
              <Stat label="Red Risk" value={stats.risk.red} tone={stats.risk.red > 0 ? 'danger' : undefined} />
            </div>

            {stats.topOverdue.length > 0 && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Top overdue</div>
                <ul className="space-y-1 text-sm">
                  {stats.topOverdue.map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-foreground/90">{it.label}</span>
                      <span className="shrink-0 tabular-nums text-destructive">-{it.daysLate}d</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="mt-auto pt-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={comingSoon}
            onClick={() => navigate(meta.route)}
          >
            Open Raw Data <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-2">
      <div className={`tabular-nums text-lg font-semibold ${tone === 'danger' ? 'text-destructive' : 'text-foreground'}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
