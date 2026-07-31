import { useState, useEffect, useRef } from 'react';
import { freshPending, buildPointEntry } from '../lib/wizardLogic';
import ShotLocationCourt from './ShotLocationCourt';
import ChipButton from './tracker/ChipButton';
import { Button } from './primitives/button';
import { cn } from '../lib/utils';

const SHOT_TYPES = ['Ground', 'Slice', 'Volley', 'Smash', 'Lob', 'Passing Shot', 'Dropshot'];
const OTHER_SUB_TYPES = ['Net Touch', 'Double Bounce', 'Foot Fault', 'Code Violation'];


function getActiveStep(pending, trackingMode = 'expert') {
  // Tracking-detail tiers: which optional steps get shown, from fastest to most thorough.
  const wantsShotDetail = trackingMode !== 'basic';      // shot wing/type + stroke capture
  const wantsRallyCount = trackingMode !== 'basic';      // rally-length step
  const wantsErrorLocation = trackingMode !== 'basic';   // Long/Wide/Net for unforced errors
  const wantsCourtTap = trackingMode === 'expert';       // hit-from/dropped-at diagram
  const wantsInfraction = trackingMode === 'expert';     // optional infraction step

  if (!pending.serviceChoice) return 'serviceScreen';
  if (pending.serviceChoice === 'faultPending') return 'faultLocation';
  if (pending.serviceChoice === 'returnError' && !pending.returnErrorReason) return 'returnErrorType';
  if (pending.serviceChoice === 'returnError' && wantsShotDetail && !pending.shotWing) return 'shotWing';
  if (pending.serviceChoice === 'returnError' && wantsCourtTap && !pending.shotDroppedAt) return 'shotLocation';
  if (pending.serviceChoice === 'returnError' && pending.returnErrorReason === 'UnforcedError' && wantsErrorLocation && !pending.location) return 'errorLocation';
  if (pending.serviceChoice === 'ballIn' && wantsRallyCount && pending.rallyCount === null) return 'rallySelect';
  if (pending.serviceChoice === 'ballIn' && !pending.ballInReason) return 'ballInPlay';
  const needsShot = wantsShotDetail && (pending.serviceChoice === 'returnWinner' || pending.serviceChoice === 'ballIn');
  if (needsShot && !pending.stroke) {
    if (!pending.shotWing) return 'shotWing';
    return 'shotType';
  }
  // Shot-detail step is either answered, or skipped entirely for this tier.
  const shotDetailDone = !wantsShotDetail || !!pending.stroke;
  // Every rally-ending shot gets a court tap: where was it hit from, where did it drop?
  if (needsShot && shotDetailDone && wantsCourtTap && !pending.shotDroppedAt) return 'shotLocation';
  // Unforced errors get one more tap: where did it land?
  if (pending.serviceChoice === 'ballIn' && pending.ballInReason === 'UnforcedError' && shotDetailDone && wantsErrorLocation && !pending.location) {
    return 'errorLocation';
  }
  // Optional infraction step — only for ballIn, only if not yet answered
  if (pending.serviceChoice === 'ballIn' && shotDetailDone && wantsInfraction && pending.infraction === null) return 'infractionSelect';
  return null;
}

function shotLabel(type) {
  if (type === 'Passing Shot') return 'Pass';
  if (type === 'Dropshot') return 'Drop';
  return type;
}

