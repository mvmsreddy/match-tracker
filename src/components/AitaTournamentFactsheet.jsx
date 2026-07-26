// Presentational fact-sheet body for one AITA tournament — shared by the
// full-page view (AitaTournamentFactsheetPage, for direct/shared links) and
// the quick-view modal opened from tile clicks on AitaCalendarPage.
export default function AitaTournamentFactsheet({ t }) {
  return (
    <>
      <div className="t-week-info-bar" style={{ padding: '0 0 10px' }}>
        {t.surface && <span className="t-badge">{t.surface}</span>}
        {t.grade && <span className="t-badge t-badge-grade">{t.grade}</span>}
        {t.ageGroup && <span className="t-badge">{t.ageGroup}</span>}
        {(t.city || t.venue) && (
          <span className="t-info-item">{[t.venue, t.city].filter(Boolean).join(', ')}</span>
        )}
        {t.startDate && <span className="t-info-item">{t.startDate}</span>}
      </div>

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

        {t.drawSize && (
          <div className="t-fs-row">
            <span className="t-fs-item"><b>Draw size:</b> {t.drawSize}</span>
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

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '16px 0 0' }}>
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
    </>
  );
}
