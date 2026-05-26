import { cn } from '@/lib/utils';
import {
  PUNCH_PROGRESS_STATES,
  PUNCH_PROGRESS_LABEL,
  PUNCH_PROGRESS_ICON,
  PUNCH_PROGRESS_COLOR,
} from '@/lib/punch-progress-icon';

/**
 * Legend strip for the Punch Raw Data progress_icon column.
 * Mirrors the visual tone of DefectStageProgressLegend / StageProgressLegend.
 */
export function PunchProgressLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Progress:</span>
      {PUNCH_PROGRESS_STATES.map((state) => {
        const Icon = PUNCH_PROGRESS_ICON[state];
        return (
          <span key={state} className="inline-flex items-center gap-1">
            <Icon className={cn('h-3.5 w-3.5', PUNCH_PROGRESS_COLOR[state])} aria-hidden />
            {PUNCH_PROGRESS_LABEL[state]}
          </span>
        );
      })}
      <span className="ml-2">Delay = past planned completion</span>
    </div>
  );
}
