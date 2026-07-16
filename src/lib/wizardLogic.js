import { other } from './engine';
import { SHOT_TYPES } from './constants';

export function outcomeReason(outcome) {
  if (outcome === 'self-winner' || outcome === 'opp-winner') return 'Winner';
  if (outcome === 'self-forced' || outcome === 'opp-forced') return 'ForcedError';
  return 'UnforcedError';
}

export function outcomeEndedBy(outcome) {
  if (outcome === 'self-winner') return 'self';
  if (outcome === 'opp-winner') return 'opp';
  if (outcome === 'self-forced') return 'opp';
  if (outcome === 'opp-forced') return 'self';
  if (outcome === 'self-unforced') return 'self';
  return 'opp';
}

export function outcomePointWinner(outcome) {
  const reason = outcomeReason(outcome);
  const endedBy = outcomeEndedBy(outcome);
  return reason === 'Winner' ? endedBy : other(endedBy);
}

/** Which shot-type chips to show for the current outcome, and who ended the point. */
export function strokeOptionsFor(outcome, server) {
  const endedBy = outcome.startsWith('self') ? (outcome === 'self-forced' ? 'opp' : 'self') : (outcome === 'opp-forced' ? 'self' : 'opp');
  const isServerShot = endedBy === server;
  const opts = [...SHOT_TYPES];
  if (isServerShot) opts.unshift('Serve');
  return { opts, endedBy };
}

export const OUTCOME_OPTIONS = [
  { value: 'self-winner', label: 'I hit a winner' },
  { value: 'self-forced', label: 'I forced their error' },
  { value: 'self-unforced', label: 'My unforced error' },
  { value: 'opp-winner', label: 'Opponent winner' },
  { value: 'opp-forced', label: 'Opponent forced my error' },
  { value: 'opp-unforced', label: 'Opponent unforced error' },
];

export function freshPending(server) {
  return {
    server,
    serveResult: null,
    firstFaultLocation: null,
    dfLocation: null,
    outcome: null,
    shotType: null,
    side: null,
    stroke: null,
    isReturn: false,
    location: null,
    rally: null,
  };
}

/** Builds the final point-log entry from a completed pending object. */
export function buildPointEntry(pending) {
  const server = pending.server;
  if (pending.serveResult === 'DF') {
    const winner = other(server);
    return {
      server, serveResult: 'DF', endedBy: server, reason: 'DoubleFault',
      stroke: 'Serve', isReturn: false, location: pending.dfLocation, rally: 1, pointWinner: winner,
      firstFaultLocation: pending.firstFaultLocation,
    };
  }
  const reason = outcomeReason(pending.outcome);
  const endedBy = outcomeEndedBy(pending.outcome);
  const winner = outcomePointWinner(pending.outcome);
  return {
    server, serveResult: pending.serveResult, endedBy, reason,
    stroke: pending.stroke, isReturn: pending.isReturn, location: pending.location, rally: pending.rally, pointWinner: winner,
    firstFaultLocation: pending.firstFaultLocation,
  };
}
