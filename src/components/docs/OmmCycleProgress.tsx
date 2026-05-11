import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { computeOmmStatus, type OMMStatusInput } from '@/lib/docs-omm-status';

/**
 * Donut-pip lifecycle progress for OMM. Eight stages reflect the resubmission cycles:
 *   Sub1 Submission → Sub1 Review → Sub2 Submission → Sub2 Review → Sub3 Submission →
 *   Sub3 Review → Final Submission → Final Review.
 * Approved closes all pips green; Rejected (B/C at final) marks the active pip rose.
 */
const STAGES = ['1S', '1R', '2S', '2R', '3S', '3R', 'FS', 'FR'] as const;
type Stage = typeof STAGES[number];

const STAGE_TITLES: Record<Stage, string> = {
  '1S': '1st Submission',
  '1R': '1st Review',
  '2S': '2nd Submission',
  '2R': '2nd Review',
  '3S': '3rd Submission',
  '3R': '3rd Review',
  FS: 'Final Submission',
  FR: 'Final Review',
};

function statusToIndex(s: ReturnType<typeof computeOmmStatus>): number {
  switch (s) {
    case 'Pending Sub1': return 0;
    case 'Sub1 Under Review': return 1;
    case 'Pending Sub2': return 2;
    case 'Sub2 Under Review': return 3;
    case 'Pending Sub3': return 4;
    case 'Sub3 Under Review': return 5;
    case 'Pending Final': return 6;
    case 'Final Under Review': return 7;
    case 'Approved': return 8;
    default: return -1;
  }
}

type PipState = 'done' | 'active' | 'pending' | 'rejected' | 'closed';

function pipClasses(state: PipState): string {
  switch (state) {
    case 'done':
      return 'bg-emerald-500 text-white border-emerald-600';
    case 'active':
      return 'bg-amber-500 text-white border-amber-600';
    case 'rejected':
      return 'bg-rose-500 text-white border-rose-600';
    case 'closed':
      return 'bg-emerald-600 text-white border-emerald-700';
    case 'pending':
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function StagePip({ state, glyph, label }: { state: PipState; glyph: string; label: string }) {
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center h-4 min-w-4 px-0.5 rounded-full text-[9px] font-bold leading-none border',
        pipClasses(state),
      )}
    >
      {glyph}
    </span>
  );
}

export function OmmCycleProgress({ row, className }: { row: OMMStatusInput; className?: string }) {
  const status = computeOmmStatus(row);
  const activeIdx = statusToIndex(status);
  const rejected = status === 'Rejected';
  const closed = status === 'Approved';

  const stages = STAGES.map((stage, i) => {
    let state: PipState;
    if (rejected && i === Math.max(0, activeIdx)) state = 'rejected';
    else if (rejected) state = 'pending';
    else if (closed) state = 'closed';
    else if (activeIdx > i) state = 'done';
    else if (activeIdx === i) state = 'active';
    else state = 'pending';
    return { stage, state, label: STAGE_TITLES[stage] };
  });

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 select-none rounded-md px-1 py-0.5',
            rejected && 'ring-2 ring-rose-500 ring-offset-1 bg-rose-50/40 dark:bg-rose-950/30',
            closed && 'opacity-70',
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {stages.map((s, idx) => (
            <span key={s.stage} className="inline-flex items-center">
              <StagePip state={s.state} glyph={s.stage} label={s.label} />
              {idx < stages.length - 1 && (
                <span className="h-px w-1.5 bg-muted-foreground/30" aria-hidden />
              )}
            </span>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="space-y-1 min-w-[180px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Status</span>
            <span className="font-semibold">{status}</span>
          </div>
          <div className="border-t pt-1 space-y-0.5">
            {stages.map((s) => (
              <div key={s.stage} className="flex items-center gap-2">
                <StagePip state={s.state} glyph={s.stage} label={s.label} />
                <span className="font-medium">{s.label}</span>
              </div>
            ))}
          </div>
          {rejected && (
            <div className="text-rose-600 font-medium border-t pt-1">
              ⚠ Rejected (B/C) — resubmission required
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function OmmCycleProgressLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Legend:</span>
      <span className="inline-flex items-center gap-1"><StagePip state="done" glyph="✓" label="Done" /> Done</span>
      <span className="inline-flex items-center gap-1"><StagePip state="active" glyph="•" label="Active" /> Active</span>
      <span className="inline-flex items-center gap-1"><StagePip state="pending" glyph="·" label="Pending" /> Pending</span>
      <span className="inline-flex items-center gap-1"><StagePip state="closed" glyph="S" label="Approved" /> Approved</span>
      <span className="inline-flex items-center gap-1"><StagePip state="rejected" glyph="✕" label="Rejected" /> Rejected</span>
    </div>
  );
}
