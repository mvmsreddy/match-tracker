import { supabase } from '../lib/supabaseClient';

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
    status: 'setup',
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

export async function bulkAddDrawEntries(eventId, drawType, entries) {
  if (entries.length === 0) return [];
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
    is_alternate: false,
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

export async function initializeEventMatches(eventId, drawType, entries) {
  await supabase
    .from('event_matches')
    .delete()
    .eq('event_id', eventId)
    .eq('draw_type', drawType);

  const drawSize = entries.length;
  const totalRounds = Math.ceil(Math.log2(drawSize));
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

export async function searchPlayers(query) {
  // Search by display_name or aita_reg — returns players only
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, display_name, aita_reg, state_abbr, ranking, club_name')
    .eq('role', 'player')
    .or(`display_name.ilike.%${query}%,aita_reg.ilike.%${query}%`)
    .limit(10);
  if (error) throw new Error(error.message);
  return data.map(rowToProfile);
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
