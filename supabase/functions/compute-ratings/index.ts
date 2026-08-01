// Computes the "Tracker Rating" (Glicko-2) for singles players from
// COMPLETED official tournament bracket matches, one tournament_week at a
// time (Glicko-2 is a batch/rating-period algorithm — see
// supabase/phase44_player_ratings.sql for the full design rationale).
//
// The Glicko-2 math here is a direct TypeScript port of src/lib/glicko2.js
// (validated there against Glickman's published worked example) — kept as
// its own copy rather than imported cross-directory, matching this repo's
// existing convention of Edge Functions carrying self-contained ports of
// shared algorithms rather than reaching outside supabase/functions/ (see
// sync-aita-rankings's header comment on why its PDF-parsing regex is
// ported, not imported, from scripts/aita-rankings/lib.mjs). Keep both
// copies in sync if the algorithm ever changes.
//
// Deploy: supabase functions deploy compute-ratings
// No new secret needed — reuses the SYNC_SECRET already configured for
// sync-aita-calendar / sync-aita-rankings.
// Then run supabase/phase44_player_ratings.sql (tables + daily cron).
//
// Two allowed callers (same pattern as sync-aita-rankings):
//   - pg_cron, via header x-sync-secret: <SYNC_SECRET>.
//   - a "Recompute ratings" button, via a normal user JWT — caller's
//     user_profiles.role must be 'organizer'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET = Deno.env.get('SYNC_SECRET');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret',
};

// Process at most this many pending weeks per invocation, oldest end_date
// first, so a large backlog spreads across a few cron cycles instead of
// risking a timeout in one run — same reasoning as sync-aita-rankings's
// MAX_PDF_PARSES_PER_RUN.
const MAX_WEEKS_PER_RUN = 20;

// Walkovers mean no games were actually contested — excluding them keeps a
// no-show from inflating/deflating a rating. Score entries and retirements
// both involved real play, so both count.
const RATEABLE_OUTCOMES = new Set(['score', 'retirement', 'default', null]);

// ---------------------------------------------------------------------------
// Glicko-2 — see src/lib/glicko2.js for the annotated original + golden test.
// ---------------------------------------------------------------------------

const SCALE = 173.7178;
const DEFAULT_RATING = 1500;
const DEFAULT_RD = 350;
const DEFAULT_VOLATILITY = 0.06;
const TAU = 0.5;
const EPSILON = 0.000001;

interface PlayerState { rating: number; rd: number; volatility: number }

function defaultPlayerState(): PlayerState {
  return { rating: DEFAULT_RATING, rd: DEFAULT_RD, volatility: DEFAULT_VOLATILITY };
}

function toG2({ rating, rd }: { rating: number; rd: number }) {
  return { mu: (rating - DEFAULT_RATING) / SCALE, phi: rd / SCALE };
}

function fromG2({ mu, phi }: { mu: number; phi: number }) {
  return { rating: mu * SCALE + DEFAULT_RATING, rd: phi * SCALE };
}

function g(phi: number) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, muJ: number, phiJ: number) {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

function computeNewVolatility({ delta, phi, v, sigma }: { delta: number; phi: number; v: number; sigma: number }) {
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) * (phi * phi + v + ex);
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  let iterations = 0;
  while (Math.abs(B - A) > EPSILON && iterations < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) { A = B; fA = fB; } else { fA /= 2; }
    B = C;
    fB = fC;
    iterations++;
  }
  return Math.exp(A / 2);
}

