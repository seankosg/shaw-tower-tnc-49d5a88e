import { type DefectItem, isClosedDefect } from '@/lib/defect-utils';
import { buildDefectBuckets, type DefectProgressBucket, type DefectProgressDateField } from '@/lib/defect-progress-utils';

function inRange(value: string | null | undefined, start: string, end: string) {
  return Boolean(value && value >= start && value <= end);
}

export function buildDefectTrendData(items: DefectItem[], opts: { start: string; end: string; bucket: DefectProgressBucket; dateField: DefectProgressDateField; cumulative: boolean }) {
  const buckets = buildDefectBuckets(opts.start, opts.end, opts.bucket);
  const actualField = opts.dateField === 'planned_completion_date' ? 'actual_completion_date' : 'actual_closure_date';
  let cumulativePlanned = 0;
  let cumulativeClosed = 0;
  return buckets.map((bucketStart, index) => {
    const bucketEnd = opts.bucket === 'week' && buckets[index + 1] ? new Date(new Date(`${buckets[index + 1]}T00:00:00`).getTime() - 86400000).toISOString().slice(0, 10) : bucketStart;
    const planned = items.filter((item) => inRange((item as any)[opts.dateField] as string | null, bucketStart, bucketEnd)).length;
    const closed = items.filter((item) => inRange((item as any)[actualField] as string | null, bucketStart, bucketEnd)).length;
    cumulativePlanned += planned;
    cumulativeClosed += closed;
    const plannedValue = opts.cumulative ? cumulativePlanned : planned;
    const closedValue = opts.cumulative ? cumulativeClosed : closed;
    return {
      date: bucketStart,
      planned: plannedValue,
      closed: closedValue,
      open: opts.cumulative ? Math.max(cumulativePlanned - cumulativeClosed, 0) : items.filter((item) => !isClosedDefect(item)).length,
    };
  });
}
