import { memo } from 'react';
import { cn } from '@/lib/utils';

interface ScheduleCellProps {
  plan: number;
  actual: number;
  isFuture: boolean;
  isToday: boolean;
  width: number;
  onPlanClick?: () => void;
  onActualClick?: () => void;
}

/**
 * Mini bar chart cell. Memoized + optimized for empty-cell heavy grids.
 * Plan bar (top, gray) and Actual bar (bottom, blue/orange) are split into
 * separate clickable regions so each can filter the subtest list distinctly.
 */
function ScheduleCellInner({
  plan, actual, isFuture, isToday, width, onPlanClick, onActualClick,
}: ScheduleCellProps) {
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

  const planClickable = !!onPlanClick && plan > 0;
  const actualClickable = !!onActualClick && !isFuture && actual > 0;

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const planLabel = width >= 80 ? 'Plan' : 'P';
  const actualLabel = width >= 80 ? 'Actual' : 'A';

  return (
    <div
      className={cn(
        'flex h-full flex-col justify-center gap-0.5 px-1 py-0.5 text-[10px] tabular-nums border-r border-border/60',
        isToday && 'border-l-2 border-l-primary bg-primary/5',
      )}
      style={{ width, minWidth: width }}
    >
      <div
        role={planClickable ? 'button' : undefined}
        aria-label={planClickable ? `Filter by planned tests (${plan})` : undefined}
        onClick={planClickable ? (e) => { stop(e); onPlanClick!(); } : undefined}
        className={cn(
          'rounded-sm px-0.5 py-0.5',
          planClickable && 'cursor-pointer hover:bg-accent/50 hover:ring-1 hover:ring-schedule-plan',
        )}
        title={planClickable ? `Plan: ${plan} — click to open planned tests` : undefined}
      >
        <div className="mb-0.5 flex items-center justify-between gap-1 font-semibold leading-none">
          <span className="text-muted-foreground">{planLabel}</span>
          <span>{plan}</span>
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-sm bg-schedule-plan/30">
          <div
            className="absolute left-0 top-0 h-full bg-schedule-plan"
            style={{ width: `${planPct}%` }}
          />
        </div>
      </div>

      <div
        role={actualClickable ? 'button' : undefined}
        aria-label={actualClickable ? `Filter by actual tests (${actual})` : undefined}
        onClick={actualClickable ? (e) => { stop(e); onActualClick!(); } : undefined}
        className={cn(
          'rounded-sm px-0.5 py-0.5',
          actualClickable && 'cursor-pointer hover:bg-accent/50 hover:ring-1 hover:ring-schedule-actual',
        )}
        title={
          actualClickable
            ? `Actual: ${actual}${actualOver > 0 ? ` (+${actualOver} over)` : ''} — click to open done tests`
            : undefined
        }
      >
        <div className="mb-0.5 flex items-center justify-between gap-1 font-semibold leading-none">
          <span className="text-muted-foreground">{actualLabel}</span>
          <span className={cn(isFuture ? 'text-muted-foreground' : 'text-foreground')}>{isFuture ? '—' : actual}</span>
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-sm bg-muted/40">
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
      </div>

      {!isFuture && plan > 0 && delta !== 0 && (
        <div
          className={cn(
            'text-center text-[9px] font-semibold leading-none',
            delta < 0 ? 'text-schedule-short' : 'text-schedule-over',
          )}
        >
          Δ {delta > 0 ? `+${delta}` : delta}
        </div>
      )}
    </div>
  );
}

export const ScheduleCell = memo(ScheduleCellInner);
