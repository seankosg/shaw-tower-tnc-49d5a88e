import type { DelayMode } from '@/lib/tnc-simulation';

interface Props {
  doneActual: number;
  predicted: number;
  actualPct: number;
  predictedPct: number;
  dataDate: string;
  targetIso: string;
  color: string;
  delayMode?: DelayMode;
  delayedCount?: number;
}

export function ToAchieveBand({
  doneActual, predicted, actualPct, predictedPct, dataDate, targetIso, color,
  delayMode, delayedCount = 0,
}: Props) {
  const days = Math.max(
    0,
    Math.round((Date.parse(targetIso) - Date.parse(dataDate)) / 86400000),
  );
  const deltaItems = Math.max(0, predicted - doneActual);
  const deltaPct = Math.max(0, predictedPct - actualPct);
  const perDay = days > 0 ? Math.ceil(deltaItems / days) : null;

  // Mode-aware delayed-items annotation for the daily target.
  // optimistic / shift-today / learned: delayed items ARE included in `predicted`,
  // so perDay already accounts for them — surface this explicitly.
  // penalty: delayed items are excluded from `predicted`; show a hypothetical
  // "if recovered" rate so users see the true catch-up workload.
  const includesDelayed =
    delayMode === 'optimistic' || delayMode === 'shift-today' || delayMode === 'learned';
  const recoverPerDay =
    delayMode === 'penalty' && days > 0 && delayedCount > 0
      ? Math.ceil((deltaItems + delayedCount) / days)
      : null;

  return (
    <div
      className="mt-3 rounded-sm border-l-2 bg-muted/40 px-2.5 py-1.5"
      style={{ borderLeftColor: color }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        To Achieve
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums" style={{ color }}>
        +{deltaItems} items <span className="text-muted-foreground">·</span> +{deltaPct.toFixed(1)}%
        {perDay !== null ? (
          <>
            {' '}
            <span className="text-muted-foreground">·</span> ~{perDay}/day
          </>
        ) : (
          <>
            {' '}
            <span className="text-muted-foreground">·</span>{' '}
            <span className="text-[11px] font-normal text-muted-foreground">target ≤ data date</span>
          </>
        )}
      </div>
      {perDay !== null && delayedCount > 0 && includesDelayed && (
        <div className="text-[10px] text-muted-foreground">
          incl. {delayedCount} delayed item{delayedCount === 1 ? '' : 's'} in daily target
        </div>
      )}
      {recoverPerDay !== null && (
        <div className="text-[10px] text-rose-600 dark:text-rose-400">
          excl. {delayedCount} delayed · if recovered: ~{recoverPerDay}/day
        </div>
      )}
      <div className="text-[10px] text-muted-foreground">
        {days > 0
          ? <>from {dataDate} → {targetIso} ({days} {days === 1 ? 'day' : 'days'})</>
          : <>from {dataDate} → {targetIso} (already past target)</>}
      </div>
    </div>
  );
}
