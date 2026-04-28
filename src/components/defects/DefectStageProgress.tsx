import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import {
  isStageDone,
  isStageDelayedAsOf,
  isClosureComplete,
  isActualComplete,
  todayIso,
  type DefectDashboardStage,
  type DefectForDashboard,
} from '@/lib/defect-dashboard-utils';

type StageState = 'done' | 'wip' | 'planned' | 'hold' | 'empty';

function classifyStage(
  item: DefectForDashboard,
  stage: DefectDashboardStage,
  asOfDate: string,
): StageState {
  if (isStageDone(item, stage)) return 'done';
  if (isStageDelayedAsOf(item, stage, asOfDate)) return 'hold';

  // WIP: derived from row indicators
  const completionStatus = String((item as any).completion_status ?? '').toLowerCase();
  const closureStatus = String((item as any).closure_status ?? '').toLowerCase();
  if (stage === 'start') {
    // Start considered WIP if actual_start_date exists but not yet completed
    if (item.actual_start_date) return 'wip';
  }
  if (stage === 'completion') {
    if (completionStatus === 'wip') return 'wip';
    const pct = Number(item.actual_progress_pct ?? 0);
    if (pct > 0 && pct < 100) return 'wip';
  }
  if (stage === 'closure') {
    if (closureStatus === 'wip') return 'wip';
    // Cascade hint: if completion is done but closure not yet → closure is WIP
    if (isActualComplete(item) && !isClosureComplete(item)) return 'wip';
  }

  // Planned (not yet started but plan exists)
  const plan =
    stage === 'start'
      ? item.planned_start_date
      : stage === 'completion'
      ? item.planned_completion_date
      : item.planned_closure_date;
  if (plan) return 'planned';
  return 'empty';
}

function Pip({ state, label }: { state: StageState; label: string }) {
  const base =
    'inline-flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold leading-none border';
  const styles: Record<StageState, string> = {
    done: 'bg-success border-success text-success-foreground',
    wip: 'bg-amber-400 border-amber-500 text-white',
    planned: 'bg-transparent border-muted-foreground/40 text-muted-foreground/60',
    hold: 'bg-destructive border-destructive text-destructive-foreground',
    empty: 'bg-transparent border-muted-foreground/20 text-muted-foreground/40',
  };
  const glyph: Record<StageState, string> = {
    done: '●',
    wip: '◐',
    planned: '○',
    hold: '⊘',
    empty: '○',
  };
  return (
    <span className={cn(base, styles[state])} aria-label={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden>{glyph[state]}</span>
    </span>
  );
}

const stateLabel = (s: StageState) =>
  s === 'done' ? 'Done' : s === 'wip' ? 'WIP' : s === 'hold' ? 'Delay' : s === 'planned' ? 'Planned' : '—';

export interface DefectStageProgressProps {
  item: DefectForDashboard;
  asOfDate?: string | null;
}

export function DefectStageProgress({ item, asOfDate = null }: DefectStageProgressProps) {
  const delayAsOfDate = asOfDate ?? todayIso();
  const start = classifyStage(item, 'start', delayAsOfDate);
  const completion = classifyStage(item, 'completion', delayAsOfDate);
  const closure = classifyStage(item, 'closure', delayAsOfDate);

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-0.5 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <Pip state={start} label={`Start: ${stateLabel(start)}`} />
          <span className="h-px w-2 bg-muted-foreground/30" aria-hidden />
          <Pip state={completion} label={`Completion: ${stateLabel(completion)}`} />
          <span className="h-px w-2 bg-muted-foreground/30" aria-hidden />
          <Pip state={closure} label={`Closure: ${stateLabel(closure)}`} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="space-y-0.5">
          <div className="text-muted-foreground">Delay as of {formatDdMmm(delayAsOfDate)}</div>
          <div>
            <span className="font-medium">Start:</span> {stateLabel(start)}
            {item.actual_start_date ? (
              <span className="text-muted-foreground"> · {formatDdMmm(item.actual_start_date)}</span>
            ) : item.planned_start_date ? (
              <span className="text-muted-foreground"> (plan {formatDdMmm(item.planned_start_date)})</span>
            ) : null}
          </div>
          <div>
            <span className="font-medium">Completion:</span> {stateLabel(completion)}
            {item.actual_completion_date ? (
              <span className="text-muted-foreground"> · {formatDdMmm(item.actual_completion_date)}</span>
            ) : item.planned_completion_date ? (
              <span className="text-muted-foreground"> (plan {formatDdMmm(item.planned_completion_date)})</span>
            ) : null}
          </div>
          <div>
            <span className="font-medium">Closure:</span> {stateLabel(closure)}
            {item.actual_closure_date ? (
              <span className="text-muted-foreground"> · {formatDdMmm(item.actual_closure_date)}</span>
            ) : item.planned_closure_date ? (
              <span className="text-muted-foreground"> (plan {formatDdMmm(item.planned_closure_date)})</span>
            ) : null}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function DefectStageProgressLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Legend:</span>
      <span className="inline-flex items-center gap-1"><Pip state="done" label="Done" /> Done</span>
      <span className="inline-flex items-center gap-1"><Pip state="wip" label="WIP" /> WIP</span>
      <span className="inline-flex items-center gap-1"><Pip state="planned" label="Planned" /> Planned</span>
      <span className="inline-flex items-center gap-1"><Pip state="hold" label="Delay" /> Delay</span>
      <span className="ml-2">Stages: Start → Completion → Closure</span>
    </div>
  );
}
