import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as api from '../api';
import { useTheme } from '../context/ThemeContext';
import TopNav from '../components/TopNav';
import MTNavChrome from '../components/nav/MTNavChrome';
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
  const { theme } = useTheme();
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
      <div className="root">
        {theme === 'navy' ? <MTNavChrome active="calendar" /> : <TopNav />}
        <div className="history-empty">{error}</div>
      </div>
    );
  }

  if (!t) {
    return (
      <div className="root">
        {theme === 'navy' ? <MTNavChrome active="calendar" /> : <TopNav />}
        <div className="history-empty">Loading fact sheet…</div>
      </div>
    );
  }

  return (
    <div className="root">
      {theme === 'navy' ? <MTNavChrome active="calendar" /> : <TopNav />}

      <div className="header">
        <div className="title-row">
          <div>
            <div className="t-breadcrumb">
              <Link to="/aita-calendar">AITA Calendar</Link>
              <span> / </span>
              <span>{t.name}</span>
            </div>
            <h1 className="title">{t.name}</h1>
          </div>
        </div>
      </div>

      <div className="page-scroll">
        <div style={{ padding: '10px 16px 0' }}>
          <AitaTournamentFactsheet t={t} />
        </div>

        {t.lastChangedAt && (
          <div className="history-empty" style={{ padding: '0 16px 16px', textAlign: 'left' }}>
            Last updated: {timeAgo(t.lastChangedAt)}
          </div>
        )}
      </div>
    </div>
  );
}
