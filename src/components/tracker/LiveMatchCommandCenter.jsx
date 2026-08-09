import { useEffect, useMemo, useRef, useState } from 'react';
import { formatGameScore, getNextServeCourtSide } from '../../lib/engine';
import { useOrientation } from '../../hooks/useOrientation';
import LandscapeScoreView from './LandscapeScoreView';
import {
  Undo2, Sparkles, Eye, EyeOff, Zap, Flame,
  TrendingDown, X, Loader2, RefreshCw,
} from 'lucide-react';
import MatchTimingBanners from './MatchTimingBanners';

/**
 * LiveMatchCommandCenter — the persistent context bar that sits above the
 * point-entry UI (QuickMode/Wizard) during a live match. This is the "heart
 * of the app" upgrade: everything a player wants to glance at during a match
 * without switching tabs.
 *
 * Renders:
 *  • Score Hero — big current-game score, sets pill, server chip, duration
 *  • Momentum Strip — last-8 points as dots + "3 in a row" burst
 *  • Point commit flash — full-panel green/red pulse on last commit
 *  • Floating Undo pill (5s window)
 *  • AI Coach one-tap tactical tip (SSE stream, dismissible)
 *  • Changeover countdown at odd-game boundaries
 *  • Distraction-free toggle (hides everything except score + winner buttons)
 */
