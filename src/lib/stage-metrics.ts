import type { TcStatus, ReportStatus } from '@/types/enums';
import {
  isR1Done as reportIsR1Done,
  isR2Done as reportIsR2Done,
  isR2Submitted as reportIsR2Submitted,
} from '@/types/enums';

// Stage keys used across schedule + dashboard utilities.
// `r2` is split into:
//   - `r2s` → R2 Submission milestone (target/actual submission date)
//   - `r2a` → R2 Approval milestone   (target/actual approval date)
// Both share the single `r2_status` column on subtests.
export type StageKey = 'pred' | 't1' | 't2' | 'r1' | 'r2s' | 'r2a';

export interface StageMetricRow {
  predecessor_status_raw?: string | null;
  pred_status?: TcStatus | null;
  pred_planned_date?: string | null;
  pred_actual_date?: string | null;
  t1_status?: TcStatus | null;
  t1_planned_date?: string | null;
  t1_actual_date?: string | null;
  t2_status?: TcStatus | null;
  t2_planned_date?: string | null;
  t2_actual_date?: string | null;
  // R1 — Subcontractor → HDEC report (planned = target submission)
  r1_status?: ReportStatus | null;
  r1_target_submission_date?: string | null;
  r1_actual_submission_date?: string | null;
  // R2 — HDEC → Client report. Single status column drives both R2S and R2A.
  r2_status?: ReportStatus | null;
  r2_target_submission_date?: string | null;
  r2_actual_submission_date?: string | null;
  r2_target_approval_date?: string | null;
  r2_actual_approval_date?: string | null;
}

const PRED_DONE_TOKENS = ['done', 'complete', 'completed', 'finished', '완료'];

export function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

export function getStageStatus(row: StageMetricRow, stage: StageKey): TcStatus | ReportStatus | null {
  if (stage === 'pred') return row.pred_status ?? null;
  if (stage === 't1') return row.t1_status ?? null;
  if (stage === 't2') return row.t2_status ?? null;
  if (stage === 'r1') return row.r1_status ?? null;
  // r2s and r2a share r2_status
  return row.r2_status ?? null;
}

export function getStagePlannedDate(row: StageMetricRow, stage: StageKey): string | null {
  if (stage === 'pred') return row.pred_planned_date ?? null;
  if (stage === 't1') return row.t1_planned_date ?? null;
  if (stage === 't2') return row.t2_planned_date ?? null;
  if (stage === 'r1') return row.r1_target_submission_date ?? null;
  if (stage === 'r2s') return row.r2_target_submission_date ?? null;
  // r2a → final approval target date
  return row.r2_target_approval_date ?? null;
}

export function getStageActualDate(row: StageMetricRow, stage: StageKey): string | null {
  if (!isStageDone(row, stage)) return null;
  if (stage === 'pred') return row.pred_actual_date ?? null;
  if (stage === 't1') return row.t1_actual_date ?? null;
  if (stage === 't2') return row.t2_actual_date ?? null;
  if (stage === 'r1') return row.r1_actual_submission_date ?? null;
  if (stage === 'r2s') return row.r2_actual_submission_date ?? null;
  return row.r2_actual_approval_date ?? null;
}

export function isStageDone(row: StageMetricRow, stage: StageKey): boolean {
  // R1: defensive fallback if status missing but actual date present
  if (stage === 'r1') {
    if (row.r1_status == null && row.r1_actual_submission_date) return true;
    return reportIsR1Done(row.r1_status ?? null);
  }
  // R2 Submission: done if status >= Submitted, or fallback when status missing but actual sub date present
  if (stage === 'r2s') {
    if (row.r2_status == null && row.r2_actual_submission_date) return true;
    return reportIsR2Submitted(row.r2_status ?? null);
  }
  // R2 Approval: done only when status === Approved (or fallback when status missing but approval date present)
  if (stage === 'r2a') {
    if (row.r2_status == null && row.r2_actual_approval_date) return true;
    return reportIsR2Done(row.r2_status ?? null);
  }

  const status = getStageStatus(row, stage) as TcStatus | null;
  if (status === 'Done') return true;
  if (stage !== 'pred' || status != null) return false;

  const raw = (row.predecessor_status_raw ?? '').trim().toLowerCase();
  if (!raw) return false;
  return PRED_DONE_TOKENS.some(token => raw === token || raw.includes(token));
}

export function isStagePlannedOn(row: StageMetricRow, stage: StageKey, date: string): boolean {
  return getStagePlannedDate(row, stage) === date;
}

export function isStageActualOn(row: StageMetricRow, stage: StageKey, date: string): boolean {
  return getStageActualDate(row, stage) === date;
}

export function isStagePlannedUpTo(row: StageMetricRow, stage: StageKey, asOfDate: string): boolean {
  const planned = getStagePlannedDate(row, stage);
  return !!planned && planned <= asOfDate;
}

export function isStageActualUpTo(row: StageMetricRow, stage: StageKey, asOfDate: string): boolean {
  const actual = getStageActualDate(row, stage);
  return !!actual && actual <= asOfDate;
}

export function isStageDelayedAsOf(row: StageMetricRow, stage: StageKey, asOfDate: string): boolean {
  return isStagePlannedUpTo(row, stage, asOfDate) && !isStageDone(row, stage);
}

export function getStageDelayDaysAsOf(row: StageMetricRow, stage: StageKey, asOfDate: string): number {
  const planned = getStagePlannedDate(row, stage);
  if (!planned || !isStageDelayedAsOf(row, stage, asOfDate)) return 0;
  return Math.max(0, daysBetween(planned, asOfDate));
}

export function getAnyStageDelayedAsOf(row: StageMetricRow, stages: StageKey[], asOfDate: string): boolean {
  return stages.some(stage => isStageDelayedAsOf(row, stage, asOfDate));
}

export function getMaxDelayDaysAsOf(row: StageMetricRow, stages: StageKey[], asOfDate: string): number {
  return stages.reduce((worst, stage) => Math.max(worst, getStageDelayDaysAsOf(row, stage, asOfDate)), 0);
}

export const ALL_STAGE_KEYS: StageKey[] = ['pred', 't1', 't2', 'r1', 'r2s', 'r2a'];

export type StageFilterInput = 'all' | StageKey | StageKey[];

export function getStageKeys(filter: StageFilterInput): StageKey[] {
  if (filter === 'all') return ALL_STAGE_KEYS;
  if (Array.isArray(filter)) {
    if (filter.length === 0) return ALL_STAGE_KEYS;
    // preserve canonical order
    return ALL_STAGE_KEYS.filter(k => filter.includes(k));
  }
  return [filter];
}
