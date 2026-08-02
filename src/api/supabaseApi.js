import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from '../lib/supabaseClient';

const NATIVE_OAUTH_REDIRECT = 'com.matchtrackerpro.app://login-callback';
import { computeCascadingPlacement } from '../utils/nominationSort';
import { checkAgeEligibility } from '../utils/eligibility';
import { noShowPenaltyPoints, usesLateWithdrawalPenalty, LATE_WITHDRAWAL_PENALTY_POINTS, bracketSize, getEntryStage, ENTRY_STAGE, categoryGender, getAitaDrawDefaults, extractAgeGroupsFromCategoryText, extractGendersFromCategoryText, categoriesForGenders } from '../utils/aitaGradeRules';
import { buildCircuits } from '../lib/segments';
import { computeStats, computeServeStats } from '../lib/analytics';
import { computeStreak } from '../lib/streaks';

// ---------------------------------------------------------------------------
// REAL API LAYER (Supabase)
// ---------------------------------------------------------------------------
// Same function names/shapes as api/mockApi.js on purpose — this is the
// production replacement. See src/context/AuthContext.jsx and every caller
// of api.* for why that matters: nothing above this file needed to change.
// ---------------------------------------------------------------------------

function publicUser(supabaseUser) {
  const meta = supabaseUser.user_metadata || {};
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    name: meta.name || supabaseUser.email.split('@')[0],
    role: meta.role || 'user',
  };
}

export async function signup(email, password, name, role = 'player') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role } },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Signup failed — please try again');
  return { token: data.session?.access_token || null, user: publicUser(data.user) };
}

export async function loginWithGoogle() {
  if (Capacitor.isNativePlatform()) {
    // Google refuses to authenticate inside an embedded WebView, so the flow
    // has to go through a real browser (a Custom Tab via the Browser plugin)
    // and come back through a custom URL scheme deep link — see
    // completeNativeOAuthLogin() below, wired up to appUrlOpen in main.jsx.
    // The redirect URL must be added to Supabase's Authentication ->
    // URL Configuration -> Redirect URLs allow list, or GoTrue rejects it.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: NATIVE_OAUTH_REDIRECT, skipBrowserRedirect: true },
    });
    if (error) throw new Error(error.message);
    await Browser.open({ url: data.url });
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/' },
  });
  if (error) throw new Error(error.message);
}

// Called with the deep-link URL Android hands back after the Custom Tab
// completes Google sign-in (see appUrlOpen listener in main.jsx). Implicit
// flow (this project's default) puts the session directly in the URL
// fragment, so no code exchange is needed — just lift the tokens out and
// hand them to the client. Returns true if the URL was an OAuth callback.
export async function completeNativeOAuthLogin(url) {
  if (!url.startsWith(NATIVE_OAUTH_REDIRECT)) return false;
  const hash = url.split('#')[1];
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return false;
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw new Error(error.message);
  await Browser.close();
  return true;
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const err = new Error(error.message || 'Incorrect email or password');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }
  return { token: data.session.access_token, user: publicUser(data.user) };
}

export async function logout() {
  await supabase.auth.signOut();
  return { ok: true };
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return { token: data.session.access_token, user: publicUser(data.session.user) };
}

export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    // INITIAL_SESSION fires once, synchronously on subscribe, with whatever
    // session already exists (or null) — handling it here means AuthContext
    // no longer needs its own separate supabase.auth.getSession() call on
    // mount. That used to race this subscription: both paths independently
    // loaded the profile and called setUser for the same sign-in, and if the
    // first of the two ever hit a transient hiccup fetching the profile, the
    // app would briefly render as "role not confirmed" before the second
    // call corrected it — a spurious remount that re-fired every dashboard
    // fetch a second time. One event stream now, so that race can't happen.
    if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      callback(publicUser(session.user));
    } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
      callback(null);
    }
  });
  return () => subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Match history
// ---------------------------------------------------------------------------

function rowToMatch(row) {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    selfName: row.self_name,
    oppName: row.opp_name,
    tournament: row.tournament,
    date: row.match_date,
    round: row.round,
    sessionType: row.session_type,
    formatPreset: row.format_preset,
    formatLabel: row.format_label,
    pointTarget: row.point_target,
    surface: row.surface,
    indoorOutdoor: row.indoor_outdoor,
    oppHandedness: row.opp_handedness,
    playingStyle: row.playing_style,
    rankSeed: row.rank_seed,
    governingBody: row.governing_body,
    circuit: row.circuit,
    city: row.city,
    ageGroup: row.age_group,
    weather: row.weather,
    notes: row.notes,
    scoreSummary: row.score_summary,
    winner: row.winner,
    pointCount: row.point_count,
    matchDurationMs: row.match_duration_ms,
    points: row.points,
    sets: row.sets,
    eventMatchId: row.event_match_id,
    normalizedCategory: row.normalized_category,
    normalizedSubcategory: row.normalized_subcategory,
  };
}

export async function listMatches(userId) {
  const { data, error } = await supabase
    .from('matches')
    .select('id, user_id, created_at, self_name, opp_name, tournament, match_date, session_type, format_label, score_summary, winner, point_count')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToMatch);
}

export async function saveMatch(userId, record) {
  const row = {
    user_id: userId,
    self_name: record.selfName,
    opp_name: record.oppName,
    tournament: record.tournament || null,
    match_date: record.date || null,
    round: record.round || null,
    session_type: record.sessionType,
    format_preset: record.formatPreset || null,
    format_label: record.formatLabel || null,
    point_target: record.pointTarget || null,
    surface: record.surface || null,
    indoor_outdoor: record.indoorOutdoor || null,
    opp_handedness: record.oppHandedness || null,
    playing_style: record.playingStyle || null,
    rank_seed: record.rankSeed || null,
    governing_body: record.governingBody || null,
    circuit: record.circuit || null,
    city: record.city || null,
    age_group: record.ageGroup || null,
    weather: record.weather || null,
    notes: record.notes || null,
    score_summary: record.scoreSummary || null,
    winner: record.winner || null,
    point_count: record.pointCount || 0,
    match_duration_ms: record.matchDurationMs || null,
    points: record.points || [],
    sets: record.sets || [],
    event_match_id: record.eventMatchId || null,
    normalized_category: record.normalizedCategory || null,
    normalized_subcategory: record.normalizedSubcategory || null,
  };
  const { data, error } = await supabase.from('matches').insert(row).select().single();
  if (error) throw new Error(error.message);
  return rowToMatch(data);
}

export async function getMatch(userId, matchId) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .eq('user_id', userId)
    .single();
  if (error) throw new Error('Match not found');
  return rowToMatch(data);
}

