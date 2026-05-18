import { Loader2, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { UseAutoRefreshResult } from '@/hooks/useAutoRefresh';

interface Props {
  state: UseAutoRefreshResult;
  className?: string;
}

const INTERVAL_OPTIONS: Array<{ label: string; ms: number }> = [
  { label: '15s', ms: 15_000 },
  { label: '30s', ms: 30_000 },
  { label: '1m',  ms: 60_000 },
  { label: '2m',  ms: 120_000 },
  { label: '5m',  ms: 300_000 },
  { label: '10m', ms: 600_000 },
];

function formatTime(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleTimeString(undefined, { hour12: false });
}

export function AutoRefreshControl({ state, className }: Props) {
  const { enabled, setEnabled, intervalMs, setIntervalMs, lastUpdatedAt, isRefreshing } = state;

  return (
    <div className={`flex items-center gap-2 text-xs ${className ?? ''}`}>
      <div className="flex items-center gap-1.5">
        <Switch
          id="auto-refresh-toggle"
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label="Auto refresh"
        />
        <Label htmlFor="auto-refresh-toggle" className="text-xs font-medium cursor-pointer select-none">
          Auto-refresh
        </Label>
      </div>

      <Select
        value={String(intervalMs)}
        onValueChange={(v) => setIntervalMs(Number(v))}
        disabled={!enabled}
      >
        <SelectTrigger className="h-7 w-[72px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INTERVAL_OPTIONS.map((o) => (
            <SelectItem key={o.ms} value={String(o.ms)} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="flex items-center gap-1 text-muted-foreground">
        {isRefreshing ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3 opacity-60" />
        )}
        <span className="hidden md:inline">Last:</span>
        <span className="tabular-nums">{formatTime(lastUpdatedAt)}</span>
      </span>
    </div>
  );
}
