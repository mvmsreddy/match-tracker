import * as mockApi from './mockApi';
import * as supabaseApi from './supabaseApi';

const hasSupabaseConfig = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

if (!hasSupabaseConfig) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Match Tracker] No Supabase config found — using the local mock API ' +
    '(data stays in this browser only). See README.md "Real persistence with Supabase" to switch on real, permanent storage.',
  );
}

const impl = hasSupabaseConfig ? supabaseApi : mockApi;

export const login = impl.login;
export const signup = impl.signup;
export const loginWithGoogle = hasSupabaseConfig ? supabaseApi.loginWithGoogle : null;
export const onAuthStateChange = hasSupabaseConfig ? supabaseApi.onAuthStateChange : null;
export const logout = impl.logout;
export const getSession = impl.getSession;
export const listMatches = impl.listMatches;
export const saveMatch = impl.saveMatch;
export const getMatch = impl.getMatch;
export const deleteMatch = impl.deleteMatch;

// Only meaningful in mock mode — LoginPage only shows these when useMock is true.
export const DEMO_CREDENTIALS = mockApi.DEMO_CREDENTIALS;
export const usingMock = !hasSupabaseConfig;
