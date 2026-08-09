/**
 * Multi-format tournament structure generator.
 * Pure functions — returns stages + match slots for persistence.
 */
import { playoffPairingsFromMode, pagePlayoffPairings } from './standings';

/** Circle method (Berger) round-robin pairings for n participants */
export function roundRobinPairings(participantIds, doubleRound = false) {
  const ids = [...participantIds];
  if (ids.length % 2 === 1) ids.push(null); // bye slot
  const n = ids.length;
  const rounds = n - 1;
  const half = n / 2;
  const fixtures = [];
  let arr = [...ids];

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a != null && b != null) {
        fixtures.push({ round: r + 1, slot: fixtures.filter((f) => f.round === r + 1).length + 1, id1: a, id2: b });
      }
    }
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [fixed, ...rest];
  }

  if (!doubleRound) return fixtures;

  const offset = rounds;
  const rev = fixtures.map((f, i) => ({
    round: f.round + offset,
    slot: f.slot,
    id1: f.id2,
    id2: f.id1,
    leg: 2,
  }));
  return [...fixtures.map((f) => ({ ...f, leg: 1 })), ...rev];
}

export function splitIntoPools(participantIds, numPools) {
  const pools = Array.from({ length: numPools }, () => []);
  participantIds.forEach((id, i) => pools[i % numPools].push(id));
  return pools.map((ids, i) => ({ groupId: `pool_${String.fromCharCode(65 + i)}`, label: `Pool ${String.fromCharCode(65 + i)}`, ids }));
}

function mkStage(key, type, order, label, config = {}) {
  return { stageKey: key, stageType: type, stageOrder: order, label, config, status: 'pending' };
}

function mkTeamMatch(stageKey, drawType, round, slot, team1Id, team2Id, extra = {}) {
  return {
    stageKey, drawType, round, matchSlot: slot,
    team1Id, team2Id, entry1Id: null, entry2Id: null,
    status: 'pending', ...extra,
  };
}

function mkEntryMatch(stageKey, drawType, round, slot, entry1Id, entry2Id, extra = {}) {
  return {
    stageKey, drawType, round, matchSlot: slot,
    team1Id: null, team2Id: null, entry1Id, entry2Id,
    status: 'pending', ...extra,
  };
}

