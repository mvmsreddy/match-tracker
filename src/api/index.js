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
const noSupabase = () => { throw new Error('Requires Supabase'); };

// Tournament Weeks
export const listTournamentWeeks = hasSupabaseConfig ? supabaseApi.listTournamentWeeks : async () => [];
export const getTournamentWeek = hasSupabaseConfig ? supabaseApi.getTournamentWeek : async () => null;
export const createTournamentWeek = hasSupabaseConfig ? supabaseApi.createTournamentWeek : noSupabase;
export const updateTournamentWeek = hasSupabaseConfig ? supabaseApi.updateTournamentWeek : noSupabase;
export const deleteTournamentWeek = hasSupabaseConfig ? supabaseApi.deleteTournamentWeek : async () => {};

// Events
export const listEvents = hasSupabaseConfig ? supabaseApi.listEvents : async () => [];
export const getEvent = hasSupabaseConfig ? supabaseApi.getEvent : async () => null;
export const createEvent = hasSupabaseConfig ? supabaseApi.createEvent : noSupabase;
export const updateEvent = hasSupabaseConfig ? supabaseApi.updateEvent : noSupabase;
export const deleteEvent = hasSupabaseConfig ? supabaseApi.deleteEvent : async () => {};

// Draw Entries
export const getDrawEntries = hasSupabaseConfig ? supabaseApi.getDrawEntries : async () => [];
export const saveDrawEntries = hasSupabaseConfig ? supabaseApi.saveDrawEntries : async () => [];

// Event Matches
export const getEventMatches = hasSupabaseConfig ? supabaseApi.getEventMatches : async () => [];
export const initializeEventMatches = hasSupabaseConfig ? supabaseApi.initializeEventMatches : async () => [];
export const updateMatchScore = hasSupabaseConfig ? supabaseApi.updateMatchScore : async () => {};
export const advanceWinner = hasSupabaseConfig ? supabaseApi.advanceWinner : async () => {};

// Only meaningful in mock mode — LoginPage only shows these when useMock is true.
export const DEMO_CREDENTIALS = mockApi.DEMO_CREDENTIALS;
export const usingMock = !hasSupabaseConfig;
