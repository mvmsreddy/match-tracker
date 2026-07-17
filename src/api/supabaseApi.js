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
// Tournaments
// ---------------------------------------------------------------------------

function rowToTournament(row) {
  return {
    id: row.id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    name: row.name,
    subtitle: row.subtitle,
    category: row.category,
    grade: row.grade,
    location: row.location,
    city: row.city,
    stateAbbr: row.state_abbr,
    surface: row.surface,
    startDate: row.start_date,
    endDate: row.end_date,
    referee: row.referee,
    tournamentCode: row.tournament_code,
    drawTypes: row.draw_types || ['qualifying', 'main'],
  };
}

export async function listTournaments() {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .order('start_date', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(rowToTournament);
}

export async function getTournament(id) {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error('Tournament not found');
  return rowToTournament(data);
}

export async function createTournament(userId, tournament) {
  const row = {
    created_by: userId,
    name: tournament.name,
    subtitle: tournament.subtitle || null,
    category: tournament.category,
    grade: tournament.grade || null,
    location: tournament.location || null,
    city: tournament.city || null,
    state_abbr: tournament.stateAbbr || null,
    surface: tournament.surface || null,
    start_date: tournament.startDate || null,
    end_date: tournament.endDate || null,
    referee: tournament.referee || null,
    tournament_code: tournament.tournamentCode || null,
    draw_types: tournament.drawTypes || ['qualifying', 'main'],
  };
  const { data, error } = await supabase.from('tournaments').insert(row).select().single();
  if (error) throw new Error(error.message);
  return rowToTournament(data);
}

export async function deleteTournament(userId, id) {
  const { error } = await supabase
    .from('tournaments')
    .delete()
    .eq('id', id)
    .eq('created_by', userId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Draw Entries
// ---------------------------------------------------------------------------

function rowToEntry(row) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    drawType: row.draw_type,
    position: row.position,
    aitaReg: row.aita_reg,
    statusCode: row.status_code,
    rank: row.rank,
    seed: row.seed,
    familyName: row.family_name,
    firstName: row.first_name,
    playerState: row.player_state,
    isAlternate: row.is_alternate,
    replacingName: row.replacing_name,
  };
}

export async function getDrawEntries(tournamentId, drawType) {
  const { data, error } = await supabase
    .from('draw_entries')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('draw_type', drawType)
    .order('position', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(rowToEntry);
}

export async function saveDrawEntries(tournamentId, drawType, entries) {
  // Delete existing entries for this draw type, then re-insert
  await supabase
    .from('draw_entries')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('draw_type', drawType);

  if (entries.length === 0) return [];

  const rows = entries.map(e => ({
    tournament_id: tournamentId,
    draw_type: drawType,
    position: e.position,
    aita_reg: e.aitaReg || null,
    status_code: e.statusCode || null,
    rank: e.rank ? Number(e.rank) : null,
    seed: e.seed ? Number(e.seed) : null,
    family_name: e.familyName,
    first_name: e.firstName || null,
    player_state: e.playerState || null,
    is_alternate: e.isAlternate || false,
    replacing_name: e.replacingName || null,
  }));

  const { data, error } = await supabase.from('draw_entries').insert(rows).select();
  if (error) throw new Error(error.message);
  return data.map(rowToEntry);
}

// ---------------------------------------------------------------------------
// Tournament Matches
// ---------------------------------------------------------------------------

function rowToTournamentMatch(row) {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    drawType: row.draw_type,
    round: row.round,
    matchSlot: row.match_slot,
    entry1Id: row.entry1_id,
    entry2Id: row.entry2_id,
    score: row.score,
    winnerEntryId: row.winner_entry_id,
    umpire: row.umpire,
    status: row.status,
  };
}

export async function getTournamentMatches(tournamentId, drawType) {
  const { data, error } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('draw_type', drawType)
    .order('round', { ascending: true })
    .order('match_slot', { ascending: true });
  if (error) throw new Error(error.message);
  return data.map(rowToTournamentMatch);
}

export async function initializeMatches(tournamentId, drawType, entries) {
  // Delete existing matches first
  await supabase
    .from('tournament_matches')
    .delete()
    .eq('tournament_id', tournamentId)
    .eq('draw_type', drawType);

  const drawSize = entries.length;
  const totalRounds = Math.ceil(Math.log2(drawSize));
  const allMatches = [];

  // Round 1: pair up entries by position (1v2, 3v4, …)
  for (let i = 0; i < entries.length; i += 2) {
    allMatches.push({
      tournament_id: tournamentId,
      draw_type: drawType,
      round: 1,
      match_slot: Math.floor(i / 2) + 1,
      entry1_id: entries[i]?.id || null,
      entry2_id: entries[i + 1]?.id || null,
      status: 'pending',
    });
  }

  // Future rounds: empty slots
  for (let round = 2; round <= totalRounds; round++) {
    const matchCount = drawSize / Math.pow(2, round);
    for (let slot = 1; slot <= matchCount; slot++) {
      allMatches.push({
        tournament_id: tournamentId,
        draw_type: drawType,
        round,
        match_slot: slot,
        status: 'pending',
      });
    }
  }

  const { data, error } = await supabase
    .from('tournament_matches')
    .insert(allMatches)
    .select();
  if (error) throw new Error(error.message);
  return data.map(rowToTournamentMatch);
}

export async function updateMatchScore(matchId, { score, winnerEntryId, status, umpire }) {
  const { data, error } = await supabase
    .from('tournament_matches')
    .update({ score, winner_entry_id: winnerEntryId, status, umpire })
    .eq('id', matchId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToTournamentMatch(data);
}

// ---------------------------------------------------------------------------
// User Profiles
// ---------------------------------------------------------------------------

function rowToProfile(row) {
  return {
    id: row.id,
    role: row.role || 'player',
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

export async function advanceWinner(tournamentId, drawType, currentRound, currentSlot, winnerEntryId) {
  const nextRound = currentRound + 1;
  const nextSlot = Math.ceil(currentSlot / 2);
  const isOddSlot = currentSlot % 2 !== 0;
  const updateField = isOddSlot ? 'entry1_id' : 'entry2_id';

  const { error } = await supabase
    .from('tournament_matches')
    .update({ [updateField]: winnerEntryId })
    .eq('tournament_id', tournamentId)
    .eq('draw_type', drawType)
    .eq('round', nextRound)
    .eq('match_slot', nextSlot);

  if (error) throw new Error(error.message);
  return { ok: true };
}
