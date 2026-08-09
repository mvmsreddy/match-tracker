import * as mockApi from './mockApi';
import * as supabaseApi from './supabaseApi';
import * as nutritionMock from './nutritionMock';
import * as tournamentsMock from './tournamentsMock';
import * as razorpayApi from './razorpayApi';
import { generateMockRankingHistory } from '../lib/mockRankingHistory';

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
export const completeNativeOAuthLogin = hasSupabaseConfig ? supabaseApi.completeNativeOAuthLogin : async () => false;
export const onAuthStateChange = hasSupabaseConfig ? supabaseApi.onAuthStateChange : null;
export const logout = impl.logout;
export const getSession = impl.getSession;
export const listMatches = impl.listMatches;
export const saveMatch = impl.saveMatch;
export const getMatch = impl.getMatch;
export const deleteMatch = impl.deleteMatch;
export const canTrackForPlayer = hasSupabaseConfig ? supabaseApi.canTrackForPlayer : async () => true;

// Phase 54 — live shared tracking
export const createLiveTrackingSession = hasSupabaseConfig ? supabaseApi.createLiveTrackingSession : noSupabase;
export const updateLiveTrackingSession = hasSupabaseConfig ? supabaseApi.updateLiveTrackingSession : noSupabase;
export const endLiveTrackingSession = hasSupabaseConfig ? supabaseApi.endLiveTrackingSession : noSupabase;
export const getLiveTrackingSession = hasSupabaseConfig ? supabaseApi.getLiveTrackingSession : async () => null;
export const getActiveLiveTrackingSession = hasSupabaseConfig ? supabaseApi.getActiveLiveTrackingSession : async () => null;

// Phase 35 — retroactive point-by-point entry
export const updateMatchPoints = hasSupabaseConfig ? supabaseApi.updateMatchPoints : async () => {};

// Phase 34 — Streak Freezes + roster leaderboard
export const getStreakFreezes = hasSupabaseConfig ? supabaseApi.getStreakFreezes : async () => [];
export const addStreakFreeze = hasSupabaseConfig ? supabaseApi.addStreakFreeze : async () => {};
export const deleteStreakFreeze = hasSupabaseConfig ? supabaseApi.deleteStreakFreeze : async () => {};
export const getRosterLeaderboard = hasSupabaseConfig ? supabaseApi.getRosterLeaderboard : async () => [];

// Phase 37 — player-vs-player Compare + Saved Compare Views
export const getLinkedPlayersForCompare = hasSupabaseConfig ? supabaseApi.getLinkedPlayersForCompare : async () => [];
export const getPlayerComparison = hasSupabaseConfig ? supabaseApi.getPlayerComparison : async () => null;
export const getSavedCompares = hasSupabaseConfig ? supabaseApi.getSavedCompares : async () => [];
export const createSavedCompare = hasSupabaseConfig ? supabaseApi.createSavedCompare : async () => {};
export const deleteSavedCompare = hasSupabaseConfig ? supabaseApi.deleteSavedCompare : async () => {};

// Profile module
export const getProfile = impl.getProfile;
export const upsertProfile = impl.upsertProfile;

// Phase 36 — Nutrition
export const updateNutritionGoals = hasSupabaseConfig ? supabaseApi.updateNutritionGoals : async () => {};

// Phase 41 — reminder / weekly digest preferences
export const updateReminderPrefs = hasSupabaseConfig ? supabaseApi.updateReminderPrefs : async () => {};
export const getNutritionLogs = hasSupabaseConfig ? supabaseApi.getNutritionLogs : nutritionMock.getNutritionLogs;
export const createNutritionLog = hasSupabaseConfig ? supabaseApi.createNutritionLog : nutritionMock.createNutritionLog;
export const deleteNutritionLog = hasSupabaseConfig ? supabaseApi.deleteNutritionLog : nutritionMock.deleteNutritionLog;
export const searchPlayers = hasSupabaseConfig ? supabaseApi.searchPlayers : async () => [];
export const sendCoachRequest = hasSupabaseConfig ? supabaseApi.sendCoachRequest : async () => {};
export const getCoachLinks = hasSupabaseConfig ? supabaseApi.getCoachLinks : async () => [];
export const respondToCoachRequest = hasSupabaseConfig ? supabaseApi.respondToCoachRequest : async () => {};
export const deleteCoachLink = hasSupabaseConfig ? supabaseApi.deleteCoachLink : async () => {};

