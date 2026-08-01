import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from 'recharts';
import { Card } from '@/components/primitives/card';
import { Target } from 'lucide-react';

/**
 * SkillRadarCard — 6-axis radar (Serve · Forehand · Backhand · Volley · Footwork · Mental)
 * `ratings` = { serve, forehand, backhand, volley, footwork, mental } in 0-10 scale
 * `stats` (optional) = { winRate, matches } for context
 */
export default function SkillRadarCard({ ratings, stats, onCta, ctaLabel = 'Rate a match' }) {
  const empty = !ratings || Object.values(ratings).every(v => !v);
  const data = ratings ? [
    { skill: 'Serve', value: ratings.serve || 0 },
    { skill: 'Forehand', value: ratings.forehand || 0 },
    { skill: 'Backhand', value: ratings.backhand || 0 },
    { skill: 'Volley', value: ratings.volley || 0 },
    { skill: 'Footwork', value: ratings.footwork || 0 },
    { skill: 'Mental', value: ratings.mental || 0 },
  ] : [];

  return (
    <Card className="p-4 sm:p-6 shadow-sm" data-testid="skill-radar-card">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Skill Radar</div>
          <div className="text-sm font-bold mt-0.5">Your 6-axis snapshot</div>
        </div>
        {stats && (
          <div className="text-right">
            <div className="font-display font-extrabold text-lg tracking-tighter text-accent-ink">{stats.winRate}%</div>
            <div className="text-[12px] text-muted-foreground uppercase font-bold">Win Rate</div>
          </div>
        )}
      </div>

      {empty ? (
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center mt-3">
          <Target className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
          <div className="text-xs text-muted-foreground mb-3">Rate your skills after a match to build your radar</div>
          {onCta && (
            <button
              onClick={onCta}
              className="text-xs font-bold uppercase tracking-wider text-accent-ink hover:underline"
              data-testid="skill-radar-cta"
            >
              {ctaLabel} →
            </button>
          )}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240} debounce={200}>
          <RadarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid stroke="var(--color-border)" strokeDasharray="3 3" />
            <PolarAngleAxis
              dataKey="skill"
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11, fontWeight: 600 }}
            />
            <PolarRadiusAxis
              domain={[0, 10]}
              tickCount={6}
              tick={false}
              axisLine={false}
            />
            <Radar
              name="Skills"
              dataKey="value"
              stroke="var(--color-primary)"
              fill="var(--color-primary)"
              fillOpacity={0.35}
              strokeWidth={2.5}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-popover)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(value) => [`${value}/10`, 'Rating']}
            />
          </RadarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
