import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchAdminAuthorIds } from '@/lib/comment-author-roles';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { MessageSquare, ChevronRight, ChevronDown, Lock, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  buildCommentThreads,
  getMissingParentIds,
  type CommentThread,
} from '@/lib/comment-threads';

interface DefectRef {
  id: string;
  issue_no: string | null;
  description: string | null;
  team: string | null;
  subcontractor_name: string | null;
}

interface CommentRow {
  id: string;
  defect_id: string;
  type: 'comment' | 'instruction' | 'reply';
  message: string;
  created_at: string;
  author_user_id: string;
  edited: boolean;
  parent_comment_id: string | null;
  defect_items: DefectRef | null;
}

interface AuthorInfo {
  user_id: string;
  name: string | null;
  login_id: string | null;
}

type FilterTab = 'all' | 'instruction' | 'unread';
type DayWindow = 7 | 30 | 90;

export function RecentDefectComments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<FilterTab>('all');
  const [days, setDays] = useState<DayWindow>(90);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [supplementalParents, setSupplementalParents] = useState<CommentRow[]>([]);
  const [authors, setAuthors] = useState<AuthorInfo[]>([]);
  const [vpAuthorIds, setVpAuthorIds] = useState<Set<string>>(new Set());
  const [reads, setReads] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const sinceIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }, [days]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const baseSelect =
        'id, defect_id, type, message, created_at, author_user_id, edited, parent_comment_id';

      // Step 1: fetch comments only (no embedded join)
      const { data, error } = await (supabase as any)
        .from('defect_comments')
        .select(baseSelect)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        console.error('[RecentDefectComments] load error', error);
      }
      if (error || !data) {
        setComments([]);
        setSupplementalParents([]);
        setAuthors([]);
        setLoading(false);
        return;
      }
      const baseRows = data as Omit<CommentRow, 'defect_items'>[];

      // Step 2: supplement orphan parents
      const missingParentIds = getMissingParentIds(baseRows as any);
      let parentRows: Omit<CommentRow, 'defect_items'>[] = [];
      if (missingParentIds.length > 0) {
        const { data: pData } = await (supabase as any)
          .from('defect_comments')
          .select(baseSelect)
          .in('id', missingParentIds);
        parentRows = (pData as Omit<CommentRow, 'defect_items'>[]) ?? [];
      }

      // Step 3: fetch related defects in a single IN query
      const allDefIds = Array.from(
        new Set([...baseRows, ...parentRows].map((r) => r.defect_id).filter(Boolean)),
      );
      const defMap = new Map<string, DefectRef>();
      if (allDefIds.length > 0) {
        const { data: defs } = await supabase
          .from('defect_items')
          .select('id, issue_no, description, team, subcontractor_name')
          .in('id', allDefIds);
        for (const d of (defs as DefectRef[]) ?? []) defMap.set(d.id, d);
      }

      const attach = (r: Omit<CommentRow, 'defect_items'>): CommentRow => ({
        ...r,
        defect_items: defMap.get(r.defect_id) ?? null,
      });
      const rows: CommentRow[] = baseRows.map(attach);
      const suppl: CommentRow[] = parentRows.map(attach);

      if (cancelled) return;
      setComments(rows);
      setSupplementalParents(suppl);
      console.debug('[RecentDefectComments] loaded', {
        count: rows.length,
        days,
        sinceIso,
        accessibleDefects: defMap.size,
      });

      const allAuthorIds = Array.from(new Set([...rows, ...suppl].map((r) => r.author_user_id)));
      if (allAuthorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, name, login_id')
          .in('user_id', allAuthorIds);
        if (!cancelled) setAuthors((profs as AuthorInfo[]) ?? []);
        const vpIds = await fetchAdminAuthorIds(allAuthorIds);
        if (!cancelled) setVpAuthorIds(vpIds);
      } else {
        setAuthors([]);
        setVpAuthorIds(new Set());
      }

      const defIds = Array.from(new Set(rows.map((r) => r.defect_id)));
      if (defIds.length > 0) {
        const { data: r } = await (supabase as any)
          .from('defect_comment_reads')
          .select('defect_id, last_read_at')
          .eq('user_id', user.id)
          .in('defect_id', defIds);
        if (!cancelled) {
          const map: Record<string, string> = {};
          for (const row of (r as any[]) ?? []) map[row.defect_id] = row.last_read_at;
          setReads(map);
        }
      } else {
        setReads({});
      }
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel('recent-defect-comments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'defect_comments' }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sinceIso]);

  const authorName = (id: string) => {
    const a = authors.find((x) => x.user_id === id);
    return a?.name || a?.login_id || 'Unknown';
  };

  const isUnread = (c: CommentRow) => {
    const last = reads[c.defect_id];
    return !last || new Date(c.created_at) > new Date(last);
  };

  const threads: CommentThread<CommentRow>[] = useMemo(
    () => buildCommentThreads({ comments, supplementalParents }),
    [comments, supplementalParents],
  );

  const filteredThreads = useMemo(() => {
    if (tab === 'all') return threads;
    if (tab === 'instruction') {
      return threads.filter(
        (t) => t.parent.type === 'instruction' || t.replies.some((r) => r.type === 'instruction'),
      );
    }
    return threads.filter((t) => isUnread(t.parent) || t.replies.some(isUnread));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, tab, reads]);

  const renderThread = (t: CommentThread<CommentRow>) => {
    const defect = t.parent.defect_items;
    const noAccess = !defect && !t.parentMissing;
    const parentUnread = isUnread(t.parent);
    const threadUnread = parentUnread || t.replies.some(isUnread);
    const isExpanded = expanded[t.parent.id] ?? false;
    const visibleReplies = isExpanded ? t.replies : t.replies.slice(0, 2);
    const hiddenReplyCount = t.replies.length - visibleReplies.length;

    const handleNavigate = () => {
      if (noAccess || t.parentMissing) return;
      const targetId = defect?.id ?? t.parent.defect_id;
      if (targetId) navigate(`/defects/${targetId}`);
    };

    return (
      <li key={t.parent.id}>
        <div
          className={cn(
            'rounded-md border px-3 py-2 transition-colors',
            threadUnread && 'border-primary/40 bg-primary/5',
            vpAuthorIds.has(t.parent.author_user_id) && 'border-l-4 border-l-primary',
            (noAccess || t.parentMissing) && 'bg-muted/40',
          )}
        >
          <button
            type="button"
            onClick={handleNavigate}
            disabled={noAccess || t.parentMissing}
            className={cn(
              'group block w-full text-left',
              !(noAccess || t.parentMissing) && 'hover:bg-muted/40 rounded',
              (noAccess || t.parentMissing) && 'cursor-default',
            )}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{authorName(t.parent.author_user_id)}</span>
              {vpAuthorIds.has(t.parent.author_user_id) && (
                <Badge className="h-4 px-1.5 text-[10px] bg-primary text-primary-foreground hover:bg-primary">VP</Badge>
              )}
              {t.parent.type === 'instruction' && (
                <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                  Instruction
                </Badge>
              )}
              {t.parentSupplemented && !t.parentMissing && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  Older
                </Badge>
              )}
              {t.parentMissing && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                  Reply (parent unavailable)
                </Badge>
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
            <p className="mt-1 line-clamp-2 text-sm">{t.parent.message}</p>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="truncate">
                {defect?.issue_no ?? '—'}
                {defect?.description ? ` · ${defect.description}` : ''}
                {defect?.subcontractor_name ? ` · ${defect.subcontractor_name}` : ''}
              </span>
              {!noAccess && !t.parentMissing && (
                <ChevronRight className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
              )}
            </div>
          </button>

          {t.replies.length > 0 && (
            <div className="mt-2 space-y-1.5 border-l-2 border-muted pl-3">
              {visibleReplies.map((r) => {
                const rUnread = isUnread(r);
                return (
                  <div
                    key={r.id}
                    className={cn(
                      'rounded px-2 py-1.5 text-xs',
                      rUnread && 'bg-primary/5',
                      vpAuthorIds.has(r.author_user_id) && 'border-l-4 border-l-primary pl-2',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{authorName(r.author_user_id)}</span>
                      {vpAuthorIds.has(r.author_user_id) && (
                        <Badge className="h-4 px-1.5 text-[10px] bg-primary text-primary-foreground hover:bg-primary">VP</Badge>
                      )}
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                        Reply
                      </Badge>
                      {r.type === 'instruction' && (
                        <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                          Instruction
                        </Badge>
                      )}
                      {rUnread && <Badge className="h-4 px-1.5 text-[10px]">New</Badge>}
                      <span className="ml-auto text-muted-foreground">
                        {format(new Date(r.created_at), 'MM-dd HH:mm')}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm">{r.message}</p>
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
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Recent Defect Comments
          </CardTitle>
          <div className="flex items-center gap-2">
            <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="h-7 text-xs">All</TabsTrigger>
                <TabsTrigger value="instruction" className="h-7 text-xs">Instructions</TabsTrigger>
                <TabsTrigger value="unread" className="h-7 text-xs">Unread</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as DayWindow)}>
              <SelectTrigger className="h-8 w-[110px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
              <Link to="/comments/defect">
                View all <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
        ) : filteredThreads.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {threads.length === 0
              ? `No comments in the last ${days} days.`
              : `No comments match the "${tab}" filter.`}
          </p>
        ) : (
          <ScrollArea className="h-[360px] pr-2">
            <ul className="space-y-2">{filteredThreads.map(renderThread)}</ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
