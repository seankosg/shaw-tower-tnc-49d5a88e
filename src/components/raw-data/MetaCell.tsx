import { MessageSquare, ListChecks, MessagesSquare, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type CommentSummary,
  type MetaFieldName,
  formatRelativeTime,
} from '@/lib/meta-fields';

interface MetaCellProps {
  field: MetaFieldName;
  summary: CommentSummary | undefined;
  onClick?: () => void;
}

/**
 * Renders the value cell for a virtual meta column (Instructions / Comments
 * / Replies / Last Activity). Empty values render as `—`. Clicking a non-empty
 * cell calls `onClick` (used by the grid to open the detail page Comments
 * section).
 */
export function MetaCell({ field, summary, onClick }: MetaCellProps) {
  if (field === '_meta_last_activity_at') {
    const text = formatRelativeTime(summary?.lastActivityAt ?? null);
    if (text === '—') return <span className="text-muted-foreground">—</span>;
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick?.(); }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        title={summary?.lastActivityAt ?? ''}
      >
        <Clock className="h-3 w-3" />
        {text}
      </button>
    );
  }

  let count = 0;
  let Icon = MessageSquare;
  let label = 'comment';
  if (field === '_meta_instruction_count') {
    count = summary?.instructionCount ?? 0;
    Icon = ListChecks;
    label = 'instruction';
  } else if (field === '_meta_comment_count') {
    count = summary?.commentCount ?? 0;
    Icon = MessageSquare;
    label = 'comment';
  } else if (field === '_meta_reply_count') {
    count = summary?.replyCount ?? 0;
    Icon = MessagesSquare;
    label = 'reply';
  }

  if (count === 0) return <span className="text-muted-foreground">—</span>;

  const hasUnread = !!summary?.hasUnread;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title={`${count} ${label}${count > 1 ? 's' : ''}${hasUnread ? ' · unread' : ''}`}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs leading-none hover:bg-muted',
        hasUnread ? 'text-amber-600 font-semibold bg-amber-500/10' : 'text-foreground/80',
      )}
    >
      {hasUnread && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />}
      <Icon className="h-3 w-3" />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
