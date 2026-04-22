type Stage = 'pred' | 't1' | 't2';

type PlannedDates = {
  pred_planned_date: string | null;
  t1_planned_date: string | null;
  t2_planned_date: string | null;
};

type StageImpact = {
  old_date: string | null;
  new_date: string | null;
  diff_days: number | null;
  prev_gap_days: number | null;
  cur_gap_days: number | null;
};

export type ScheduleChangeImpact = Partial<Record<Stage, StageImpact>>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toUtcTime = (date: string | null | undefined): number | null => {
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

export const diffDays = (fromDate: string | null | undefined, toDate: string | null | undefined): number | null => {
  const from = toUtcTime(fromDate);
  const to = toUtcTime(toDate);
  if (from == null || to == null) return null;
  return Math.round((to - from) / MS_PER_DAY);
};

export const buildScheduleChangeImpact = (
  existing: PlannedDates,
  updates: Partial<PlannedDates>,
): ScheduleChangeImpact => {
  const impact: ScheduleChangeImpact = {};
  const finalDates: PlannedDates = {
    pred_planned_date: updates.pred_planned_date !== undefined ? updates.pred_planned_date ?? null : existing.pred_planned_date,
    t1_planned_date: updates.t1_planned_date !== undefined ? updates.t1_planned_date ?? null : existing.t1_planned_date,
    t2_planned_date: updates.t2_planned_date !== undefined ? updates.t2_planned_date ?? null : existing.t2_planned_date,
  };

  const addImpact = (stage: Stage, field: keyof PlannedDates, successorField: keyof PlannedDates | null) => {
    if (updates[field] === undefined) return;
    const oldDate = existing[field] ?? null;
    const newDate = updates[field] ?? null;
    if (oldDate === newDate) return;
    impact[stage] = {
      old_date: oldDate,
      new_date: newDate,
      diff_days: diffDays(oldDate, newDate),
      prev_gap_days: successorField ? diffDays(oldDate, existing[successorField]) : null,
      cur_gap_days: successorField ? diffDays(newDate, finalDates[successorField]) : null,
    };
  };

  addImpact('pred', 'pred_planned_date', 't1_planned_date');
  addImpact('t1', 't1_planned_date', 't2_planned_date');
  addImpact('t2', 't2_planned_date', null);

  return impact;
};

export const hasScheduleChangeImpact = (impact: ScheduleChangeImpact): boolean =>
  Boolean(impact.pred || impact.t1 || impact.t2);