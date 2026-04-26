// Shared helpers for grouping comments into parent + reply threads.

export interface ThreadableComment {
  id: string;
  parent_comment_id: string | null;
  created_at: string;
  type: string;
}

export interface CommentThread<T extends ThreadableComment> {
  parent: T;
  /** Replies sorted oldest -> newest */
  replies: T[];
  /** Most recent activity in this thread (parent or any reply). */
  lastActivityAt: string;
  /** True when the parent was not part of the original fetch (parent fetched as supplement, or missing entirely). */
  parentSupplemented: boolean;
  /** True when no parent record exists at all (orphan reply). */
  parentMissing: boolean;
}

export interface BuildThreadsOptions<T extends ThreadableComment> {
  /** Comments fetched in the current window. */
  comments: T[];
  /** Parents fetched separately when their replies were in-window but the parent was not. */
  supplementalParents?: T[];
}

export function buildCommentThreads<T extends ThreadableComment>(
  opts: BuildThreadsOptions<T>,
): CommentThread<T>[] {
  const { comments, supplementalParents = [] } = opts;

  // Index every comment we know about.
  const byId = new Map<string, T>();
  for (const c of comments) byId.set(c.id, c);
  for (const p of supplementalParents) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }

  // Group replies by parent id (only direct child links matter for our flat thread view).
  const repliesByParent = new Map<string, T[]>();
  const orphanReplies: T[] = [];

  for (const c of comments) {
    if (!c.parent_comment_id) continue;
    const parent = byId.get(c.parent_comment_id);
    if (parent) {
      const list = repliesByParent.get(parent.id) ?? [];
      list.push(c);
      repliesByParent.set(parent.id, list);
    } else {
      orphanReplies.push(c);
    }
  }

  // Top-level parents: anything in `comments` (or supplemented) that has no parent_comment_id
  // AND has been fetched as a "real" top-level comment, OR is referenced by a child.
  const parentIds = new Set<string>();
  for (const c of comments) {
    if (!c.parent_comment_id) parentIds.add(c.id);
  }
  for (const id of repliesByParent.keys()) parentIds.add(id);

  const threads: CommentThread<T>[] = [];
  const fetchedIds = new Set(comments.map((c) => c.id));

  for (const pid of parentIds) {
    const parent = byId.get(pid);
    if (!parent) continue;
    const replies = (repliesByParent.get(pid) ?? []).slice().sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const lastActivityAt = replies.length > 0
      ? replies[replies.length - 1].created_at
      : parent.created_at;
    threads.push({
      parent,
      replies,
      lastActivityAt,
      parentSupplemented: !fetchedIds.has(parent.id),
      parentMissing: false,
    });
  }

  // Orphan replies (parent could not be located even with supplements) — show as standalone "thread".
  for (const r of orphanReplies) {
    threads.push({
      parent: r,
      replies: [],
      lastActivityAt: r.created_at,
      parentSupplemented: false,
      parentMissing: true,
    });
  }

  threads.sort(
    (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
  );

  return threads;
}

/**
 * Collect parent_comment_id values referenced by replies in `comments`
 * but whose parent record is NOT present in `comments`. Use the result
 * to fetch the missing parents in a single follow-up query.
 */
export function getMissingParentIds<T extends ThreadableComment>(comments: T[]): string[] {
  const ids = new Set(comments.map((c) => c.id));
  const missing = new Set<string>();
  for (const c of comments) {
    if (c.parent_comment_id && !ids.has(c.parent_comment_id)) {
      missing.add(c.parent_comment_id);
    }
  }
  return Array.from(missing);
}
