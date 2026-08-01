import { useEffect, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Card } from '@/components/primitives/card';
import { TrendingUp } from 'lucide-react';
import * as api from '../api';
import { toDisplayRating, isProvisional } from '../lib/glicko2';

/**
 * PlayerRatingCard — the computed "Tracker Rating" (Glicko-2), distinct from
 * the official AITA rank. Self-fetches from api.getPlayerRating /
 * getPlayerRatingHistory, same self-mounting pattern as other dashboard
 * cards (e.g. TodaysMatchHero) so it drops into a page with one line.
 * Renders nothing until data resolves, and a friendly empty state if the
 * player has no rated tournament matches yet (v1 only rates completed
 * official bracket matches — see supabase/functions/compute-ratings).
 */
export default function PlayerRatingCard({ playerId, aitaReg }) {
  const [rating, setRating] = useState(undefined); // undefined = loading, null = none yet
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let cancelled = false;
    if (!playerId && !aitaReg) { setRating(null); return; }
    api.getPlayerRating({ playerId, aitaReg })
      .then(async (r) => {
        if (cancelled) return;
        setRating(r);
        if (r) {
          const h = await api.getPlayerRatingHistory({ playerId, aitaReg });
          if (!cancelled) setHistory(h);
        }
      })
      .catch(() => { if (!cancelled) setRating(null); });
    return () => { cancelled = true; };
  }, [playerId, aitaReg]);

  if (rating === undefined) return null; // still loading — avoid a layout flash

  const provisional = rating && isProvisional(rating);
  const display = rating ? toDisplayRating(rating.rating) : null;
  const chartData = history.map((h, i) => ({ i, rating: toDisplayRating(h.rating) }));

  return (
    <Card className="p-4 sm:p-6 shadow-sm" data-testid="player-rating-card">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Tracker Rating</div>
          <div className="text-sm font-bold mt-0.5">Computed from your tournament results</div>
        </div>
        {rating && (
          <div className="text-right">
            <div className="font-display font-extrabold text-2xl tracking-tighter text-accent-ink" data-testid="player-rating-value">
              {display.toFixed(1)}
            </div>
            <div className="text-[12px] text-muted-foreground uppercase font-bold">/ 10</div>
          </div>
        )}
      </div>

      {!rating ? (
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center mt-3">
          <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
          <div className="text-xs text-muted-foreground">
            Not rated yet — this builds up automatically from completed official tournament matches.
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            {provisional && (
              <span
                className="inline-flex items-center rounded-sm bg-chart-2/15 text-chart-2 px-2 py-0.5 text-[0.68rem] font-bold"
                title="Still settling — the rating moves more per match until enough results have been seen"
                data-testid="player-rating-provisional"
              >
                Provisional
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {rating.matchesCount} rated match{rating.matchesCount === 1 ? '' : 'es'}
            </span>
          </div>

          {chartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="i" hide />
                <YAxis domain={[1, 10]} hide />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-popover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelFormatter={() => ''}
                  formatter={(value) => [`${value.toFixed(1)}/10`, 'Rating']}
                />
                <Area
                  type="monotone"
                  dataKey="rating"
                  stroke="var(--color-primary)"
                  fill="var(--color-primary)"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-xs text-muted-foreground">Play more rated matches to see a trend.</div>
          )}
        </>
      )}
    </Card>
  );
}
