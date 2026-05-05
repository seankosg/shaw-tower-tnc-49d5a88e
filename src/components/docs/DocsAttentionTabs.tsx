import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MODULE_META, type ModuleStats } from '@/lib/docs-dashboard-data';

interface Props {
  modules: ModuleStats[];
}

type TabKey = 'overdue' | 'stuck' | 'awaiting';

interface Row {
  module: ModuleStats['module'];
  id: string;
  label: string;
  metricLabel: string;
  metric: number;
  pic?: string | null;
  hint?: string;
}

export function DocsAttentionTabs({ modules }: Props) {
  const [tab, setTab] = useState<TabKey>('overdue');
  const navigate = useNavigate();

  const rows = useMemo<Record<TabKey, Row[]>>(() => {
    const make = (key: TabKey): Row[] => {
      const out: Row[] = [];
      for (const m of modules) {
        if (m.module === 'spare_part' || m.module === 'warranty') continue;
        if (key === 'overdue') {
          for (const it of m.topOverdue) {
            out.push({
              module: m.module,
              id: it.id,
              label: it.label,
              metricLabel: 'days late',
              metric: it.daysLate,
              pic: it.pic,
            });
          }
        } else if (key === 'stuck') {
          for (const it of m.topStuck) {
            out.push({
              module: m.module,
              id: it.id,
              label: it.label,
              metricLabel: 'days idle',
              metric: it.daysIdle,
              pic: it.pic,
            });
          }
        } else {
          for (const it of m.topAwaiting) {
            out.push({
              module: m.module,
              id: it.id,
              label: it.label,
              metricLabel: 'days waiting',
              metric: it.daysWaiting,
              pic: it.pic,
              hint: it.stageHint,
            });
          }
        }
      }
      return out.sort((a, b) => b.metric - a.metric).slice(0, 12);
    };
    return { overdue: make('overdue'), stuck: make('stuck'), awaiting: make('awaiting') };
  }, [modules]);

  const detailRoute = (module: ModuleStats['module'], id: string) => {
    if (module === 'abd') return `/docs/abd/${id}`;
    if (module === 'omm') return `/docs/omm/${id}`;
    return MODULE_META[module].route;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Attention Required</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
            <TabsTrigger value="overdue" className="text-xs">
              Overdue
              <CountChip value={rows.overdue.length} tone="danger" />
            </TabsTrigger>
            <TabsTrigger value="stuck" className="text-xs">
              Stuck &gt; 14d
              <CountChip value={rows.stuck.length} tone="warning" />
            </TabsTrigger>
            <TabsTrigger value="awaiting" className="text-xs">
              Awaiting
              <CountChip value={rows.awaiting.length} tone="muted" />
            </TabsTrigger>
          </TabsList>

          {(['overdue', 'stuck', 'awaiting'] as TabKey[]).map((key) => (
            <TabsContent key={key} value={key} className="mt-3">
              {rows[key].length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nothing here — good news.</p>
              ) : (
                <ul className="divide-y divide-border/60 rounded-md border border-border/60">
                  {rows[key].map((r) => (
                    <li
                      key={`${r.module}-${r.id}`}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40"
                      onClick={() => navigate(detailRoute(r.module, r.id))}
                    >
                      <ModuleBadge module={r.module} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{r.label}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {r.pic || '— Unassigned'}
                          {r.hint ? ` · ${r.hint}` : ''}
                        </div>
                      </div>
                      <div
                        className={
                          key === 'overdue'
                            ? 'shrink-0 text-right text-sm tabular-nums font-medium text-destructive'
                            : 'shrink-0 text-right text-sm tabular-nums font-medium text-foreground'
                        }
                      >
                        {r.metric}
                        <div className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                          {r.metricLabel}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ModuleBadge({ module }: { module: ModuleStats['module'] }) {
  const meta = MODULE_META[module];
  const cls =
    meta.tone === 'primary'
      ? 'bg-primary/10 text-primary'
      : meta.tone === 'accent'
        ? 'bg-accent/40 text-accent-foreground'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {meta.short}
    </span>
  );
}

function CountChip({ value, tone }: { value: number; tone: 'danger' | 'warning' | 'muted' }) {
  if (!value) return null;
  const cls =
    tone === 'danger'
      ? 'bg-destructive/15 text-destructive'
      : tone === 'warning'
        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
        : 'bg-muted-foreground/15 text-muted-foreground';
  return <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${cls}`}>{value}</span>;
}
