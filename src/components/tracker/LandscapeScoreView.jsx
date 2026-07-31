import { Minimize2, Flame, TrendingDown, Zap } from 'lucide-react';

/**
 * LandscapeScoreView — a giant, court-readable score panel that fills the
 * viewport when the phone is rotated to landscape. Coaches, parents or the
 * player himself sitting on the bench can read it from across the court.
 *
 * Kept intentionally minimal: only score, sets, server + court side chip,
 * a compact momentum strip, and a discreet "exit" button. Point-entry UI
 * is deliberately hidden — landscape is a spectator view.
 */
export default function LandscapeScoreView({
  gameScore,
  selfName,
  oppName,
  server,
  courtSide,          // 'deuce' | 'ad'
  setsSelf,
  setsOpp,
  gamesSelf,
  gamesOpp,
  currentSetNumber,
  last8,
  streakInfo,
  isBreakPoint,
  durationLabel,
  onExit,
}) {
  const serverName = server === 'self' ? (selfName || 'You') : (oppName || 'Opp');
  const courtLabel = courtSide === 'ad' ? 'Ad court' : 'Deuce court';

  return (
    <div
      className="fixed inset-0 z-[60] bg-background flex flex-col p-4 sm:p-6"
      data-testid="landscape-score-view"
    >
      {/* Top bar: names + exit */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-4 font-mono text-xs uppercase tracking-widest">
          <span className={server === 'self' ? 'text-primary font-bold' : 'text-muted-foreground'}>
            ● {selfName || 'You'}
          </span>
          <span className="text-muted-foreground">vs</span>
          <span className={server === 'opp' ? 'text-destructive font-bold' : 'text-muted-foreground'}>
            {oppName || 'Opp'} {server === 'opp' && '●'}
          </span>
        </div>
        <button
          onClick={onExit}
          className="inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
          data-testid="landscape-exit-btn"
        >
          <Minimize2 className="w-3.5 h-3.5" />Exit landscape
        </button>
      </div>

      {/* Center: giant score */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div
          className="font-mono font-extrabold tracking-tighter leading-none text-center text-foreground tabular-nums"
          style={{ fontSize: '62px' }}
          data-testid="landscape-game-score"
        >
          {gameScore}
        </div>
        <div className="mt-4 flex items-center gap-4 flex-wrap justify-center">
          <span className="font-mono text-sm sm:text-base text-muted-foreground uppercase tracking-widest">
            Set {currentSetNumber} · <span className="font-bold text-foreground">{gamesSelf}-{gamesOpp}</span>
          </span>
          {(setsSelf > 0 || setsOpp > 0) && (
            <span className="font-mono text-sm sm:text-base uppercase tracking-widest">
              <span className="font-bold text-foreground">{setsSelf}-{setsOpp}</span>
              <span className="text-muted-foreground"> sets</span>
            </span>
          )}
          <span className="font-mono text-sm sm:text-base text-muted-foreground uppercase tracking-widest" data-testid="landscape-duration">
            {durationLabel}
          </span>
        </div>
      </div>

      {/* Bottom: server + court side + momentum */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 text-primary px-3 py-1.5 text-xs sm:text-sm font-bold uppercase tracking-widest">
              ● {serverName} serves
            </span>
            <span
              className={`rounded-full px-3 py-1.5 text-xs sm:text-sm font-bold uppercase tracking-widest border ${
                courtSide === 'ad'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
              }`}
              data-testid="landscape-court-side"
            >
              {courtLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {streakInfo && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs sm:text-sm font-bold uppercase tracking-widest ${
                  streakInfo.side === 'self' ? 'bg-primary/15 text-primary' : 'bg-destructive/15 text-destructive'
                }`}
              >
                {streakInfo.side === 'self' ? <Flame className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {streakInfo.count} in a row
              </span>
            )}
            {isBreakPoint && (
              <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs sm:text-sm font-bold uppercase tracking-widest bg-amber-500/15 text-amber-500 animate-pulse">
                <Zap className="w-4 h-4" />Break point
              </span>
            )}
          </div>
        </div>

        {last8.length > 0 && (
          <div className="flex items-center gap-1.5" data-testid="landscape-momentum-strip">
            {last8.map((p, i) => (
              <div
                key={i}
                className={`h-2.5 flex-1 rounded-full ${p.pointWinner === 'self' ? 'bg-primary' : 'bg-destructive/70'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