// Phase 33 — Parent ↔ Player Links
export const sendParentRequest = hasSupabaseConfig ? supabaseApi.sendParentRequest : async () => {};
export const getParentLinks = hasSupabaseConfig ? supabaseApi.getParentLinks : async () => [];
export const respondToParentRequest = hasSupabaseConfig ? supabaseApi.respondToParentRequest : async () => {};
export const deleteParentLink = hasSupabaseConfig ? supabaseApi.deleteParentLink : async () => {};

// Tournament module — Supabase only (no mock fallback needed)
const noSupabase = () => { throw new Error('Requires Supabase'); };

// Tournament Weeks
export const listTournamentWeeks = hasSupabaseConfig ? supabaseApi.listTournamentWeeks : async () => [];
export const listMyTournamentWeeks = hasSupabaseConfig ? supabaseApi.listMyTournamentWeeks : async () => [];
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

// Phase 58 — Multi-format tournaments
export const listEventTeams = hasSupabaseConfig ? supabaseApi.listEventTeams : async () => [];
export const saveEventTeams = hasSupabaseConfig ? supabaseApi.saveEventTeams : noSupabase;
export const listEventStages = hasSupabaseConfig ? supabaseApi.listEventStages : async () => [];
export const listFormatEventMatches = hasSupabaseConfig ? supabaseApi.listFormatEventMatches : async () => [];
export const generateFormatDraw = hasSupabaseConfig ? supabaseApi.generateFormatDraw : noSupabase;
export const updateFormatMatchResult = hasSupabaseConfig ? supabaseApi.updateFormatMatchResult : noSupabase;
export const computeFormatStandings = hasSupabaseConfig ? supabaseApi.computeFormatStandings : async () => [];
export const generateFormatPlayoffs = hasSupabaseConfig ? supabaseApi.generateFormatPlayoffs : noSupabase;

// Draw Entries
export const getDrawEntries = hasSupabaseConfig ? supabaseApi.getDrawEntries : tournamentsMock.getDrawEntries;
export const saveDrawEntries = hasSupabaseConfig ? supabaseApi.saveDrawEntries : async () => [];
export const addDrawEntry = hasSupabaseConfig ? supabaseApi.addDrawEntry : noSupabase;
export const updateDrawEntry = hasSupabaseConfig ? supabaseApi.updateDrawEntry : noSupabase;
export const swapEntryPositions = hasSupabaseConfig ? supabaseApi.swapEntryPositions : noSupabase;
export const deleteDrawEntry = hasSupabaseConfig ? supabaseApi.deleteDrawEntry : async () => {};
export const moveEntryToGroup = hasSupabaseConfig ? supabaseApi.moveEntryToGroup : noSupabase;
// Phase 47 — organiser confirms/reverts an offline entry-fee payment
export const updateEntryPaymentStatus = hasSupabaseConfig ? supabaseApi.updateEntryPaymentStatus : noSupabase;
export const bulkAddDrawEntries = hasSupabaseConfig ? supabaseApi.bulkAddDrawEntries : async () => [];
export const getPlayerWeekParticipation = hasSupabaseConfig ? supabaseApi.getPlayerWeekParticipation : async () => [];
// Organiser cascading placement — Entries tab Add Player / Bulk Import
export const addDrawEntryWithPlacement = hasSupabaseConfig ? supabaseApi.addDrawEntryWithPlacement : noSupabase;
export const bulkAddDrawEntriesWithPlacement = hasSupabaseConfig ? supabaseApi.bulkAddDrawEntriesWithPlacement : async () => ({ placed: [], failed: null });
// Draw-sheet PDF upload — publishes a full, already-final draw in one call
export const publishDrawSheet = hasSupabaseConfig ? supabaseApi.publishDrawSheet : noSupabase;

// Event Matches
export const getEventMatches = hasSupabaseConfig ? supabaseApi.getEventMatches : tournamentsMock.getEventMatches;
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

// Phase 41 — generic email send
export const sendEmail = hasSupabaseConfig ? supabaseApi.sendEmail : async () => ({ ok: true, skipped: true });