export default function Wizard({ nextServer, onCommit, onUndo, canUndo, selfName, oppName, onDelete, trackingMode }) {
  const [pending, setPending] = useState(() => freshPending(nextServer));
  const [history, setHistory] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const stepCardRef = useRef(null);
  const prevActiveStep = useRef(null);
  const touchStartRef = useRef(null);

  useEffect(() => {
    setPending((p) => (p.server === nextServer ? p : freshPending(nextServer)));
    setHistory([]);
  }, [nextServer]);

  // Records the pre-change pending snapshot before applying an in-point
  // (non-committing) step, so goBack() can restore it.
  function setPendingStep(updater) {
    setHistory((h) => [...h, pending]);
    setPending(updater);
  }

  // Steps back one screen within the point being built. If there's no
  // earlier screen in this point, falls back to undoing the last committed point.
  function goBack() {
    if (history.length > 0) {
      setPending(history[history.length - 1]);
      setHistory((h) => h.slice(0, -1));
    } else if (canUndo) {
      onUndo();
    }
  }

  function handleTouchStart(e) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(e) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (dx > 60 && Math.abs(dy) < 40) goBack();
  }

  const activeStep = getActiveStep(pending, trackingMode);

  useEffect(() => {
    if (activeStep !== prevActiveStep.current) {
      prevActiveStep.current = activeStep;
      const timer = setTimeout(() => {
        stepCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [activeStep]);

  // Different tracking tiers finish on different steps (a skipped step can no
  // longer call commit itself), so completion is driven by "no more steps
  // left" rather than any one step's handler. Individual handlers below still
  // commit directly when they're unconditionally terminal (ace, double fault,
  // infraction chips) — this is the catch-all for every other case.
  useEffect(() => {
    if (pending.serviceChoice && activeStep === null) {
      commitAndReset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep]);


  function commitAndReset(extra) {
    const entry = buildPointEntry({ ...pending, ...extra });
    onCommit(entry);
    setPending(freshPending(pending.server));
    setHistory([]);
  }

  // ── Service screen ───────────────────────────────────────────────────────

  function handleAce() {
    commitAndReset({ serviceChoice: 'ace' });
  }

  function handleFault() {
    setPendingStep((p) => ({ ...p, serviceChoice: 'faultPending' }));
  }

  function handleFaultLocation(location) {
    if (pending.serveAttempt === '1st') {
      // Record fault location, advance to 2nd serve
      setPendingStep(() => ({ ...freshPending(pending.server), serveAttempt: '2nd', firstFaultLocation: location }));
    } else {
      // Double fault — commit with both fault locations
      commitAndReset({ serviceChoice: 'doubleFault', faultLocation: location });
    }
  }

  // Let: repeats the same serve attempt — no DB write, no state change
  function handleLet() {
    setPendingStep((p) => ({ ...freshPending(p.server), serveAttempt: p.serveAttempt, firstFaultLocation: p.firstFaultLocation }));
  }

  function handleReturnWinner() {
    setPendingStep((p) => ({ ...p, serviceChoice: 'returnWinner' }));
  }

  function handleReturnError() {
    setPendingStep((p) => ({ ...p, serviceChoice: 'returnError' }));
  }

  function handleBallIn() {
    setPendingStep((p) => ({ ...p, serviceChoice: 'ballIn' }));
  }

  // ── Return error type ────────────────────────────────────────────────────

  function handleReturnErrorReason(reason) {
    setPendingStep((p) => ({ ...p, returnErrorReason: reason }));
  }

  // ── Ball in play ─────────────────────────────────────────────────────────

  function handleBallInOutcome(who, reason) {
    setPendingStep((p) => ({ ...p, ballInWho: who, ballInReason: reason }));
  }

  // ── Shot wing ────────────────────────────────────────────────────────────

  function handleShotWing(wing) {
    if (pending.serviceChoice === 'returnError') {
      // Every return error still has the Shot Location court tap ahead — don't commit yet.
      const stroke = 'Return ' + wing;
      setPendingStep((p) => ({ ...p, shotWing: wing, stroke }));
      return;
    }
    setPendingStep((p) => ({ ...p, shotWing: wing }));
  }

  // ── Shot type ────────────────────────────────────────────────────────────

  function handleShotType(type) {
    // In Expert tier, the Shot Location court tap is always next — don't commit yet.
    // (Lower tiers skip the court tap entirely; the wizard's generic "no steps
    // left" effect commits for those once this is the last field they need.)
    const stroke = type + ' ' + pending.shotWing;
    setPendingStep((p) => ({ ...p, shotType: type, stroke }));
  }

  // ── Shot location (court tap: Hit From → Dropped At) — Expert tier only ──

  function handleShotLocationComplete(hitFrom, droppedAt) {
    const extra = { shotHitFrom: hitFrom, shotDroppedAt: droppedAt };
    // Return Winner and a Forced return error have no further steps — commit now.
    // Everything else (ball-in, or an unforced return error) still has a step ahead.
    const isReturnWinner = pending.serviceChoice === 'returnWinner';
    const isReturnForcedError = pending.serviceChoice === 'returnError' && pending.returnErrorReason === 'ForcedError';
    if (isReturnWinner || isReturnForcedError) {
      commitAndReset(extra);
    } else {
      setPendingStep((p) => ({ ...p, ...extra }));
    }
  }

  // ── Error location ───────────────────────────────────────────────────────

  function handleErrorLocation(location) {
    if (pending.serviceChoice === 'returnError') {
      // Return errors have no Infraction step — this is always the last one.
      commitAndReset({ location });
    } else {
      // Ball-in points: in Expert tier the optional Infraction step is still ahead — don't
      // commit yet. Lower tiers skip it; the generic "no steps left" effect commits instead.
      setPendingStep((p) => ({ ...p, location }));
    }
  }

  // ── Display helpers ──────────────────────────────────────────────────────

  const playerName = (who) => (who === 'self' ? (selfName || 'You') : (oppName || 'Opponent'));
  const colClass = (who) => cn(
    'rounded-t-lg border-b px-1.5 py-1.5 text-center font-mono text-xs font-semibold uppercase tracking-wide',
    who === 'self' ? 'text-primary' : 'text-destructive',
    pending.server === who
      ? (who === 'self' ? 'border-b-2 border-primary bg-primary/10' : 'border-b-2 border-destructive bg-destructive/10')
      : 'border-border'
  );
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
    <div className="flex flex-1 flex-col py-3">
      {/* Breadcrumb */}
      {breadcrumbs.length > 0 && (
        <div className="mb-2 border-b border-border pb-2 font-mono text-xs text-muted-foreground">
          {breadcrumbs.join(' → ')}
        </div>
      )}

      {/* Active step card */}
      <div
        className="mb-2 flex min-h-[180px] flex-1 flex-col overflow-y-auto rounded-lg border border-border border-l-[3px] border-l-primary bg-card p-3.5"
        ref={stepCardRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {(history.length > 0 || canUndo) && (
          <button
            type="button"
            className="mb-1 flex-shrink-0 cursor-pointer self-start bg-transparent font-mono text-xs text-muted-foreground hover:text-primary"
            onClick={goBack}
            title="Go back one step (or swipe right)"
          >
            ‹ Back
          </button>
        )}

        {activeStep === 'faultLocation' && (
          <>
            <div className="mb-2.5 flex-shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-primary">
              {pending.serveAttempt === '2nd' ? 'Double Fault — Where?' : '1st Serve Fault — Where?'}
            </div>
            <div className="flex flex-wrap gap-2">
              <ChipButton variant="warn" onClick={() => handleFaultLocation('Long')}>Long</ChipButton>
              <ChipButton variant="warn" onClick={() => handleFaultLocation('Wide')}>Wide</ChipButton>
              <ChipButton variant="warn" onClick={() => handleFaultLocation('Net')}>Net</ChipButton>
            </div>
          </>
        )}

        {activeStep === 'serviceScreen' && (
          <>
            <div className="mb-2.5 flex-shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-primary">{serveLabel}</div>
            <div className="grid flex-1 grid-cols-2 items-stretch gap-2.5">
              {/* Left column: always self */}
              <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                <div className={colClass('self')}>{playerName('self')}</div>
                {pending.server === 'self' ? (
                  <>
                    <ChipButton variant="action" className="min-h-[54px] flex-1" onClick={handleAce}>Ace</ChipButton>
                    <ChipButton variant="warn" className="min-h-[54px] flex-1" onClick={handleFault}>
                      {pending.serveAttempt === '2nd' ? 'Double Fault' : 'Fault'}
                    </ChipButton>
                    <ChipButton className="min-h-[54px] flex-1" onClick={handleBallIn}>Ball In</ChipButton>
                  </>
                ) : (
                  <>
                    <ChipButton variant="self" className="min-h-[54px] flex-1" onClick={handleReturnWinner}>Return Winner</ChipButton>
                    <ChipButton variant="warn" className="min-h-[54px] flex-1" onClick={handleReturnError}>Return Error</ChipButton>
                  </>
                )}
              </div>
              {/* Right column: always opp */}
              <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                <div className={colClass('opp')}>{playerName('opp')}</div>
                {pending.server === 'opp' ? (
                  <>
                    <ChipButton variant="action" className="min-h-[54px] flex-1" onClick={handleAce}>Ace</ChipButton>
                    <ChipButton variant="warn" className="min-h-[54px] flex-1" onClick={handleFault}>
                      {pending.serveAttempt === '2nd' ? 'Double Fault' : 'Fault'}
                    </ChipButton>
                    <ChipButton className="min-h-[54px] flex-1" onClick={handleBallIn}>Ball In</ChipButton>
                  </>
                ) : (
                  <>
                    <ChipButton variant="self" className="min-h-[54px] flex-1" onClick={handleReturnWinner}>Return Winner</ChipButton>
                    <ChipButton variant="warn" className="min-h-[54px] flex-1" onClick={handleReturnError}>Return Error</ChipButton>
                  </>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <ChipButton variant="let" full onClick={handleLet}>
                Let — Replay {pending.serveAttempt} Serve
              </ChipButton>
            </div>
          </>
        )}

        {activeStep === 'returnErrorType' && (
          <>
            <div className="mb-2.5 flex-shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-primary">{playerName(receiver)} — Return Error</div>
            <div className="flex flex-wrap gap-2">
              <ChipButton variant="forced" full onClick={() => handleReturnErrorReason('ForcedError')}>
                Forced Error
              </ChipButton>
              <ChipButton variant="warn" full onClick={() => handleReturnErrorReason('UnforcedError')}>
                Unforced Error
              </ChipButton>
            </div>
          </>
        )}

        {activeStep === 'rallySelect' && (
          <>
            <div className="mb-2.5 flex-shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-primary">Rally Length</div>
            <div className="mb-2 grid grid-cols-2 gap-2.5">
              <div className={colClass('self')}>{playerName('self')}</div>
              <div className={colClass('opp')}>{playerName('opp')}</div>
            </div>
            <div className="flex flex-1 flex-nowrap items-stretch gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <ChipButton
                  key={n}
                  className="min-h-[60px] flex-1 text-base"
                  onClick={() => setPendingStep((p) => ({ ...p, rallyCount: n }))}
                >
                  {n === 7 ? '7+' : n}
                </ChipButton>
              ))}
            </div>
          </>
        )}

        {activeStep === 'ballInPlay' && (
          <>
            <div className="mb-2.5 flex-shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-primary">Ball in Play</div>
            <div className="grid flex-1 grid-cols-2 items-stretch gap-2.5">
              {(['self', 'opp']).map((who) => (
                <div key={who} className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                  <div className={colClass(who)}>{playerName(who)}</div>
                  <ChipButton variant="self" className="min-h-[76px] flex-1" onClick={() => handleBallInOutcome(who, 'Winner')}>
                    Winner
                  </ChipButton>
                  <ChipButton variant="forced" className="min-h-[76px] flex-1" onClick={() => handleBallInOutcome(who, 'ForcedError')}>
                    Forced Error
                  </ChipButton>
                  <ChipButton variant="warn" className="min-h-[76px] flex-1" onClick={() => handleBallInOutcome(who, 'UnforcedError')}>
                    Unforced Error
                  </ChipButton>
                </div>
              ))}
            </div>
          </>
        )}

        {activeStep === 'shotWing' && (() => {
          const hitter = pending.serviceChoice === 'returnWinner' ? receiver : (pending.ballInWho || receiver);
          return (
            <>
              <div className="mb-2.5 flex-shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-primary">Select Wing</div>
              <div className="grid flex-1 grid-cols-2 items-stretch gap-2.5">
                <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                  <div className={colClass('self')}>{playerName('self')}</div>
                  {hitter === 'self' && (
                    <>
                      <ChipButton full className="flex-1" onClick={() => handleShotWing('Forehand')}>Forehand</ChipButton>
                      <ChipButton full className="flex-1" onClick={() => handleShotWing('Backhand')}>Backhand</ChipButton>
                    </>
                  )}
                </div>
                <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                  <div className={colClass('opp')}>{playerName('opp')}</div>
                  {hitter === 'opp' && (
                    <>
                      <ChipButton full className="flex-1" onClick={() => handleShotWing('Forehand')}>Forehand</ChipButton>
                      <ChipButton full className="flex-1" onClick={() => handleShotWing('Backhand')}>Backhand</ChipButton>
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
              <div className="mb-2.5 flex-shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-primary">{pending.shotWing} — Select Shot</div>
              <div className="grid flex-1 grid-cols-2 items-stretch gap-2.5">
                <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                  <div className={colClass('self')}>{playerName('self')}</div>
                  {hitter === 'self' && SHOT_TYPES.map((type) => (
                    <ChipButton key={type} full className="flex-1" onClick={() => handleShotType(type)}>
                      {shotLabel(type)}
                    </ChipButton>
                  ))}
                </div>
                <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
                  <div className={colClass('opp')}>{playerName('opp')}</div>
                  {hitter === 'opp' && SHOT_TYPES.map((type) => (
                    <ChipButton key={type} full className="flex-1" onClick={() => handleShotType(type)}>
                      {shotLabel(type)}
                    </ChipButton>
                  ))}
                </div>
              </div>
            </>
          );
        })()}

        {activeStep === 'shotLocation' && (
          <ShotLocationCourt onComplete={handleShotLocationComplete} />
        )}

        {activeStep === 'errorLocation' && (
          <>
            <div className="mb-2.5 flex-shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-primary">Unforced Error — Where did it go?</div>
            <div className="flex flex-wrap gap-2">
              <ChipButton variant="warn" onClick={() => handleErrorLocation('Long')}>Long</ChipButton>
              <ChipButton variant="warn" onClick={() => handleErrorLocation('Wide')}>Wide</ChipButton>
              <ChipButton variant="warn" onClick={() => handleErrorLocation('Net')}>Net</ChipButton>
            </div>
          </>
        )}

        {activeStep === 'infractionSelect' && (
          <>
            <div className="mb-2.5 flex-shrink-0 font-mono text-xs font-bold uppercase tracking-wider text-primary">Infraction? (Optional)</div>
            <div className="flex flex-wrap gap-2">
              {OTHER_SUB_TYPES.map((sub) => (
                <ChipButton key={sub} className="flex-[1_1_calc(50%-4px)]" onClick={() => commitAndReset({ infraction: sub })}>
                  {sub}
                </ChipButton>
              ))}
              <ChipButton variant="let" full onClick={() => commitAndReset({ infraction: 'none' })}>
                Skip — No Infraction
              </ChipButton>
            </div>
          </>
        )}


      </div>

      <div className="flex flex-shrink-0 items-center justify-between gap-2">
        <Button variant="outline" size="sm" disabled={!canUndo} onClick={onUndo}>↩ Undo last point</Button>
        {confirmDelete ? (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="destructive-solid" size="sm" onClick={onDelete}>Yes, Delete</Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="destructive" size="sm" className="ml-auto" onClick={() => setConfirmDelete(true)}>✕ Delete</Button>
        )}
      </div>
    </div>
  );
}
