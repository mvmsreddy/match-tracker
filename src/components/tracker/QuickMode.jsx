import { useState } from 'react';
import { other } from '../../lib/engine';

// Quick Mode — the fast point-entry flow: two huge WON THE POINT buttons + a
// row of quick-tag chips, alongside (not replacing) the existing step-by-step
// Wizard. Optionally tap a chip first to tag *why* the point ended
// (Winner/Forced/Unforced/Net cord highlight, no commit yet), then tap WON
// THE POINT to commit — or skip the chip entirely for the fastest possible
// one-tap entry. Ace/Double fault commit immediately since who wins is never
// ambiguous for those two.
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

const chipCls = (active) =>
  `cursor-pointer border font-tt-display font-semibold text-sm px-2 py-3 rounded-tt min-h-[46px] ${
    active ? 'border-tt-brand bg-tt-brand/15 text-tt-brand' : 'border-tt-border bg-tt-surface-2 text-tt-foreground'
  }`;

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
    <div className="flex flex-col gap-3 bg-tt-surface border border-tt-border rounded-tt p-4">
      <div className="font-tt-mono text-[0.66rem] tracking-wide uppercase text-tt-muted-foreground">
        Tap a tag to describe the point, then who won it — or skip straight to WON THE POINT
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => wonThePoint('self')} className="rounded-tt min-h-[88px] p-4 font-tt-display font-extrabold text-lg tracking-tight bg-tt-brand text-tt-background">
          {selfName}
          <div className="font-tt-mono font-medium text-[0.62rem] tracking-[0.1em] mt-2 opacity-75">Won the point</div>
        </button>
        <button onClick={() => wonThePoint('opp')} className="rounded-tt min-h-[88px] p-4 font-tt-display font-extrabold text-lg tracking-tight bg-tt-surface-2 text-tt-foreground">
          {oppName}
          <div className="font-tt-mono font-medium text-[0.62rem] tracking-[0.1em] mt-2 opacity-75">Won the point</div>
        </button>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))' }}>
        <button onClick={commitAce} className={chipCls(false)}>Ace</button>
        {QUICK_TAGS.map(tag => (
          <button
            key={tag}
            className={chipCls(pendingTag === tag)}
            onClick={() => setPendingTag(prev => (prev === tag ? null : tag))}
          >
            {tag}
          </button>
        ))}
        <button onClick={commitDoubleFault} className={chipCls(false)}>Double fault</button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex-1 cursor-pointer border border-tt-border bg-transparent text-tt-muted-foreground font-tt-display font-semibold text-sm p-3 rounded-tt min-h-[46px] disabled:opacity-40 disabled:cursor-default"
        >
          Undo last point
        </button>
        <button
          onClick={handleEndMatch}
          className="flex-1 cursor-pointer border border-tt-destructive bg-tt-destructive-bg text-tt-destructive font-tt-display font-semibold text-sm p-3 rounded-tt min-h-[46px]"
        >
          End match
        </button>
      </div>
    </div>
  );
}
