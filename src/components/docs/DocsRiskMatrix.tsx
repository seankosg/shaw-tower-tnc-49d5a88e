import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useNavigate } from 'react-router-dom';
import { MODULE_META, type DocsModuleId, type ModuleStats } from '@/lib/docs-dashboard-data';

interface Props {
  modules: ModuleStats[];
}

export function DocsRiskMatrix({ modules }: Props) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Status & Risk Matrix</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Module</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Submitted</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead className="text-right">Overdue</TableHead>
              <TableHead className="text-right">
                <span className="text-emerald-600">Green</span>
              </TableHead>
              <TableHead className="text-right">
                <span className="text-amber-600">Amber</span>
              </TableHead>
              <TableHead className="text-right">
                <span className="text-destructive">Red</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.map((m) => {
              const meta = MODULE_META[m.module];
              const go = (qs: string) => navigate(`${meta.route}${qs}`);
              const disabled = m.module === 'warranty' || m.total === 0;
              return (
                <TableRow key={m.module} className={disabled ? 'opacity-60' : ''}>
                  <TableCell className="font-medium">{meta.short}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <button
                      disabled={disabled}
                      onClick={() => go('')}
                      className="hover:underline disabled:no-underline disabled:cursor-default"
                    >
                      {m.total.toLocaleString()}
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.submitted.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.pending.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <button
                      disabled={disabled || m.overdue === 0}
                      onClick={() => go('?status=overdue')}
                      className="font-medium text-destructive hover:underline disabled:no-underline disabled:cursor-default disabled:text-muted-foreground"
                    >
                      {m.overdue.toLocaleString()}
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{m.risk.green.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-700">{m.risk.amber.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">{m.risk.red.toLocaleString()}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
