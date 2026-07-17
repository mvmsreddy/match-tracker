import { useState, useEffect, useRef } from 'react';
import { freshPending, buildPointEntry } from '../lib/wizardLogic';

const SHOT_TYPES = ['Ground', 'Slice', 'Volley', 'Smash', 'Lob', 'Passing Shot', 'Dropshot'];
const OTHER_SUB_TYPES = ['Net Touch', 'Double Bounce', 'Foot Fault', 'Code Violation'];


function getActiveStep(pending) {
  if (!pending.serviceChoice) return 'serviceScreen';
  if (pending.serviceChoice === 'faultPending') return 'faultLocation';
  if (pending.serviceChoice === 'returnError' && !pending.returnErrorReason) return 'returnErrorType';
  if (pending.serviceChoice === 'ballIn' && pending.rallyCount === null) return 'rallySelect';
  if (pending.serviceChoice === 'ballIn' && !pending.ballInReason) return 'ballInPlay';
  const needsShot = pending.serviceChoice === 'returnWinner' || pending.serviceChoice === 'ballIn';
  if (needsShot && !pending.stroke) {
    if (!pending.shotWing) return 'shotWing';
    return 'shotType';
  }
  // Optional infraction step — only for ballIn, only if not yet answered
  if (pending.serviceChoice === 'ballIn' && pending.stroke && pending.infraction === null) return 'infractionSelect';
  return null;
}

function shotLabel(type) {
  if (type === 'Passing Shot') return 'Pass';
  if (type === 'Dropshot') return 'Drop';
  return type;
}

