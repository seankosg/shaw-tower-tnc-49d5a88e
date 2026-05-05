import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/role-permissions';
import { useModuleStatus } from '@/contexts/ModuleStatusContext';
import { ModulePausedScreen } from './ModulePausedScreen';

function detectModule(pathname: string): 'tnc' | 'defect' | 'docs' | null {
  if (pathname.startsWith('/tc/') || pathname === '/dashboard' || pathname === '/schedule'
      || pathname.startsWith('/schedule/') || pathname === '/raw-data'
      || pathname.startsWith('/subtests/') || pathname === '/import'
      || pathname.startsWith('/import/') || pathname === '/export'
      || pathname === '/mobile') {
    return 'tnc';
  }
  if (pathname.startsWith('/defects/') || pathname.startsWith('/defect/')) {
    return 'defect';
  }
  if (pathname.startsWith('/docs/')) {
    return 'docs';
  }
  return null;
}

export function RoleGuard({ children }: { children: React.ReactNode }) {
  const { roles, isAdmin } = useAuth();
  const { pathname } = useLocation();
  const { tnc, defect, docs, loading } = useModuleStatus();

  if (!canAccessRoute(roles, pathname)) {
    // Pick the first route the user can actually access — avoids redirect loops
    // when the configured fallback (e.g. /dashboard) is itself restricted.
    const fallbacks = ['/tc/dashboard', '/defects/dashboard', '/docs/dashboard', '/dashboard'];
    const target = fallbacks.find((p) => canAccessRoute(roles, p));
    if (!target || target === pathname) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-6 text-center">
          <h2 className="text-lg font-semibold">No accessible pages</h2>
          <p className="text-sm text-muted-foreground">
            Your account does not have permission to view any module. Please contact an administrator.
          </p>
        </div>
      );
    }
    return <Navigate to={target} replace />;
  }

  // Module pause check — admin always passes
  if (!loading && !isAdmin) {
    const mod = detectModule(pathname);
    if (mod === 'tnc' && !tnc.enabled) {
      return <ModulePausedScreen module="tnc" status={tnc} />;
    }
    if (mod === 'defect' && !defect.enabled) {
      return <ModulePausedScreen module="defect" status={defect} />;
    }
    if (mod === 'docs' && !docs.enabled) {
      return <ModulePausedScreen module="docs" status={docs} />;
    }
  }

  return <>{children}</>;
}
