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
import EventLogTab from './admin/EventLogTab';
import { ModuleControlTab } from './admin/ModuleControlTab';
import HeaderMappingsTab from './admin/HeaderMappingsTab';
import CustomFieldsTab from './admin/CustomFieldsTab';

import { loadHeaderMappingsCache } from '@/lib/header-mappings-cache';
import { invalidateAdminRolesCache } from '@/lib/admin-roles-cache';
import { UnmappedAliasQueue } from '@/components/admin/UnmappedAliasQueue';
import { ChevronDown, ChevronRight, Search, AlertTriangle } from 'lucide-react';

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
          <TabsTrigger value="modules">Module Control</TabsTrigger>
          <TabsTrigger value="mappings">Header Mappings</TabsTrigger>
          <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="backup">Backup & Restore</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="events">Event Log</TabsTrigger>
        </TabsList>

        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="masters"><MastersTab /></TabsContent>
        <TabsContent value="systems"><SystemsTab /></TabsContent>
        <TabsContent value="permissions"><PermissionsTab /></TabsContent>
        <TabsContent value="fields"><FieldConfigTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
        <TabsContent value="modules"><ModuleControlTab /></TabsContent>
        <TabsContent value="mappings"><HeaderMappingsTab /></TabsContent>
        <TabsContent value="custom-fields"><CustomFieldsTab /></TabsContent>
        <TabsContent value="backup"><BackupTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
        <TabsContent value="events"><EventLogTab /></TabsContent>
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

        <div className="space-y-2 border-t pt-4">
          <Label>HDEC Priority Verification Backfill</Label>
          <p className="text-xs text-muted-foreground">
            Re-runs the HDEC Priority Verification engine across existing defect rows. Sets
            HDEC's Verification / HDEC's Reason for eligible Cat A rows (not Closed and not Done),
            and clears those fields for rows whose priority is no longer Cat A. Safe to run repeatedly.
          </p>
          <PriorityVerificationBackfillButton />
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityVerificationBackfillButton() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const run = async () => {
    setRunning(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('defect-priority-verification-backfill', { body: {} });
      if (error) throw error;
      const summary = `Set: ${data?.set ?? 0} · Cleared: ${data?.cleared ?? 0} · No match: ${data?.no_match ?? 0} · Skipped: ${data?.skipped ?? 0} · Scanned: ${data?.eligible_scanned ?? 0}`;
      setLastResult(summary);
      toast({ title: 'Backfill completed', description: summary });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Backfill failed';
      toast({ title: 'Backfill failed', description: msg, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="space-y-2">
      <Button onClick={run} disabled={running} variant="secondary">
        {running ? 'Running…' : 'Run Backfill'}
      </Button>
      {lastResult && <p className="text-xs text-muted-foreground">Last run — {lastResult}</p>}
    </div>
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
    invalidateAdminRolesCache();
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
    } else if (userType === 'guest') {
      payloadSubconName = subconName.trim() || null;
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
        {userType === 'guest' && (
          <div className="space-y-1.5">
            <Label htmlFor="guest-org">Organisation (optional)</Label>
            <Input id="guest-org" value={subconName} onChange={(e) => setSubconName(e.target.value)} placeholder="e.g. Client team, Inspector firm" />
          </div>
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
    let payloadHdecEngName: string | null = null;

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
      payloadHdecEngName = hdecEngName || null;
    } else if (userType === 'guest') {
      payloadSubconName = subconName.trim() || null;
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
        hdec_eng_name: payloadHdecEngName,
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
          {userType === 'guest' && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-guest-org">Organisation (optional)</Label>
              <Input id="edit-guest-org" value={subconName} onChange={(e) => setSubconName(e.target.value)} placeholder="e.g. Client team, Inspector firm" />
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
      const [{ data: subs }, { data: pics }, { data: engs }, { data: profiles }] = await Promise.all([
        supabase.from('subcontractor_master').select('id, name, type, parent_subcontractor_id, is_active').eq('is_active', true),
        supabase.from('hdec_pic_master').select('id, name, is_active').eq('is_active', true),
        supabase.from('hdec_eng_master').select('id, name, is_active').eq('is_active', true),
        supabase.from('profiles').select('subcontractor_name, subsub_name, hdec_pic_name, hdec_eng_name'),
      ]);
      const subProfiles = new Set((profiles || []).map(p => (p.subcontractor_name || '').toLowerCase().trim()).filter(Boolean));
      const subsubProfiles = new Set((profiles || []).map(p => (p.subsub_name || '').toLowerCase().trim()).filter(Boolean));
      const picProfiles = new Set((profiles || []).map(p => (p.hdec_pic_name || '').toLowerCase().trim()).filter(Boolean));
      const engProfiles = new Set((profiles || []).map(p => ((p as any).hdec_eng_name || '').toLowerCase().trim()).filter(Boolean));
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
      for (const e of engs || []) {
        const key = e.name.toLowerCase().trim();
        if (engProfiles.has(key)) { skipped++; continue; }
        const { error } = await supabase.functions.invoke('auto-create-master-user', {
          body: { name: e.name, master_type: 'hdec_eng', hdec_eng_name: e.name },
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
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SubcontractorMasterTable />
        </div>
        <div className="space-y-4">
          <MasterTable table="hdec_pic_master" title="HDEC PIC Master" />
          <MasterTable table="hdec_eng_master" title="HDEC ENG Master" />
        </div>
      </div>
    </div>
  );
}

interface OrgAliasRow { id: string; raw_label: string; subcontractor_id: string | null; is_active: boolean; }

function SubcontractorMasterTable() {
  const { toast } = useToast();
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [aliases, setAliases] = useState<OrgAliasRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSubName, setNewSubName] = useState('');
  const [newSubOwnerCode, setNewSubOwnerCode] = useState('');
  // Inline Sub-Sub creation under expanded parent row
  const [subSubDraft, setSubSubDraft] = useState<Record<string, { name: string; owner: string }>>({});
  // Inline alias add per row
  const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({});
  // Toolbar
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'sub' | 'subsub'>('all');
  const [showInactive, setShowInactive] = useState(false);
  // Expanded row ids
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    const [{ data }, aliasRes] = await Promise.all([
      supabase.from('subcontractor_master').select('*').order('name'),
      (supabase as any).from('docs_org_alias').select('*').order('raw_label'),
    ]);
    if (data) setRows(data as MasterRow[]);
    if (aliasRes.data) setAliases(aliasRes.data as OrgAliasRow[]);
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

  const addSubSubInline = async (parentId: string) => {
    const draft = subSubDraft[parentId];
    if (!draft || !draft.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    const name = draft.name.trim();
    const parentName = rows.find(s => s.id === parentId)?.name ?? null;
    const owner_code = normalizeOwnerCode(draft.owner) ?? suggestOwnerCode(name);
    const { error } = await supabase.from('subcontractor_master').insert({
      name, type: 'subsub', parent_subcontractor_id: parentId, owner_code,
    } as any);
    if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
    const { error: fnErr } = await supabase.functions.invoke('auto-create-master-user', {
      body: { name, master_type: 'subsub', subcontractor_name: parentName, subsub_name: name },
    });
    if (fnErr) toast({ title: 'Added (user creation failed)', description: fnErr.message, variant: 'destructive' });
    else toast({ title: 'Sub-Sub added', description: `User account created (PW: ${DEFAULT_PASSWORD})` });
    setSubSubDraft(prev => ({ ...prev, [parentId]: { name: '', owner: '' } }));
    load();
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

  const aliasesByMasterAll = aliases.filter(a => a.is_active && a.subcontractor_id);
  const unmappedAliases = aliases.filter(a => a.is_active && !a.subcontractor_id);
  const aliasesFor = (masterId: string) => aliasesByMasterAll.filter(a => a.subcontractor_id === masterId);

  const addAliasInline = async (master: MasterRow) => {
    const raw = (aliasDraft[master.id] ?? '').trim();
    if (!raw) return;
    const { error } = await (supabase as any)
      .from('docs_org_alias')
      .upsert(
        { raw_label: raw, subcontractor_id: master.id, is_active: true },
        { onConflict: 'raw_label' },
      );
    if (error) { toast({ title: 'Add alias failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Alias added', description: `"${raw}" → ${master.name}` });
    setAliasDraft(prev => ({ ...prev, [master.id]: '' }));
    load();
  };

  const removeAlias = async (id: string) => {
    const { error } = await (supabase as any).from('docs_org_alias').delete().eq('id', id);
    if (error) { toast({ title: 'Remove failed', description: error.message, variant: 'destructive' }); return; }
    load();
  };

  // ── Derived ──
  const norm = (s: string) => s.toLowerCase().trim();
  const q = norm(search);

  const allSubs = rows.filter(r => (r.type ?? 'sub') === 'sub');
  const allSubsubs = rows.filter(r => r.type === 'subsub');

  const matchesQuery = (r: MasterRow) => {
    if (!q) return true;
    if (norm(r.name).includes(q)) return true;
    if (r.owner_code && norm(r.owner_code).includes(q)) return true;
    if (aliasesFor(r.id).some(a => norm(a.raw_label).includes(q))) return true;
    return false;
  };

  const visibleSubs = allSubs
    .filter(r => showInactive || r.is_active)
    .filter(r => typeFilter !== 'subsub')
    .filter(r => matchesQuery(r) || allSubsubs.some(ss => ss.parent_subcontractor_id === r.id && matchesQuery(ss)));

  const isExpanded = (id: string) => expanded.has(id) || (q.length > 0 && (
    allSubsubs.some(ss => ss.parent_subcontractor_id === id && matchesQuery(ss))
    || aliasesFor(id).some(a => norm(a.raw_label).includes(q))
  ));

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const subsubsFor = (parentId: string) => {
    if (typeFilter === 'sub') return [];
    return allSubsubs.filter(ss => ss.parent_subcontractor_id === parentId && (showInactive || ss.is_active));
  };

  const scrollToUnmapped = () => {
    const el = document.getElementById('unmapped-aliases-anchor');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Subcontractor Master</CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {allSubs.length} subs · {allSubsubs.length} sub-subs
              </Badge>
            </div>
            {unmappedAliases.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={scrollToUnmapped}
                className="gap-1 border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                {unmappedAliases.length} unmapped · Resolve
              </Button>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, owner code, or alias..."
                className="h-8 pl-7 text-xs"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="sub">Subs only</SelectItem>
                <SelectItem value="subsub">Sub-Subs only</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox checked={showInactive} onCheckedChange={(v) => setShowInactive(!!v)} />
              Show inactive
            </label>
          </div>

          {/* Add Subcontractor */}
          <form onSubmit={addSub} className="flex gap-2">
            <Input value={newSubName} onChange={(e) => setNewSubName(e.target.value)} placeholder="New Subcontractor name..." className="h-8 text-xs" />
            <Input value={newSubOwnerCode} onChange={(e) => setNewSubOwnerCode(e.target.value)} placeholder={suggestOwnerCode(newSubName) || 'OWN'} className="h-8 w-28 font-mono text-xs" />
            <Button type="submit" size="sm" className="h-8 gap-1"><Plus className="h-3.5 w-3.5" />Add</Button>
          </form>
        </CardHeader>

        <CardContent className="pt-0">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
          ) : visibleSubs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {q ? `No matches for "${search}".` : 'No subcontractors yet — add your first one above.'}
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-28">Owner Code</TableHead>
                    <TableHead className="w-32 text-center">Aliases / Subs</TableHead>
                    <TableHead className="w-20 text-center">Active</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleSubs.map(r => {
                    const masterAliases = aliasesFor(r.id);
                    const children = subsubsFor(r.id);
                    const open = isExpanded(r.id);
                    const draft = subSubDraft[r.id] ?? { name: '', owner: '' };
                    const totalChildren = allSubsubs.filter(ss => ss.parent_subcontractor_id === r.id).length;
                    return (
                      <>
                        <TableRow key={r.id} className={open ? 'bg-muted/30' : ''}>
                          <TableCell className="p-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleExpanded(r.id)}>
                              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className={r.is_active ? '' : 'text-muted-foreground italic'}>
                            <InlineNameEdit value={r.name} onSave={(v) => renameMaster(r, v)} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            <InlineNameEdit value={r.owner_code ?? suggestOwnerCode(r.name)} onSave={(v) => updateOwnerCode(r, v)} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Badge variant="secondary" className="text-[10px]" title="Aconex aliases">
                                {masterAliases.length} alias
                              </Badge>
                              <Badge variant="outline" className="text-[10px]" title="Sub-Subs">
                                {totalChildren} sub
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch checked={r.is_active} onCheckedChange={() => startToggleActive(r)} />
                          </TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" onClick={() => remove(r)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        {open && (
                          <TableRow key={`${r.id}-detail`} className="bg-muted/10 hover:bg-muted/10">
                            <TableCell></TableCell>
                            <TableCell colSpan={5} className="space-y-3 py-3">
                              {/* Aconex Aliases */}
                              <div>
                                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Aconex Aliases
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {masterAliases.length === 0 && (
                                    <span className="text-xs italic text-muted-foreground">No aliases mapped yet.</span>
                                  )}
                                  {masterAliases.map(a => (
                                    <Badge key={a.id} variant="secondary" className="gap-1 font-mono text-[10px]">
                                      {a.raw_label}
                                      <button
                                        type="button"
                                        onClick={() => removeAlias(a.id)}
                                        className="ml-0.5 rounded px-0.5 hover:bg-destructive hover:text-destructive-foreground"
                                        aria-label={`Remove alias ${a.raw_label}`}
                                      >
                                        ×
                                      </button>
                                    </Badge>
                                  ))}
                                  <div className="flex items-center gap-1">
                                    <Input
                                      value={aliasDraft[r.id] ?? ''}
                                      onChange={(e) => setAliasDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAliasInline(r); } }}
                                      placeholder="Add alias..."
                                      className="h-7 w-40 text-xs"
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2"
                                      onClick={() => addAliasInline(r)}
                                      disabled={!(aliasDraft[r.id] ?? '').trim()}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              {/* Sub-Subs */}
                              <div>
                                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Sub-Subs (재하도)
                                </div>
                                {children.length > 0 && (
                                  <div className="mb-2 rounded border bg-background">
                                    <Table>
                                      <TableBody>
                                        {children.map(ss => (
                                          <TableRow key={ss.id}>
                                            <TableCell className="py-1.5">
                                              <InlineNameEdit value={ss.name} onSave={(v) => renameMaster(ss, v)} />
                                            </TableCell>
                                            <TableCell className="w-28 py-1.5 font-mono text-xs">
                                              <InlineNameEdit value={ss.owner_code ?? suggestOwnerCode(ss.name)} onSave={(v) => updateOwnerCode(ss, v)} />
                                            </TableCell>
                                            <TableCell className="w-20 py-1.5 text-center">
                                              <Switch checked={ss.is_active} onCheckedChange={() => startToggleActive(ss)} />
                                            </TableCell>
                                            <TableCell className="w-12 py-1.5">
                                              <Button size="icon" variant="ghost" onClick={() => remove(ss)}>
                                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                              </Button>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    value={draft.name}
                                    onChange={(e) => setSubSubDraft(prev => ({ ...prev, [r.id]: { ...draft, name: e.target.value } }))}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubSubInline(r.id); } }}
                                    placeholder="Add Sub-Sub name..."
                                    className="h-7 flex-1 text-xs"
                                  />
                                  <Input
                                    value={draft.owner}
                                    onChange={(e) => setSubSubDraft(prev => ({ ...prev, [r.id]: { ...draft, owner: e.target.value } }))}
                                    placeholder={suggestOwnerCode(draft.name) || 'OWN'}
                                    className="h-7 w-24 font-mono text-xs"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2"
                                    onClick={() => addSubSubInline(r.id)}
                                    disabled={!draft.name.trim()}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unmapped Aliases queue (only when there are items) */}
      <UnmappedAliasQueue aliases={unmappedAliases} subs={allSubs} onChanged={load} />

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
    </div>
  );
}

function MasterTable({ table, title }: { table: 'hdec_pic_master' | 'hdec_eng_master'; title: string }) {
  const profileField = table === 'hdec_pic_master' ? 'hdec_pic_name' : 'hdec_eng_name';
  const masterTypeKey = table === 'hdec_pic_master' ? 'hdec_pic' : 'hdec_eng';
  const updatesSubtests = table === 'hdec_pic_master'; // subtests has hdec_pic_name only
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
    if (table === 'hdec_pic_master' || table === 'hdec_eng_master') {
      const { error: fnErr } = await supabase.functions.invoke('auto-create-master-user', {
        body: { name, master_type: masterTypeKey, [profileField]: name },
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
      if (table === 'hdec_pic_master' || table === 'hdec_eng_master') {
        const { count } = await (supabase.from('profiles') as any).select('id', { count: 'exact', head: true }).ilike(profileField, r.name.replace(/[\\%_]/g, (c: string) => `\\${c}`)).eq('is_active', true);
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
    if (cascade && (table === 'hdec_pic_master' || table === 'hdec_eng_master')) {
      const { data: linked, error: cascadeErr } = await (supabase
        .from('profiles') as any)
        .update({ is_active: false })
        .ilike(profileField, r.name.replace(/[\\%_]/g, (c: string) => `\\${c}`))
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

  // Case-insensitive exact match for PostgREST ilike — escape wildcards
  const ciEq = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

  const renameRow = async (r: MasterRow, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === r.name) return;
    const { error } = await supabase.from(table).update({ name: trimmed }).eq('id', r.id);
    if (error) { toast({ title: 'Rename failed', description: error.message, variant: 'destructive' }); return; }
    if (table === 'hdec_pic_master' || table === 'hdec_eng_master') {
      if (updatesSubtests) {
        await supabase.from('subtests').update({ [profileField]: trimmed } as any).ilike(profileField, ciEq(r.name));
      }
      await supabase.from('defect_items').update({ [profileField]: trimmed } as any).ilike(profileField, ciEq(r.name));
      await (supabase.from('profiles') as any).update({ [profileField]: trimmed }).ilike(profileField, ciEq(r.name));
    }
    toast({ title: 'Renamed', description: 'Linked records updated' });
    load();
  };

  const remove = async (r: MasterRow) => {
    if (table === 'hdec_pic_master' || table === 'hdec_eng_master') {
      const escName = r.name.replace(/[\\%_]/g, (c: string) => `\\${c}`);
      const subtestQuery = updatesSubtests
        ? supabase.from('subtests').select('id', { count: 'exact', head: true }).ilike(profileField, escName)
        : Promise.resolve({ count: 0 } as any);
      const [{ count: subtestCount }, { count: profileCount }] = await Promise.all([
        subtestQuery,
        (supabase.from('profiles') as any).select('id', { count: 'exact', head: true }).ilike(profileField, escName),
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
  const [scope, setScope] = useState<'tc' | 'defect' | 'docs' | 'punch'>('tc');
  const [docsSub, setDocsSub] = useState<'as_built' | 'omm' | 'warranty' | 'spare_part'>('as_built');

  return (
    <Tabs value={scope} onValueChange={(value) => setScope(value as 'tc' | 'defect' | 'docs' | 'punch')}>
      <TabsList>
        <TabsTrigger value="tc">T&C Fields</TabsTrigger>
        <TabsTrigger value="defect">Defect Fields</TabsTrigger>
        <TabsTrigger value="docs">Docs Fields</TabsTrigger>
        <TabsTrigger value="punch">Punch Fields</TabsTrigger>
      </TabsList>
      <TabsContent value="tc"><FieldConfigTable table="field_config" title="T&C Field Configuration" /></TabsContent>
      <TabsContent value="defect"><FieldConfigTable table="defect_field_config" title="Defect Field Configuration" showOrigin /></TabsContent>
      <TabsContent value="punch"><FieldConfigTable table="punch_field_config" title="Punch Field Configuration" showOrigin /></TabsContent>
      <TabsContent value="docs">
        <Tabs value={docsSub} onValueChange={(v) => setDocsSub(v as typeof docsSub)} className="space-y-3">
          <TabsList>
            <TabsTrigger value="as_built">As-Built</TabsTrigger>
            <TabsTrigger value="omm">OMM</TabsTrigger>
            <TabsTrigger value="warranty">Warranty</TabsTrigger>
            <TabsTrigger value="spare_part">Spare Part</TabsTrigger>
          </TabsList>
          <TabsContent value="as_built"><FieldConfigTable table="docs_field_config" subModule="as_built" title="Docs / As-Built Field Configuration" showOrigin /></TabsContent>
          <TabsContent value="omm"><FieldConfigTable table="docs_field_config" subModule="omm" title="Docs / OMM Field Configuration" showOrigin /></TabsContent>
          <TabsContent value="warranty"><FieldConfigTable table="docs_field_config" subModule="warranty" title="Docs / Warranty Field Configuration" showOrigin /></TabsContent>
          <TabsContent value="spare_part"><FieldConfigTable table="docs_field_config" subModule="spare_part" title="Docs / Spare Part Field Configuration" showOrigin /></TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}

/** Map any legacy origin value to the canonical 3-value set. */
function normalizeOriginValue(value: string | null | undefined): 'hdec' | 'aconex' | 'system' {
  const v = String(value ?? '').toLowerCase();
  if (v === 'hdec' || v === 'hdec_added') return 'hdec';
  if (v === 'aconex' || v === 'll_original') return 'aconex';
  return 'system'; // covers 'system', 'derived', and unknown
}

function FieldConfigTable({ table, subModule, title, showOrigin = false }: { table: 'field_config' | 'defect_field_config' | 'docs_field_config' | 'punch_field_config'; subModule?: string; title: string; showOrigin?: boolean }) {
  const { toast } = useToast();
  const [fields, setFields] = useState<FieldCfg[]>([]);
  const [loading, setLoading] = useState(true);
  const [aliasCounts, setAliasCounts] = useState<Record<string, { total: number; active: number }>>({});
  const [pendingDisable, setPendingDisable] = useState<FieldCfg | null>(null);

  // Map field_config table -> Header Mappings module key.
  const moduleKey: 'tnc' | 'defect' | 'docs' | 'punch' =
    table === 'field_config' ? 'tnc' : table === 'defect_field_config' ? 'defect' : table === 'punch_field_config' ? 'punch' : 'docs';

  const loadAliasCounts = async () => {
    let q = (supabase as any)
      .from('import_header_mappings')
      .select('target_field, is_active')
      .eq('module', moduleKey);
    if (subModule) q = q.eq('sub_module', subModule);
    const { data } = await q;
    const counts: Record<string, { total: number; active: number }> = {};
    for (const r of (data ?? []) as Array<{ target_field: string; is_active: boolean }>) {
      const c = counts[r.target_field] ?? { total: 0, active: 0 };
      c.total += 1;
      if (r.is_active) c.active += 1;
      counts[r.target_field] = c;
    }
    setAliasCounts(counts);
  };

  const load = async () => {
    setLoading(true);
    let q = (supabase as any).from(table).select('*').order('sort_order');
    if (subModule && table === 'docs_field_config') q = q.eq('sub_module', subModule);
    const { data } = await q;
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
    await loadAliasCounts();
    setLoading(false);
  };
  useEffect(() => { load(); }, [table, subModule]);

  // Realtime: keep editor in sync when another admin edits the same field config.
  useEffect(() => {
    const channel = supabase
      .channel(`admin-field-config-${table}-${subModule ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, subModule]);

  /** Bump app_settings.header_mappings_version so other tabs/sessions reload parser cache. */
  const bumpHeaderMappingsVersion = async () => {
    const { data } = await (supabase as any)
      .from('app_settings')
      .select('value')
      .eq('key', 'header_mappings_version')
      .maybeSingle();
    const next = ((data?.value as number | null) ?? 0) + 1;
    await (supabase as any)
      .from('app_settings')
      .upsert({ key: 'header_mappings_version', value: next }, { onConflict: 'key' });
  };

  /** Disable all aliases pointing at `target_field` for this module. */
  const disableAliasesFor = async (fieldName: string): Promise<{ ok: boolean; affected: number; error?: string }> => {
    let sel = (supabase as any)
      .from('import_header_mappings')
      .select('id')
      .eq('module', moduleKey)
      .eq('target_field', fieldName)
      .eq('is_active', true);
    if (subModule) sel = sel.eq('sub_module', subModule);
    const { data: rows, error: selErr } = await sel;
    if (selErr) return { ok: false, affected: 0, error: selErr.message };
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) return { ok: true, affected: 0 };
    const { error: updErr } = await (supabase as any)
      .from('import_header_mappings')
      .update({ is_active: false })
      .in('id', ids);
    if (updErr) return { ok: false, affected: 0, error: updErr.message };
    return { ok: true, affected: ids.length };
  };

  const performToggle = async (f: FieldCfg, key: 'is_enabled' | 'is_required', cascade: boolean) => {
    const update = { is_enabled: f.is_enabled, is_required: f.is_required };
    update[key] = !f[key];
    const { error } = await (supabase as any).from(table).update(update).eq('id', f.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      load();
      return;
    }

    if (cascade && key === 'is_enabled' && !update.is_enabled) {
      // Cascade: disable all aliases pointing at this field.
      const result = await disableAliasesFor(f.field_name);
      if (!result.ok) {
        toast({
          title: 'Field disabled, but alias sync failed',
          description: result.error,
          variant: 'destructive',
        });
      } else {
        await bumpHeaderMappingsVersion();
        await loadHeaderMappingsCache(true).catch(() => {});
        toast({
          title: 'Field disabled',
          description: result.affected > 0
            ? `${result.affected} alias${result.affected === 1 ? '' : 'es'} also disabled in Header Mappings.`
            : 'No active aliases needed updating.',
        });
      }
    } else if (key === 'is_enabled' && update.is_enabled) {
      toast({
        title: 'Field enabled',
        description: 'Aliases were not auto-enabled. Re-enable them in Header Mappings if needed.',
      });
    } else {
      toast({ title: 'Field updated' });
    }
    load();
  };

  const toggle = async (f: FieldCfg, key: 'is_enabled' | 'is_required') => {
    // If turning Visible OFF and there are aliases, prompt confirmation.
    if (key === 'is_enabled' && f.is_enabled) {
      const c = aliasCounts[f.field_name];
      if (c && c.active > 0) {
        setPendingDisable(f);
        return;
      }
    }
    performToggle(f, key, false);
  };


  const updateName = async (f: FieldCfg, displayName: string) => {
    const value = displayName.trim();
    if (!value || value === f.display_name) return;
    await (supabase as any).from(table).update({ display_name: value }).eq('id', f.id);
    toast({ title: 'Display name updated' });
    load();
  };

  const updateOrigin = async (f: FieldCfg, origin: 'hdec' | 'aconex' | 'system') => {
    if (origin === f.source_origin) return;
    await (supabase as any).from(table).update({ source_origin: origin }).eq('id', f.id);
    toast({ title: 'Origin updated' });
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
                  <TableCell className="font-mono text-xs">
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      {f.field_name}
                      {f.field_name.startsWith('_meta_') && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">Virtual</span>
                      )}
                      {(() => {
                        const c = aliasCounts[f.field_name];
                        if (!c || c.total === 0) return null;
                        return (
                          <span
                            className="rounded border px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-muted-foreground"
                            title={`${c.active} active / ${c.total} total alias${c.total === 1 ? '' : 'es'} in Header Mappings`}
                          >
                            {c.active}/{c.total} alias{c.total === 1 ? '' : 'es'}
                          </span>
                        );
                      })()}
                    </span>
                  </TableCell>
                  <TableCell><Input className="h-8 min-w-[180px]" defaultValue={f.display_name} onBlur={(e) => updateName(f, e.target.value)} /></TableCell>
                  {showOrigin && (
                    <TableCell className="text-xs">
                      <Select
                        value={normalizeOriginValue(f.source_origin)}
                        onValueChange={(v) => updateOrigin(f, v as 'hdec' | 'aconex' | 'system')}
                      >
                        <SelectTrigger className="h-8 w-[110px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hdec">HDEC</SelectItem>
                          <SelectItem value="aconex">Aconex</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                      {f.original_header && (
                        <div className="mt-1 text-[10px] text-muted-foreground truncate max-w-[140px]" title={f.original_header}>
                          {f.original_header}
                        </div>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-center">
                    <Switch checked={f.is_enabled} onCheckedChange={() => toggle(f, 'is_enabled')} />
                  </TableCell>
                  <TableCell className="text-center">
                    {f.field_name.startsWith('_meta_') ? (
                      <span className="text-[10px] text-muted-foreground italic" title="Virtual columns cannot be required">N/A</span>
                    ) : (
                      <Switch checked={f.is_required} onCheckedChange={() => toggle(f, 'is_required')} />
                    )}
                  </TableCell>
                  <TableCell><RoleChecks field={f} fieldKey="visible_to_roles" onToggle={toggleRole} /></TableCell>
                  <TableCell><RoleChecks field={f} fieldKey="editable_to_roles" onToggle={toggleRole} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <AlertDialog open={!!pendingDisable} onOpenChange={(v) => !v && setPendingDisable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable field and its aliases?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDisable && (() => {
                const c = aliasCounts[pendingDisable.field_name];
                const n = c?.active ?? 0;
                return (
                  <>
                    Disabling <span className="font-mono">{pendingDisable.field_name}</span> will hide its column in Raw Data / List / Detail UI.
                    {' '}It will also disable <strong>{n} active alias{n === 1 ? '' : 'es'}</strong> in Header Mappings,
                    so those headers will be ignored on future imports. Continue?
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDisable) {
                  const target = pendingDisable;
                  setPendingDisable(null);
                  performToggle(target, 'is_enabled', true);
                }
              }}
            >
              Disable both
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
type BackupRunLog = {
  id: string;
  snapshot_type: string;
  status: string;
  folder: string | null;
  message: string | null;
  total_rows: number | null;
  total_tables: number | null;
  started_at: string;
  updated_at?: string;
  finished_at: string | null;
  auth_users_backed_up?: number | null;
  storage_objects_backed_up?: number | null;
  storage_bytes_backed_up?: number | null;
  integrity_report?: any;
};

type BackupSchedule = {
  enabled: boolean;
  hour_sgt: number;
  minute: number;
  frequency?: 'daily' | 'weekly';
  weekday?: number; // 0=Sun..6=Sat (SGT)
};

type BackupStatus = {
  schedule: BackupSchedule;
  last_success: BackupRunLog | null;
  last_run: BackupRunLog | null;
};

type BackupNotificationCfg = {
  on_success: boolean;
  on_warning: boolean;
  on_failure: boolean;
  in_app: boolean;
  webhook_url: string | null;
};

type BackupNotificationRow = {
  id: string;
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string | null;
  webhook_status: string | null;
  webhook_error: string | null;
  created_at: string;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];


function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const ms = Date.now() - t;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

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

  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [notifCfg, setNotifCfg] = useState<BackupNotificationCfg>({
    on_success: true, on_warning: true, on_failure: true, in_app: true, webhook_url: null,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifWebhookDraft, setNotifWebhookDraft] = useState('');
  const [notifLog, setNotifLog] = useState<BackupNotificationRow[]>([]);

  const loadNotificationCfg = async () => {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'backup_notifications').maybeSingle();
    if (data?.value) {
      const v = data.value as Partial<BackupNotificationCfg>;
      const merged: BackupNotificationCfg = {
        on_success: v.on_success ?? true,
        on_warning: v.on_warning ?? true,
        on_failure: v.on_failure ?? true,
        in_app: v.in_app ?? true,
        webhook_url: (v.webhook_url ?? null) as string | null,
      };
      setNotifCfg(merged);
      setNotifWebhookDraft(merged.webhook_url ?? '');
    }
  };

  const loadNotificationLog = async () => {
    const { data } = await supabase
      .from('backup_notifications' as any)
      .select('id, level, title, message, webhook_status, webhook_error, created_at')
      .order('created_at', { ascending: false })
      .limit(25);
    setNotifLog((data as any) || []);
  };

  const saveNotificationCfg = async (next: BackupNotificationCfg) => {
    setNotifSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'backup_notifications', value: next as never, updated_at: new Date().toISOString() });
    if (error) {
      toast({ title: 'Notification settings failed', description: error.message, variant: 'destructive' });
    } else {
      setNotifCfg(next);
      toast({ title: 'Notification settings saved' });
    }
    setNotifSaving(false);
  };

  const saveSchedule = async (patch: Partial<BackupSchedule>) => {
    const current = status?.schedule ?? { enabled: true, hour_sgt: 23, minute: 50, frequency: 'daily' as const, weekday: 1 };
    const next = { ...current, ...patch };
    setScheduleSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'backup_schedule', value: next as never, updated_at: new Date().toISOString() });
    if (error) {
      toast({ title: 'Schedule update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Schedule updated' });
      await loadStatus();
    }
    setScheduleSaving(false);
  };

  const testWebhook = async () => {
    const url = (notifWebhookDraft || notifCfg.webhook_url || '').trim();
    if (!url) {
      toast({ title: 'No webhook URL', variant: 'destructive' });
      return;
    }
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '✅ [Backup] Test notification from SHAW T&C admin panel.' }),
      });
      toast({
        title: r.ok ? 'Webhook OK' : `Webhook returned ${r.status}`,
        variant: r.ok ? 'default' : 'destructive',
      });
    } catch (e: any) {
      toast({ title: 'Webhook failed', description: e.message, variant: 'destructive' });
    }
  };

  const deleteNotification = async (id: string) => {
    const { error } = await supabase.from('backup_notifications' as any).delete().eq('id', id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      loadNotificationLog();
    }
  };


  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('database_snapshots' as any)
      .select('id, snapshot_name, snapshot_date, row_count, created_at, note, snapshot_type, storage_path, manifest, backup_version')
      .order('created_at', { ascending: false });
    setSnapshots(data || []);
    setLoading(false);
  };

  const downloadSchemaSql = async (snapshot: any) => {
    try {
      const folder = (snapshot.storage_path || '').replace(/\/manifest\.json$/, '');
      if (!folder) throw new Error('No storage path');
      const { data, error } = await supabase.storage.from('db-backups').download(`${folder}/__schema.sql`);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${snapshot.snapshot_name.replace(/[^\w.-]+/g, '_')}__schema.sql`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: 'Schema DDL not available', description: e.message || 'This snapshot has no schema dump (pre-v6 backup).', variant: 'destructive' });
    }
  };



  const loadStatus = async () => {
    const { data, error } = await supabase.rpc('get_backup_status' as any);
    if (!error && data) setStatus(data as unknown as BackupStatus);
  };

  useEffect(() => { load(); loadStatus(); }, []);

  // Poll status while a run is in progress.
  useEffect(() => {
    if (!pendingRunId) return;
    const interval = setInterval(async () => {
      await loadStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, [pendingRunId]);

  // Detect transition success/failed for the pending run.
  useEffect(() => {
    if (!pendingRunId || !status?.last_run) return;
    if (status.last_run.id !== pendingRunId) return;
    if (status.last_run.status === 'success' || status.last_run.status === 'success_with_warnings') {
      const lr = status.last_run;
      const warn = lr.status === 'success_with_warnings';
      toast({
        title: warn ? 'Snapshot completed with warnings' : 'Snapshot created',
        description: `${(lr.total_rows ?? 0).toLocaleString()} rows / ${lr.auth_users_backed_up ?? 0} users / ${lr.storage_objects_backed_up ?? 0} objects`,
        variant: warn ? 'destructive' : 'default',
      });
      setPendingRunId(null);
      load();
    } else if (status.last_run.status === 'failed') {
      toast({
        title: 'Snapshot failed',
        description: status.last_run.message || 'Unknown error — see Backup Status card',
        variant: 'destructive',
      });
      setPendingRunId(null);
    }
  }, [status, pendingRunId]);


  const createSnapshot = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-snapshot', {
        body: { mode: 'manual', note: note || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'Backup started',
        description: 'Running in the background; this card will refresh when complete (1–3 min for large databases).',
      });
      setNote('');
      if (data?.run_log_id) {
        setPendingRunId(data.run_log_id);
      }
      await loadStatus();
    } catch (e: any) {
      toast({ title: 'Failed to start snapshot', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const toggleSchedule = async (enabled: boolean) => {
    setScheduleSaving(true);
    const { error } = await supabase.rpc('set_backup_enabled' as any, { _enabled: enabled });
    if (error) {
      toast({ title: 'Schedule update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: enabled ? 'Auto backup enabled' : 'Auto backup paused' });
      await loadStatus();
    }
    setScheduleSaving(false);
  };

  const restoreSnapshot = async (id: string) => {
    setRestoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('restore-snapshot', {
        body: { snapshot_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const restored = data?.restored ?? {};
      const total = typeof restored === 'object'
        ? Object.values(restored as Record<string, number>).reduce((a, b) => a + b, 0)
        : restored;
      const errCount = (data?.errors || []).length;
      const authR = data?.restored_auth_users ?? 0;
      const stoR = data?.restored_storage_objects ?? 0;
      const ig = data?.integrity_report;
      const mismatch = (ig?.tables_mismatch?.length ?? 0)
        + (ig && ig.auth_expected !== ig.auth_actual ? 1 : 0)
        + (ig && ig.storage_expected !== ig.storage_actual ? 1 : 0);
      toast({
        title: errCount ? 'Restore finished with errors' : (mismatch ? 'Restore complete (integrity warnings)' : 'Restore complete'),
        description: `${total?.toLocaleString?.() ?? total} rows · ${authR} users · ${stoR} objects${errCount ? ` · ${errCount} errors` : ''}${mismatch ? ` · ${mismatch} mismatches` : ''}${data?.legacy_v1 ? ' (legacy snapshot — subtests only)' : ''}`,
        variant: errCount || mismatch ? 'destructive' : 'default',
      });

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

  // Schedule card derived values
  const schedule = status?.schedule;
  const lastSuccess = status?.last_success;
  const lastRun = status?.last_run;
  const hoursSinceLastSuccess = lastSuccess
    ? (Date.now() - new Date(lastSuccess.started_at).getTime()) / 36e5
    : Infinity;
  const overdue = (schedule?.enabled ?? true) && hoursSinceLastSuccess > 26;

  const statusBadge = (s?: string | null) => {
    if (s === 'success') return <Badge variant="secondary" className="text-xs">Success</Badge>;
    if (s === 'success_with_warnings') return <Badge variant="outline" className="text-xs border-amber-500 text-amber-700">Success (warnings)</Badge>;
    if (s === 'failed') return <Badge variant="destructive" className="text-xs">Failed</Badge>;
    if (s === 'running') return <Badge className="text-xs">Running</Badge>;
    return <Badge variant="outline" className="text-xs">—</Badge>;
  };


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Backup Status & Schedule</span>
            <Button size="sm" variant="ghost" onClick={loadStatus}>Refresh</Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Daily auto backup</div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={schedule?.enabled ?? true}
                  disabled={scheduleSaving}
                  onCheckedChange={toggleSchedule}
                />
                <span className="text-sm">
                  {schedule
                    ? `${String(schedule.hour_sgt).padStart(2,'0')}:${String(schedule.minute).padStart(2,'0')} SGT daily`
                    : 'Loading…'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Toggle pauses the daily run. To change the time, contact the admin team.
              </p>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Last successful backup</div>
              <div className="text-sm">
                {lastSuccess
                  ? <>
                      {fmtRelative(lastSuccess.started_at)}
                      {' · '}
                      <span className="text-muted-foreground">
                        {(lastSuccess.total_rows ?? 0).toLocaleString()} rows / {lastSuccess.total_tables ?? 0} tables
                      </span>
                    </>
                  : <span className="text-muted-foreground">Never</span>}
              </div>
              {lastSuccess && (
                <div className="text-xs text-muted-foreground">
                  {lastSuccess.auth_users_backed_up ?? 0} auth users · {lastSuccess.storage_objects_backed_up ?? 0} storage objects
                  {typeof lastSuccess.storage_bytes_backed_up === 'number' && lastSuccess.storage_bytes_backed_up > 0
                    ? ` (${(lastSuccess.storage_bytes_backed_up / 1024 / 1024).toFixed(1)} MB)`
                    : ''}
                </div>
              )}
              {overdue && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  No successful backup in the last 26h
                </Badge>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Most recent run</div>
              <div className="flex items-center gap-2 text-sm">
                {statusBadge(lastRun?.status)}
                <span>{lastRun ? fmtRelative(lastRun.started_at) : '—'}</span>
                {lastRun?.snapshot_type && (
                  <Badge variant="outline" className="text-xs capitalize">{lastRun.snapshot_type}</Badge>
                )}
              </div>
              {lastRun?.message && (
                <p className="text-xs text-muted-foreground truncate" title={lastRun.message}>
                  {lastRun.message}
                </p>
              )}
              {lastRun?.integrity_report && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">Integrity report</summary>
                  <div className="mt-1 space-y-0.5 pl-2">
                    <div>Tables checked: {lastRun.integrity_report.tables_checked ?? 0}</div>
                    {(lastRun.integrity_report.tables_mismatch ?? []).length > 0 && (
                      <div className="text-amber-700">
                        Mismatches: {lastRun.integrity_report.tables_mismatch.map((m: any) => `${m.table}(${m.actual}/${m.manifest})`).join(', ')}
                      </div>
                    )}
                    <div>
                      Auth users: backed up {lastRun.integrity_report.auth_users_backed_up ?? lastRun.auth_users_backed_up ?? 0}
                      {lastRun.integrity_report.auth_users_actual !== undefined && ` / actual ${lastRun.integrity_report.auth_users_actual}`}
                    </div>
                    <div>Storage sampled: {lastRun.integrity_report.storage_sampled ?? 0}, missing: {(lastRun.integrity_report.storage_missing ?? []).length}</div>
                  </div>
                </details>
              )}
            </div>

          </div>
        </CardContent>
      </Card>

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
            <Button onClick={createSnapshot} disabled={saving || restoring || !!pendingRunId}>
              {saving ? 'Starting…' : pendingRunId ? 'In progress…' : 'Save Current Data'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Saves a full backup of all business tables to both the database and Storage. Large databases run in chunks and may take 1–3 minutes; the status card above updates automatically.
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
                {snapshots.map(s => {
                  const isV6 = (s.backup_version ?? 0) >= 6;
                  return (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{formatDateTimeDdMmmYyyy(s.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={s.snapshot_type === 'auto' ? 'secondary' : 'outline'} className="text-xs">
                        {s.snapshot_type === 'auto' ? 'Auto' : 'Manual'}
                      </Badge>
                      {isV6 && (
                        <Badge variant="outline" className="text-[10px] ml-1" title="Includes schema DDL, auth.identities, consistency markers">
                          v6 full
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{s.snapshot_name}</TableCell>
                    <TableCell className="text-right text-sm">{s.row_count?.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{s.note || '—'}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {isV6 && (
                        <Button size="sm" variant="ghost" onClick={() => downloadSchemaSql(s)} title="Download schema.sql (DDL for new-project recovery)">
                          schema.sql
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setConfirmRestore(s.id)} disabled={restoring}>
                        Restore
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(s.id)} disabled={restoring}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}

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
              This will WIPE all current data across every backed-up table (Subtests, Defect, Docs, Warranty, masters, permissions, audit logs) and replace it with the snapshot.
              Auth users (login accounts, password hashes) and Storage objects (photos, attachments) included in the snapshot will also be restored.
              A pre-restore safety backup is created automatically before any data is truncated.
              This action cannot be undone. Legacy snapshots created before the full-backup upgrade will only restore the Subtests table.
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

