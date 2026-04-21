import { useState, Fragment, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  onCellClick?: (
    groupKey: string,
    bucketIso: string,
    stage: ScheduleStage | 'all',
    field: 'planned' | 'actual',
  ) => void;
}

// Sub-column widths
const W_GROUP = 200;
const W_NUM = 48;          // Total / Done / Remain / Plan / Actual / Diff
const W_PCT = 48;          // % columns
const W_TOTAL_BLOCK = W_NUM * 3 + W_PCT;   // Total | Done | % | Remain  = 192
const W_PLAN_BLOCK = W_NUM * 3 + W_PCT;    // Plan  | Actual | % | Diff  = 192
const STICKY_LEFT_WIDTH = W_GROUP + W_TOTAL_BLOCK + W_PLAN_BLOCK; // 584

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
    let idx = -1;
    for (let i = 0; i < data.buckets.length; i++) {
      if (data.buckets[i] === today) { idx = i; break; }
      if (data.buckets[i] > today) break;
      idx = i;
    }
    return idx;
  }, [data.buckets, today]);

  const didAutoScrollRef = useRef<string>('');
  useEffect(() => {
    const body = bodyScrollRef.current;
    const header = headerScrollRef.current;
    if (!body || todayBucketIdx < 0) return;
    const scrollKey = `${data.buckets.length}|${cellWidth}|${todayBucketIdx}`;
    if (didAutoScrollRef.current === scrollKey) return;
    didAutoScrollRef.current = scrollKey;

    const offsetCells = 2;
    const target = Math.max(0, (todayBucketIdx - offsetCells) * cellWidth);
    syncingRef.current = true;
    body.scrollLeft = target;
    if (header) header.scrollLeft = target;
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, [todayBucketIdx, data.buckets.length, cellWidth]);


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

  const totalGridWidth = STICKY_LEFT_WIDTH + data.buckets.length * cellWidth;

  const colVirtualizer = useVirtualizer({
    count: data.buckets.length,
    getScrollElement: () => bodyScrollRef.current,
    estimateSize: () => cellWidth,
    horizontal: true,
    overscan: 4,
    paddingStart: STICKY_LEFT_WIDTH,
  });

  const virtualCols = colVirtualizer.getVirtualItems();
  const leftPad = virtualCols.length > 0 ? virtualCols[0].start - STICKY_LEFT_WIDTH : 0;
  const rightPad =
    virtualCols.length > 0
      ? colVirtualizer.getTotalSize() - virtualCols[virtualCols.length - 1].end
      : 0;

  const stageLabel = stageFilter === 'all' ? 'All' : stageFilter.toUpperCase();
  const totalBlockTitle = stageFilter === 'all'
    ? 'Pred + T1 + T2 progress / (subtests × 3)'
    : `${stageLabel} progress / subtests`;

  return (
    <div className="rounded-md border border-border bg-card">
      {/* Sticky header section */}
      <div className="sticky top-0 z-30 bg-muted">
        <div
          ref={headerScrollRef}
          className="overflow-x-auto overflow-y-hidden border-b border-border text-[11px] font-semibold"
        >
          <div className="flex flex-col" style={{ width: totalGridWidth, minWidth: totalGridWidth }}>
            {/* Row 1: group headers */}
            <div className="flex border-b border-border">
              <div className="sticky left-0 z-40 flex bg-muted">
                <div className="flex items-center px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground" style={{ width: W_GROUP }}>
                  {groupHeader}
                </div>
                <div
                  className="flex items-center justify-center py-1.5 text-[10px] uppercase tracking-wide bg-muted text-foreground border-l border-border"
                  style={{ width: W_TOTAL_BLOCK, minWidth: W_TOTAL_BLOCK }}
                  title="Overall scope across full timeline"
                >
                  Total Scope
                </div>
                <div
                  className="flex items-center justify-center py-1.5 text-[10px] uppercase tracking-wide bg-secondary/40 text-foreground border-l-2 border-border border-r border-border"
                  style={{ width: W_PLAN_BLOCK, minWidth: W_PLAN_BLOCK }}
                  title="Cumulative plan vs actual through today"
                >
                  Up to Today
                </div>
              </div>
              <div
                className="flex items-center justify-center py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                style={{ width: data.buckets.length * cellWidth, minWidth: data.buckets.length * cellWidth }}
              >
                Timeline
              </div>
            </div>

            {/* Row 2: sub-column labels + bucket labels */}
            <div className="flex">
              <div className="sticky left-0 z-40 flex bg-muted">
                <div className="flex items-center px-3 py-2" style={{ width: W_GROUP }}></div>

                {/* Total Scope block */}
                <div className="flex bg-muted">
                  <HeaderNum width={W_NUM} title={`${stageLabel} total scope`}>Total</HeaderNum>
                  <HeaderNum width={W_NUM} title={`${stageLabel} done count`}>Done</HeaderNum>
                  <HeaderNum width={W_PCT} title={totalBlockTitle}>%</HeaderNum>
                  <HeaderNum width={W_NUM} title="Total - Done">Remain</HeaderNum>
                </div>

                {/* Up to Today block */}
                <div className="flex bg-secondary/40">
                  <HeaderNum width={W_NUM} borderLeft title="Plan up to today">Plan</HeaderNum>
                  <HeaderNum width={W_NUM} title="Actual up to today">Actual</HeaderNum>
                  <HeaderNum width={W_PCT} title="Actual / Plan up to today">%</HeaderNum>
                  <HeaderNum width={W_NUM} borderRight title="Actual - Plan">Diff</HeaderNum>
                </div>
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
      </div>

      {/* Body */}
      <div
        ref={bodyScrollRef}
        className="overflow-y-auto overflow-x-hidden max-h-[calc(100vh-300px)]"
      >
        <div style={{ width: totalGridWidth, minWidth: totalGridWidth }}>
          {data.rows.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No data in selected range.</div>
          )}
          {data.rows.map(row => {
            const showStageRows = stageFilter === 'all';
            return (
              <Fragment key={row.key}>
                {/* Group summary row */}
                <div className={cn("flex border-b border-border text-xs h-10", showStageRows ? 'bg-muted/30 font-semibold' : 'hover:bg-accent/30')}>
                  <div className="sticky left-0 z-20 flex bg-card shadow-[2px_0_4px_-2px_hsl(var(--border))]">
                    <div
                      className="flex items-center gap-1 px-2 text-left cursor-default"
                      style={{ width: W_GROUP }}
                    >
                      <span className="truncate font-medium" title={row.label}>{row.label}</span>
                    </div>

                    <div className="flex bg-muted/40">
                      <TotalDoneCells
                        total={row.total}
                        done={row.doneCount}
                        bold
                        py="py-0"
                      />
                    </div>
                    <div className="flex bg-secondary/20">
                      <PlanActualCells
                        plan={row.cumPlan}
                        actual={row.cumActual}
                        bold
                        py="py-0"
                      />
                    </div>
                  </div>
                  {leftPad > 0 && <div style={{ width: leftPad, minWidth: leftPad }} />}
                  {virtualCols.map(vc => {
                    const c = row.combined[vc.index];
                    if (!c) return null;
                    return (
                      <ScheduleCell
                        key={c.bucket}
                        plan={c.plan}
                        actual={c.actual}
                        isFuture={vc.index > todayBucketIdx}
                        isToday={vc.index === todayBucketIdx}
                        width={cellWidth}
                        onPlanClick={onCellClick ? () => onCellClick(row.key, c.bucket, stageFilter, 'planned') : undefined}
                        onActualClick={onCellClick ? () => onCellClick(row.key, c.bucket, stageFilter, 'actual') : undefined}
                      />
                    );
                  })}
                  {rightPad > 0 && <div style={{ width: rightPad, minWidth: rightPad }} />}
                </div>

                {/* Stage sub-rows when expanded */}
                {showStageRows && stagesToShow.map(st => {
                  const sr = row.stages[st];
                  return (
                    <div key={st} className="flex border-b border-border bg-muted/20 text-[11px] h-10 hover:bg-accent/20">
                      <div className="sticky left-0 z-20 flex bg-card shadow-[2px_0_4px_-2px_hsl(var(--border))]">
                        <div
                          className="flex items-center gap-2 px-2 pl-8 text-muted-foreground"
                          style={{ width: W_GROUP }}
                        >
                          <span className={cn(
                            'inline-flex h-4 w-7 items-center justify-center rounded text-[9px] font-semibold',
                            st === 'pred' && 'bg-secondary text-secondary-foreground',
                            st === 't1' && 'bg-primary/15 text-primary',
                            st === 't2' && 'bg-primary/30 text-primary',
                          )}>
                            {STAGE_LABELS[st]}
                          </span>
                        </div>
                        <div className="flex bg-muted/40">
                          <TotalDoneCells
                            total={sr.total}
                            done={sr.totalDone}
                            py="py-0"
                          />
                        </div>
                        <div className="flex bg-secondary/20">
                          <PlanActualCells
                            plan={sr.cumPlan}
                            actual={sr.cumActual}
                            py="py-0"
                          />
                        </div>
                      </div>
                      {leftPad > 0 && <div style={{ width: leftPad, minWidth: leftPad }} />}
                      {virtualCols.map(vc => {
                        const c = sr.cells[vc.index];
                        if (!c) return null;
                        return (
                          <ScheduleCell
                            key={c.bucket}
                            plan={c.plan}
                            actual={c.actual}
                            isFuture={vc.index > todayBucketIdx}
                            isToday={vc.index === todayBucketIdx}
                            width={cellWidth}
                            onPlanClick={onCellClick ? () => onCellClick(row.key, c.bucket, st, 'planned') : undefined}
                            onActualClick={onCellClick ? () => onCellClick(row.key, c.bucket, st, 'actual') : undefined}
                          />
                        );
                      })}
                      {rightPad > 0 && <div style={{ width: rightPad, minWidth: rightPad }} />}
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

function HeaderNum({
  width, children, title, borderLeft, borderRight,
}: {
  width: number;
  children: React.ReactNode;
  title?: string;
  borderLeft?: boolean;
  borderRight?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-end px-1.5 py-2 border-l border-border',
        borderLeft && 'border-l-2',
        borderRight && 'border-r border-border',
      )}
      style={{ width, minWidth: width }}
      title={title}
    >
      {children}
    </div>
  );
}

function NumCell({
  width, children, className, py = 'py-2', borderLeft, borderRight, title,
}: {
  width: number;
  children: React.ReactNode;
  className?: string;
  py?: string;
  borderLeft?: boolean;
  borderRight?: boolean;
  title?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-end px-1.5 tabular-nums border-l border-border',
        borderLeft && 'border-l-2',
        borderRight && 'border-r border-border',
        py,
        className,
      )}
      style={{ width, minWidth: width }}
      title={title}
    >
      {children}
    </div>
  );
}

function TotalDoneCells({
  total, done, bold, py,
}: {
  total: number;
  done: number;
  bold?: boolean;
  py: string;
}) {
  const pct = total > 0 ? (done / total) * 100 : null;
  const remain = total - done;
  return (
    <>
      <NumCell width={W_NUM} py={py}>{total}</NumCell>
      <NumCell width={W_NUM} py={py} className={bold ? 'font-semibold' : ''}>{done}</NumCell>
      <NumCell width={W_PCT} py={py} className="text-muted-foreground text-[10px]">
        {pct === null ? '—' : `${pct.toFixed(0)}%`}
      </NumCell>
      <NumCell
        width={W_NUM}
        py={py}
        className={cn(remain > 0 ? 'text-schedule-short' : 'text-muted-foreground')}
      >
        {remain}
      </NumCell>
    </>
  );
}

function PlanActualCells({
  plan, actual, bold, py,
}: {
  plan: number;
  actual: number;
  bold?: boolean;
  py: string;
}) {
  const pct = plan > 0 ? (actual / plan) * 100 : null;
  const diff = actual - plan;
  const accent =
    pct === null ? '' : pct < 100 ? 'text-schedule-short' : pct > 100 ? 'text-schedule-over' : '';
  const diffAccent =
    diff < 0 ? 'text-schedule-short' : diff > 0 ? 'text-schedule-over' : 'text-muted-foreground';
  return (
    <>
      <NumCell width={W_NUM} py={py} borderLeft title="Plan up to today">{plan}</NumCell>
      <NumCell
        width={W_NUM}
        py={py}
        title="Actual up to today"
        className={cn(bold && 'font-semibold', accent)}
      >
        {actual}
      </NumCell>
      <NumCell width={W_PCT} py={py} className={cn('text-[10px]', accent)} title="Actual / Plan">
        {pct === null ? '—' : `${pct.toFixed(0)}%`}
      </NumCell>
      <NumCell
        width={W_NUM}
        py={py}
        borderRight
        title="Actual - Plan"
        className={cn('text-[11px] font-semibold', diffAccent)}
      >
        {diff > 0 ? `+${diff}` : diff}
      </NumCell>
    </>
  );
}
