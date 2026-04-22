import type { TcStatus } from '@/types/enums';

export type StageKey = 'pred' | 't1' | 't2';

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

export function getStageStatus(row: StageMetricRow, stage: StageKey): TcStatus | null {
  if (stage === 'pred') return row.pred_status ?? null;
  if (stage === 't1') return row.t1_status ?? null;
  return row.t2_status ?? null;
}

export function getStagePlannedDate(row: StageMetricRow, stage: StageKey): string | null {
  if (stage === 'pred') return row.pred_planned_date ?? null;
  if (stage === 't1') return row.t1_planned_date ?? null;
  return row.t2_planned_date ?? null;
}

export function getStageActualDate(row: StageMetricRow, stage: StageKey): string | null {
  if (!isStageDone(row, stage)) return null;
  if (stage === 'pred') return row.pred_actual_date ?? null;
  if (stage === 't1') return row.t1_actual_date ?? null;
  return row.t2_actual_date ?? null;
}

export function isStageDone(row: StageMetricRow, stage: StageKey): boolean {
  const status = getStageStatus(row, stage);
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
  return filter === 'all' ? ['pred', 't1', 't2'] : [filter];
}