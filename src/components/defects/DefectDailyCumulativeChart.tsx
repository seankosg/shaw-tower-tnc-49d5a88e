import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { buildDefectTrendData } from '@/lib/defect-chart-utils';
import { type DefectItem } from '@/lib/defect-utils';
import { type DefectProgressBucket, type DefectProgressDateField } from '@/lib/defect-progress-utils';

interface DefectDailyCumulativeChartProps {
  items: DefectItem[];
  start: string;
  end: string;
  bucket: DefectProgressBucket;
  dateField: DefectProgressDateField;
  cumulative: boolean;
}

const chartConfig = {
  planned: { label: 'Planned', color: 'hsl(var(--primary))' },
  closed: { label: 'Closed', color: 'hsl(var(--accent-foreground))' },
  open: { label: 'Open', color: 'hsl(var(--muted-foreground))' },
} satisfies ChartConfig;

export function DefectDailyCumulativeChart({ items, start, end, bucket, dateField, cumulative }: DefectDailyCumulativeChartProps) {
  const data = buildDefectTrendData(items, { start, end, bucket, dateField, cumulative });
  return (
    <ChartContainer config={chartConfig} className="h-[320px] w-full">
      <LineChart data={data} margin={{ left: 12, right: 12, top: 12, bottom: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line type="monotone" dataKey="planned" stroke="var(--color-planned)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="closed" stroke="var(--color-closed)" strokeWidth={2} dot={false} />
        {cumulative && <Line type="monotone" dataKey="open" stroke="var(--color-open)" strokeWidth={2} dot={false} />}
      </LineChart>
    </ChartContainer>
  );
}
