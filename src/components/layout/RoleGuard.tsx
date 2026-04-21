import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessRoute } from '@/lib/role-permissions';

export function RoleGuard({ children }: { children: React.ReactNode }) {
  const { roles } = useAuth();
  const { pathname } = useLocation();

  if (!canAccessRoute(roles, pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
