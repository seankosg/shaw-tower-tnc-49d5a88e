import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TcStatus } from '@/types/enums';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';

type StageState = 'done' | 'wip' | 'planned' | 'hold' | 'empty';

const PRED_DONE_TOKENS = ['done', '완료', 'complete', 'completed', 'finished'];

const TODAY = () => new Date().toISOString().slice(0, 10);

function isOverdue(plannedDate: string | null | undefined): boolean {
  if (!plannedDate) return false;
  return plannedDate < TODAY();
}

function classifyPred(
  rawPred: string | null,
  predStatus: TcStatus | null | undefined,
  plannedDate?: string | null,
): StageState {
  if (predStatus === 'Done') return 'done';
  if (predStatus === 'Hold') return 'hold';
  if (predStatus === 'WIP') {
    return isOverdue(plannedDate) ? 'hold' : 'wip';
  }
  if (predStatus === 'Planned') {
    return isOverdue(plannedDate) ? 'hold' : 'planned';
  }
  // Fallback: raw text only when status is null (legacy rows)
  if (rawPred) {
    const v = rawPred.trim().toLowerCase();
    if (!v) return 'empty';
    if (PRED_DONE_TOKENS.some(t => v === t || v.includes(t))) return 'done';
    return isOverdue(plannedDate) ? 'hold' : 'planned';
  }
  return 'empty';
}

function classifyStatus(s: TcStatus | null, plannedDate?: string | null): StageState {
  if (s === 'Done') return 'done';
  if (s === 'Hold') return 'hold';
  if (s === 'WIP') {
    return isOverdue(plannedDate) ? 'hold' : 'wip';
  }
  if (s === 'Planned') {
    return isOverdue(plannedDate) ? 'hold' : 'planned';
  }
  return 'empty';
}

function Pip({ state, label }: { state: StageState; label: string }) {
  const base = 'inline-flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold leading-none border';
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

export interface StageProgressProps {
  predecessorRaw: string | null;
  predStatus?: TcStatus | null;
  predActualDate?: string | null;
  predPlannedDate?: string | null;
  t1Status: TcStatus | null;
  t1ActualDate: string | null;
  t1PlannedDate?: string | null;
  t2Status: TcStatus | null;
  t2ActualDate: string | null;
  t2PlannedDate?: string | null;
}

export function StageProgress({
  predecessorRaw,
  predStatus = null,
  predActualDate = null,
  predPlannedDate = null,
  t1Status,
  t1ActualDate,
  t1PlannedDate = null,
  t2Status,
  t2ActualDate,
  t2PlannedDate = null,
}: StageProgressProps) {
  const pred = classifyPred(predecessorRaw, predStatus, predPlannedDate);
  const t1 = classifyStatus(t1Status, t1PlannedDate);
  const t2 = classifyStatus(t2Status, t2PlannedDate);

  const stateLabel = (s: StageState) =>
    s === 'done' ? 'Done' : s === 'wip' ? 'WIP' : s === 'hold' ? 'Delay' : s === 'planned' ? 'Planned' : '—';

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-0.5 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <Pip state={pred} label={`Predecessor: ${stateLabel(pred)}`} />
          <span className="h-px w-2 bg-muted-foreground/30" aria-hidden />
          <Pip state={t1} label={`T1: ${stateLabel(t1)}`} />
          <span className="h-px w-2 bg-muted-foreground/30" aria-hidden />
          <Pip state={t2} label={`T2: ${stateLabel(t2)}`} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="space-y-0.5">
          <div>
            <span className="font-medium">Predecessor:</span> {stateLabel(pred)}
            {predActualDate ? <span className="text-muted-foreground"> · {formatDdMmm(predActualDate)}</span> : (predecessorRaw ? <span className="text-muted-foreground"> ({predecessorRaw})</span> : null)}
          </div>
          <div>
            <span className="font-medium">T1:</span> {stateLabel(t1)}
            {t1ActualDate ? <span className="text-muted-foreground"> · {formatDdMmm(t1ActualDate)}</span> : null}
          </div>
          <div>
            <span className="font-medium">T2:</span> {stateLabel(t2)}
            {t2ActualDate ? <span className="text-muted-foreground"> · {formatDdMmm(t2ActualDate)}</span> : null}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function StageProgressLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">Legend:</span>
      <span className="inline-flex items-center gap-1"><Pip state="done" label="Done" /> Done</span>
      <span className="inline-flex items-center gap-1"><Pip state="wip" label="WIP" /> WIP</span>
      <span className="inline-flex items-center gap-1"><Pip state="planned" label="Planned" /> Planned</span>
      <span className="inline-flex items-center gap-1"><Pip state="hold" label="Delay" /> Delay</span>
      <span className="ml-2">Stages: Pred → T1 → T2</span>
    </div>
  );
}
