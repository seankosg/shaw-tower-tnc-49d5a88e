import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
}

interface Props {
  title?: string;
  items: CriticalRowItem[];
  /** path to navigate to when clicking a row, e.g. (id) => `/subtests/${id}` */
  rowHref: (id: string) => string;
  /** path to raw data page, e.g. '/subtests' or '/defects' */
  rawDataHref: string;
  /** label for primary id column */
  primaryLabel: string;
  /** label for secondary column (optional) */
  secondaryLabel?: string;
  /** include System column */
  showSystem?: boolean;
}

export function CriticalItemsPanel({
  title = 'Critical Items',
  items,
  rowHref,
  rawDataHref,
  primaryLabel,
  secondaryLabel,
  showSystem,
}: Props) {
  const navigate = useNavigate();
  const [groupBy, setGroupBy] = useState<GroupBy>('team');

  const grouped = useMemo(() => {
    const m = new Map<string, CriticalRowItem[]>();
    for (const it of items) {
      const key = (groupBy === 'team' ? it.team : it.subcontractor) || '(None)';
      const list = m.get(key) ?? [];
      list.push(it);
      m.set(key, list);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [items, groupBy]);

  const goRaw = (extraQuery: Record<string, string> = {}) => {
    const params = new URLSearchParams({ critical: 'true', ...extraQuery });
    navigate(`${rawDataHref}?${params.toString()}`);
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {title}
          <Badge variant="secondary" className="ml-1">{items.length}</Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <TabsList className="h-8">
              <TabsTrigger value="team" className="text-xs">By Team</TabsTrigger>
              <TabsTrigger value="subcontractor" className="text-xs">By Subcontractor</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={() => goRaw()}>Open in Raw Data</Button>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
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
                  <TableHead>{groupBy === 'team' ? 'Subcontractor' : 'Team'}</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map(([groupKey, rows]) => (
                  <>
                    <TableRow key={`grp-${groupKey}`} className="bg-muted/40 hover:bg-muted/40">
                      <TableCell
                        colSpan={2 + (secondaryLabel ? 1 : 0) + (showSystem ? 1 : 0) + 2}
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
                        <TableCell className="text-xs truncate max-w-[180px]">
                          {(groupBy === 'team' ? r.subcontractor : r.team) || '—'}
                        </TableCell>
                        <TableCell className="text-xs">{r.status || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
