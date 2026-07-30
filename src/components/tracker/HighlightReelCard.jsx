import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Trophy, Flame, Share2, Download, Loader2, RefreshCw } from 'lucide-react';

/**
 * HighlightReelCard — the shareable post-match summary card.
 * Auto-generated when the match ends. Shows:
 *  • Final score
 *  • Longest winning + losing streaks (biggest momentum swings)
 *  • Key AI tips shown during the match (dedup, keep the last 3)
 *  • An AI narrative recap streamed from POST /api/advisor/highlight-reel
 *  • Save (canvas image) + Native share
 */
export default function HighlightReelCard({
  header,
  points,
  sets,
  winnerName,
  isSelfWin,
  matchStartTime,
  matchEndTime,
  advisorHistory,   // array of { text, at, side }
  onDone,           // parent callback after generation completes (optional)
}) {
  const selfName = header?.selfName || 'You';
  const oppName = header?.oppName || 'Opponent';

  const finalScore = useMemo(
    () => (sets || []).map((s) =>
      s.isMatchTiebreak ? `[${s.tb.self}-${s.tb.opp}]` : `${s.self}-${s.opp}`
    ).join('  '),
    [sets],
  );

  const swings = useMemo(() => computeMomentumSwings(points), [points]);
  const uniqueTips = useMemo(() => dedupeTips(advisorHistory).slice(-3), [advisorHistory]);
  const durationLabel = useMemo(() => {
    if (!matchStartTime) return '';
    const ms = (matchEndTime || Date.now()) - matchStartTime;
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  }, [matchStartTime, matchEndTime]);

  const [recap, setRecap] = useState('');
  const [state, setState] = useState('idle'); // idle | streaming | done | error
  const startedRef = useRef(false);

  async function fetchRecap() {
    setRecap('');
    setState('streaming');
    try {
      const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL
        || import.meta.env.REACT_APP_BACKEND_URL
        || window.location.origin;
      const res = await fetch(`${backendUrl}/api/advisor/highlight-reel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: `${selfName}-${oppName}-${matchStartTime || Date.now()}-reel`,
          my_name: selfName,
          opponent_name: oppName,
          i_won: !!isSelfWin,
          final_score: finalScore,
          duration: durationLabel,
          points_played: points.length,
          longest_win_streak: swings.longestWin,
          longest_loss_streak: swings.longestLoss,
          key_tips: uniqueTips.map((t) => t.text),
        }),
      });
      if (!res.ok || !res.body) throw new Error('Backend error');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: done')) { setState('done'); onDone?.(); return; }
          if (line.startsWith('event: error')) throw new Error('LLM error');
          if (line.startsWith('data: ')) {
            const chunk = line.slice(6);
            if (chunk === '[DONE]') { setState('done'); onDone?.(); return; }
            setRecap((prev) => prev + chunk.replace(/\\n/g, '\n'));
          }
        }
      }
      setState('done');
      onDone?.();
    } catch {
      setState('error');
    }
  }

  // Auto-generate on mount, once
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    fetchRecap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardRef = useRef(null);

  async function handleShare() {
    const text = buildShareText({ selfName, oppName, winnerName, finalScore, recap, uniqueTips });
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My Tennis Match', text });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* user cancelled */
    }
  }

  async function handleDownload() {
    // Fallback text download — no canvas dep needed for the P0 ship.
    const text = buildShareText({ selfName, oppName, winnerName, finalScore, recap, uniqueTips });
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `match-${selfName}-vs-${oppName}.txt`.replace(/\s+/g, '_');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div
      ref={cardRef}
      className="rounded-2xl bg-card border border-border overflow-hidden shadow-lg"
      data-testid="highlight-reel-card"
    >
      {/* Hero band */}
      <div className={`px-5 py-6 ${isSelfWin ? 'bg-primary/10' : 'bg-destructive/5'} border-b border-border`}>
        <div className="flex items-center gap-2 mb-2">
          <Trophy className={`w-4 h-4 ${isSelfWin ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            Match highlight reel
          </span>
        </div>
        <div className={`font-display font-black text-3xl tracking-tighter ${isSelfWin ? 'text-primary' : 'text-foreground'}`}>
          {winnerName} wins
        </div>
        <div className="mt-1 font-mono text-sm text-muted-foreground">
          {selfName} <span className="text-foreground/70">vs</span> {oppName}
        </div>
        <div className="mt-3 font-mono text-lg font-bold tracking-tight" data-testid="highlight-final-score">
          {finalScore || '—'}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {durationLabel && `${durationLabel} · `}{points.length} points played
        </div>
      </div>

      {/* Swings */}
      <div className="grid grid-cols-2 gap-0 border-b border-border">
        <div className="p-4 border-r border-border" data-testid="swing-win">
          <div className="flex items-center gap-1 text-primary mb-1">
            <Flame className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-widest font-bold">Best run</span>
          </div>
          <div className="font-display font-black text-2xl">{swings.longestWin}</div>
          <div className="text-[11px] text-muted-foreground">points in a row won</div>
        </div>
        <div className="p-4" data-testid="swing-loss">
          <div className="flex items-center gap-1 text-destructive mb-1">
            <span className="text-[10px] uppercase tracking-widest font-bold">Tough patch</span>
          </div>
          <div className="font-display font-black text-2xl">{swings.longestLoss}</div>
          <div className="text-[11px] text-muted-foreground">points in a row lost</div>
        </div>
      </div>

      {/* AI recap */}
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 text-primary">
            <Sparkles className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-widest font-bold">AI recap</span>
          </div>
          {state === 'done' && (
            <button
              onClick={fetchRecap}
              className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1"
              data-testid="highlight-regen-btn"
            >
              <RefreshCw className="w-3 h-3" />Regenerate
            </button>
          )}
        </div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap min-h-[48px]" data-testid="highlight-recap">
          {recap || (state === 'streaming' ? '…' : state === 'error' ? '' : '')}
          {state === 'streaming' && (
            <span className="inline-block w-1 h-4 bg-primary/70 ml-0.5 align-middle animate-pulse" />
          )}
        </div>
        {state === 'error' && (
          <div className="text-xs text-destructive font-semibold">Recap unavailable. <button onClick={fetchRecap} className="underline">Retry</button></div>
        )}
        {state === 'streaming' && (
          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />Writing your recap…
          </div>
        )}

        {uniqueTips.length > 0 && (
          <div className="pt-3 border-t border-border/60">
            <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Coach tips during the match</div>
            <ul className="space-y-1.5">
              {uniqueTips.map((tip, i) => (
                <li key={i} className="text-xs italic text-foreground/80 leading-relaxed" data-testid={`highlight-tip-${i}`}>
                  “{tip.text.trim()}”
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-0 border-t border-border">
        <button
          onClick={handleShare}
          className="py-3 inline-flex items-center justify-center gap-2 text-sm font-bold text-primary hover:bg-primary/5 border-r border-border"
          data-testid="highlight-share-btn"
        >
          <Share2 className="w-4 h-4" />Share
        </button>
        <button
          onClick={handleDownload}
          className="py-3 inline-flex items-center justify-center gap-2 text-sm font-bold text-foreground hover:bg-muted/40"
          data-testid="highlight-download-btn"
        >
          <Download className="w-4 h-4" />Save
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function computeMomentumSwings(points) {
  let longestWin = 0, longestLoss = 0;
  let curWin = 0, curLoss = 0;
  for (const p of points) {
    if (p.pointWinner === 'self') {
      curWin += 1; longestWin = Math.max(longestWin, curWin); curLoss = 0;
    } else {
      curLoss += 1; longestLoss = Math.max(longestLoss, curLoss); curWin = 0;
    }
  }
  return { longestWin, longestLoss };
}

function dedupeTips(history) {
  if (!Array.isArray(history)) return [];
  const seen = new Set();
  const out = [];
  for (const t of history) {
    const key = (t.text || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function buildShareText({ selfName, oppName, winnerName, finalScore, recap, uniqueTips }) {
  const lines = [
    `🎾 ${selfName} vs ${oppName}`,
    `🏆 ${winnerName} wins ${finalScore}`,
    '',
    recap ? recap.trim() : '',
  ];
  if (uniqueTips.length > 0) {
    lines.push('', 'Coach whispered:');
    uniqueTips.forEach((t) => lines.push(`• ${t.text.trim()}`));
  }
  lines.push('', 'Tracked on Tennis Tracker Pro');
  return lines.filter(Boolean).join('\n');
}
