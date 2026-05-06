import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  WARRANTY_STAGE_KEYS,
  WARRANTY_STAGE_LABELS,
  classifyWarrantyStageState,
  computeWarrantyOverallStatus,
  type WarrantyStageState,
  type WarrantyStatusInput,
} from '@/lib/docs-warranty-status';

const PIP_GLYPH: Record<typeof WARRANTY_STAGE_KEYS[number], string> = {
  acra: 'A',
  draft: 'D',
  subcon: 'S',
  hdec: 'H',
  final: 'F',
};

function pipClasses(state: WarrantyStageState): string {
  switch (state) {
    case 'Done':
      return 'bg-emerald-500 text-white border-emerald-600';
    case 'WIP':
      return 'bg-amber-500 text-white border-amber-600';
    case 'Delayed':
      return 'bg-rose-500 text-white border-rose-600';
    case 'Planned':
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function StagePip({ state, glyph, label }: { state: WarrantyStageState; glyph: string; label: string }) {
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

export function WarrantyCycleProgress({
  row,
  asOf,
  className,
}: {
  row: WarrantyStatusInput;
  asOf?: string | Date | null;
  className?: string;
}) {
  const overall = computeWarrantyOverallStatus(row);
  const stages = WARRANTY_STAGE_KEYS.map((key) => ({
    key,
    glyph: PIP_GLYPH[key],
    label: WARRANTY_STAGE_LABELS[key],
    state: classifyWarrantyStageState(row, key, asOf),
  }));
  const rejected = overall === 'Rejected';
  const closed = overall === 'Approved';

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
            <span key={s.key} className="inline-flex items-center">
              <StagePip state={s.state} glyph={s.glyph} label={s.label} />
              {idx < stages.length - 1 && <span className="h-px w-1.5 bg-muted-foreground/30" aria-hidden />}
            </span>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="space-y-1 min-w-[180px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Status</span>
            <span className="font-semibold">{overall}</span>
          </div>
          <div className="border-t pt-1 space-y-0.5">
            {stages.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <StagePip state={s.state} glyph={s.glyph} label={s.label} />
                <span className="font-medium">{s.label}</span>
                <span className="ml-auto text-muted-foreground">{s.state}</span>
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

export function WarrantyCycleProgressLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Legend:</span>
      <span className="inline-flex items-center gap-1"><StagePip state="Done" glyph="✓" label="Done" /> Done</span>
      <span className="inline-flex items-center gap-1"><StagePip state="WIP" glyph="•" label="WIP" /> WIP</span>
      <span className="inline-flex items-center gap-1"><StagePip state="Planned" glyph="·" label="Planned" /> Planned</span>
      <span className="inline-flex items-center gap-1"><StagePip state="Delayed" glyph="!" label="Delayed" /> Delayed</span>
    </div>
  );
}
