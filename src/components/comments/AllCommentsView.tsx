import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  buildCommentThreads,
  getMissingParentIds,
  type CommentThread,
} from '@/lib/comment-threads';
import { ChevronDown, Lock, MessageSquare } from 'lucide-react';
import { RecipientBadges } from '@/components/comments/RecipientSelector';

export type DayWindow = 7 | 30 | 90 | 365 | 'all';
export type TypeFilter = 'all' | 'comment' | 'instruction' | 'reply';
export type ViewMode = 'thread' | 'flat';

export interface AllCommentsRow {
  id: string;
  type: 'comment' | 'instruction' | 'reply';
  message: string;
  created_at: string;
  author_user_id: string;
  edited: boolean;
  parent_comment_id: string | null;
  recipients?: string[] | null;
  // Either subtest_id+subtests or defect_id+defect_items will be present.
  subtest_id?: string;
  defect_id?: string;
  subtests?: { id: string; item_no: string | null; mos_code: string | null; subcontractor_name: string | null } | null;
  defect_items?: { id: string; issue_no: string | null; description: string | null; subcontractor_name: string | null } | null;
}

interface AuthorInfo {
  user_id: string;
  name: string | null;
  login_id: string | null;
}

export interface AllCommentsViewProps {
  title: string;
  /** 'subtest' or 'defect' */
  kind: 'subtest' | 'defect';
}

const PAGE_SIZE = 50;

