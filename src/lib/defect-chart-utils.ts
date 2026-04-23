import { type DefectItem, isClosedDefect } from '@/lib/defect-utils';
import { buildDefectBuckets, type DefectProgressBucket } from '@/lib/defect-progress-utils';

function inRange(value: string | null | undefined, start: string, end: string) {
  return Boolean(value && value >= start && value <= end);
}

export function buildDefectTrendData(items: DefectItem[], opts: { start: string; end: string; bucket: DefectProgressBucket; dateField: 'planned_date' | 'target_date'; cumulative: boolean }) {
  const buckets = buildDefectBuckets(opts.start, opts.end, opts.bucket);
  let cumulativePlanned = 0;
  let cumulativeClosed = 0;
  return buckets.map((bucketStart, index) => {
    const bucketEnd = opts.bucket === 'week' && buckets[index + 1] ? new Date(new Date(`${buckets[index + 1]}T00:00:00`).getTime() - 86400000).toISOString().slice(0, 10) : bucketStart;
    const planned = items.filter((item) => inRange(item[opts.dateField] ?? item.planned_date, bucketStart, bucketEnd)).length;
    const closed = items.filter((item) => inRange(item.closed_date, bucketStart, bucketEnd)).length;
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
