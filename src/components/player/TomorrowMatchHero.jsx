import { useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { tomorrowIso } from '../../lib/playerDashboardDates';

function segmentToAgeGroupLabel(subcategory, category) {
  if (!subcategory) return '';
  const m = /U-?(\d+)/i.exec(subcategory);
  if (m) return `Under ${m[1]}`;
  if (category === 'Men') return 'Men';
  if (category === 'Women') return 'Women';
  return '';
}

function gradeToCircuit(grade) {
  if (!grade) return '';
  const g = grade.toLowerCase();
  if (g.includes('national championship')) return 'National Championships';
  if (g.includes('national series')) return 'National Series';
  if (g.includes('super series')) return 'Super Series';
  if (g.includes('talent series')) return 'Talent Series';
  if (g.includes('cs-7') || g.includes('cs7') || g.includes('7 star')) return 'Championship Series (CS7)';
  if (g.includes('cs-3') || g.includes('cs3') || g.includes('3 star')) return 'Championship Series (CS3)';
  if (g.includes('cs-5') || g.includes('cs5')) return 'Championship Series (CS7)';
  return '';
}

export default function TomorrowMatchHero({ upcoming, circuit, isOwnDashboard }) {
  const navigate = useNavigate();
  if (!isOwnDashboard || !circuit) return null;

  const tomorrow = tomorrowIso();
  const tomorrowMatches = (upcoming || []).filter(m => m.date === tomorrow && m.hasDay);
  if (tomorrowMatches.length === 0) return null;

  const primary = tomorrowMatches[0];

  function launchTracker(m) {
    navigate('/track', {
      state: {
        trackerPrefill: {
          oppName: m.opponentName,
          tournament: m.tournamentName,
          round: m.round || '',
          date: m.date || tomorrow,
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
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5" data-testid="tomorrow-match-hero">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tomorrow</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="font-display font-extrabold text-lg sm:text-xl tracking-tight">vs {primary.opponentName}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {primary.tournamentName}{primary.round ? ` · ${primary.round}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => launchTracker(primary)}
          className="inline-flex items-center gap-1 text-xs font-bold text-accent-ink hover:underline shrink-0"
        >
          Prep tracker <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      {tomorrowMatches.length > 1 && (
        <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
          +{tomorrowMatches.length - 1} more match{tomorrowMatches.length - 1 === 1 ? '' : 'es'} tomorrow
        </div>
      )}
    </div>
  );
}
