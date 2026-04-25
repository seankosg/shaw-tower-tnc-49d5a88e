import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  ALL_ROLES, ALL_USER_TYPES, ROLE_LABELS, USER_TYPE_LABELS,
  ALL_TEAMS, TEAM_LABELS,
  DEFAULT_PASSWORD,
  type AppRole, type UserType, type TeamType,
} from '@/types/enums';
import { Shield, Plus, KeyRound, Trash2, Pencil, UserCog, ArrowUp, ArrowDown, ArrowUpDown, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAtRiskThreshold, useFrozenColumnCount } from '@/hooks/useAppSettings';
import { formatDateTimeDdMmmYyyy } from '@/lib/format';
import { normalizeOwnerCode, suggestOwnerCode } from '@/lib/defect-utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* ───── Types ───── */
interface Profile {
  id: string; user_id: string; name: string | null; email: string | null;
  login_id: string | null; user_type: UserType;
  subcontractor_name: string | null; subsub_name: string | null; hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  must_change_password: boolean; is_active: boolean;
  team: TeamType | null;
}
interface UserRole { id: string; user_id: string; role: AppRole; }
interface SystemRow {
  id: string; project_id: string; system_code: string; system_name_std: string | null; discipline: string | null;
  is_active: boolean; is_auto_created: boolean; requires_admin_review: boolean;
}
interface PermRow {
  id: string; user_id: string; system_id: string; project_id: string;
  can_view: boolean; can_edit: boolean; can_import: boolean; can_export: boolean; can_create_key: boolean;
}
interface FieldCfg {
  id: string; field_name: string; display_name: string; is_enabled: boolean; is_required: boolean; sort_order: number;
  visible_to_roles: AppRole[] | null; editable_to_roles: AppRole[] | null;
  original_header?: string | null; source_origin?: string;
}
interface ChangeLogRow {
  id: string; subtest_id: string; changed_field: string; old_value: string | null;
  new_value: string | null; changed_by: string | null; changed_at: string; change_source: string | null;
}
interface MasterRow { id: string; name: string; is_active: boolean; type?: 'sub' | 'subsub'; parent_subcontractor_id?: string | null; owner_code?: string | null; }

function getLinkedOwnerCode(profile: Profile, masters: MasterRow[]): string | null {
  const target = profile.user_type === 'subsub'
    ? masters.find((master) => master.type === 'subsub' && master.name === profile.subsub_name)
    : profile.user_type === 'subcontractor'
      ? masters.find((master) => (master.type ?? 'sub') === 'sub' && master.name === profile.subcontractor_name)
      : null;
  return target?.owner_code ?? null;
}

type UsersSortField = 'login_id' | 'name' | 'user_type' | 'team' | 'linked' | 'owner_code' | 'role' | 'is_active';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
function compareSortValues(a: string | number | boolean | null | undefined, b: string | number | boolean | null | undefined): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? -1 : 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

