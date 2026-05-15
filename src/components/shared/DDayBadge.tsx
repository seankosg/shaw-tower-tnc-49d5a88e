import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface DDayBadgeProps {
  /** Target date in ISO `YYYY-MM-DD` format, interpreted as Singapore Time (UTC+8). */
  targetDate: string;
  /** Short label shown under the count (default: "PC"). */
  label?: string;
  className?: string;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Returns the UTC epoch (ms) corresponding to the most recent SGT (UTC+8) midnight
 * for the given Date. Independent of the viewer's local time zone.
 */
function sgtMidnightEpoch(date: Date): number {
  const sgtMs = date.getTime() + 8 * 3600 * 1000;
  const sgtDay = Math.floor(sgtMs / 86400000);
  return sgtDay * 86400000 - 8 * 3600 * 1000;
}

function formatTargetLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}-${MONTH_ABBR[parseInt(m[2], 10) - 1]}-${m[1]}`;
}

export function DDayBadge({ targetDate, label = 'PC', className }: DDayBadgeProps) {
  // Refresh once a minute so the badge ticks over at SGT midnight even if the
  // tab has been open for a long time.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { diff, text, tone } = useMemo(() => {
    const targetMs = Date.parse(`${targetDate}T00:00:00+08:00`);
    const todayMs = sgtMidnightEpoch(new Date());
    const d = Math.round((targetMs - todayMs) / 86400000);
    let t: string;
    if (d > 0) t = `D-${d}`;
    else if (d === 0) t = 'D-Day';
    else t = `D+${-d}`;
    let toneClass: string;
    if (d < 0) {
      toneClass = 'bg-muted text-muted-foreground border-border';
    } else if (d === 0 || d <= 7) {
      toneClass = 'bg-destructive/10 text-destructive border-destructive/40 animate-pulse';
    } else if (d <= 30) {
      toneClass = 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40';
    } else {
      toneClass = 'bg-primary/10 text-primary border-primary/30';
    }
    return { diff: d, text: t, tone: toneClass };
  }, [targetDate]);

  const targetLabel = formatTargetLabel(targetDate);
  const dotTone =
    diff < 0
      ? 'bg-muted-foreground/60'
      : diff === 0 || diff <= 7
      ? 'bg-destructive'
      : diff <= 30
      ? 'bg-amber-500'
      : 'bg-primary';

  return (
    <span
      title={`${label} target: ${targetLabel} (Singapore Time, UTC+8)`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-semibold leading-none',
        tone,
        className,
      )}
    >
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dotTone)} aria-hidden />
      <span>{text}</span>
      <span className="ml-1 text-[10px] font-normal text-muted-foreground leading-none whitespace-nowrap">
        {label} · {targetLabel} SGT
      </span>
    </span>
  );
}
