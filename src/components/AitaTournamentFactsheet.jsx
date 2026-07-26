import { useState } from 'react';

// Some scraped factsheet fields (venueAddress, signinInstructions) have been
// known to balloon into a dump of the entire remaining PDF text when the
// sync parser's end-label match fails (see sync-aita-calendar/index.ts —
// MAX_VALUE_LEN was added there for exactly this). This is a client-side
// backstop for any such rows still sitting in the DB from before that fix.
const TRUNCATE_AT = 220;

function Field({ label, value, href }) {
  if (!value) return null;
  return (
    <div className="t-field-row">
      <span className="t-field-label">{label}</span>
      {href
        ? <a className="t-field-value t-field-link" href={href}>{value}</a>
        : <span className="t-field-value">{value}</span>}
    </div>
  );
}

function TruncatableField({ label, value }) {
  const [expanded, setExpanded] = useState(false);
  if (!value) return null;
  const isLong = value.length > TRUNCATE_AT;
  const shown = !isLong || expanded ? value : `${value.slice(0, TRUNCATE_AT).trimEnd()}…`;
  return (
    <div className="t-field-row">
      <span className="t-field-label">{label}</span>
      <span className="t-field-value" style={{ whiteSpace: 'pre-wrap' }}>{shown}</span>
      {isLong && (
        <button type="button" className="t-field-toggle" onClick={() => setExpanded(e => !e)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function Section({ title, hasContent, children }) {
  if (!hasContent) return null;
  return (
    <div className="t-fs-section">
      <div className="t-section-title">{title}</div>
      {children}
    </div>
  );
}

// Presentational fact-sheet body for one AITA tournament — shared by the
// full-page view (AitaTournamentFactsheetPage, for direct/shared links) and
// the quick-view modal opened from tile clicks on AitaCalendarPage.
export default function AitaTournamentFactsheet({ t }) {
  const hasDates = t.entryDeadline || t.withdrawalDeadline || t.qualifyingStartDate;
  const hasFees = t.entryFeeSingles || t.entryFeeDoubles || t.dailyAllowance || t.drawSize;
  const hasDirector = t.directorName || t.directorPhone || t.directorEmail;
  const hasReferee = t.refereeName || t.refereePhone || t.refereeEmail;
  const hasVenue = t.venueAddress || t.venuePincode || t.venuePhone || t.surface || t.ballBrand || t.hasFloodlights;

  return (
    <div className="t-factsheet-body">
      <div className="t-week-info-bar" style={{ padding: '0 0 10px' }}>
        {t.surface && <span className="t-badge">{t.surface}</span>}
        {t.grade && <span className="t-badge t-badge-grade">{t.grade}</span>}
        {t.ageGroup && <span className="t-badge">{t.ageGroup}</span>}
        {(t.city || t.venue) && (
          <span className="t-info-item">{[t.venue, t.city].filter(Boolean).join(', ')}</span>
        )}
        {t.startDate && <span className="t-info-item">{t.startDate}</span>}
      </div>

      <Section title="Key Dates" hasContent={hasDates}>
        <div className="t-fs-card">
          <Field label="Entry deadline" value={t.entryDeadline} />
          <Field label="Withdrawal deadline" value={t.withdrawalDeadline} />
          {(t.qualifyingStartDate || t.qualifyingEndDate) && (
            <Field
              label="Qualifying"
              value={
                t.qualifyingEndDate && t.qualifyingEndDate !== t.qualifyingStartDate
                  ? `${t.qualifyingStartDate} – ${t.qualifyingEndDate}`
                  : t.qualifyingStartDate
              }
            />
          )}
        </div>
      </Section>

      <Section title="Entry Fees & Draw" hasContent={hasFees}>
        <div className="t-fs-card">
          <Field label="Singles entry" value={t.entryFeeSingles ? `₹${t.entryFeeSingles}` : ''} />
          <Field label="Doubles entry" value={t.entryFeeDoubles ? `₹${t.entryFeeDoubles}` : ''} />
          <Field label="Daily allowance" value={t.dailyAllowance ? `₹${t.dailyAllowance}` : ''} />
          <Field label="Draw size" value={t.drawSize} />
        </div>
      </Section>

      <Section title="Contacts" hasContent={hasDirector || hasReferee}>
        <div className="t-fs-grid-2">
          {hasDirector && (
            <div className="t-fs-card">
              <div className="t-field-label" style={{ marginBottom: 4 }}>Director</div>
              <Field label="Name" value={t.directorName} />
              <Field label="Phone" value={t.directorPhone} href={t.directorPhone ? `tel:${t.directorPhone}` : undefined} />
              <Field label="Email" value={t.directorEmail} href={t.directorEmail ? `mailto:${t.directorEmail}` : undefined} />
            </div>
          )}
          {hasReferee && (
            <div className="t-fs-card">
              <div className="t-field-label" style={{ marginBottom: 4 }}>Referee</div>
              <Field label="Name" value={t.refereeName} />
              <Field label="Phone" value={t.refereePhone} href={t.refereePhone ? `tel:${t.refereePhone}` : undefined} />
              <Field label="Email" value={t.refereeEmail} href={t.refereeEmail ? `mailto:${t.refereeEmail}` : undefined} />
            </div>
          )}
        </div>
      </Section>

      <Section title="Venue" hasContent={hasVenue}>
        <div className="t-fs-card">
          <TruncatableField label="Address" value={t.venueAddress} />
          <Field label="Pincode" value={t.venuePincode} />
          <Field label="Phone" value={t.venuePhone} href={t.venuePhone ? `tel:${t.venuePhone}` : undefined} />
          <Field label="Ball brand" value={t.ballBrand} />
          <Field label="Floodlights" value={t.hasFloodlights ? 'Available' : ''} />
        </div>
      </Section>

      <Section title="Sign-in" hasContent={!!t.signinInstructions}>
        <div className="t-fs-card">
          <TruncatableField label="Instructions" value={t.signinInstructions} />
        </div>
      </Section>

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
    </div>
  );
}
