import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TopHorizontalScrollbarProps {
  /** Ref to the actual horizontally-scrolling container (the table's scroll pane). */
  targetRef: React.RefObject<HTMLDivElement>;
  /** Total inner width of the scrollable content (e.g. sum of column widths). */
  width: number;
  className?: string;
}

/**
 * A thin horizontal scrollbar rendered above a scrollable container, kept in
 * sync with the container's scrollLeft in both directions. Lets users scroll
 * horizontally without having to scroll the page down to find the native
 * scrollbar at the bottom of the table.
 */
export function TopHorizontalScrollbar({ targetRef, width, className }: TopHorizontalScrollbarProps) {
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
    // Initial sync (e.g. when restoring saved scroll position).
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

  return (
    <div
      ref={selfRef}
      onScroll={handleSelfScroll}
      className={cn(
        'overflow-x-auto overflow-y-hidden border-b bg-muted/30',
        // Keep height tight; native scrollbar will render inside.
        'h-[12px] shrink-0',
        className,
      )}
      aria-hidden
    >
      <div style={{ width: Math.max(width, 1), height: 1 }} />
    </div>
  );
}
