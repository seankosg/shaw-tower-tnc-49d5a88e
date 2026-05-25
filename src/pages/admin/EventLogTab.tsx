import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, RefreshCw, Eye } from 'lucide-react';
import { formatDateTimeDdMmmYyyy } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';

type EventAction = 'update' | 'delete' | 'soft_delete';
type EventActorRole = 'senior_user' | 'd_superuser' | 'superuser';

const ROLE_LABEL: Record<EventActorRole, string> = {
  senior_user: 'Senior User',
  d_superuser: 'D.Super User',
  superuser: 'Super User',
};

interface EventLogRow {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_login_id: string | null;
  actor_name: string | null;
  actor_role: EventActorRole;
  action: EventAction;
  table_name: string;
  record_id: string | null;
  changed_fields: string[];
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  summary: string | null;
}

const TABLE_LABELS: Record<string, string> = {
  defect_items: 'Defect Items',
  subtests: 'Subtests',
  subcontractor_master: 'Subcontractors',
  hdec_pic_master: 'HDEC PICs',
  hdec_eng_master: 'HDEC Engs',
  system_master: 'Systems',
  projects: 'Projects',
  profiles: 'User Profiles',
  user_roles: 'User Roles',
  user_system_permissions: 'System Permissions',
};

const ACTION_LABELS: Record<EventAction, string> = {
  update: 'Update',
  delete: 'Delete',
  soft_delete: 'Deactivate',
};

const ACTION_VARIANT: Record<EventAction, 'default' | 'destructive' | 'secondary'> = {
  update: 'secondary',
  delete: 'destructive',
  soft_delete: 'default',
};

const PAGE_SIZE = 50;

