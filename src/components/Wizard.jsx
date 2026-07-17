import { useState, useEffect, useRef } from 'react';
import { freshPending, buildPointEntry } from '../lib/wizardLogic';

const SHOT_TYPES = ['Ground', 'Slice', 'Volley', 'Smash', 'Lob', 'Passing Shot', 'Dropshot'];
const OTHER_SUB_TYPES = ['Net Touch', 'Double Bounce', 'Foot Fault', 'Code Violation'];

// Steps that show rally count footer for adjustment
const RALLY_FOOTER_STEPS = new Set(['shotWing', 'shotType', 'otherSubType']);

function getActiveStep(pending) {
  if (!pending.serviceChoice) return 'serviceScreen';
  if (pending.serviceChoice === 'returnError' && !pending.returnErrorReason) return 'returnErrorType';
  if (pending.serviceChoice === 'ballIn' && pending.rallyCount === null) return 'rallySelect';
  if (pending.serviceChoice === 'ballIn' && !pending.ballInReason) return 'ballInPlay';
  const needsShot = pending.serviceChoice === 'returnWinner' || pending.serviceChoice === 'ballIn';
  if (needsShot && !pending.stroke) {
    if (!pending.shotWing) return 'shotWing';
    if (pending.shotWing === 'Other') return 'otherSubType';
    return 'shotType';
  }
  return null;
}

function shotLabel(type) {
  if (type === 'Passing Shot') return 'Pass';
  if (type === 'Dropshot') return 'Drop';
  return type;
}

