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
import { useToast } from '@/hooks/use-toast';
import { ROLE_LABELS, type AppRole } from '@/types/enums';
import { Shield } from 'lucide-react';

/* ───── Types ───── */
interface Profile {
  id: string; user_id: string; name: string | null; email: string | null; is_active: boolean;
}
interface UserRole {
  id: string; user_id: string; role: AppRole;
}
interface SystemRow {
  id: string; system_code: string; system_name_std: string | null; discipline: string | null;
  is_active: boolean; is_auto_created: boolean; requires_admin_review: boolean;
}
interface PermRow {
  id: string; user_id: string; system_id: string; project_id: string;
  can_view: boolean; can_edit: boolean; can_import: boolean; can_export: boolean; can_create_key: boolean;
}
interface FieldCfg {
  id: string; field_name: string; display_name: string; is_enabled: boolean; is_required: boolean; sort_order: number;
  visible_to_roles: AppRole[] | null; editable_to_roles: AppRole[] | null;
}
interface ChangeLogRow {
  id: string; subtest_id: string; changed_field: string; old_value: string | null;
  new_value: string | null; changed_by: string | null; changed_at: string; change_source: string | null;
}

const ALL_ROLES: AppRole[] = ['subcontractor', 'hdec_engineer', 'manager', 'superuser', 'admin'];

export default function AdminPage() {
  const { isAdminOrSuperuser, session } = useAuth();

  // In development, skip auth check to allow preview testing
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
          <TabsTrigger value="systems">Systems</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="fields">Field Config</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="systems"><SystemsTab /></TabsContent>
        <TabsContent value="permissions"><PermissionsTab /></TabsContent>
        <TabsContent value="fields"><FieldConfigTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ═══════ Tab 1: Users ═══════ */
function UsersTab() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('*').order('name'),
      supabase.from('user_roles').select('*'),
    ]);
    if (p.data) setProfiles(p.data as Profile[]);
    if (r.data) setRoles(r.data as UserRole[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const getUserRoles = (uid: string) => roles.filter(r => r.user_id === uid);

  const toggleRole = async (uid: string, role: AppRole, hasRole: boolean) => {
    if (hasRole) {
      const target = roles.find(r => r.user_id === uid && r.role === role);
      if (target) await supabase.from('user_roles').delete().eq('id', target.id);
    } else {
      await supabase.from('user_roles').insert({ user_id: uid, role });
    }
    toast({ title: 'Role updated' });
    load();
  };

  const toggleActive = async (profile: Profile) => {
    await supabase.from('profiles').update({ is_active: !profile.is_active }).eq('id', profile.id);
    toast({ title: profile.is_active ? 'User deactivated' : 'User activated' });
    load();
  };

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">User Management</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map(p => {
                const userRoles = getUserRoles(p.user_id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name ?? '—'}</TableCell>
                    <TableCell>{p.email ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {ALL_ROLES.map(role => {
                          const has = userRoles.some(r => r.role === role);
                          return (
                            <Badge
                              key={role}
                              variant={has ? 'default' : 'outline'}
                              className="cursor-pointer text-xs"
                              onClick={() => toggleRole(p.user_id, role, has)}
                            >
                              {ROLE_LABELS[role]}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════ Tab 2: Systems ═══════ */
function SystemsTab() {
  const { toast } = useToast();
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('system_master').select('id, system_code, system_name_std, discipline, is_active, is_auto_created, requires_admin_review').order('system_code');
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
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
      supabase.from('profiles').select('id, user_id, name, email, is_active').eq('is_active', true),
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
                      <TableCell>{prof?.name ?? prof?.email ?? perm.user_id.slice(0, 8)}</TableCell>
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
  const { toast } = useToast();
  const [fields, setFields] = useState<FieldCfg[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('field_config').select('*').order('sort_order');
    if (data) setFields(data as FieldCfg[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (f: FieldCfg, key: 'is_enabled' | 'is_required') => {
    const update = { is_enabled: f.is_enabled, is_required: f.is_required };
    update[key] = !f[key];
    await supabase.from('field_config').update(update).eq('id', f.id);
    toast({ title: 'Field updated' });
    load();
  };

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Field Configuration</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Field Name</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead className="text-center">Enabled</TableHead>
                <TableHead className="text-center">Required</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map(f => (
                <TableRow key={f.id}>
                  <TableCell>{f.sort_order}</TableCell>
                  <TableCell className="font-mono text-xs">{f.field_name}</TableCell>
                  <TableCell>{f.display_name}</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={f.is_enabled} onCheckedChange={() => toggle(f, 'is_enabled')} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={f.is_required} onCheckedChange={() => toggle(f, 'is_required')} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
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
                    <TableCell className="whitespace-nowrap text-xs">{new Date(l.changed_at).toLocaleString()}</TableCell>
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
                    <TableCell className="whitespace-nowrap text-xs">{new Date(u.uploaded_at).toLocaleString()}</TableCell>
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