export default function AdminPage() {
  const { isAdminOrSuperuser } = useAuth();
  const isDev = import.meta.env.DEV;
  const hasAccess = isDev || isAdminOrSuperuser;

  if (!hasAccess) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Shield className="h-10 w-10" />
        <p>Access denied. Admin or Superuser role required.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-foreground">Admin Workspace</h1>
      <Tabs defaultValue="users">
        <TabsList className="flex-wrap">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="masters">Subcontractor / HDEC PIC / ENG</TabsTrigger>
          <TabsTrigger value="systems">Systems</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="fields">Field Config</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="backup">Backup & Restore</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="masters"><MastersTab /></TabsContent>
        <TabsContent value="systems"><SystemsTab /></TabsContent>
        <TabsContent value="permissions"><PermissionsTab /></TabsContent>
        <TabsContent value="fields"><FieldConfigTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
        <TabsContent value="backup"><BackupTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ═══════ Tab: Settings ═══════ */
function SettingsTab() {
  const { toast } = useToast();
  const { value: threshold, loading, updateValue } = useAtRiskThreshold();
  const { value: frozenCols, loading: frozenLoading, updateValue: updateFrozen } = useFrozenColumnCount();
  const [draft, setDraft] = useState<number>(2);
  const [saving, setSaving] = useState(false);
  const [frozenDraft, setFrozenDraft] = useState<number>(1);
  const [savingFrozen, setSavingFrozen] = useState(false);

  useEffect(() => { setDraft(threshold); }, [threshold]);
  useEffect(() => { setFrozenDraft(Math.min(Math.max(Number(frozenCols) || 1, 1), 4)); }, [frozenCols]);

  const onSave = async () => {
    if (!Number.isFinite(draft) || draft < 1 || draft > 30) {
      toast({ title: 'Invalid value', description: 'Threshold must be between 1 and 30 days.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await updateValue(Math.round(draft));
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Settings saved', description: `At-Risk threshold set to ${draft} day(s).` });
    }
  };

  const onSaveFrozen = async () => {
    const v = Math.min(Math.max(Math.round(frozenDraft), 1), 4);
    setSavingFrozen(true);
    const { error } = await updateFrozen(v);
    setSavingFrozen(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Settings saved', description: `Frozen columns set to ${v}.` });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dashboard Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="at-risk">At-Risk Threshold (days)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="at-risk"
              type="number"
              min={1}
              max={30}
              value={loading ? '' : draft}
              onChange={e => setDraft(Number(e.target.value))}
              className="w-32"
            />
            <Button onClick={onSave} disabled={saving || loading}>Save</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Subtests whose planned date is within ≤ N days from today (and not Done) will be flagged as At-Risk on the Dashboard.
            Default: 2 days.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="frozen-cols">Frozen Columns (Raw Data)</Label>
          <div className="flex items-center gap-2">
            <Select
              value={frozenLoading ? '' : String(frozenDraft)}
              onValueChange={(v) => setFrozenDraft(Number(v))}
            >
              <SelectTrigger id="frozen-cols" className="w-32">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="4">4</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={onSaveFrozen} disabled={savingFrozen || frozenLoading}>Save</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Number of left-fixed columns in Raw Data tables. Issue No is always the first frozen column;
            additional frozen columns follow the order configured in Field Config. Mobile view always uses 1.
            Default: 1.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════ Tab 1: Users ═══════ */
function UsersTab() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [subcons, setSubcons] = useState<MasterRow[]>([]);
  const [subsubs, setSubsubs] = useState<MasterRow[]>([]);
  const [hdecPics, setHdecPics] = useState<MasterRow[]>([]);
  const [hdecEngs, setHdecEngs] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [sortField, setSortField] = useState<UsersSortField>('login_id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (field: UsersSortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const load = async () => {
    setLoading(true);
    const [p, r, s, h, he] = await Promise.all([
      supabase.from('profiles').select('*').order('login_id'),
      supabase.from('user_roles').select('*'),
      supabase.from('subcontractor_master').select('*').eq('is_active', true).order('name'),
      supabase.from('hdec_pic_master').select('*').eq('is_active', true).order('name'),
      supabase.from('hdec_eng_master').select('*').eq('is_active', true).order('name'),
    ]);
    if (p.data) setProfiles(p.data as Profile[]);
    if (r.data) setRoles(r.data as UserRole[]);
    if (s.data) {
      const all = s.data as MasterRow[];
      setSubcons(all.filter(m => (m.type ?? 'sub') === 'sub'));
      setSubsubs(all.filter(m => m.type === 'subsub'));
    }
    if (h.data) setHdecPics(h.data as MasterRow[]);
    if (he.data) setHdecEngs(he.data as MasterRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const getUserRole = (uid: string): AppRole | undefined =>
    roles.find(r => r.user_id === uid)?.role;

  const setUserRole = async (uid: string, role: AppRole) => {
    const existing = roles.filter(r => r.user_id === uid);
    if (existing.length > 0) {
      await supabase.from('user_roles').delete().eq('user_id', uid);
    }
    await supabase.from('user_roles').insert({ user_id: uid, role });
    toast({ title: 'Role updated' });
    load();
  };

  const toggleActive = async (profile: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_active: !profile.is_active }).eq('id', profile.id);
    if (error) {
      toast({ title: 'Failed to update', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: profile.is_active ? 'User deactivated' : 'User activated' });
    load();
  };

  const resetPassword = async (profile: Profile) => {
    if (!confirm(`Reset password for ${profile.login_id} to ${DEFAULT_PASSWORD}?`)) return;
    const { data, error } = await supabase.functions.invoke('admin-reset-password', {
      body: { user_id: profile.user_id },
    });
    if (error || (data as any)?.error) toast({ title: 'Reset failed', description: (data as any)?.error ?? error?.message, variant: 'destructive' });
    else toast({ title: `Password reset to ${DEFAULT_PASSWORD}` });
    load();
  };

  const editLoginId = async (profile: Profile) => {
    const next = window.prompt(`New Login ID for ${profile.name ?? profile.login_id}\n(3-32 chars: a-z, 0-9, _)`, profile.login_id ?? '');
    if (!next) return;
    const trimmed = next.trim().toLowerCase();
    if (trimmed === profile.login_id) return;
    if (!/^[a-z0-9_]{3,32}$/.test(trimmed)) {
      toast({ title: 'Invalid Login ID', description: '3-32 chars: a-z 0-9 _', variant: 'destructive' });
      return;
    }
    const { data, error } = await supabase.functions.invoke('admin-update-login-id', {
      body: { user_id: profile.user_id, new_login_id: trimmed },
    });
    if (error || (data as any)?.error) {
      toast({ title: 'Update failed', description: error?.message ?? (data as any)?.error, variant: 'destructive' });
    } else {
      toast({ title: 'Login ID updated', description: `Now: ${trimmed}` });
      load();
    }
  };

  const hardDelete = async (profile: Profile) => {
    const { error } = await supabase.functions.invoke('admin-delete-user', {
      body: { user_id: profile.user_id },
    });
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'User permanently deleted' });
      load();
    }
    setDeleteTarget(null);
  };

  const allMastersForSort = [...subcons, ...subsubs];
  const sortedProfiles = [...profiles].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    let aVal: string | number | boolean | null;
    let bVal: string | number | boolean | null;
    switch (sortField) {
      case 'login_id':
        aVal = a.login_id; bVal = b.login_id; break;
      case 'name':
        aVal = a.name; bVal = b.name; break;
      case 'user_type':
        aVal = USER_TYPE_LABELS[a.user_type] ?? a.user_type;
        bVal = USER_TYPE_LABELS[b.user_type] ?? b.user_type;
        break;
      case 'team':
        aVal = a.team ? TEAM_LABELS[a.team] : null;
        bVal = b.team ? TEAM_LABELS[b.team] : null;
        break;
      case 'linked':
        aVal = a.user_type === 'subcontractor' || a.user_type === 'subsub' ? a.subcontractor_name : (a.user_type === 'hdec' || a.user_type === 'pm_pd' ? (a.hdec_pic_name ?? a.hdec_eng_name) : null);
        bVal = b.user_type === 'subcontractor' || b.user_type === 'subsub' ? b.subcontractor_name : (b.user_type === 'hdec' || b.user_type === 'pm_pd' ? (b.hdec_pic_name ?? b.hdec_eng_name) : null);
        break;
      case 'owner_code':
        aVal = getLinkedOwnerCode(a, allMastersForSort);
        bVal = getLinkedOwnerCode(b, allMastersForSort);
        break;
      case 'role': {
        const aRole = getUserRole(a.user_id);
        const bRole = getUserRole(b.user_id);
        aVal = aRole ? ROLE_LABELS[aRole] : null;
        bVal = bRole ? ROLE_LABELS[bRole] : null;
        break;
      }
      case 'is_active':
        aVal = a.is_active; bVal = b.is_active; break;
      default:
        aVal = null; bVal = null;
    }
    return compareSortValues(aVal, bVal) * dir;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">User Management</CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            import('xlsx-js-style').then(XLSX => {
              const allMasters = [...subcons, ...subsubs];
              const headers = ['Login ID', 'Name', 'User Type', 'Team', 'Linked Master', 'Owner Code', 'Role', 'Active'];
              const rows = profiles.map(p => [
                p.login_id ?? '',
                p.name ?? '',
                USER_TYPE_LABELS[p.user_type] ?? p.user_type,
                p.team ? TEAM_LABELS[p.team] : '',
                p.user_type === 'subcontractor' ? (p.subcontractor_name ?? '') :
                  p.user_type === 'subsub' ? (p.subcontractor_name ?? '') :
                  (p.user_type === 'hdec' || p.user_type === 'pm_pd') ? (p.hdec_pic_name ?? p.hdec_eng_name ?? '') : '',
                getLinkedOwnerCode(p, allMasters) ?? '',
                ROLE_LABELS[getUserRole(p.user_id) as AppRole] ?? '',
                p.is_active ? 'Yes' : 'No',
              ]);

              const aoa = [headers, ...rows];
              const ws = XLSX.utils.aoa_to_sheet(aoa);

              // Header styling
              const headerStyle = {
                font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFFFF' } },
                fill: { fgColor: { rgb: 'FF334155' } },
                alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
                border: {
                  top: { style: 'thin', color: { rgb: 'FF1F2937' } },
                  bottom: { style: 'thin', color: { rgb: 'FF1F2937' } },
                  left: { style: 'thin', color: { rgb: 'FF1F2937' } },
                  right: { style: 'thin', color: { rgb: 'FF1F2937' } },
                },
              };

              // Data styling
              const dataStyle = {
                font: { name: 'Calibri', sz: 10, color: { rgb: 'FF111827' } },
                alignment: { vertical: 'center', horizontal: 'left' },
                border: {
                  top: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
                  bottom: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
                  left: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
                  right: { style: 'thin', color: { rgb: 'FFE5E7EB' } },
                },
              };

              // Apply header styles
              for (let c = 0; c < headers.length; c++) {
                const addr = XLSX.utils.encode_cell({ r: 0, c });
                ws[addr] = { t: 's', v: headers[c], s: headerStyle };
              }

              // Apply data styles
              for (let r = 0; r < rows.length; r++) {
                for (let c = 0; c < headers.length; c++) {
                  const addr = XLSX.utils.encode_cell({ r: r + 1, c });
                  ws[addr] = { t: 's', v: String(rows[r][c]), s: dataStyle };
                }
              }

              // Column widths
              ws['!cols'] = headers.map((h, i) => ({
                wch: Math.max(
                  h.length + 2,
                  ...rows.map(r => String(r[i]).length),
                  12
                ),
              }));

              // Row heights
              ws['!rows'] = [{ hpt: 28 }, ...rows.map(() => ({ hpt: 20 }))];

              // Freeze header row
              ws['!freeze'] = { xSplit: 0, ySplit: 1 };
              (ws as any)['!views'] = [{ state: 'frozen', ySplit: 1 }];

              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Users');
              const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
              XLSX.writeFile(wb, `SHAW_Users_${d}.xlsx`);
              toast({ title: 'Export complete', description: `${rows.length} users exported` });
            });
          }}>
            <Download className="mr-1 h-4 w-4" /> Export
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New User</Button>
            </DialogTrigger>
          <CreateUserDialog
            subcons={subcons}
            subsubs={subsubs}
            hdecPics={hdecPics}
            hdecEngs={hdecEngs}
            onCreated={() => { setCreateOpen(false); load(); }}
          />
        </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead field="login_id" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Login ID</SortableHead>
                <SortableHead field="name" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Name</SortableHead>
                <SortableHead field="user_type" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Type</SortableHead>
                <SortableHead field="team" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Team</SortableHead>
                <SortableHead field="linked" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Linked Master</SortableHead>
                <SortableHead field="owner_code" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Owner Code</SortableHead>
                <SortableHead field="role" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Role</SortableHead>
                <SortableHead field="is_active" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Active</SortableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProfiles.map(p => {
                const role = getUserRole(p.user_id);
                const linked =
                  p.user_type === 'subcontractor' ? p.subcontractor_name :
                  p.user_type === 'subsub' ? p.subcontractor_name :
                  p.user_type === 'hdec' || p.user_type === 'pm_pd' ? (p.hdec_pic_name ?? p.hdec_eng_name) : null;
                const ownerCode = getLinkedOwnerCode(p, [...subcons, ...subsubs]);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">
                      <button
                        onClick={() => editLoginId(p)}
                        className="hover:underline"
                        title="Click to edit Login ID"
                      >
                        {p.login_id ?? '—'}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium">{p.name ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{USER_TYPE_LABELS[p.user_type]}</Badge></TableCell>
                    <TableCell className="text-xs">{p.team ? TEAM_LABELS[p.team] : '—'}</TableCell>
                    <TableCell className="text-xs">{linked ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{ownerCode ?? '—'}</TableCell>
                    <TableCell>
                      <Select value={role ?? ''} onValueChange={(v) => setUserRole(p.user_id, v as AppRole)}>
                        <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {ALL_ROLES.map(r => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {p.must_change_password && (
                          <Badge variant="secondary" className="text-xs">PW pending</Badge>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setEditTarget(p)} title="Edit user">
                          <UserCog className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => resetPassword(p)} title="Reset password">
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(p)} title="Delete permanently">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {editTarget && (
        <EditUserDialog
          profile={editTarget}
          subcons={subcons}
          subsubs={subsubs}
          hdecPics={hdecPics}
          hdecEngs={hdecEngs}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.login_id}</strong> ({deleteTarget?.name}) and cannot be undone.
              Audit log references will be preserved but unlinked. Consider deactivating instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && hardDelete(deleteTarget)}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/* ───── Create User Dialog ───── */
function CreateUserDialog({
  subcons, subsubs, hdecPics, hdecEngs, onCreated,
}: {
  subcons: MasterRow[]; subsubs: MasterRow[]; hdecPics: MasterRow[]; hdecEngs: MasterRow[]; onCreated: () => void;
}) {
  const { toast } = useToast();
  const [loginId, setLoginId] = useState('');
  const [name, setName] = useState('');
  const [userType, setUserType] = useState<UserType>('hdec');
  const [role, setRole] = useState<AppRole>('user');
  const [subconName, setSubconName] = useState<string>('');
  const [subsubId, setSubsubId] = useState<string>('');
  const [hdecPicName, setHdecPicName] = useState<string>('');
  const [hdecEngName, setHdecEngName] = useState<string>('');
  const [team, setTeam] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const selectedSubsub = subsubs.find(s => s.id === subsubId);
  const subsubParent = selectedSubsub
    ? subcons.find(s => s.id === selectedSubsub.parent_subcontractor_id)
    : null;
  const selectedOwnerCode = userType === 'subcontractor'
    ? subcons.find(s => s.name === subconName)?.owner_code
    : userType === 'subsub'
      ? selectedSubsub?.owner_code
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z0-9_]{3,32}$/.test(loginId.trim().toLowerCase())) {
      toast({ title: 'Invalid User ID', description: '3–32 chars, lowercase letters / digits / underscore only.', variant: 'destructive' });
      return;
    }
    let payloadSubconName: string | null = null;
    let payloadSubsubName: string | null = null;
    if (userType === 'subcontractor') {
      if (!subconName) { toast({ title: 'Subcontractor required', variant: 'destructive' }); return; }
      payloadSubconName = subconName;
    } else if (userType === 'subsub') {
      if (!selectedSubsub) { toast({ title: 'Sub-Sub required', variant: 'destructive' }); return; }
      if (!subsubParent) { toast({ title: 'Sub-Sub has no parent Subcontractor', variant: 'destructive' }); return; }
      payloadSubsubName = selectedSubsub.name;
      payloadSubconName = subsubParent.name;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        login_id: loginId.trim().toLowerCase(),
        name: name.trim(),
        user_type: userType,
        role,
        subcontractor_name: payloadSubconName,
        subsub_name: payloadSubsubName,
        hdec_pic_name: (userType === 'hdec' || userType === 'pm_pd') ? (hdecPicName || null) : null,
        hdec_eng_name: (userType === 'hdec' || userType === 'pm_pd') ? (hdecEngName || null) : null,
        team: team === '__none' || team === '' ? null : team,
      },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Create failed', description: error?.message ?? (data as any)?.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'User created', description: `Initial password: ${DEFAULT_PASSWORD}` });
    setLoginId(''); setName(''); setSubconName(''); setSubsubId(''); setHdecPicName(''); setHdecEngName(''); setTeam('');
    onCreated();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Create User</DialogTitle>
        <DialogDescription>Initial password is <code className="font-mono">{DEFAULT_PASSWORD}</code>. User must change on first login.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="lid">User ID</Label>
          <Input id="lid" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="e.g. kim_hdec" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nm">Name</Label>
          <Input id="nm" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>User Type</Label>
            <Select value={userType} onValueChange={(v) => setUserType(v as UserType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_USER_TYPES.map(t => <SelectItem key={t} value={t}>{USER_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {userType === 'subcontractor' && (
          <div className="space-y-1.5">
            <Label>Subcontractor</Label>
            <Select value={subconName} onValueChange={setSubconName}>
              <SelectTrigger><SelectValue placeholder="Select subcontractor" /></SelectTrigger>
              <SelectContent>
                {subcons.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Owner Code: <span className="font-mono">{selectedOwnerCode ?? '—'}</span></p>
          </div>
        )}
        {userType === 'subsub' && (
          <div className="space-y-1.5">
            <Label>Subcontractor</Label>
            <Select value={subsubId} onValueChange={setSubsubId}>
              <SelectTrigger><SelectValue placeholder="Select sub-sub company" /></SelectTrigger>
              <SelectContent>
                {subsubs.map(s => {
                  const parent = subcons.find(p => p.id === s.parent_subcontractor_id);
                  return (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{parent ? ` (← ${parent.name})` : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {subsubParent && (
              <p className="text-xs text-muted-foreground">Subcontractor (parent): <strong>{subsubParent.name}</strong> — Owner Code: <span className="font-mono">{selectedOwnerCode ?? '—'}</span></p>
            )}
          </div>
        )}
        {(userType === 'hdec' || userType === 'pm_pd') && (
          <>
            <div className="space-y-1.5">
              <Label>HDEC PIC (optional)</Label>
              <Select value={hdecPicName || '__none'} onValueChange={(v) => setHdecPicName(v === '__none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Select HDEC PIC" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {hdecPics.map(h => <SelectItem key={h.id} value={h.name}>{h.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Owner Code: <span className="font-mono">{selectedOwnerCode ?? '—'}</span></p>
            </div>
            <div className="space-y-1.5">
              <Label>HDEC ENG (optional)</Label>
              <Select value={hdecEngName || '__none'} onValueChange={(v) => setHdecEngName(v === '__none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Select HDEC ENG" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— None —</SelectItem>
                  {hdecEngs.map(h => <SelectItem key={h.id} value={h.name}>{h.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label>Team (optional)</Label>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">No team</SelectItem>
              {ALL_TEAMS.map(t => <SelectItem key={t} value={t}>{TEAM_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Senior Users can edit/delete all subtests in their assigned team.</p>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* ───── Edit User Dialog ───── */
function EditUserDialog({
  profile, subcons, subsubs, hdecPics, hdecEngs, onClose, onSaved,
}: {
  profile: Profile;
  subcons: MasterRow[];
  subsubs: MasterRow[];
  hdecPics: MasterRow[];
  hdecEngs: MasterRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(profile.name ?? '');
  const [userType, setUserType] = useState<UserType>(profile.user_type);
  const [subconName, setSubconName] = useState<string>(profile.subcontractor_name ?? '');
  const initialSubsubId = subsubs.find(s => s.name === profile.subsub_name)?.id ?? '';
  const [subsubId, setSubsubId] = useState<string>(initialSubsubId);
  const [hdecPicName, setHdecPicName] = useState<string>(profile.hdec_pic_name ?? '');
  const [hdecEngName, setHdecEngName] = useState<string>(profile.hdec_eng_name ?? '');
  const [team, setTeam] = useState<string>(profile.team ?? '');
  const [saving, setSaving] = useState(false);

  const selectedSubsub = subsubs.find(s => s.id === subsubId);
  const subsubParent = selectedSubsub
    ? subcons.find(s => s.id === selectedSubsub.parent_subcontractor_id)
    : null;
  const selectedOwnerCode = userType === 'subcontractor'
    ? subcons.find(s => s.name === subconName)?.owner_code
    : userType === 'subsub'
      ? selectedSubsub?.owner_code
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let payloadSubconName: string | null = null;
    let payloadSubsubName: string | null = null;
    let payloadHdecPicName: string | null = null;

    if (userType === 'subcontractor') {
      if (!subconName) { toast({ title: 'Subcontractor required', variant: 'destructive' }); return; }
      payloadSubconName = subconName;
    } else if (userType === 'subsub') {
      if (!selectedSubsub || !subsubParent) {
        toast({ title: 'Sub-Sub with valid parent required', variant: 'destructive' });
        return;
      }
      payloadSubsubName = selectedSubsub.name;
      payloadSubconName = subsubParent.name;
    } else if (userType === 'hdec' || userType === 'pm_pd') {
      payloadHdecPicName = hdecPicName || null;
    }

    setSaving(true);
    const { data, error } = await supabase.functions.invoke('admin-update-user', {
      body: {
        user_id: profile.user_id,
        name: name.trim(),
        user_type: userType,
        subcontractor_name: payloadSubconName,
        subsub_name: payloadSubsubName,
        hdec_pic_name: payloadHdecPicName,
        team: team === '__none' || team === '' ? null : team,
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast({ title: 'Update failed', description: error?.message ?? (data as any)?.error, variant: 'destructive' });
      return;
    }
    toast({ title: 'User updated' });
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Login ID <code className="font-mono">{profile.login_id}</code> — use the Login ID action to change it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>User Type</Label>
            <Select value={userType} onValueChange={(v) => setUserType(v as UserType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_USER_TYPES.map(t => <SelectItem key={t} value={t}>{USER_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        {userType === 'subcontractor' && (
          <div className="space-y-1.5">
            <Label>Subcontractor</Label>
            <Select value={subconName} onValueChange={setSubconName}>
              <SelectTrigger><SelectValue placeholder="Select subcontractor" /></SelectTrigger>
              <SelectContent>
                {subcons.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {userType === 'subsub' && (
          <div className="space-y-1.5">
            <Label>Subcontractor</Label>
            <Select value={subsubId} onValueChange={setSubsubId}>
              <SelectTrigger><SelectValue placeholder="Select sub-sub company" /></SelectTrigger>
              <SelectContent>
                {subsubs.map(s => {
                  const parent = subcons.find(p => p.id === s.parent_subcontractor_id);
                  return (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{parent ? ` (← ${parent.name})` : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {subsubParent && (
              <p className="text-xs text-muted-foreground">Subcontractor (parent): <strong>{subsubParent.name}</strong> — Owner Code: <span className="font-mono">{selectedOwnerCode ?? '—'}</span></p>
            )}
          </div>
        )}
          {(userType === 'hdec' || userType === 'pm_pd') && (
            <div className="space-y-1.5">
              <Label>HDEC PIC (optional)</Label>
              <Select value={hdecPicName} onValueChange={setHdecPicName}>
                <SelectTrigger><SelectValue placeholder="Select HDEC PIC" /></SelectTrigger>
                <SelectContent>
                  {hdecPics.map(h => <SelectItem key={h.id} value={h.name}>{h.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Team (optional)</Label>
            <Select value={team || '__none'} onValueChange={setTeam}>
              <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No team</SelectItem>
                {ALL_TEAMS.map(t => <SelectItem key={t} value={t}>{TEAM_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Senior Users can edit/delete all subtests in their assigned team.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SortableHead({
  field,
  sortField,
  sortDir,
  onSort,
  children,
  className,
}: {
  field: UsersSortField;
  sortField: UsersSortField;
  sortDir: 'asc' | 'desc';
  onSort: (field: UsersSortField) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const isActive = sortField === field;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground transition-colors"
      >
        <span>{children}</span>
        {isActive ? (
          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </TableHead>
  );
}

function MastersTab() {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const syncMissingUsers = async () => {
    setSyncing(true);
    let created = 0, failed = 0, skipped = 0;
    try {
      const [{ data: subs }, { data: pics }, { data: profiles }] = await Promise.all([
        supabase.from('subcontractor_master').select('id, name, type, parent_subcontractor_id, is_active').eq('is_active', true),
        supabase.from('hdec_pic_master').select('id, name, is_active').eq('is_active', true),
        supabase.from('profiles').select('subcontractor_name, subsub_name, hdec_pic_name'),
      ]);
      const subProfiles = new Set((profiles || []).map(p => (p.subcontractor_name || '').toLowerCase().trim()).filter(Boolean));
      const subsubProfiles = new Set((profiles || []).map(p => (p.subsub_name || '').toLowerCase().trim()).filter(Boolean));
      const picProfiles = new Set((profiles || []).map(p => (p.hdec_pic_name || '').toLowerCase().trim()).filter(Boolean));
      const subById = new Map((subs || []).map(s => [s.id, s.name]));

      for (const s of subs || []) {
        const key = s.name.toLowerCase().trim();
        const t = (s as any).type ?? 'sub';
        const exists = t === 'sub' ? subProfiles.has(key) : subsubProfiles.has(key);
        if (exists) { skipped++; continue; }
        const parentName = t === 'subsub' ? (subById.get((s as any).parent_subcontractor_id) ?? null) : null;
        const { error } = await supabase.functions.invoke('auto-create-master-user', {
          body: {
            name: s.name,
            master_type: t === 'sub' ? 'subcontractor' : 'subsub',
            subcontractor_name: t === 'sub' ? s.name : parentName,
            subsub_name: t === 'subsub' ? s.name : null,
          },
        });
        if (error) failed++; else created++;
      }
      for (const p of pics || []) {
        const key = p.name.toLowerCase().trim();
        if (picProfiles.has(key)) { skipped++; continue; }
        const { error } = await supabase.functions.invoke('auto-create-master-user', {
          body: { name: p.name, master_type: 'hdec_pic', hdec_pic_name: p.name },
        });
        if (error) failed++; else created++;
      }
      toast({
        title: 'Sync complete',
        description: `${created} created, ${skipped} already exist, ${failed} failed`,
      });
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={syncMissingUsers} disabled={syncing} variant="outline" size="sm">
          <KeyRound className="mr-2 h-4 w-4" />
          {syncing ? 'Syncing...' : 'Sync Missing Users'}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SubcontractorMasterTable />
        <MasterTable table="hdec_pic_master" title="HDEC PIC Master" />
      </div>
    </div>
  );
}

function SubcontractorMasterTable() {
  const { toast } = useToast();
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSubName, setNewSubName] = useState('');
  const [newSubOwnerCode, setNewSubOwnerCode] = useState('');
  const [newSubSubName, setNewSubSubName] = useState('');
  const [newSubSubParent, setNewSubSubParent] = useState('');
  const [newSubSubOwnerCode, setNewSubSubOwnerCode] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('subcontractor_master').select('*').order('name');
    if (data) setRows(data as MasterRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const subs = rows.filter(r => (r.type ?? 'sub') === 'sub');
  const subsubs = rows.filter(r => r.type === 'subsub');

  const addSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    const name = newSubName.trim();
    const owner_code = normalizeOwnerCode(newSubOwnerCode) ?? suggestOwnerCode(name);
    const { error } = await supabase.from('subcontractor_master').insert({ name, type: 'sub', owner_code } as any);
    if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
    const { error: fnErr } = await supabase.functions.invoke('auto-create-master-user', {
      body: { name, master_type: 'subcontractor', subcontractor_name: name },
    });
    if (fnErr) toast({ title: 'Added (user creation failed)', description: fnErr.message, variant: 'destructive' });
    else toast({ title: 'Subcontractor added', description: `User account created (PW: ${DEFAULT_PASSWORD})` });
    setNewSubName(''); setNewSubOwnerCode(''); load();
  };

  const addSubSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubSubName.trim() || !newSubSubParent) {
      toast({ title: 'Name and parent required', variant: 'destructive' });
      return;
    }
    const name = newSubSubName.trim();
    const parentName = subs.find(s => s.id === newSubSubParent)?.name ?? null;
    const owner_code = normalizeOwnerCode(newSubSubOwnerCode) ?? suggestOwnerCode(name);
    const { error } = await supabase.from('subcontractor_master').insert({
      name, type: 'subsub', parent_subcontractor_id: newSubSubParent, owner_code,
    } as any);
    if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
    const { error: fnErr } = await supabase.functions.invoke('auto-create-master-user', {
      body: { name, master_type: 'subsub', subcontractor_name: parentName, subsub_name: name },
    });
    if (fnErr) toast({ title: 'Added (user creation failed)', description: fnErr.message, variant: 'destructive' });
    else toast({ title: 'Sub-Sub added', description: `User account created (PW: ${DEFAULT_PASSWORD})` });
    setNewSubSubName(''); setNewSubSubParent(''); setNewSubSubOwnerCode(''); load();
  };

  const [pendingToggle, setPendingToggle] = useState<{ row: MasterRow; linkedCount: number } | null>(null);

  const startToggleActive = async (r: MasterRow) => {
    if (r.is_active) {
      // Deactivating — check linked users
      const col = (r.type ?? 'sub') === 'sub' ? 'subcontractor_name' : 'subsub_name';
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq(col, r.name).eq('is_active', true);
      setPendingToggle({ row: r, linkedCount: count ?? 0 });
    } else {
      // Activating — just activate the master, no cascade
      await supabase.from('subcontractor_master').update({ is_active: true }).eq('id', r.id);
      toast({ title: 'Activated' });
      load();
    }
  };

  const confirmToggle = async (cascade: boolean) => {
    if (!pendingToggle) return;
    const r = pendingToggle.row;
    const { error } = await supabase.from('subcontractor_master').update({ is_active: false }).eq('id', r.id);
    if (error) {
      toast({ title: 'Failed to deactivate', description: error.message, variant: 'destructive' });
      setPendingToggle(null);
      return;
    }
    if (cascade) {
      const col = (r.type ?? 'sub') === 'sub' ? 'subcontractor_name' : 'subsub_name';
      const { data: linked, error: cascadeErr } = await supabase
        .from('profiles')
        .update({ is_active: false } as any)
        .eq(col, r.name)
        .select('id');
      if (cascadeErr) {
        toast({ title: 'Master deactivated, but cascade failed', description: cascadeErr.message, variant: 'destructive' });
      } else {
        toast({ title: 'Deactivated', description: `${linked?.length ?? 0} linked user(s) also deactivated` });
      }
    } else {
      toast({ title: 'Deactivated', description: 'Linked users were NOT affected' });
    }
    setPendingToggle(null);
    load();
  };

  const renameMaster = async (r: MasterRow, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === r.name) return;
    const { error } = await supabase.from('subcontractor_master').update({ name: trimmed }).eq('id', r.id);
    if (error) { toast({ title: 'Rename failed', description: error.message, variant: 'destructive' }); return; }
    // Cascade to subtests + profiles
    const col = (r.type ?? 'sub') === 'sub' ? 'subcontractor_name' : 'subsub_name';
    await supabase.from('subtests').update({ [col]: trimmed } as any).eq(col, r.name);
    await supabase.from('profiles').update({ [col]: trimmed } as any).eq(col, r.name);
    toast({ title: 'Renamed', description: 'Linked subtests and profiles updated' });
    load();
  };

  const updateOwnerCode = async (r: MasterRow, value: string) => {
    const owner_code = normalizeOwnerCode(value);
    if (!owner_code || owner_code === r.owner_code) return;
    const { error } = await supabase.from('subcontractor_master').update({ owner_code } as any).eq('id', r.id);
    if (error) { toast({ title: 'Owner Code update failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Owner Code updated' });
    load();
  };

  const remove = async (r: MasterRow) => {
    const col = (r.type ?? 'sub') === 'sub' ? 'subcontractor_name' : 'subsub_name';
    // Block hard delete if any subtests or profiles still reference this name
    const [{ count: subtestCount }, { count: profileCount }, { count: childCount }] = await Promise.all([
      supabase.from('subtests').select('id', { count: 'exact', head: true }).eq(col, r.name),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq(col, r.name),
      (r.type ?? 'sub') === 'sub'
        ? supabase.from('subcontractor_master').select('id', { count: 'exact', head: true }).eq('parent_subcontractor_id', r.id)
        : Promise.resolve({ count: 0 } as any),
    ]);
    const refs: string[] = [];
    if (subtestCount) refs.push(`${subtestCount} subtest(s)`);
    if (profileCount) refs.push(`${profileCount} user profile(s)`);
    if (childCount) refs.push(`${childCount} Sub-Sub child(ren)`);
    if (refs.length > 0) {
      toast({
        title: 'Cannot delete — references exist',
        description: `Linked: ${refs.join(', ')}. Deactivate instead, or remove references first.`,
        variant: 'destructive',
      });
      return;
    }
    if (!confirm(`Permanently delete "${r.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('subcontractor_master').delete().eq('id', r.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Deleted permanently' }); load(); }
  };

  return (
    <>
    <Card>
      <CardHeader><CardTitle className="text-base">Subcontractor Master</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {/* Subcontractors */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subcontractors</h3>
          <form onSubmit={addSub} className="flex gap-2">
            <Input value={newSubName} onChange={(e) => setNewSubName(e.target.value)} placeholder="Add Subcontractor..." />
            <Input value={newSubOwnerCode} onChange={(e) => setNewSubOwnerCode(e.target.value)} placeholder={suggestOwnerCode(newSubName)} className="w-32 font-mono" />
            <Button type="submit" size="sm"><Plus className="h-4 w-4" /></Button>
          </form>
          {loading ? (
            <p className="py-2 text-center text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="max-h-[200px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-32">Owner Code</TableHead>
                    <TableHead className="w-20 text-center">Active</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subs.map(r => (
                    <TableRow key={r.id}>
                      <TableCell><InlineNameEdit value={r.name} onSave={(v) => renameMaster(r, v)} /></TableCell>
                      <TableCell><InlineNameEdit value={r.owner_code ?? suggestOwnerCode(r.name)} onSave={(v) => updateOwnerCode(r, v)} /></TableCell>
                      <TableCell className="text-center">
                        <Switch checked={r.is_active} onCheckedChange={() => startToggleActive(r)} />
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => remove(r)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* SubSubs */}
        <div className="space-y-2 border-t pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sub-Subs (재하도)</h3>
          <form onSubmit={addSubSub} className="flex gap-2">
            <Input value={newSubSubName} onChange={(e) => setNewSubSubName(e.target.value)} placeholder="Sub-Sub name..." className="flex-1" />
            <Input value={newSubSubOwnerCode} onChange={(e) => setNewSubSubOwnerCode(e.target.value)} placeholder={suggestOwnerCode(newSubSubName)} className="w-32 font-mono" />
            <Select value={newSubSubParent} onValueChange={setNewSubSubParent}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Parent Sub" /></SelectTrigger>
              <SelectContent>
                {subs.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" size="sm"><Plus className="h-4 w-4" /></Button>
          </form>
          {!loading && (
            <div className="max-h-[200px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Owner Code</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead className="w-20 text-center">Active</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subsubs.map(r => {
                    const parent = subs.find(s => s.id === r.parent_subcontractor_id);
                    return (
                      <TableRow key={r.id}>
                        <TableCell><InlineNameEdit value={r.name} onSave={(v) => renameMaster(r, v)} /></TableCell>
                        <TableCell className="font-mono text-xs"><InlineNameEdit value={r.owner_code ?? suggestOwnerCode(r.name)} onSave={(v) => updateOwnerCode(r, v)} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{parent?.name ?? '—'}</TableCell>
                        <TableCell className="text-center">
                          <Switch checked={r.is_active} onCheckedChange={() => startToggleActive(r)} />
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => remove(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {subsubs.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-3">No Sub-Subs yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

    <AlertDialog open={!!pendingToggle} onOpenChange={(open) => !open && setPendingToggle(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate {pendingToggle?.row.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingToggle?.linkedCount
              ? `${pendingToggle.linkedCount} linked user(s) found. Do you also want to deactivate them?`
              : 'No linked users found. Proceed with deactivation?'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {(pendingToggle?.linkedCount ?? 0) > 0 && (
            <Button variant="outline" onClick={() => confirmToggle(false)}>Master Only</Button>
          )}
          <AlertDialogAction onClick={() => confirmToggle(true)}>
            {(pendingToggle?.linkedCount ?? 0) > 0 ? 'Deactivate All' : 'Deactivate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function MasterTable({ table, title }: { table: 'hdec_pic_master'; title: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from(table).select('*').order('name');
    if (data) setRows(data as MasterRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [table]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const name = newName.trim();
    const { error } = await supabase.from(table).insert({ name });
    if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
    if (table === 'hdec_pic_master') {
      const { error: fnErr } = await supabase.functions.invoke('auto-create-master-user', {
        body: { name, master_type: 'hdec_pic', hdec_pic_name: name },
      });
      if (fnErr) toast({ title: 'Added (user creation failed)', description: fnErr.message, variant: 'destructive' });
      else toast({ title: 'Added', description: `User account created (PW: ${DEFAULT_PASSWORD})` });
    } else {
      toast({ title: 'Added' });
    }
    setNewName(''); load();
  };

  const [pendingToggle, setPendingToggle] = useState<{ row: MasterRow; linkedCount: number } | null>(null);

  const startToggleActive = async (r: MasterRow) => {
    if (r.is_active) {
      // Deactivating — check linked users
      if (table === 'hdec_pic_master') {
        const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('hdec_pic_name', r.name).eq('is_active', true);
        setPendingToggle({ row: r, linkedCount: count ?? 0 });
      } else {
        // Just deactivate master directly
        await (supabase.from(table) as any).update({ is_active: false }).eq('id', r.id);
        toast({ title: 'Deactivated' });
        load();
      }
    } else {
      await (supabase.from(table) as any).update({ is_active: true }).eq('id', r.id);
      toast({ title: 'Activated' });
      load();
    }
  };

  const confirmToggle = async (cascade: boolean) => {
    if (!pendingToggle) return;
    const r = pendingToggle.row;
    const { error } = await (supabase.from(table) as any).update({ is_active: false }).eq('id', r.id);
    if (error) {
      toast({ title: 'Failed to deactivate', description: error.message, variant: 'destructive' });
      setPendingToggle(null);
      return;
    }
    if (cascade && table === 'hdec_pic_master') {
      const { data: linked, error: cascadeErr } = await supabase
        .from('profiles')
        .update({ is_active: false } as any)
        .eq('hdec_pic_name', r.name)
        .select('id');
      if (cascadeErr) {
        toast({ title: 'Master deactivated, but cascade failed', description: cascadeErr.message, variant: 'destructive' });
      } else {
        toast({ title: 'Deactivated', description: `${linked?.length ?? 0} linked user(s) also deactivated` });
      }
    } else {
      toast({ title: 'Deactivated', description: 'Linked users were NOT affected' });
    }
    setPendingToggle(null);
    load();
  };

  const renameRow = async (r: MasterRow, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === r.name) return;
    const { error } = await supabase.from(table).update({ name: trimmed }).eq('id', r.id);
    if (error) { toast({ title: 'Rename failed', description: error.message, variant: 'destructive' }); return; }
    if (table === 'hdec_pic_master') {
      await supabase.from('subtests').update({ hdec_pic_name: trimmed } as any).eq('hdec_pic_name', r.name);
      await supabase.from('profiles').update({ hdec_pic_name: trimmed } as any).eq('hdec_pic_name', r.name);
    }
    toast({ title: 'Renamed', description: 'Linked records updated' });
    load();
  };

  const remove = async (r: MasterRow) => {
    if (table === 'hdec_pic_master') {
      const [{ count: subtestCount }, { count: profileCount }] = await Promise.all([
        supabase.from('subtests').select('id', { count: 'exact', head: true }).eq('hdec_pic_name', r.name),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('hdec_pic_name', r.name),
      ]);
      const refs: string[] = [];
      if (subtestCount) refs.push(`${subtestCount} subtest(s)`);
      if (profileCount) refs.push(`${profileCount} user profile(s)`);
      if (refs.length > 0) {
        toast({
          title: 'Cannot delete — references exist',
          description: `Linked: ${refs.join(', ')}. Deactivate instead.`,
          variant: 'destructive',
        });
        return;
      }
    }
    if (!confirm(`Permanently delete "${r.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from(table).delete().eq('id', r.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Deleted permanently' }); load(); }
  };

  return (
    <>
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={add} className="flex gap-2">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add new name..." />
          <Button type="submit" size="sm"><Plus className="h-4 w-4" /></Button>
        </form>
        {loading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-20 text-center">Active</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell><InlineNameEdit value={r.name} onSave={(v) => renameRow(r, v)} /></TableCell>
                    <TableCell className="text-center">
                      <Switch checked={r.is_active} onCheckedChange={() => startToggleActive(r)} />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => remove(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>

    <AlertDialog open={!!pendingToggle} onOpenChange={(open) => !open && setPendingToggle(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate {pendingToggle?.row.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingToggle?.linkedCount
              ? `${pendingToggle.linkedCount} linked user(s) found. Do you also want to deactivate them?`
              : 'No linked users found. Proceed with deactivation?'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {(pendingToggle?.linkedCount ?? 0) > 0 && (
            <Button variant="outline" onClick={() => confirmToggle(false)}>Master Only</Button>
          )}
          <AlertDialogAction onClick={() => confirmToggle(true)}>
            {(pendingToggle?.linkedCount ?? 0) > 0 ? 'Deactivate All' : 'Deactivate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

/* ═══════ Tab 2: Systems ═══════ */
function SystemsTab() {
  const { toast } = useToast();
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<SystemRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('system_master').select('id, project_id, system_code, system_name_std, discipline, is_active, is_auto_created, requires_admin_review').order('system_code');
    if (data) setSystems(data as SystemRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleActive = async (s: SystemRow) => {
    await supabase.from('system_master').update({ is_active: !s.is_active }).eq('id', s.id);
    toast({ title: `System ${s.is_active ? 'deactivated' : 'activated'}` });
    load();
  };

  const approveReview = async (s: SystemRow) => {
    await supabase.from('system_master').update({ requires_admin_review: false }).eq('id', s.id);
    toast({ title: 'System approved' });
    load();
  };

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">System Master</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Discipline</TableHead>
                <TableHead>Auto-Created</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-16">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {systems.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.system_code}</TableCell>
                  <TableCell>{s.system_name_std ?? '—'}</TableCell>
                  <TableCell>{s.discipline ?? '—'}</TableCell>
                  <TableCell>{s.is_auto_created ? <Badge variant="secondary">Auto</Badge> : '—'}</TableCell>
                  <TableCell>
                    {s.requires_admin_review ? (
                      <Button size="sm" variant="outline" onClick={() => approveReview(s)}>Approve</Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">OK</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} />
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setEditTarget(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {editTarget && (
        <EditSystemDialog
          system={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
    </Card>
  );
}

function EditSystemDialog({ system, onClose, onSaved }: { system: SystemRow; onClose: () => void; onSaved: () => void; }) {
  const { toast } = useToast();
  const [code, setCode] = useState(system.system_code);
  const [name, setName] = useState(system.system_name_std ?? '');
  const [discipline, setDiscipline] = useState(system.discipline ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast({ title: 'Code is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // 1) Duplicate check (exclude self)
      const { data: dup, error: dupErr } = await supabase
        .from('system_master')
        .select('id')
        .eq('system_code', trimmed)
        .neq('id', system.id)
        .maybeSingle();
      if (dupErr) throw dupErr;
      if (dup) {
        toast({ title: 'Duplicate code', description: `System code "${trimmed}" already exists.`, variant: 'destructive' });
        setSaving(false);
        return;
      }

      // 2) If code changed → preserve old code as alias for import compatibility
      if (trimmed !== system.system_code) {
        const { data: existingAlias } = await supabase
          .from('system_alias_map')
          .select('id')
          .eq('project_id', system.project_id)
          .eq('system_id', system.id)
          .eq('alias_name', system.system_code)
          .maybeSingle();
        if (!existingAlias) {
          await supabase.from('system_alias_map').insert({
            project_id: system.project_id,
            system_id: system.id,
            alias_name: system.system_code,
            is_active: true,
          });
        }
      }

      // 3) Update system_master
      const { error: updErr } = await supabase
        .from('system_master')
        .update({
          system_code: trimmed,
          system_name_std: name.trim() || null,
          discipline: discipline.trim() || null,
        })
        .eq('id', system.id);
      if (updErr) throw updErr;

      toast({ title: 'System updated', description: trimmed !== system.system_code ? `Old code "${system.system_code}" preserved as alias.` : undefined });
      onSaved();
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit System</DialogTitle>
          <DialogDescription>
            Changing the code updates all linked subtests automatically. The old code is preserved as an import alias.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Code *</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Discipline</Label>
            <Input value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════ Tab 3: Permissions ═══════ */
function PermissionsTab() {
  const { toast } = useToast();
  const [perms, setPerms] = useState<PermRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [systems, setSystems] = useState<{ id: string; system_code: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [permRes, profRes, sysRes] = await Promise.all([
      supabase.from('user_system_permissions').select('*'),
      supabase.from('profiles').select('*').eq('is_active', true),
      supabase.from('system_master').select('id, system_code').eq('is_active', true).order('system_code'),
    ]);
    if (permRes.data) setPerms(permRes.data as PermRow[]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    if (sysRes.data) setSystems(sysRes.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const togglePerm = async (perm: PermRow, field: 'can_view'|'can_edit'|'can_import'|'can_export'|'can_create_key') => {
    const update = { can_view: perm.can_view, can_edit: perm.can_edit, can_import: perm.can_import, can_export: perm.can_export, can_create_key: perm.can_create_key };
    update[field] = !perm[field];
    await supabase.from('user_system_permissions').update(update).eq('id', perm.id);
    toast({ title: 'Permission updated' });
    load();
  };

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">User-System Permissions</CardTitle></CardHeader>
      <CardContent>
        {perms.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No permissions configured</p>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead className="text-center">View</TableHead>
                  <TableHead className="text-center">Edit</TableHead>
                  <TableHead className="text-center">Import</TableHead>
                  <TableHead className="text-center">Export</TableHead>
                  <TableHead className="text-center">Create Key</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perms.map(perm => {
                  const prof = profiles.find(p => p.user_id === perm.user_id);
                  const sys = systems.find(s => s.id === perm.system_id);
                  return (
                    <TableRow key={perm.id}>
                      <TableCell>{prof?.login_id ?? prof?.name ?? perm.user_id.slice(0, 8)}</TableCell>
                      <TableCell>{sys?.system_code ?? '—'}</TableCell>
                      {(['can_view', 'can_edit', 'can_import', 'can_export', 'can_create_key'] as const).map(f => (
                        <TableCell key={f} className="text-center">
                          <Checkbox checked={perm[f]} onCheckedChange={() => togglePerm(perm, f)} />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════ Tab 4: Field Config ═══════ */
function FieldConfigTab() {
  const [scope, setScope] = useState<'tc' | 'defect'>('tc');

  return (
    <Tabs value={scope} onValueChange={(value) => setScope(value as 'tc' | 'defect')}>
      <TabsList><TabsTrigger value="tc">T&C Fields</TabsTrigger><TabsTrigger value="defect">Defect Fields</TabsTrigger></TabsList>
      <TabsContent value="tc"><FieldConfigTable table="field_config" title="T&C Field Configuration" /></TabsContent>
      <TabsContent value="defect"><FieldConfigTable table="defect_field_config" title="Defect Field Configuration" showOrigin /></TabsContent>
    </Tabs>
  );
}

function FieldConfigTable({ table, title, showOrigin = false }: { table: 'field_config' | 'defect_field_config'; title: string; showOrigin?: boolean }) {
  const { toast } = useToast();
  const [fields, setFields] = useState<FieldCfg[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from(table).select('*').order('sort_order');
    if (data) {
      let rows = data as FieldCfg[];
      // Normalize sort_order if all zero (initial seed) so swap works predictably.
      const allZero = rows.every(r => (r.sort_order ?? 0) === 0);
      if (allZero && rows.length > 0) {
        await Promise.all(
          rows.map((r, idx) =>
            (supabase as any).from(table).update({ sort_order: (idx + 1) * 10 }).eq('id', r.id)
          )
        );
        rows = rows.map((r, idx) => ({ ...r, sort_order: (idx + 1) * 10 }));
      }
      setFields(rows);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [table]);

  const toggle = async (f: FieldCfg, key: 'is_enabled' | 'is_required') => {
    const update = { is_enabled: f.is_enabled, is_required: f.is_required };
    update[key] = !f[key];
    await (supabase as any).from(table).update(update).eq('id', f.id);
    toast({ title: 'Field updated' });
    load();
  };

  const updateName = async (f: FieldCfg, displayName: string) => {
    const value = displayName.trim();
    if (!value || value === f.display_name) return;
    await (supabase as any).from(table).update({ display_name: value }).eq('id', f.id);
    toast({ title: 'Display name updated' });
    load();
  };

  const toggleRole = async (f: FieldCfg, key: 'visible_to_roles' | 'editable_to_roles', role: AppRole) => {
    const current = new Set(f[key] ?? []);
    current.has(role) ? current.delete(role) : current.add(role);
    await (supabase as any).from(table).update({ [key]: [...current] }).eq('id', f.id);
    toast({ title: 'Role settings updated' });
    load();
  };

  const move = async (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= fields.length) return;

    // Reorder array, then re-normalize ALL sort_order values to (idx+1)*10.
    // This avoids issues with duplicate or zero sort_order values that would
    // make a simple swap a no-op (e.g. last row not moving when its sort_order
    // ties with a neighbor).
    const reordered = [...fields];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const normalized = reordered.map((r, idx) => ({ ...r, sort_order: (idx + 1) * 10 }));

    setFields(normalized); // optimistic

    // Persist only rows whose sort_order actually changed.
    const changed = normalized.filter((r) => {
      const prev = fields.find((f) => f.id === r.id);
      return !prev || prev.sort_order !== r.sort_order;
    });
    const results = await Promise.all(
      changed.map((r) =>
        (supabase as any).from(table).update({ sort_order: r.sort_order }).eq('id', r.id)
      )
    );
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) {
      toast({ title: 'Reorder failed', description: firstError.message, variant: 'destructive' });
      load();
    }
  };

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          The "Visible" toggle controls whether the field is shown in UI surfaces. Underlying data is always saved regardless of this setting.
        </p>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Order</TableHead>
                <TableHead>Field Name</TableHead>
                <TableHead>Display Name</TableHead>
                {showOrigin && <TableHead>Origin</TableHead>}
                <TableHead className="text-center">Visible</TableHead>
                <TableHead className="text-center">Required</TableHead>
                <TableHead>Visible Roles</TableHead>
                <TableHead>Editable Roles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((f, idx) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === 0}
                        onClick={() => move(idx, 'up')}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={idx === fields.length - 1}
                        onClick={() => move(idx, 'down')}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">{f.sort_order}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{f.field_name}</TableCell>
                  <TableCell><Input className="h-8 min-w-[180px]" defaultValue={f.display_name} onBlur={(e) => updateName(f, e.target.value)} /></TableCell>
                  {showOrigin && <TableCell className="text-xs text-muted-foreground">{f.source_origin ?? 'system'}{f.original_header ? ` · ${f.original_header}` : ''}</TableCell>}
                  <TableCell className="text-center">
                    <Switch checked={f.is_enabled} onCheckedChange={() => toggle(f, 'is_enabled')} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={f.is_required} onCheckedChange={() => toggle(f, 'is_required')} />
                  </TableCell>
                  <TableCell><RoleChecks field={f} fieldKey="visible_to_roles" onToggle={toggleRole} /></TableCell>
                  <TableCell><RoleChecks field={f} fieldKey="editable_to_roles" onToggle={toggleRole} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleChecks({ field, fieldKey, onToggle }: { field: FieldCfg; fieldKey: 'visible_to_roles' | 'editable_to_roles'; onToggle: (field: FieldCfg, key: 'visible_to_roles' | 'editable_to_roles', role: AppRole) => void }) {
  const selected = new Set(field[fieldKey] ?? []);
  return (
    <div className="grid min-w-[220px] grid-cols-2 gap-1">
      {ALL_ROLES.map((role) => (
        <label key={role} className="flex items-center gap-1 text-xs text-muted-foreground">
          <Checkbox checked={selected.has(role)} onCheckedChange={() => onToggle(field, fieldKey, role)} />
          {ROLE_LABELS[role]}
        </label>
      ))}
    </div>
  );
}

/* ═══════ Tab 5: Audit Logs ═══════ */
function AuditTab() {
  const [logs, setLogs] = useState<ChangeLogRow[]>([]);
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<'changes' | 'uploads'>('changes');

  useEffect(() => {
    async function load() {
      const [logRes, upRes] = await Promise.all([
        supabase.from('subtest_change_log').select('*').order('changed_at', { ascending: false }).limit(200),
        supabase.from('upload_batches').select('*').order('uploaded_at', { ascending: false }).limit(100),
      ]);
      if (logRes.data) setLogs(logRes.data as ChangeLogRow[]);
      if (upRes.data) setUploads(upRes.data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        <CardTitle className="text-base">Audit Logs</CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant={subTab === 'changes' ? 'default' : 'outline'} onClick={() => setSubTab('changes')}>
            Change Log
          </Button>
          <Button size="sm" variant={subTab === 'uploads' ? 'default' : 'outline'} onClick={() => setSubTab('uploads')}>
            Uploads
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {subTab === 'changes' ? (
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Old</TableHead>
                  <TableHead>New</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTimeDdMmmYyyy(l.changed_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{l.changed_field}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">{l.old_value ?? '—'}</TableCell>
                    <TableCell className="max-w-[120px] truncate text-xs">{l.new_value ?? '—'}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{l.change_source ?? '—'}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Success</TableHead>
                  <TableHead>Skipped</TableHead>
                  <TableHead>Rejected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTimeDdMmmYyyy(u.uploaded_at)}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-xs">{u.uploaded_file_name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{u.import_type ?? '—'}</Badge></TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{u.status}</Badge></TableCell>
                    <TableCell className="text-xs">{u.total_rows ?? 0}</TableCell>
                    <TableCell className="text-xs">{u.success_rows ?? 0}</TableCell>
                    <TableCell className="text-xs">{u.skipped_rows ?? 0}</TableCell>
                    <TableCell className="text-xs">{u.rejected_rows ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Inline editable name field ───── */
function InlineNameEdit({ value, onSave }: { value: string; onSave: (v: string) => void | Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-left hover:underline"
      >
        {value}
      </button>
    );
  }
  const commit = async () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) await onSave(draft.trim());
  };
  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { setDraft(value); setEditing(false); }
      }}
      className="h-7 text-sm"
    />
  );
}

/* ═══════ Tab: Backup & Restore ═══════ */
function BackupTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [note, setNote] = useState('');
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('database_snapshots' as any)
      .select('id, snapshot_name, snapshot_date, row_count, created_at, note, snapshot_type')
      .order('created_at', { ascending: false });
    setSnapshots(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fetchAllSubtests = async () => {
    const allRows: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase.from('subtests')
        .select('*')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allRows;
  };

  const createSnapshot = async () => {
    setSaving(true);
    try {
      const allRows = await fetchAllSubtests();
      const name = new Date().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const { error } = await supabase.from('database_snapshots' as any).insert({
        snapshot_name: name,
        snapshot_data: allRows,
        row_count: allRows.length,
        created_by: user?.id,
        note: note || null,
        snapshot_type: 'manual',
      });
      if (error) throw error;
      toast({ title: 'Snapshot created', description: `${allRows.length} rows saved` });
      setNote('');
      load();
    } catch (e: any) {
      toast({ title: 'Failed to create snapshot', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const restoreSnapshot = async (id: string) => {
    setRestoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('restore-snapshot', {
        body: { snapshot_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Restore complete', description: `${data.restored} rows restored` });
    } catch (e: any) {
      toast({ title: 'Restore failed', description: e.message, variant: 'destructive' });
    }
    setRestoring(false);
    setConfirmRestore(null);
  };

  const deleteSnapshot = async (id: string) => {
    const { error } = await supabase.from('database_snapshots' as any).delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Snapshot deleted' });
      load();
    }
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-sm text-muted-foreground">Note (optional)</label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Before weekly import" />
            </div>
            <Button onClick={createSnapshot} disabled={saving || restoring}>
              {saving ? 'Saving...' : 'Save Current Data'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Saves all subtests data as a snapshot. You can restore it later to rollback changes.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved Snapshots</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No snapshots yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{formatDateTimeDdMmmYyyy(s.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={s.snapshot_type === 'auto' ? 'secondary' : 'outline'} className="text-xs">
                        {s.snapshot_type === 'auto' ? 'Auto' : 'Manual'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{s.snapshot_name}</TableCell>
                    <TableCell className="text-right text-sm">{s.row_count?.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{s.note || '—'}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => setConfirmRestore(s.id)} disabled={restoring}>
                        Restore
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(s.id)} disabled={restoring}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmRestore} onOpenChange={() => setConfirmRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              This will DELETE all current subtests data and replace it with the snapshot.
              This action cannot be undone. Upload logs and change history will remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRestore && restoreSnapshot(confirmRestore)}>
              {restoring ? 'Restoring...' : 'Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Snapshot?</AlertDialogTitle>
            <AlertDialogDescription>This snapshot will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && deleteSnapshot(confirmDelete)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
