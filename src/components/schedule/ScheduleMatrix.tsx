import { useState, Fragment, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScheduleCell } from './ScheduleCell';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  asOfLabel: string;
  groupHeader: string;
  onCellClick?: (
    groupKey: string,
    bucketIso: string,
    stage: ScheduleStage | 'all',
    field: 'planned' | 'actual',
  ) => void;
  systemFilter?: {
    text: string;
    selected: string[];
    options: string[];
    onTextChange: (value: string) => void;
    onSelectedChange: (value: string[]) => void;
  };
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
  asOfLabel,
  groupHeader,
  onCellClick,
  systemFilter,
}: ScheduleMatrixProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const cellWidth = bucket === 'day' ? 64 : 96;

  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const leftBodyRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    const leftBody = leftBodyRef.current;
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
      if (leftBody) leftBody.scrollTop = body.scrollTop;
      requestAnimationFrame(() => { syncingRef.current = false; });
    };
    const onLeftWheel = (event: WheelEvent) => {
      event.preventDefault();
      body.scrollTop += event.deltaY;
      body.scrollLeft += event.deltaX;
      if (leftBody) leftBody.scrollTop = body.scrollTop;
      header.scrollLeft = body.scrollLeft;
    };

    header.addEventListener('scroll', onHeader);
    body.addEventListener('scroll', onBody);
    leftBody?.addEventListener('wheel', onLeftWheel, { passive: false });
    return () => {
      header.removeEventListener('scroll', onHeader);
      body.removeEventListener('scroll', onBody);
      leftBody?.removeEventListener('wheel', onLeftWheel);
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
    stageFilter === 'all' ? ['pred', 't1', 't2', 'r1', 'r2'] : [stageFilter as ScheduleStage];

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const timelineGridWidth = data.buckets.length * cellWidth;

  const colVirtualizer = useVirtualizer({
    count: data.buckets.length,
    getScrollElement: () => bodyScrollRef.current,
    estimateSize: () => cellWidth,
    horizontal: true,
    overscan: 4,
  });

  const virtualCols = colVirtualizer.getVirtualItems();
  const leftPad = virtualCols.length > 0 ? virtualCols[0].start : 0;
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
        <div className="flex border-b border-border text-[11px] font-semibold">
          <div className="z-40 flex shrink-0 flex-col bg-muted shadow-[2px_0_4px_-2px_hsl(var(--border))]" style={{ width: STICKY_LEFT_WIDTH }}>
            {/* Row 1: group headers */}
            <div className="flex border-b border-border">
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground" style={{ width: W_GROUP }}>
                <span>{groupHeader}</span>
                {systemFilter && <SystemHeaderFilter {...systemFilter} />}
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
                title={`Cumulative plan vs actual through ${asOfLabel}`}
              >
                Up to {asOfLabel}
              </div>
            </div>

            {/* Row 2: sticky sub-column labels */}
            <div className="flex">
              <div className="flex items-center px-3 py-2" style={{ width: W_GROUP }}></div>
              <div className="flex bg-muted">
                <HeaderNum width={W_NUM} title={`${stageLabel} total scope`}>Total</HeaderNum>
                <HeaderNum width={W_NUM} title={`${stageLabel} done count`}>Done</HeaderNum>
                <HeaderNum width={W_PCT} title={totalBlockTitle}>%</HeaderNum>
                <HeaderNum width={W_NUM} title="Total - Done">Remain</HeaderNum>
              </div>
              <div className="flex bg-secondary/40">
                <HeaderNum width={W_NUM} borderLeft title={`Plan up to ${asOfLabel}`}>Plan</HeaderNum>
                <HeaderNum width={W_NUM} title={`Actual up to ${asOfLabel}`}>Actual</HeaderNum>
                <HeaderNum width={W_PCT} title={`Actual / Plan up to ${asOfLabel}`}>%</HeaderNum>
                <HeaderNum width={W_NUM} borderRight title="Actual - Plan">Diff</HeaderNum>
              </div>
            </div>
          </div>

          <div
            ref={headerScrollRef}
            className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-gutter:stable]"
          >
            <div className="flex flex-col" style={{ width: timelineGridWidth, minWidth: timelineGridWidth }}>
              <div
                className="flex items-center justify-center border-b border-border py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                style={{ width: timelineGridWidth, minWidth: timelineGridWidth }}
              >
                Timeline
              </div>
              <div className="flex">
              <div
                  className="flex"
                  style={{ width: timelineGridWidth, minWidth: timelineGridWidth }}
                >
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
        </div>
      </div>

      {/* Body */}
      <div className="flex">
        <div
          ref={leftBodyRef}
          className="max-h-[calc(100vh-300px)] shrink-0 overflow-hidden bg-card shadow-[2px_0_4px_-2px_hsl(var(--border))]"
          style={{ width: STICKY_LEFT_WIDTH }}
        >
          {data.rows.map(row => {
            const showStageRows = stageFilter === 'all';
            return (
              <Fragment key={`left-${row.key}`}>
                <div className={cn("flex border-b border-border text-xs h-14", showStageRows ? 'bg-muted/30 font-semibold' : 'hover:bg-accent/30')}>
                  <div className="flex items-center gap-1 px-2 text-left cursor-default" style={{ width: W_GROUP }}>
                    <span className="truncate font-medium" title={row.label}>{row.label}</span>
                  </div>
                  <div className="flex bg-muted/40">
                    <TotalDoneCells total={row.total} done={row.doneCount} bold py="py-0" />
                  </div>
                  <div className="flex bg-secondary/20">
                    <PlanActualCells plan={row.cumPlan} actual={row.cumActual} asOfLabel={asOfLabel} bold py="py-0" />
                  </div>
                </div>

                {showStageRows && stagesToShow.map(st => {
                  const sr = row.stages[st];
                  return (
                    <div key={`left-${row.key}-${st}`} className="flex border-b border-border bg-muted/20 text-[11px] h-14 hover:bg-accent/20">
                      <div className="flex items-center gap-2 px-2 pl-8 text-muted-foreground" style={{ width: W_GROUP }}>
                        <span className={cn(
                          'inline-flex h-4 w-7 items-center justify-center rounded text-[9px] font-semibold',
                          st === 'pred' && 'bg-secondary text-secondary-foreground',
                          st === 't1' && 'bg-primary/15 text-primary',
                          st === 't2' && 'bg-primary/30 text-primary',
                          st === 'r1' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                          st === 'r2' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                        )}>
                          {STAGE_LABELS[st]}
                        </span>
                      </div>
                      <div className="flex bg-muted/40">
                        <TotalDoneCells total={sr.total} done={sr.totalDone} py="py-0" />
                      </div>
                      <div className="flex bg-secondary/20">
                        <PlanActualCells plan={sr.cumPlan} actual={sr.cumActual} asOfLabel={asOfLabel} py="py-0" />
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>

        <div
          ref={bodyScrollRef}
          className="max-h-[calc(100vh-300px)] min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable]"
        >
          <div style={{ width: timelineGridWidth, minWidth: timelineGridWidth }}>
            {data.rows.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No data in selected range.</div>
            )}
            {data.rows.map(row => {
              const showStageRows = stageFilter === 'all';
              return (
                <Fragment key={row.key}>
                  <div className={cn("flex border-b border-border text-xs h-14", showStageRows ? 'bg-muted/30 font-semibold' : 'hover:bg-accent/30')}>
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

                  {showStageRows && stagesToShow.map(st => {
                    const sr = row.stages[st];
                    return (
                      <div key={st} className="flex border-b border-border bg-muted/20 text-[11px] h-14 hover:bg-accent/20">
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

function SystemHeaderFilter({
  text, selected, options, onTextChange, onSelectedChange,
}: {
  text: string;
  selected: string[];
  options: string[];
  onTextChange: (value: string) => void;
  onSelectedChange: (value: string[]) => void;
}) {
  const isActive = text.trim().length > 0 || selected.length > 0;
  const toggle = (value: string) => {
    onSelectedChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };
  const clear = () => {
    onTextChange('');
    onSelectedChange([]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted/80',
            isActive ? 'text-primary' : 'text-muted-foreground/60',
          )}
          onClick={(e) => e.stopPropagation()}
          title="Filter System"
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <Input
          placeholder="Filter systems..."
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          className="mb-2 h-8 text-xs"
        />
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{selected.length ? `${selected.length} selected` : 'All systems'}</span>
          <button type="button" className="hover:underline" onClick={clear}>Clear</button>
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
          {options.map(option => (
            <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
              <Checkbox
                checked={selected.includes(option)}
                onCheckedChange={() => toggle(option)}
                className="h-3.5 w-3.5"
              />
              <span className="min-w-0 truncate" title={option}>{option}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
  plan, actual, asOfLabel, bold, py,
}: {
  plan: number;
  actual: number;
  asOfLabel: string;
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
      <NumCell width={W_NUM} py={py} borderLeft title={`Plan up to ${asOfLabel}`}>{plan}</NumCell>
      <NumCell
        width={W_NUM}
        py={py}
        title={`Actual up to ${asOfLabel}`}
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
