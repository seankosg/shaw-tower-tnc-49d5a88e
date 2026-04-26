import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Send, Reply, X, Pencil, Trash2, Check, MessageSquare, Languages } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { containsKorean } from '@/hooks/useTranslateToEnglish';
import { TranslatePanel } from '@/components/comments/TranslatePanel';
import { RecipientSelector, RecipientBadges, type RecipientKey } from '@/components/comments/RecipientSelector';

type CommentType = 'comment' | 'instruction' | 'reply';

interface SubtestComment {
  id: string;
  subtest_id: string;
  parent_comment_id: string | null;
  author_user_id: string;
  type: CommentType;
  message: string;
  edited: boolean;
  recipients: string[] | null;
  created_at: string;
  updated_at: string;
}

interface AuthorInfo {
  user_id: string;
  name: string | null;
  login_id: string | null;
}

interface SubtestCommentsProps {
  subtestId: string;
  subtestTeam: string | null;
  hdecPicName?: string | null;
  hdecEngName?: string | null;
  subcontractorName?: string | null;
  subsubName?: string | null;
  onCountChange?: (count: number) => void;
}

export function SubtestComments({
  subtestId,
  subtestTeam,
  hdecPicName,
  hdecEngName,
  subcontractorName,
  subsubName,
  onCountChange,
}: SubtestCommentsProps) {
  const { user, profile, isAdmin, isSuperuser, roles } = useAuth();
  const { toast } = useToast();
  const isSenior = roles.includes('senior_user');
  const canPostInstruction = isAdmin || isSuperuser || isSenior;
  const isHdec = profile?.user_type === 'hdec';
  const [myTeam, setMyTeam] = useState<string | null>(null);
  const sameTeamSenior = isSenior && !!subtestTeam && !!myTeam && subtestTeam === myTeam;
  const [showNewTranslate, setShowNewTranslate] = useState(false);
  const [showEditTranslate, setShowEditTranslate] = useState(false);

  useEffect(() => {
    if (!user || !isSenior) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('team')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) setMyTeam((data as any)?.team ?? null);
    })();
    return () => { cancelled = true; };
  }, [user, isSenior]);

  const [comments, setComments] = useState<SubtestComment[]>([]);
  const [authors, setAuthors] = useState<AuthorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [commentType, setCommentType] = useState<Exclude<CommentType, 'reply'>>('comment');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; authorId: string; authorName: string; message: string; recipients: string[] } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState('');
  const [recipients, setRecipients] = useState<RecipientKey[]>([]);

  const recipientNames = useMemo(
    () => ({
      hdec_pic: hdecPicName ?? null,
      hdec_eng: hdecEngName ?? null,
      subcontractor: subcontractorName ?? null,
      subsub: subsubName ?? null,
    }),
    [hdecPicName, hdecEngName, subcontractorName, subsubName],
  );

  useEffect(() => {
    onCountChange?.(comments.length);
  }, [comments.length, onCountChange]);

  const fetchComments = async () => {
    const { data, error } = await (supabase as any)
      .from('subtest_comments')
      .select('*')
      .eq('subtest_id', subtestId)
      .order('created_at', { ascending: true });
    if (error) {
      toast({ title: 'Failed to load comments', description: error.message, variant: 'destructive' });
      return;
    }
    setComments((data ?? []) as SubtestComment[]);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchComments().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [subtestId]);

  useEffect(() => {
    const ids = Array.from(new Set(comments.map((c) => c.author_user_id)));
    if (ids.length === 0) {
      setAuthors([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, name, login_id')
        .in('user_id', ids);
      if (!cancelled) setAuthors((data ?? []) as AuthorInfo[]);
    })();
    return () => { cancelled = true; };
  }, [comments]);

  // Mark as read on mount and whenever new comment arrives
  useEffect(() => {
    if (!user) return;
    (supabase as any)
      .from('subtest_comment_reads')
      .upsert(
        { user_id: user.id, subtest_id: subtestId, last_read_at: new Date().toISOString() },
        { onConflict: 'user_id,subtest_id' },
      )
      .then(() => { /* best effort */ });
  }, [user, subtestId, comments.length]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`subtest-comments-${subtestId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subtest_comments', filter: `subtest_id=eq.${subtestId}` },
        () => { fetchComments(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtestId]);

  const getAuthorName = (id: string) => {
    const a = authors.find((x) => x.user_id === id);
    return a?.name || a?.login_id || 'Unknown';
  };

  const canEditOrDelete = (authorId: string) => {
    if (!user) return false;
    if (authorId === user.id) return true;
    if (isAdmin || isSuperuser) return true;
    if (sameTeamSenior) return true;
    return false;
  };

  const typeBadgeStyle = (type: CommentType) => {
    switch (type) {
      case 'instruction': return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      case 'reply': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-accent text-accent-foreground border-border';
    }
  };

  const handleReply = (c: SubtestComment) => {
    setReplyTo({
      id: c.id,
      authorId: c.author_user_id,
      authorName: getAuthorName(c.author_user_id),
      message: c.message,
    });
  };

  const handleEdit = (c: SubtestComment) => {
    setEditingId(c.id);
    setEditingMessage(c.message);
    setShowEditTranslate(false);
  };

  const persistEdit = async (finalMessage: string) => {
    if (!editingId || !finalMessage.trim()) return;
    const { error } = await (supabase as any)
      .from('subtest_comments')
      .update({ message: finalMessage.trim() })
      .eq('id', editingId);
    if (error) {
      toast({ title: 'Failed to update comment', description: error.message, variant: 'destructive' });
      return;
    }
    setEditingId(null);
    setEditingMessage('');
    setShowEditTranslate(false);
    fetchComments();
  };

  const handleEditSave = async () => {
    if (!editingId || !editingMessage.trim()) return;
    if (isHdec && containsKorean(editingMessage)) {
      setShowEditTranslate(true);
      return;
    }
    await persistEdit(editingMessage);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this comment? Replies will also be removed.')) return;
    const { error } = await (supabase as any)
      .from('subtest_comments')
      .delete()
      .eq('id', id);
    if (error) {
      toast({ title: 'Failed to delete comment', description: error.message, variant: 'destructive' });
      return;
    }
    fetchComments();
  };

  const persistNew = async (finalMessage: string) => {
    if (!finalMessage.trim() || !user) return;
    setSending(true);
    try {
      const isReply = !!replyTo;
      const finalType: CommentType = isReply ? 'reply' : commentType;
      const { error } = await (supabase as any).from('subtest_comments').insert({
        subtest_id: subtestId,
        author_user_id: user.id,
        parent_comment_id: replyTo?.id ?? null,
        type: finalType,
        message: finalMessage.trim(),
      });
      if (error) throw error;
      setMessage('');
      setReplyTo(null);
      setShowNewTranslate(false);
      fetchComments();
    } catch (err: any) {
      toast({ title: 'Failed to post comment', description: err.message ?? String(err), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || !user) return;
    if (isHdec && containsKorean(message)) {
      setShowNewTranslate(true);
      return;
    }
    await persistNew(message);
  };

  const { topLevel, repliesByParent } = useMemo(() => {
    const top: SubtestComment[] = [];
    const map: Record<string, SubtestComment[]> = {};
    for (const c of comments) {
      if (c.parent_comment_id) {
        (map[c.parent_comment_id] ||= []).push(c);
      } else {
        top.push(c);
      }
    }
    return { topLevel: top, repliesByParent: map };
  }, [comments]);

  const renderComment = (c: SubtestComment, depth: number, isReplyItem: boolean) => {
    const isEditing = editingId === c.id;
    const showActions = canEditOrDelete(c.author_user_id);
    const indentStyle = depth > 0 ? { marginLeft: `${Math.min(depth, 4) * 16}px` } : undefined;

    return (
      <div
        key={c.id}
        style={indentStyle}
        className={cn('rounded-md border p-2 space-y-1', typeBadgeStyle(isReplyItem ? 'reply' : c.type))}
      >
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
            {isReplyItem ? 'reply' : c.type}
          </Badge>
          <span className="text-xs font-medium text-foreground">{getAuthorName(c.author_user_id)}</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {format(new Date(c.created_at), 'MM/dd HH:mm')}
            {c.edited ? ' · edited' : ''}
          </span>
          {showActions && !isEditing && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => handleEdit(c)}
                className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Edit comment"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleDelete(c.id)}
                className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Delete comment"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-1.5">
            <Textarea
              value={editingMessage}
              onChange={(e) => setEditingMessage(e.target.value)}
              rows={2}
              className="resize-none text-sm min-h-0"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(); }
                if (e.key === 'Escape') { setEditingId(null); setEditingMessage(''); setShowEditTranslate(false); }
              }}
            />
            {isHdec && containsKorean(editingMessage) && !showEditTranslate && (
              <p className="text-[10px] text-amber-600">
                Korean detected — translation required before saving.
              </p>
            )}
            {showEditTranslate && (
              <TranslatePanel
                originalText={editingMessage}
                onConfirm={(en) => persistEdit(en)}
                onCancel={() => setShowEditTranslate(false)}
              />
            )}
            <div className="flex gap-1 justify-end">
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setEditingId(null); setEditingMessage(''); setShowEditTranslate(false); }}>
                Cancel
              </Button>
              {isHdec && containsKorean(editingMessage) && !showEditTranslate ? (
                <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowEditTranslate(true)} disabled={!editingMessage.trim()}>
                  <Languages className="h-3 w-3 mr-1" /> Translate
                </Button>
              ) : (
                !showEditTranslate && (
                  <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleEditSave} disabled={!editingMessage.trim()}>
                    <Check className="h-3 w-3 mr-1" /> Save
                  </Button>
                )
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm whitespace-pre-wrap break-words text-foreground">{c.message}</p>
            <button
              onClick={() => handleReply(c)}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Reply className="h-3 w-3" /> Reply
            </button>
          </>
        )}
      </div>
    );
  };

  const renderThread = (c: SubtestComment, depth = 0): JSX.Element => {
    const replies = repliesByParent[c.id] ?? [];
    return (
      <div key={c.id} className="space-y-1">
        {renderComment(c, depth, depth > 0)}
        {replies.length > 0 && (
          <div className="space-y-1">
            {replies.map((r) => renderThread(r, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <ScrollArea className="h-72 border border-border rounded-md">
        <div className="p-2 space-y-2">
          {loading && <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>}
          {!loading && topLevel.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-1 py-6 text-muted-foreground">
              <MessageSquare className="h-5 w-5" />
              <p className="text-xs">No comments yet</p>
            </div>
          )}
          {topLevel.map((c) => renderThread(c))}
        </div>
      </ScrollArea>

      {replyTo && (
        <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-md px-2 py-1.5 border border-border">
          <Reply className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground truncate">
            Replying to <span className="font-medium text-foreground">{replyTo.authorName}</span>
            {': '}
            {replyTo.message.substring(0, 60)}{replyTo.message.length > 60 ? '…' : ''}
          </span>
          <button onClick={() => setReplyTo(null)} className="ml-auto shrink-0 hover:text-foreground text-muted-foreground" aria-label="Cancel reply">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-2 items-end">
          {canPostInstruction && !replyTo && (
            <Select value={commentType} onValueChange={(v) => setCommentType(v as any)}>
              <SelectTrigger className="w-[120px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comment">Comment</SelectItem>
                <SelectItem value="instruction">Instruction</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Textarea
            value={message}
            onChange={(e) => { setMessage(e.target.value); if (showNewTranslate) setShowNewTranslate(false); }}
            rows={2}
            className="resize-none text-sm min-h-0"
            placeholder={replyTo ? `Reply to ${replyTo.authorName}…` : 'Write a comment…  (Shift+Enter for newline)'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            disabled={!user || showNewTranslate}
          />
          {isHdec && containsKorean(message) && !showNewTranslate ? (
            <Button
              size="icon"
              variant="outline"
              onClick={() => setShowNewTranslate(true)}
              disabled={!message.trim() || !user}
              className="shrink-0 h-9 w-9"
              title="Translate Korean to English before sending"
            >
              <Languages className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={sending || !message.trim() || !user || showNewTranslate}
              className="shrink-0 h-9 w-9"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {isHdec && containsKorean(message) && !showNewTranslate && (
          <p className="text-[10px] text-amber-600 px-1">
            Korean detected — click the translate button to convert to English before sending.
          </p>
        )}
        {showNewTranslate && (
          <TranslatePanel
            originalText={message}
            onConfirm={(en) => persistNew(en)}
            onCancel={() => setShowNewTranslate(false)}
          />
        )}
      </div>
    </div>
  );
}
