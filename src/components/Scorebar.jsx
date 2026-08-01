import { formatGameScore, getNextServeCourtSide } from '../lib/engine';
import { formatDuration } from '../lib/storage';
import { getFormatConfig } from '../lib/constants';
import { cn } from '../lib/utils';
import { Timer } from 'lucide-react';

function getGameDisplay(engine, sessionType) {
  if (sessionType === 'practice') {
    return engine.gamePts.self + ' – ' + engine.gamePts.opp;
  }
  if (engine.matchOver) return 'FINAL';
  if (engine.matchTiebreakActive) {
    return engine.matchTiebreakPts.self + ' – ' + engine.matchTiebreakPts.opp + ' MTB';
  }
  return formatGameScore(engine);
}

function SetBox({ children, live, future }) {
  return (
    <div
      className={cn(
        'flex min-w-[28px] items-center justify-center rounded-md border px-1.5 py-0.5 font-mono text-xs tabular-nums',
        live && 'border-primary text-primary font-semibold',
        future && 'border-border/50 text-muted-foreground/50',
        !live && !future && 'border-border text-foreground'
      )}
    >
      {children}
    </div>
  );
}

export default function Scorebar({ header, sessionType, formatPreset, pointTarget, engine, nextServer, matchStartTime, matchDurationMs }) {
  const isPractice = sessionType === 'practice';
  const selfName = header.selfName || 'Self';
  const oppName = header.oppName || 'Opponent';
  const gameDisplay = getGameDisplay(engine, sessionType);
  const cfg = getFormatConfig(formatPreset || 'bo3-full');
  // Max sets in match (e.g. Bo3 → 3, Bo5 → 5, proset → 1)
  const maxSets = cfg.setsToWin * 2 - 1;
  const completedSets = engine.sets.length;
  const futureSets = engine.matchOver ? 0 : Math.max(0, maxSets - completedSets - 1);

  const showLiveMeta = !isPractice && !engine.matchOver;
  const courtSide = showLiveMeta ? getNextServeCourtSide(engine) : null;
  const courtLabel = courtSide === 'ad' ? 'Ad Court' : 'Deuce Court';
  const inAnyTiebreak = engine.inTiebreak || engine.matchTiebreakActive;

  return (
    <div className="flex-shrink-0 bg-background px-4 pt-3 pb-2">
      <div className="rounded-2xl border border-border bg-card p-4">
        {/* Top row: big score + duration / court side */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display font-black text-4xl sm:text-5xl tracking-tighter leading-none tabular-nums text-foreground" data-testid="live-game-score">
              {gameDisplay}
            </div>
            {!isPractice && !engine.matchOver && (
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                Set {completedSets + 1} · <span className="font-bold text-foreground">{engine.setGames.self}-{engine.setGames.opp}</span>
              </div>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground" data-testid="match-duration">
              <Timer className="h-3 w-3" />{matchStartTime ? formatDuration(matchDurationMs) : '0:00'}
            </span>
            {showLiveMeta && (
              <span
                className={cn(
                  'rounded-full border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-widest',
                  courtSide === 'ad'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                )}
                data-testid="court-side-indicator"
                title="Where the next serve will be played from"
              >
                {courtLabel}
              </span>
            )}
          </div>
        </div>

        {/* Players + per-set history */}
        <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-primary">
              {nextServer === 'self' && <span className="inline-block h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-primary" />}
              <span className="truncate">{selfName}</span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              {isPractice ? (
                <SetBox live>to {pointTarget}</SetBox>
              ) : (
                <>
                  {engine.sets.map((st, i) => (
                    <SetBox key={i}>{st.isMatchTiebreak ? st.tb.self : st.self}</SetBox>
                  ))}
                  {!engine.matchOver && (
                    <SetBox live>{engine.matchTiebreakActive ? engine.matchTiebreakPts.self : engine.setGames.self}</SetBox>
                  )}
                  {Array.from({ length: futureSets }, (_, i) => (
                    <SetBox key={'f' + i} future>-</SetBox>
                  ))}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-destructive">
              {nextServer === 'opp' && <span className="inline-block h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-destructive" />}
              <span className="truncate">{oppName}</span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              {!isPractice && (
                <>
                  {engine.sets.map((st, i) => (
                    <SetBox key={i}>{st.isMatchTiebreak ? st.tb.opp : st.opp}</SetBox>
                  ))}
                  {!engine.matchOver && (
                    <SetBox live>{engine.matchTiebreakActive ? engine.matchTiebreakPts.opp : engine.setGames.opp}</SetBox>
                  )}
                  {Array.from({ length: futureSets }, (_, i) => (
                    <SetBox key={'f' + i} future>-</SetBox>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {inAnyTiebreak && !engine.matchOver && engine.changeEnds && (
          <div className="mt-2 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">↔ Change Ends</div>
        )}

        {engine.matchOver && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-center font-mono text-xs font-semibold uppercase tracking-wider text-primary">
            {(engine.matchWinner === 'self' ? selfName : oppName)}{' '}
            {isPractice ? 'wins the session' : 'wins the match'}
          </div>
        )}
      </div>
    </div>
  );
}
