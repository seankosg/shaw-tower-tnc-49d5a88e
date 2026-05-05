import { useLocation, useNavigate } from 'react-router-dom';
import {
  Database, BarChart3, Upload, Download, Shield, Settings, Calendar, CalendarClock, LogOut, ClipboardList, Tags,
  FileText, FolderKanban, Wrench, ShieldCheck, Package,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { APP_NAME } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleStatus } from '@/contexts/ModuleStatusContext';
import { canAccessRoute, filterNavItems } from '@/lib/role-permissions';
import { getRememberedRoute } from '@/hooks/useRouteMemory';
import type { AppRole } from '@/types/enums';

// Remembered route may point to a sub-page the current role can't access
// (e.g. a Guest with a stale memory of /admin). Fall back to the base path
// when the recalled URL isn't accessible for the active roles.
function safeRoute(basePath: string, roles: AppRole[]): string {
  const remembered = getRememberedRoute(basePath);
  const path = remembered.split('?')[0];
  return canAccessRoute(roles, path) ? remembered : basePath;
}

const mainNav = [
  { label: 'Dashboard', icon: BarChart3, path: '/tc/dashboard' },
  { label: 'Progress',  icon: Calendar,  path: '/tc/progress' },
  { label: 'Schedule Revision', icon: CalendarClock, path: '/tc/schedule-revision' },
  { label: 'Raw Data',  icon: Database,  path: '/tc/raw-data' },
  { label: 'Import',    icon: Upload,    path: '/tc/import' },
  { label: 'Export',    icon: Download,  path: '/tc/export' },
  { label: 'Quick Update', icon: ClipboardList, path: '/tc/quick-update' },
];

const defectNav = [
  { label: 'Dashboard', icon: BarChart3, path: '/defects/dashboard' },
  { label: 'Progress', icon: Calendar, path: '/defects/progress' },
  { label: 'Schedule Revision', icon: CalendarClock, path: '/defects/schedule-revision' },
  { label: 'Raw Data', icon: Database, path: '/defects/raw-data' },
  { label: 'Import', icon: Upload, path: '/defects/import' },
  { label: 'Export', icon: Download, path: '/defects/export' },
  { label: 'Defect Classification', icon: Tags, path: '/admin/classification' },
  { label: 'Quick Update', icon: ClipboardList, path: '/defects/quick-update' },
];

const docsNav = [
  { label: 'Dashboard', icon: BarChart3, path: '/docs/dashboard' },
  { label: 'Raw Data ABD', icon: FileText, path: '/docs/abd' },
  { label: 'Raw Data OMM', icon: FolderKanban, path: '/docs/omm' },
  { label: 'Raw Data Warranty', icon: ShieldCheck, path: '/docs/warranty' },
  { label: 'Raw Data Spare Part', icon: Package, path: '/docs/spare-part' },
  { label: 'Import', icon: Upload, path: '/docs/import' },
  { label: 'Export', icon: Download, path: '/docs/export' },
];

const adminNav = [
  { label: 'Admin', icon: Shield, path: '/admin' },
];

export function AppSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { profile, roles, signOut, isAdmin } = useAuth();
  const { tnc, defect, docs } = useModuleStatus();
  const userName = profile?.name || profile?.login_id || 'User';

  const visibleMain = filterNavItems(mainNav, roles);
  const visibleDefects = filterNavItems(defectNav, roles);
  const visibleDocs = filterNavItems(docsNav, roles);
  const visibleAdmin = filterNavItems(adminNav, roles);

  // Non-admins lose the entire group when the module is paused
  const showTncGroup = isAdmin || tnc.enabled;
  const showDefectGroup = isAdmin || defect.enabled;
  const showDocsGroup = isAdmin || docs.enabled;

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-sidebar-primary" />
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              {APP_NAME}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 pl-7">
            <span className="min-w-0 truncate text-xs font-medium text-sidebar-foreground/80">
              {userName}
            </span>
            <Badge
              variant="secondary"
              role="button"
              tabIndex={0}
              onClick={signOut}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  void signOut();
                }
              }}
              className="shrink-0 cursor-pointer gap-1 border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
            >
              <LogOut className="h-3 w-3" />
              Log-Out
            </Badge>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {showTncGroup && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <span>T&amp;C Management</span>
              {!tnc.enabled && (
                <Badge variant="outline" className="border-amber-400 bg-amber-100/60 text-[10px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  Paused
                </Badge>
              )}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleMain.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={pathname === item.path || (item.path === '/tc/raw-data' && pathname.startsWith('/subtests/'))}
                      onClick={() => navigate(getRememberedRoute(item.path))}
                      tooltip={item.label}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showDefectGroup && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <span>Defect Management</span>
              {!defect.enabled && (
                <Badge variant="outline" className="border-amber-400 bg-amber-100/60 text-[10px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  Paused
                </Badge>
              )}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleDefects.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={pathname === item.path || (item.path === '/defects/raw-data' && /^\/defects\/[^/]+$/.test(pathname))}
                      onClick={() => navigate(getRememberedRoute(item.path))}
                      tooltip={item.label}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {showDocsGroup && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              <span>Docs Management</span>
              {!docs.enabled && (
                <Badge variant="outline" className="border-amber-400 bg-amber-100/60 text-[10px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  Paused
                </Badge>
              )}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleDocs.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={
                        pathname === item.path ||
                        (item.path === '/docs/abd' && (pathname.startsWith('/docs/abd/') || pathname.startsWith('/docs/raw-data') || /^\/docs\/(?!dashboard|abd|omm|warranty|spare-part|import|export|org-mapping)[^/]+$/.test(pathname))) ||
                        (item.path === '/docs/omm' && pathname.startsWith('/docs/omm/')) ||
                        (item.path === '/docs/spare-part' && pathname.startsWith('/docs/spare-part/')) ||
                        (item.path === '/docs/warranty' && pathname.startsWith('/docs/warranty/'))
                      }
                      onClick={() => navigate(getRememberedRoute(item.path))}
                      tooltip={item.label}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(item.path)}
                      onClick={() => navigate(getRememberedRoute(item.path))}
                      tooltip={item.label}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
