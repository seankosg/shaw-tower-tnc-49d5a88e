import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import {
  computeCycleStatus,
  cycleStatusColorClasses,
  cycleStatusGlyph,
  computeAllCyclesExhausted,
  computeOverallStatus,
  getCycle,
  type CycleStatus,
  type DrawingForStatus,
  type CycleNumber,
} from '@/lib/docs-status';

interface DocsCycleProgressProps {
  drawing: DrawingForStatus;
  dataDate: string | null;
}

function CyclePip({ status, label }: { status: CycleStatus; label: string }) {
  const cls =
    'inline-flex items-center justify-center h-4 min-w-4 px-0.5 rounded-full text-[9px] font-bold leading-none border';
  return (
    <span className={cn(cls, cycleStatusColorClasses(status))} aria-label={label}>
      {cycleStatusGlyph(status)}
    </span>
  );
}

export function DocsCycleProgress({ drawing, dataDate }: DocsCycleProgressProps) {
  const cycles: Array<{ n: CycleNumber; status: CycleStatus }> = [1, 2, 3].map((n) => {
    const cycle = getCycle(drawing, n as CycleNumber);
    return { n: n as CycleNumber, status: computeCycleStatus(cycle, dataDate) };
  });
  const exhausted = computeAllCyclesExhausted(drawing);
  const overall = computeOverallStatus(drawing, dataDate);

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 select-none rounded-md px-1 py-0.5',
            exhausted && 'ring-2 ring-rose-500 ring-offset-1 bg-rose-50/40',
            overall === 'A' && 'opacity-60 grayscale',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {cycles.map((c, idx) => (
            <span key={c.n} className="inline-flex items-center">
              <CyclePip status={c.status} label={`Cycle ${c.n}: ${c.status}`} />
              {idx < cycles.length - 1 && (
                <span className="h-px w-1.5 bg-muted-foreground/30" aria-hidden />
              )}
            </span>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="space-y-1 min-w-[180px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Overall</span>
            <span className="font-semibold">{overall}</span>
          </div>
          {dataDate && (
            <div className="text-[10px] text-muted-foreground">
              as of {formatDdMmm(dataDate)}
            </div>
          )}
          <div className="border-t pt-1 space-y-0.5">
            {cycles.map((c) => {
              const cycle = getCycle(drawing, c.n);
              return (
                <div key={c.n} className="flex items-center gap-2">
                  <CyclePip status={c.status} label={String(c.n)} />
                  <span className="font-medium">Cycle {c.n}:</span>
                  <span>{c.status}</span>
                  {cycle.actual_response_date && (
                    <span className="text-muted-foreground text-[10px] ml-auto">
                      {formatDdMmm(cycle.actual_response_date)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {exhausted && (
            <div className="text-rose-600 font-medium border-t pt-1">
              ⚠ All 3 cycles used without 'A' approval
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function DocsCycleProgressLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Legend:</span>
      <span className="inline-flex items-center gap-1"><CyclePip status="Planned" label="Planned" /> Planned</span>
      <span className="inline-flex items-center gap-1"><CyclePip status="S.Delayed" label="S.Delayed" /> S.Delayed</span>
      <span className="inline-flex items-center gap-1"><CyclePip status="Under Review" label="Under Review" /> Under Review</span>
      <span className="inline-flex items-center gap-1"><CyclePip status="R.Delayed" label="R.Delayed" /> R.Delayed</span>
      <span className="inline-flex items-center gap-1"><CyclePip status="A" label="A" /> A (Closed)</span>
      <span className="inline-flex items-center gap-1"><CyclePip status="B" label="B" /> B</span>
      <span className="inline-flex items-center gap-1"><CyclePip status="C" label="C" /> C</span>
    </div>
  );
}
