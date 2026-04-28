/**
 * Virtual / "meta" field names rendered in Raw Data grids but not
 * stored on the underlying row. Counts come from RPCs against
 * `defect_comments` / `subtest_comments`.
 *
 * Field Config rows for these names are seeded with `source_origin = 'system'`
 * and the `_meta_` prefix marks them as virtual:
 *   - excluded from import column mapping
 *   - excluded from Excel export of raw payload
 *   - excluded from bulk / inline edit
 *   - "Required" toggle disabled in Field Config admin
 */

export const META_FIELD_NAMES = [
  '_meta_instruction_count',
  '_meta_comment_count',
  '_meta_reply_count',
  '_meta_last_activity_at',
] as const;

export type MetaFieldName = (typeof META_FIELD_NAMES)[number];

export const META_FIELD_LABELS: Record<MetaFieldName, string> = {
  _meta_instruction_count: 'Instructions',
  _meta_comment_count: 'Comments',
  _meta_reply_count: 'Replies',
  _meta_last_activity_at: 'Last Activity',
};

export const META_FIELD_SET: ReadonlySet<string> = new Set(META_FIELD_NAMES);

export function isMetaField(fieldName: string | null | undefined): boolean {
  return !!fieldName && fieldName.startsWith('_meta_');
}

/** Per-row enriched comment summary returned by the RPCs. */
export interface CommentSummary {
  count: number;
  hasUnread: boolean;
  instructionCount: number;
  commentCount: number;
  replyCount: number;
  lastActivityAt: string | null;
}

export const EMPTY_SUMMARY: CommentSummary = {
  count: 0,
  hasUnread: false,
  instructionCount: 0,
  commentCount: 0,
  replyCount: 0,
  lastActivityAt: null,
};

/** Format a relative time like "2h ago" / "3d ago" for the Last Activity column. */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}
