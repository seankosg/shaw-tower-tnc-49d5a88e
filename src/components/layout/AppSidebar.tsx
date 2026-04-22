import { useLocation, useNavigate } from 'react-router-dom';
import {
  Database, BarChart3, Upload, Download, Shield, Settings, Calendar, LogOut,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { APP_NAME } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';
import { filterNavItems } from '@/lib/role-permissions';

const mainNav = [
  { label: 'Dashboard', icon: BarChart3, path: '/dashboard' },
  { label: 'Progress',  icon: Calendar,  path: '/schedule' },
  { label: 'Raw Data',  icon: Database,  path: '/' },
  { label: 'Import',    icon: Upload,    path: '/import' },
  { label: 'Export',    icon: Download,  path: '/export' },
];

const adminNav = [
  { label: 'Admin', icon: Shield, path: '/admin' },
];

export function AppSidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { profile, roles, signOut } = useAuth();
  const userName = profile?.name || profile?.login_id || 'User';

  const visibleMain = filterNavItems(mainNav, roles);
  const visibleAdmin = filterNavItems(adminNav, roles);

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
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMain.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={pathname === item.path}
                    onClick={() => navigate(item.path)}
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

        {visibleAdmin.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdmin.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(item.path)}
                      onClick={() => navigate(item.path)}
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