export async function deleteMatch(userId, matchId) {
  const { error } = await supabase.from('matches').delete().eq('id', matchId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Phase 35 — retroactive point-by-point entry (RetroactivePointEntryModal.jsx)
// appends to an already-saved match's points instead of only ever inserting
// a brand-new row. Deliberately only touches points/point_count — the
// match's already-recorded outcome (score_summary/winner/sets) reflects
// what actually happened and isn't recomputed from the retroactively-added
// point detail.
export async function updateMatchPoints(userId, matchId, points) {
  const { data, error } = await supabase
    .from('matches')
    .update({ points, point_count: points.length })
    .eq('id', matchId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToMatch(data);
}

// ---------------------------------------------------------------------------
// Phase 34 — Streak Freezes (src/lib/streaks.js computes the streak itself
// client-side from matches.match_date + training_sessions.session_date;
// this table only stores the user-declared "skip this day" dates.)
// ---------------------------------------------------------------------------

function rowToStreakFreeze(row) {
  return { id: row.id, userId: row.user_id, freezeDate: row.freeze_date, createdAt: row.created_at };
}

export async function getStreakFreezes(userId) {
  const { data, error } = await supabase
    .from('streak_freezes')
    .select('*')
    .eq('user_id', userId)
    .order('freeze_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToStreakFreeze);
}

export async function addStreakFreeze(userId, freezeDate) {
  const { data, error } = await supabase
    .from('streak_freezes')
    .insert({ user_id: userId, freeze_date: freezeDate })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToStreakFreeze(data);
}

export async function deleteStreakFreeze(freezeId) {
  const { error } = await supabase.from('streak_freezes').delete().eq('id', freezeId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Multi-segment dashboard, Phase 4 — tracker sessions for one segment, keyed
// off both normalized_category + normalized_subcategory (see
// governingBodies.js's normalize* helpers + supabase/phase30_matches_event_link.sql).
// Feeds Phase 5's Match Analytics aggregation.
export async function getMatchesForSegment(userId, category, subcategory) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('user_id', userId)
    .eq('normalized_category', category)
    .eq('normalized_subcategory', subcategory)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToMatch);
}

// ---------------------------------------------------------------------------
// Tournament Weeks
// ---------------------------------------------------------------------------

function rowToWeek(row) {
  return {
    id: row.id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    name: row.name,
    subtitle: row.subtitle,
    tournamentCode: row.tournament_code,
    location: row.location,
    city: row.city,
    stateAbbr: row.state_abbr,
    surface: row.surface,
    startDate: row.start_date,
    endDate: row.end_date,
    referee: row.referee,
    numCourts: row.num_courts,
    courtNames: row.court_names || ['Court 1'],
    dayStartTime: row.day_start_time,
    matchDurationMins: row.match_duration_mins,
    restMinsBetween: row.rest_mins_between,
    maxSinglesPerPlayer: row.max_singles_per_player,
    maxDoublesPerPlayer: row.max_doubles_per_player,
    playingUpAllowed: row.playing_up_allowed,
    playingDownAllowed: row.playing_down_allowed,
    // Phase 12 — fact sheet fields
    grade: row.grade,
    entryDeadline: row.entry_deadline,
    withdrawalDeadline: row.withdrawal_deadline,
    freezeDeadline: row.freeze_deadline,
    qualifyingStartDate: row.qualifying_start_date,
    qualifyingEndDate: row.qualifying_end_date,
    directorName: row.director_name,
    directorPhone: row.director_phone,
    directorEmail: row.director_email,
    refereePhone: row.referee_phone,
    refereeEmail: row.referee_email,
    venueAddress: row.venue_address,
    venuePincode: row.venue_pincode,
    venuePhone: row.venue_phone,
    ballBrand: row.ball_brand,
    hasFloodlights: row.has_floodlights,
    entryFeeSingles: row.entry_fee_singles,
    entryFeeDoubles: row.entry_fee_doubles,
    dailyAllowance: row.daily_allowance,
    signinInstructions: row.signin_instructions,
    // Phase 19 — organiser extra fields
    stringingCharges: row.stringing_charges,
    aitaCardRequired: row.aita_card_required || false,
    hotelOptions: row.hotel_options || [],
    // Phase 45 — 'organiser' (default) | 'aita_crowdsourced'
    source: row.source || 'organiser',
    // joined events count if present
    eventCount: row.events ? row.events.length : undefined,
  };
}

export async function listTournamentWeeks() {
  const { data, error } = await supabase
    .from('tournament_weeks')
    .select('*, events(id)')
    .order('start_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToWeek);
}

export async function getTournamentWeek(id) {
  const { data, error } = await supabase
    .from('tournament_weeks')
    .select('*, events(*)')
    .eq('id', id)
    .single();
  if (error) throw new Error('Tournament week not found');
  return {
    ...rowToWeek(data),
    events: (data.events || []).map(rowToEvent),
  };
}

export async function createTournamentWeek(userId, week) {
  const courtNames = week.courtNames && week.courtNames.length > 0
    ? week.courtNames
    : Array.from({ length: week.numCourts || 1 }, (_, i) => `Court ${i + 1}`);

  const row = {
    created_by: userId,
    name: week.name,
    subtitle: week.subtitle || null,
    tournament_code: week.tournamentCode || null,
    location: week.location || null,
    city: week.city || null,
    state_abbr: week.stateAbbr || null,
    surface: week.surface || null,
    start_date: week.startDate || null,
    end_date: week.endDate || null,
    referee: week.referee || null,
    num_courts: week.numCourts || 1,
    court_names: courtNames,
    day_start_time: week.dayStartTime || '09:00:00',
    match_duration_mins: week.matchDurationMins || 90,
    rest_mins_between: week.restMinsBetween || 30,
    max_singles_per_player: week.maxSinglesPerPlayer || 2,
    max_doubles_per_player: week.maxDoublesPerPlayer || 1,
    playing_up_allowed: week.playingUpAllowed !== undefined ? week.playingUpAllowed : true,
    playing_down_allowed: week.playingDownAllowed !== undefined ? week.playingDownAllowed : false,
    // Phase 45 — 'organiser' (default) | 'aita_crowdsourced' for shadow weeks
    // published from a crowdsourced AITA draw-sheet upload.
    source: week.source || 'organiser',
    // Phase 12 — fact sheet fields (all optional)
    grade: week.grade || null,
    entry_deadline: week.entryDeadline || null,
    withdrawal_deadline: week.withdrawalDeadline || null,
    freeze_deadline: week.freezeDeadline || null,
    qualifying_start_date: week.qualifyingStartDate || null,
    qualifying_end_date: week.qualifyingEndDate || null,
    director_name: week.directorName || null,
    director_phone: week.directorPhone || null,
    director_email: week.directorEmail || null,
    referee_phone: week.refereePhone || null,
    referee_email: week.refereeEmail || null,
    venue_address: week.venueAddress || null,
    venue_pincode: week.venuePincode || null,
    venue_phone: week.venuePhone || null,
    ball_brand: week.ballBrand || null,
    has_floodlights: week.hasFloodlights !== undefined ? week.hasFloodlights : null,
    entry_fee_singles: week.entryFeeSingles ? Number(week.entryFeeSingles) : null,
    entry_fee_doubles: week.entryFeeDoubles ? Number(week.entryFeeDoubles) : null,
    daily_allowance: week.dailyAllowance ? Number(week.dailyAllowance) : null,
    signin_instructions: week.signinInstructions || null,
    // Phase 19 — organiser extra fields
    stringing_charges: week.stringingCharges || null,
    aita_card_required: week.aitaCardRequired !== undefined ? week.aitaCardRequired : false,
    hotel_options: week.hotelOptions || [],
  };
  const { data, error } = await supabase.from('tournament_weeks').insert(row).select().single();
  if (error) throw new Error(error.message);
  return rowToWeek(data);
}

export async function updateTournamentWeek(weekId, week) {
  const updates = {};
  if (week.name !== undefined) updates.name = week.name;
  if (week.subtitle !== undefined) updates.subtitle = week.subtitle;
  if (week.tournamentCode !== undefined) updates.tournament_code = week.tournamentCode;
  if (week.location !== undefined) updates.location = week.location;
  if (week.city !== undefined) updates.city = week.city;
  if (week.stateAbbr !== undefined) updates.state_abbr = week.stateAbbr;
  if (week.surface !== undefined) updates.surface = week.surface;
  if (week.startDate !== undefined) updates.start_date = week.startDate;
  if (week.endDate !== undefined) updates.end_date = week.endDate;
  if (week.referee !== undefined) updates.referee = week.referee;
  if (week.numCourts !== undefined) updates.num_courts = week.numCourts;
  if (week.courtNames !== undefined) updates.court_names = week.courtNames;
  if (week.dayStartTime !== undefined) updates.day_start_time = week.dayStartTime;
  // Phase 12 — fact sheet fields
  if (week.grade !== undefined) updates.grade = week.grade;
  if (week.entryDeadline !== undefined) updates.entry_deadline = week.entryDeadline;
  if (week.withdrawalDeadline !== undefined) updates.withdrawal_deadline = week.withdrawalDeadline;
  if (week.freezeDeadline !== undefined) updates.freeze_deadline = week.freezeDeadline;
  if (week.qualifyingStartDate !== undefined) updates.qualifying_start_date = week.qualifyingStartDate;
  if (week.qualifyingEndDate !== undefined) updates.qualifying_end_date = week.qualifyingEndDate;
  if (week.directorName !== undefined) updates.director_name = week.directorName;
  if (week.directorPhone !== undefined) updates.director_phone = week.directorPhone;
  if (week.directorEmail !== undefined) updates.director_email = week.directorEmail;
  if (week.refereePhone !== undefined) updates.referee_phone = week.refereePhone;
  if (week.refereeEmail !== undefined) updates.referee_email = week.refereeEmail;
  if (week.venueAddress !== undefined) updates.venue_address = week.venueAddress;
  if (week.venuePincode !== undefined) updates.venue_pincode = week.venuePincode;
  if (week.venuePhone !== undefined) updates.venue_phone = week.venuePhone;
  if (week.ballBrand !== undefined) updates.ball_brand = week.ballBrand;
  if (week.hasFloodlights !== undefined) updates.has_floodlights = week.hasFloodlights;
  if (week.entryFeeSingles !== undefined) updates.entry_fee_singles = week.entryFeeSingles ? Number(week.entryFeeSingles) : null;
  if (week.entryFeeDoubles !== undefined) updates.entry_fee_doubles = week.entryFeeDoubles ? Number(week.entryFeeDoubles) : null;
  if (week.dailyAllowance !== undefined) updates.daily_allowance = week.dailyAllowance ? Number(week.dailyAllowance) : null;
  if (week.signinInstructions !== undefined) updates.signin_instructions = week.signinInstructions;
  // Phase 19 — organiser extra fields
  if (week.stringingCharges !== undefined) updates.stringing_charges = week.stringingCharges;
  if (week.aitaCardRequired !== undefined) updates.aita_card_required = week.aitaCardRequired;
  if (week.hotelOptions !== undefined) updates.hotel_options = week.hotelOptions;

  const { data, error } = await supabase
    .from('tournament_weeks')
    .update(updates)
    .eq('id', weekId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToWeek(data);
}

export async function deleteTournamentWeek(userId, weekId) {
  const { error } = await supabase
    .from('tournament_weeks')
    .delete()
    .eq('id', weekId)
    .eq('created_by', userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Events (per category/age-group within a tournament week)
// ---------------------------------------------------------------------------

function rowToEvent(row) {
  return {
    id: row.id,
    tournamentWeekId: row.tournament_week_id,
    createdAt: row.created_at,
    category: row.category,
    ageGroup: row.age_group,
    isDoubles: row.is_doubles,
    drawSize: row.draw_size,
    numSeeds: row.num_seeds,
    hasQualifying: row.has_qualifying,
    qualifyingSize: row.qualifying_size,
    qualifyingSpots: row.qualifying_spots,
    status: row.status,
    // Phase 14 fields
    maxMainDirect: row.max_main_direct ?? (row.draw_size ? row.draw_size - 9 : null),
    maxQualDirect: row.max_qual_direct ?? (row.qualifying_size ? row.qualifying_size - 4 : null),
    entriesOpen: row.entries_open ?? false,
    entryOpenDate: row.entry_open_date,
    entryCloseDate: row.entry_close_date,
    // Phase 19 — per-category sign-in window & play dates
    signinDate: row.signin_date,
    signinTime: row.signin_time,
    firstDayOfPlay: row.first_day_of_play,
    lastDayOfPlay: row.last_day_of_play,
  };
}

export async function listEvents(weekId) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('tournament_week_id', weekId)
    .order('category', { ascending: true })
    .order('age_group', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(rowToEvent);
}

export async function getEvent(eventId) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single();
  if (error) throw new Error('Event not found');
  return rowToEvent(data);
}

export async function createEvent(weekId, event) {
  const row = {
    tournament_week_id: weekId,
    category: event.category,
    age_group: event.ageGroup,
    is_doubles: event.isDoubles || false,
    draw_size: event.drawSize || 32,
    num_seeds: event.numSeeds || 4,
    has_qualifying: event.hasQualifying || false,
    qualifying_size: event.qualifyingSize || null,
    qualifying_spots: event.qualifyingSpots || null,
    max_main_direct: event.maxMainDirect ?? null,
    max_qual_direct: event.maxQualDirect ?? null,
    status: 'setup',
    // Phase 19 — per-category sign-in window & play dates
    signin_date: event.signinDate || null,
    signin_time: event.signinTime || null,
    first_day_of_play: event.firstDayOfPlay || null,
    last_day_of_play: event.lastDayOfPlay || null,
  };
  const { data, error } = await supabase.from('events').insert(row).select().single();
  if (error) throw new Error(error.message);
  return rowToEvent(data);
}

export async function updateEvent(eventId, updates) {
  const row = {};
  if (updates.drawSize !== undefined) row.draw_size = updates.drawSize;
  if (updates.numSeeds !== undefined) row.num_seeds = updates.numSeeds;
  if (updates.hasQualifying !== undefined) row.has_qualifying = updates.hasQualifying;
  if (updates.qualifyingSize !== undefined) row.qualifying_size = updates.qualifyingSize;
  if (updates.qualifyingSpots !== undefined) row.qualifying_spots = updates.qualifyingSpots;
  if (updates.status !== undefined) row.status = updates.status;
  if (updates.entriesOpen !== undefined) row.entries_open = updates.entriesOpen;
  if (updates.entryOpenDate !== undefined) row.entry_open_date = updates.entryOpenDate;
  if (updates.entryCloseDate !== undefined) row.entry_close_date = updates.entryCloseDate;
  if (updates.maxMainDirect !== undefined) row.max_main_direct = updates.maxMainDirect;
  if (updates.maxQualDirect !== undefined) row.max_qual_direct = updates.maxQualDirect;
  // Phase 19 — per-category sign-in window & play dates
  if (updates.signinDate !== undefined) row.signin_date = updates.signinDate;
  if (updates.signinTime !== undefined) row.signin_time = updates.signinTime;
  if (updates.firstDayOfPlay !== undefined) row.first_day_of_play = updates.firstDayOfPlay;
  if (updates.lastDayOfPlay !== undefined) row.last_day_of_play = updates.lastDayOfPlay;

  const { data, error } = await supabase
    .from('events')
    .update(row)
    .eq('id', eventId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToEvent(data);
}

export async function deleteEvent(eventId) {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Draw Entries (per event)
// ---------------------------------------------------------------------------

function rowToEntry(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    drawType: row.draw_type,
    position: row.position,
    seed: row.seed,
    isBye: row.is_bye,
    qualifierSlot: row.qualifier_slot,
    // Player 1 / singles player
    playerId: row.player_id,
    familyName: row.family_name,
    firstName: row.first_name,
    aitaReg: row.aita_reg,
    playerState: row.player_state,
    ranking: row.ranking,
    dateOfBirth: row.date_of_birth,
    statusCode: row.status_code,
    // Partner (doubles)
    partnerId: row.partner_id,
    partnerFamilyName: row.partner_family_name,
    partnerFirstName: row.partner_first_name,
    partnerAitaReg: row.partner_aita_reg,
    partnerState: row.partner_state,
    partnerRanking: row.partner_ranking,
    // Alternate
    isAlternate: row.is_alternate,
    isOnsiteSignin: row.is_onsite_signin || false,
    replacingName: row.replacing_name,
    isWithdrawn: row.is_withdrawn || false,
    // Phase 14 fields
    entrySource: row.entry_source || 'organiser',
    entryStatus: row.entry_status || 'placed',
    enteredBy: row.entered_by || null,
    withdrawalDate: row.withdrawal_date || null,
    withdrawalType: row.withdrawal_type || null,
    // Phase 43 — paid entry
    paymentId: row.payment_id || null,
  };
}

export async function getDrawEntries(eventId, drawType) {
  const { data, error } = await supabase
    .from('draw_entries')
    .select('*')
    .eq('event_id', eventId)
    .eq('draw_type', drawType)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(rowToEntry);
}

export async function saveDrawEntries(eventId, drawType, entries) {
  await supabase
    .from('draw_entries')
    .delete()
    .eq('event_id', eventId)
    .eq('draw_type', drawType);

  if (entries.length === 0) return [];

  const rows = entries.map(e => ({
    event_id: eventId,
    draw_type: drawType,
    position: e.position,
    seed: e.seed ? Number(e.seed) : null,
    is_bye: e.isBye || false,
    qualifier_slot: e.qualifierSlot || null,
    player_id: e.playerId || null,
    family_name: e.familyName,
    first_name: e.firstName || null,
    aita_reg: e.aitaReg || null,
    player_state: e.playerState || null,
    ranking: e.ranking ? Number(e.ranking) : null,
    date_of_birth: e.dateOfBirth || null,
    status_code: e.statusCode || null,
    partner_id: e.partnerId || null,
    partner_family_name: e.partnerFamilyName || null,
    partner_first_name: e.partnerFirstName || null,
    partner_aita_reg: e.partnerAitaReg || null,
    partner_state: e.partnerState || null,
    partner_ranking: e.partnerRanking ? Number(e.partnerRanking) : null,
    is_alternate: e.isAlternate || false,
    replacing_name: e.replacingName || null,
  }));

  const { data, error } = await supabase.from('draw_entries').insert(rows).select();
  if (error) throw new Error(error.message);
  return data.map(rowToEntry);
}

export async function addDrawEntry(eventId, drawType, entry) {
  const row = {
    event_id: eventId,
    draw_type: drawType,
    position: Number(entry.position),
    seed: entry.seed ? Number(entry.seed) : null,
    is_bye: entry.isBye || false,
    qualifier_slot: entry.qualifierSlot || null,
    player_id: entry.playerId || null,
    family_name: entry.familyName,
    first_name: entry.firstName || null,
    aita_reg: entry.aitaReg || null,
    player_state: entry.playerState || null,
    ranking: entry.ranking ? Number(entry.ranking) : null,
    date_of_birth: entry.dateOfBirth || null,
    status_code: entry.statusCode || null,
    partner_id: entry.partnerId || null,
    partner_family_name: entry.partnerFamilyName || null,
    partner_first_name: entry.partnerFirstName || null,
    partner_aita_reg: entry.partnerAitaReg || null,
    partner_state: entry.partnerState || null,
    partner_ranking: entry.partnerRanking ? Number(entry.partnerRanking) : null,
    is_alternate: entry.isAlternate || false,
    is_onsite_signin: entry.isOnsiteSignin || false,
    replacing_name: entry.replacingName || null,
  };
  const { data, error } = await supabase.from('draw_entries').insert(row).select().single();
  if (error) throw new Error(error.message);
  return rowToEntry(data);
}

export async function updateDrawEntry(entryId, updates) {
  const row = {
    position: Number(updates.position),
    seed: updates.seed ? Number(updates.seed) : null,
    status_code: updates.statusCode || null,
    family_name: updates.familyName,
    first_name: updates.firstName || null,
    aita_reg: updates.aitaReg || null,
    player_state: updates.playerState || null,
    ranking: updates.ranking ? Number(updates.ranking) : null,
    date_of_birth: updates.dateOfBirth || null,
    player_id: updates.playerId || null,
    partner_family_name: updates.partnerFamilyName || null,
    partner_first_name: updates.partnerFirstName || null,
    partner_aita_reg: updates.partnerAitaReg || null,
    partner_state: updates.partnerState || null,
    partner_ranking: updates.partnerRanking ? Number(updates.partnerRanking) : null,
    is_alternate: updates.isAlternate || false,
    is_onsite_signin: updates.isOnsiteSignin || false,
    replacing_name: updates.replacingName || null,
  };
  const { data, error } = await supabase
    .from('draw_entries').update(row).eq('id', entryId).select().single();
  if (error) throw new Error(error.message);
  return rowToEntry(data);
}

// Swaps two entries' positions safely. draw_entries has a unique
// (event_id, draw_type, position) constraint, so writing both new positions
// independently — even "at the same time" via Promise.all — collides:
// whichever update commits finds the other row still sitting at the
// position it's trying to move into. Routing one entry through a temporary
// out-of-range position (-1, never used by a real draw position) means
// neither write ever collides with the other's current row.
export async function swapEntryPositions(entryAId, positionA, entryBId, positionB) {
  const setPos = async (id, position) => {
    const { error } = await supabase.from('draw_entries').update({ position }).eq('id', id);
    if (error) throw new Error(error.message);
  };
  await setPos(entryAId, -1);
  await setPos(entryBId, positionA);
  await setPos(entryAId, positionB);
}

export async function deleteDrawEntry(entryId) {
  const { error } = await supabase.from('draw_entries').delete().eq('id', entryId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Move an entry to a different draw group (e.g. main → alternates, qualifying → withdrawal).
// Calculates the next available position in the target group, then updates draw_type/position/flags in-place.
// Uses UPDATE rather than delete+insert to preserve the entry id and any linked match history.
export async function moveEntryToGroup(entryId, targetGroup, eventId) {
  // targetGroup: 'main' | 'qualifying' | 'alternates' | 'withdrawal'
  const isAlternate  = targetGroup === 'alternates';
  const isWithdrawal = targetGroup === 'withdrawal';
  const drawType     = isWithdrawal ? 'withdrawal' : isAlternate ? 'main' : targetGroup;

  // Find the next available position in the target group
  const { data: existing } = await supabase
    .from('draw_entries')
    .select('position, draw_type, is_alternate')
    .eq('event_id', eventId)
    .eq('draw_type', drawType)
    .eq('is_alternate', isAlternate)
    .order('position', { ascending: false })
    .limit(1);

  let nextPos = 1;
  if (existing && existing.length > 0) nextPos = existing[0].position + 1;

  const updates = {
    draw_type:      drawType,
    position:       nextPos,
    is_alternate:   isAlternate,
    is_withdrawn:   isWithdrawal,
    entry_status:   isWithdrawal ? 'withdrawn' : 'placed',
    withdrawal_type: isWithdrawal ? 'W' : null,
    withdrawal_date: isWithdrawal ? new Date().toISOString().slice(0, 10) : null,
  };

  const { data, error } = await supabase
    .from('draw_entries').update(updates).eq('id', entryId).select().single();
  if (error) throw new Error(error.message);
  return rowToEntry(data);
}

// entrySource: 'organiser' (default, the two existing callers) | 'aita_import'
// (phase 45 — entries transcribed from a crowdsourced draw-sheet upload).
export async function bulkAddDrawEntries(eventId, drawType, entries, entrySource = 'organiser') {
  if (entries.length === 0) return [];
  const { data: { user } } = await supabase.auth.getUser();
  const isWd = drawType === 'withdrawal';
  const rows = entries.map(e => ({
    event_id: eventId,
    draw_type: drawType,
    position: Number(e.position),
    seed: e.seed ? Number(e.seed) : null,
    is_bye: false,
    family_name: e.familyName,
    first_name: e.firstName || null,
    aita_reg: e.aitaReg || null,
    player_state: e.playerState || null,
    ranking: e.ranking ? Number(e.ranking) : null,
    status_code: e.statusCode || null,
    is_alternate: e.isAlternate || false,
    entry_source: entrySource,
    // draw_type='withdrawal' means they withdrew before the draw was made
    entry_status: isWd ? 'withdrawn' : 'placed',
    is_withdrawn: isWd ? true : false,
    withdrawal_type: isWd ? (e.withdrawalType || 'W') : null,
    withdrawal_date: isWd ? new Date().toISOString().slice(0, 10) : null,
    entered_by: user?.id || null,
  }));
  const { data, error } = await supabase.from('draw_entries').insert(rows).select();
  if (error) throw new Error(error.message);
  return data.map(rowToEntry);
}

// Get all draw positions a player holds in a week (for participation limit checks)
// Returns array of { eventId, category, ageGroup, isDoubles }
export async function getPlayerWeekParticipation(weekId, aitaReg, excludeEventId) {
  if (!aitaReg) return [];
  // Step 1: get all other events in this week
  const { data: weekEvents, error: evErr } = await supabase
    .from('events')
    .select('id, is_doubles, category, age_group')
    .eq('tournament_week_id', weekId)
    .neq('id', excludeEventId);
  if (evErr) throw new Error(evErr.message);
  if (!weekEvents || weekEvents.length === 0) return [];

  const eventIds = weekEvents.map(e => e.id);

  // Step 2: find entries for this player (as player or partner) in those events
  const [{ data: asPlayer }, { data: asPartner }] = await Promise.all([
    supabase.from('draw_entries').select('id, event_id').in('event_id', eventIds).eq('aita_reg', aitaReg),
    supabase.from('draw_entries').select('id, event_id').in('event_id', eventIds).eq('partner_aita_reg', aitaReg),
  ]);

  const seen = new Set();
  const result = [];
  for (const row of [...(asPlayer || []), ...(asPartner || [])]) {
    if (seen.has(row.event_id)) continue;
    seen.add(row.event_id);
    const ev = weekEvents.find(e => e.id === row.event_id);
    if (ev) result.push({ eventId: ev.id, category: ev.category, ageGroup: ev.age_group, isDoubles: ev.is_doubles });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Phase 18 — Player self-entry
// ---------------------------------------------------------------------------

// Check if the current user already has an active entry in this event —
// whether they entered themselves (entered_by) or an organiser added them
// directly and linked their account (player_id). Ordered + limited to 1
// rather than maybeSingle() since both columns can independently match.
export async function getMyEventEntry(eventId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('draw_entries')
    .select('*')
    .eq('event_id', eventId)
    .or(`entered_by.eq.${user.id},player_id.eq.${user.id}`)
    .neq('entry_status', 'withdrawn')
    .eq('is_withdrawn', false)
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? rowToEntry(data[0]) : null;
}

// Fetches the event's tournament-week deadlines (and, for entry actions,
// the organiser's entries_open toggle) and throws if the action isn't
// currently allowed — the single choke point self-entry, doubles
// invitations, and self-withdrawal all go through, so neither the deadline
// rules nor the organiser's manual toggle can be bypassed by calling the
// API directly even if a UI button is hidden. `checkEntriesOpen` should be
// true for entry actions (entries_open defaults to false until the
// organiser explicitly opens them) and left false for withdrawal, which
// entries_open has no bearing on. See ENTRY_STAGE / getEntryStage in
// aitaGradeRules.js.
async function assertEntryStage(eventId, allowedStages, actionLabel, checkEntriesOpen = false) {
  const { data, error } = await supabase
    .from('events')
    .select('entries_open, tournament_week:tournament_weeks(entry_deadline, withdrawal_deadline, freeze_deadline)')
    .eq('id', eventId)
    .single();
  if (error) throw new Error(error.message);
  const week = data?.tournament_week;
  const stage = getEntryStage({
    entryDeadline: week?.entry_deadline,
    withdrawalDeadline: week?.withdrawal_deadline,
    freezeDeadline: week?.freeze_deadline,
  });
  if (checkEntriesOpen && !data?.entries_open) {
    throw new Error('Entries are not open for this event.');
  }
  if (!allowedStages.includes(stage)) {
    const messages = {
      [ENTRY_STAGE.ENTRY_CLOSED]: 'Entries are closed for this tournament.',
      [ENTRY_STAGE.LATE_WITHDRAWAL]: 'Entries are closed for this tournament.',
      [ENTRY_STAGE.FROZEN]: 'The freeze deadline has passed — contact the tournament referee directly to withdraw.',
    };
    throw new Error(messages[stage] || `${actionLabel} is not available right now.`);
  }
  return stage;
}

// Determine where a player with the given rank would be placed in an event,
// cascading a lower-ranked occupant down a tier (Main -> Qualifying ->
// Alternates) if the new entrant outranks them and the tier is full.
// Returns { drawType, position, isAlternate, bumps, event }. `bumps` (each
// {id, drawType, position, isAlternate}) must be written to the DB, in
// order, before the new entrant's own row — see applyCascadingPlacement.
export async function computeSelfEntryPlacement(eventId, rankingRank) {
  const event = await getEvent(eventId);
  const maxMain = event.maxMainDirect ?? (event.drawSize - 9);
  const maxQual = event.maxQualDirect ?? ((event.qualifyingSize || 32) - 4);
  const rank = rankingRank ? Number(rankingRank) : null;

  const [mainRes, qualRes, altRes] = await Promise.all([
    supabase.from('draw_entries').select('id, position, ranking')
      .eq('event_id', eventId).eq('draw_type', 'main')
      .eq('is_alternate', false).neq('entry_status', 'withdrawn').eq('is_bye', false),
    supabase.from('draw_entries').select('id, position, ranking')
      .eq('event_id', eventId).eq('draw_type', 'qualifying')
      .eq('is_alternate', false).neq('entry_status', 'withdrawn').eq('is_bye', false),
    supabase.from('draw_entries').select('id, position, ranking')
      .eq('event_id', eventId).eq('draw_type', 'main')
      .eq('is_alternate', true).neq('entry_status', 'withdrawn').eq('is_bye', false),
  ]);
  if (mainRes.error) throw new Error(mainRes.error.message);
  if (qualRes.error) throw new Error(qualRes.error.message);
  if (altRes.error) throw new Error(altRes.error.message);

  const newEntrant = { ranking: rank };

  if (!event.hasQualifying) {
    // No qualifying draw — full field is Main + Alternates only.
    if (mainRes.data.length < event.drawSize) {
      const taken = new Set(mainRes.data.map(e => e.position));
      let pos = 1;
      while (taken.has(pos) && pos <= event.drawSize) pos++;
      return { drawType: 'main', position: pos, isAlternate: false, bumps: [], event };
    }
    const worstMain = mainRes.data.reduce(
      (w, e) => ((e.ranking ?? Infinity) > (w.ranking ?? Infinity) ? e : w), mainRes.data[0]);
    if (worstMain && rank != null && rank < (worstMain.ranking ?? Infinity)) {
      const altTaken = new Set(altRes.data.map(e => e.position));
      let altPos = Math.max(event.drawSize, ...altRes.data.map(e => e.position)) + 1;
      while (altTaken.has(altPos)) altPos++;
      return {
        drawType: 'main', position: worstMain.position, isAlternate: false, event,
        bumps: [{ id: worstMain.id, drawType: 'main', position: altPos, isAlternate: true }],
      };
    }
    const altTaken = new Set(altRes.data.map(e => e.position));
    let altPos = Math.max(event.drawSize, ...altRes.data.map(e => e.position)) + 1;
    while (altTaken.has(altPos)) altPos++;
    return { drawType: 'main', position: altPos, isAlternate: true, bumps: [], event };
  }

  const { placement, bumps } = computeCascadingPlacement(
    mainRes.data, qualRes.data, altRes.data, newEntrant,
    maxMain, maxQual, event.drawSize, event.qualifyingSize || 32,
  );
  return { ...placement, bumps, event };
}

// Writes a cascading-placement plan (see computeSelfEntryPlacement above) via
// the apply_self_entry_placement() RPC (phase20). A bump can demote an entry
// that belongs to someone else (organiser-added, or another self-entered
// player) — self-entry RLS (phase15) only lets a player touch their own row,
// so this can't be done as plain client-side updates; the RPC runs as
// SECURITY DEFINER and re-validates the essential constraints itself.
async function applyCascadingPlacement(eventId, placement, newEntrantRow) {
  const bumps = placement.bumps.map(b => ({
    id: b.id, draw_type: b.drawType, position: b.position, is_alternate: b.isAlternate || false,
  }));
  const row = {
    ...newEntrantRow,
    draw_type: placement.drawType,
    position: placement.position,
    is_alternate: placement.isAlternate || false,
  };
  const { data, error } = await supabase.rpc('apply_self_entry_placement', {
    p_event_id: eventId,
    p_bumps: bumps,
    p_new_row: row,
  });
  if (error) throw new Error(error.message);
  const created = Array.isArray(data) ? data[0] : data;
  return rowToEntry(created);
}

// Self-enter the currently logged-in player into the event singles draw
export async function selfEnterSingles(eventId, profile) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  await assertEntryStage(eventId, [ENTRY_STAGE.OPEN], 'Entry', true);

  // Check for existing active entry
  const existing = await getMyEventEntry(eventId);
  if (existing) throw new Error('You are already entered in this event.');

  const placement = await computeSelfEntryPlacement(eventId, profile.ranking);

  const requiredGender = categoryGender(placement.event?.category);
  if (requiredGender && profile.gender && profile.gender !== requiredGender) {
    throw new Error(`This is a ${placement.event.category} event — your profile gender doesn't match. Contact the organiser if this is a mistake.`);
  }
  if (requiredGender && !profile.gender) {
    throw new Error('Set your gender in your Profile before entering this event.');
  }

  const newEntrantRow = {
    event_id: eventId,
    is_bye: false,
    family_name: profile.familyName || profile.displayName?.split(' ').pop() || '',
    first_name: profile.firstName || (profile.displayName?.split(' ').slice(0, -1).join(' ')) || '',
    aita_reg: profile.aitaReg || null,
    player_state: profile.stateAbbr || null,
    ranking: profile.ranking ? Number(profile.ranking) : null,
    date_of_birth: profile.dateOfBirth || null,
    player_id: user.id,
    entry_source: 'player',
    entry_status: 'placed',
    entered_by: user.id,
  };
  const entry = await applyCascadingPlacement(eventId, placement, newEntrantRow);
  return { entry, placement };
}

// ---------------------------------------------------------------------------
// Phase 43 — Paid self-entry (Razorpay)
// ---------------------------------------------------------------------------

// Finalizes a paid entry: api/razorpay-verify.js only flips event_payments
// to 'paid' (it has no user session to work with, by design — see that
// file's comment). This runs under the player's own session, so it reuses
// the exact same placement + apply_self_entry_placement path selfEnterSingles
// uses for free events — one implementation of the cascading-placement
// logic, not two. Idempotent: if this payment already produced a
// draw_entries row (e.g. called once right after checkout, and again by the
// "finish confirming" recovery affordance after a reload), it just returns
// that existing entry instead of erroring or double-entering.
export async function finalizePaidEntry(paymentId, profile) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  const { data: payment, error: payErr } = await supabase
    .from('event_payments')
    .select('id, event_id, user_id, status')
    .eq('id', paymentId)
    .single();
  if (payErr || !payment) throw new Error('Payment record not found');
  if (payment.user_id !== user.id) throw new Error('This payment does not belong to you');
  if (payment.status !== 'paid') throw new Error(`Payment is ${payment.status}, not paid yet`);

  const { data: already } = await supabase
    .from('draw_entries')
    .select('*')
    .eq('payment_id', paymentId)
    .limit(1);
  if (already && already.length > 0) return { entry: rowToEntry(already[0]) };

  const existingActive = await getMyEventEntry(payment.event_id);
  if (existingActive) return { entry: existingActive };

  const placement = await computeSelfEntryPlacement(payment.event_id, profile.ranking);

  const requiredGender = categoryGender(placement.event?.category);
  if (requiredGender && profile.gender && profile.gender !== requiredGender) {
    throw new Error(`This is a ${placement.event.category} event — your profile gender doesn't match. Contact the organiser if this is a mistake.`);
  }

  const newEntrantRow = {
    event_id: payment.event_id,
    is_bye: false,
    family_name: profile.familyName || profile.displayName?.split(' ').pop() || '',
    first_name: profile.firstName || (profile.displayName?.split(' ').slice(0, -1).join(' ')) || '',
    aita_reg: profile.aitaReg || null,
    player_state: profile.stateAbbr || null,
    ranking: profile.ranking ? Number(profile.ranking) : null,
    date_of_birth: profile.dateOfBirth || null,
    player_id: user.id,
    entry_source: 'player',
    entry_status: 'placed',
    entered_by: user.id,
  };
  const entry = await applyCascadingPlacement(payment.event_id, placement, newEntrantRow);

  const { error: linkErr } = await supabase
    .from('draw_entries')
    .update({ payment_id: paymentId })
    .eq('id', entry.id);
  if (linkErr) throw new Error(linkErr.message);

  return { entry: { ...entry, paymentId } };
}

// For the "finish confirming your paid entry" recovery affordance: finds a
// payment that succeeded but never got turned into a draw_entries row (the
// browser closed between Checkout success and finalizePaidEntry). Returns
// null when there's nothing to recover — either no paid-but-unclaimed
// payment exists, or it's already claimed.
export async function getMyUnclaimedPayment(eventId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: payments, error } = await supabase
    .from('event_payments')
    .select('id, amount, status')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !payments || payments.length === 0) return null;

  const payment = payments[0];
  const { data: linked } = await supabase
    .from('draw_entries')
    .select('id')
    .eq('payment_id', payment.id)
    .limit(1);
  if (linked && linked.length > 0) return null;

  return payment;
}

// Player withdraws from an event. The on-time/late/frozen distinction is
// derived from the tournament's deadlines, not passed by the caller — a
// player can't self-report an on-time withdrawal as a way to dodge the
// late-withdrawal penalty (see assertEntryStage / getEntryStage).
export async function withdrawFromEvent(entryId) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: { user } } = await supabase.auth.getUser();
  const { data: target, error: tErr } = await supabase
    .from('draw_entries')
    .select('event_id, draw_type, family_name, first_name, aita_reg, player_id, event:events(tournament_week:tournament_weeks(grade))')
    .eq('id', entryId)
    .single();
  if (tErr) throw new Error(tErr.message);

  const stage = await assertEntryStage(
    target.event_id,
    [ENTRY_STAGE.OPEN, ENTRY_STAGE.ENTRY_CLOSED, ENTRY_STAGE.LATE_WITHDRAWAL],
    'Withdrawal',
  );
  const withdrawalType = stage === ENTRY_STAGE.LATE_WITHDRAWAL ? 'LW' : 'W';

  await logWithdrawal({
    eventId: target.event_id,
    entryId,
    drawType: target.draw_type,
    playerName: target.family_name + (target.first_name ? `, ${target.first_name}` : ''),
    aitaReg: target.aita_reg,
    playerId: target.player_id,
    withdrawalType,
    withdrawalDate: today,
    initiatedBy: 'self',
    initiatedByUserId: user?.id,
    grade: target.event?.tournament_week?.grade || null,
  });

  const { data, error } = await supabase
    .from('draw_entries')
    .update({ entry_status: 'withdrawn', withdrawal_date: today, withdrawal_type: withdrawalType })
    .eq('id', entryId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToEntry(data);
}

// Get all draw entries where the given player has entered themselves (all
// tournaments). `playerId` defaults to the current authenticated user — the
// Coach Intelligence System's read-only view of a linked player's dashboard
// (Player Coaching Dashboard reused as-is, see PlayerDashboardPage.jsx)
// passes the viewed player's id explicitly instead. No extra RLS needed:
// draw_entries' existing "Anyone authenticated can view draw entries" select
// policy (phase2_schema.sql) already covers this read for any signed-in user.
export async function getMyEntries(playerId) {
  let effectiveId = playerId;
  if (!effectiveId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    effectiveId = user.id;
  }
  // entered_by covers self-entries; player_id covers entries someone else
  // created and linked to this account (organiser manual-link, or phase 45's
  // admin-published crowdsourced draws) — without the OR, a linked-but-not-
  // self-entered tournament would never show up here.
  const { data, error } = await supabase
    .from('draw_entries')
    .select('*, event:events(*, tournament_week:tournament_weeks(id, name, start_date, end_date, city, state_abbr, grade, source))')
    .or(`entered_by.eq.${effectiveId},player_id.eq.${effectiveId}`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(row => ({
    ...rowToEntry(row),
    event: row.event ? { ...rowToEvent(row.event), week: row.event.tournament_week ? rowToWeek(row.event.tournament_week) : null } : null,
  }));
}

// "Navy" design system — Profile annual entry allowance. Counts distinct
// (tournament_week, age_group) pairs entered this calendar year — matches
// the AITA rule that singles+doubles at the same event count once, while
// two age groups at one venue count as two (Rules KB §Annual Tournament
// Limits). Looks at aita_reg on either side (own entry or doubles partner).
export async function getMyTournamentEntryCountThisYear(aitaReg) {
  if (!aitaReg) return 0;
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const { data, error } = await supabase
    .from('draw_entries')
    .select('event:events(age_group, tournament_week:tournament_weeks(id, start_date))')
    .or(`aita_reg.eq.${aitaReg},partner_aita_reg.eq.${aitaReg}`);
  if (error) throw new Error(error.message);
  const seen = new Set();
  for (const row of data || []) {
    const week = row.event?.tournament_week;
    if (!week?.start_date || week.start_date < yearStart || week.start_date > yearEnd) continue;
    seen.add(`${week.id}|${row.event.age_group}`);
  }
  return seen.size;
}

// ---------------------------------------------------------------------------
// Phase 19 — Doubles invitations
// ---------------------------------------------------------------------------

// Search for a partner by name/AITA reg (for doubles invitation)
// Returns aita_players rows filtered by age group + gender
export async function searchDoublesPartners(query, ageGroup, gender) {
  let q = supabase
    .from('aita_players')
    .select('aita_reg, family_name, first_name, state, ranking_rank, ranking_pts, age_group, gender')
    .or(`family_name.ilike.%${query}%,first_name.ilike.%${query}%,aita_reg.ilike.%${query}%`)
    .order('ranking_rank', { ascending: true })
    .limit(15);
  if (ageGroup) q = q.eq('age_group', ageGroup);
  if (gender) q = q.eq('gender', gender);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(p => ({
    aitaReg: p.aita_reg,
    familyName: p.family_name,
    firstName: p.first_name,
    state: p.state,
    rankingRank: p.ranking_rank,
    rankingPts: p.ranking_pts,
    ageGroup: p.age_group,
    gender: p.gender,
  }));
}

// Send a doubles invitation to a partner
export async function sendDoublesInvitation(eventId, inviterAitaReg, inviteeAitaReg) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in');

  await assertEntryStage(eventId, [ENTRY_STAGE.OPEN], 'Entry', true);

  // Find the invitee's user_id from user_profiles by aita_reg
  const { data: inviteeProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('aita_reg', inviteeAitaReg)
    .maybeSingle();
  const inviteeUserId = inviteeProfile?.id || null;

  const { data, error } = await supabase
    .from('doubles_invitations')
    .insert({
      event_id: eventId,
      inviter_user_id: user.id,
      invitee_user_id: inviteeUserId,
      inviter_aita_reg: inviterAitaReg,
      invitee_aita_reg: inviteeAitaReg,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Get pending invitations received by the current user
export async function getMyPendingInvitations() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('doubles_invitations')
    .select('*, event:events(id, category, age_group, draw_size, tournament_week:tournament_weeks(id, name, start_date, city, state_abbr))')
    .eq('invitee_user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Get invitations sent by current user
export async function getMySentInvitations(eventId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('doubles_invitations')
    .select('*')
    .eq('inviter_user_id', user.id)
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Respond to a doubles invitation
export async function respondToInvitation(invitationId, accept) {
  if (accept) {
    const { data: inv } = await supabase.from('doubles_invitations').select('event_id').eq('id', invitationId).single();
    if (inv) await assertEntryStage(inv.event_id, [ENTRY_STAGE.OPEN], 'Entry', true);
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('doubles_invitations')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: now })
    .eq('id', invitationId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  // If accepted, create the doubles entry
  if (accept && data) {
    const { data: event } = await supabase.from('events').select('*').eq('id', data.event_id).single();
    if (event) {
      const { data: { user } } = await supabase.auth.getUser();
      // Get profiles for both players
      const [inviterProfile, inviteeProfile] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', data.inviter_user_id).maybeSingle(),
        supabase.from('user_profiles').select('*').eq('id', data.invitee_user_id).maybeSingle(),
      ]);
      const inviter = inviterProfile.data;
      const invitee = inviteeProfile.data;
      // Compute placement
      const maxMain = event.draw_size || 16;
      const { data: existing } = await supabase.from('draw_entries')
        .select('position').eq('event_id', event.id).eq('draw_type', 'main').neq('entry_status', 'withdrawn');
      const taken = new Set((existing || []).map(e => e.position));
      let pos = 1;
      while (taken.has(pos) && pos <= maxMain) pos++;
      await supabase.from('draw_entries').insert({
        event_id: event.id,
        draw_type: 'main',
        position: pos,
        is_bye: false,
        family_name: inviter?.display_name?.split(' ').pop() || data.inviter_aita_reg,
        first_name: inviter?.display_name?.split(' ').slice(0, -1).join(' ') || '',
        aita_reg: data.inviter_aita_reg,
        player_state: inviter?.state_abbr || null,
        ranking: inviter?.ranking || null,
        date_of_birth: inviter?.date_of_birth || null,
        player_id: data.inviter_user_id,
        partner_family_name: invitee?.display_name?.split(' ').pop() || data.invitee_aita_reg,
        partner_first_name: invitee?.display_name?.split(' ').slice(0, -1).join(' ') || '',
        partner_aita_reg: data.invitee_aita_reg,
        partner_state: invitee?.state_abbr || null,
        partner_ranking: invitee?.ranking || null,
        partner_id: data.invitee_user_id,
        entry_source: 'player',
        entry_status: 'placed',
        entered_by: user?.id,
      });
    }
  }
  return data;
}

// Cancel/delete an invitation (by inviter)
export async function cancelInvitation(invitationId) {
  const { error } = await supabase.from('doubles_invitations').delete().eq('id', invitationId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Phase 11 — Player & Coach Dashboards
// ---------------------------------------------------------------------------

// Cross-event lookup: every draw_entries row (any tournament week) where this
// player appears as the entrant or as a doubles partner, for a list of AITA
// reg numbers (1 for a player's own dashboard, N for a coach's linked roster).
// Same two-query-then-merge shape as getPlayerWeekParticipation above, just
// without the single-week scope, and enriched with the parent event + week.
export async function getDrawEntriesForPlayers(aitaRegs) {
  const regs = [...new Set((aitaRegs || []).filter(Boolean))];
  if (regs.length === 0) return [];

  const sel = '*, event:events(*, tournament_week:tournament_weeks(*))';
  const [{ data: asPlayer, error: e1 }, { data: asPartner, error: e2 }] = await Promise.all([
    supabase.from('draw_entries').select(sel).in('aita_reg', regs),
    supabase.from('draw_entries').select(sel).in('partner_aita_reg', regs),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const seen = new Set();
  const rows = [];
  for (const row of [...(asPlayer || []), ...(asPartner || [])]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }

  return rows.map(row => ({
    ...rowToEntry(row),
    event: row.event
      ? { ...rowToEvent(row.event), week: row.event.tournament_week ? rowToWeek(row.event.tournament_week) : null }
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Event Matches
// ---------------------------------------------------------------------------

function rowToEventMatch(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    drawType: row.draw_type,
    round: row.round,
    matchSlot: row.match_slot,
    entry1Id: row.entry1_id,
    entry2Id: row.entry2_id,
    winnerEntryId: row.winner_entry_id,
    score: row.score,
    outcomeType: row.outcome_type,
    umpire: row.umpire,
    status: row.status,
    dayNumber: row.day_number,
    courtNumber: row.court_number,
    matchOrder: row.match_order,
  };
}

export async function getEventMatches(eventId, drawType) {
  const { data, error } = await supabase
    .from('event_matches')
    .select('*')
    .eq('event_id', eventId)
    .eq('draw_type', drawType)
    .order('round', { ascending: true })
    .order('match_slot', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(rowToEventMatch);
}

// `entries` must already be padded (with BYE rows) to the PHYSICAL bracket
// size — see bracketSize() in aitaGradeRules.js — so entries.length is
// always a power of two here; otherwise round match-counts (drawSize/2^round)
// go fractional partway through and later rounds silently get the wrong
// number of match slots. `maxRound`, when given, caps generation at that
// round instead of building all the way to a single champion — AITA
// qualifying draws stop at the "deciding round" once enough winners exist to
// fill the promotion spots (verified against real qualifying sheets: they
// never show a "Champion", only a "Qualifiers" list at the deciding round).
export async function initializeEventMatches(eventId, drawType, entries, maxRound) {
  await supabase
    .from('event_matches')
    .delete()
    .eq('event_id', eventId)
    .eq('draw_type', drawType);

  const drawSize = entries.length;
  const totalRoundsFull = Math.ceil(Math.log2(drawSize));
  const totalRounds = maxRound ? Math.min(maxRound, totalRoundsFull) : totalRoundsFull;
  const allMatches = [];

  for (let i = 0; i < entries.length; i += 2) {
    allMatches.push({
      event_id: eventId,
      draw_type: drawType,
      round: 1,
      match_slot: Math.floor(i / 2) + 1,
      entry1_id: entries[i]?.id || null,
      entry2_id: entries[i + 1]?.id || null,
      status: 'pending',
    });
  }

  for (let round = 2; round <= totalRounds; round++) {
    const matchCount = drawSize / Math.pow(2, round);
    for (let slot = 1; slot <= matchCount; slot++) {
      allMatches.push({
        event_id: eventId,
        draw_type: drawType,
        round,
        match_slot: slot,
        status: 'pending',
      });
    }
  }

  const { data, error } = await supabase.from('event_matches').insert(allMatches).select();
  if (error) throw new Error(error.message);
  return data.map(rowToEventMatch);
}

export async function updateMatchScore(matchId, { score, winnerEntryId, outcomeType, status, umpire }) {
  const { data, error } = await supabase
    .from('event_matches')
    .update({ score, winner_entry_id: winnerEntryId, outcome_type: outcomeType, status, umpire })
    .eq('id', matchId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToEventMatch(data);
}

// ---------------------------------------------------------------------------
// User Profiles
// ---------------------------------------------------------------------------

function rowToProfile(row) {
  return {
    id: row.id,
    role: row.role || 'player',
    roleConfirmed: row.role_confirmed || false,
    displayName: row.display_name,
    aitaReg: row.aita_reg,
    stateAbbr: row.state_abbr,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    ranking: row.ranking,
    clubName: row.club_name,
    bio: row.bio,
    isVerified: row.is_verified || false,
    updatedAt: row.updated_at,

    phone: row.phone,
    homeCourt: row.home_court,
    nationality: row.nationality,
    country: row.country,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    height: row.height,
    plays: row.plays,
    backhand: row.backhand,

    racquetBrand: row.racquet_brand,
    racquetName: row.racquet_name,
    racquetYear: row.racquet_year,
    stringBrand: row.string_brand,
    stringName: row.string_name,
    stringTension: row.string_tension,
    shoeBrand: row.shoe_brand,
    shoeName: row.shoe_name,
    bagBrand: row.bag_brand,
    bagName: row.bag_name,
    gripBrand: row.grip_brand,
    gripName: row.grip_name,

    kcalGoal: row.kcal_goal,
    waterGoalMl: row.water_goal_ml,
    proteinGoalG: row.protein_goal_g,

    reminderEnabled: row.reminder_enabled || false,
    reminderTime: row.reminder_time,
    reminderTimezone: row.reminder_timezone,
    weeklyDigest: row.weekly_digest || false,
  };
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null; // row not found — new user
    throw new Error(error.message);
  }
  return rowToProfile(data);
}

export async function upsertProfile(userId, profile) {
  const row = {
    id: userId,
    role: profile.role,
    role_confirmed: true,          // always true when saved explicitly by the user
    display_name: profile.displayName || null,
    aita_reg: profile.aitaReg || null,
    state_abbr: profile.stateAbbr || null,
    date_of_birth: profile.dateOfBirth || null,
    gender: profile.gender || null,
    ranking: profile.ranking ? Number(profile.ranking) : null,
    club_name: profile.clubName || null,
    bio: profile.bio || null,

    phone: profile.phone || null,
    home_court: profile.homeCourt || null,
    nationality: profile.nationality || null,
    country: profile.country || null,
    city: profile.city || null,
    region: profile.region || null,
    postal_code: profile.postalCode || null,
    height: profile.height || null,
    plays: profile.plays || null,
    backhand: profile.backhand || null,

    racquet_brand: profile.racquetBrand || null,
    racquet_name: profile.racquetName || null,
    racquet_year: profile.racquetYear ? Number(profile.racquetYear) : null,
    string_brand: profile.stringBrand || null,
    string_name: profile.stringName || null,
    string_tension: profile.stringTension || null,
    shoe_brand: profile.shoeBrand || null,
    shoe_name: profile.shoeName || null,
    bag_brand: profile.bagBrand || null,
    bag_name: profile.bagName || null,
    grip_brand: profile.gripBrand || null,
    grip_name: profile.gripName || null,
  };
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToProfile(data);
}

// Phase 41 — reminder/digest prefs, same targeted-update rationale as
// updateNutritionGoals below.
export async function updateReminderPrefs(userId, { reminderEnabled, reminderTime, weeklyDigest }) {
  const patch = {};
  if (reminderEnabled !== undefined) patch.reminder_enabled = reminderEnabled;
  if (reminderTime !== undefined) patch.reminder_time = reminderTime;
  if (weeklyDigest !== undefined) patch.weekly_digest = weeklyDigest;
  const { data, error } = await supabase.from('user_profiles').update(patch).eq('id', userId).select().single();
  if (error) throw new Error(error.message);
  return rowToProfile(data);
}

// Phase 36 — nutrition goals live on user_profiles but are edited from
// NutritionPage.jsx, not the main profile editor. A targeted .update()
// (not upsertProfile's full-row .upsert()) so saving a goal can never
// clobber unrelated profile fields the nutrition form doesn't know about.
export async function updateNutritionGoals(userId, { kcalGoal, waterGoalMl, proteinGoalG }) {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ kcal_goal: kcalGoal ?? null, water_goal_ml: waterGoalMl ?? null, protein_goal_g: proteinGoalG ?? null })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToProfile(data);
}

function rowToNutritionLog(row) {
  return {
    id: row.id,
    userId: row.user_id,
    logDate: row.log_date,
    mealType: row.meal_type,
    foodItems: row.food_items,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatsG: row.fats_g,
    hydrationMl: row.hydration_ml,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function getNutritionLogs(userId, sinceDate = null) {
  let query = supabase.from('nutrition_logs').select('*').eq('user_id', userId);
  if (sinceDate) query = query.gte('log_date', sinceDate);
  const { data, error } = await query.order('log_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToNutritionLog);
}

export async function createNutritionLog(userId, { logDate, mealType, foodItems, calories, proteinG, carbsG, fatsG, hydrationMl, notes }) {
  const { data, error } = await supabase
    .from('nutrition_logs')
    .insert({
      user_id: userId, log_date: logDate, meal_type: mealType,
      food_items: foodItems || null, calories: calories ?? null,
      protein_g: proteinG ?? null, carbs_g: carbsG ?? null, fats_g: fatsG ?? null,
      hydration_ml: hydrationMl ?? null, notes: notes || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToNutritionLog(data);
}

export async function deleteNutritionLog(logId) {
  const { error } = await supabase.from('nutrition_logs').delete().eq('id', logId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function searchPlayers(query, ageGroup = null, gender = null) {
  // Search registered platform users first, then AITA rankings directory.
  // Results are merged and de-duped by aita_reg (platform user wins on match).
  // ageGroup: 'U12' | 'U14' | 'U16' | 'U18' | null (no filter)
  // gender:   'M' | 'F' | null (no filter)

  let aitaQuery = supabase
    .from('aita_players')
    .select('aita_reg, family_name, first_name, dob, state, ranking_pts, ranking_rank, age_group, gender')
    .or(`family_name.ilike.%${query}%,first_name.ilike.%${query}%,aita_reg.ilike.%${query}%`)
    .order('ranking_rank', { ascending: true })
    .limit(20);

  if (ageGroup) aitaQuery = aitaQuery.eq('age_group', ageGroup);
  if (gender)   aitaQuery = aitaQuery.eq('gender', gender);

  const [usersRes, aitaRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, display_name, aita_reg, state_abbr, ranking, club_name')
      .eq('role', 'player')
      .or(`display_name.ilike.%${query}%,aita_reg.ilike.%${query}%`)
      .limit(10),
    aitaQuery,
  ]);

  if (usersRes.error) throw new Error(usersRes.error.message);
  const platformUsers = (usersRes.data || []).map(rowToProfile);

  // Build AITA results, skip any aita_reg already covered by a platform user
  const coveredRegs = new Set(platformUsers.map(u => u.aitaReg).filter(Boolean));
  const aitaPlayers = (aitaRes.data || [])
    .filter(r => !coveredRegs.has(r.aita_reg))
    // One result per aita_reg (may appear in multiple age-group lists — take lowest rank)
    .reduce((acc, r) => {
      const existing = acc.find(x => x.aita_reg === r.aita_reg);
      if (!existing || r.ranking_rank < existing.ranking_rank) {
        const filtered = acc.filter(x => x.aita_reg !== r.aita_reg);
        filtered.push(r);
        return filtered;
      }
      return acc;
    }, [])
    .map(r => ({
      id: null,
      aitaReg: r.aita_reg,
      displayName: [r.first_name, r.family_name].filter(Boolean).join(' '),
      familyName: r.family_name,
      firstName: r.first_name || '',
      stateAbbr: r.state,
      ranking: r.ranking_rank,
      rankingPts: r.ranking_pts,
      dateOfBirth: r.dob,
      ageGroup: r.age_group,
      gender: r.gender,
      _source: 'aita',
    }));

  return [...platformUsers, ...aitaPlayers].slice(0, 15);
}

// ---------------------------------------------------------------------------
// Coach ↔ Player Links
// ---------------------------------------------------------------------------

function rowToLink(row) {
  return {
    id: row.id,
    coachId: row.coach_id,
    playerId: row.player_id,
    status: row.status,
    createdAt: row.created_at,
    // joined profile data
    coach: row.coach ? rowToProfile(row.coach) : null,
    player: row.player ? rowToProfile(row.player) : null,
  };
}

export async function sendCoachRequest(coachId, playerId) {
  const { data, error } = await supabase
    .from('coach_player_links')
    .insert({ coach_id: coachId, player_id: playerId, status: 'pending' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToLink(data);
}

export async function getCoachLinks(userId) {
  // Returns all links where user is either coach or player, with the other party's profile
  const { data, error } = await supabase
    .from('coach_player_links')
    .select(`
      id, coach_id, player_id, status, created_at,
      coach:user_profiles!coach_player_links_coach_id_fkey(id, display_name, aita_reg, state_abbr, ranking, club_name, role),
      player:user_profiles!coach_player_links_player_id_fkey(id, display_name, aita_reg, state_abbr, ranking, club_name, role)
    `)
    .or(`coach_id.eq.${userId},player_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToLink);
}

export async function respondToCoachRequest(linkId, status) {
  const { data, error } = await supabase
    .from('coach_player_links')
    .update({ status })
    .eq('id', linkId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToLink(data);
}

export async function deleteCoachLink(linkId) {
  const { error } = await supabase
    .from('coach_player_links')
    .delete()
    .eq('id', linkId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Parent ↔ Player Links (Phase 33) — same shape/flow as Coach ↔ Player Links
// above, against the separate parent_player_links table.
// ---------------------------------------------------------------------------

function rowToParentLink(row) {
  return {
    id: row.id,
    parentId: row.parent_id,
    playerId: row.player_id,
    status: row.status,
    createdAt: row.created_at,
    // joined profile data
    parent: row.parent ? rowToProfile(row.parent) : null,
    player: row.player ? rowToProfile(row.player) : null,
  };
}

export async function sendParentRequest(parentId, playerId) {
  const { data, error } = await supabase
    .from('parent_player_links')
    .insert({ parent_id: parentId, player_id: playerId, status: 'pending' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToParentLink(data);
}

export async function getParentLinks(userId) {
  // Returns all links where user is either parent or player, with the other party's profile
  const { data, error } = await supabase
    .from('parent_player_links')
    .select(`
      id, parent_id, player_id, status, created_at,
      parent:user_profiles!parent_player_links_parent_id_fkey(id, display_name, aita_reg, state_abbr, ranking, club_name, role),
      player:user_profiles!parent_player_links_player_id_fkey(id, display_name, aita_reg, state_abbr, ranking, club_name, role)
    `)
    .or(`parent_id.eq.${userId},player_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToParentLink);
}

export async function respondToParentRequest(linkId, status) {
  const { data, error } = await supabase
    .from('parent_player_links')
    .update({ status })
    .eq('id', linkId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToParentLink(data);
}

export async function deleteParentLink(linkId) {
  const { error } = await supabase
    .from('parent_player_links')
    .delete()
    .eq('id', linkId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function advanceWinner(eventId, drawType, currentRound, currentSlot, winnerEntryId) {
  const nextRound = currentRound + 1;
  const nextSlot = Math.ceil(currentSlot / 2);
  const isOddSlot = currentSlot % 2 !== 0;
  const updateField = isOddSlot ? 'entry1_id' : 'entry2_id';

  const { error } = await supabase
    .from('event_matches')
    .update({ [updateField]: winnerEntryId })
    .eq('event_id', eventId)
    .eq('draw_type', drawType)
    .eq('round', nextRound)
    .eq('match_slot', nextSlot);

  if (error) throw new Error(error.message);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase 7 — Order of Play (cross-event scheduling)
// ---------------------------------------------------------------------------

// Returns all matches for every event in a week, enriched with event + entry info.
export async function getWeekMatches(weekId) {
  const { data: events, error: evErr } = await supabase
    .from('events')
    .select('id, category, age_group, is_doubles, draw_size')
    .eq('tournament_week_id', weekId);
  if (evErr) throw new Error(evErr.message);
  if (!events?.length) return [];

  const eventIds = events.map(e => e.id);
  const eventMap = new Map(events.map(e => [e.id, e]));

  const { data: matches, error: mErr } = await supabase
    .from('event_matches')
    .select('*')
    .in('event_id', eventIds)
    .order('draw_type')
    .order('round')
    .order('match_slot');
  if (mErr) throw new Error(mErr.message);
  if (!matches?.length) return [];

  const entryIds = [...new Set(
    matches.flatMap(m => [m.entry1_id, m.entry2_id]).filter(Boolean)
  )];
  let entryMap = new Map();
  if (entryIds.length > 0) {
    const { data: entries, error: eErr } = await supabase
      .from('draw_entries')
      .select('id, family_name, first_name, aita_reg, player_state, seed, is_bye')
      .in('id', entryIds);
    if (eErr) throw new Error(eErr.message);
    entryMap = new Map(entries.map(e => [e.id, {
      id: e.id,
      familyName: e.family_name,
      firstName: e.first_name,
      aitaReg: e.aita_reg,
      playerState: e.player_state,
      seed: e.seed,
      isBye: e.is_bye,
    }]));
  }

  return matches.map(m => {
    const ev = eventMap.get(m.event_id);
    const totalRounds = ev?.draw_size ? Math.ceil(Math.log2(ev.draw_size)) : 0;
    return {
      ...rowToEventMatch(m),
      eventCategory: ev?.category || '',
      eventAgeGroup: ev?.age_group || '',
      eventIsDoubles: ev?.is_doubles || false,
      totalRounds,
      entry1: entryMap.get(m.entry1_id) || null,
      entry2: entryMap.get(m.entry2_id) || null,
    };
  });
}

// Update scheduling fields for a single match.
export async function updateMatchSchedule(matchId, { dayNumber, courtNumber, matchOrder }) {
  const { data, error } = await supabase
    .from('event_matches')
    .update({ day_number: dayNumber, court_number: courtNumber, match_order: matchOrder })
    .eq('id', matchId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToEventMatch(data);
}

// Greedy auto-schedule: assigns all unscheduled pending matches across numCourts courts,
// avoiding player conflicts (same player in two concurrent time slots on the same day).
export async function autoScheduleWeek(weekId, numCourts = 3) {
  const allMatches = await getWeekMatches(weekId);

  // Only schedule pending matches with at least one real (non-BYE) player
  const schedulable = allMatches.filter(m =>
    m.status !== 'complete' &&
    !m.dayNumber &&
    ((m.entry1 && !m.entry1.isBye) || (m.entry2 && !m.entry2.isBye))
  );

  // Sort: qualifying first, then lower round first, then by matchSlot
  schedulable.sort((a, b) => {
    if (a.drawType !== b.drawType) return a.drawType === 'qualifying' ? -1 : 1;
    if (a.round !== b.round) return a.round - b.round;
    return a.matchSlot - b.matchSlot;
  });

  // Greedy assignment
  // courtNextOrder[`${day}-${court}`] = next order number for that court
  const courtNextOrder = {};
  // dayOrderPlayers[`${day}-${order}`] = Set of aitaReg already at that time slot
  const dayOrderPlayers = {};
  const assignments = [];

  for (const match of schedulable) {
    const p1 = match.entry1?.aitaReg;
    const p2 = match.entry2?.aitaReg;
    let placed = false;

    for (let d = 1; d <= 14 && !placed; d++) {
      for (let c = 1; c <= numCourts && !placed; c++) {
        const ck = `${d}-${c}`;
        const o = (courtNextOrder[ck] || 0) + 1;
        const dok = `${d}-${o}`;
        const occupied = dayOrderPlayers[dok] || new Set();

        const p1ok = !p1 || !occupied.has(p1);
        const p2ok = !p2 || !occupied.has(p2);
        if (p1ok && p2ok) {
          courtNextOrder[ck] = o;
          if (!dayOrderPlayers[dok]) dayOrderPlayers[dok] = new Set();
          if (p1) dayOrderPlayers[dok].add(p1);
          if (p2) dayOrderPlayers[dok].add(p2);
          assignments.push({ matchId: match.id, dayNumber: d, courtNumber: c, matchOrder: o });
          placed = true;
        }
      }
    }
  }

  if (assignments.length > 0) {
    await Promise.all(assignments.map(({ matchId, dayNumber, courtNumber, matchOrder }) =>
      supabase
        .from('event_matches')
        .update({ day_number: dayNumber, court_number: courtNumber, match_order: matchOrder })
        .eq('id', matchId)
    ));
  }

  return assignments.length;
}

// ---------------------------------------------------------------------------
// Phase 6 — Qualifying → Main draw promotion
// ---------------------------------------------------------------------------

// Returns the winner entries from the qualifying deciding round (sorted by
// match slot). Returns null if not all deciding-round matches are complete.
export async function getQualifyingWinners(eventId) {
  const { data: evRow, error: evErr } = await supabase
    .from('events')
    .select('qualifying_size, qualifying_spots')
    .eq('id', eventId)
    .single();
  if (evErr) throw new Error(evErr.message);

  const { qualifying_size: qSize, qualifying_spots: qSpots } = evRow;
  if (!qSize || !qSpots) throw new Error('Event has no qualifying configuration.');

  const decidingRound = Math.round(Math.log2(bracketSize(qSize) / qSpots));

  const { data: roundMatches, error: mErr } = await supabase
    .from('event_matches')
    .select('*')
    .eq('event_id', eventId)
    .eq('draw_type', 'qualifying')
    .eq('round', decidingRound)
    .order('match_slot', { ascending: true });
  if (mErr) throw new Error(mErr.message);

  if (!roundMatches || roundMatches.length < qSpots) return null;
  if (roundMatches.some(m => m.status !== 'complete' || !m.winner_entry_id)) return null;

  const winnerIds = roundMatches.map(m => m.winner_entry_id);
  const { data: entryRows, error: eErr } = await supabase
    .from('draw_entries')
    .select('*')
    .in('id', winnerIds);
  if (eErr) throw new Error(eErr.message);

  const entryMap = new Map(entryRows.map(e => [e.id, e]));
  return roundMatches
    .map(m => entryMap.get(m.winner_entry_id))
    .filter(Boolean)
    .map(rowToEntry);
}

// ---------------------------------------------------------------------------
// Phase 18 — Withdrawal audit log
// ---------------------------------------------------------------------------

function rowToAuditEntry(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    entryId: row.entry_id,
    drawType: row.draw_type,
    playerName: row.player_name,
    aitaReg: row.aita_reg,
    playerId: row.player_id,
    withdrawalType: row.withdrawal_type,
    withdrawalDate: row.withdrawal_date,
    initiatedBy: row.initiated_by,
    initiatedByUserId: row.initiated_by_user_id,
    replacementName: row.replacement_name,
    replacementEntryId: row.replacement_entry_id,
    replacementSource: row.replacement_source,
    penaltyPoints: row.penalty_points,
    penaltyReason: row.penalty_reason,
    createdAt: row.created_at,
  };
}

// AITA no-show / late-withdrawal ranking-point penalties (verified against
// the source PDF — see src/utils/aitaGradeRules.js for the per-grade table).
// No-Show is a flat per-grade lookup. Late Withdrawal only bites SS/NS/
// Nationals, and only from the 3rd occurrence in a calendar year onward, so
// it needs a count of the player's prior LW rows this year at that grade tier.
async function computeWithdrawalPenalty({ grade, withdrawalType, playerId, withdrawalDate }) {
  if (withdrawalType === 'NS') {
    const points = noShowPenaltyPoints(grade);
    return points > 0 ? { points: -points, reason: `No-Show (${grade})` } : null;
  }
  if (withdrawalType === 'LW' && usesLateWithdrawalPenalty(grade) && playerId) {
    const year = new Date(withdrawalDate || Date.now()).getFullYear();
    const { data, error } = await supabase
      .from('withdrawal_audit')
      .select('id, event:events(tournament_week:tournament_weeks(grade))')
      .eq('player_id', playerId)
      .eq('withdrawal_type', 'LW')
      .gte('withdrawal_date', `${year}-01-01`)
      .lte('withdrawal_date', `${year}-12-31`);
    if (error) return null; // non-blocking — a failed lookup just skips the penalty
    const priorAtTier = (data || []).filter(
      row => usesLateWithdrawalPenalty(row.event?.tournament_week?.grade)
    ).length;
    if (priorAtTier + 1 >= 3) {
      return { points: -LATE_WITHDRAWAL_PENALTY_POINTS, reason: `Late Withdrawal — 3rd+ this year (${grade})` };
    }
  }
  return null;
}

// Logs a withdrawal (and optionally its replacement, if already known) BEFORE
// the underlying draw_entries row is mutated — callInReplacement() overwrites
// the withdrawn player's identity in place, so this snapshot is the only
// place it survives.
export async function logWithdrawal({
  eventId, entryId, drawType, playerName, aitaReg, playerId,
  withdrawalType, withdrawalDate, initiatedBy, initiatedByUserId,
  replacementName, replacementEntryId, replacementSource, grade,
}) {
  const finalWithdrawalDate = withdrawalDate || new Date().toISOString().slice(0, 10);
  const penalty = await computeWithdrawalPenalty({
    grade, withdrawalType, playerId, withdrawalDate: finalWithdrawalDate,
  });
  const row = {
    event_id: eventId,
    entry_id: entryId || null,
    draw_type: drawType,
    player_name: playerName,
    aita_reg: aitaReg || null,
    player_id: playerId || null,
    withdrawal_type: withdrawalType || 'W',
    withdrawal_date: finalWithdrawalDate,
    initiated_by: initiatedBy,
    initiated_by_user_id: initiatedByUserId,
    replacement_name: replacementName || null,
    replacement_entry_id: replacementEntryId || null,
    replacement_source: replacementSource || null,
    penalty_points: penalty ? penalty.points : null,
    penalty_reason: penalty ? penalty.reason : null,
  };
  const { data, error } = await supabase.from('withdrawal_audit').insert(row).select().single();
  if (error) throw new Error(error.message);
  return rowToAuditEntry(data);
}

export async function attachReplacementToAudit(auditId, { replacementName, replacementEntryId, replacementSource }) {
  const { data, error } = await supabase
    .from('withdrawal_audit')
    .update({
      replacement_name: replacementName,
      replacement_entry_id: replacementEntryId,
      replacement_source: replacementSource,
    })
    .eq('id', auditId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToAuditEntry(data);
}

// Finds the most recent still-open (no replacement yet) audit row for this
// entry slot — used when a replacement is called in later for a player who
// was withdrawn earlier with no replacement at the time.
async function findOpenAuditForEntry(entryId) {
  const { data, error } = await supabase
    .from('withdrawal_audit')
    .select('id')
    .eq('entry_id', entryId)
    .is('replacement_entry_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data.id : null;
}

export async function getWithdrawalAuditLog(eventId) {
  const { data, error } = await supabase
    .from('withdrawal_audit')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToAuditEntry);
}

// ---------------------------------------------------------------------------
// Phase 10 — Withdrawals & Alternates (+ Lucky Losers)
// ---------------------------------------------------------------------------

export async function setEntryWithdrawn(entryId, isWithdrawn) {
  if (isWithdrawn) {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: target, error: tErr } = await supabase
      .from('draw_entries')
      .select('event_id, draw_type, family_name, first_name, aita_reg, player_id')
      .eq('id', entryId)
      .single();
    if (tErr) throw new Error(tErr.message);
    await logWithdrawal({
      eventId: target.event_id,
      entryId,
      drawType: target.draw_type,
      playerName: target.family_name + (target.first_name ? `, ${target.first_name}` : ''),
      aitaReg: target.aita_reg,
      playerId: target.player_id,
      initiatedBy: 'referee',
      initiatedByUserId: user?.id,
    });
  }
  const { data, error } = await supabase
    .from('draw_entries')
    .update({ is_withdrawn: isWithdrawn })
    .eq('id', entryId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToEntry(data);
}

// Batch-withdraw multiple entries (Phase 14 — sets withdrawal_type + withdrawal_date + entry_status)
export async function bulkSetWithdrawn(entryIds, withdrawalType, withdrawalDate) {
  if (!entryIds.length) return [];
  const today = withdrawalDate || new Date().toISOString().slice(0, 10);

  const { data: { user } } = await supabase.auth.getUser();
  const { data: targets, error: tErr } = await supabase
    .from('draw_entries')
    .select('id, event_id, draw_type, family_name, first_name, aita_reg, player_id, event:events(tournament_week:tournament_weeks(grade))')
    .in('id', entryIds);
  if (tErr) throw new Error(tErr.message);
  await Promise.all((targets || []).map(target => logWithdrawal({
    eventId: target.event_id,
    entryId: target.id,
    drawType: target.draw_type,
    playerName: target.family_name + (target.first_name ? `, ${target.first_name}` : ''),
    aitaReg: target.aita_reg,
    playerId: target.player_id,
    withdrawalType,
    withdrawalDate: today,
    initiatedBy: 'referee',
    initiatedByUserId: user?.id,
    grade: target.event?.tournament_week?.grade || null,
  })));

  const { data, error } = await supabase
    .from('draw_entries')
    .update({
      is_withdrawn: true,
      entry_status: 'withdrawn',
      withdrawal_type: withdrawalType || 'W',
      withdrawal_date: today,
    })
    .in('id', entryIds)
    .select();
  if (error) throw new Error(error.message);
  return (data || []).map(rowToEntry);
}

// Overwrites targetEntryId's player fields with sourceEntry's (an alternate or
// a lucky loser), marks it as an alternate slot with a "replaces X" label, and
// consumes the source (deletes the alternate row, or marks the lucky_losers
// row called_in). event_matches never changes — it references targetEntryId,
// which keeps its id throughout.
export async function callInReplacement(targetEntryId, sourceEntry, sourceKind) {
  const { data: targetRow, error: tErr } = await supabase
    .from('draw_entries')
    .select('event_id, draw_type, family_name, first_name, aita_reg, player_id')
    .eq('id', targetEntryId)
    .single();
  if (tErr) throw new Error(tErr.message);
  const originalName = targetRow.family_name + (targetRow.first_name ? `, ${targetRow.first_name}` : '');
  const replacementName = sourceEntry.familyName + (sourceEntry.firstName ? `, ${sourceEntry.firstName}` : '');

  // If this slot was already logged as withdrawn (no replacement yet), attach
  // the replacement to that row instead of creating a duplicate audit entry.
  const openAuditId = await findOpenAuditForEntry(targetEntryId);
  if (openAuditId) {
    await attachReplacementToAudit(openAuditId, {
      replacementName, replacementEntryId: sourceEntry.id, replacementSource: sourceKind,
    });
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    await logWithdrawal({
      eventId: targetRow.event_id,
      entryId: targetEntryId,
      drawType: targetRow.draw_type,
      playerName: originalName,
      aitaReg: targetRow.aita_reg,
      playerId: targetRow.player_id,
      initiatedBy: 'referee',
      initiatedByUserId: user?.id,
      replacementName, replacementEntryId: sourceEntry.id, replacementSource: sourceKind,
    });
  }

  const { data, error } = await supabase
    .from('draw_entries')
    .update({
      family_name: sourceEntry.familyName,
      first_name: sourceEntry.firstName || null,
      aita_reg: sourceEntry.aitaReg || null,
      player_state: sourceEntry.playerState || null,
      ranking: sourceEntry.ranking || null,
      date_of_birth: sourceEntry.dateOfBirth || null,
      player_id: sourceEntry.playerId || null,
      status_code: sourceEntry.statusCode || null,
      is_alternate: true,
      replacing_name: originalName,
      is_withdrawn: false,
    })
    .eq('id', targetEntryId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (sourceKind === 'lucky_loser') {
    await supabase
      .from('lucky_losers')
      .update({ status: 'called_in', called_into_entry_id: targetEntryId })
      .eq('entry_id', sourceEntry.id);
  }
  await supabase.from('draw_entries').delete().eq('id', sourceEntry.id);

  return rowToEntry(data);
}

// Finds the single pending match still holding withdrawnEntryId, awards it to
// the opponent as a walkover. Returns null if there's no pending match yet
// (opponent slot undetermined), or the opponent is a BYE / already withdrawn.
// Caller is responsible for calling advanceWinner() with the returned info.
export async function processWalkoverIfNeeded(eventId, drawType, withdrawnEntryId) {
  const { data: match, error } = await supabase
    .from('event_matches')
    .select('*')
    .eq('event_id', eventId)
    .eq('draw_type', drawType)
    .eq('status', 'pending')
    .or(`entry1_id.eq.${withdrawnEntryId},entry2_id.eq.${withdrawnEntryId}`)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!match) return null;

  const opponentId = match.entry1_id === withdrawnEntryId ? match.entry2_id : match.entry1_id;
  if (!opponentId) return null;

  const { data: opp, error: oErr } = await supabase
    .from('draw_entries')
    .select('is_bye, is_withdrawn')
    .eq('id', opponentId)
    .single();
  if (oErr) throw new Error(oErr.message);
  if (opp.is_bye || opp.is_withdrawn) return null;

  const { error: uErr } = await supabase
    .from('event_matches')
    .update({ winner_entry_id: opponentId, outcome_type: 'walkover', status: 'complete', score: null })
    .eq('id', match.id);
  if (uErr) throw new Error(uErr.message);

  return { round: match.round, matchSlot: match.match_slot, winnerEntryId: opponentId };
}

// Nulls scheduling fields on this entry's not-yet-complete matches so stale
// Order-of-Play slots don't keep showing a withdrawn/replaced player.
// Organizer re-runs Auto-Schedule afterward.
// Gracefully skips if the scheduling columns haven't been migrated yet.
export async function clearScheduleForEntry(entryId) {
  const { error } = await supabase
    .from('event_matches')
    .update({ day_number: null, court_number: null, match_order: null })
    .neq('status', 'complete')
    .or(`entry1_id.eq.${entryId},entry2_id.eq.${entryId}`);
  // Ignore "column not found" errors — scheduling columns may not be migrated yet
  if (error && !error.message.includes('court_number') && !error.message.includes('day_number') && !error.message.includes('match_order')) {
    throw new Error(error.message);
  }
  return { ok: true };
}

// Losers of the qualifying deciding round — same round math as
// getQualifyingWinners, but returns the entry that did NOT win each match.
export async function getQualifyingLosers(eventId) {
  const { data: evRow, error: evErr } = await supabase
    .from('events')
    .select('qualifying_size, qualifying_spots')
    .eq('id', eventId)
    .single();
  if (evErr) throw new Error(evErr.message);

  const { qualifying_size: qSize, qualifying_spots: qSpots } = evRow;
  if (!qSize || !qSpots) throw new Error('Event has no qualifying configuration.');

  const decidingRound = Math.round(Math.log2(bracketSize(qSize) / qSpots));

  const { data: roundMatches, error: mErr } = await supabase
    .from('event_matches')
    .select('*')
    .eq('event_id', eventId)
    .eq('draw_type', 'qualifying')
    .eq('round', decidingRound)
    .order('match_slot', { ascending: true });
  if (mErr) throw new Error(mErr.message);

  if (!roundMatches || roundMatches.length < qSpots) return null;
  if (roundMatches.some(m => m.status !== 'complete' || !m.winner_entry_id)) return null;

  const loserIds = roundMatches
    .map(m => (m.winner_entry_id === m.entry1_id ? m.entry2_id : m.entry1_id))
    .filter(Boolean);
  if (loserIds.length === 0) return [];

  const { data: entryRows, error: eErr } = await supabase
    .from('draw_entries')
    .select('*')
    .in('id', loserIds);
  if (eErr) throw new Error(eErr.message);

  return entryRows.map(rowToEntry);
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Random-draw priority: shuffles newly-eligible qualifying losers (not
// already in the lucky_losers pool for this event) and inserts them with
// priority continuing after the current max. Never touches already-drawn rows.
//
// Verified against the source PDF: "1st Preference – To all ranked players
// losing in the final qualifying round picked up by lots. 2nd Preference –
// To all unranked players losing in the final qualifying round picked up by
// lots." That's two separate lots draws, ranked exhausted before unranked —
// not one flat shuffle across both groups (a single shuffle could hand an
// unranked loser a lower priority number than a ranked one, which the rule
// never allows).
export async function randomizeLuckyLosers(eventId) {
  const losers = await getQualifyingLosers(eventId);
  if (!losers) throw new Error('Qualifying deciding round is not complete yet.');

  const { data: existing, error: exErr } = await supabase
    .from('lucky_losers')
    .select('entry_id, priority')
    .eq('event_id', eventId);
  if (exErr) throw new Error(exErr.message);

  const existingIds = new Set((existing || []).map(r => r.entry_id));
  const newLosers = losers.filter(l => !existingIds.has(l.id));
  if (newLosers.length === 0) return [];

  const ranked   = shuffleInPlace(newLosers.filter(l => l.ranking != null));
  const unranked = shuffleInPlace(newLosers.filter(l => l.ranking == null));
  const ordered  = [...ranked, ...unranked];

  let nextPriority = (existing || []).reduce((max, r) => Math.max(max, r.priority), 0) + 1;
  const rows = ordered.map(l => ({
    event_id: eventId,
    entry_id: l.id,
    priority: nextPriority++,
    status: 'waiting',
  }));

  const { data, error } = await supabase.from('lucky_losers').insert(rows).select();
  if (error) throw new Error(error.message);
  return data;
}

function rowToLuckyLoser(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    entryId: row.entry_id,
    priority: row.priority,
    status: row.status,
    calledIntoEntryId: row.called_into_entry_id,
    createdAt: row.created_at,
    entry: row.entry ? rowToEntry(row.entry) : null,
  };
}

// lucky_losers has two FKs into draw_entries (entry_id, called_into_entry_id)
// — the embed must name the constraint or PostgREST can't pick one.
export async function getLuckyLosers(eventId) {
  const { data, error } = await supabase
    .from('lucky_losers')
    .select('*, entry:draw_entries!lucky_losers_entry_id_fkey(*)')
    .eq('event_id', eventId)
    .order('priority', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(rowToLuckyLoser);
}

// Overwrites the Q placeholder entries in the main draw with qualifier player
// data. Qualifiers (in slot order) are matched to main draw entries that have
// status_code = 'Q', sorted ascending by position.
export async function promoteQualifiers(eventId, qualifierEntries) {
  const { data: qSlots, error: qErr } = await supabase
    .from('draw_entries')
    .select('*')
    .eq('event_id', eventId)
    .eq('draw_type', 'main')
    .eq('status_code', 'Q')
    .eq('is_bye', false)
    .order('position', { ascending: true });
  if (qErr) throw new Error(qErr.message);
  if (!qSlots || qSlots.length === 0) {
    throw new Error('No Q placeholder entries found in main draw. Add entries with status "Q" first.');
  }

  const results = await Promise.all(
    qualifierEntries.slice(0, qSlots.length).map((qualifier, idx) =>
      supabase
        .from('draw_entries')
        .update({
          family_name: qualifier.familyName,
          first_name: qualifier.firstName,
          aita_reg: qualifier.aitaReg,
          player_state: qualifier.playerState,
          ranking: qualifier.ranking,
          date_of_birth: qualifier.dateOfBirth,
          status_code: 'Q',
          is_bye: false,
          seed: null,
        })
        .eq('id', qSlots[idx].id)
        .select()
        .single()
    )
  );

  const failed = results.find(r => r.error);
  if (failed) throw new Error(failed.error.message);
  return results.map(r => rowToEntry(r.data));
}

// ---------------------------------------------------------------------------
// Phase 17 — Notifications
// ---------------------------------------------------------------------------

function rowToNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    tournamentWeekId: row.tournament_week_id,
    eventId: row.event_id,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

// Player accounts eligible for a category by age (§4.2 rules). No gender
// column exists on user_profiles, so this filters by age only — category
// gender is still shown to the player in the notification/email copy.
export async function getEligiblePlayerUserIds(ageGroup, tournamentYear, playingUpAllowed, playingDownAllowed) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, date_of_birth')
    .eq('role', 'player')
    .not('date_of_birth', 'is', null);
  if (error) throw new Error(error.message);
  return data
    .filter(p => checkAgeEligibility(p.date_of_birth, ageGroup, tournamentYear, playingUpAllowed, playingDownAllowed).allowed)
    .map(p => p.id);
}

// Bulk in-app notification insert. { type, title, body, tournamentWeekId, eventId }
export async function createNotificationsForUsers(userIds, { type, title, body, tournamentWeekId, eventId }) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return [];
  const rows = ids.map(userId => ({
    user_id: userId,
    type,
    title,
    body: body || null,
    tournament_week_id: tournamentWeekId || null,
    event_id: eventId || null,
  }));
  const { data, error } = await supabase.from('notifications').insert(rows).select();
  if (error) throw new Error(error.message);
  return data.map(rowToNotification);
}

export async function getMyNotifications() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data.map(rowToNotification);
}

export async function getUnreadNotificationCount() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: true };
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Best-effort email delivery via the send-notification-email Edge Function.
// Never throws — an email failure shouldn't block the underlying organiser
// action; the in-app notification row (already written) is the source of truth.
export async function sendNotificationEmails(userIds, { subject, html }) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return { ok: true, skipped: true };
  try {
    const { error } = await supabase.functions.invoke('send-notification-email', {
      body: { userIds: ids, subject, html },
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('Notification email send failed:', error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Notification email send failed:', err.message);
    return { ok: false };
  }
}

// Phase 41 — generic "email arbitrary addresses" (tournament share dialog
// and anything else that needs to reach a non-platform-user email).
export async function sendEmail({ to, subject, html, replyTo }) {
  const { data, error } = await supabase.functions.invoke('send-email', { body: { to, subject, html, replyTo } });
  if (error) throw new Error(error.message);
  return data;
}

// Phase 39 — Web Push subscriptions + send trigger (mirrors
// sendNotificationEmails's best-effort/non-blocking shape exactly).
export async function savePushSubscription(userId, { endpoint, keys }) {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint, keys }, { onConflict: 'endpoint' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, userId: data.user_id, endpoint: data.endpoint };
}

export async function deletePushSubscription(endpoint) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function sendPushNotifications(userIds, { title, body, link }) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return { ok: true, skipped: true };
  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: { userIds: ids, title, body, link },
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('Push send failed:', error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Push send failed:', err.message);
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// AITA Calendar — mirrored tournaments + fact sheets (phase 25)
// Read-only from the client; the sync-aita-calendar Edge Function (cron +
// "Sync Now" button, both via triggerAitaSync) is the only writer.
// ---------------------------------------------------------------------------

const AITA_FACTSHEET_BUCKET = 'aita-factsheets';

function rowToAitaTournament(row) {
  return {
    id: row.id,
    aitaId: row.aita_id,
    name: row.name,
    grade: row.grade,
    ageGroup: row.age_group,
    category: row.category,
    city: row.city,
    venue: row.venue,
    startDate: row.start_date,
    sourceUrl: row.source_url,
    entryDeadline: row.entry_deadline,
    withdrawalDeadline: row.withdrawal_deadline,
    qualifyingStartDate: row.qualifying_start_date,
    qualifyingEndDate: row.qualifying_end_date,
    directorName: row.director_name,
    directorPhone: row.director_phone,
    directorEmail: row.director_email,
    refereeName: row.referee_name,
    refereePhone: row.referee_phone,
    refereeEmail: row.referee_email,
    venueAddress: row.venue_address,
    venuePincode: row.venue_pincode,
    venuePhone: row.venue_phone,
    surface: row.surface,
    ballBrand: row.ball_brand,
    hasFloodlights: row.has_floodlights,
    entryFeeSingles: row.entry_fee_singles,
    entryFeeDoubles: row.entry_fee_doubles,
    dailyAllowance: row.daily_allowance,
    signinInstructions: row.signin_instructions,
    drawSize: row.draw_size,
    factsheetUrl: row.factsheet_storage_path
      ? supabase.storage.from(AITA_FACTSHEET_BUCKET).getPublicUrl(row.factsheet_storage_path).data.publicUrl
      : null,
    lastSeenAt: row.last_seen_at,
    lastChangedAt: row.last_changed_at,
    linkedTournamentWeekId: row.linked_tournament_week_id,
    linkedEventId: row.linked_event_id,
  };
}

export async function listAitaTournaments({ ageGroup, city, grade, dateFrom, dateTo, search } = {}) {
  let query = supabase.from('aita_tournaments').select('*').order('start_date', { ascending: true });
  if (ageGroup) query = query.eq('age_group', ageGroup);
  if (city) query = query.ilike('city', `%${city}%`);
  if (grade) query = query.eq('grade', grade);
  if (dateFrom) query = query.gte('start_date', dateFrom);
  if (dateTo) query = query.lte('start_date', dateTo);
  if (search) query = query.ilike('name', `%${search}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.map(rowToAitaTournament);
}

// Distinct city/grade values across the whole calendar, for populating filter
// dropdowns — deliberately unfiltered by the caller's current selections so
// the option lists don't shrink as filters are applied.
export async function listAitaFilterFacets() {
  const { data, error } = await supabase.from('aita_tournaments').select('city, grade');
  if (error) throw new Error(error.message);
  const cities = new Set();
  const grades = new Set();
  for (const row of data) {
    if (row.city) cities.add(row.city);
    if (row.grade) grades.add(row.grade);
  }
  return {
    cities: [...cities].sort(),
    grades: [...grades].sort(),
  };
}

export async function getAitaTournament(id) {
  const { data, error } = await supabase.from('aita_tournaments').select('*').eq('id', id).single();
  if (error) throw new Error('Tournament not found');
  return rowToAitaTournament(data);
}

export async function getLatestAitaSyncLog() {
  const { data, error } = await supabase
    .from('aita_sync_log')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    startedAt: data.started_at,
    finishedAt: data.finished_at,
    tournamentsFound: data.tournaments_found,
    tournamentsUpserted: data.tournaments_upserted,
    tournamentsChanged: data.tournaments_changed,
    error: data.error,
    triggeredBy: data.triggered_by,
  };
}

export async function triggerAitaSync() {
  const { data, error } = await supabase.functions.invoke('sync-aita-calendar', { body: {} });
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------------
// Phase 45 — crowdsourced AITA participation. A player declaring "I'm
// playing" an AITA-calendar tournament (aita_participation_interest) is
// deliberately separate from the real tournament module's draw_entries —
// no draw exists yet at this point. See supabase/phase45_aita_crowdsourced.sql.
// ---------------------------------------------------------------------------

function rowToAitaParticipation(row) {
  return {
    id: row.id,
    aitaTournamentId: row.aita_tournament_id,
    status: row.status,
    createdAt: row.created_at,
    lastNudgedAt: row.last_nudged_at,
    // Phase 49 — only set when the tournament's own category/age_group
    // wasn't a reliable single answer and the player picked explicitly.
    selectedCategory: row.selected_category,
    selectedAgeGroup: row.selected_age_group,
    tournament: row.aita_tournaments ? rowToAitaTournament(row.aita_tournaments) : null,
  };
}

// Idempotent — re-declaring after a withdrawal flips status back to 'declared'
// instead of erroring on the (aita_tournament_id, user_id) unique constraint.
// `selection` ({ category, ageGroup }) is only meaningful — and only ever
// passed by the UI — when the tournament's own category isn't a clean
// Singles/Doubles line (see ParticipationWidget in AitaTournamentFactsheet.jsx).
export async function declareAitaParticipation(aitaTournamentId, selection) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('aita_participation_interest')
    .upsert(
      {
        aita_tournament_id: aitaTournamentId,
        user_id: user.id,
        status: 'declared',
        selected_category: selection?.category || null,
        selected_age_group: selection?.ageGroup || null,
      },
      { onConflict: 'aita_tournament_id,user_id' },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToAitaParticipation(data);
}

export async function withdrawAitaParticipation(aitaTournamentId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase
    .from('aita_participation_interest')
    .update({ status: 'withdrawn' })
    .eq('aita_tournament_id', aitaTournamentId)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
}

// This player's own declared-interest row for one tournament, or null —
// drives the "I'm Playing" button's state on the calendar card/factsheet.
export async function getMyAitaParticipationForTournament(aitaTournamentId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('aita_participation_interest')
    .select('*')
    .eq('aita_tournament_id', aitaTournamentId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToAitaParticipation(data) : null;
}

// This player's full list of declared AITA tournaments, tournament facts
// embedded — powers the dashboard's "My AITA Tournaments" card.
export async function getMyAitaParticipation() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('aita_participation_interest')
    .select('*, aita_tournaments(*)')
    .eq('user_id', user.id)
    .eq('status', 'declared')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToAitaParticipation);
}

// ---------------------------------------------------------------------------
// Phase 45 — crowdsourced draw-sheet uploads. A player uploads a photo/PDF
// of the real draw (AITA doesn't give us this); a super_admin confirms it's
// the right tournament before anything gets parsed or published. Storage
// path is `<uploader_uid>/<aitaTournamentId>-<timestamp>.<ext>` so
// storage.objects RLS can key off the folder name, same as
// uploadTrainingVideo above.
// ---------------------------------------------------------------------------

const AITA_DRAW_UPLOADS_BUCKET = 'aita-draw-uploads';

function rowToAitaDrawUpload(row) {
  return {
    id: row.id,
    aitaTournamentId: row.aita_tournament_id,
    uploadedBy: row.uploaded_by,
    storagePath: row.storage_path,
    uploadedAt: row.uploaded_at,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    parsedJson: row.parsed_json,
    publishedEventId: row.published_event_id,
    tournament: row.aita_tournaments ? rowToAitaTournament(row.aita_tournaments) : null,
  };
}

export async function uploadAitaDrawSheet(aitaTournamentId, file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${user.id}/${aitaTournamentId}-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(AITA_DRAW_UPLOADS_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await supabase
    .from('aita_draw_uploads')
    .insert({ aita_tournament_id: aitaTournamentId, uploaded_by: user.id, storage_path: path })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToAitaDrawUpload(data);
}

export async function getMyAitaDrawUploads(aitaTournamentId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('aita_draw_uploads')
    .select('*')
    .eq('aita_tournament_id', aitaTournamentId)
    .eq('uploaded_by', user.id)
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToAitaDrawUpload);
}

export async function getAitaDrawUploadFileUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(AITA_DRAW_UPLOADS_BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// super_admin review queue — every upload still awaiting a decision.
export async function getPendingAitaDrawUploads() {
  const { data, error } = await supabase
    .from('aita_draw_uploads')
    .select('*, aita_tournaments(*)')
    .eq('status', 'pending_review')
    .order('uploaded_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(rowToAitaDrawUpload);
}

export async function confirmAitaDrawUpload(uploadId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('aita_draw_uploads')
    .update({ status: 'confirmed', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', uploadId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToAitaDrawUpload(data);
}

export async function rejectAitaDrawUpload(uploadId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('aita_draw_uploads')
    .update({ status: 'confirmed_wrong', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', uploadId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToAitaDrawUpload(data);
}

// Uploads the admin has confirmed belong to the right tournament, but hasn't
// transcribed/published yet.
export async function getConfirmedAitaDrawUploads() {
  const { data, error } = await supabase
    .from('aita_draw_uploads')
    .select('*, aita_tournaments(*)')
    .eq('status', 'confirmed')
    .order('reviewed_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(rowToAitaDrawUpload);
}

// Turns a confirmed upload + the admin's transcribed entry list into a real
// tournament_weeks/events/draw_entries/event_matches record — from this
// point on it's indistinguishable from an organiser-run event, so the
// existing bracket UI, TournamentsTab.jsx and match-tracker linking all
// pick it up with zero further code. `entries` is
// [{ position, familyName, firstName, aitaReg, playerState, ranking, seed, statusCode }],
// admin-typed off the uploaded photo/PDF (no OCR — see phase45 plan).
// `drawType` ('qualifying' | 'main') matters because a qualifying draw is
// often uploaded before the main draw exists — the SECOND publish for the
// same tournament reuses the shadow week/event the first one created
// (same event, two draw_types, exactly like an organiser-run event) rather
// than creating a duplicate tournament.
export async function publishAitaDrawSheet({ uploadId, aitaTournamentId, drawType, entries }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  if (!entries || entries.length === 0) throw new Error('No entries to publish');
  if (drawType !== 'qualifying' && drawType !== 'main') throw new Error('drawType must be "qualifying" or "main"');

  const t = await getAitaTournament(aitaTournamentId);

  let week, event;
  if (t.linkedTournamentWeekId) {
    week = await getTournamentWeek(t.linkedTournamentWeekId);
    // An organizer-claimed tournament (phase 46) is off-limits to the
    // crowdsourced path — "everything done by the organizer" from there on.
    if (week.source !== 'aita_crowdsourced') {
      throw new Error('This tournament is already live on the platform through an organizer — crowdsourced publishing is no longer available.');
    }
    event = t.linkedEventId ? await getEvent(t.linkedEventId) : null;
  }
  if (!week) {
    week = await createTournamentWeek(user.id, {
      name: t.name,
      location: t.venue,
      city: t.city,
      surface: t.surface,
      startDate: t.startDate,
      grade: t.grade,
      entryDeadline: t.entryDeadline,
      withdrawalDeadline: t.withdrawalDeadline,
      source: 'aita_crowdsourced',
    });
    await supabase.from('aita_tournaments').update({ linked_tournament_week_id: week.id }).eq('id', aitaTournamentId);
  }
  if (!event) {
    event = await createEvent(week.id, {
      category: t.category || t.ageGroup || 'Singles',
      ageGroup: t.ageGroup || '',
      drawSize: entries.length,
      numSeeds: entries.filter(e => e.seed).length,
      hasQualifying: drawType === 'qualifying',
    });
    await supabase.from('aita_tournaments').update({ linked_event_id: event.id }).eq('id', aitaTournamentId);
  }

  const created = await bulkAddDrawEntries(event.id, drawType, entries, 'aita_import');

  // Match transcribed entries to platform accounts by AITA reg, so their
  // real tournament list / bracket / tracker linking picks this event up
  // for free via TournamentsTab.jsx (which reads off draw_entries.player_id)
  // — a raw single-column update here rather than updateDrawEntry(), which
  // is a full-row replace and would need every other field re-supplied.
  const regs = created.map(e => e.aitaReg).filter(Boolean);
  let matchedPlayerIds = [];
  if (regs.length > 0) {
    const { data: matches } = await supabase
      .from('user_profiles')
      .select('id, aita_reg')
      .eq('role', 'player')
      .in('aita_reg', regs);
    const byReg = new Map((matches || []).map(m => [m.aita_reg, m.id]));
    const updates = created
      .map(e => ({ entryId: e.id, playerId: byReg.get(e.aitaReg) }))
      .filter(u => u.playerId);
    await Promise.all(updates.map(u =>
      supabase.from('draw_entries').update({ player_id: u.playerId }).eq('id', u.entryId)
    ));
    matchedPlayerIds = updates.map(u => u.playerId);
  }

  const sorted = [...created].sort((a, b) => a.position - b.position);
  await initializeEventMatches(event.id, drawType, sorted, undefined);
  // Event status tracks the MAIN draw's lifecycle (matches the organiser
  // flow's meaning of 'draw_ready') — a qualifying-only publish doesn't
  // flip it, since the main draw isn't necessarily out yet.
  if (drawType === 'main') {
    await updateEvent(event.id, { status: 'draw_ready' });
  }

  await supabase.from('aita_draw_uploads')
    .update({ status: 'published', published_event_id: event.id })
    .eq('id', uploadId);

  if (matchedPlayerIds.length > 0) {
    try {
      await createNotificationsForUsers(matchedPlayerIds, {
        type: 'draw_published',
        title: `Draw published: ${t.name}`,
        body: `A crowdsourced draw for ${t.name} has been added to your tournaments.`,
        tournamentWeekId: week.id,
        eventId: event.id,
      });
    } catch {
      // best-effort, same as the organiser draw-publish notification path
    }
  }

  return { week, event };
}

// ---------------------------------------------------------------------------
// Phase 45 — crowdsourced EOD results-sheet uploads. Any player already in a
// published crowdsourced draw (draw_entries.player_id) can upload a results
// photo/PDF; a super_admin always reviews before it's applied — no
// auto-publish, unlike the lighter single-confirm draw-sheet gate. Same
// bucket-path convention as draw uploads: `<uploader_uid>/<eventId>-<ts>.<ext>`.
// ---------------------------------------------------------------------------

const AITA_RESULTS_UPLOADS_BUCKET = 'aita-results-uploads';

function rowToAitaResultsUpload(row) {
  return {
    id: row.id,
    aitaTournamentId: row.aita_tournament_id,
    eventId: row.event_id,
    uploadedBy: row.uploaded_by,
    storagePath: row.storage_path,
    uploadedAt: row.uploaded_at,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    appliedAt: row.applied_at,
    tournament: row.aita_tournaments ? rowToAitaTournament(row.aita_tournaments) : null,
  };
}

// Callers only know the real eventId (e.g. TournamentsTab.jsx) — the
// aita_tournaments row is resolved here via its reverse link (set at
// publish time by publishAitaDrawSheet) rather than asking every call site
// to carry both ids around.
export async function uploadAitaResultsSheet(eventId, file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data: t, error: tErr } = await supabase
    .from('aita_tournaments')
    .select('id')
    .eq('linked_event_id', eventId)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!t) throw new Error('This event is not linked to an AITA calendar tournament');

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${user.id}/${eventId}-${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(AITA_RESULTS_UPLOADS_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await supabase
    .from('aita_results_uploads')
    .insert({ aita_tournament_id: t.id, event_id: eventId, uploaded_by: user.id, storage_path: path })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToAitaResultsUpload(data);
}

export async function getMyAitaResultsUploads(eventId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('aita_results_uploads')
    .select('*')
    .eq('event_id', eventId)
    .eq('uploaded_by', user.id)
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToAitaResultsUpload);
}

export async function getAitaResultsUploadFileUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(AITA_RESULTS_UPLOADS_BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function getPendingAitaResultsUploads() {
  const { data, error } = await supabase
    .from('aita_results_uploads')
    .select('*, aita_tournaments(*)')
    .eq('status', 'pending_review')
    .order('uploaded_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(rowToAitaResultsUpload);
}

export async function rejectAitaResultsUpload(uploadId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('aita_results_uploads')
    .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', uploadId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToAitaResultsUpload(data);
}

// results: [{ round, matchSlot, winnerPosition, score, outcomeType }], admin-
// typed off the uploaded photo/PDF against the event's existing bracket
// (round/match_slot already exist from the draw-publish step — see
// publishAitaDrawSheet). Reuses the exact same updateMatchScore +
// advanceWinner + draw_ready->in_progress flip the organiser score-entry UI
// already does (EventDetailPage.jsx's handleScoreMatch), so bracket state
// stays consistent whichever path wrote it.
export async function applyAitaResultsSheet({ uploadId, eventId, results }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  if (!results || results.length === 0) throw new Error('No results to apply');

  const [{ data: entries, error: eErr }, { data: matches, error: mErr }, event] = await Promise.all([
    supabase.from('draw_entries').select('id, position').eq('event_id', eventId).eq('draw_type', 'main'),
    supabase.from('event_matches').select('id, round, match_slot').eq('event_id', eventId).eq('draw_type', 'main'),
    getEvent(eventId),
  ]);
  if (eErr) throw new Error(eErr.message);
  if (mErr) throw new Error(mErr.message);

  const idByPosition = new Map((entries || []).map(e => [e.position, e.id]));
  const matchByRoundSlot = new Map((matches || []).map(m => [`${m.round}|${m.match_slot}`, m.id]));
  const totalRounds = Math.ceil(Math.log2(event.drawSize || (matches || []).length * 2));
  const wasDrawReady = event.status === 'draw_ready';

  let applied = 0;
  for (const r of results) {
    const matchId = matchByRoundSlot.get(`${r.round}|${r.matchSlot}`);
    const winnerEntryId = idByPosition.get(Number(r.winnerPosition));
    if (!matchId || !winnerEntryId) continue;
    await updateMatchScore(matchId, {
      score: r.score || null,
      winnerEntryId,
      outcomeType: r.outcomeType || 'score',
      status: 'complete',
      umpire: null,
    });
    if (r.round < totalRounds) {
      await advanceWinner(eventId, 'main', r.round, r.matchSlot, winnerEntryId);
    }
    applied++;
  }

  if (wasDrawReady && applied > 0) {
    await updateEvent(eventId, { status: 'in_progress' });
  }

  await supabase.from('aita_results_uploads')
    .update({ status: 'applied', applied_at: new Date().toISOString(), reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', uploadId);

  return { applied };
}

// ---------------------------------------------------------------------------
// Phase 46 — organizer claims on AITA Calendar tournaments. A verified
// real-world organizer can claim a listed tournament instead of it only
// ever being crowdsourced; a super_admin approves, which creates a real
// tournament_weeks row (source='aita_claimed') and links it back via
// linked_tournament_week_id — the same "is this AITA row already live on
// the platform" signal the crowdsourced draw-publish path also sets.
// ---------------------------------------------------------------------------

// AITA calendar/factsheet age groups are spelled out ("Under 14"); the
// tournament schema's events.age_group is 'U14'-style. Returns '' when it
// doesn't match that pattern (e.g. 'Men'/'Women'/'Senior', which have no
// junior-style U-code equivalent).
function mapAitaAgeGroupToU(raw) {
  const m = (raw || '').match(/^Under\s*(\d+)$/i);
  return m ? `U${m[1]}` : '';
}

function rowToAitaOrganizerClaim(row) {
  return {
    id: row.id,
    aitaTournamentId: row.aita_tournament_id,
    claimedBy: row.claimed_by,
    status: row.status,
    createdAt: row.created_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    tournamentWeekId: row.tournament_week_id,
    tournament: row.aita_tournaments ? rowToAitaTournament(row.aita_tournaments) : null,
  };
}

// Idempotent (upsert on aita_tournament_id+claimed_by) — an organizer
// re-claiming after a rejection, or after deleting the tournament_weeks row
// an earlier approval created (which resets aita_tournaments.
// linked_tournament_week_id to null via ON DELETE SET NULL, so the "Claim
// as Organizer" button reappears even though their old claim row is still
// sitting there), resets that row back to 'pending' instead of hitting the
// (aita_tournament_id, claimed_by) unique constraint on a fresh insert.
export async function claimAitaTournamentAsOrganizer(aitaTournamentId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('aita_organizer_claims')
    .upsert(
      {
        aita_tournament_id: aitaTournamentId,
        claimed_by: user.id,
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
        tournament_week_id: null,
      },
      { onConflict: 'aita_tournament_id,claimed_by' },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);

  try {
    const [{ data: admins }, t] = await Promise.all([
      supabase.from('user_profiles').select('id').eq('role', 'super_admin'),
      getAitaTournament(aitaTournamentId),
    ]);
    const adminIds = (admins || []).map(a => a.id);
    if (adminIds.length > 0) {
      await createNotificationsForUsers(adminIds, {
        type: 'aita_claim_requested',
        title: `Organizer claim: ${t.name}`,
        body: `An organizer wants to run ${t.name} on the platform — review it in Admin Review.`,
      });
    }
  } catch {
    // best-effort, same as every other notification path in this file
  }

  return rowToAitaOrganizerClaim(data);
}

// This organizer's own most recent claim for one tournament, or null —
// drives the claim button's state on the calendar card/factsheet.
export async function getMyAitaClaimForTournament(aitaTournamentId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('aita_organizer_claims')
    .select('*')
    .eq('aita_tournament_id', aitaTournamentId)
    .eq('claimed_by', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToAitaOrganizerClaim(data) : null;
}

export async function getPendingAitaOrganizerClaims() {
  const { data, error } = await supabase
    .from('aita_organizer_claims')
    .select('*, aita_tournaments(*)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const claims = data.map(rowToAitaOrganizerClaim);

  // aita_organizer_claims.claimed_by references auth.users, not
  // user_profiles, so PostgREST can't embed this join — fetched separately
  // and merged client-side instead.
  const claimantIds = [...new Set(claims.map(c => c.claimedBy))];
  if (claimantIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, display_name, club_name, is_verified')
      .in('id', claimantIds);
    const byId = new Map((profiles || []).map(p => [p.id, p]));
    for (const c of claims) {
      const p = byId.get(c.claimedBy);
      c.claimant = p ? { id: p.id, displayName: p.display_name, clubName: p.club_name, isVerified: p.is_verified } : null;
    }
  }
  return claims;
}

export async function approveAitaOrganizerClaim(claimId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data: claimRow, error: cErr } = await supabase.from('aita_organizer_claims').select('*').eq('id', claimId).single();
  if (cErr) throw new Error(cErr.message);

  const t = await getAitaTournament(claimRow.aita_tournament_id);

  const week = await createTournamentWeek(claimRow.claimed_by, {
    name: t.name,
    location: t.venue,
    city: t.city,
    surface: t.surface,
    startDate: t.startDate,
    grade: t.grade,
    entryDeadline: t.entryDeadline,
    withdrawalDeadline: t.withdrawalDeadline,
    source: 'aita_claimed',
  });

  // Auto-fill every event this tournament likely has, from the official
  // AITA data we already have — rather than handing the organizer an empty
  // tournament to build up by hand. A "Category" line like "U-14 & 16 Boys &
  // Girls" tells us the full set: every detected age group x every detected
  // gender's Singles/Doubles (+ Mixed Doubles when both halves of a pair are
  // present) — see aitaGradeRules.js. Age groups and genders are detected
  // independently, though, and a category string can carry one without the
  // other (confirmed live: "U-12 & 14" with no gender words at all) — when
  // genders come back empty, default to the standard 5-category AITA junior
  // (or adult) spread for whatever age groups we did find, rather than
  // creating nothing. Wrong or extra guesses are just an edit/delete away —
  // this auto-fill is deliberately aggressive, not conservative.
  const detectedAgeGroups = extractAgeGroupsFromCategoryText(t.category);
  const ageGroups = detectedAgeGroups.length > 0
    ? detectedAgeGroups
    : [mapAitaAgeGroupToU(t.ageGroup) || 'Open'];
  const isJunior = ageGroups.some(g => /^U\d+$/.test(g));

  const detectedCategories = categoriesForGenders(extractGendersFromCategoryText(t.category));
  const categories = detectedCategories.length > 0
    ? detectedCategories
    : (t.category && /single|double/i.test(t.category)
      ? [t.category]
      : (isJunior
        ? ['Boys Singles', 'Girls Singles', 'Boys Doubles', 'Girls Doubles', 'Mixed Doubles']
        : ['Men Singles', 'Women Singles', 'Men Doubles', 'Women Doubles', 'Mixed Doubles']));

  const createdEvents = [];
  for (const ageGroup of ageGroups) {
    for (const category of categories) {
      const defaults = getAitaDrawDefaults(t.grade, category);
      // eslint-disable-next-line no-await-in-loop
      const ev = await createEvent(week.id, {
        category,
        ageGroup,
        drawSize: defaults.drawSize,
        numSeeds: defaults.numSeeds,
        hasQualifying: defaults.hasQualifying,
        qualifyingSize: defaults.qualifyingSize,
        qualifyingSpots: defaults.qualifyingSpots,
      });
      createdEvents.push(ev);
    }
  }
  // linked_event_id only makes sense for a single-event tournament (the
  // crowdsourced draw-publish path, which is always exactly one draw) — a
  // claimed tournament with 0 or many auto-filled events has no single
  // "the" event, so this stays null and only linked_tournament_week_id
  // marks it live on the platform.
  const event = createdEvents.length === 1 ? createdEvents[0] : null;

  await supabase.from('aita_tournaments')
    .update({ linked_tournament_week_id: week.id, linked_event_id: event?.id || null })
    .eq('id', claimRow.aita_tournament_id);

  await supabase.from('aita_organizer_claims')
    .update({ status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(), tournament_week_id: week.id })
    .eq('id', claimId);

  // Any other still-pending claims on the same tournament are now moot —
  // only one organizer can run it.
  await supabase.from('aita_organizer_claims')
    .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('aita_tournament_id', claimRow.aita_tournament_id)
    .eq('status', 'pending')
    .neq('id', claimId);

  try {
    let body;
    if (createdEvents.length === 1) {
      body = `You're now the organizer for ${t.name}. We've pre-filled ${event.category} ${event.ageGroup} — review and adjust it, then add any other events.`;
    } else if (createdEvents.length > 1) {
      body = `You're now the organizer for ${t.name}. We've pre-filled ${createdEvents.length} events (${createdEvents.map(e => `${e.ageGroup} ${e.category}`).join(', ')}) — review, edit, or delete any that don't apply.`;
    } else {
      body = `You're now the organizer for ${t.name}. Add your events to get started.`;
    }
    await createNotificationsForUsers([claimRow.claimed_by], {
      type: 'aita_claim_approved',
      title: `Claim approved: ${t.name}`,
      body,
      tournamentWeekId: week.id,
    });
  } catch {
    // best-effort
  }

  return { week, event, events: createdEvents };
}

export async function rejectAitaOrganizerClaim(claimId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: claimRow, error } = await supabase
    .from('aita_organizer_claims')
    .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', claimId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  try {
    const t = await getAitaTournament(claimRow.aita_tournament_id);
    await createNotificationsForUsers([claimRow.claimed_by], {
      type: 'aita_claim_rejected',
      title: `Claim not approved: ${t.name}`,
      body: `Your request to organize ${t.name} on the platform wasn't approved.`,
    });
  } catch {
    // best-effort
  }

  return rowToAitaOrganizerClaim(claimRow);
}

// Players who declared "I'm playing" this AITA tournament before it was
// claimed, not yet resolved into (or out of) this specific event's entries.
// Resolved via the event's tournament_week -> aita_tournaments reverse link
// (linked_tournament_week_id), same lookup shape as uploadAitaResultsSheet.
// Filters to interest rows whose confirmed (or, absent an explicit
// selection, the tournament's own) category + age group actually matches
// THIS event — a single AITA calendar listing can cover several draws (see
// the phase49 migration comment), so without this a Girls U16 declaration
// could show up under a Boys U14 event's accept/decline list. Rows with no
// signal either way (nothing to compare) are still surfaced rather than
// silently dropped, so the organizer at least gets a chance to look.
export async function getUnresolvedAitaInterestForEvent(eventId) {
  const { data: event, error: eErr } = await supabase.from('events').select('tournament_week_id, category, age_group').eq('id', eventId).single();
  if (eErr) throw new Error(eErr.message);

  const { data: t, error: tErr } = await supabase
    .from('aita_tournaments')
    .select('id, category, age_group')
    .eq('linked_tournament_week_id', event.tournament_week_id)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!t) return [];

  const { data, error } = await supabase
    .from('aita_participation_interest')
    .select('id, user_id, created_at, selected_category, selected_age_group, user:user_profiles(id, display_name, aita_reg, state_abbr, ranking, date_of_birth)')
    .eq('aita_tournament_id', t.id)
    .eq('status', 'declared')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const tournamentAgeGroup = mapAitaAgeGroupToU(t.age_group);

  return (data || [])
    .map(row => ({
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      category: row.selected_category || t.category || null,
      ageGroup: row.selected_age_group || tournamentAgeGroup || null,
      displayName: row.user?.display_name || 'Unknown player',
      aitaReg: row.user?.aita_reg || null,
      stateAbbr: row.user?.state_abbr || null,
      ranking: row.user?.ranking || null,
      dateOfBirth: row.user?.date_of_birth || null,
    }))
    .filter(r => (!r.category || r.category === event.category) && (!r.ageGroup || r.ageGroup === event.age_group));
}

// interestRow is exactly one entry from getUnresolvedAitaInterestForEvent's
// return — accepting creates a real draw_entries row (via the same
// addDrawEntry organizer manual-entry already uses, so it defaults to
// entry_source='organiser'/entry_status='placed' the normal way) at the
// next open position; declining just resolves the interest row.
export async function resolveAitaInterest(interestRow, eventId, accept) {
  let entryId = null;

  if (accept) {
    const { data: maxRow } = await supabase
      .from('draw_entries')
      .select('position')
      .eq('event_id', eventId)
      .eq('draw_type', 'main')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.position || 0) + 1;

    const displayName = interestRow.displayName || '';
    const created = await addDrawEntry(eventId, 'main', {
      position: nextPos,
      familyName: displayName.split(' ').pop() || displayName || 'Player',
      firstName: displayName.split(' ').slice(0, -1).join(' ') || null,
      aitaReg: interestRow.aitaReg || null,
      playerState: interestRow.stateAbbr || null,
      ranking: interestRow.ranking || null,
      dateOfBirth: interestRow.dateOfBirth || null,
      playerId: interestRow.userId,
    });
    entryId = created.id;
  }

  const { error } = await supabase
    .from('aita_participation_interest')
    .update({ status: accept ? 'accepted' : 'declined', resolved_event_id: eventId, resolved_entry_id: entryId })
    .eq('id', interestRow.id);
  if (error) throw new Error(error.message);

  return { entryId };
}

// ---------------------------------------------------------------------------
// AITA Player Rankings — mirrored from https://aitatennis.com/playerranking/
// Read-only from the client. Historical data came from local backfill
// scripts (scripts/aita-rankings/backfill.mjs); ongoing freshness is
// sync-aita-rankings (Phase 6 — weekly cron + this manual trigger), scoped
// to the 8 Junior combos backfilled in Phases 1-2. See AITA_RANKINGS_PLAN.md.
// ---------------------------------------------------------------------------

export async function triggerAitaRankingsSync() {
  const { data, error } = await supabase.functions.invoke('sync-aita-rankings', { body: {} });
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------------
// Phase 44 — Computed skill rating (Glicko-2), singles only. Distinct from
// the official AITA rank above: this is an algorithmic rating computed by
// supabase/functions/compute-ratings from official tournament bracket
// results (see that file's header for why practice matches aren't used).
// Read-only from the client — the Edge Function is the only writer.
// ---------------------------------------------------------------------------

function rowToPlayerRating(row) {
  return {
    subjectKey: row.subject_key,
    subjectType: row.subject_type,
    playerId: row.player_id,
    format: row.format,
    rating: Number(row.rating),
    rd: Number(row.rd),
    volatility: Number(row.volatility),
    matchesCount: row.matches_count,
    lastUpdated: row.last_updated,
  };
}

// Looks up a computed rating by platform player_id first, falling back to
// aita_reg — covers players who competed (and got rated from those
// results) before ever creating an account, or who never will.
export async function getPlayerRating({ playerId, aitaReg }, format = 'singles') {
  if (playerId) {
    const { data, error } = await supabase
      .from('player_ratings')
      .select('*')
      .eq('player_id', playerId)
      .eq('format', format)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return rowToPlayerRating(data);
  }
  if (aitaReg) {
    const { data, error } = await supabase
      .from('player_ratings')
      .select('*')
      .eq('subject_key', aitaReg)
      .eq('subject_type', 'aita_reg')
      .eq('format', format)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return rowToPlayerRating(data);
  }
  return null;
}

// Trend snapshots for PlayerRatingCard's sparkline — one row per
// tournament week the subject was rated in.
export async function getPlayerRatingHistory({ playerId, aitaReg }, format = 'singles', limit = 30) {
  const rating = await getPlayerRating({ playerId, aitaReg }, format);
  if (!rating) return [];
  const { data, error } = await supabase
    .from('rating_history')
    .select('rating, rd, matches_count, created_at')
    .eq('subject_key', rating.subjectKey)
    .eq('format', format)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map(r => ({
    rating: Number(r.rating),
    rd: Number(r.rd),
    matchesCount: r.matches_count,
    createdAt: r.created_at,
  }));
}

// Batched lookup for the pre-draw entries list (EventDetailPage) — one pair
// of queries for the whole visible list instead of one per row.
export async function getPlayerRatingsBatch({ playerIds = [], aitaRegs = [] }, format = 'singles') {
  const results = [];
  if (playerIds.length > 0) {
    const { data, error } = await supabase
      .from('player_ratings')
      .select('*')
      .eq('format', format)
      .in('player_id', playerIds);
    if (error) throw new Error(error.message);
    results.push(...(data || []).map(rowToPlayerRating));
  }
  if (aitaRegs.length > 0) {
    const { data, error } = await supabase
      .from('player_ratings')
      .select('*')
      .eq('format', format)
      .eq('subject_type', 'aita_reg')
      .in('subject_key', aitaRegs);
    if (error) throw new Error(error.message);
    results.push(...(data || []).map(rowToPlayerRating));
  }
  return results;
}

export async function triggerComputeRatings() {
  const { data, error } = await supabase.functions.invoke('compute-ratings', { body: {} });
  if (error) throw new Error(error.message);
  return data;
}

function rowToAitaRanking(row) {
  return {
    id: row.id,
    category: row.category,
    subcategory: row.subcategory,
    rankingDate: row.ranking_date,
    rowOrder: row.row_order,
    rank: row.rank,
    playerName: row.player_name,
    regNo: row.reg_no,
    dob: row.dob,
    state: row.state,
    totalPoints: row.total_points,
    pointsBreakdown: row.points_breakdown,
  };
}

// Which Category/SubCategory combos actually have data loaded — sourced from
// the (small) sync log rather than scanning the full rankings table, since
// only a handful of the 38 possible combos are backfilled at any given time.
export async function listAitaRankingFacets() {
  const { data, error } = await supabase
    .from('aita_rankings_sync_log')
    .select('category, subcategory')
    .gt('rows_upserted', 0);
  if (error) throw new Error(error.message);
  const seen = new Map();
  for (const row of data) {
    const key = `${row.category}|${row.subcategory}`;
    if (!seen.has(key)) seen.set(key, { category: row.category, subcategory: row.subcategory });
  }
  return [...seen.values()].sort((a, b) =>
    a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory)
  );
}

// Distinct published dates for one combo. Filtering on row_order = 1 (every
// snapshot has exactly one) instead of a real SELECT DISTINCT, which
// PostgREST/supabase-js has no query-builder support for.
export async function listAitaRankingDates(category, subcategory) {
  const { data, error } = await supabase
    .from('aita_rankings')
    .select('ranking_date')
    .eq('category', category)
    .eq('subcategory', subcategory)
    .eq('row_order', 1)
    .order('ranking_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(r => r.ranking_date);
}

export async function listAitaRankings({ category, subcategory, date, search, page = 0, pageSize = 50 }) {
  let query = supabase
    .from('aita_rankings')
    .select('*', { count: 'exact' })
    .eq('category', category)
    .eq('subcategory', subcategory)
    .eq('ranking_date', date);
  if (search) query = query.ilike('player_name', `%${search}%`);
  query = query.order('row_order', { ascending: true }).range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: data.map(rowToAitaRanking), totalCount: count };
}

// Every ranking snapshot a given AITA reg number appears in, across every
// category/subcategory — not just the one the caller thinks they're in.
// Because "playing up" is allowed with no approval (see AITA rules KB), one
// reg_no can be live in several age groups/circuits at once; this is what
// lets the Performance tab auto-discover a player's circuits instead of
// making them pick a category by hand. reg_no already has a dedicated index
// (aita_rankings_regno), so this stays cheap even at full backfill.
export async function getPlayerAitaRankingHistory(regNo) {
  if (!regNo) return [];
  const { data, error } = await supabase
    .from('aita_rankings')
    .select('category, subcategory, ranking_date, rank, total_points')
    .eq('reg_no', regNo)
    .order('category', { ascending: true })
    .order('subcategory', { ascending: true })
    .order('ranking_date', { ascending: true })
    .range(0, 4999);
  if (error) throw new Error(error.message);
  return data.map(r => ({
    category: r.category,
    subcategory: r.subcategory,
    date: r.ranking_date,
    rank: r.rank,
    totalPoints: r.total_points,
  }));
}

// ---------------------------------------------------------------------------
// Multi-segment dashboard, Phase 3 — ranking_goals + training_sessions
// (supabase/phase29_ranking_goals_training.sql). Both are segment-scoped
// (category/subcategory/circuit_key) and fully independent per segment — no
// cross-segment roll-up here, see the plan doc's Context section for why.
// ---------------------------------------------------------------------------

function rowToRankingGoal(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    category: row.category,
    subcategory: row.subcategory,
    circuitKey: row.circuit_key,
    targetRank: row.target_rank,
    targetPoints: row.target_points,
    targetDate: row.target_date,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function getRankingGoals(playerId, category, subcategory) {
  let query = supabase.from('ranking_goals').select('*').eq('player_id', playerId);
  if (category) query = query.eq('category', category).eq('subcategory', subcategory);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToRankingGoal);
}

export async function createRankingGoal(playerId, { category, subcategory, targetRank, targetPoints, targetDate, notes }) {
  const { data, error } = await supabase
    .from('ranking_goals')
    .insert({
      player_id: playerId, category, subcategory,
      circuit_key: circuitKeyFor(category, subcategory),
      target_rank: targetRank || null, target_points: targetPoints || null,
      target_date: targetDate || null, notes: notes || null,
    })
    .select().single();
  if (error) throw new Error(error.message);
  return rowToRankingGoal(data);
}

export async function updateRankingGoal(goalId, patch) {
  const row = {};
  if ('targetRank' in patch) row.target_rank = patch.targetRank;
  if ('targetPoints' in patch) row.target_points = patch.targetPoints;
  if ('targetDate' in patch) row.target_date = patch.targetDate;
  if ('status' in patch) row.status = patch.status;
  if ('notes' in patch) row.notes = patch.notes;
  row.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('ranking_goals').update(row).eq('id', goalId).select().single();
  if (error) throw new Error(error.message);
  return rowToRankingGoal(data);
}

export async function deleteRankingGoal(goalId) {
  const { error } = await supabase.from('ranking_goals').delete().eq('id', goalId);
  if (error) throw new Error(error.message);
}

function circuitKeyFor(category, subcategory) {
  return `${category}|${subcategory}`;
}

function rowToTrainingSession(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    loggedBy: row.logged_by,
    category: row.category,
    subcategory: row.subcategory,
    circuitKey: row.circuit_key,
    sessionDate: row.session_date,
    durationMinutes: row.duration_minutes,
    focusAreas: row.focus_areas || [],
    drillIds: row.drill_ids || [],
    intensity: row.intensity,
    notes: row.notes,
    createdAt: row.created_at,
    videoPath: row.video_path,
    thumbnailPath: row.thumbnail_path,
    durationSec: row.duration_sec,
  };
}

export async function getTrainingSessions(playerId, category, subcategory) {
  let query = supabase.from('training_sessions').select('*').eq('player_id', playerId);
  if (category) query = query.eq('category', category).eq('subcategory', subcategory);
  const { data, error } = await query.order('session_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToTrainingSession);
}

export async function logTrainingSession(playerId, { category, subcategory, sessionDate, durationMinutes, focusAreas, intensity, notes, drillIds }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('training_sessions')
    .insert({
      player_id: playerId, logged_by: user.id, category, subcategory,
      circuit_key: circuitKeyFor(category, subcategory),
      session_date: sessionDate, duration_minutes: durationMinutes || null,
      focus_areas: focusAreas || [], drill_ids: drillIds || null,
      intensity: intensity || null, notes: notes || null,
    })
    .select().single();
  if (error) throw new Error(error.message);
  return rowToTrainingSession(data);
}

export async function deleteTrainingSession(sessionId) {
  const { error } = await supabase.from('training_sessions').delete().eq('id', sessionId);
  if (error) throw new Error(error.message);
}

// Phase 42 — video attached to a training session. Uploaded to
// `<playerId>/<sessionId>-<name>` so storage.objects RLS (phase42_
// training_video_storage.sql) can key off the folder name; thumbnail
// capture itself is client-side (src/lib/video.js), this just uploads both
// blobs and records their paths on the session row.
const TRAINING_VIDEO_BUCKET = 'training-videos';

export async function uploadTrainingVideo(playerId, sessionId, videoFile, thumbnailBlob, durationSec) {
  const videoPath = `${playerId}/${sessionId}-video.${(videoFile.name.split('.').pop() || 'mp4')}`;
  const thumbPath = `${playerId}/${sessionId}-thumb.jpg`;

  const [videoUp, thumbUp] = await Promise.all([
    supabase.storage.from(TRAINING_VIDEO_BUCKET).upload(videoPath, videoFile, { upsert: true, contentType: videoFile.type }),
    supabase.storage.from(TRAINING_VIDEO_BUCKET).upload(thumbPath, thumbnailBlob, { upsert: true, contentType: 'image/jpeg' }),
  ]);
  if (videoUp.error) throw new Error(videoUp.error.message);
  if (thumbUp.error) throw new Error(thumbUp.error.message);

  const { data, error } = await supabase
    .from('training_sessions')
    .update({ video_path: videoPath, thumbnail_path: thumbPath, duration_sec: durationSec || null })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToTrainingSession(data);
}

export async function getTrainingVideoUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(TRAINING_VIDEO_BUCKET).createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// Coach Intelligence System sidebar's real "this week" count — every
// session this coach has logged (across every linked player) since a given
// date. `training_sessions` has no coach-scoped index beyond logged_by, but
// this is a small, infrequent read (once per shell mount), not a hot path.
export async function getTrainingSessionsLoggedByCoach(coachId, sinceDate) {
  const { data, error } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('logged_by', coachId)
    .gte('session_date', sinceDate);
  if (error) throw new Error(error.message);
  return data.map(rowToTrainingSession);
}

// ---------------------------------------------------------------------------
// Multi-segment dashboard, Phase 6 — coach-side: drill library + roster
// segment-awareness. Skill groups are NOT a table — computed at read time in
// src/lib/coachAnalytics.js from real linked-player data, see phase31 SQL
// comment for why.
// ---------------------------------------------------------------------------

function rowToDrill(row) {
  return {
    id: row.id,
    createdBy: row.created_by,
    title: row.title,
    description: row.description,
    focusStroke: row.focus_stroke,
    difficulty: row.difficulty,
    videoUrl: row.video_url,
    skillKey: row.skill_key,
    defaultVolume: row.default_volume,
    defaultFrequencyPerWeek: row.default_frequency_per_week,
    defaultDurationWeeks: row.default_duration_weeks,
    createdAt: row.created_at,
  };
}

export async function getDrillLibrary() {
  const { data, error } = await supabase.from('drill_library').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToDrill);
}

export async function createDrill({ title, description, focusStroke, difficulty, videoUrl, skillKey, defaultVolume, defaultFrequencyPerWeek, defaultDurationWeeks }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('drill_library')
    .insert({
      created_by: user.id, title, description: description || null, focus_stroke: focusStroke || null,
      difficulty: difficulty || null, video_url: videoUrl || null, skill_key: skillKey || null,
      default_volume: defaultVolume || null, default_frequency_per_week: defaultFrequencyPerWeek || null,
      default_duration_weeks: defaultDurationWeeks || null,
    })
    .select().single();
  if (error) throw new Error(error.message);
  return rowToDrill(data);
}

export async function deleteDrill(drillId) {
  const { error } = await supabase.from('drill_library').delete().eq('id', drillId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Phase 32 — Coach Intelligence System: drill assignments
// A coach assigning one real drill to a real set of their players for a real
// date range — backs both "today's assigned block" (Log Session view) and
// Progress Correlation (src/lib/coachAnalytics.js's computeDrillCorrelation,
// which reads real matches before/after the range).
// ---------------------------------------------------------------------------

function rowToDrillAssignment(row) {
  return {
    id: row.id,
    coachId: row.coach_id,
    drillId: row.drill_id,
    drillTitle: row.drill?.title,
    category: row.category,
    subcategory: row.subcategory,
    skillKey: row.skill_key,
    playerIds: row.player_ids || [],
    frequencyPerWeek: row.frequency_per_week,
    durationWeeks: row.duration_weeks,
    startDate: row.start_date,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function getDrillAssignments(coachId) {
  const { data, error } = await supabase
    .from('drill_assignments')
    .select('*, drill:drill_library(title)')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToDrillAssignment);
}

export async function createDrillAssignment({ coachId, drillId, category, subcategory, skillKey, playerIds, frequencyPerWeek, durationWeeks }) {
  const { data, error } = await supabase
    .from('drill_assignments')
    .insert({
      coach_id: coachId, drill_id: drillId, category, subcategory, skill_key: skillKey,
      player_ids: playerIds, frequency_per_week: frequencyPerWeek, duration_weeks: durationWeeks,
    })
    .select('*, drill:drill_library(title)').single();
  if (error) throw new Error(error.message);
  return rowToDrillAssignment(data);
}

export async function updateDrillAssignment(assignmentId, { status }) {
  const { data, error } = await supabase
    .from('drill_assignments')
    .update({ status })
    .eq('id', assignmentId)
    .select('*, drill:drill_library(title)').single();
  if (error) throw new Error(error.message);
  return rowToDrillAssignment(data);
}

// One linked player's roster row: profile + every segment they have ranking
// history in (via aita_rankings, same source PerformanceTab/SegmentContext
// use) — lets the coach roster show segment-aware standing without a
// separate per-segment query per player.
export async function getRosterWithSegments(coachId) {
  const { data: links, error: linkErr } = await supabase
    .from('coach_player_links')
    .select('player_id, status, player:user_profiles!coach_player_links_player_id_fkey(id, display_name, aita_reg, state_abbr, ranking, club_name)')
    .eq('coach_id', coachId)
    .eq('status', 'active');
  if (linkErr) throw new Error(linkErr.message);

  const players = (links || []).map(l => l.player).filter(Boolean);
  const results = await Promise.all(players.map(async (p) => {
    if (!p.aita_reg) return { ...rowToPlayerSummary(p), segments: [] };
    const { data: rows } = await supabase
      .from('aita_rankings')
      .select('category, subcategory, ranking_date, rank, total_points')
      .eq('reg_no', p.aita_reg)
      .order('ranking_date', { ascending: true })
      .range(0, 4999);
    const history = (rows || []).map(r => ({ category: r.category, subcategory: r.subcategory, date: r.ranking_date, rank: r.rank, totalPoints: r.total_points }));
    return { ...rowToPlayerSummary(p), segments: buildCircuits(history) };
  }));
  return results;
}

function rowToPlayerSummary(p) {
  return { id: p.id, displayName: p.display_name, aitaReg: p.aita_reg, stateAbbr: p.state_abbr, ranking: p.ranking, clubName: p.club_name, role: p.role };
}

// Phase 34 — Coach roster leaderboard (CoachIntelligenceShell's Leaderboard
// tab). Unlike getRosterWithSegments (ranking-history driven), this reads
// each linked player's full matches/training_sessions/streak_freezes
// directly — no segment scoping — so streak/wins/aces/drill-minutes reflect
// everything a player has ever logged, not just their most recent segment.
// Relies on the existing "Linked coaches can view a player's matches/
// training_sessions" RLS policies (phase29/phase30) plus the new streak
// freeze one (phase34).
export async function getRosterLeaderboard(coachId) {
  const { data: links, error: linkErr } = await supabase
    .from('coach_player_links')
    .select('player_id, player:user_profiles!coach_player_links_player_id_fkey(id, display_name, aita_reg, club_name)')
    .eq('coach_id', coachId)
    .eq('status', 'active');
  if (linkErr) throw new Error(linkErr.message);

  const players = (links || []).map(l => l.player).filter(Boolean);

  return Promise.all(players.map(async (p) => {
    const [matchesRes, sessionsRes, freezesRes] = await Promise.all([
      supabase.from('matches').select('winner, points, match_date').eq('user_id', p.id),
      supabase.from('training_sessions').select('session_date, duration_minutes').eq('player_id', p.id),
      supabase.from('streak_freezes').select('freeze_date').eq('user_id', p.id),
    ]);
    const matches = matchesRes.data || [];
    const sessions = sessionsRes.data || [];
    const freezes = freezesRes.data || [];

    const wins = matches.filter(m => m.winner === 'self').length;
    const aces = matches.reduce((sum, m) => sum + computeServeStats(m.points || [], 'self').aces, 0);
    const drillMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const logDates = [...matches.map(m => m.match_date), ...sessions.map(s => s.session_date)].filter(Boolean);
    const streak = computeStreak(logDates, { freezeDates: freezes.map(f => f.freeze_date) });

    return { ...rowToPlayerSummary(p), wins, aces, drillMinutes, sessionCount: sessions.length, streak };
  }));
}

// Phase 37 — player-vs-player Compare (ComparePage.jsx's coach-only
// "Players" mode). Scoped to a coach's own roster — two players don't have
// a link to each other directly, so this reuses the coach's existing RLS
// read access to each linked player's matches (phase30) rather than
// inventing a player-to-player link table.
const COMPARE_RANGE_DAYS = { week: 7, month: 30, quarter: 90, all: null };

export async function getLinkedPlayersForCompare(coachId) {
  const { data, error } = await supabase
    .from('coach_player_links')
    .select('player:user_profiles!coach_player_links_player_id_fkey(id, display_name, aita_reg, club_name)')
    .eq('coach_id', coachId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  return (data || []).map(l => l.player).filter(Boolean).map(rowToPlayerSummary);
}

async function summarizePlayerForCompare(playerId, cutoffIso) {
  let matchQuery = supabase.from('matches').select('winner, points, match_date').eq('user_id', playerId);
  if (cutoffIso) matchQuery = matchQuery.gte('match_date', cutoffIso);
  const [matchesRes, sessionsRes] = await Promise.all([
    matchQuery,
    supabase.from('training_sessions').select('duration_minutes, session_date').eq('player_id', playerId).gte('session_date', cutoffIso || '1900-01-01'),
  ]);
  const matches = matchesRes.data || [];
  const sessions = sessionsRes.data || [];

  const wins = matches.filter(m => m.winner === 'self').length;
  const losses = matches.filter(m => m.winner === 'opp').length;
  let wfe = 0, ue = 0, aces = 0;
  for (const m of matches) {
    const s = computeStats(m.points || []).self;
    wfe += s.wfe; ue += s.ue;
    aces += computeServeStats(m.points || [], 'self').aces;
  }
  const drillMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

  return { matchCount: matches.length, wins, losses, wfe, ue, aces, drillMinutes };
}

export async function getPlayerComparison(playerAId, playerBId, range = 'month') {
  const days = COMPARE_RANGE_DAYS[range] ?? COMPARE_RANGE_DAYS.month;
  let cutoffIso = null;
  if (days != null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoffIso = cutoff.toISOString().slice(0, 10);
  }
  const [a, b] = await Promise.all([
    summarizePlayerForCompare(playerAId, cutoffIso),
    summarizePlayerForCompare(playerBId, cutoffIso),
  ]);
  return { range, a, b };
}

function rowToSavedCompare(row) {
  return { id: row.id, ownerId: row.owner_id, name: row.name, playerAId: row.player_a_id, playerBId: row.player_b_id, range: row.range, createdAt: row.created_at };
}

export async function getSavedCompares(ownerId) {
  const { data, error } = await supabase
    .from('saved_compares')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToSavedCompare);
}

export async function createSavedCompare(ownerId, { name, playerAId, playerBId, range }) {
  const { data, error } = await supabase
    .from('saved_compares')
    .insert({ owner_id: ownerId, name, player_a_id: playerAId, player_b_id: playerBId, range })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToSavedCompare(data);
}

export async function deleteSavedCompare(id) {
  const { error } = await supabase.from('saved_compares').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

