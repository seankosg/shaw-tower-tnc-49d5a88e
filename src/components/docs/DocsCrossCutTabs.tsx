import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { type CrossCutCell, MODULE_META, type ModuleStats } from '@/lib/docs-dashboard-data';

type Dim = 'sub' | 'pic' | 'trade';

interface Props {
  modules: ModuleStats[]; // abd, omm, spare_part, warranty
}

export function DocsCrossCutTabs({ modules }: Props) {
  const [dim, setDim] = useState<Dim>('sub');
  const [q, setQ] = useState('');

  const rows = useMemo(() => buildRows(modules, dim), [modules, dim]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.key.toLowerCase().includes(needle));
  }, [rows, q]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Workload Breakdown</CardTitle>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="h-8 max-w-[220px] text-xs"
        />
      </CardHeader>
      <CardContent>
        <Tabs value={dim} onValueChange={(v) => setDim(v as Dim)}>
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
            <TabsTrigger value="sub" className="text-xs">Subcontractor</TabsTrigger>
            <TabsTrigger value="pic" className="text-xs">HDEC PIC</TabsTrigger>
            <TabsTrigger value="trade" className="text-xs">Trade</TabsTrigger>
          </TabsList>
          <TabsContent value={dim} className="mt-3">
            <div className="max-h-[420px] overflow-auto rounded-md border border-border/60">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-[180px]">{labelFor(dim)}</TableHead>
                    {(['ABD', 'OMM', 'Spare Part'] as const).map((m) => (
                      <TableHead key={m} colSpan={4} className="border-l text-center text-[11px] uppercase tracking-wide">
                        {m}
                      </TableHead>
                    ))}
                  </TableRow>
                  <TableRow className="text-[10px]">
                    <TableHead />
                    {[0, 1, 2].map((i) => (
                      <SubHeads key={i} />
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="py-8 text-center text-sm text-muted-foreground">
                        No data
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="font-medium">{r.key}</TableCell>
                        <CellGroup cell={r.abd} />
                        <CellGroup cell={r.omm} />
                        <CellGroup cell={r.sp} />
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {filtered.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {filtered.length} {labelFor(dim).toLowerCase()}{filtered.length === 1 ? '' : 's'} · Warranty excluded (placeholder)
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function SubHeads() {
  return (
    <>
      <TableHead className="border-l text-right">T</TableHead>
      <TableHead className="text-right">S</TableHead>
      <TableHead className="text-right">P</TableHead>
      <TableHead className="text-right">O</TableHead>
    </>
  );
}

function CellGroup({ cell }: { cell: CrossCutCell }) {
  return (
    <>
      <TableCell className="border-l text-right tabular-nums">{cell.total || ''}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{cell.submitted || ''}</TableCell>
      <TableCell className="text-right tabular-nums">{cell.pending || ''}</TableCell>
      <TableCell className={`text-right tabular-nums ${cell.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
        {cell.overdue || ''}
      </TableCell>
    </>
  );
}

function labelFor(dim: Dim) {
  return dim === 'sub' ? 'Subcontractor' : dim === 'pic' ? 'HDEC PIC' : 'Trade';
}

interface Row {
  key: string;
  abd: CrossCutCell;
  omm: CrossCutCell;
  sp: CrossCutCell;
}

function buildRows(modules: ModuleStats[], dim: Dim): Row[] {
  const pick = (m: ModuleStats) =>
    dim === 'sub' ? m.bySubcontractor : dim === 'pic' ? m.byPic : m.byTrade;
  const abd = modules.find((m) => m.module === 'abd')!;
  const omm = modules.find((m) => m.module === 'omm')!;
  const sp = modules.find((m) => m.module === 'spare_part')!;
  const keys = new Set<string>();
  for (const m of [abd, omm, sp]) for (const k of pick(m).keys()) keys.add(k);
  const empty = (): CrossCutCell => ({ total: 0, submitted: 0, pending: 0, overdue: 0 });
  return Array.from(keys)
    .map((k) => ({
      key: k,
      abd: pick(abd).get(k) ?? empty(),
      omm: pick(omm).get(k) ?? empty(),
      sp: pick(sp).get(k) ?? empty(),
    }))
    .sort((a, b) => {
      const ao = a.abd.overdue + a.omm.overdue + a.sp.overdue;
      const bo = b.abd.overdue + b.omm.overdue + b.sp.overdue;
      if (bo !== ao) return bo - ao;
      const at = a.abd.total + a.omm.total + a.sp.total;
      const bt = b.abd.total + b.omm.total + b.sp.total;
      return bt - at;
    });
}
// MODULE_META retained for future drill-down
void MODULE_META;