export default function EventLogTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<EventLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<EventLogRow | null>(null);

  // filters
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const monthAgo = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [role, setRole] = useState<'all' | EventActorRole>('all');
  const [action, setAction] = useState<'all' | EventAction>('all');
  const [tableName, setTableName] = useState<'all' | string>('all');
  const [actor, setActor] = useState('');

  async function load() {
    setLoading(true);
    let q = supabase
      .from('event_log')
      .select('*', { count: 'exact' })
      .gte('occurred_at', `${from}T00:00:00.000Z`)
      .lte('occurred_at', `${to}T23:59:59.999Z`)
      .order('occurred_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (role !== 'all') q = q.eq('actor_role', role);
    if (action !== 'all') q = q.eq('action', action);
    if (tableName !== 'all') q = q.eq('table_name', tableName);
    if (actor.trim()) {
      const v = actor.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
      q = q.or(`actor_login_id.ilike.%${v}%,actor_name.ilike.%${v}%`);
    }

    const { data, count, error } = await q;
    if (error) {
      toast({ title: 'Failed to load event log', description: error.message, variant: 'destructive' });
    } else {
      setRows((data ?? []) as EventLogRow[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);

  function applyFilters() {
    if (page === 0) load(); else setPage(0);
  }

  async function exportCsv() {
    // Pull up to 5,000 matching rows for export, paginated past the 1000-row PostgREST cap
    const MAX_EXPORT = 5000;
    const PAGE = 1000;
    const buildQuery = (rangeFrom: number, rangeTo: number) => {
      let q = supabase
        .from('event_log')
        .select('*')
        .gte('occurred_at', `${from}T00:00:00.000Z`)
        .lte('occurred_at', `${to}T23:59:59.999Z`)
        .order('occurred_at', { ascending: false })
        .range(rangeFrom, rangeTo);
      if (role !== 'all') q = q.eq('actor_role', role);
      if (action !== 'all') q = q.eq('action', action);
      if (tableName !== 'all') q = q.eq('table_name', tableName);
      if (actor.trim()) {
        const v = actor.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
        q = q.or(`actor_login_id.ilike.%${v}%,actor_name.ilike.%${v}%`);
      }
      return q;
    };
    const list: EventLogRow[] = [];
    for (let off = 0; off < MAX_EXPORT; off += PAGE) {
      const to2 = Math.min(off + PAGE, MAX_EXPORT) - 1;
      const { data, error } = await buildQuery(off, to2);
      if (error) {
        toast({ title: 'Export failed', description: error.message, variant: 'destructive' });
        return;
      }
      const batch = (data ?? []) as EventLogRow[];
      list.push(...batch);
      if (batch.length < to2 - off + 1) break;
    }
    const headers = ['Occurred At', 'Actor Login', 'Actor Name', 'Role', 'Action', 'Table', 'Record ID', 'Summary', 'Changed Fields', 'Before', 'After'];
    const escape = (v: unknown) => {
      const s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      headers.join(','),
      ...list.map((r) => [
        r.occurred_at, r.actor_login_id, r.actor_name, r.actor_role, r.action,
        r.table_name, r.record_id, r.summary, r.changed_fields.join('; '),
        r.before_data, r.after_data,
      ].map(escape).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-log-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">
          Event Log
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Senior User &amp; Super User edits / deletes (1-year retention)
          </span>
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
            <RefreshCw className="mr-1 h-3 w-3" /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="mr-1 h-3 w-3" /> CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8" />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8" />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'all' | EventActorRole)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="senior_user">Senior User</SelectItem>
                <SelectItem value="d_superuser">D.Super User</SelectItem>
                <SelectItem value="superuser">Super User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Action</Label>
            <Select value={action} onValueChange={(v) => setAction(v as 'all' | EventAction)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="soft_delete">Deactivate</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Table</Label>
            <Select value={tableName} onValueChange={setTableName}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {Object.entries(TABLE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1">
            <Label className="text-xs">Actor (login or name)</Label>
            <Input value={actor} onChange={(e) => setActor(e.target.value)} className="h-8" placeholder="e.g. jhpark" />
          </div>
          <div className="flex items-end">
            <Button size="sm" className="h-8 w-full" onClick={applyFilters} disabled={loading}>Apply</Button>
          </div>
        </div>

        {/* Table */}
        <div className="max-h-[560px] overflow-auto rounded border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-[170px]">Time</TableHead>
                <TableHead className="w-[140px]">Actor</TableHead>
                <TableHead className="w-[110px]">Role</TableHead>
                <TableHead className="w-[100px]">Action</TableHead>
                <TableHead className="w-[150px]">Table</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Changed Fields</TableHead>
                <TableHead className="w-[60px]">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No events match these filters.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDateTimeDdMmmYyyy(r.occurred_at)}</TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium">{r.actor_login_id ?? '—'}</div>
                    <div className="text-muted-foreground">{r.actor_name ?? ''}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.actor_role === 'superuser' ? 'default' : 'secondary'} className="text-[10px]">
                      {ROLE_LABEL[r.actor_role] ?? r.actor_role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_VARIANT[r.action]} className="text-[10px]">{ACTION_LABELS[r.action]}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{TABLE_LABELS[r.table_name] ?? r.table_name}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs" title={r.summary ?? r.record_id ?? ''}>
                    {r.summary ?? r.record_id ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs font-mono" title={r.changed_fields.join(', ')}>
                    {r.action === 'delete' ? '— (full row)' : r.changed_fields.join(', ') || '—'}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetail(r)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total.toLocaleString()} event(s) — page {page + 1} / {totalPages}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Event Detail — {detail && (TABLE_LABELS[detail.table_name] ?? detail.table_name)} · {detail && ACTION_LABELS[detail.action]}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 rounded bg-muted/50 p-3">
                <div><span className="text-muted-foreground">Time: </span>{formatDateTimeDdMmmYyyy(detail.occurred_at)}</div>
                <div><span className="text-muted-foreground">Actor: </span>{detail.actor_login_id} ({detail.actor_name})</div>
                <div><span className="text-muted-foreground">Role: </span>{ROLE_LABEL[detail.actor_role] ?? detail.actor_role}</div>
                <div><span className="text-muted-foreground">Record ID: </span><span className="font-mono">{detail.record_id ?? '—'}</span></div>
              </div>

              {detail.action !== 'delete' && (
                <div>
                  <div className="mb-1 font-semibold">Changed fields ({detail.changed_fields.length})</div>
                  <div className="overflow-auto rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">Field</TableHead>
                          <TableHead>Before</TableHead>
                          <TableHead>After</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.changed_fields.map((f) => (
                          <TableRow key={f}>
                            <TableCell className="font-mono text-[11px]">{f}</TableCell>
                            <TableCell className="text-[11px] whitespace-pre-wrap break-all">{stringify(detail.before_data?.[f])}</TableCell>
                            <TableCell className="text-[11px] whitespace-pre-wrap break-all">{stringify(detail.after_data?.[f])}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {detail.action === 'delete' && detail.before_data && (
                <div>
                  <div className="mb-1 font-semibold">Deleted row</div>
                  <pre className="max-h-[400px] overflow-auto rounded bg-muted p-3 text-[11px]">
                    {JSON.stringify(detail.before_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function stringify(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}
