import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { buildTrend, type DashboardData, type TrendGranularity } from '@/lib/docs-dashboard-data';

interface Props {
  data: DashboardData;
  asOf: Date;
}

export function DocsSubmissionTrendChart({ data, asOf }: Props) {
  const [gran, setGran] = useState<TrendGranularity>('week');
  const points = buildTrend(data, gran, asOf);
  const empty = points.every((p) => p.abd + p.omm === 0);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Approval Trend</CardTitle>
        <ToggleGroup
          type="single"
          value={gran}
          onValueChange={(v) => v && setGran(v as TrendGranularity)}
          size="sm"
          variant="outline"
        >
          <ToggleGroupItem value="day" className="px-3 text-xs">Daily</ToggleGroupItem>
          <ToggleGroupItem value="week" className="px-3 text-xs">Weekly</ToggleGroupItem>
          <ToggleGroupItem value="month" className="px-3 text-xs">Monthly</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No approvals recorded in this period.
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="abd"
                  name="ABD"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="omm"
                  name="OMM"
                  stroke="hsl(var(--accent-foreground))"
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray="4 2"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
