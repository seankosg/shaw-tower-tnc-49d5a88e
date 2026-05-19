import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute, canAccessReport } from '@/lib/role-permissions';
import { useModuleStatus } from '@/contexts/ModuleStatusContext';
import { ModulePausedScreen } from './ModulePausedScreen';
import { Button } from '@/components/ui/button';

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

// Try guest-allowed pages first so a Guest is never left on a blank screen.
const FALLBACK_ROUTES = [
  '/tc/dashboard',
  '/tc/progress',
  '/defects/dashboard',
  '/defects/progress',
  '/docs/dashboard',
  '/admin',
];

export function RoleGuard({ children }: { children: React.ReactNode }) {
  const { roles, isAdmin, loading, session, signOut } = useAuth();
  const { pathname } = useLocation();
  const { tnc, defect, docs, loading: modLoading } = useModuleStatus();

  // Wait for auth/role data before deciding access — prevents the blank
  // "No accessible pages" flash right after login when roles haven't loaded yet.
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Authenticated but no roles assigned — give a clear message instead of a blank screen.
  if (session && roles.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <h2 className="text-lg font-semibold">No role assigned</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Your account has no role assigned yet. Please contact an administrator to grant access.
        </p>
        <Button variant="outline" size="sm" onClick={() => void signOut()}>Sign Out</Button>
      </div>
    );
  }

  if (!canAccessRoute(roles, pathname)) {
    const target = FALLBACK_ROUTES.find((p) => p !== pathname && canAccessRoute(roles, p));
    if (!target) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
          <h2 className="text-lg font-semibold">No accessible pages</h2>
          <p className="text-sm text-muted-foreground">
            Your account does not have permission to view any module. Please contact an administrator.
          </p>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>Sign Out</Button>
        </div>
      );
    }
    return <Navigate to={target} replace />;
  }

  // Module pause check — admin always passes
  if (!modLoading && !isAdmin) {
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
