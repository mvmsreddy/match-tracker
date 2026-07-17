import { useState, useEffect, useRef } from 'react';
import { LOCATIONS } from '../lib/constants';
import {
  freshPending, buildPointEntry, strokeOptionsFor, outcomeReason, OUTCOME_OPTIONS,
} from '../lib/wizardLogic';

const RALLY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

function outcomeChipClass(value) {
  return ['self-winner', 'self-forced', 'opp-unforced'].includes(value) ? 'self-pt' : 'opp-pt';
}

/** Combines shot type + side into a single tap. Serve stays standalone. */
function buildStrokeOptions(strokeOpts) {
  const result = [];
  for (const type of strokeOpts) {
    if (type === 'Serve') {
      result.push({ label: 'Serve', shotType: 'Serve', side: null, stroke: 'Serve', fullWidth: true });
    } else {
      const short = type === 'Passing Shot' ? 'Pass' : type === 'Dropshot' ? 'Drop' : type;
      result.push({ label: short + ' FH', shotType: type, side: 'Forehand', stroke: type + ' Forehand', fullWidth: false });
      result.push({ label: short + ' BH', shotType: type, side: 'Backhand', stroke: type + ' Backhand', fullWidth: false });
    }
  }
  return result;
}

export default function Wizard({ nextServer, onServerChange, onCommit, onUndo, canUndo }) {
  const [pending, setPending] = useState(() => freshPending(nextServer));
  const stepCardRef = useRef(null);
  const prevActiveStep = useRef(null);

  useEffect(() => {
    setPending((p) => (p.server === nextServer ? p : freshPending(nextServer)));
  }, [nextServer]);

  // Derive active step first so we can use it in the scroll effect
  const { opts: strokeOpts, endedBy } = pending.outcome
    ? strokeOptionsFor(pending.outcome, pending.server)
    : { opts: [], endedBy: null };
  const isReceiverShot = pending.outcome ? endedBy !== pending.server : false;
  const reason = pending.outcome ? outcomeReason(pending.outcome) : null;
  const showReturnToggle = !!(pending.stroke && isReceiverShot && pending.stroke !== 'Serve');

  let activeStep;
  if (!pending.firstServeChoice) {
    activeStep = 'firstServe';
  } else if (pending.firstServeChoice === 'fault' && !pending.firstFaultLocation) {
    activeStep = 'firstFaultLoc';
  } else if (pending.firstServeChoice === 'fault' && !pending.secondServeChoice) {
    activeStep = 'secondServe';
  } else if (pending.secondServeChoice === 'DF') {
    activeStep = 'dfLoc';
  } else if (!pending.outcome) {
    activeStep = 'outcome';
  } else if (!pending.stroke) {
    activeStep = 'stroke';
  } else if ((reason === 'ForcedError' || reason === 'UnforcedError') && !pending.location) {
    activeStep = 'location';
  } else {
    activeStep = 'rally';
  }

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

  function chooseFirstServe(choice) {
    if (choice === 'in') {
      setPending((p) => ({ ...freshPending(p.server), firstServeChoice: 'in', serveResult: '1st' }));
    } else {
      setPending((p) => ({ ...freshPending(p.server), firstServeChoice: 'fault' }));
    }
  }

  function chooseFirstFaultLocation(loc) {
    setPending((p) => ({ ...p, firstFaultLocation: loc }));
  }

  function chooseSecondServe(choice) {
    if (choice === 'DF') {
      setPending((p) => ({
        ...freshPending(p.server),
        firstServeChoice: p.firstServeChoice, firstFaultLocation: p.firstFaultLocation,
        secondServeChoice: 'DF', serveResult: 'DF',
      }));
    } else {
      setPending((p) => ({
        ...freshPending(p.server),
        firstServeChoice: p.firstServeChoice, firstFaultLocation: p.firstFaultLocation,
        secondServeChoice: '2nd', serveResult: '2nd',
      }));
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

  function chooseStroke(shotType, side) {
    const stroke = side ? shotType + ' ' + side : shotType;
    setPending((p) => ({ ...p, shotType, side, stroke }));
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

  // Build breadcrumb summary of completed choices
  const summaryParts = [];
  if (pending.firstServeChoice === 'in') {
    summaryParts.push('1st in');
  } else if (pending.firstServeChoice === 'fault') {
    summaryParts.push('1st fault' + (pending.firstFaultLocation ? ' · ' + pending.firstFaultLocation : ''));
    if (pending.secondServeChoice === '2nd') summaryParts.push('2nd in');
    else if (pending.secondServeChoice === 'DF') summaryParts.push('Double Fault');
  }
  if (pending.outcome) {
    const lbl = OUTCOME_OPTIONS.find((o) => o.value === pending.outcome)?.label;
    if (lbl) summaryParts.push(lbl);
  }
  if (pending.stroke) summaryParts.push(pending.stroke);
  if (pending.location) summaryParts.push(pending.location);

  const strokeOptions = strokeOpts.length ? buildStrokeOptions(strokeOpts) : [];

  const stepLabels = {
    firstServe: 'First serve',
    firstFaultLoc: '1st serve — where?',
    secondServe: 'Second serve',
    dfLoc: '2nd serve — where?',
    outcome: 'What happened?',
    stroke: 'Shot type',
    location: 'Error location',
    rally: 'Rally length (shots)',
  };

  return (
    <div className="wizard">
      {/* Server toggle — always visible at top */}
      <div className="server-toggle">
        <div className={'chip server-chip' + (pending.server === 'self' ? ' selected' : '')} onClick={() => chooseServer('self')}>
          Self serving
        </div>
        <div className={'chip server-chip' + (pending.server === 'opp' ? ' selected' : '')} onClick={() => chooseServer('opp')}>
          Opp serving
        </div>
      </div>

      {/* Breadcrumb — shows what's been logged so far */}
      {summaryParts.length > 0 && (
        <div className="wizard-breadcrumb">
          {summaryParts.join(' → ')}
        </div>
      )}

      {/* Active step card — only the current step */}
      <div className="wizard-step-card" ref={stepCardRef}>
        <div className="wizard-step-label">{stepLabels[activeStep]}</div>

        {activeStep === 'firstServe' && (
          <div className="chip-row">
            <div className="chip chip-lg chip-action" onClick={() => chooseFirstServe('in')}>1st in ✓</div>
            <div className="chip chip-lg warn" onClick={() => chooseFirstServe('fault')}>Fault</div>
          </div>
        )}

        {activeStep === 'firstFaultLoc' && (
          <div className="chip-row">
            {LOCATIONS.map((loc) => (
              <div key={loc} className="chip chip-lg" onClick={() => chooseFirstFaultLocation(loc)}>{loc}</div>
            ))}
          </div>
        )}

        {activeStep === 'secondServe' && (
          <div className="chip-row">
            <div className="chip chip-lg chip-action" onClick={() => chooseSecondServe('2nd')}>2nd in ✓</div>
            <div className="chip chip-lg warn" onClick={() => chooseSecondServe('DF')}>Double Fault</div>
          </div>
        )}

        {activeStep === 'dfLoc' && (
          <div className="chip-row">
            {LOCATIONS.map((loc) => (
              <div key={loc} className="chip chip-lg" onClick={() => chooseDfLocation(loc)}>{loc}</div>
            ))}
          </div>
        )}

        {activeStep === 'outcome' && (
          <div className="chip-row chip-grid-2">
            {OUTCOME_OPTIONS.map((o) => (
              <div
                key={o.value}
                className={'chip chip-lg ' + outcomeChipClass(o.value)}
                onClick={() => chooseOutcome(o.value)}
              >
                {o.label}
              </div>
            ))}
          </div>
        )}

        {activeStep === 'stroke' && (
          <div className="chip-row chip-grid-2">
            {strokeOptions.map((s, i) => (
              <div
                key={i}
                className={'chip chip-lg' + (s.fullWidth ? ' chip-full' : '')}
                onClick={() => chooseStroke(s.shotType, s.side)}
              >
                {s.label}
              </div>
            ))}
          </div>
        )}

        {activeStep === 'location' && (
          <>
            {showReturnToggle && (
              <div className="toggle-inline" style={{ marginBottom: 12 }}>
                <span>Return of serve?</span>
                <div className={'chip' + (pending.isReturn ? ' selected' : '')} onClick={toggleReturn}>
                  {pending.isReturn ? 'Yes ✓' : 'No'}
                </div>
              </div>
            )}
            <div className="chip-row">
              {LOCATIONS.map((loc) => (
                <div key={loc} className="chip chip-lg" onClick={() => chooseLocation(loc)}>{loc}</div>
              ))}
            </div>
          </>
        )}

        {activeStep === 'rally' && (
          <>
            {showReturnToggle && (
              <div className="toggle-inline" style={{ marginBottom: 12 }}>
                <span>Return of serve?</span>
                <div className={'chip' + (pending.isReturn ? ' selected' : '')} onClick={toggleReturn}>
                  {pending.isReturn ? 'Yes ✓' : 'No'}
                </div>
              </div>
            )}
            <div className="chip-row chip-grid-rally">
              {RALLY_OPTIONS.map((n) => (
                <div key={n} className="chip chip-lg" onClick={() => chooseRally(n)}>
                  {n === 7 ? '7+' : n}
                </div>
              ))}
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
