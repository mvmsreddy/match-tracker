import { useState } from 'react';
import { other } from '../../lib/engine';

// Quick Mode — the "Navy" design system's fast point-entry flow: two huge
// WON THE POINT buttons + a row of quick-tag chips, alongside (not replacing)
// the existing step-by-step Wizard. Optionally tap a chip first to tag *why*
// the point ended (Winner/Forced/Unforced/Net cord highlight, no commit yet),
// then tap WON THE POINT to commit — or skip the chip entirely for the
// fastest possible one-tap entry. Ace/Double fault commit immediately since
// who wins is never ambiguous for those two.
//
// Produces the same point-entry shape src/lib/wizardLogic.js's buildPointEntry
// does, so it feeds the exact same engine/analytics pipeline as the Wizard —
// this is a different entry UI over the same data model, not a new one.
const QUICK_TAGS = ['Winner', 'Forced', 'Unforced', 'Net cord'];

function baseEntry(server, overrides) {
  return {
    server,
    serveResult: '1st',
    firstFaultLocation: null,
    location: null,
    isReturn: false,
    rally: 1,
    ...overrides,
  };
}

export default function QuickMode({ nextServer, onCommit, onUndo, canUndo, selfName, oppName, onEndMatch }) {
  const [pendingTag, setPendingTag] = useState(null);

  function commitAce() {
    onCommit(baseEntry(nextServer, {
      endedBy: nextServer, reason: 'Winner', stroke: 'Serve', rally: 0, pointWinner: nextServer,
    }));
    setPendingTag(null);
  }

  function commitDoubleFault() {
    const receiver = other(nextServer);
    onCommit(baseEntry(nextServer, {
      serveResult: 'DF', endedBy: nextServer, reason: 'DoubleFault', stroke: 'Serve', rally: 0, pointWinner: receiver,
    }));
    setPendingTag(null);
  }

  function wonThePoint(winner) {
    const loser = other(winner);
    let reason = 'Winner', stroke = 'Point', endedBy = winner;
    if (pendingTag === 'Winner') { reason = 'Winner'; stroke = 'Winner'; endedBy = winner; }
    else if (pendingTag === 'Forced') { reason = 'ForcedError'; stroke = 'Forced Error'; endedBy = loser; }
    else if (pendingTag === 'Unforced') { reason = 'UnforcedError'; stroke = 'Unforced Error'; endedBy = loser; }
    else if (pendingTag === 'Net cord') { reason = 'Winner'; stroke = 'Net Cord'; endedBy = winner; }
    onCommit(baseEntry(nextServer, { endedBy, reason, stroke, pointWinner: winner }));
    setPendingTag(null);
  }

  function handleEndMatch() {
    if (window.confirm('End this match now?')) onEndMatch();
  }

  return (
    <div className="qm-panel">
      <div className="qm-step-label">Tap a tag to describe the point, then who won it — or skip straight to WON THE POINT</div>

      <div className="qm-win-grid">
        <button className="qm-win-btn qm-win-self" onClick={() => wonThePoint('self')}>
          {selfName}
          <div className="qm-win-sub">WON THE POINT</div>
        </button>
        <button className="qm-win-btn qm-win-opp" onClick={() => wonThePoint('opp')}>
          {oppName}
          <div className="qm-win-sub">WON THE POINT</div>
        </button>
      </div>

      <div className="qm-chip-row">
        <button className="qm-chip" onClick={commitAce}>Ace</button>
        {QUICK_TAGS.map(tag => (
          <button
            key={tag}
            className={`qm-chip${pendingTag === tag ? ' active' : ''}`}
            onClick={() => setPendingTag(prev => (prev === tag ? null : tag))}
          >
            {tag}
          </button>
        ))}
        <button className="qm-chip" onClick={commitDoubleFault}>Double fault</button>
      </div>

      <div className="qm-footer-row">
        <button className="qm-footer-btn" onClick={onUndo} disabled={!canUndo}>Undo last point</button>
        <button className="qm-footer-btn qm-footer-danger" onClick={handleEndMatch}>End match</button>
      </div>
    </div>
  );
}