// Phase 39 — Web Push
export const savePushSubscription   = hasSupabaseConfig ? supabaseApi.savePushSubscription   : async () => {};
export const deletePushSubscription = hasSupabaseConfig ? supabaseApi.deletePushSubscription : async () => {};
export const sendPushNotifications  = hasSupabaseConfig ? supabaseApi.sendPushNotifications  : async () => ({ ok: true, skipped: true });

// Phase 10 — Withdrawals & Alternates (+ Lucky Losers)
export const setEntryWithdrawn      = hasSupabaseConfig ? supabaseApi.setEntryWithdrawn      : noSupabase;
export const bulkSetWithdrawn       = hasSupabaseConfig ? supabaseApi.bulkSetWithdrawn       : noSupabase;
export const callInReplacement      = hasSupabaseConfig ? supabaseApi.callInReplacement      : noSupabase;
export const fillOpenSlotWithLuckyLoser = hasSupabaseConfig ? supabaseApi.fillOpenSlotWithLuckyLoser : noSupabase;
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
export const getMyEntries              = hasSupabaseConfig ? supabaseApi.getMyEntries              : tournamentsMock.getMyEntries;

// Phase 43 — Paid self-entry (Razorpay). Like the rest of the tournament
// module, these require Supabase (a logged-in session + the event_payments
// table) — no mock-mode fallback.
export const createEntryOrder     = hasSupabaseConfig ? razorpayApi.createEntryOrder     : noSupabase;
export const verifyEntryPayment   = hasSupabaseConfig ? razorpayApi.verifyEntryPayment   : noSupabase;
export const finalizePaidEntry    = hasSupabaseConfig ? supabaseApi.finalizePaidEntry    : noSupabase;
export const getMyUnclaimedPayment = hasSupabaseConfig ? supabaseApi.getMyUnclaimedPayment : async () => null;

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

// Phase 25 — AITA Calendar mirror
export const listAitaTournaments  = hasSupabaseConfig ? supabaseApi.listAitaTournaments  : async () => [];
export const listBrowsableTournaments = hasSupabaseConfig ? supabaseApi.listBrowsableTournaments : async () => [];
export const listAitaFilterFacets = hasSupabaseConfig ? supabaseApi.listAitaFilterFacets : async () => ({ cities: [], grades: [] });
export const getAitaTournament    = hasSupabaseConfig ? supabaseApi.getAitaTournament    : async () => null;
export const getLatestAitaSyncLog = hasSupabaseConfig ? supabaseApi.getLatestAitaSyncLog : async () => null;
export const triggerAitaSync      = hasSupabaseConfig ? supabaseApi.triggerAitaSync      : noSupabase;

// Phase 45 — crowdsourced AITA participation (Supabase only, no mock fallback)
export const declareAitaParticipation = hasSupabaseConfig ? supabaseApi.declareAitaParticipation : noSupabase;
export const withdrawAitaParticipation = hasSupabaseConfig ? supabaseApi.withdrawAitaParticipation : noSupabase;
export const getMyAitaParticipationForTournament = hasSupabaseConfig ? supabaseApi.getMyAitaParticipationForTournament : async () => null;
export const getMyAitaParticipation = hasSupabaseConfig ? supabaseApi.getMyAitaParticipation : async () => [];
export const uploadAitaDrawSheet = hasSupabaseConfig ? supabaseApi.uploadAitaDrawSheet : noSupabase;
export const getMyAitaDrawUploads = hasSupabaseConfig ? supabaseApi.getMyAitaDrawUploads : async () => [];
export const getAitaDrawUploadFileUrl = hasSupabaseConfig ? supabaseApi.getAitaDrawUploadFileUrl : async () => null;
export const getPendingAitaDrawUploads = hasSupabaseConfig ? supabaseApi.getPendingAitaDrawUploads : async () => [];
export const confirmAitaDrawUpload = hasSupabaseConfig ? supabaseApi.confirmAitaDrawUpload : noSupabase;
export const rejectAitaDrawUpload = hasSupabaseConfig ? supabaseApi.rejectAitaDrawUpload : noSupabase;
export const getConfirmedAitaDrawUploads = hasSupabaseConfig ? supabaseApi.getConfirmedAitaDrawUploads : async () => [];
export const publishAitaDrawSheet = hasSupabaseConfig ? supabaseApi.publishAitaDrawSheet : noSupabase;
export const uploadAitaResultsSheet = hasSupabaseConfig ? supabaseApi.uploadAitaResultsSheet : noSupabase;
export const getMyAitaResultsUploads = hasSupabaseConfig ? supabaseApi.getMyAitaResultsUploads : async () => [];
export const getAitaResultsUploadFileUrl = hasSupabaseConfig ? supabaseApi.getAitaResultsUploadFileUrl : async () => null;
export const getPendingAitaResultsUploads = hasSupabaseConfig ? supabaseApi.getPendingAitaResultsUploads : async () => [];
export const rejectAitaResultsUpload = hasSupabaseConfig ? supabaseApi.rejectAitaResultsUpload : noSupabase;
export const applyAitaResultsSheet = hasSupabaseConfig ? supabaseApi.applyAitaResultsSheet : noSupabase;

