import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TopHorizontalScrollbarProps {
  /** Ref to the actual horizontally-scrolling container (the table's scroll pane). */
  targetRef: React.RefObject<HTMLDivElement>;
  /** Total inner width of the scrollable content (e.g. sum of column widths). */
  width: number;
  /**
   * Width of the left frozen / sticky area of the underlying table. The mirror
   * scrollbar will visually start AFTER this offset so it never appears to
   * overlap the frozen columns.
   */
  frozenWidth?: number;
  className?: string;
}

/**
 * A thin horizontal scrollbar rendered above a scrollable container, kept in
 * sync with the container's scrollLeft in both directions.
 *
 * When `frozenWidth` is provided we render an inert spacer over the frozen
 * area and only the right side acts as a real scroll mirror, matching the
 * sticky-column layout in the body.
 */
export function TopHorizontalScrollbar({
  targetRef,
  width,
  frozenWidth = 0,
  className,
}: TopHorizontalScrollbarProps) {
  const selfRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  // Sync from the underlying scroll pane back up to the mirror.
  useEffect(() => {
    const target = targetRef.current;
    const self = selfRef.current;
    if (!target || !self) return;

    const onTargetScroll = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      self.scrollLeft = target.scrollLeft;
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    };

    target.addEventListener('scroll', onTargetScroll, { passive: true });
    self.scrollLeft = target.scrollLeft;
    return () => target.removeEventListener('scroll', onTargetScroll);
  }, [targetRef]);

  const handleSelfScroll = () => {
    const target = targetRef.current;
    const self = selfRef.current;
    if (!target || !self) return;
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    target.scrollLeft = self.scrollLeft;
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  const innerWidth = Math.max(width, 1);

  return (
    <div
      className={cn('flex h-[16px] shrink-0 border-b bg-muted/30', className)}
      aria-hidden
    >
      {frozenWidth > 0 && (
        <div
          style={{ width: frozenWidth, minWidth: frozenWidth }}
          className="border-r bg-background"
        />
      )}
      <div
        ref={selfRef}
        onScroll={handleSelfScroll}
        className="h-full flex-1 overflow-x-auto overflow-y-hidden"
      >
        {/* The inner spacer mirrors the FULL scroll width so scrollLeft stays
            1:1 with the body. The visible track just starts after frozenWidth. */}
        <div style={{ width: innerWidth, height: 1 }} />
      </div>
    </div>
  );
}
