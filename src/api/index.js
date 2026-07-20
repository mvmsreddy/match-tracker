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
export const addDrawEntry = hasSupabaseConfig ? supabaseApi.addDrawEntry : noSupabase;
export const updateDrawEntry = hasSupabaseConfig ? supabaseApi.updateDrawEntry : noSupabase;
export const deleteDrawEntry = hasSupabaseConfig ? supabaseApi.deleteDrawEntry : async () => {};
export const moveEntryToGroup = hasSupabaseConfig ? supabaseApi.moveEntryToGroup : noSupabase;
export const bulkAddDrawEntries = hasSupabaseConfig ? supabaseApi.bulkAddDrawEntries : async () => [];
export const getPlayerWeekParticipation = hasSupabaseConfig ? supabaseApi.getPlayerWeekParticipation : async () => [];

// Event Matches
export const getEventMatches = hasSupabaseConfig ? supabaseApi.getEventMatches : async () => [];
export const initializeEventMatches = hasSupabaseConfig ? supabaseApi.initializeEventMatches : async () => [];
export const updateMatchScore = hasSupabaseConfig ? supabaseApi.updateMatchScore : async () => {};
export const advanceWinner = hasSupabaseConfig ? supabaseApi.advanceWinner : async () => {};
export const getQualifyingWinners = hasSupabaseConfig ? supabaseApi.getQualifyingWinners : async () => null;
export const promoteQualifiers    = hasSupabaseConfig ? supabaseApi.promoteQualifiers    : async () => [];

// Phase 18 — Withdrawal audit log
export const logWithdrawal            = hasSupabaseConfig ? supabaseApi.logWithdrawal            : noSupabase;
export const attachReplacementToAudit = hasSupabaseConfig ? supabaseApi.attachReplacementToAudit : noSupabase;
export const getWithdrawalAuditLog    = hasSupabaseConfig ? supabaseApi.getWithdrawalAuditLog    : async () => [];

// Phase 17 — Notifications
export const getEligiblePlayerUserIds  = hasSupabaseConfig ? supabaseApi.getEligiblePlayerUserIds  : async () => [];
export const createNotificationsForUsers = hasSupabaseConfig ? supabaseApi.createNotificationsForUsers : async () => [];
export const getMyNotifications          = hasSupabaseConfig ? supabaseApi.getMyNotifications          : async () => [];
export const getUnreadNotificationCount  = hasSupabaseConfig ? supabaseApi.getUnreadNotificationCount  : async () => 0;
export const markNotificationRead        = hasSupabaseConfig ? supabaseApi.markNotificationRead        : async () => ({ ok: true });
export const markAllNotificationsRead    = hasSupabaseConfig ? supabaseApi.markAllNotificationsRead    : async () => ({ ok: true });
export const sendNotificationEmails      = hasSupabaseConfig ? supabaseApi.sendNotificationEmails      : async () => ({ ok: true, skipped: true });

// Phase 10 — Withdrawals & Alternates (+ Lucky Losers)
export const setEntryWithdrawn      = hasSupabaseConfig ? supabaseApi.setEntryWithdrawn      : noSupabase;
export const bulkSetWithdrawn       = hasSupabaseConfig ? supabaseApi.bulkSetWithdrawn       : noSupabase;
export const callInReplacement      = hasSupabaseConfig ? supabaseApi.callInReplacement      : noSupabase;
export const processWalkoverIfNeeded = hasSupabaseConfig ? supabaseApi.processWalkoverIfNeeded : async () => null;
export const clearScheduleForEntry  = hasSupabaseConfig ? supabaseApi.clearScheduleForEntry  : async () => ({ ok: true });
export const getQualifyingLosers    = hasSupabaseConfig ? supabaseApi.getQualifyingLosers    : async () => null;
export const randomizeLuckyLosers   = hasSupabaseConfig ? supabaseApi.randomizeLuckyLosers   : async () => [];
export const getLuckyLosers         = hasSupabaseConfig ? supabaseApi.getLuckyLosers         : async () => [];

// Phase 11 — Player & Coach Dashboards
export const getDrawEntriesForPlayers = hasSupabaseConfig ? supabaseApi.getDrawEntriesForPlayers : async () => [];

// Phase 18 — Player self-entry
export const getMyEventEntry           = hasSupabaseConfig ? supabaseApi.getMyEventEntry           : async () => null;
export const computeSelfEntryPlacement = hasSupabaseConfig ? supabaseApi.computeSelfEntryPlacement : noSupabase;
export const selfEnterSingles          = hasSupabaseConfig ? supabaseApi.selfEnterSingles          : noSupabase;
export const withdrawFromEvent         = hasSupabaseConfig ? supabaseApi.withdrawFromEvent         : noSupabase;
export const getMyEntries              = hasSupabaseConfig ? supabaseApi.getMyEntries              : async () => [];

// Phase 19 — Doubles invitations
export const searchDoublesPartners     = hasSupabaseConfig ? supabaseApi.searchDoublesPartners     : async () => [];
export const sendDoublesInvitation     = hasSupabaseConfig ? supabaseApi.sendDoublesInvitation     : noSupabase;
export const getMyPendingInvitations   = hasSupabaseConfig ? supabaseApi.getMyPendingInvitations   : async () => [];
export const getMySentInvitations      = hasSupabaseConfig ? supabaseApi.getMySentInvitations      : async () => [];
export const respondToInvitation       = hasSupabaseConfig ? supabaseApi.respondToInvitation       : noSupabase;
export const cancelInvitation          = hasSupabaseConfig ? supabaseApi.cancelInvitation          : async () => {};

// Order of Play — Phase 7
export const getWeekMatches      = hasSupabaseConfig ? supabaseApi.getWeekMatches      : async () => [];
export const updateMatchSchedule = hasSupabaseConfig ? supabaseApi.updateMatchSchedule : async () => {};
export const autoScheduleWeek    = hasSupabaseConfig ? supabaseApi.autoScheduleWeek    : async () => 0;

// Only meaningful in mock mode — LoginPage only shows these when useMock is true.
export const DEMO_CREDENTIALS = mockApi.DEMO_CREDENTIALS;
export const usingMock = !hasSupabaseConfig;
