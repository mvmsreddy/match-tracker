import { Coffee, Timer, X } from 'lucide-react';

function formatCountdown(secs) {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

export default function MatchTimingBanners({
  pointRestSecsLeft,
  changeoverActive,
  changeoverSecsLeft,
  onDismissChangeover,
}) {
  return (
    <>
      {changeoverActive && (
        <div
          className="rounded-xl bg-amber-500/10 border border-amber-500/40 p-3 flex items-center gap-3"
          data-testid="changeover-timer"
        >
          <Coffee className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] uppercase tracking-widest font-bold text-amber-500">Changeover</div>
            <div className="text-xs text-muted-foreground">Breathe. Hydrate. Reset.</div>
          </div>
          <div className="font-display font-black text-2xl tracking-tighter tabular-nums">
            {formatCountdown(changeoverSecsLeft)}
          </div>
          <button
            type="button"
            onClick={onDismissChangeover}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss changeover timer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {pointRestSecsLeft != null && !changeoverActive && (
        <div
          className="rounded-xl bg-sky-500/10 border border-sky-500/40 p-3 flex items-center gap-3"
          data-testid="point-rest-timer"
        >
          <Timer className="w-5 h-5 text-sky-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] uppercase tracking-widest font-bold text-sky-500">Between points</div>
            <div className="text-xs text-muted-foreground">Take a breath before the next point.</div>
          </div>
          <div className="font-display font-black text-2xl tracking-tighter tabular-nums text-sky-500">
            0:{String(pointRestSecsLeft).padStart(2, '0')}
          </div>
        </div>
      )}
    </>
  );
}
