import { useState, useEffect } from 'react';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import { Star, Check, Sparkles } from 'lucide-react';
import { saveSkillRatings } from '@/lib/localStore';

const SKILLS = [
  { key: 'serve', label: 'Serve', hint: 'Placement, power, consistency' },
  { key: 'forehand', label: 'Forehand', hint: 'Winners vs errors, spin control' },
  { key: 'backhand', label: 'Backhand', hint: 'Confidence under pressure' },
  { key: 'volley', label: 'Volley', hint: 'Net game, touch shots' },
  { key: 'footwork', label: 'Footwork', hint: 'Movement, recovery, positioning' },
  { key: 'mental', label: 'Mental', hint: 'Focus, resilience, decision-making' },
];

/**
 * MatchSkillRating — rate your 6 skills (1-10) after a match.
 * Persists to localStorage via saveSkillRatings(userId, matchId, ratings).
 */
export default function MatchSkillRating({ userId, matchId, existing, onSaved }) {
  const [expanded, setExpanded] = useState(!existing);
  const [ratings, setRatings] = useState(() => {
    const init = {};
    for (const s of SKILLS) init[s.key] = existing?.[s.key] || 0;
    return init;
  });
  const [saved, setSaved] = useState(!!existing);

  useEffect(() => {
    if (existing) {
      const r = {};
      for (const s of SKILLS) r[s.key] = existing[s.key] || 0;
      setRatings(r);
      setSaved(true);
    }
  }, [existing]);

  function setSkill(key, value) {
    setRatings(r => ({ ...r, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    saveSkillRatings(userId, matchId, ratings);
    setSaved(true);
    setExpanded(false);
    onSaved && onSaved(ratings);
  }

  const total = Object.values(ratings).reduce((s, v) => s + (Number(v) || 0), 0);
  const avg = total > 0 ? (total / SKILLS.length).toFixed(1) : null;

  return (
    <Card className="p-4 sm:p-6 shadow-sm my-4" data-testid="match-skill-rating">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold">Rate your skills</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {saved ? 'Feeds your Dashboard Skill Radar' : 'Rate 1-10 how each area felt today'}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          {avg && (
            <>
              <div className="font-display font-extrabold text-2xl tracking-tighter text-primary">{avg}</div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Avg / 10</div>
            </>
          )}
        </div>
      </div>

      {!expanded && saved && (
        <div className="flex items-center gap-3 flex-wrap mt-3">
          {SKILLS.map(s => (
            <div key={s.key} className="text-xs flex items-center gap-1">
              <span className="text-muted-foreground">{s.label}:</span>
              <span className="font-bold">{ratings[s.key]}/10</span>
            </div>
          ))}
          <button
            onClick={() => setExpanded(true)}
            className="text-xs font-bold uppercase tracking-wider text-primary hover:underline ml-auto"
          >
            Edit
          </button>
        </div>
      )}

      {expanded && (
        <div className="space-y-3 mt-3">
          {SKILLS.map(s => (
            <div key={s.key} data-testid={`skill-row-${s.key}`}>
              <div className="flex items-baseline justify-between mb-1.5">
                <div>
                  <span className="text-sm font-bold">{s.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{s.hint}</span>
                </div>
                <span className="text-sm font-bold text-primary">{ratings[s.key] || '—'}/10</span>
              </div>
              <div className="grid grid-cols-10 gap-1">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button
                    key={n}
                    onClick={() => setSkill(s.key, n)}
                    className={`h-8 rounded-md text-xs font-bold transition-all ${
                      ratings[s.key] >= n
                        ? (n <= 3 ? 'bg-destructive text-white' : n <= 6 ? 'bg-chart-4 text-white' : 'bg-primary text-primary-foreground')
                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                    data-testid={`skill-${s.key}-${n}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" onClick={handleSave} disabled={total === 0} data-testid="save-skill-ratings">
              {saved ? <><Check className="w-4 h-4 mr-1" /> Saved</> : 'Save ratings'}
            </Button>
            {saved && (
              <button
                onClick={() => setExpanded(false)}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Collapse
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