export default function Wizard({ nextServer, onServerChange, onCommit, onUndo, canUndo, selfName, oppName }) {
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

  function chooseServer(server) {
    onServerChange(server);
    setPending(freshPending(server));
  }

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
    if (pending.serveAttempt === '1st') {
      setPending((p) => ({ ...freshPending(p.server), serveAttempt: '2nd' }));
    } else {
      commitAndReset({ serviceChoice: 'doubleFault' });
    }
  }

  // Let: repeats the same serve attempt — no DB write, no state change
  function handleLet() {
    setPending((p) => ({ ...freshPending(p.server), serveAttempt: p.serveAttempt }));
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

  // ── Other sub-type (infraction / non-stroke) ─────────────────────────────

  function handleOtherSubType(subType) {
    if (pending.serviceChoice === 'returnWinner') {
      commitAndReset({ shotType: subType, stroke: subType });
    } else {
      commitAndReset({ shotType: subType, stroke: subType });
    }
  }

  // ── Display helpers ──────────────────────────────────────────────────────

  const playerName = (who) => (who === 'self' ? (selfName || 'You') : (oppName || 'Opponent'));
  const serveLabel = pending.serveAttempt === '1st' ? '1st Serve' : '2nd Serve';

  const breadcrumbs = [];
  if (pending.serveAttempt === '2nd' && !pending.serviceChoice) breadcrumbs.push('Fault → 2nd Serve');
  if (pending.serviceChoice === 'ballIn') {
    breadcrumbs.push('Ball In');
    if (pending.ballInReason) breadcrumbs.push(playerName(pending.ballInWho) + ': ' + pending.ballInReason);
  } else if (pending.serviceChoice === 'returnWinner') {
    breadcrumbs.push('Return Winner');
  } else if (pending.serviceChoice === 'returnError') {
    breadcrumbs.push('Return Error');
  }
  if (pending.shotWing && pending.shotWing !== 'Other') breadcrumbs.push(pending.shotWing);

  const showRallyFooter = RALLY_FOOTER_STEPS.has(activeStep);

  return (
    <div className="wizard">
      {/* Server toggle */}
      <div className="server-toggle">
        <div className={'chip server-chip' + (pending.server === 'self' ? ' selected' : '')} onClick={() => chooseServer('self')}>
          Self serving
        </div>
        <div className={'chip server-chip' + (pending.server === 'opp' ? ' selected' : '')} onClick={() => chooseServer('opp')}>
          Opp serving
        </div>
      </div>

      {/* Breadcrumb */}
      {breadcrumbs.length > 0 && (
        <div className="wizard-breadcrumb">{breadcrumbs.join(' → ')}</div>
      )}

      {/* Active step card */}
      <div className="wizard-step-card" ref={stepCardRef}>

        {activeStep === 'serviceScreen' && (
          <>
            <div className="wizard-step-label">{serveLabel}</div>
            <div className="chip-row chip-grid-service">
              <div className="chip chip-lg chip-action chip-full" onClick={handleAce}>
                Ace
              </div>
              <div className="chip chip-lg warn" onClick={handleFault}>
                {pending.serveAttempt === '2nd' ? 'Double Fault' : 'Fault'}
              </div>
              <div className="chip chip-lg" onClick={handleBallIn}>
                Ball In
              </div>
              <div className="chip chip-lg self-pt" onClick={handleReturnWinner}>
                Return Winner
              </div>
              <div className="chip chip-lg warn" onClick={handleReturnError}>
                Return Error
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
            <div className="wizard-step-label">Return Error — Forced or Unforced?</div>
            <div className="chip-row">
              <div className="chip chip-lg chip-full" onClick={() => handleReturnErrorReason('ForcedError')}>
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
            <div className="chip-row chip-grid-rally">
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
            <div className="ball-in-play-grid">
              {(['self', 'opp']).map((who) => (
                <div key={who} className="player-col">
                  <div className={'player-col-name ' + (who === 'self' ? 'self-name' : 'opp-name')}>
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

        {activeStep === 'shotWing' && (
          <>
            <div className="wizard-step-label">Select Wing</div>
            <div className="chip-row">
              <div className="chip chip-lg" onClick={() => handleShotWing('Forehand')}>Forehand</div>
              <div className="chip chip-lg" onClick={() => handleShotWing('Backhand')}>Backhand</div>
            </div>
            <div className="chip-row" style={{ marginTop: 8 }}>
              <div className="chip chip-lg chip-full" onClick={() => handleShotWing('Other')}>Other / Infraction</div>
            </div>
          </>
        )}

        {activeStep === 'shotType' && (
          <>
            <div className="wizard-step-label">Shot Type · {pending.shotWing}</div>
            <div className="chip-row chip-grid-2">
              {SHOT_TYPES.map((type) => (
                <div key={type} className="chip chip-lg" onClick={() => handleShotType(type)}>
                  {shotLabel(type)}
                </div>
              ))}
              <div className="chip chip-lg chip-full" onClick={() => setPending((p) => ({ ...p, shotWing: 'Other' }))}>
                Other / Infraction
              </div>
            </div>
          </>
        )}

        {activeStep === 'otherSubType' && (
          <>
            <div className="wizard-step-label">Infraction Type</div>
            <div className="chip-row chip-grid-2">
              {OTHER_SUB_TYPES.map((sub) => (
                <div key={sub} className="chip chip-lg" onClick={() => handleOtherSubType(sub)}>
                  {sub}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Rally counter footer — adjust rally count during wing/shot steps */}
        {showRallyFooter && (
          <div className="rally-footer">
            <span className="rally-footer-label">Rally</span>
            <div className="chip-row chip-grid-rally" style={{ margin: 0, flex: 1 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <div
                  key={n}
                  className={'chip' + (pending.rallyCount === n ? ' selected' : '')}
                  style={{ textAlign: 'center', padding: '6px 4px', fontSize: '0.82rem' }}
                  onClick={() => setPending((p) => ({ ...p, rallyCount: n }))}
                >
                  {n === 7 ? '7+' : n}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      <div className="undo-bar">
        <button className="undo-btn" disabled={!canUndo} onClick={onUndo}>↩ Undo last point</button>
      </div>
    </div>
  );
}
