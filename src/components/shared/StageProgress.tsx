import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { TcStatus, ReportStatus } from '@/types/enums';
import { cn } from '@/lib/utils';
import { formatDdMmm } from '@/lib/format';
import { isStageDelayedAsOf, isStageDone, todayIso, type StageKey, type StageMetricRow } from '@/lib/stage-metrics';

type StageState = 'done' | 'wip' | 'planned' | 'hold' | 'empty';

function classifyStage(
  row: StageMetricRow,
  stage: StageKey,
  status: TcStatus | ReportStatus | null | undefined,
  asOfDate: string,
): StageState {
  if (isStageDone(row, stage)) return 'done';
  if (isStageDelayedAsOf(row, stage, asOfDate)) return 'hold';
  if (status === 'Hold') return 'hold';
  // For T&C stages, 'WIP' literal exists; for Report stages, treat 'Submitted'/'Under Review' (non-done) as WIP.
  // For r2s the milestone IS submission, so 'Submitted'/'Under Review' map to done via isStageDone above.
  if (status === 'WIP') return 'wip';
  if (status === 'Planned') return 'planned';
  // Planned date present but not yet done → planned
  if (stage === 'r1' && row.r1_target_submission_date) return 'planned';
  if (stage === 'r2s' && row.r2_target_submission_date) return 'planned';
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
  // R1 — Subcontractor → HDEC report submission
  r1Status?: ReportStatus | null;
  r1ActualSubmissionDate?: string | null;
  r1TargetSubmissionDate?: string | null;
  // R2S — HDEC → Client report submission (active key milestone)
  r2Status?: ReportStatus | null;
  r2ActualSubmissionDate?: string | null;
  r2TargetSubmissionDate?: string | null;
  // R2A approval dates retained on the row for legacy data, but no longer surfaced.
  r2ActualApprovalDate?: string | null;
  r2TargetApprovalDate?: string | null;
  asOfDate?: string | null;
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
  r1Status = null,
  r1ActualSubmissionDate = null,
  r1TargetSubmissionDate = null,
  r2Status = null,
  r2ActualSubmissionDate = null,
  r2TargetSubmissionDate = null,
  r2ActualApprovalDate = null,
  r2TargetApprovalDate = null,
  asOfDate = null,
}: StageProgressProps) {
  const delayAsOfDate = asOfDate ?? todayIso();
  const row: StageMetricRow = {
    predecessor_status_raw: predecessorRaw,
    pred_status: predStatus,
    pred_planned_date: predPlannedDate,
    pred_actual_date: predActualDate,
    t1_status: t1Status,
    t1_planned_date: t1PlannedDate,
    t1_actual_date: t1ActualDate,
    t2_status: t2Status,
    t2_planned_date: t2PlannedDate,
    t2_actual_date: t2ActualDate,
    r1_status: r1Status,
    r1_target_submission_date: r1TargetSubmissionDate,
    r1_actual_submission_date: r1ActualSubmissionDate,
    r2_status: r2Status,
    r2_target_submission_date: r2TargetSubmissionDate,
    r2_actual_submission_date: r2ActualSubmissionDate,
    r2_target_approval_date: r2TargetApprovalDate,
    r2_actual_approval_date: r2ActualApprovalDate,
  };
  const pred = classifyStage(row, 'pred', predStatus, delayAsOfDate);
  const t1 = classifyStage(row, 't1', t1Status, delayAsOfDate);
  const t2 = classifyStage(row, 't2', t2Status, delayAsOfDate);
  const r1 = classifyStage(row, 'r1', r1Status, delayAsOfDate);
  const r2s = classifyStage(row, 'r2s', r2Status, delayAsOfDate);

  const stateLabel = (s: StageState) =>
    s === 'done' ? 'Done' : s === 'wip' ? 'WIP' : s === 'hold' ? 'Delay' : s === 'planned' ? 'Planned' : '—';

  const Connector = () => <span className="h-px w-2 bg-muted-foreground/30" aria-hidden />;

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-0.5 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <Pip state={pred} label={`Predecessor: ${stateLabel(pred)}`} />
          <Connector />
          <Pip state={t1} label={`T1: ${stateLabel(t1)}`} />
          <Connector />
          <Pip state={t2} label={`T2: ${stateLabel(t2)}`} />
          <Connector />
          <Pip state={r1} label={`R1: ${stateLabel(r1)}`} />
          <Connector />
          <Pip state={r2s} label={`R2S: ${stateLabel(r2s)}`} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="space-y-0.5">
          <div className="text-muted-foreground">Delay as of {formatDdMmm(delayAsOfDate)}</div>
          <div>
            <span className="font-medium">Predecessor:</span> {stateLabel(pred)}
            {predActualDate ? <span className="text-muted-foreground"> · {formatDdMmm(predActualDate)}</span> : (predecessorRaw ? <span className="text-muted-foreground"> ({predecessorRaw})</span> : null)}
          </div>
          <div>
            <span className="font-medium">T1:</span> {stateLabel(t1)}
            {t1ActualDate ? <span className="text-muted-foreground"> · {formatDdMmm(t1ActualDate)}</span> : (t1PlannedDate ? <span className="text-muted-foreground"> (plan {formatDdMmm(t1PlannedDate)})</span> : null)}
          </div>
          <div>
            <span className="font-medium">T2:</span> {stateLabel(t2)}
            {t2ActualDate ? <span className="text-muted-foreground"> · {formatDdMmm(t2ActualDate)}</span> : (t2PlannedDate ? <span className="text-muted-foreground"> (plan {formatDdMmm(t2PlannedDate)})</span> : null)}
          </div>
          <div>
            <span className="font-medium">R1 (Sub→HDEC):</span> {stateLabel(r1)}
            {r1ActualSubmissionDate ? (
              <span className="text-muted-foreground"> · {formatDdMmm(r1ActualSubmissionDate)}</span>
            ) : r1TargetSubmissionDate ? (
              <span className="text-muted-foreground"> (plan {formatDdMmm(r1TargetSubmissionDate)})</span>
            ) : null}
          </div>
          <div>
            <span className="font-medium">R2S (HDEC→Client):</span> {stateLabel(r2s)}
            {r2ActualSubmissionDate ? (
              <span className="text-muted-foreground"> · {formatDdMmm(r2ActualSubmissionDate)}</span>
            ) : r2TargetSubmissionDate ? (
              <span className="text-muted-foreground"> (plan {formatDdMmm(r2TargetSubmissionDate)})</span>
            ) : null}
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
      <span className="ml-2">Stages: Pred → T1 → T2 → R1 → R2S</span>
    </div>
  );
}
