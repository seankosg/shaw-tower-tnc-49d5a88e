import { useLocation, useNavigate } from 'react-router-dom';
import {
  Database, BarChart3, Upload, Download, Shield, Settings, Calendar, CalendarClock, LogOut, ClipboardList, Tags,
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
import { filterNavItems } from '@/lib/role-permissions';
import { getRememberedRoute } from '@/hooks/useRouteMemory';

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

const adminNav = [
  { label: 'Admin', icon: Shield, path: '/admin' },
];

export function AppSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { profile, roles, signOut, isAdmin } = useAuth();
  const { tnc, defect } = useModuleStatus();
  const userName = profile?.name || profile?.login_id || 'User';

  const visibleMain = filterNavItems(mainNav, roles);
  const visibleDefects = filterNavItems(defectNav, roles);
  const visibleAdmin = filterNavItems(adminNav, roles);

  // Non-admins lose the entire group when the module is paused
  const showTncGroup = isAdmin || tnc.enabled;
  const showDefectGroup = isAdmin || defect.enabled;

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