// Phase 46 — organizer claims on AITA Calendar tournaments
export const claimAitaTournamentAsOrganizer = hasSupabaseConfig ? supabaseApi.claimAitaTournamentAsOrganizer : noSupabase;
export const getMyAitaClaimForTournament = hasSupabaseConfig ? supabaseApi.getMyAitaClaimForTournament : async () => null;
export const listMyAitaClaims = hasSupabaseConfig ? supabaseApi.listMyAitaClaims : async () => [];
export const findSimilarAitaTournaments = hasSupabaseConfig ? supabaseApi.findSimilarAitaTournaments : async () => [];
export const getPendingAitaOrganizerClaims = hasSupabaseConfig ? supabaseApi.getPendingAitaOrganizerClaims : async () => [];
export const approveAitaOrganizerClaim = hasSupabaseConfig ? supabaseApi.approveAitaOrganizerClaim : noSupabase;
export const rejectAitaOrganizerClaim = hasSupabaseConfig ? supabaseApi.rejectAitaOrganizerClaim : noSupabase;
export const getUnresolvedAitaInterestForEvent = hasSupabaseConfig ? supabaseApi.getUnresolvedAitaInterestForEvent : async () => [];
export const resolveAitaInterest = hasSupabaseConfig ? supabaseApi.resolveAitaInterest : noSupabase;

// Phase 27 — AITA Player Rankings mirror
export const listAitaRankingFacets = hasSupabaseConfig ? supabaseApi.listAitaRankingFacets : async () => [];
export const listAitaRankingDates  = hasSupabaseConfig ? supabaseApi.listAitaRankingDates  : async () => [];
export const listAitaRankings      = hasSupabaseConfig ? supabaseApi.listAitaRankings      : async () => ({ rows: [], totalCount: 0 });
export const triggerAitaRankingsSync = hasSupabaseConfig ? supabaseApi.triggerAitaRankingsSync : noSupabase;
export const triggerUnifiedAitaSync  = hasSupabaseConfig ? supabaseApi.triggerUnifiedAitaSync  : async () => ({ calendar: null, rankings: null });
export const getAitaRankingsSyncOverview = hasSupabaseConfig ? supabaseApi.getAitaRankingsSyncOverview : async () => ({ combos: [], lastChecked: null });

// Phase 56 — signup approval
export const getPendingSignupApprovals = hasSupabaseConfig ? supabaseApi.getPendingSignupApprovals : mockApi.getPendingSignupApprovals;
export const lookupAitaPlayer          = hasSupabaseConfig ? supabaseApi.lookupAitaPlayer          : mockApi.lookupAitaPlayer;
export const approveSignup             = hasSupabaseConfig ? supabaseApi.approveSignup             : mockApi.approveSignup;
export const rejectSignup              = hasSupabaseConfig ? supabaseApi.rejectSignup              : mockApi.rejectSignup;

// Phase 44 — Computed skill rating (Glicko-2)
export const getPlayerRating        = hasSupabaseConfig ? supabaseApi.getPlayerRating        : async () => null;
export const getPlayerRatingHistory = hasSupabaseConfig ? supabaseApi.getPlayerRatingHistory  : async () => [];
export const getPlayerRatingsBatch  = hasSupabaseConfig ? supabaseApi.getPlayerRatingsBatch   : async () => [];
export const triggerComputeRatings  = hasSupabaseConfig ? supabaseApi.triggerComputeRatings   : noSupabase;

