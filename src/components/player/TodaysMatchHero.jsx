import { useNavigate } from 'react-router-dom';
import { Zap, ChevronRight } from 'lucide-react';
import { todayLocalIso } from '../../lib/dates';

// Maps our segment shape (Boys / Girls + U-14/16/18/12/10 or Men/Women)
// onto the exact Age-Group <option> label used by the tracker setup form.
// See AGE_GROUPS in TrackerPage.jsx.
function segmentToAgeGroupLabel(subcategory, category) {
  if (!subcategory) return '';
  const m = /U-?(\d+)/i.exec(subcategory);
  if (m) return `Under ${m[1]}`;
  if (category === 'Men') return 'Men';
  if (category === 'Women') return 'Women';
  return '';
}

// AITA "grade" strings ('CS-7', 'CS-5', 'AITA Talent Series', ...) → the
// tracker's Circuit <option> label. Mirrors mapAitaGradeToCircuit() in
// TrackerPage.jsx but scoped to the sparse strings the mock/tournament data
// emits. Falls back to '' when the grade doesn't match any option so the
// select stays blank rather than showing garbage.
function gradeToCircuit(grade) {
  if (!grade) return '';
  const g = grade.toLowerCase();
  if (g.includes('national championship')) return 'National Championships';
  if (g.includes('national series')) return 'National Series';
  if (g.includes('super series')) return 'Super Series';
  if (g.includes('talent series')) return 'Talent Series';
  if (g.includes('cs-7') || g.includes('cs7') || g.includes('7 star')) return 'Championship Series (CS7)';
  if (g.includes('cs-3') || g.includes('cs3') || g.includes('3 star')) return 'Championship Series (CS3)';
  if (g.includes('cs-5') || g.includes('cs5')) return 'Championship Series (CS7)'; // CS-5 events log to CS7 tier by convention
  return '';
}

/**
 * TodaysMatchHero — the one place a player never has to hunt for.
 *
 * If the segment has an entered match scheduled for TODAY, this hero card
 * shows up at the very top of the dashboard with a big "Launch tracker"
 * button that deep-links to /track with the entire opponent / round /
 * tournament / eventMatchId prefill so the tracker knows exactly which
 * tournament match this belongs to.
 *
 * Renders nothing if there is no match today (silent).
 */
export default function TodaysMatchHero({ upcoming, circuit, isOwnDashboard }) {
  const navigate = useNavigate();
  if (!isOwnDashboard) return null;

  const todayIso = todayLocalIso();
  const todaysMatches = (upcoming || []).filter((m) => m.date === todayIso && m.hasDay);
  if (todaysMatches.length === 0) return null;

  const primary = todaysMatches[0];
  const others = todaysMatches.slice(1);

  function launchTracker(m) {
    navigate('/track', {
      state: {
        trackerPrefill: {
          oppName: m.opponentName,
          tournament: m.tournamentName,
          round: m.round || '',
          date: m.date || todayIso,
          governingBody: 'AITA',
          circuit: gradeToCircuit(m.grade),
          ageGroup: segmentToAgeGroupLabel(circuit.subcategory, circuit.category),
          eventMatchId: m.id,
          normalizedCategory: circuit.category,
          normalizedSubcategory: circuit.subcategory,
        },
      },
    });
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-card border-2 border-destructive/70 shadow-lg"
      data-testid="todays-match-hero"
    >
      {/* Live pulse strip */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-destructive animate-pulse" />

      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 text-destructive px-2.5 py-1 text-[12px] font-bold uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            Match today
          </span>
          <span className="text-[12px] uppercase tracking-widest font-bold text-muted-foreground">
            {circuit.category} · {circuit.subcategory}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="font-display font-black text-2xl sm:text-3xl tracking-tighter leading-tight">
              vs {primary.opponentName}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground/80">{primary.tournamentName}</span>
              {primary.round && <> · {primary.round}</>}
              {primary.grade && <> · {primary.grade}</>}
            </div>
            {primary.h2h && (
              <div className="mt-2 inline-block rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[12px] font-bold uppercase tracking-widest">
                {primary.h2h}
              </div>
            )}
          </div>

          <button
            onClick={() => launchTracker(primary)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-destructive text-destructive-foreground px-5 py-3 text-sm font-bold hover:brightness-110 active:scale-[0.98] transition-all shrink-0 shadow"
            data-testid="todays-match-launch-btn"
          >
            <Zap className="w-4 h-4" />
            Launch tracker
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {others.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-[12px] uppercase tracking-widest font-bold text-muted-foreground mb-2">
              Also today · {others.length} more
            </div>
            <div className="space-y-2">
              {others.map((m) => (
                <button
                  key={m.id}
                  onClick={() => launchTracker(m)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg border border-border hover:border-destructive/50 text-left"
                  data-testid={`todays-match-launch-btn-${m.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">vs {m.opponentName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {m.tournamentName}{m.round ? ` · ${m.round}` : ''}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-destructive shrink-0">Track →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
