import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { collectImportantDates } from '../../lib/playerDashboardDates';
import { Card } from '@/components/primitives/card';

function urgencyLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export default function ImportantDatesPanel({ tournamentItems, interestRows, aitaTournaments }) {
  const dates = useMemo(
    () => collectImportantDates({ tournamentItems, interestRows, aitaTournaments }).slice(0, 8),
    [tournamentItems, interestRows, aitaTournaments],
  );

  if (dates.length === 0) return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-4 h-4 text-muted-foreground" />
        <div className="font-bold text-sm">Important dates</div>
      </div>
      <div className="space-y-2">
        {dates.map((row, idx) => (
          <div key={`${row.tournamentName}-${row.kind}-${row.date}-${idx}`} className="flex items-start justify-between gap-3 text-sm border-b border-border/60 last:border-0 pb-2 last:pb-0">
            <div className="min-w-0">
              <div className="font-semibold truncate">{row.label}</div>
              <div className="text-xs text-muted-foreground truncate">{row.tournamentName}</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-xs font-bold ${row.daysUntil <= 2 ? 'text-destructive' : 'text-accent-ink'}`}>
                {urgencyLabel(row.daysUntil)}
              </div>
              <div className="text-[10px] text-muted-foreground">{row.date}</div>
            </div>
          </div>
        ))}
      </div>
      <Link to="/tournaments" className="inline-block mt-3 text-xs font-semibold text-accent-ink hover:underline">
        View all events →
      </Link>
    </Card>
  );
}
