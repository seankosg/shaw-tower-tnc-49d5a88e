import { useState, Fragment, useMemo, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScheduleCell } from './ScheduleCell';
import {
  type AggregateResult,
  type ScheduleBucket,
  type ScheduleStageFilter,
  type ScheduleStage,
  STAGE_LABELS,
  formatBucketLabel,
} from '@/lib/schedule-utils';

interface ScheduleMatrixProps {
  data: AggregateResult;
  bucket: ScheduleBucket;
  stageFilter: ScheduleStageFilter;
  today: string;
  groupHeader: string;
  onCellClick?: (groupKey: string, bucketIso: string, stage: ScheduleStage | 'all') => void;
}

export function ScheduleMatrix({
  data,
  bucket,
  stageFilter,
  today,
  groupHeader,
  onCellClick,
}: ScheduleMatrixProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const cellWidth = bucket === 'day' ? 64 : 96;

  // Sync horizontal scroll between sticky header scrollbar and body
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body) return;

    const onHeader = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      body.scrollLeft = header.scrollLeft;
      requestAnimationFrame(() => { syncingRef.current = false; });
    };
    const onBody = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      header.scrollLeft = body.scrollLeft;
      requestAnimationFrame(() => { syncingRef.current = false; });
    };

    header.addEventListener('scroll', onHeader);
    body.addEventListener('scroll', onBody);
    return () => {
      header.removeEventListener('scroll', onHeader);
      body.removeEventListener('scroll', onBody);
    };
  }, []);

  const todayBucketIdx = useMemo(() => {
    const todayBucket = bucket === 'day'
      ? today
      : data.buckets.find(b => b <= today && b > '') ?? '';
    let idx = -1;
    for (let i = 0; i < data.buckets.length; i++) {
      if (data.buckets[i] === todayBucket) { idx = i; break; }
      if (data.buckets[i] > today) break;
      idx = i;
    }
    return idx;
  }, [data.buckets, today, bucket]);

  const stagesToShow: ScheduleStage[] =
    stageFilter === 'all' ? ['pred', 't1', 't2'] : [stageFilter as ScheduleStage];

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Sticky left column total width (200 + 80 + 80 + 80 = 440)
  const stickyLeftWidth = 440;
  const totalGridWidth = stickyLeftWidth + data.buckets.length * cellWidth;

  return (
    <div className="rounded-md border border-border bg-card">
      {/* Sticky header section: contains both column titles AND a horizontal scrollbar */}
      <div className="sticky top-0 z-30 bg-muted">
        {/* Header row (titles + date cells). Scrolls horizontally in sync with body. */}
        <div
          ref={headerScrollRef}
          className="overflow-x-auto overflow-y-hidden border-b border-border text-[11px] font-semibold"
        >
          <div className="flex" style={{ width: totalGridWidth, minWidth: totalGridWidth }}>
            <div className="sticky left-0 z-40 flex bg-muted">
              <div className="flex w-[200px] items-center px-3 py-2">{groupHeader}</div>
              <div className="flex w-[80px] items-center justify-end border-l border-border px-2 py-2">Done/Total</div>
              <div className="flex w-[80px] items-center justify-end border-l border-border px-2 py-2">Cum Plan</div>
              <div className="flex w-[80px] items-center justify-end border-l border-r border-border px-2 py-2">Cum Actual</div>
            </div>
            {data.buckets.map((b, i) => {
              const lbl = formatBucketLabel(b, bucket);
              const isToday = i === todayBucketIdx;
              return (
                <div
                  key={b}
                  className={cn(
                    'flex flex-col items-center justify-center border-r border-border px-1 py-1.5 text-center',
                    isToday && 'border-l-2 border-l-primary bg-primary/10',
                  )}
                  style={{ width: cellWidth, minWidth: cellWidth }}
                >
                  <div className="leading-tight">{lbl.primary}</div>
                  <div className="text-[9px] font-normal text-muted-foreground leading-tight">{lbl.secondary}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Body: scrolls vertically with the page; horizontal scroll synced with header */}
      <div
        ref={bodyScrollRef}
        className="overflow-x-auto overflow-y-hidden max-h-[calc(100vh-300px)]"
        style={{ overflowY: 'auto' }}
      >
        <div style={{ width: totalGridWidth, minWidth: totalGridWidth }}>
          {data.rows.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No data in selected range.</div>
          )}
          {data.rows.map(row => {
            const isExp = expanded.has(row.key) && stageFilter === 'all';
            return (
              <Fragment key={row.key}>
                {/* Group summary row */}
                <div className="flex border-b border-border text-xs hover:bg-accent/30">
                  <div className="sticky left-0 z-10 flex bg-card">
                    <button
                      type="button"
                      onClick={() => stageFilter === 'all' && toggle(row.key)}
                      className={cn(
                        'flex w-[200px] items-center gap-1 px-2 py-2 text-left',
                        stageFilter === 'all' ? 'cursor-pointer hover:bg-accent/40' : 'cursor-default',
                      )}
                    >
                      {stageFilter === 'all' && (
                        isExp
                          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate font-medium" title={row.label}>{row.label}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">({row.total})</span>
                    </button>
                    <div className="flex w-[80px] items-center justify-end border-l border-border px-2 py-2 tabular-nums">
                      {row.doneCount}/{row.total}
                    </div>
                    <div className="flex w-[80px] items-center justify-end border-l border-border px-2 py-2 tabular-nums">
                      {row.cumPlan}
                    </div>
                    <div className={cn(
                      'flex w-[80px] items-center justify-end border-l border-r border-border px-2 py-2 tabular-nums font-semibold',
                      row.cumActual < row.cumPlan && 'text-schedule-short',
                      row.cumActual > row.cumPlan && 'text-schedule-over',
                    )}>
                      {row.cumActual}
                    </div>
                  </div>
                  {row.combined.map((c, i) => (
                    <ScheduleCell
                      key={c.bucket}
                      plan={c.plan}
                      actual={c.actual}
                      isFuture={i > todayBucketIdx}
                      isToday={i === todayBucketIdx}
                      width={cellWidth}
                      onClick={onCellClick ? () => onCellClick(row.key, c.bucket, stageFilter) : undefined}
                    />
                  ))}
                </div>

                {/* Stage sub-rows when expanded (only when stage=all) */}
                {isExp && stagesToShow.map(st => {
                  const sr = row.stages[st];
                  return (
                    <div key={st} className="flex border-b border-border bg-muted/20 text-[11px] hover:bg-accent/20">
                      <div className="sticky left-0 z-10 flex bg-muted/20">
                        <div className="flex w-[200px] items-center gap-2 px-2 py-1.5 pl-8 text-muted-foreground">
                          <span className={cn(
                            'inline-flex h-4 w-7 items-center justify-center rounded text-[9px] font-semibold',
                            st === 'pred' && 'bg-secondary text-secondary-foreground',
                            st === 't1' && 'bg-primary/15 text-primary',
                            st === 't2' && 'bg-primary/30 text-primary',
                          )}>
                            {STAGE_LABELS[st]}
                          </span>
                        </div>
                        <div className="flex w-[80px] items-center justify-end border-l border-border px-2 py-1.5 tabular-nums">
                          {sr.totalDone}/{sr.total}
                        </div>
                        <div className="flex w-[80px] items-center justify-end border-l border-border px-2 py-1.5 tabular-nums">
                          {sr.totalPlan}
                        </div>
                        <div className={cn(
                          'flex w-[80px] items-center justify-end border-l border-r border-border px-2 py-1.5 tabular-nums',
                          sr.totalActual < sr.totalPlan && 'text-schedule-short',
                          sr.totalActual > sr.totalPlan && 'text-schedule-over',
                        )}>
                          {sr.totalActual}
                        </div>
                      </div>
                      {sr.cells.map((c, i) => (
                        <ScheduleCell
                          key={c.bucket}
                          plan={c.plan}
                          actual={c.actual}
                          isFuture={i > todayBucketIdx}
                          isToday={i === todayBucketIdx}
                          width={cellWidth}
                          onClick={onCellClick ? () => onCellClick(row.key, c.bucket, st) : undefined}
                        />
                      ))}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