function updatePlayerRating(player: PlayerState, results: { opponent: PlayerState; score: number }[]): PlayerState {
  const { mu, phi } = toG2(player);
  const sigma = player.volatility ?? DEFAULT_VOLATILITY;

  if (!results || results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { ...fromG2({ mu, phi: phiStar }), volatility: sigma };
  }

  const opponents = results.map((r) => toG2(r.opponent));
  const gs = opponents.map((o) => g(o.phi));
  const es = opponents.map((o) => expectedScore(mu, o.mu, o.phi));

  const vInv = results.reduce((sum, r, i) => sum + gs[i] * gs[i] * es[i] * (1 - es[i]), 0);
  const v = 1 / vInv;

  const deltaSum = results.reduce((sum, r, i) => sum + gs[i] * (r.score - es[i]), 0);
  const delta = v * deltaSum;

  const sigmaPrime = computeNewVolatility({ delta, phi, v, sigma });
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return { ...fromG2({ mu: muPrime, phi: phiPrime }), volatility: sigmaPrime };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // --- Auth: cron secret OR organizer JWT (same as sync-aita-rankings) ---
  let triggeredBy = 'cron';
  const cronHeader = req.headers.get('x-sync-secret');
  if (SYNC_SECRET && cronHeader === SYNC_SECRET) {
    triggeredBy = 'cron';
  } else {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const { data: profile } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profile?.role !== 'organizer') {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
    }
    triggeredBy = `manual:${userData.user.id}`;
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: pendingWeeks, error: weeksErr } = await admin
    .from('tournament_weeks')
    .select('id, end_date')
    .lt('end_date', today)
    .is('rating_computed_at', null)
    .order('end_date', { ascending: true })
    .limit(MAX_WEEKS_PER_RUN);

  if (weeksErr) {
    return new Response(JSON.stringify({ error: weeksErr.message }), { status: 500, headers: corsHeaders });
  }

  const summary: Array<Record<string, unknown>> = [];

  for (const week of pendingWeeks || []) {
    const startedAt = new Date().toISOString();
    let subjectsUpdated = 0;
    let matchesProcessed = 0;
    let comboError: string | null = null;

    try {
      const { data: events, error: eventsErr } = await admin
        .from('events')
        .select('id')
        .eq('tournament_week_id', week.id)
        .eq('is_doubles', false);
      if (eventsErr) throw new Error(eventsErr.message);
      const eventIds = (events || []).map((e) => e.id);

      if (eventIds.length === 0) {
        await admin.from('tournament_weeks').update({ rating_computed_at: new Date().toISOString() }).eq('id', week.id);
        summary.push({ weekId: week.id, subjectsUpdated: 0, matchesProcessed: 0, note: 'no singles events' });
        continue;
      }

      const { data: matches, error: matchesErr } = await admin
        .from('event_matches')
        .select('id, entry1_id, entry2_id, winner_entry_id, outcome_type, status')
        .in('event_id', eventIds)
        .eq('status', 'complete')
        .not('winner_entry_id', 'is', null);
      if (matchesErr) throw new Error(matchesErr.message);

      const rateableMatches = (matches || []).filter((m) => RATEABLE_OUTCOMES.has(m.outcome_type));

      const entryIds = new Set<string>();
      for (const m of rateableMatches) {
        if (m.entry1_id) entryIds.add(m.entry1_id);
        if (m.entry2_id) entryIds.add(m.entry2_id);
      }

      let entryById = new Map<string, { player_id: string | null; aita_reg: string | null }>();
      if (entryIds.size > 0) {
        const { data: entries, error: entriesErr } = await admin
          .from('draw_entries')
          .select('id, player_id, aita_reg')
          .in('id', Array.from(entryIds));
        if (entriesErr) throw new Error(entriesErr.message);
        entryById = new Map((entries || []).map((e) => [e.id, { player_id: e.player_id, aita_reg: e.aita_reg }]));
      }

      const subjectKeyFor = (entryId: string | null): { key: string; type: 'platform' | 'aita_reg'; playerId: string | null } | null => {
        if (!entryId) return null;
        const entry = entryById.get(entryId);
        if (!entry) return null;
        if (entry.player_id) return { key: entry.player_id, type: 'platform', playerId: entry.player_id };
        if (entry.aita_reg) return { key: entry.aita_reg, type: 'aita_reg', playerId: null };
        return null; // no stable identity — can't rate this entrant
      };

      type MatchResult = { winnerKey: string; loserKey: string };
      const matchResults: MatchResult[] = [];
      const subjectMeta = new Map<string, { type: 'platform' | 'aita_reg'; playerId: string | null }>();

      for (const m of rateableMatches) {
        const otherId = m.winner_entry_id === m.entry1_id ? m.entry2_id : m.entry1_id;
        const winner = subjectKeyFor(m.winner_entry_id);
        const loser = subjectKeyFor(otherId);
        if (!winner || !loser) continue; // one side has no stable identity — skip, can't rate
        matchResults.push({ winnerKey: winner.key, loserKey: loser.key });
        subjectMeta.set(winner.key, { type: winner.type, playerId: winner.playerId });
        subjectMeta.set(loser.key, { type: loser.type, playerId: loser.playerId });
        matchesProcessed++;
      }

      if (subjectMeta.size > 0) {
        const subjectKeys = Array.from(subjectMeta.keys());
        const { data: existingRatings, error: ratingsErr } = await admin
          .from('player_ratings')
          .select('subject_key, rating, rd, volatility, matches_count')
          .eq('format', 'singles')
          .in('subject_key', subjectKeys);
        if (ratingsErr) throw new Error(ratingsErr.message);

        const priorByKey = new Map((existingRatings || []).map((r) => [r.subject_key, r]));
        const playersByKey = new Map<string, PlayerState>();
        for (const key of subjectKeys) {
          const prior = priorByKey.get(key);
          playersByKey.set(key, prior
            ? { rating: Number(prior.rating), rd: Number(prior.rd), volatility: Number(prior.volatility) }
            : defaultPlayerState());
        }

        // Batch update — every subject uses every opponent's PRE-period
        // rating (playersByKey is never mutated mid-loop).
        const resultsByKey = new Map<string, { opponent: PlayerState; score: number }[]>();
        const ensure = (key: string) => {
          if (!resultsByKey.has(key)) resultsByKey.set(key, []);
          return resultsByKey.get(key)!;
        };
        for (const { winnerKey, loserKey } of matchResults) {
          ensure(winnerKey).push({ opponent: playersByKey.get(loserKey)!, score: 1 });
          ensure(loserKey).push({ opponent: playersByKey.get(winnerKey)!, score: 0 });
        }

        const matchesThisPeriod = new Map<string, number>();
        for (const key of subjectKeys) matchesThisPeriod.set(key, (resultsByKey.get(key) || []).length);

        // Collected into two bulk statements (rather than one upsert/insert
        // pair per subject) so a mid-loop failure can't leave some subjects
        // updated and others not for the same week — each bulk statement is
        // atomic. There's still a narrow window between the two bulk calls
        // (and between them and the tournament_weeks update below) where a
        // crash could leave player_ratings written but rating_history or
        // the "done" marker not — acceptable for v1: the log below makes
        // that visible, and a reprocessed week would at worst double-count
        // matches_count for that one week, not silently corrupt data.
        const ratingRows: Record<string, unknown>[] = [];
        const historyRows: Record<string, unknown>[] = [];
        const nowIso = new Date().toISOString();

        for (const [key, results] of resultsByKey) {
          const updated = updatePlayerRating(playersByKey.get(key)!, results);
          const prior = priorByKey.get(key);
          const meta = subjectMeta.get(key)!;
          const newMatchesCount = (prior ? Number(prior.matches_count) : 0) + (matchesThisPeriod.get(key) || 0);

          ratingRows.push({
            subject_key: key,
            subject_type: meta.type,
            player_id: meta.playerId,
            format: 'singles',
            rating: updated.rating,
            rd: updated.rd,
            volatility: updated.volatility,
            matches_count: newMatchesCount,
            last_updated: nowIso,
          });
          historyRows.push({
            subject_key: key,
            format: 'singles',
            tournament_week_id: week.id,
            rating: updated.rating,
            rd: updated.rd,
            volatility: updated.volatility,
            matches_count: newMatchesCount,
          });
        }

        if (ratingRows.length > 0) {
          const { error: upsertErr } = await admin
            .from('player_ratings')
            .upsert(ratingRows, { onConflict: 'subject_key,format' });
          if (upsertErr) throw new Error(upsertErr.message);

          const { error: historyErr } = await admin.from('rating_history').insert(historyRows);
          if (historyErr) throw new Error(historyErr.message);

          subjectsUpdated = ratingRows.length;
        }
      }

      await admin.from('tournament_weeks').update({ rating_computed_at: new Date().toISOString() }).eq('id', week.id);
    } catch (err) {
      comboError = String(err);
    }

    await admin.from('rating_compute_log').insert({
      tournament_week_id: week.id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      subjects_updated: subjectsUpdated,
      matches_processed: matchesProcessed,
      error: comboError,
      triggered_by: triggeredBy,
    });

    summary.push({ weekId: week.id, subjectsUpdated, matchesProcessed, error: comboError });
  }

  return new Response(JSON.stringify({ summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
