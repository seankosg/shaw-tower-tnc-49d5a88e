import { cn } from '@/lib/utils';

interface Props {
  /** behindNowCount = doneActual − planAtDataDate. Negative = behind, positive = ahead. */
  count: number;
  /** behindNowPct, signed. */
  pct: number;
  dataDate: string;
}

/**
 * Quantity-vs-plan status banner shown under the predicted % on each
 * simulation stage card. Three states: Behind / On Track / Ahead.
 */
export function QtyVsPlanBanner({ count, pct, dataDate }: Props) {
  const state: 'behind' | 'on' | 'ahead' =
    count < 0 ? 'behind' : count > 0 ? 'ahead' : 'on';

  const abs = Math.abs(count);
  const itemLabel = `${abs} item${abs === 1 ? '' : 's'}`;
  const pctStr = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;

  const cfg = {
    behind: {
      label: "Behind in Q'ty by",
      tail: `short of plan @ ${dataDate}`,
      box: 'border-rose-500 bg-rose-50 dark:bg-rose-950/40',
      title: 'text-rose-700 dark:text-rose-300',
      value: 'text-rose-700 dark:text-rose-300',
      sub: 'text-rose-700/80 dark:text-rose-300/80',
    },
    on: {
      label: "On Track in Q'ty by",
      tail: `vs plan @ ${dataDate}`,
      box: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
      title: 'text-emerald-700 dark:text-emerald-300',
      value: 'text-emerald-700 dark:text-emerald-300',
      sub: 'text-emerald-700/80 dark:text-emerald-300/80',
    },
    ahead: {
      label: "Ahead in Q'ty by",
      tail: `ahead of plan @ ${dataDate}`,
      box: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
      title: 'text-emerald-700 dark:text-emerald-300',
      value: 'text-emerald-700 dark:text-emerald-300',
      sub: 'text-emerald-700/80 dark:text-emerald-300/80',
    },
  }[state];

  return (
    <div className={cn('mt-2 rounded-md border-l-4 px-2.5 py-1.5', cfg.box)}>
      <div className={cn('text-[10px] font-semibold uppercase tracking-wide', cfg.title)}>
        {cfg.label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
        <span className={cn('text-lg font-bold tabular-nums', cfg.value)}>
          {itemLabel}
        </span>
        <span className={cn('text-xs font-medium tabular-nums', cfg.sub)}>
          · {pctStr} {cfg.tail}
        </span>
      </div>
    </div>
  );
}
