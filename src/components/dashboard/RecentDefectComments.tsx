import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MessageSquare, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
  const [days, setDays] = useState<DayWindow>(30);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [authors, setAuthors] = useState<AuthorInfo[]>([]);
  const [reads, setReads] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

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
      const { data, error } = await (supabase as any)
        .from('defect_comments')
        .select('id, defect_id, type, message, created_at, author_user_id, edited, parent_comment_id, defect_items!inner(id, issue_no, description, team, subcontractor_name)')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error || !data) {
        setComments([]);
        setAuthors([]);
        setLoading(false);
        return;
      }
      const rows = data as CommentRow[];
      setComments(rows);

      const authorIds = Array.from(new Set(rows.map((r) => r.author_user_id)));
      if (authorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, name, login_id')
          .in('user_id', authorIds);
        if (!cancelled) setAuthors((profs as AuthorInfo[]) ?? []);
      } else {
        setAuthors([]);
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
  }, [user, sinceIso]);

  const authorName = (id: string) => {
    const a = authors.find((x) => x.user_id === id);
    return a?.name || a?.login_id || 'Unknown';
  };

  const isUnread = (c: CommentRow) => {
    const last = reads[c.defect_id];
    return !last || new Date(c.created_at) > new Date(last);
  };

  const filtered = useMemo(() => {
    let list = comments;
    if (tab === 'instruction') list = list.filter((c) => c.type === 'instruction');
    else if (tab === 'unread') list = list.filter(isUnread);
    return list;
  }, [comments, tab, reads]);

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
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No comments in this view.</p>
        ) : (
          <ScrollArea className="h-[360px] pr-2">
            <ul className="space-y-2">
              {filtered.map((c) => {
                const unread = isUnread(c);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/defects/${c.defect_id}`)}
                      className={cn(
                        'group w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50',
                        unread && 'border-primary/40 bg-primary/5'
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
                        {unread && (
                          <Badge className="h-4 px-1.5 text-[10px]">New</Badge>
                        )}
                        <span className="ml-auto text-muted-foreground">
                          {format(new Date(c.created_at), 'yyyy-MM-dd HH:mm')}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm">{c.message}</p>
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="truncate">
                          {c.defect_items?.issue_no ?? '—'}
                          {c.defect_items?.description ? ` · ${c.defect_items.description}` : ''}
                          {c.defect_items?.subcontractor_name ? ` · ${c.defect_items.subcontractor_name}` : ''}
                        </span>
                        <ChevronRight className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
