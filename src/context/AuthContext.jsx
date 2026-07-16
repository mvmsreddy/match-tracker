import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getSession().then((session) => {
      if (!cancelled) {
        setUser(session ? session.user : null);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const { user: loggedInUser } = await api.login(email, password);
      setUser(loggedInUser);
      return loggedInUser;
    } catch (e) {
      setError(e.message || 'Login failed');
      throw e;
    }
  }, []);

  const signup = useCallback(async (email, password, name) => {
    setError(null);
    try {
      const { user: newUser } = await api.signup(email, password, name);
      setUser(newUser);
      return newUser;
    } catch (e) {
      setError(e.message || 'Signup failed');
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
