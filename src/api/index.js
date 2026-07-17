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

// Profile module — Supabase only
export const getProfile = hasSupabaseConfig ? supabaseApi.getProfile : async () => null;
export const upsertProfile = hasSupabaseConfig ? supabaseApi.upsertProfile : async () => {};
export const searchPlayers = hasSupabaseConfig ? supabaseApi.searchPlayers : async () => [];
export const sendCoachRequest = hasSupabaseConfig ? supabaseApi.sendCoachRequest : async () => {};
export const getCoachLinks = hasSupabaseConfig ? supabaseApi.getCoachLinks : async () => [];
export const respondToCoachRequest = hasSupabaseConfig ? supabaseApi.respondToCoachRequest : async () => {};
export const deleteCoachLink = hasSupabaseConfig ? supabaseApi.deleteCoachLink : async () => {};

// Tournament module — Supabase only (no mock fallback needed)
export const listTournaments = hasSupabaseConfig ? supabaseApi.listTournaments : async () => [];
export const getTournament = hasSupabaseConfig ? supabaseApi.getTournament : async () => null;
export const createTournament = hasSupabaseConfig ? supabaseApi.createTournament : async () => { throw new Error('Requires Supabase'); };
export const deleteTournament = hasSupabaseConfig ? supabaseApi.deleteTournament : async () => {};
export const getDrawEntries = hasSupabaseConfig ? supabaseApi.getDrawEntries : async () => [];
export const saveDrawEntries = hasSupabaseConfig ? supabaseApi.saveDrawEntries : async () => [];
export const getTournamentMatches = hasSupabaseConfig ? supabaseApi.getTournamentMatches : async () => [];
export const initializeMatches = hasSupabaseConfig ? supabaseApi.initializeMatches : async () => [];
export const updateMatchScore = hasSupabaseConfig ? supabaseApi.updateMatchScore : async () => {};
export const advanceWinner = hasSupabaseConfig ? supabaseApi.advanceWinner : async () => {};

// Only meaningful in mock mode — LoginPage only shows these when useMock is true.
export const DEMO_CREDENTIALS = mockApi.DEMO_CREDENTIALS;
export const usingMock = !hasSupabaseConfig;
