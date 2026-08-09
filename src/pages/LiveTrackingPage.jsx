import { Link, useParams } from 'react-router-dom';
import AppNav from '../components/AppNav';
import Scorebar from '../components/Scorebar';
import PointLog from '../components/PointLog';
import StatsPanel from '../components/StatsPanel';
import { useLiveTrackingSpectator } from '../hooks/useLiveTrackingSpectator';
import { Button } from '@/components/primitives/button';
import '../styles/tracker-tailwind.css';

export default function LiveTrackingPage() {
  const { sessionId } = useParams();
  const live = useLiveTrackingSpectator(sessionId);
  const header = live.snapshot?.header || {};
  const selfName = header.selfName || 'Player';
  const oppName = header.oppName || 'Opponent';

  return (
    <AppNav>
      <div className="tracker-shell flex h-full flex-col overflow-hidden bg-background text-foreground font-body">
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Live match view</div>
              <h1 className="font-display font-extrabold text-xl tracking-tighter">
                {selfName} vs {oppName}
              </h1>
              <div className="text-xs text-muted-foreground mt-1">
                {[header.tournament, header.round, header.date].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {live.isLive
                ? <span className="inline-flex items-center gap-1.5 rounded-sm bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-1 text-xs font-bold"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Live</span>
                : <span className="rounded-sm bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">Session ended</span>}
              <Button asChild size="sm" variant="outline">
                <Link to="/">Dashboard</Link>
              </Button>
            </div>
          </div>

          {live.loading && <div className="text-sm text-muted-foreground">Connecting to live session…</div>}
          {live.error && <div className="text-sm text-destructive">{live.error}</div>}
        </div>

        {live.snapshot && live.engine && (
          <>
            <Scorebar
              header={header}
              sessionType={live.snapshot.sessionType}
              formatPreset={live.snapshot.formatPreset}
              pointTarget={live.snapshot.pointTarget}
              engine={live.engine}
              nextServer={live.snapshot.serverChoice}
              matchStartTime={live.snapshot.matchStartTime}
              matchDurationMs={live.matchDurationMs}
            />

            <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 pb-8">
              <div className="rounded-sm border border-dashed border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
                Read-only spectator view — points update automatically as they are logged courtside.
              </div>
              <StatsPanel
                points={live.snapshot.points}
                header={header}
                sessionType={live.snapshot.sessionType}
                analytics={live.analytics}
                section="overview"
              />
              <PointLog points={live.snapshot.points} header={header} />
            </div>
          </>
        )}
      </div>
    </AppNav>
  );
}