export default function Wizard({ nextServer, onCommit, onUndo, canUndo, selfName, oppName }) {
  const [pending, setPending] = useState(() => freshPending(nextServer));
  const stepCardRef = useRef(null);
  const prevActiveStep = useRef(null);

  useEffect(() => {
    setPending((p) => (p.server === nextServer ? p : freshPending(nextServer)));
  }, [nextServer]);

  const activeStep = getActiveStep(pending);

  useEffect(() => {
    if (activeStep !== prevActiveStep.current) {
      prevActiveStep.current = activeStep;
      const timer = setTimeout(() => {
        stepCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [activeStep]);


  function commitAndReset(extra) {
    const entry = buildPointEntry({ ...pending, ...extra });
    onCommit(entry);
    setPending(freshPending(pending.server));
  }

  // ── Service screen ───────────────────────────────────────────────────────

  function handleAce() {
    commitAndReset({ serviceChoice: 'ace' });
  }

  function handleFault() {
    setPending((p) => ({ ...p, serviceChoice: 'faultPending' }));
  }

  function handleFaultLocation(location) {
    if (pending.serveAttempt === '1st') {
      // Record fault location, advance to 2nd serve
      setPending(() => ({ ...freshPending(pending.server), serveAttempt: '2nd', firstFaultLocation: location }));
    } else {
      // Double fault — commit with both fault locations
      commitAndReset({ serviceChoice: 'doubleFault', faultLocation: location });
    }
  }

  // Let: repeats the same serve attempt — no DB write, no state change
  function handleLet() {
    setPending((p) => ({ ...freshPending(p.server), serveAttempt: p.serveAttempt, firstFaultLocation: p.firstFaultLocation }));
  }

  function handleReturnWinner() {
    setPending((p) => ({ ...p, serviceChoice: 'returnWinner' }));
  }

  function handleReturnError() {
    setPending((p) => ({ ...p, serviceChoice: 'returnError' }));
  }

  function handleBallIn() {
    setPending((p) => ({ ...p, serviceChoice: 'ballIn' }));
  }

  // ── Return error type ────────────────────────────────────────────────────

  function handleReturnErrorReason(reason) {
    commitAndReset({ returnErrorReason: reason });
  }

  // ── Ball in play ─────────────────────────────────────────────────────────

  function handleBallInOutcome(who, reason) {
    setPending((p) => ({ ...p, ballInWho: who, ballInReason: reason }));
  }

  // ── Shot wing ────────────────────────────────────────────────────────────

  function handleShotWing(wing) {
    setPending((p) => ({ ...p, shotWing: wing }));
  }

  // ── Shot type ────────────────────────────────────────────────────────────

  function handleShotType(type) {
    const stroke = type + ' ' + pending.shotWing;
    commitAndReset({ shotType: type, stroke });
  }

  // ── Display helpers ──────────────────────────────────────────────────────

  const playerName = (who) => (who === 'self' ? (selfName || 'You') : (oppName || 'Opponent'));
  const colClass = (who) =>
    'player-col-name ' + (who === 'self' ? 'self-name' : 'opp-name') + (pending.server === who ? ' player-serving' : '');
  const serveLabel = pending.serveAttempt === '1st' ? '1st Serve' : '2nd Serve';
  const receiver = pending.server === 'self' ? 'opp' : 'self';

  const breadcrumbs = [];
  if (pending.serveAttempt === '2nd' && !pending.serviceChoice) {
    breadcrumbs.push('Fault' + (pending.firstFaultLocation ? ' · ' + pending.firstFaultLocation : '') + ' → 2nd Serve');
  }
  if (pending.serviceChoice === 'ballIn') {
    breadcrumbs.push('Ball In');
    if (pending.ballInReason) breadcrumbs.push(playerName(pending.ballInWho) + ': ' + pending.ballInReason);
  } else if (pending.serviceChoice === 'returnWinner') {
    breadcrumbs.push('Return Winner');
  } else if (pending.serviceChoice === 'returnError') {
    breadcrumbs.push('Return Error');
  }
  if (pending.shotWing && pending.shotWing !== 'Other') breadcrumbs.push(pending.shotWing);


  return (
    <div className="wizard">
      {/* Breadcrumb */}
      {breadcrumbs.length > 0 && (
        <div className="wizard-breadcrumb">{breadcrumbs.join(' → ')}</div>
      )}

      {/* Active step card */}
      <div className="wizard-step-card" ref={stepCardRef}>

        {activeStep === 'faultLocation' && (
          <>
            <div className="wizard-step-label">
              {pending.serveAttempt === '2nd' ? 'Double Fault — Where?' : '1st Serve Fault — Where?'}
            </div>
            <div className="chip-row">
              <div className="chip chip-lg warn" onClick={() => handleFaultLocation('Long')}>Long</div>
              <div className="chip chip-lg warn" onClick={() => handleFaultLocation('Wide')}>Wide</div>
              <div className="chip chip-lg warn" onClick={() => handleFaultLocation('Net')}>Net</div>
            </div>
          </>
        )}

        {activeStep === 'serviceScreen' && (
          <>
            <div className="wizard-step-label">{serveLabel}</div>
            <div className="ball-in-play-grid wizard-grow">
              {/* Left column: always self */}
              <div className="player-col">
                <div className={colClass('self')}>{playerName('self')}</div>
                {pending.server === 'self' ? (
                  <>
                    <div className="chip chip-lg chip-action" onClick={handleAce}>Ace</div>
                    <div className="chip chip-lg warn" onClick={handleFault}>
                      {pending.serveAttempt === '2nd' ? 'Double Fault' : 'Fault'}
                    </div>
                    <div className="chip chip-lg" onClick={handleBallIn}>Ball In</div>
                  </>
                ) : (
                  <>
                    <div className="chip chip-lg self-pt" onClick={handleReturnWinner}>Return Winner</div>
                    <div className="chip chip-lg warn" onClick={handleReturnError}>Return Error</div>
                  </>
                )}
              </div>
              {/* Right column: always opp */}
              <div className="player-col">
                <div className={colClass('opp')}>{playerName('opp')}</div>
                {pending.server === 'opp' ? (
                  <>
                    <div className="chip chip-lg chip-action" onClick={handleAce}>Ace</div>
                    <div className="chip chip-lg warn" onClick={handleFault}>
                      {pending.serveAttempt === '2nd' ? 'Double Fault' : 'Fault'}
                    </div>
                    <div className="chip chip-lg" onClick={handleBallIn}>Ball In</div>
                  </>
                ) : (
                  <>
                    <div className="chip chip-lg self-pt" onClick={handleReturnWinner}>Return Winner</div>
                    <div className="chip chip-lg warn" onClick={handleReturnError}>Return Error</div>
                  </>
                )}
              </div>
            </div>
            <div className="chip-row" style={{ marginTop: 8 }}>
              <div className="chip chip-lg chip-let chip-full" onClick={handleLet}>
                Let — Replay {pending.serveAttempt} Serve
              </div>
            </div>
          </>
        )}

        {activeStep === 'returnErrorType' && (
          <>
            <div className="wizard-step-label">{playerName(receiver)} — Return Error</div>
            <div className="chip-row">
              <div className="chip chip-lg chip-forced chip-full" onClick={() => handleReturnErrorReason('ForcedError')}>
                Forced Error
              </div>
              <div className="chip chip-lg warn chip-full" onClick={() => handleReturnErrorReason('UnforcedError')}>
                Unforced Error
              </div>
            </div>
          </>
        )}

        {activeStep === 'rallySelect' && (
          <>
            <div className="wizard-step-label">Rally Length</div>
            <div className="ball-in-play-grid" style={{ marginBottom: 8 }}>
              <div className="player-col">
                <div className={colClass('self')}>{playerName('self')}</div>
              </div>
              <div className="player-col">
                <div className={colClass('opp')}>{playerName('opp')}</div>
              </div>
            </div>
            <div className="chip-row chip-grid-rally wizard-grow">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <div
                  key={n}
                  className="chip chip-lg"
                  style={{ textAlign: 'center' }}
                  onClick={() => setPending((p) => ({ ...p, rallyCount: n }))}
                >
                  {n === 7 ? '7+' : n}
                </div>
              ))}
            </div>
          </>
        )}

        {activeStep === 'ballInPlay' && (
          <>
            <div className="wizard-step-label">Ball in Play</div>
            <div className="ball-in-play-grid wizard-grow">
              {(['self', 'opp']).map((who) => (
                <div key={who} className="player-col">
                  <div className={colClass(who)}>
                    {playerName(who)}
                  </div>
                  <div className="chip chip-lg self-pt" onClick={() => handleBallInOutcome(who, 'Winner')}>
                    Winner
                  </div>
                  <div className="chip chip-lg chip-forced" onClick={() => handleBallInOutcome(who, 'ForcedError')}>
                    Forced Error
                  </div>
                  <div className="chip chip-lg warn" onClick={() => handleBallInOutcome(who, 'UnforcedError')}>
                    Unforced Error
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeStep === 'shotWing' && (() => {
          const hitter = pending.serviceChoice === 'returnWinner' ? receiver : (pending.ballInWho || receiver);
          return (
            <>
              <div className="wizard-step-label">Select Wing</div>
              <div className="ball-in-play-grid wizard-grow">
                <div className="player-col">
                  <div className={colClass('self')}>{playerName('self')}</div>
                  {hitter === 'self' && (
                    <>
                      <div className="chip chip-lg chip-full" onClick={() => handleShotWing('Forehand')}>Forehand</div>
                      <div className="chip chip-lg chip-full" onClick={() => handleShotWing('Backhand')}>Backhand</div>
                    </>
                  )}
                </div>
                <div className="player-col">
                  <div className={colClass('opp')}>{playerName('opp')}</div>
                  {hitter === 'opp' && (
                    <>
                      <div className="chip chip-lg chip-full" onClick={() => handleShotWing('Forehand')}>Forehand</div>
                      <div className="chip chip-lg chip-full" onClick={() => handleShotWing('Backhand')}>Backhand</div>
                    </>
                  )}
                </div>
              </div>
            </>
          );
        })()}

        {activeStep === 'shotType' && (() => {
          const hitter = pending.serviceChoice === 'returnWinner' ? receiver : (pending.ballInWho || receiver);
          return (
            <>
              <div className="wizard-step-label">{pending.shotWing} — Select Shot</div>
              <div className="ball-in-play-grid wizard-grow">
                <div className="player-col">
                  <div className={colClass('self')}>{playerName('self')}</div>
                  {hitter === 'self' && SHOT_TYPES.map((type) => (
                    <div key={type} className="chip chip-lg chip-full" onClick={() => handleShotType(type)}>
                      {shotLabel(type)}
                    </div>
                  ))}
                </div>
                <div className="player-col">
                  <div className={colClass('opp')}>{playerName('opp')}</div>
                  {hitter === 'opp' && SHOT_TYPES.map((type) => (
                    <div key={type} className="chip chip-lg chip-full" onClick={() => handleShotType(type)}>
                      {shotLabel(type)}
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        })()}

        {activeStep === 'infractionSelect' && (
          <>
            <div className="wizard-step-label">Infraction? (Optional)</div>
            <div className="chip-row chip-grid-2">
              {OTHER_SUB_TYPES.map((sub) => (
                <div key={sub} className="chip chip-lg" onClick={() => commitAndReset({ infraction: sub })}>
                  {sub}
                </div>
              ))}
              <div className="chip chip-lg chip-full chip-let" onClick={() => commitAndReset({ infraction: 'none' })}>
                Skip — No Infraction
              </div>
            </div>
          </>
        )}


      </div>

      <div className="undo-bar">
        <button className="undo-btn" disabled={!canUndo} onClick={onUndo}>↩ Undo last point</button>
      </div>
    </div>
  );
}