export default function LiveMatchCommandCenter({
  engine, points, header, sessionType, formatPreset, pointTarget,
  matchStartTime, nextServer,
  onUndo, onOpenAdvisor, onAdvisorTip,
  distractionFree, onToggleDistractionFree,
  pointRestSecsLeft, changeoverActive, changeoverSecsLeft, onDismissChangeover,
  children,
}) {
  // ─── Point commit flash + Floating undo ─────────────────────────────────
  const prevCountRef = useRef(points.length);
  const [flash, setFlash] = useState(null); // 'self' | 'opp' | null
  const [undoVisible, setUndoVisible] = useState(false);
  useEffect(() => {
    if (points.length > prevCountRef.current) {
      const last = points[points.length - 1];
      setFlash(last?.pointWinner || null);
      setUndoVisible(true);
      const flashT = setTimeout(() => setFlash(null), 550);
      const undoT = setTimeout(() => setUndoVisible(false), 5000);
      prevCountRef.current = points.length;
      return () => { clearTimeout(flashT); clearTimeout(undoT); };
    }
    prevCountRef.current = points.length;
  }, [points]);

  // ─── Match duration ─────────────────────────────────────────────────────
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000); // 1s refresh so match-duration ticks live
    return () => clearInterval(t);
  }, []);
  const durationMs = matchStartTime ? now - matchStartTime : 0;
  const durationLabel = formatDuration(durationMs);

  // ─── Score details ──────────────────────────────────────────────────────
  const gameScore = engine ? formatGameScore(engine) : '0-0';
  const setsSelf = engine?.setsWon?.self || 0;
  const setsOpp = engine?.setsWon?.opp || 0;
  const gamesSelf = engine?.setGames?.self || 0;
  const gamesOpp = engine?.setGames?.opp || 0;
  const server = engine?.currentServer || nextServer;
  const courtSide = getNextServeCourtSide(engine); // 'deuce' | 'ad'
  const courtLabel = courtSide === 'ad' ? 'Ad court' : 'Deuce court';

  // ─── Momentum ───────────────────────────────────────────────────────────
  const last8 = points.slice(-8);
  const streakInfo = computeStreak(points);

  // ─── AI Advisor inline panel ────────────────────────────────────────────
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorTip, setAdvisorTip] = useState('');
  const [advisorState, setAdvisorState] = useState('idle');

  async function fetchAdvisor() {
    setAdvisorOpen(true);
    setAdvisorTip('');
    setAdvisorState('streaming');
    let accumulated = '';
    const emitTip = () => {
      const t = accumulated.trim();
      if (t && onAdvisorTip) {
        onAdvisorTip({
          text: t,
          at: Date.now(),
          atPoint: points.length,
          score: `${gameScore} / ${gamesSelf}-${gamesOpp}`,
          side: server,
        });
      }
    };
    try {
      const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL
        || import.meta.env.REACT_APP_BACKEND_URL
        || window.location.origin;
      const recentDesc = last8.slice(-3).map(p => p.pointWinner === 'self' ? 'W' : 'L').join('');
      const res = await fetch(`${backendUrl}/api/advisor/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: `${header.selfName || 'me'}-${header.oppName || 'opp'}-${matchStartTime || Date.now()}`,
          my_name: header.selfName,
          opponent_name: header.oppName,
          my_score: `${gameScore}, ${gamesSelf}-${gamesOpp} in set ${setsSelf + setsOpp + 1}`,
          game_state: `${server === 'self' ? 'serving' : 'receiving'} to the ${courtLabel.toLowerCase()}`,
          recent_form: `Last 3 points: ${recentDesc || 'none yet'}`,
          my_strengths: [header.playingStyle].filter(Boolean),
          opponent_notes: header.opponentNotes || null,
        }),
      });
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
          if (line.startsWith('event: done')) { emitTip(); setAdvisorState('done'); return; }
          if (line.startsWith('event: error')) throw new Error('LLM error');
          if (line.startsWith('data: ')) {
            const chunk = line.slice(6);
            if (chunk === '[DONE]') { emitTip(); setAdvisorState('done'); return; }
            accumulated += chunk;
            setAdvisorTip(prev => prev + chunk);
          }
        }
      }
      emitTip();
      setAdvisorState('done');
    } catch {
      setAdvisorState('error');
    }
  }

  const isBreakPoint = detectBreakPoint(engine);

  // ─── Landscape (big-screen) mode ────────────────────────────────────────
  const { isLandscape, isMobile } = useOrientation();
  const [landscapeDismissed, setLandscapeDismissed] = useState(false);
  // Reset dismissal when portrait resumes so next rotation re-opens the view
  useEffect(() => {
    if (!isLandscape) setLandscapeDismissed(false);
  }, [isLandscape]);
  const showLandscape = isLandscape && isMobile && !landscapeDismissed && !distractionFree;

  if (showLandscape) {
    return (
      <>
        <LandscapeScoreView
          gameScore={gameScore}
          selfName={header.selfName}
          oppName={header.oppName}
          server={server}
          courtSide={courtSide}
          setsSelf={setsSelf}
          setsOpp={setsOpp}
          gamesSelf={gamesSelf}
          gamesOpp={gamesOpp}
          currentSetNumber={setsSelf + setsOpp + 1}
          last8={last8}
          streakInfo={streakInfo}
          isBreakPoint={isBreakPoint}
          durationLabel={durationLabel}
          onExit={() => setLandscapeDismissed(true)}
        />
        {/* Hidden point-entry UI slot so state stays alive underneath */}
        <div className="hidden">{children}</div>
      </>
    );
  }

  // ─── Distraction-free render short-circuit ──────────────────────────────
  // Score/duration/sets live in the persistent Scorebar above (always visible
  // regardless of this toggle) — this mode just strips everything else away
  // so only the score and the point-entry buttons remain.
  if (distractionFree) {
    return (
      <div className="relative flex flex-col gap-3" data-testid="live-command-center-distraction">
        {flash && <CommitFlash winner={flash} />}
        <button
          onClick={onToggleDistractionFree}
          className="relative z-10 self-end text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
          data-testid="distraction-toggle-off"
        >
          <EyeOff className="w-3.5 h-3.5" />Exit focus
        </button>
        <MatchTimingBanners
          pointRestSecsLeft={pointRestSecsLeft}
          changeoverActive={changeoverActive}
          changeoverSecsLeft={changeoverSecsLeft}
          onDismissChangeover={onDismissChangeover}
        />
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 relative" data-testid="live-command-center">
      {/* Momentum + streak/break-point — score/duration/court-side/sets now live in the persistent Scorebar above */}
      {(last8.length > 0 || streakInfo || isBreakPoint) && (
        <div className="relative rounded-xl bg-card border border-border p-3 overflow-hidden">
          {flash && <CommitFlash winner={flash} />}

          {last8.length > 0 && (
            <div className="flex items-center gap-1.5 relative z-10" data-testid="momentum-strip">
              {last8.map((p, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full ${p.pointWinner === 'self' ? 'bg-primary' : 'bg-destructive/70'}`}
                  title={p.pointWinner === 'self' ? 'Won' : 'Lost'}
                />
              ))}
            </div>
          )}

          {(streakInfo || isBreakPoint) && (
            <div className={`relative z-10 flex flex-wrap gap-2 ${last8.length > 0 ? 'mt-2' : ''}`}>
              {streakInfo && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider ${
                    streakInfo.side === 'self' ? 'bg-primary/15 text-accent-ink' : 'bg-destructive/15 text-destructive'
                  }`}
                  data-testid="streak-indicator"
                >
                  {streakInfo.side === 'self' ? <Flame className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {streakInfo.count} in a row
                </span>
              )}
              {isBreakPoint && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-500 animate-pulse">
                  <Zap className="w-3 h-3" />Break point
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <MatchTimingBanners
        pointRestSecsLeft={pointRestSecsLeft}
        changeoverActive={changeoverActive}
        changeoverSecsLeft={changeoverSecsLeft}
        onDismissChangeover={onDismissChangeover}
      />

      {/* AI Advisor inline card */}
      {advisorOpen && (
        <div className="rounded-xl bg-primary/5 border-l-4 border-l-primary p-3" data-testid="advisor-inline">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-accent-ink shrink-0 mt-0.5" strokeWidth={2.2} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[12px] uppercase tracking-widest font-bold text-accent-ink">AI Coach</span>
                <div className="flex items-center gap-2">
                  {advisorState === 'done' && (
                    <button onClick={fetchAdvisor} className="text-[11px] font-bold text-accent-ink hover:underline inline-flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />New
                    </button>
                  )}
                  <button onClick={() => setAdvisorOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-sm italic leading-relaxed min-h-[20px]" data-testid="advisor-inline-tip">
                {advisorTip || (advisorState === 'streaming' ? '…' : '')}
                {advisorState === 'streaming' && <span className="inline-block w-1 h-4 bg-primary/70 ml-0.5 align-middle animate-pulse" />}
              </div>
              {advisorState === 'error' && <div className="text-xs text-destructive font-semibold mt-1">Advisor unavailable</div>}
            </div>
          </div>
        </div>
      )}

      {/* Point entry UI slot */}
      {children}

      {/* Quick actions strip */}
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={fetchAdvisor}
          className="flex-1 rounded-full bg-primary/10 text-accent-ink text-xs font-bold py-2 inline-flex items-center justify-center gap-1.5 hover:bg-primary/20 active:scale-[0.98] transition-all"
          data-testid="advisor-quick-btn"
          disabled={advisorState === 'streaming'}
        >
          {advisorState === 'streaming' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Ask coach
        </button>
        <button
          onClick={onToggleDistractionFree}
          className="rounded-full border border-border text-muted-foreground text-xs font-bold py-2 px-3 inline-flex items-center justify-center gap-1.5 hover:text-foreground hover:border-foreground/40 transition-colors"
          title="Focus mode — hide extras"
          data-testid="distraction-toggle-on"
        >
          <Eye className="w-3.5 h-3.5" />Focus
        </button>
      </div>

      {/* Floating Undo pill (last-commit window) */}
      {undoVisible && (
        <button
          onClick={() => { onUndo(); setUndoVisible(false); }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 rounded-full bg-slate-900 text-white px-4 py-2.5 shadow-lg shadow-slate-900/40 inline-flex items-center gap-2 text-sm font-bold animate-[fadeUp_240ms_ease-out]"
          data-testid="floating-undo-pill"
        >
          <Undo2 className="w-4 h-4" />
          Undo last point
        </button>
      )}
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}</style>
    </div>
  );
}

// ─── Commit flash overlay ─────────────────────────────────────────────────
function CommitFlash({ winner }) {
  return (
    <div
      key={winner + Date.now()}
      className="absolute inset-0 pointer-events-none z-0 animate-[commitFlash_550ms_ease-out]"
      style={{ background: winner === 'self' ? 'var(--color-primary)' : '#ef4444', opacity: 0 }}
    >
      <style>{`
        @keyframes commitFlash {
          0% { opacity: 0.28; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatDuration(ms) {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(totalSec % 60).padStart(2, '0')}`;
}

function computeStreak(points) {
  if (points.length < 2) return null;
  const last = points[points.length - 1].pointWinner;
  let count = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].pointWinner === last) count += 1;
    else break;
  }
  return count >= 2 ? { side: last, count } : null;
}

function detectBreakPoint(engine) {
  if (!engine || engine.inTiebreak) return false;
  const server = engine.currentServer;
  const receiver = server === 'self' ? 'opp' : 'self';
  const rPts = engine.gamePts[receiver];
  const sPts = engine.gamePts[server];
  // Receiver at 40 with server at 0/15/30, or receiver has advantage
  return (rPts >= 3 && rPts > sPts);
}
