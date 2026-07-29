import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as api from '../api';
import AitaTournamentFactsheet from '../components/AitaTournamentFactsheet';

function timeAgo(iso) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export default function AitaTournamentFactsheetPage() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getAitaTournament(id)
      .then(data => { if (!cancelled) setT(data); })
      .catch(e => { if (!cancelled) setError(e.message || 'Tournament not found'); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-4xl mx-auto">
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">{error}</div>
      </div>
    );
  }

  if (!t) {
    return (
      <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-4xl mx-auto">
        <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading fact sheet…</div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <Link to="/aita-calendar" className="hover:text-foreground">AITA Calendar</Link>
          <span>/</span>
          <span className="text-foreground">{t.name}</span>
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tighter">{t.name}</h1>
      </div>

      <AitaTournamentFactsheet t={t} />

      {t.lastChangedAt && (
        <div className="text-xs text-muted-foreground">Last updated: {timeAgo(t.lastChangedAt)}</div>
      )}
    </div>
  );
}
