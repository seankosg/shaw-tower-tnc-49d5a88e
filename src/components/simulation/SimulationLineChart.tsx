import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';

export interface SimStageDef<S extends string> {
  key: S;
  label: string;
  color: string;
}

interface Props<S extends string> {
  data: Array<Record<string, any>>;
  stages: SimStageDef<S>[];
  dataDate: string;
  targetIso: string;
  height?: number;
}

const SERIES_TYPES = [
  { key: 'actual', label: 'Actual', dash: '0', width: 2.5, opacity: 1 },
  { key: 'plan', label: 'Plan', dash: '4 3', width: 1, opacity: 0.4 },
  { key: 'predicted', label: 'Predicted', dash: '1 3', width: 2, opacity: 1 },
] as const;

type SeriesKey = typeof SERIES_TYPES[number]['key'];

export function SimulationLineChart<S extends string>({
  data, stages, dataDate, targetIso, height = 360,
}: Props<S>) {
  const [hiddenStages, setHiddenStages] = useState<Set<S>>(new Set());
  const [hiddenSeries, setHiddenSeries] = useState<Set<SeriesKey>>(new Set());

  const toggleStage = (s: S) => {
    setHiddenStages(prev => {
      const n = new Set(prev);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  };
  const toggleSeries = (s: SeriesKey) => {
    setHiddenSeries(prev => {
      const n = new Set(prev);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  };

  const visibleStages = stages.filter(s => !hiddenStages.has(s.key));

  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const byStage = new Map<S, { color: string; label: string; vals: Record<string, number> }>();
    for (const p of payload) {
      if (p.value == null) continue;
      const [stageKey, seriesKey] = String(p.dataKey).split('_') as [S, SeriesKey];
      const stageDef = stages.find(s => s.key === stageKey);
      if (!stageDef) continue;
      let entry = byStage.get(stageKey);
      if (!entry) {
        entry = { color: stageDef.color, label: stageDef.label, vals: {} };
        byStage.set(stageKey, entry);
      }
      entry.vals[seriesKey] = p.value;
    }
    if (byStage.size === 0) return null;
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
        <div className="mb-1.5 font-semibold text-foreground">{label}</div>
        <div className="space-y-1">
          {Array.from(byStage.entries()).map(([k, e]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: e.color }} />
              <span className="font-medium text-foreground">{e.label}</span>
              <span className="ml-auto flex gap-2 tabular-nums text-muted-foreground">
                {SERIES_TYPES.map(st => (
                  e.vals[st.key] != null ? (
                    <span key={st.key}>
                      {st.label[0]}: <span className="text-foreground">{e.vals[st.key].toFixed(1)}%</span>
                    </span>
                  ) : null
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Custom legends */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Stages:</span>
          {stages.map(s => {
            const off = hiddenStages.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleStage(s.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-opacity',
                  off ? 'opacity-40' : 'opacity-100',
                )}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="font-medium">{s.label}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-muted-foreground">Series:</span>
          {SERIES_TYPES.map(st => {
            const off = hiddenSeries.has(st.key);
            return (
              <button
                key={st.key}
                type="button"
                onClick={() => toggleSeries(st.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition-opacity',
                  off ? 'opacity-40' : 'opacity-100',
                )}
              >
                <svg width="22" height="6" className="text-foreground">
                  <line
                    x1="0" y1="3" x2="22" y2="3"
                    stroke="currentColor"
                    strokeWidth={st.width}
                    strokeDasharray={st.dash === '0' ? undefined : st.dash}
                  />
                </svg>
                <span>{st.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ height }} className="w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => v.slice(5)}
              minTickGap={20}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              ticks={[0, 25, 50, 75, 100]}
              unit="%"
            />
            <Tooltip content={renderTooltip} />
            <ReferenceLine
              x={dataDate}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="2 2"
              label={{ value: 'Data Date', fontSize: 10, position: 'insideTopLeft', fill: 'hsl(var(--muted-foreground))' }}
            />
            <ReferenceLine
              x={targetIso}
              stroke="hsl(var(--primary))"
              strokeDasharray="3 3"
              label={{ value: 'Target', fontSize: 10, position: 'insideTopRight', fill: 'hsl(var(--primary))' }}
            />
            {visibleStages.flatMap(s =>
              SERIES_TYPES.filter(st => !hiddenSeries.has(st.key)).map(st => (
                <Line
                  key={`${s.key}-${st.key}`}
                  type="monotone"
                  dataKey={`${s.key}_${st.key}`}
                  name={`${s.label} · ${st.label}`}
                  stroke={s.color}
                  strokeDasharray={st.dash === '0' ? undefined : st.dash}
                  strokeWidth={st.width}
                  strokeOpacity={st.opacity}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
