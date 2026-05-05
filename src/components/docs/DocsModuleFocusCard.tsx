import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  ABD_STAGES,
  MODULE_META,
  OMM_STAGES,
  type ModuleStats,
} from '@/lib/docs-dashboard-data';
import { DocsStageFunnel } from './DocsStageFunnel';

interface Props {
  stats: ModuleStats;
  icon: LucideIcon;
}

export function DocsModuleFocusCard({ stats, icon: Icon }: Props) {
  const navigate = useNavigate();
  const meta = MODULE_META[stats.module];

  if (stats.total === 0) {
    return (
      <Card className="flex flex-col">
        <Header icon={Icon} title={meta.label} module={stats.module} />
        <CardContent className="flex flex-1 items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">
            No data — upload a register on the <strong>Import</strong> tab.
          </p>
        </CardContent>
      </Card>
    );
  }

  const submitted = stats.submitted;
  const overdue = stats.overdue;
  const pendingNotOverdue = Math.max(0, stats.pending - overdue);
  const pieData = [
    { name: 'Submitted', value: submitted, fill: 'hsl(var(--primary))' },
    { name: 'Pending', value: pendingNotOverdue, fill: 'hsl(var(--muted-foreground) / 0.35)' },
    { name: 'Overdue', value: overdue, fill: 'hsl(var(--destructive))' },
  ].filter((d) => d.value > 0);

  const pct = stats.total > 0 ? Math.round((submitted / stats.total) * 100) : 0;

  const stages =
    stats.module === 'omm'
      ? OMM_STAGES.map((label) => ({
          label,
          count: stats.stageCounts[label] ?? 0,
          terminal: label === 'Approved',
        }))
      : ABD_STAGES.map((label) => ({
          label,
          count: stats.stageCounts[label] ?? 0,
          terminal: label === 'Approved',
        }));

  return (
    <Card className="flex flex-col">
      <Header icon={Icon} title={meta.label} module={stats.module} />
      <CardContent className="flex flex-1 flex-col gap-5">
        {/* Donut + headline numbers */}
        <div className="flex items-center gap-4">
          <div className="relative h-28 w-28 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Pie
                  data={pieData}
                  innerRadius={36}
                  outerRadius={54}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                >
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-semibold tabular-nums">{pct}%</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">approved</span>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-2 text-sm">
            <Stat label="Submitted" value={submitted} />
            <Stat label="Pending" value={pendingNotOverdue} />
            <Stat label="Overdue" value={overdue} tone={overdue > 0 ? 'danger' : undefined} />
            <Stat
              label="Awaiting Resp."
              value={stats.awaitingResponse}
              tone={stats.awaitingResponse > 0 ? 'warning' : undefined}
            />
          </div>
        </div>

        {/* Funnel */}
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Workflow stage
          </div>
          <DocsStageFunnel stages={stages} total={stats.total} />
        </div>

        {/* Risk + copy shortfall */}
        <div className="flex flex-wrap items-center gap-2">
          <RiskChip label="Red" value={stats.risk.red} tone="danger" />
          <RiskChip label="Amber" value={stats.risk.amber} tone="warning" />
          <RiskChip label="Green" value={stats.risk.green} tone="ok" />
          {stats.module === 'omm' && stats.copyShortfall && stats.copyShortfall > 0 && (
            <RiskChip label="Copy short" value={stats.copyShortfall} tone="danger" />
          )}
        </div>

        <div className="mt-auto pt-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => navigate(meta.route)}
          >
            Open Raw Data <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Header({
  icon: Icon,
  title,
  module,
}: {
  icon: LucideIcon;
  title: string;
  module: ModuleStats['module'];
}) {
  const tone = MODULE_META[module].tone;
  return (
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
      <div className="flex items-center gap-2">
        <div
          className={
            tone === 'primary'
              ? 'rounded-md bg-primary/10 p-1.5'
              : tone === 'accent'
                ? 'rounded-md bg-accent/40 p-1.5'
                : 'rounded-md bg-muted p-1.5'
          }
        >
          <Icon
            className={
              tone === 'primary'
                ? 'h-4 w-4 text-primary'
                : tone === 'accent'
                  ? 'h-4 w-4 text-accent-foreground'
                  : 'h-4 w-4 text-muted-foreground'
            }
          />
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
      </div>
      <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {MODULE_META[module].short}
      </span>
    </CardHeader>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'danger' | 'warning';
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
      <div
        className={
          tone === 'danger'
            ? 'tabular-nums text-base font-semibold text-destructive'
            : tone === 'warning'
              ? 'tabular-nums text-base font-semibold text-amber-700 dark:text-amber-300'
              : 'tabular-nums text-base font-semibold text-foreground'
        }
      >
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function RiskChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'danger' | 'warning' | 'ok';
}) {
  const cls =
    tone === 'danger'
      ? 'bg-destructive/10 text-destructive'
      : tone === 'warning'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label} <span className="tabular-nums font-semibold">{value}</span>
    </span>
  );
}
