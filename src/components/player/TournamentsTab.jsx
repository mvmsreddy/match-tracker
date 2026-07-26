import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { normalizeEventSegment } from '../../lib/governingBodies';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Segment-filtered tournament history. Links out to the existing
// EventDetailPage for full match-by-round detail rather than duplicating
// that rendering here — this tab's job is filtering the player's entries
// down to the selected segment, not re-implementing the draw view.
export default function TournamentsTab({ circuit }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    api.getMyEntries()
      .then(data => { if (!cancelled) setEntries(data); })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load tournament entries'); setEntries([]); } });
    return () => { cancelled = true; };
  }, []);

  const segmentEntries = useMemo(() => {
    if (!entries) return [];
    return entries
      .filter(e => e.event)
      .filter(e => {
        const seg = normalizeEventSegment(e.event.category, e.event.ageGroup);
        return seg && seg.category === circuit.category && seg.subcategory === circuit.subcategory;
      })
      .sort((a, b) => (b.event.week?.startDate || '').localeCompare(a.event.week?.startDate || ''));
  }, [entries, circuit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-info-item">{segmentEntries.length} {circuit.category} {circuit.subcategory} entr{segmentEntries.length === 1 ? 'y' : 'ies'}</div>

      {error && <div className="history-empty">{error}</div>}
      {entries === null && !error && <div className="history-empty">Loading…</div>}
      {entries !== null && segmentEntries.length === 0 && (
        <div className="history-empty">No {circuit.category} {circuit.subcategory} tournament entries found yet.</div>
      )}

      {segmentEntries.map(e => (
        <Link
          key={e.id}
          to={`/tournaments/${e.event.week?.id}/events/${e.event.id}`}
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 22px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, color: 'inherit' }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{e.event.week?.name || 'Unnamed tournament'}</div>
            <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 6 }}>
              {formatDate(e.event.week?.startDate)} · {e.event.week?.city}, {e.event.week?.stateAbbr} · {e.event.week?.grade}
            </div>
          </div>
          {e.seed && (
            <div style={{ fontSize: 11, fontWeight: 600, padding: '7px 10px', borderRadius: 7, background: 'rgba(79,195,232,.14)', color: 'var(--info)' }}>
              SEED {e.seed}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{e.drawType === 'doubles' ? 'Doubles' : 'Singles'}</div>
        </Link>
      ))}
    </div>
  );
}
