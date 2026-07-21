import { supabase } from '../lib/supabaseClient';
import { computeCascadingPlacement } from '../utils/nominationSort';
import { checkAgeEligibility } from '../utils/eligibility';
import { noShowPenaltyPoints, usesLateWithdrawalPenalty, LATE_WITHDRAWAL_PENALTY_POINTS, bracketSize, getEntryStage, ENTRY_STAGE, categoryGender } from '../utils/aitaGradeRules';

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
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/' },
  });
  if (error) throw new Error(error.message);
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
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      callback(publicUser(session.user));
    } else if (event === 'SIGNED_OUT') {
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
    sessionType: row.session_type,
    formatPreset: row.format_preset,
    formatLabel: row.format_label,
    pointTarget: row.point_target,
    surface: row.surface,
    indoorOutdoor: row.indoor_outdoor,
    oppHandedness: row.opp_handedness,
    weather: row.weather,
    notes: row.notes,
    scoreSummary: row.score_summary,
    winner: row.winner,
    pointCount: row.point_count,
    matchDurationMs: row.match_duration_ms,
    points: row.points,
    sets: row.sets,
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
    session_type: record.sessionType,
    format_preset: record.formatPreset || null,
    format_label: record.formatLabel || null,
    point_target: record.pointTarget || null,
    surface: record.surface || null,
    indoor_outdoor: record.indoorOutdoor || null,
    opp_handedness: record.oppHandedness || null,
    weather: record.weather || null,
    notes: record.notes || null,
    score_summary: record.scoreSummary || null,
    winner: record.winner || null,
    point_count: record.pointCount || 0,
    match_duration_ms: record.matchDurationMs || null,
    points: record.points || [],
    sets: record.sets || [],
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
    replacingName: row.replacing_name,
    isWithdrawn: row.is_withdrawn || false,
    // Phase 14 fields
    entrySource: row.entry_source || 'organiser',
    entryStatus: row.entry_status || 'placed',
    enteredBy: row.entered_by || null,
    withdrawalDate: row.withdrawal_date || null,
    withdrawalType: row.withdrawal_type || null,
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
    replacing_name: updates.replacingName || null,
  };
  const { data, error } = await supabase
    .from('draw_entries').update(row).eq('id', entryId).select().single();
  if (error) throw new Error(error.message);
  return rowToEntry(data);
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

export async function bulkAddDrawEntries(eventId, drawType, entries) {
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
    // Phase 14 — mark as organiser-entered
    entry_source: 'organiser',
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

// Get all draw entries where the current user has entered themselves (all tournaments)
export async function getMyEntries() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('draw_entries')
    .select('*, event:events(*, tournament_week:tournament_weeks(id, name, start_date, end_date, city, state_abbr, grade))')
    .eq('entered_by', user.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(row => ({
    ...rowToEntry(row),
    event: row.event ? { ...rowToEvent(row.event), week: row.event.tournament_week ? rowToWeek(row.event.tournament_week) : null } : null,
  }));
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
  };
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToProfile(data);
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

// Random-draw priority: shuffles newly-eligible qualifying losers (not
// already in the lucky_losers pool for this event) and inserts them with
// priority continuing after the current max. Never touches already-drawn rows.
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

  // Fisher–Yates shuffle
  for (let i = newLosers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newLosers[i], newLosers[j]] = [newLosers[j], newLosers[i]];
  }

  let nextPriority = (existing || []).reduce((max, r) => Math.max(max, r.priority), 0) + 1;
  const rows = newLosers.map(l => ({
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
