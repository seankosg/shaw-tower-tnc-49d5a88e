import type { TcStatus, ReportStatus } from '@/types/enums';
import { isR1Done as reportIsR1Done, isR2Done as reportIsR2Done } from '@/types/enums';

export type StageKey = 'pred' | 't1' | 't2' | 'r1' | 'r2';

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
  // R2 — HDEC → Client report (final completion = approval)
  // For R2, "planned" date = target APPROVAL date (final closure milestone)
  // and "actual" date = actual approval date.
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
  return row.r2_status ?? null;
}

export function getStagePlannedDate(row: StageMetricRow, stage: StageKey): string | null {
  if (stage === 'pred') return row.pred_planned_date ?? null;
  if (stage === 't1') return row.t1_planned_date ?? null;
  if (stage === 't2') return row.t2_planned_date ?? null;
  if (stage === 'r1') return row.r1_target_submission_date ?? null;
  // R2 final milestone = approval target date
  return row.r2_target_approval_date ?? null;
}

export function getStageActualDate(row: StageMetricRow, stage: StageKey): string | null {
  if (!isStageDone(row, stage)) return null;
  if (stage === 'pred') return row.pred_actual_date ?? null;
  if (stage === 't1') return row.t1_actual_date ?? null;
  if (stage === 't2') return row.t2_actual_date ?? null;
  if (stage === 'r1') return row.r1_actual_submission_date ?? null;
  return row.r2_actual_approval_date ?? null;
}

export function isStageDone(row: StageMetricRow, stage: StageKey): boolean {
  if (stage === 'r1') return reportIsR1Done(row.r1_status ?? null);
  if (stage === 'r2') return reportIsR2Done(row.r2_status ?? null);

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

export function getStageKeys(filter: 'all' | StageKey): StageKey[] {
  return filter === 'all' ? ['pred', 't1', 't2', 'r1', 'r2'] : [filter];
}