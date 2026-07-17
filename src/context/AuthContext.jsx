import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from '../api';

const AuthContext = createContext(null);

// Merge auth-level user with their user_profiles row.
// Returns the enriched user object the whole app uses.
async function loadFullUser(authUser) {
  if (!authUser) return null;
  try {
    const profile = await api.getProfile(authUser.id);
    return {
      ...authUser,
      // profile fields (fall back to auth metadata if profile not created yet)
      role: profile?.role || authUser.role || 'player',
      displayName: profile?.displayName || authUser.name,
      aitaReg: profile?.aitaReg || null,
      stateAbbr: profile?.stateAbbr || null,
      dateOfBirth: profile?.dateOfBirth || null,
      ranking: profile?.ranking || null,
      clubName: profile?.clubName || null,
      bio: profile?.bio || null,
      isVerified: profile?.isVerified || false,
      profileComplete: !!profile,
    };
  } catch {
    // Profile table might not exist yet (pre-migration) — degrade gracefully
    return { ...authUser, role: authUser.role || 'player', profileComplete: false };
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api.getSession().then(async (session) => {
      if (!cancelled) {
        const fullUser = session ? await loadFullUser(session.user) : null;
        setUser(fullUser);
        setLoading(false);
      }
    });

    if (api.onAuthStateChange) {
      const unsubscribe = api.onAuthStateChange(async (authUser) => {
        if (!cancelled) {
          const fullUser = authUser ? await loadFullUser(authUser) : null;
          setUser(fullUser);
          setLoading(false);
        }
      });
      return () => { cancelled = true; unsubscribe(); };
    }

    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const { user: authUser } = await api.login(email, password);
    const fullUser = await loadFullUser(authUser);
    setUser(fullUser);
    return fullUser;
  }, []);

  const signup = useCallback(async (email, password, name, role = 'player') => {
    const { user: authUser } = await api.signup(email, password, name, role);
    const fullUser = await loadFullUser(authUser);
    setUser(fullUser);
    return fullUser;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  // Call after the user saves their profile — refreshes role + fields in context
  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const fresh = await loadFullUser(user);
    setUser(fresh);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
