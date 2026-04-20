import { memo } from 'react';
import { cn } from '@/lib/utils';

interface ScheduleCellProps {
  plan: number;
  actual: number;
  isFuture: boolean;
  isToday: boolean;
  width: number;
  onClick?: () => void;
}

/**
 * Mini bar chart cell. Memoized + optimized for empty-cell heavy grids.
 */
function ScheduleCellInner({ plan, actual, isFuture, isToday, width, onClick }: ScheduleCellProps) {
  const empty = plan === 0 && actual === 0;

  // Empty cell: minimal DOM (most cells in the matrix)
  if (empty) {
    return (
      <div
        className={
          isToday
            ? 'h-full border-r border-l-2 border-l-primary border-border/60 bg-primary/5'
            : 'h-full border-r border-border/60'
        }
        style={{ width, minWidth: width }}
      />
    );
  }

  const max = Math.max(plan, actual, 1);
  const planPct = (plan / max) * 100;
  const actualBlue = Math.min(actual, plan);
  const actualOver = Math.max(0, actual - plan);
  const blueWidthPct = (actualBlue / max) * 100;
  const overWidthPct = (actualOver / max) * 100;
  const delta = actual - plan;
  const interactive = !!onClick;

  return (
    <div
      role={interactive ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex h-full flex-col justify-center gap-1 px-1.5 py-1 text-[10px] tabular-nums border-r border-border/60',
        isToday && 'border-l-2 border-l-primary bg-primary/5',
        interactive && 'cursor-pointer hover:bg-accent/40',
      )}
      style={{ width, minWidth: width }}
    >
      <div className="relative h-2 w-full overflow-hidden rounded-sm bg-schedule-plan/30">
        <div
          className="absolute left-0 top-0 h-full bg-schedule-plan"
          style={{ width: `${planPct}%` }}
        />
        {!isFuture && (
          <>
            <div
              className="absolute left-0 top-0 h-full bg-schedule-actual"
              style={{ width: `${blueWidthPct}%` }}
            />
            {actualOver > 0 && (
              <div
                className="absolute top-0 h-full bg-schedule-over"
                style={{ left: `${blueWidthPct}%`, width: `${overWidthPct}%` }}
              />
            )}
          </>
        )}
      </div>
      <div className="flex items-center justify-between font-medium leading-none">
        <span className={isFuture ? 'text-muted-foreground' : undefined}>
          {isFuture ? '—' : actual}
        </span>
        <span className="text-muted-foreground">/{plan}</span>
      </div>
      {!isFuture && plan > 0 && delta !== 0 && (
        <div
          className={cn(
            'text-center text-[10px] font-semibold leading-none',
            delta < 0 ? 'text-schedule-short' : 'text-schedule-over',
          )}
        >
          {delta > 0 ? `+${delta}` : delta}
        </div>
      )}
    </div>
  );
}

export const ScheduleCell = memo(ScheduleCellInner);
