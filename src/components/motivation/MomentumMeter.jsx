import { Card } from '@/components/primitives/card';
import { Flame, TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';

/**
 * MomentumMeter — a single "how hot are you right now" 0-100 gauge that
 * blends recent form + activity + streak + skill self-rating into one
 * headline number. Sits at the top of the player Dashboard as the daily
 * emotional anchor.
 */
export default function MomentumMeter({ momentum }) {
  if (!momentum) return null;
  const { score, label, tone, breakdown } = momentum;

  const stroke = 8;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const toneColor =
    tone === 'up' ? 'var(--color-primary)' :
    tone === 'flat' ? '#f59e0b' :
    '#ef4444';
  const Icon = tone === 'up' ? TrendingUp : tone === 'down' ? TrendingDown : Minus;

  return (
    <Card
      className="p-5 sm:p-6 shadow-sm overflow-hidden relative"
      data-testid="momentum-meter"
    >
      {/* Ambient glow accent */}
      <div
        className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none opacity-30"
        style={{ background: `radial-gradient(circle, ${toneColor} 0%, transparent 65%)` }}
      />

      <div className="relative flex items-center gap-5">
        {/* Gauge */}
        <div className="relative shrink-0" style={{ width: 108, height: 108 }}>
          <svg width="108" height="108" viewBox="0 0 108 108" className="-rotate-90">
            <circle cx="54" cy="54" r={radius} fill="none" stroke="var(--color-muted)" strokeWidth={stroke} />
            <circle
              cx="54" cy="54" r={radius} fill="none"
              stroke={toneColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 700ms ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-display font-extrabold text-3xl tracking-tighter leading-none">
              {score}
            </div>
            <div className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground mt-1">
              Momentum
            </div>
          </div>
        </div>

        {/* Label + breakdown */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Icon className="w-4 h-4 shrink-0" style={{ color: toneColor }} />
            <span
              className="font-display font-extrabold text-xl tracking-tight leading-none"
              style={{ color: toneColor }}
              data-testid="momentum-label"
            >
              {label}
            </span>
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            Your form pulse — blends recent matches, activity, streak &amp; skill.
          </div>

          <div className="grid grid-cols-4 gap-1.5 mt-3">
            {[
              { k: 'form', label: 'Form', v: breakdown.form, max: 40 },
              { k: 'activity', label: 'Active', v: breakdown.activity, max: 25 },
              { k: 'streak', label: 'Streak', v: breakdown.streak, max: 20 },
              { k: 'skill', label: 'Skill', v: breakdown.skill, max: 15 },
            ].map(b => (
              <div key={b.k} className="min-w-0">
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(b.v / b.max) * 100}%`, background: toneColor, transition: 'width 700ms ease-out' }}
                  />
                </div>
                <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mt-1 truncate">
                  {b.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {score >= 80 && (
        <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-primary">
          <Zap className="w-3.5 h-3.5" strokeWidth={2.5} />
          You're peaking — ride this wave.
        </div>
      )}
    </Card>
  );
}