/** @param {'team'|'entry'} participantType */
export function generateFormatStructure(formatId, config, participants, participantType = 'team') {
  const ids = participants.map((p) => p.id);
  const names = Object.fromEntries(participants.map((p) => [p.id, p.name]));
  const stages = [];
  const matches = [];
  const getId = (i) => ids[i];
  const idField = participantType === 'team' ? 'team' : 'entry';

  function addFixtures(stageKey, drawType, fixtures, groupId = null, extra = {}) {
    fixtures.forEach((f) => {
      const base = {
        stageKey, drawType, round: f.round, matchSlot: f.slot, groupId,
        label: extra.labelPrefix ? `${extra.labelPrefix} R${f.round}` : null,
        courts: extra.courts || [],
        ...extra,
      };
      if (participantType === 'team') {
        matches.push(mkTeamMatch(stageKey, drawType, f.round, f.slot, f.id1, f.id2, base));
      } else {
        matches.push(mkEntryMatch(stageKey, drawType, f.round, f.slot, f.id1, f.id2, base));
      }
    });
  }

  switch (formatId) {
    case 'round_robin':
    case 'season_league': {
      stages.push(mkStage('league', 'round_robin', 1, formatId === 'season_league' ? 'Season League' : 'Round Robin', config));
      addFixtures('league', 'round_robin', roundRobinPairings(ids), null, {
        labelPrefix: 'RR',
      });
      break;
    }

    case 'double_round_robin': {
      stages.push(mkStage('league', 'round_robin', 1, 'Double Round Robin', config));
      addFixtures('league', 'round_robin', roundRobinPairings(ids, true));
      break;
    }

    case 'rr_playoffs':
    case 'team_tie_rr_playoffs': {
      const rubbers = config.rubbersPerTie || 2;
      stages.push(mkStage('league', 'round_robin', 1, 'League Stage', config));
      const rr = roundRobinPairings(ids);
      rr.forEach((f) => {
        const t1 = names[f.id1] || 'TBD';
        const t2 = names[f.id2] || 'TBD';
        matches.push(mkTeamMatch('league', 'round_robin', f.round, f.slot, f.id1, f.id2, {
          label: `${t1} vs ${t2}`,
          courts: Array.from({ length: rubbers }, (_, i) => i + 1),
          groupId: null,
        }));
      });
      stages.push(mkStage('playoffs', 'knockout', 2, 'Playoffs', { playoffMode: config.playoffMode || 'final_and_third' }));
      break;
    }

    case 'team_tie_rr': {
      const rubbers = config.rubbersPerTie || 2;
      stages.push(mkStage('league', 'round_robin', 1, 'Team Tie League', config));
      roundRobinPairings(ids).forEach((f) => {
        matches.push(mkTeamMatch('league', 'round_robin', f.round, f.slot, f.id1, f.id2, {
          courts: Array.from({ length: rubbers }, (_, i) => i + 1),
        }));
      });
      break;
    }

    case 'rr_page_playoff': {
      stages.push(mkStage('league', 'round_robin', 1, 'Round Robin', config));
      addFixtures('league', 'round_robin', roundRobinPairings(ids));
      stages.push(mkStage('playoffs', 'page_playoff', 2, 'Page Playoff', {}));
      break;
    }

    case 'pool_ko':
    case 'pool_rr': {
      const numPools = config.numPools || 2;
      const pools = splitIntoPools(ids, numPools);
      pools.forEach((pool, pi) => {
        stages.push(mkStage(pool.groupId, 'round_robin', pi + 1, pool.label, { poolSize: pool.ids.length }));
        addFixtures(pool.groupId, pool.groupId, roundRobinPairings(pool.ids), pool.groupId);
      });
      if (formatId === 'pool_ko') {
        const advance = config.advancePerPool || 2;
        const koSize = numPools * advance;
        stages.push(mkStage('playoffs', 'knockout', numPools + 1, `Knockout (${koSize})`, { advancePerPool: advance }));
        const slots = koSize / 2;
        for (let i = 0; i < slots; i++) {
          matches.push(mkTeamMatch('playoffs', 'main', 1, i + 1, null, null, {
            label: `KO R1 M${i + 1}`, tbd: true,
          }));
        }
      }
      break;
    }

    case 'swiss': {
      const rounds = config.swissRounds || Math.ceil(Math.log2(ids.length));
      stages.push(mkStage('swiss', 'swiss', 1, `Swiss (${rounds} rounds)`, { swissRounds: rounds }));
      for (let r = 1; r <= rounds; r++) {
        const shuffled = [...ids].sort(() => Math.random() - 0.5);
        for (let i = 0; i + 1 < shuffled.length; i += 2) {
          const slot = i / 2 + 1;
          if (participantType === 'team') {
            matches.push(mkTeamMatch('swiss', 'swiss', r, slot, shuffled[i], shuffled[i + 1], { label: `Swiss R${r} M${slot}` }));
          } else {
            matches.push(mkEntryMatch('swiss', 'swiss', r, slot, shuffled[i], shuffled[i + 1], { label: `Swiss R${r} M${slot}` }));
          }
        }
      }
      break;
    }

    case 'double_elimination': {
      const n = ids.length;
      const pow2 = 2 ** Math.ceil(Math.log2(n));
      stages.push(mkStage('winners', 'knockout', 1, 'Winners Bracket', {}));
      stages.push(mkStage('losers', 'knockout', 2, 'Losers Bracket', {}));
      const wr1 = pow2 / 2;
      for (let i = 0; i < wr1; i++) {
        const e1 = getId(i * 2) || null;
        const e2 = getId(i * 2 + 1) || null;
        if (participantType === 'team') {
          matches.push(mkTeamMatch('winners', 'main', 1, i + 1, e1, e2, { bracket: 'winners' }));
        } else {
          matches.push(mkEntryMatch('winners', 'main', 1, i + 1, e1, e2, { bracket: 'winners' }));
        }
      }
      for (let i = 0; i < wr1; i++) {
        matches.push(mkTeamMatch('losers', 'losers', 1, i + 1, null, null, { tbd: true, bracket: 'losers' }));
      }
      stages.push(mkStage('grand_final', 'knockout', 3, 'Grand Final', {}));
      matches.push(mkTeamMatch('grand_final', 'main', 1, 1, null, null, { tbd: true, isFinal: true }));
      break;
    }

    case 'consolation': {
      stages.push(mkStage('main', 'knockout', 1, 'Main Draw', {}));
      stages.push(mkStage('consolation', 'knockout', 2, 'Consolation Draw', {}));
      const size = config.drawSize || ids.length;
      const pow2 = 2 ** Math.ceil(Math.log2(size));
      for (let i = 0; i < pow2 / 2; i++) {
        matches.push(mkEntryMatch('main', 'main', 1, i + 1, getId(i * 2), getId(i * 2 + 1)));
        matches.push(mkEntryMatch('consolation', 'consolation', 1, i + 1, null, null, { tbd: true }));
      }
      break;
    }

    case 'compass': {
      const size = config.drawSize || 16;
      stages.push(mkStage('r1', 'knockout', 1, 'Round 1', {}));
      ['east', 'west', 'north', 'south'].forEach((dir, di) => {
        stages.push(mkStage(`compass_${dir}`, 'knockout', di + 2, `Compass ${dir.toUpperCase()}`, { direction: dir }));
      });
      for (let i = 0; i < size / 2; i++) {
        matches.push(mkEntryMatch('r1', 'main', 1, i + 1, getId(i * 2), getId(i * 2 + 1), { compass: true }));
      }
      break;
    }

    case 'king_of_court': {
      const courts = config.numCourts || 4;
      const rotRounds = config.rotationRounds || 10;
      stages.push(mkStage('kotc', 'rotation', 1, 'King of the Court', { numCourts: courts, rotationRounds: rotRounds }));
      for (let r = 1; r <= rotRounds; r++) {
        for (let c = 1; c <= courts; c++) {
          matches.push(mkTeamMatch('kotc', 'rotation', r, c, null, null, {
            label: `Round ${r} Court ${c}`, courtNumber: c, tbd: true,
          }));
        }
      }
      break;
    }

    default:
      break;
  }

  return { stages, matches, participantType };
}

