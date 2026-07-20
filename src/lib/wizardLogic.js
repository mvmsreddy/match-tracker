import { other } from './engine';

export function freshPending(server) {
  return {
    server,
    serveAttempt: '1st',       // '1st' | '2nd'
    serviceChoice: null,        // 'ace' | 'doubleFault' | 'returnWinner' | 'returnError' | 'ballIn'
    returnErrorReason: null,    // 'ForcedError' | 'UnforcedError' (chosen after Return Error tap)
    ballInWho: null,            // 'self' | 'opp' — who ended the rally
    ballInReason: null,         // 'Winner' | 'ForcedError' | 'UnforcedError'
    shotWing: null,             // 'Forehand' | 'Backhand' | 'Other'
    shotType: null,             // 'Ground' | 'Volley' | etc. | infraction sub-type
    stroke: null,               // combined: 'Ground Forehand', 'Net Touch', etc.
    rallyCount: null,           // null = not yet selected; must be chosen before ballInPlay
    infraction: null,           // null = not yet answered; 'none' = skipped; string = infraction type
    firstFaultLocation: null,   // 'Long' | 'Wide' | 'Net' — location of the 1st serve fault
    location: null,             // 'Long' | 'Wide' | 'Net' — where an unforced error landed
  };
}

/** Builds the final point-log entry from a completed pending object. */
export function buildPointEntry(pending) {
  const server = pending.server;
  const receiver = other(server);

  if (pending.serviceChoice === 'ace') {
    return {
      server,
      serveResult: pending.serveAttempt,
      endedBy: server,
      reason: 'Winner',
      stroke: 'Serve',
      isReturn: false,
      location: null,
      rally: 0,
      pointWinner: server,
      firstFaultLocation: null,
    };
  }

  if (pending.serviceChoice === 'doubleFault') {
    return {
      server,
      serveResult: 'DF',
      endedBy: server,
      reason: 'DoubleFault',
      stroke: 'Serve',
      isReturn: false,
      location: pending.faultLocation || null,
      rally: 0,
      pointWinner: receiver,
      firstFaultLocation: pending.firstFaultLocation || null,
    };
  }

  if (pending.serviceChoice === 'returnError') {
    const reason = pending.returnErrorReason || 'ForcedError';
    return {
      server,
      serveResult: pending.serveAttempt,
      endedBy: receiver,
      reason,
      stroke: pending.stroke || 'Return',
      isReturn: true,
      location: pending.location || null,
      rally: 1,
      pointWinner: server,
      firstFaultLocation: pending.firstFaultLocation || null,
    };
  }

  if (pending.serviceChoice === 'returnWinner') {
    return {
      server,
      serveResult: pending.serveAttempt,
      endedBy: receiver,
      reason: 'Winner',
      stroke: pending.stroke,
      isReturn: true,
      location: null,
      rally: 1,
      pointWinner: receiver,
      firstFaultLocation: pending.firstFaultLocation || null,
    };
  }

  // ballIn case
  const who = pending.ballInWho;
  const reason = pending.ballInReason;
  const pointWinner = reason === 'Winner' ? who : other(who);

  return {
    server,
    serveResult: pending.serveAttempt,
    endedBy: who,
    reason,
    stroke: pending.stroke,
    isReturn: false,
    location: pending.location || null,
    rally: pending.rallyCount ?? 2,
    pointWinner,
    firstFaultLocation: pending.firstFaultLocation || null,
    infraction: (pending.infraction && pending.infraction !== 'none') ? pending.infraction : null,
  };
}
