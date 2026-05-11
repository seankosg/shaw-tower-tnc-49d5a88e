import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { computeOmmStatus, type OMMStatusInput, type OMMStatus } from '@/lib/docs-omm-status';

/**
 * 4-pip lifecycle progress for OMM. One pip per cycle: 1R, 2R, 3R, FR.
 * Each pip represents the entire cycle (submission + response).
 * Tooltip shows planned/actual + response status for every cycle.
 */
const CYCLES = ['1R', '2R', '3R', 'FR'] as const;
type Cycle = typeof CYCLES[number];

const CYCLE_TITLES: Record<Cycle, string> = {
  '1R': 'Cycle 1 (Sub1)',
  '2R': 'Cycle 2 (Sub2)',
  '3R': 'Cycle 3 (Sub3)',
  FR: 'Final',
};

type PipState = 'done' | 'active' | 'pending' | 'rejected' | 'closed' | 'skipped';

function activeCycleIndex(s: OMMStatus): number {
  switch (s) {
    case 'Pending Sub1':
    case 'Sub1 Under Review':
      return 0;
    case 'Pending Sub2':
    case 'Sub2 Under Review':
      return 1;
    case 'Pending Sub3':
    case 'Sub3 Under Review':
      return 2;
    case 'Pending Final':
    case 'Final Under Review':
      return 3;
    default:
      return -1;
  }
}

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
    case 'skipped':
      return 'bg-muted/40 text-muted-foreground border-dashed border-muted-foreground/40';
    case 'pending':
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

const PIP_GLYPH: Record<PipState, string> = {
  done: '✓',
  active: '•',
  pending: '·',
  rejected: '✕',
  closed: '✓',
  skipped: '–',
};

function StagePip({ state, label }: { state: PipState; label: string }) {
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center h-4 w-4 rounded-full text-[9px] font-bold leading-none border',
        pipClasses(state),
      )}
    >
      <span aria-hidden>{PIP_GLYPH[state]}</span>
    </span>
  );
}

const u = (v: string | null | undefined) => (v ?? '').toUpperCase();

function computeCycleStates(row: OMMStatusInput, status: OMMStatus): PipState[] {
  if (status === 'Approved') return ['closed', 'closed', 'closed', 'closed'];
  if (status === 'Rejected') return ['rejected', 'rejected', 'rejected', 'rejected'];

  const active = activeCycleIndex(status);
  const s1 = u(row.sub1_response_status);
  const s2 = u(row.sub2_response_status);
  const s3 = u(row.sub3_response_status);

  return CYCLES.map((_, i) => {
    if (i === active) return 'active';
    if (i > active) return 'pending';
    // i < active → cycle has been passed
    // Skipped: previous A response jumped over middle cycles
    if (i === 1 && s1 === 'A') return 'skipped';
    if (i === 2 && (s1 === 'A' || s2 === 'A')) return 'skipped';
    return 'done';
  });
}

function fmt(d?: string | null): string {
  if (!d) return '—';
  // Show as YYYY-MM-DD or original
  return d.length >= 10 ? d.slice(0, 10) : d;
}

function StatusBadge({ status }: { status?: string | null }) {
  const s = u(status);
  if (!s) return <span className="text-muted-foreground text-[10px]">—</span>;
  const cls =
    s === 'A'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
      : 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200';
  return (
    <span className={cn('inline-block px-1.5 py-0 rounded text-[10px] font-semibold', cls)}>
      {s}
    </span>
  );
}

function CycleRow({
  state,
  title,
  submitPlanned,
  submitActual,
  reviewPlanned,
  reviewActual,
  responseStatus,
}: {
  state: PipState;
  title: string;
  submitPlanned?: string | null;
  submitActual?: string | null;
  reviewPlanned?: string | null;
  reviewActual?: string | null;
  responseStatus?: string | null;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-2 py-1">
      <StagePip state={state} label={title} />
      <div className="space-y-0.5">
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-[10px] text-muted-foreground">
          Submit: {fmt(submitPlanned)} / {fmt(submitActual)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          Review: {fmt(reviewPlanned)} / {fmt(reviewActual)}
        </div>
      </div>
      <StatusBadge status={responseStatus} />
    </div>
  );
}

export function OmmCycleProgress({ row, className }: { row: OMMStatusInput; className?: string }) {
  const status = computeOmmStatus(row);
  const states = computeCycleStates(row, status);
  const rejected = status === 'Rejected';
  const closed = status === 'Approved';

  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 select-none rounded-md px-1 py-0.5',
            rejected && 'ring-2 ring-rose-500 ring-offset-1 bg-rose-50/40 dark:bg-rose-950/30',
            closed && 'opacity-80',
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {CYCLES.map((cycle, idx) => (
            <span key={cycle} className="inline-flex items-center">
              <StagePip state={states[idx]} label={CYCLE_TITLES[cycle]} />
              {idx < CYCLES.length - 1 && (
                <span className="h-px w-2 bg-muted-foreground/30" aria-hidden />
              )}
            </span>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        <div className="space-y-1 min-w-[280px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Status</span>
            <span className="font-semibold">{status}</span>
          </div>
          <div className="border-t pt-1 divide-y divide-border/40">
            <CycleRow
              state={states[0]}
              title={CYCLE_TITLES['1R']}
              submitPlanned={row.sub1_planned_date}
              submitActual={row.sub1_actual_date}
              reviewPlanned={null}
              reviewActual={row.sub1_response_date}
              responseStatus={row.sub1_response_status}
            />
            <CycleRow
              state={states[1]}
              title={CYCLE_TITLES['2R']}
              submitPlanned={row.sub2_planned_date}
              submitActual={row.sub2_actual_date}
              reviewPlanned={row.sub2_response_planned_date}
              reviewActual={row.sub2_response_actual_date}
              responseStatus={row.sub2_response_status}
            />
            <CycleRow
              state={states[2]}
              title={CYCLE_TITLES['3R']}
              submitPlanned={row.sub3_planned_date}
              submitActual={row.sub3_actual_date}
              reviewPlanned={row.sub3_response_planned_date}
              reviewActual={row.sub3_response_actual_date}
              responseStatus={row.sub3_response_status}
            />
            <CycleRow
              state={states[3]}
              title={CYCLE_TITLES.FR}
              submitPlanned={row.final_planned_date}
              submitActual={row.final_actual_date}
              reviewPlanned={row.final_response_planned_date}
              reviewActual={row.final_response_actual_date}
              responseStatus={row.final_response_status}
            />
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
      <span className="inline-flex items-center gap-1"><StagePip state="done" label="Done" /> Done</span>
      <span className="inline-flex items-center gap-1"><StagePip state="active" label="Active" /> Active</span>
      <span className="inline-flex items-center gap-1"><StagePip state="skipped" label="Skipped" /> Skipped</span>
      <span className="inline-flex items-center gap-1"><StagePip state="pending" label="Pending" /> Pending</span>
      <span className="inline-flex items-center gap-1"><StagePip state="rejected" label="Rejected" /> Rejected</span>
    </div>
  );
}