/** Generate playoff matches from completed league standings */
export function generatePlayoffMatches(formatId, config, standings, participantType = 'team') {
  const mode = config.playoffMode || 'final_and_third';
  let pairings = [];

  if (formatId === 'rr_page_playoff') {
    pairings = pagePlayoffPairings(standings.slice(0, 4)).map((p, i) => ({
      ...p, round: 1, slot: i + 1,
      team1Id: p.team1?.id, team2Id: p.team2?.id,
    }));
  } else {
    pairings = playoffPairingsFromMode(standings, mode).map((p) => ({
      ...p,
      team1Id: p.team1?.id ?? null,
      team2Id: p.team2?.id ?? null,
      matchSlot: p.slot,
    }));
  }

  return pairings.map((p) => mkTeamMatch('playoffs', 'playoffs', p.round, p.matchSlot || p.slot, p.team1Id, p.team2Id, {
    label: p.label,
    tbd: p.tbd,
    isFinal: p.isFinal,
    isThird: p.isThird,
  }));
}

/** Assign courts to team ties (2 courts per tie alternating) */
export function suggestCourtAssignments(matches, numCourts, startCourt = 1) {
  let court = startCourt;
  return matches.map((m) => {
    const rubbers = m.courts?.length || 2;
    const assigned = [];
    for (let i = 0; i < rubbers; i++) {
      assigned.push(((court - 1 + i) % numCourts) + 1);
    }
    court = ((court - 1 + rubbers) % numCourts) + 1;
    return { ...m, courts: assigned, courtNumber: assigned[0] };
  });
}

export function participantCountFromConfig(formatId, config) {
  if (config.numParticipants) return Number(config.numParticipants);
  if (formatId === 'pool_ko' || formatId === 'pool_rr') {
    return (config.numPools || 2) * (config.poolSize || 4);
  }
  if (formatId === 'compass') return config.drawSize || 16;
  if (formatId === 'swiss') return config.numParticipants || 16;
  return config.numParticipants || 8;
}
