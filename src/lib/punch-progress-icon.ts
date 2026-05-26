/**
 * Punch Progress Icon — derives a single visual state from a punch_items row.
 *
 * States (evaluated in order):
 *   1. Completed — actual_progress_pct >= 100 OR actual_completion_date set
 *   2. Delay    — planned_completion_date < today AND not completed
 *   3. WIP      — actual_progress_pct > 0 OR actual_start_date set
 *   4. Planned  — otherwise
 */
import { AlertTriangle, CheckCircle2, Circle, PlayCircle, type LucideIcon } from 'lucide-react';
import { formatDdMmm } from '@/lib/format';

export type PunchProgressState = 'planned' | 'wip' | 'delay' | 'completed';

export interface PunchProgressInput {
  actual_progress_pct?: number | null;
  actual_start_date?: string | null;
  actual_completion_date?: string | null;
  planned_start_date?: string | null;
  planned_completion_date?: string | null;
}

export const PUNCH_PROGRESS_STATES: PunchProgressState[] = ['planned', 'wip', 'delay', 'completed'];

export function computePunchProgressState(
  row: PunchProgressInput,
  asOf?: string | Date | null,
): PunchProgressState {
  const pct = row.actual_progress_pct == null ? null : Number(row.actual_progress_pct);
  if ((pct != null && pct >= 100) || row.actual_completion_date) return 'completed';

  const today = asOf
    ? typeof asOf === 'string' ? asOf.slice(0, 10) : asOf.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  if (row.planned_completion_date && row.planned_completion_date.slice(0, 10) < today) {
    return 'delay';
  }

  if ((pct != null && pct > 0) || row.actual_start_date) return 'wip';
  return 'planned';
}

export const PUNCH_PROGRESS_LABEL: Record<PunchProgressState, string> = {
  planned: 'Planned',
  wip: 'WIP',
  delay: 'Delay',
  completed: 'Completed',
};

export const PUNCH_PROGRESS_ICON: Record<PunchProgressState, LucideIcon> = {
  planned: Circle,
  wip: PlayCircle,
  delay: AlertTriangle,
  completed: CheckCircle2,
};

export const PUNCH_PROGRESS_COLOR: Record<PunchProgressState, string> = {
  planned: 'text-muted-foreground',
  wip: 'text-blue-600 dark:text-blue-400',
  delay: 'text-rose-600 dark:text-rose-400',
  completed: 'text-emerald-600 dark:text-emerald-400',
};

export interface PunchProgressTooltipLine {
  label: string;
  value: string;
  muted?: boolean;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

export function getPunchProgressTooltipLines(
  row: PunchProgressInput,
  asOf?: string | Date | null,
): PunchProgressTooltipLine[] {
  const state = computePunchProgressState(row, asOf);
  const today = asOf
    ? typeof asOf === 'string' ? asOf.slice(0, 10) : asOf.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const lines: PunchProgressTooltipLine[] = [
    { label: 'State', value: PUNCH_PROGRESS_LABEL[state] },
  ];
  if (row.actual_progress_pct != null && row.actual_progress_pct !== undefined) {
    lines.push({ label: 'Progress', value: `${Math.round(Number(row.actual_progress_pct))}%` });
  }
  if (row.planned_start_date) {
    lines.push({ label: 'Planned Start', value: formatDdMmm(row.planned_start_date), muted: true });
  }
  if (row.actual_start_date) {
    lines.push({ label: 'Actual Start', value: formatDdMmm(row.actual_start_date) });
  }
  if (row.planned_completion_date) {
    lines.push({ label: 'Planned Comp.', value: formatDdMmm(row.planned_completion_date), muted: true });
  }
  if (row.actual_completion_date) {
    lines.push({ label: 'Actual Comp.', value: formatDdMmm(row.actual_completion_date) });
  }
  if (state === 'delay' && row.planned_completion_date) {
    const days = daysBetween(row.planned_completion_date.slice(0, 10), today);
    if (days > 0) {
      lines.push({ label: 'Overdue by', value: `${days} day${days === 1 ? '' : 's'}` });
    }
  }
  return lines;
}
