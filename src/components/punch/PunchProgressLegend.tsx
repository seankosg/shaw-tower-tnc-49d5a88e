import { cn } from '@/lib/utils';
import {
  PUNCH_PROGRESS_STATES,
  PUNCH_PROGRESS_LABEL,
  PUNCH_PROGRESS_PIP_CLASS,
  PUNCH_PROGRESS_GLYPH,
} from '@/lib/punch-progress-icon';

/**
 * Legend strip for the Punch Raw Data progress_icon column.
 * Uses the same Pip badge design as Defect Raw Data.
 */
export function PunchProgressLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Progress:</span>
      {PUNCH_PROGRESS_STATES.map((state) => (
        <span key={state} className="inline-flex items-center gap-1">
          <span
            className={cn(
              'inline-flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold leading-none border',
              PUNCH_PROGRESS_PIP_CLASS[state],
            )}
            aria-label={PUNCH_PROGRESS_LABEL[state]}
          >
            <span aria-hidden>{PUNCH_PROGRESS_GLYPH[state]}</span>
          </span>
          {PUNCH_PROGRESS_LABEL[state]}
        </span>
      ))}
      <span className="ml-2">Delay = past planned completion</span>
    </div>
  );
}
