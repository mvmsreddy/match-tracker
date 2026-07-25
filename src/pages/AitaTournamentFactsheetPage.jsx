import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as api from '../api';
import TopNav from '../components/TopNav';

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
      <div className="root">
        <TopNav />
        <div className="history-empty">{error}</div>
      </div>
    );
  }

  if (!t) {
    return (
      <div className="root">
        <TopNav />
        <div className="history-empty">Loading fact sheet…</div>
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
              <Link to="/aita-calendar">AITA Calendar</Link>
              <span> / </span>
              <span>{t.name}</span>
            </div>
            <h1 className="title">{t.name}</h1>
          </div>
        </div>
      </div>

      <div className="t-week-info-bar">
        {t.surface && <span className="t-badge">{t.surface}</span>}
        {t.grade && <span className="t-badge t-badge-grade">{t.grade}</span>}
        {t.ageGroup && <span className="t-badge">{t.ageGroup}</span>}
        {(t.city || t.venue) && (
          <span className="t-info-item">{[t.venue, t.city].filter(Boolean).join(', ')}</span>
        )}
        {t.startDate && <span className="t-info-item">{t.startDate}</span>}
      </div>

      <div className="page-scroll">
        <div className="t-factsheet-panel">
          {(t.entryDeadline || t.withdrawalDeadline || t.qualifyingStartDate) && (
            <div className="t-fs-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
              {t.entryDeadline && <span className="t-fs-item"><b>Entry deadline:</b> {t.entryDeadline}</span>}
              {t.withdrawalDeadline && <span className="t-fs-item"><b>Withdrawal deadline:</b> {t.withdrawalDeadline}</span>}
              {(t.qualifyingStartDate || t.qualifyingEndDate) && (
                <span className="t-fs-item">
                  <b>Qualifying:</b> {t.qualifyingStartDate}
                  {t.qualifyingEndDate && t.qualifyingEndDate !== t.qualifyingStartDate ? ` – ${t.qualifyingEndDate}` : ''}
                </span>
              )}
            </div>
          )}

          {(t.directorName || t.directorPhone || t.directorEmail) && (
            <div className="t-fs-row">
              <span className="t-fs-item">
                <b>Director:</b> {[t.directorName, t.directorPhone, t.directorEmail].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}

          {(t.refereeName || t.refereePhone || t.refereeEmail) && (
            <div className="t-fs-row">
              <span className="t-fs-item">
                <b>Referee:</b> {[t.refereeName, t.refereePhone, t.refereeEmail].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}

          {(t.venueAddress || t.venuePincode || t.venuePhone) && (
            <div className="t-fs-row">
              <span className="t-fs-item" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', display: 'block' }}>
                <b>Venue:</b> {[t.venueAddress, t.venuePincode, t.venuePhone].filter(Boolean).join(', ')}
              </span>
            </div>
          )}

          {(t.ballBrand || t.hasFloodlights) && (
            <div className="t-fs-row">
              {t.ballBrand && <span className="t-fs-item"><b>Balls:</b> {t.ballBrand}</span>}
              {t.hasFloodlights && <span className="t-fs-item">Floodlights available</span>}
            </div>
          )}

          {(t.entryFeeSingles || t.entryFeeDoubles || t.dailyAllowance) && (
            <div className="t-fs-row">
              {t.entryFeeSingles && <span className="t-fs-item"><b>Singles entry:</b> ₹{t.entryFeeSingles}</span>}
              {t.entryFeeDoubles && <span className="t-fs-item"><b>Doubles entry:</b> ₹{t.entryFeeDoubles}</span>}
              {t.dailyAllowance && <span className="t-fs-item"><b>Daily allowance:</b> ₹{t.dailyAllowance}</span>}
            </div>
          )}

          {t.signinInstructions && (
            <div className="t-fs-row">
              <span className="t-fs-item" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                <b>Sign-in:</b> {t.signinInstructions}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '16px' }}>
          {t.factsheetUrl && (
            <a className="action-btn primary" href={t.factsheetUrl} target="_blank" rel="noopener noreferrer">
              ⬇ Download Fact Sheet (PDF)
            </a>
          )}
          {t.sourceUrl && (
            <a className="action-btn" href={t.sourceUrl} target="_blank" rel="noopener noreferrer">
              View on AITA site ↗
            </a>
          )}
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
