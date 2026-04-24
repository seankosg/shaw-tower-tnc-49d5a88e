import { type DefectItem, isClosedDefect, isOverdueDefect } from '@/lib/defect-utils';

export type DefectProgressGroupBy = 'team' | 'subcontractor_name' | 'subsub_name' | 'hdec_pic_name' | 'area_level' | 'main_trade' | 'sub_trade' | 'work_type';
export type DefectProgressBucket = 'day' | 'week';
export type DefectProgressDateField = 'planned_completion_date' | 'planned_closure_date';

export interface DefectProgressBucketCell { planned: number; closed: number; start: string; end: string; }
export interface DefectProgressRow {
  key: string;
  label: string;
  total: number;
  closed: number;
  open: number;
  overdue: number;
  progress: number;
  buckets: Record<string, DefectProgressBucketCell>;
}

const DAY = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const parse = (value: string) => new Date(`${value}T00:00:00`);

export function defaultDefectDateRange(items: DefectItem[]) {
  const dates = items.flatMap((item) => [item.planned_completion_date, item.planned_closure_date, item.actual_closure_date]).filter(Boolean) as string[];
  const today = iso(new Date());
  if (!dates.length) return { start: today, end: today };
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

function weekStart(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return copy;
}

function bucketKey(value: string, bucket: DefectProgressBucket) {
  const date = parse(value);
  if (bucket === 'day') return value;
  return iso(weekStart(date));
}

export function bucketEnd(start: string, bucket: DefectProgressBucket) {
  const date = parse(start);
  date.setDate(date.getDate() + (bucket === 'week' ? 6 : 0));
  return iso(date);
}

export function buildDefectBuckets(start: string, end: string, bucket: DefectProgressBucket) {
  const buckets: string[] = [];
  const current = bucket === 'week' ? weekStart(parse(start)) : parse(start);
  const last = parse(end);
  while (current <= last) {
    buckets.push(iso(current));
    current.setDate(current.getDate() + (bucket === 'week' ? 7 : 1));
  }
  return buckets;
}

export function formatDefectBucketLabel(key: string, bucket: DefectProgressBucket) {
  if (bucket === 'day') return key.slice(5);
  const start = parse(key);
  const yearStart = new Date(start.getFullYear(), 0, 1);
  const week = Math.ceil((((start.getTime() - yearStart.getTime()) / DAY) + yearStart.getDay() + 1) / 7);
  return `${start.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function aggregateDefectProgress(items: DefectItem[], opts: { groupBy: DefectProgressGroupBy; bucket: DefectProgressBucket; start: string; end: string; dateField?: DefectProgressDateField }) {
  const buckets = buildDefectBuckets(opts.start, opts.end, opts.bucket);
  const bucketSet = new Set(buckets);
  const rows = new Map<string, DefectProgressRow>();
  const planField: DefectProgressDateField = opts.dateField ?? 'planned_completion_date';
  const actualField = planField === 'planned_completion_date' ? 'actual_completion_date' : 'actual_closure_date';

  for (const item of items) {
    const rawKey = String((item as any)[opts.groupBy] ?? '').trim() || '—';
    const row = rows.get(rawKey) ?? { key: rawKey, label: rawKey, total: 0, closed: 0, open: 0, overdue: 0, progress: 0, buckets: {} };
    row.total += 1;
    if (isClosedDefect(item)) row.closed += 1;
    else row.open += 1;
    if (isOverdueDefect(item)) row.overdue += 1;

    const planned = (item as any)[planField] as string | null;
    if (planned) {
      const key = bucketKey(planned, opts.bucket);
      if (bucketSet.has(key)) row.buckets[key] = { planned: (row.buckets[key]?.planned ?? 0) + 1, closed: row.buckets[key]?.closed ?? 0, start: key, end: bucketEnd(key, opts.bucket) };
    }
    const actual = (item as any)[actualField] as string | null;
    if (actual) {
      const key = bucketKey(actual, opts.bucket);
      if (bucketSet.has(key)) row.buckets[key] = { planned: row.buckets[key]?.planned ?? 0, closed: (row.buckets[key]?.closed ?? 0) + 1, start: key, end: bucketEnd(key, opts.bucket) };
    }
    rows.set(rawKey, row);
  }

  const result = [...rows.values()].map((row) => ({ ...row, progress: row.total ? Math.round((row.closed / row.total) * 1000) / 10 : 0 }));
  result.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  return { buckets, rows: result };
}
