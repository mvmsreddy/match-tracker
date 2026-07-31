import { formatGameScore } from '../lib/engine';
import { formatDuration } from '../lib/storage';
import { getFormatConfig } from '../lib/constants';
import { cn } from '../lib/utils';
import { Badge } from './primitives/badge';

function getGameDisplay(engine, sessionType) {
  if (sessionType === 'practice') {
    return engine.gamePts.self + ' – ' + engine.gamePts.opp;
  }
  if (engine.matchOver) return 'FINAL';
  if (engine.matchTiebreakActive) {
    return engine.matchTiebreakPts.self + ' – ' + engine.matchTiebreakPts.opp + ' MTB';
  }
  return formatGameScore(engine);
}

function SetBox({ children, live, future }) {
  return (
    <div
      className={cn(
        'flex min-w-[30px] items-center justify-center rounded-lg border px-1.5 py-1 font-mono text-xs tabular-nums',
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

  return (
    <div className="flex-shrink-0 border-b border-border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-3 font-mono">
        {/* Left: player names + set history */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-primary">
              {nextServer === 'self' && <span className="inline-block h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-primary" />}
              <span className="truncate">{selfName}</span>
            </div>
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
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-destructive">
              {nextServer === 'opp' && <span className="inline-block h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-destructive" />}
              <span className="truncate">{oppName}</span>
            </div>
            {isPractice ? null : (
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

        {/* Right: big game score */}
        <div className="flex-shrink-0 text-right">
          <div className="text-2xl font-bold tabular-nums text-foreground">{gameDisplay}</div>
          <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            {matchStartTime ? formatDuration(matchDurationMs) : '0:00'}
          </div>
        </div>
      </div>

      {(engine.inTiebreak || engine.matchTiebreakActive) && !engine.matchOver && (
        <div className="mt-2 flex items-center gap-2">
          <Badge>{engine.tiebreakCourtSide === 'deuce' ? 'Deuce Court' : 'Ad Court'}</Badge>
          {engine.changeEnds && (
            <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">↔ Change Ends</span>
          )}
        </div>
      )}

      {engine.matchOver && (
        <div className="mt-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-center font-mono text-xs font-semibold uppercase tracking-wider text-primary">
          {(engine.matchWinner === 'self' ? selfName : oppName)}{' '}
          {isPractice ? 'wins the session' : 'wins the match'}
        </div>
      )}
    </div>
  );
}
