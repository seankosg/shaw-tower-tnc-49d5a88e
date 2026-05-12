interface Props {
  doneActual: number;
  predicted: number;
  actualPct: number;
  predictedPct: number;
  dataDate: string;
  targetIso: string;
  color: string;
}

export function ToAchieveBand({
  doneActual, predicted, actualPct, predictedPct, dataDate, targetIso, color,
}: Props) {
  const days = Math.max(
    0,
    Math.round((Date.parse(targetIso) - Date.parse(dataDate)) / 86400000),
  );
  const deltaItems = Math.max(0, predicted - doneActual);
  const deltaPct = Math.max(0, predictedPct - actualPct);
  const perDay = days > 0 ? Math.ceil(deltaItems / days) : null;

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
        {perDay !== null && (
          <>
            {' '}
            <span className="text-muted-foreground">·</span> ~{perDay}/day
          </>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">
        from {dataDate} → {targetIso} ({days} {days === 1 ? 'day' : 'days'})
      </div>
    </div>
  );
}
