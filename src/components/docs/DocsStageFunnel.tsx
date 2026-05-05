import { cn } from '@/lib/utils';

interface Stage {
  label: string;
  count: number;
  /** terminal stage (e.g. Approved / Rejected) — rendered with primary fill */
  terminal?: boolean;
}

interface Props {
  stages: Stage[];
  total: number;
  /** Optional className for outer wrapper */
  className?: string;
}

/**
 * Horizontal funnel bar: shows stage segments side-by-side.
 * Each segment width is proportional to its count.
 */
export function DocsStageFunnel({ stages, total, className }: Props) {
  const safeTotal = total > 0 ? total : 1;
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {stages.map((s, i) => {
          const w = (s.count / safeTotal) * 100;
          if (w <= 0) return null;
          return (
            <div
              key={s.label + i}
              className={cn(
                'h-full border-r border-background last:border-r-0',
                s.terminal ? 'bg-primary' : i === 0 ? 'bg-muted-foreground/30' : 'bg-primary/40',
              )}
              style={{ width: `${w}%` }}
              title={`${s.label}: ${s.count}`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-3 lg:grid-cols-5">
        {stages.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-2">
            <span className="truncate text-muted-foreground">{s.label}</span>
            <span className="tabular-nums font-medium text-foreground">{s.count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
