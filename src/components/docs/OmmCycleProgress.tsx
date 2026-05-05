import { cn } from '@/lib/utils';
import { computeOmmStatus, type OMMStatusInput } from '@/lib/docs-omm-status';

/**
 * Five-dot mini progress for the OMM lifecycle:
 *   Pending Draft → Draft UR → Pending Final → Final UR → Approved
 *
 * Rejected (B/C response) renders the active dot in destructive red.
 */
const STAGES = ['PD', 'DUR', 'PF', 'FUR', 'A'] as const;

const STAGE_TITLES: Record<typeof STAGES[number], string> = {
  PD: 'Pending Draft',
  DUR: 'Draft Under Review',
  PF: 'Pending Final Submission',
  FUR: 'Final Under Review',
  A: 'Approved',
};

function statusToIndex(s: ReturnType<typeof computeOmmStatus>): number {
  switch (s) {
    case 'Pending Draft':
      return 0;
    case 'Draft Under Review':
      return 1;
    case 'Pending Final Submission':
      return 2;
    case 'Final Under Review':
      return 3;
    case 'Approved':
      return 4;
    default:
      return -1; // Rejected
  }
}

export function OmmCycleProgress({ row, className }: { row: OMMStatusInput; className?: string }) {
  const status = computeOmmStatus(row);
  const activeIdx = statusToIndex(status);
  const rejected = status === 'Rejected';

  return (
    <div
      className={cn('inline-flex items-center gap-0.5', className)}
      title={status}
      aria-label={status}
    >
      {STAGES.map((stage, i) => {
        const done = !rejected && activeIdx > i;
        const active = !rejected && activeIdx === i;
        return (
          <span
            key={stage}
            title={STAGE_TITLES[stage]}
            className={cn(
              'inline-block h-1.5 w-3 rounded-sm',
              rejected && i === Math.max(0, activeIdx)
                ? 'bg-rose-500'
                : rejected
                  ? 'bg-rose-200 dark:bg-rose-900/40'
                  : done
                    ? 'bg-emerald-500'
                    : active
                      ? 'bg-amber-500'
                      : 'bg-muted-foreground/20',
            )}
          />
        );
      })}
    </div>
  );
}
