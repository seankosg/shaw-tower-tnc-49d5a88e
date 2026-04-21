import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, signOut } = useAuth();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && session && profile && !profile.is_active) {
      toast({ title: 'Account Deactivated', description: 'Your account has been deactivated. Please contact an administrator.', variant: 'destructive' });
      signOut();
    }
  }, [loading, session, profile]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (profile && !profile.is_active) {
    return <Navigate to="/login" replace />;
  }

  if (profile?.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