// Player Performance tab — auto-discovers every circuit a reg_no is ranked in.
// In mock mode we synthesise a deterministic multi-circuit trajectory per
// aitaReg so the Dashboard's Performance Snapshot has data in demo mode.
export const getPlayerAitaRankingHistory = hasSupabaseConfig
  ? supabaseApi.getPlayerAitaRankingHistory
  : async (aitaReg) => generateMockRankingHistory(aitaReg || 'DEMO');

// "Navy" design system — Profile annual entry allowance
export const getMyTournamentEntryCountThisYear = hasSupabaseConfig ? supabaseApi.getMyTournamentEntryCountThisYear : async () => 0;

// Phase 29 — multi-segment dashboard: ranking goals + training sessions
export const getRankingGoals      = hasSupabaseConfig ? supabaseApi.getRankingGoals      : async () => [];
export const getActivityGoal      = hasSupabaseConfig ? supabaseApi.getActivityGoal      : async (playerId) => {
  try {
    const raw = localStorage.getItem(`mtp_activity_goal_${playerId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
export const upsertActivityGoal   = hasSupabaseConfig ? supabaseApi.upsertActivityGoal   : async (playerId, patch) => {
  const row = { playerId, monthlyTarget: patch.monthlyTarget, minimumMatches: patch.minimumMatches, updatedAt: new Date().toISOString() };
  localStorage.setItem(`mtp_activity_goal_${playerId}`, JSON.stringify(row));
  return row;
};
export const getCloseInRankPeers  = hasSupabaseConfig ? supabaseApi.getCloseInRankPeers  : async () => [];
export const createRankingGoal    = hasSupabaseConfig ? supabaseApi.createRankingGoal    : noSupabase;
export const updateRankingGoal    = hasSupabaseConfig ? supabaseApi.updateRankingGoal    : noSupabase;
export const deleteRankingGoal    = hasSupabaseConfig ? supabaseApi.deleteRankingGoal    : noSupabase;
export const getTrainingSessions  = hasSupabaseConfig ? supabaseApi.getTrainingSessions  : async () => [];
export const logTrainingSession   = hasSupabaseConfig ? supabaseApi.logTrainingSession   : noSupabase;
export const deleteTrainingSession = hasSupabaseConfig ? supabaseApi.deleteTrainingSession : noSupabase;

// Phase 42 — training video upload
export const uploadTrainingVideo = hasSupabaseConfig ? supabaseApi.uploadTrainingVideo : noSupabase;
export const getTrainingVideoUrl = hasSupabaseConfig ? supabaseApi.getTrainingVideoUrl : async () => null;
export const getTrainingSessionsLoggedByCoach = hasSupabaseConfig ? supabaseApi.getTrainingSessionsLoggedByCoach : async () => [];

// Phase 30 — tracker/tournament linking
export const getMatchesForSegment = hasSupabaseConfig ? supabaseApi.getMatchesForSegment : async () => [];

// Phase 31 — coach: drill library + segment-aware roster
export const getDrillLibrary      = hasSupabaseConfig ? supabaseApi.getDrillLibrary      : async () => [];
export const createDrill          = hasSupabaseConfig ? supabaseApi.createDrill          : noSupabase;
export const deleteDrill          = hasSupabaseConfig ? supabaseApi.deleteDrill          : noSupabase;
export const getRosterWithSegments = hasSupabaseConfig ? supabaseApi.getRosterWithSegments : async () => [];

// Phase 32 — Coach Intelligence System: drill assignments
export const getDrillAssignments    = hasSupabaseConfig ? supabaseApi.getDrillAssignments    : async () => [];
export const createDrillAssignment  = hasSupabaseConfig ? supabaseApi.createDrillAssignment  : noSupabase;
export const updateDrillAssignment  = hasSupabaseConfig ? supabaseApi.updateDrillAssignment  : noSupabase;

// Only meaningful in mock mode — LoginPage only shows these when useMock is true.
export const DEMO_CREDENTIALS = mockApi.DEMO_CREDENTIALS;
export const usingMock = !hasSupabaseConfig;
