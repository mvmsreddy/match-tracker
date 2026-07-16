import { useState, useEffect } from 'react';
import { LOCATIONS } from '../lib/constants';
import {
  freshPending, buildPointEntry, strokeOptionsFor, outcomeReason, OUTCOME_OPTIONS,
} from '../lib/wizardLogic';

const RALLY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

export default function Wizard({ nextServer, onServerChange, onCommit, onUndo, canUndo }) {
  const [pending, setPending] = useState(() => freshPending(nextServer));

  // Keep the wizard's server in sync with the engine's suggestion (e.g. after undo)
  useEffect(() => {
    setPending((p) => (p.server === nextServer ? p : freshPending(nextServer)));
  }, [nextServer]);

  function chooseServer(server) {
    onServerChange(server);
    setPending(freshPending(server));
  }

  function chooseFirstServe(choice) {
    if (choice === 'in') {
      setPending((p) => ({ ...p, firstServeChoice: 'in', serveResult: '1st', firstFaultLocation: null }));
    } else {
      setPending((p) => ({ ...p, firstServeChoice: 'fault', outcome: null, stroke: null, shotType: null, side: null, location: null, rally: null }));
    }
  }

  function chooseFirstFaultLocation(loc) {
    setPending((p) => ({ ...p, firstFaultLocation: loc }));
  }

  function chooseSecondServe(choice) {
    if (choice === 'DF') {
      setPending((p) => ({ ...p, secondServeChoice: 'DF', serveResult: 'DF' }));
    } else {
      setPending((p) => ({ ...p, secondServeChoice: '2nd', serveResult: '2nd' }));
    }
  }

  function chooseDfLocation(loc) {
    const entry = buildPointEntry({ ...pending, dfLocation: loc });
    onCommit(entry);
    setPending(freshPending(pending.server));
  }

  function chooseOutcome(outcome) {
    setPending((p) => ({ ...p, outcome, shotType: null, side: null, stroke: null, isReturn: false, location: null, rally: null }));
  }

  function chooseShotType(shotType) {
    if (shotType === 'Serve') {
      setPending((p) => ({ ...p, shotType, side: null, stroke: 'Serve', isReturn: false }));
    } else {
      setPending((p) => ({ ...p, shotType, side: null, stroke: null }));
    }
  }

  function chooseSide(side) {
    setPending((p) => ({ ...p, side, stroke: p.shotType + ' ' + side }));
  }

  function toggleReturn() {
    setPending((p) => ({ ...p, isReturn: !p.isReturn }));
  }

  function chooseLocation(loc) {
    setPending((p) => ({ ...p, location: loc }));
  }

  function chooseRally(n) {
    const entry = buildPointEntry({ ...pending, rally: n });
    onCommit(entry);
    setPending(freshPending(pending.server));
  }

  const { opts: strokeOpts, endedBy } = pending.outcome ? strokeOptionsFor(pending.outcome, pending.server) : { opts: [], endedBy: null };
  const isReceiverShot = pending.outcome ? endedBy !== pending.server : false;
  const reason = pending.outcome ? outcomeReason(pending.outcome) : null;

  const showFirstFaultLocation = pending.firstServeChoice === 'fault' && !pending.firstFaultLocation;
  const showSecondServe = pending.firstServeChoice === 'fault' && !!pending.firstFaultLocation;
  const showDfLocation = pending.secondServeChoice === 'DF';
  const showOutcome = pending.serveResult === '1st' || pending.serveResult === '2nd';
  const showStroke = showOutcome && !!pending.outcome;
  const showSideRow = showStroke && pending.shotType && pending.shotType !== 'Serve';
  const showReturnToggle = showStroke && pending.stroke && isReceiverShot && pending.stroke !== 'Serve';
  const showLocation = showStroke && !!pending.stroke && (reason === 'ForcedError' || reason === 'UnforcedError');
  const showRally = showStroke && !!pending.stroke && (reason === 'Winner' || !!pending.location);

  return (
    <div className="wizard">
      <div className="server-toggle">
        <div className={'chip' + (pending.server === 'self' ? ' selected' : '')} onClick={() => chooseServer('self')}>Self serving</div>
        <div className={'chip' + (pending.server === 'opp' ? ' selected' : '')} onClick={() => chooseServer('opp')}>Opponent serving</div>
      </div>

      <div>
        <div className="wizard-title">Step 1 &middot; First serve</div>
        <div className="chip-row">
          <div className={'chip' + (pending.firstServeChoice === 'in' ? ' selected' : '')} onClick={() => chooseFirstServe('in')}>1st serve in</div>
          <div className={'chip warn' + (pending.firstServeChoice === 'fault' ? ' selected' : '')} onClick={() => chooseFirstServe('fault')}>1st serve fault</div>
        </div>
      </div>

      {showFirstFaultLocation && (
        <div>
          <div className="wizard-title">Where did the 1st serve miss?</div>
          <div className="chip-row">
            {LOCATIONS.map((loc) => (
              <div key={loc} className="chip" onClick={() => chooseFirstFaultLocation(loc)}>{loc}</div>
            ))}
          </div>
        </div>
      )}

      {showSecondServe && (
        <div>
          <div className="wizard-title">Second serve</div>
          <div className="chip-row">
            <div className={'chip' + (pending.secondServeChoice === '2nd' ? ' selected' : '')} onClick={() => chooseSecondServe('2nd')}>2nd serve in</div>
            <div className={'chip warn' + (pending.secondServeChoice === 'DF' ? ' selected' : '')} onClick={() => chooseSecondServe('DF')}>Double fault</div>
          </div>
        </div>
      )}

      {showDfLocation && (
        <div>
          <div className="wizard-title">Where did the 2nd serve miss?</div>
          <div className="chip-row">
            {LOCATIONS.map((loc) => (
              <div key={loc} className="chip" onClick={() => chooseDfLocation(loc)}>{loc}</div>
            ))}
          </div>
        </div>
      )}

      {showOutcome && (
        <div>
          <div className="wizard-title">Step 2 &middot; What happened</div>
          <div className="chip-row">
            {OUTCOME_OPTIONS.map((o) => (
              <div key={o.value} className={'chip wide' + (pending.outcome === o.value ? ' selected' : '')} onClick={() => chooseOutcome(o.value)}>{o.label}</div>
            ))}
          </div>
        </div>
      )}

      {showStroke && (
        <div>
          <div className="wizard-title">Step 3 &middot; Shot type</div>
          <div className="chip-row">
            {strokeOpts.map((s) => (
              <div key={s} className={'chip' + (pending.shotType === s ? ' selected' : '')} onClick={() => chooseShotType(s)}>{s}</div>
            ))}
          </div>
          {showSideRow && (
            <div style={{ marginTop: 10 }}>
              <div className="chip-row">
                {['Forehand', 'Backhand'].map((side) => (
                  <div key={side} className={'chip' + (pending.side === side ? ' selected' : '')} onClick={() => chooseSide(side)}>{side}</div>
                ))}
              </div>
            </div>
          )}
          {showReturnToggle && (
            <div className="toggle-inline">
              <span>Was this the return of serve?</span>
              <div className={'chip' + (pending.isReturn ? ' selected' : '')} onClick={toggleReturn}>Yes, return shot</div>
            </div>
          )}
        </div>
      )}

      {showLocation && (
        <div>
          <div className="wizard-title">Step 4 &middot; Error location</div>
          <div className="chip-row">
            {LOCATIONS.map((loc) => (
              <div key={loc} className={'chip' + (pending.location === loc ? ' selected' : '')} onClick={() => chooseLocation(loc)}>{loc}</div>
            ))}
          </div>
        </div>
      )}

      {showRally && (
        <div>
          <div className="wizard-title">Step 5 &middot; Rally length (shots)</div>
          <div className="chip-row">
            {RALLY_OPTIONS.map((n) => (
              <div key={n} className="chip" onClick={() => chooseRally(n)}>{n === 7 ? '7+' : n}</div>
            ))}
          </div>
        </div>
      )}

      <div className="undo-bar">
        <button className="undo-btn" disabled={!canUndo} onClick={onUndo}>&#8634; Undo last point</button>
      </div>
    </div>
  );
}
