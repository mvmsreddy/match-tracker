import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as api from '../api';
import TopNav from '../components/TopNav';

export default function EventDetailPage() {
  const { id: weekId, eventId } = useParams();
  const [week, setWeek] = useState(null);
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getTournamentWeek(weekId), api.getEvent(eventId)])
      .then(([w, ev]) => {
        if (!cancelled) { setWeek(w); setEvent(ev); }
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load event'); });
    return () => { cancelled = true; };
  }, [weekId, eventId]);

  if (error) {
    return (
      <div className="root">
        <TopNav />
        <div className="page-scroll"><div className="history-empty">{error}</div></div>
      </div>
    );
  }

  if (!event || !week) {
    return (
      <div className="root">
        <TopNav />
        <div className="page-scroll"><div className="history-empty">Loading…</div></div>
      </div>
    );
  }

  return (
    <div className="root">
      <TopNav />

      <div className="header">
        <div className="title-row">
          <div>
            <div className="t-breadcrumb">
              <Link to="/tournaments">Tournaments</Link>
              <span> / </span>
              <Link to={`/tournaments/${weekId}`}>{week.name}</Link>
              <span> / </span>
              <span>{event.category} {event.ageGroup}</span>
            </div>
            <h1 className="title">{event.category}</h1>
            <div className="subtitle">{event.ageGroup} · {week.name}</div>
          </div>
        </div>
      </div>

      <div className="page-scroll">
        <div className="t-events-list">
          <div className="t-section-title">Draw Size: {event.drawSize} · Seeds: {event.numSeeds}</div>

          {/* Phase 3: Player Entry will go here */}
          {/* Phase 4: Draw Engine will go here */}
          {/* Phase 5: Score Entry will go here */}

          <div className="history-empty" style={{ marginTop: 32 }}>
            Draw management coming in Phase 3.
            <br />
            <br />
            Status: <strong>{event.status}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
