import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { loginIdToEmail, type AppRole, type UserType } from '@/types/enums';

interface Profile {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  login_id: string | null;
  user_type: UserType;
  subcontractor_name: string | null;
  subsub_name: string | null;
  hdec_pic_name: string | null;
  hdec_eng_name: string | null;
  team: string | null;
  must_change_password: boolean;
  is_active: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (loginId: string, password: string) => Promise<{ error: Error | null; profile: { is_active: boolean } | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isSuperuser: boolean;
  isAdminOrSuperuser: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('user_roles').select('role').eq('user_id', userId),
    ]);
    if (profileRes.data) setProfile(profileRes.data as Profile);
    if (rolesRes.data) setRoles(rolesRes.data.map((r) => r.role as AppRole));
  };

  const refreshProfile = async () => {
    if (session?.user) await fetchUserData(session.user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          // Only flip the global loading flag on the initial sign-in. Token
          // refreshes and user-updated events fire periodically and would
          // otherwise replace the whole UI with the RoleGuard "Loading…"
          // screen, blocking clicks (e.g. on the Admin sidebar item).
          const needsBlockingLoad = event === 'SIGNED_IN' || event === 'INITIAL_SESSION';
          if (needsBlockingLoad) setLoading(true);
          // Defer to next tick to avoid deadlocks inside the auth callback.
          setTimeout(async () => {
            try {
              await fetchUserData(newSession.user.id);
            } finally {
              if (needsBlockingLoad) setLoading(false);
            }
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        try {
          await fetchUserData(s.user.id);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (loginId: string, password: string) => {
    const email = loginIdToEmail(loginId);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error as Error | null, profile: null };
    // Fetch profile to check is_active
    const { data: sess } = await supabase.auth.getSession();
    if (sess?.session?.user) {
      const { data: p } = await supabase.from('profiles').select('is_active').eq('user_id', sess.session.user.id).single();
      if (p && !p.is_active) {
        await supabase.auth.signOut();
        return { error: null, profile: { is_active: false } };
      }
    }
    return { error: null, profile: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  };

  const isAdmin = roles.includes('admin');
  const isSuperuser = roles.includes('superuser');

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        roles,
        loading,
        signIn,
        signOut,
        refreshProfile,
        isAdmin,
        isSuperuser,
        isAdminOrSuperuser: isAdmin || isSuperuser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
