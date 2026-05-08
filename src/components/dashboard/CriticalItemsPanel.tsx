import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type GroupBy = 'team' | 'subcontractor';

export interface CriticalRowItem {
  id: string;
  primary: string;       // e.g. Item No / Issue No
  secondary?: string;    // e.g. MOS / Level
  system?: string | null;
  description?: string | null;
  team?: string | null;
  subcontractor?: string | null;
  status?: string | null;
  main_trade?: string | null;
  sub_trade?: string | null;
  work_type?: string | null;
  registered_at?: string | null;
  registered_by_name?: string | null;
}

function formatRegisteredAt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  title?: string;
  items: CriticalRowItem[];
  rowHref: (id: string) => string;
  rawDataHref: string;
  primaryLabel: string;
  secondaryLabel?: string;
  showSystem?: boolean;
  /** Show Main Trade / Sub Trade / Work Type columns */
  showTradeColumns?: boolean;
  /** Source table for unregister action */
  tableName: 'subtests' | 'defect_items';
}

export function CriticalItemsPanel({
  title = 'Critical Issue Board',
  items,
  rowHref,
  rawDataHref,
  primaryLabel,
  secondaryLabel,
  showSystem,
  showTradeColumns,
  tableName,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groupBy, setGroupBy] = useState<GroupBy>('team');
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);

  const visibleItems = useMemo(() => items.filter((i) => !removedIds.has(i.id)), [items, removedIds]);

  const grouped = useMemo(() => {
    const m = new Map<string, CriticalRowItem[]>();
    for (const it of visibleItems) {
      const key = (groupBy === 'team' ? it.team : it.subcontractor) || '(None)';
      const list = m.get(key) ?? [];
      list.push(it);
      m.set(key, list);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [visibleItems, groupBy]);

  const goRaw = (extraQuery: Record<string, string> = {}) => {
    const params = new URLSearchParams({ critical: 'true', ...extraQuery });
    navigate(`${rawDataHref}?${params.toString()}`);
  };

  async function handleUnregister(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user || pendingId) return;
    setPendingId(id);
    try {
      const { error } = await (supabase as any).from(tableName).update({ is_critical: false }).eq('id', id);
      if (error) throw error;
      setRemovedIds((prev) => new Set(prev).add(id));
      toast.success('Removed from Critical Issue Board');
    } catch (err: any) {
      toast.error('Failed to remove', { description: err?.message ?? 'Permission denied' });
    } finally {
      setPendingId(null);
    }
  }

  const tradeColCount = showTradeColumns ? 3 : 0;
  // group + primary + (secondary?) + (system?) + trade(0|3) + other-group + status + team + registered-at + registered-by + (action?)
  const totalCols = 2 + (secondaryLabel ? 1 : 0) + (showSystem ? 1 : 0) + tradeColCount + 2 + 3 + (user ? 1 : 0);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {title}
          <Badge variant="secondary" className="ml-1">{visibleItems.length}</Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <TabsList className="h-8">
              <TabsTrigger value="team" className="text-xs">By Team</TabsTrigger>
              <TabsTrigger value="subcontractor" className="text-xs">By Subcontractor</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {visibleItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No critical items marked yet.</p>
        ) : (
          <div className="overflow-auto max-h-[420px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead className="w-[180px]">{groupBy === 'team' ? 'Team' : 'Subcontractor'}</TableHead>
                  <TableHead>{primaryLabel}</TableHead>
                  {secondaryLabel && <TableHead>{secondaryLabel}</TableHead>}
                  {showSystem && <TableHead>System</TableHead>}
                  {showTradeColumns && <TableHead>Main Trade</TableHead>}
                  {showTradeColumns && <TableHead>Sub Trade</TableHead>}
                  {showTradeColumns && <TableHead>Work Type</TableHead>}
                  <TableHead>{groupBy === 'team' ? 'Subcontractor' : 'Team'}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Registered At</TableHead>
                  <TableHead>Registered By</TableHead>
                  {user && <TableHead className="w-[44px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map(([groupKey, rows]) => (
                  <Fragment key={`grp-${groupKey}`}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell
                        colSpan={totalCols}
                        className="py-1.5 text-xs font-semibold cursor-pointer"
                        onClick={() =>
                          goRaw({ [groupBy === 'team' ? 'team' : 'subcontractor']: groupKey === '(None)' ? '__EMPTY__' : groupKey })
                        }
                      >
                        {groupBy === 'team' ? 'Team' : 'Subcontractor'}: {groupKey}
                        <span className="ml-2 text-muted-foreground font-normal">· {rows.length} item{rows.length === 1 ? '' : 's'}</span>
                      </TableCell>
                    </TableRow>
                    {rows.map((r) => (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer"
                        onClick={() => navigate(rowHref(r.id))}
                      >
                        <TableCell className="text-xs text-muted-foreground">—</TableCell>
                        <TableCell className="font-medium">{r.primary}</TableCell>
                        {secondaryLabel && <TableCell className="text-xs">{r.secondary || '—'}</TableCell>}
                        {showSystem && <TableCell className="text-xs">{r.system || '—'}</TableCell>}
                        {showTradeColumns && <TableCell className="text-xs">{r.main_trade || '—'}</TableCell>}
                        {showTradeColumns && <TableCell className="text-xs">{r.sub_trade || '—'}</TableCell>}
                        {showTradeColumns && <TableCell className="text-xs">{r.work_type || '—'}</TableCell>}
                        <TableCell className="text-xs truncate max-w-[180px]">
                          {(groupBy === 'team' ? r.subcontractor : r.team) || '—'}
                        </TableCell>
                        <TableCell className="text-xs">{r.status || '—'}</TableCell>
                        <TableCell className="text-xs">{r.team || '—'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap tabular-nums">{formatRegisteredAt(r.registered_at)}</TableCell>
                        <TableCell className="text-xs">{r.registered_by_name || '—'}</TableCell>
                        {user && (
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              disabled={pendingId === r.id}
                              onClick={(e) => handleUnregister(r.id, e)}
                              title="Remove from Critical Issue Board"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