export function AllCommentsView({ title, kind }: AllCommentsViewProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [days, setDays] = useState<DayWindow>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('thread');
  const [authorQuery, setAuthorQuery] = useState('');
  const [bodyQuery, setBodyQuery] = useState('');

  const [comments, setComments] = useState<AllCommentsRow[]>([]);
  const [supplementalParents, setSupplementalParents] = useState<AllCommentsRow[]>([]);
  const [authors, setAuthors] = useState<AuthorInfo[]>([]);
  const [reads, setReads] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [pageOffset, setPageOffset] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const sinceIso = useMemo(() => {
    if (days === 'all') return null;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }, [days]);

  const tableName = kind === 'subtest' ? 'subtest_comments' : 'defect_comments';
  const parentTable = kind === 'subtest' ? 'subtests' : 'defect_items';
  const parentIdField = kind === 'subtest' ? 'subtest_id' : 'defect_id';
  const readsTable = kind === 'subtest' ? 'subtest_comment_reads' : 'defect_comment_reads';

  const baseSelect = kind === 'subtest'
    ? 'id, subtest_id, type, message, created_at, author_user_id, edited, parent_comment_id, recipients, subtests(id, item_no, mos_code, subcontractor_name)'
    : 'id, defect_id, type, message, created_at, author_user_id, edited, parent_comment_id, recipients, defect_items(id, issue_no, description, subcontractor_name)';

  const reload = async (resetOffset: boolean) => {
    if (!user) return;
    setLoading(true);
    const offset = resetOffset ? 0 : pageOffset;
    let q: any = (supabase as any).from(tableName).select(baseSelect);
    if (sinceIso) q = q.gte('created_at', sinceIso);
    q = q.order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);

    const { data, error } = await q;
    if (error || !data) {
      if (resetOffset) {
        setComments([]);
        setSupplementalParents([]);
        setAuthors([]);
      }
      setHasMore(false);
      setLoading(false);
      return;
    }
    const rows = data as AllCommentsRow[];
    const merged = resetOffset ? rows : [...comments, ...rows];
    setComments(merged);
    setHasMore(rows.length === PAGE_SIZE);
    setPageOffset(offset + rows.length);

    const missingParentIds = getMissingParentIds(merged);
    if (missingParentIds.length > 0) {
      const { data: pData } = await (supabase as any)
        .from(tableName)
        .select(baseSelect)
        .in('id', missingParentIds);
      setSupplementalParents((pData as AllCommentsRow[]) ?? []);
    } else {
      setSupplementalParents([]);
    }

    const authorIds = Array.from(new Set(merged.map((r) => r.author_user_id)));
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, name, login_id')
        .in('user_id', authorIds);
      setAuthors((profs as AuthorInfo[]) ?? []);
    }

    const parentIds = Array.from(
      new Set(merged.map((r) => (r as any)[parentIdField]).filter(Boolean)),
    );
    if (parentIds.length > 0) {
      const { data: r } = await (supabase as any)
        .from(readsTable)
        .select(`${parentIdField}, last_read_at`)
        .eq('user_id', user.id)
        .in(parentIdField, parentIds);
      const map: Record<string, string> = {};
      for (const row of (r as any[]) ?? []) map[row[parentIdField]] = row.last_read_at;
      setReads(map);
    } else {
      setReads({});
    }
    setLoading(false);
  };

  // Reload from scratch when filters change
  useEffect(() => {
    setPageOffset(0);
    reload(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sinceIso]);

  const authorName = (id: string) => {
    const a = authors.find((x) => x.user_id === id);
    return a?.name || a?.login_id || 'Unknown';
  };

  const isUnread = (c: AllCommentsRow) => {
    const pid = (c as any)[parentIdField] as string | undefined;
    if (!pid) return false;
    const last = reads[pid];
    return !last || new Date(c.created_at) > new Date(last);
  };

  const matchAuthor = (id: string) => {
    if (!authorQuery.trim()) return true;
    const a = authors.find((x) => x.user_id === id);
    const haystack = `${a?.name ?? ''} ${a?.login_id ?? ''}`.toLowerCase();
    return haystack.includes(authorQuery.toLowerCase());
  };

  const matchBody = (m: string) => {
    if (!bodyQuery.trim()) return true;
    return m.toLowerCase().includes(bodyQuery.toLowerCase());
  };

  const matchType = (c: AllCommentsRow) => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'reply') return !!c.parent_comment_id;
    return c.type === typeFilter;
  };

  // Per-comment filter for the flat view; for threaded view we keep parent if any
  // member (parent or replies) passes the filter so context is preserved.
  const flatFiltered = useMemo(() => {
    return comments.filter(
      (c) => matchType(c) && matchAuthor(c.author_user_id) && matchBody(c.message) && (!unreadOnly || isUnread(c)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, typeFilter, authorQuery, bodyQuery, unreadOnly, reads, authors]);

  const threads = useMemo(
    () => buildCommentThreads({ comments, supplementalParents }),
    [comments, supplementalParents],
  );

  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      const matchAny = (c: AllCommentsRow) =>
        matchType(c) && matchAuthor(c.author_user_id) && matchBody(c.message) && (!unreadOnly || isUnread(c));
      return matchAny(t.parent) || t.replies.some(matchAny);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, typeFilter, authorQuery, bodyQuery, unreadOnly, reads, authors]);

  const handleNavigate = (c: AllCommentsRow) => {
    if (kind === 'subtest') {
      const id = c.subtests?.id ?? c.subtest_id;
      if (id) navigate(`/subtests/${id}`);
    } else {
      const id = c.defect_items?.id ?? c.defect_id;
      if (id) navigate(`/defects/${id}`);
    }
  };

  const renderContext = (c: AllCommentsRow): ReactNode => {
    if (kind === 'subtest') {
      const s = c.subtests;
      if (!s) return '—';
      return (
        <>
          {s.item_no ?? '—'}
          {s.mos_code ? ` · ${s.mos_code}` : ''}
          {s.subcontractor_name ? ` · ${s.subcontractor_name}` : ''}
        </>
      );
    }
    const d = c.defect_items;
    if (!d) return '—';
    return (
      <>
        {d.issue_no ?? '—'}
        {d.description ? ` · ${d.description}` : ''}
        {d.subcontractor_name ? ` · ${d.subcontractor_name}` : ''}
      </>
    );
  };

  const hasParentRecord = (c: AllCommentsRow) =>
    kind === 'subtest' ? !!c.subtests : !!c.defect_items;

  const renderRow = (c: AllCommentsRow, opts?: { compact?: boolean }) => {
    const noAccess = !hasParentRecord(c);
    const unread = isUnread(c);
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => !noAccess && handleNavigate(c)}
        disabled={noAccess}
        className={cn(
          'group block w-full rounded-md border px-3 py-2 text-left transition-colors',
          unread && 'border-primary/40 bg-primary/5',
          noAccess && 'cursor-default bg-muted/40',
          !noAccess && 'hover:bg-muted/50',
          opts?.compact && 'border-0 bg-transparent px-0 py-1',
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium">{authorName(c.author_user_id)}</span>
          {c.type === 'instruction' && (
            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">Instruction</Badge>
          )}
          {c.parent_comment_id && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Reply</Badge>
          )}
          {unread && <Badge className="h-4 px-1.5 text-[10px]">New</Badge>}
          {noAccess && (
            <Badge variant="secondary" className="h-4 gap-1 px-1.5 text-[10px]">
              <Lock className="h-2.5 w-2.5" /> No access
            </Badge>
          )}
          <span className="ml-auto text-muted-foreground">
            {format(new Date(c.created_at), 'yyyy-MM-dd HH:mm')}
          </span>
        </div>
        <p className="mt-1 text-sm whitespace-pre-wrap">{c.message}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>{renderContext(c)}</span>
          <RecipientBadges recipients={c.recipients} />
        </div>
      </button>
    );
  };

  const renderThread = (t: CommentThread<AllCommentsRow>) => {
    const noAccess = !hasParentRecord(t.parent) && !t.parentMissing;
    const parentUnread = isUnread(t.parent);
    const threadUnread = parentUnread || t.replies.some(isUnread);
    const isExpanded = expanded[t.parent.id] ?? t.replies.length <= 3;
    const visibleReplies = isExpanded ? t.replies : t.replies.slice(0, 2);
    const hiddenReplyCount = t.replies.length - visibleReplies.length;

    return (
      <li key={t.parent.id}>
        <div
          className={cn(
            'rounded-md border px-3 py-2',
            threadUnread && 'border-primary/40 bg-primary/5',
            (noAccess || t.parentMissing) && 'bg-muted/40',
          )}
        >
          <button
            type="button"
            onClick={() => !noAccess && !t.parentMissing && handleNavigate(t.parent)}
            disabled={noAccess || t.parentMissing}
            className={cn(
              'group block w-full text-left',
              !(noAccess || t.parentMissing) && 'hover:bg-muted/40 rounded',
              (noAccess || t.parentMissing) && 'cursor-default',
            )}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{authorName(t.parent.author_user_id)}</span>
              {t.parent.type === 'instruction' && (
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">Instruction</Badge>
              )}
              {t.parentSupplemented && !t.parentMissing && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">Older</Badge>
              )}
              {t.parentMissing && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">Reply (parent unavailable)</Badge>
              )}
              {parentUnread && <Badge className="h-4 px-1.5 text-[10px]">New</Badge>}
              {noAccess && (
                <Badge variant="secondary" className="h-4 gap-1 px-1.5 text-[10px]">
                  <Lock className="h-2.5 w-2.5" /> No access
                </Badge>
              )}
              <span className="ml-auto text-muted-foreground">
                {format(new Date(t.parent.created_at), 'yyyy-MM-dd HH:mm')}
              </span>
            </div>
            <p className="mt-1 text-sm whitespace-pre-wrap">{t.parent.message}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>{renderContext(t.parent)}</span>
              <RecipientBadges recipients={t.parent.recipients} />
            </div>
          </button>

          {t.replies.length > 0 && (
            <div className="mt-2 space-y-1.5 border-l-2 border-muted pl-3">
              {visibleReplies.map((r) => {
                const rUnread = isUnread(r);
                return (
                  <div key={r.id} className={cn('rounded px-2 py-1.5 text-xs', rUnread && 'bg-primary/5')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{authorName(r.author_user_id)}</span>
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Reply</Badge>
                      {r.type === 'instruction' && (
                        <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">Instruction</Badge>
                      )}
                      {rUnread && <Badge className="h-4 px-1.5 text-[10px]">New</Badge>}
                      <span className="ml-auto text-muted-foreground">
                        {format(new Date(r.created_at), 'MM-dd HH:mm')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm whitespace-pre-wrap">{r.message}</p>
                  </div>
                );
              })}
              {hiddenReplyCount > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded((s) => ({ ...s, [t.parent.id]: true }))}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <ChevronDown className="h-3 w-3" />
                  Show {hiddenReplyCount} more {hiddenReplyCount === 1 ? 'reply' : 'replies'}
                </button>
              )}
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="mb-1 block text-xs">Time window</Label>
              <Select value={String(days)} onValueChange={(v) => setDays((v === 'all' ? 'all' : Number(v)) as DayWindow)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last 365 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Type</Label>
              <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                <TabsList className="h-9">
                  <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                  <TabsTrigger value="comment" className="text-xs">Comment</TabsTrigger>
                  <TabsTrigger value="instruction" className="text-xs">Instruction</TabsTrigger>
                  <TabsTrigger value="reply" className="text-xs">Reply</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div>
              <Label className="mb-1 block text-xs">Author</Label>
              <Input
                placeholder="Name or login id"
                value={authorQuery}
                onChange={(e) => setAuthorQuery(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Body keyword</Label>
              <Input
                placeholder="Search message"
                value={bodyQuery}
                onChange={(e) => setBodyQuery(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="unread-only" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
              <Label htmlFor="unread-only" className="text-sm">Unread only</Label>
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <TabsList className="h-9">
                  <TabsTrigger value="thread" className="text-xs">Threaded</TabsTrigger>
                  <TabsTrigger value="flat" className="text-xs">Flat</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading && comments.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading...</p>
          ) : viewMode === 'thread' ? (
            filteredThreads.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No comments match.</p>
            ) : (
              <ul className="space-y-2">{filteredThreads.map(renderThread)}</ul>
            )
          ) : flatFiltered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No comments match.</p>
          ) : (
            <ul className="space-y-2">{flatFiltered.map((c) => <li key={c.id}>{renderRow(c)}</li>)}</ul>
          )}
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => reload(false)} disabled={loading}>
                {loading ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
