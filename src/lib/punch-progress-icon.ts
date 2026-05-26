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

export type PunchProgressState = 'planned' | 'wip' | 'delay' | 'completed';

export interface PunchProgressInput {
  actual_progress_pct?: number | null;
  actual_start_date?: string | null;
  actual_completion_date?: string | null;
  planned_completion_date?: string | null;
}

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
