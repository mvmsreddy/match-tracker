/**
 * Standings computation for round robin, pools, and Swiss formats.
 */

function emptyRow(id, name) {
  return {
    id, name, wins: 0, losses: 0, draws: 0, tiesWon: 0, tiesLost: 0,
    setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 0,
    played: 0, rank: null, headToHead: {},
  };
}

function parseSetsFromScore(score) {
  if (!score || typeof score !== 'string') return { self: 0, opp: 0, gamesSelf: 0, gamesOpp: 0 };
  const parts = score.split(',').map((s) => s.trim());
  let setsSelf = 0, setsOpp = 0, gamesSelf = 0, gamesOpp = 0;
  for (const p of parts) {
    const m = p.match(/(\d+)[\s\-–]+(\d+)/);
    if (!m) continue;
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    gamesSelf += a; gamesOpp += b;
    if (a > b) setsSelf++;
    else if (b > a) setsOpp++;
  }
  return { self: setsSelf, opp: setsOpp, gamesSelf, gamesOpp: gamesOpp };
}

/** @param {Array<{id,name}>} participants */
/** @param {Array<{team1Id,team2Id,entry1Id,entry2Id,winnerTeamId,winnerEntryId,score,tieScore,outcomeType,status}>} matches */
export function computeStandings(participants, matches, opts = {}) {
  const { pointsWin = 1, pointsDraw = 0, useTieScore = false } = opts;
  const byId = new Map();
  participants.forEach((p) => byId.set(p.id, emptyRow(p.id, p.name)));

  const completed = matches.filter((m) => m.status === 'complete' || m.winnerTeamId || m.winnerEntryId);

  for (const m of completed) {
    const id1 = m.team1Id || m.entry1Id;
    const id2 = m.team2Id || m.entry2Id;
    if (!id1 || !id2) continue;
    const r1 = byId.get(id1);
    const r2 = byId.get(id2);
    if (!r1 || !r2) continue;

    r1.played++; r2.played++;

    let winnerId = m.winnerTeamId || m.winnerEntryId;
    if (!winnerId && useTieScore && m.tieScore) {
      const ts = m.tieScore.match(/(\d+)\s*[-–]\s*(\d+)/);
      if (ts) {
        const a = parseInt(ts[1], 10), b = parseInt(ts[2], 10);
        if (a > b) winnerId = id1;
        else if (b > a) winnerId = id2;
      }
    }
    if (!winnerId && m.outcomeType === 'walkover') {
      winnerId = m.winnerTeamId || m.winnerEntryId;
    }

    const sets = parseSetsFromScore(m.score);
    r1.setsWon += sets.self; r1.setsLost += sets.opp;
    r2.setsWon += sets.opp; r2.setsLost += sets.self;
    r1.gamesWon += sets.gamesSelf; r1.gamesLost += sets.gamesOpp;
    r2.gamesWon += sets.gamesOpp; r2.gamesLost += sets.gamesSelf;

    if (winnerId === id1) {
      r1.wins++; r2.losses++;
      r1.points += pointsWin;
      r1.tiesWon++; r2.tiesLost++;
      r1.headToHead[id2] = (r1.headToHead[id2] || 0) + 1;
    } else if (winnerId === id2) {
      r2.wins++; r1.losses++;
      r2.points += pointsWin;
      r2.tiesWon++; r1.tiesLost++;
      r2.headToHead[id1] = (r2.headToHead[id1] || 0) + 1;
    } else if (m.outcomeType === 'draw') {
      r1.draws++; r2.draws++;
      r1.points += pointsDraw; r2.points += pointsDraw;
    }
  }

  const rows = [...byId.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const h2h = (b.headToHead[a.id] || 0) - (a.headToHead[b.id] || 0);
    if (h2h !== 0) return h2h;
    const setDiffA = a.setsWon - a.setsLost;
    const setDiffB = b.setsWon - b.setsLost;
    if (setDiffB !== setDiffA) return setDiffB - setDiffA;
    return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
  });

  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/** Top N from standings for playoff seeding */
export function topNFromStandings(standings, n) {
  return standings.filter((r) => r.rank <= n).sort((a, b) => a.rank - b.rank);
}

/** Page playoff pairings from top 4: 1v2 in QF1, 3v4 in QF2 style simplified to semis */
export function pagePlayoffPairings(top4) {
  if (top4.length < 4) return [];
  const [first, second, third, fourth] = top4;
  return [
    { label: 'Page SF 1 (1 vs 4)', team1: first, team2: fourth },
    { label: 'Page SF 2 (2 vs 3)', team1: second, team2: third },
  ];
}

export function playoffPairingsFromMode(standings, mode) {
  const top2 = topNFromStandings(standings, 2);
  const top4 = topNFromStandings(standings, 4);

  if (mode === 'top2_final_only') {
    return [{ label: 'Final', team1: top4[0], team2: top4[1], round: 1, slot: 1, isFinal: true }];
  }
  if (mode === 'final_and_third') {
    return [
      { label: '3rd Place', team1: top4[2], team2: top4[3], round: 1, slot: 1, isThird: true },
      { label: 'Final', team1: top4[0], team2: top4[1], round: 1, slot: 2, isFinal: true },
    ];
  }
  if (mode === 'top4_semis') {
    return [
      { label: 'Semi 1', team1: top4[0], team2: top4[3], round: 1, slot: 1 },
      { label: 'Semi 2', team1: top4[1], team2: top4[2], round: 1, slot: 2 },
      { label: '3rd Place', team1: null, team2: null, round: 2, slot: 1, isThird: true, tbd: true },
      { label: 'Final', team1: null, team2: null, round: 2, slot: 2, isFinal: true, tbd: true },
    ];
  }
  return [];
}
