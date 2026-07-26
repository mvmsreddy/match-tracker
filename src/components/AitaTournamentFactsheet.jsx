import { useState } from 'react';

// Scraped factsheet fields can balloon into a dump of the entire remaining
// PDF text when the sync parser's end-label match fails on a given PDF
// (seen live in both venueAddress and venuePhone — see sync-aita-calendar
// /index.ts's MAX_VALUE_LEN, added there for exactly this). Every value
// rendered below goes through this cap as a client-side backstop, since any
// field can in principle be the one a given row's sync run mis-parsed.
const TRUNCATE_AT = 220;

// The sync parser only stores drawSize/signinInstructions as combined strings
// ("Qualifying 48B/32G · Main 64B/48G · Doubles 16" / "Qualifying sign-in:
// ...\nDoubles sign-in: ...") rather than a real per-event table — this
// reconstructs the official factsheet's "Draws & Sign-in Details" rows from
// those two strings so the layout can match the source PDF.
const DRAW_EVENT_LABELS = {
  qualifying: 'Singles Qualifying',
  main: 'Singles Main Draw',
  doubles: 'Doubles Main Draw',
};

function parseDrawEvents(drawSize, signinInstructions) {
  if (!drawSize) return [];
  const signins = {};
  (signinInstructions || '').split('\n').forEach(line => {
    const m = line.match(/^(Qualifying|Doubles) sign-in:\s*(.+)$/i);
    if (m) signins[m[1].toLowerCase()] = m[2].trim();
  });
  return drawSize.split('·').map(s => s.trim()).filter(Boolean).map(part => {
    const m = part.match(/^(Qualifying|Main|Doubles)\s+(.+)$/i);
    const key = m ? m[1].toLowerCase() : '';
    return {
      event: (key && DRAW_EVENT_LABELS[key]) || part,
      size: m ? m[2] : '',
      signIn: signins[key] || (key === 'main' ? 'NA' : ''),
    };
  });
}

function Banner({ children }) {
  return <div className="t-fs-banner">{children}</div>;
}

// Any scraped field can in principle be the one that ballooned (the sync
// parser's between()/betweenAny() label search can fail on any label, not
// just address/phone — those are just the two seen live so far). So every
// value cell goes through this, not just a hand-picked subset of fields —
// and a value long enough to need truncating is also long enough to not be
// a real phone/email anymore, so it drops the tel:/mailto: link too.
function FieldValue({ value, href }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = value.length > TRUNCATE_AT;
  if (href && !isLong) return <a className="t-field-link" href={href}>{value}</a>;
  const shown = !isLong || expanded ? value : `${value.slice(0, TRUNCATE_AT).trimEnd()}…`;
  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {shown}{' '}
      {isLong && (
        <button type="button" className="t-field-toggle" onClick={() => setExpanded(e => !e)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </span>
  );
}

function TableRow({ label, value, href, danger }) {
  if (!value) return null;
  return (
    <div className={`t-fs-tr${danger ? ' t-fs-tr-danger' : ''}`}>
      <div className="t-fs-td-label">{label}</div>
      <div className="t-fs-td-value"><FieldValue value={value} href={href} /></div>
    </div>
  );
}

function TableRowSplit({ pairs }) {
  const visible = pairs.filter(p => p.value);
  if (visible.length === 0) return null;
  return (
    <div className="t-fs-tr t-fs-tr-split">
      {visible.map((p) => (
        <div className="t-fs-half" key={p.label}>
          <div className="t-fs-td-label">{p.label}</div>
          <div className="t-fs-td-value"><FieldValue value={p.value} href={p.href} /></div>
        </div>
      ))}
    </div>
  );
}

function TableSection({ title, hasContent, children }) {
  if (!hasContent) return null;
  return (
    <div className="t-fs-section">
      <Banner>{title}</Banner>
      <div className="t-fs-table">{children}</div>
    </div>
  );
}

function GridTable({ columns, headers, rows }) {
  const style = { gridTemplateColumns: columns };
  return (
    <div className="t-fs-gridtable">
      <div className="t-fs-gridtable-head" style={style}>
        {headers.map(h => <div key={h}>{h}</div>)}
      </div>
      {rows.map((r, ri) => (
        <div className="t-fs-gridtable-row" style={style} key={ri}>
          {r.map((c, ci) => <div key={ci}>{c || '—'}</div>)}
        </div>
      ))}
    </div>
  );
}

// Presentational fact-sheet body for one AITA tournament — shared by the
// full-page view (AitaTournamentFactsheetPage, for direct/shared links) and
// the quick-view modal opened from tile clicks on AitaCalendarPage. Mirrors
// the section layout of the official AITA "Tournament Factsheet" PDF (Tour
// Info / Draws & Sign-in / Venue Details / Tournament Officials / Entry Fees
// / Daily Allowance) using only the fields the sync actually captures.
export default function AitaTournamentFactsheet({ t }) {
  const hasTourInfo = t.grade || t.ageGroup || t.entryDeadline || t.withdrawalDeadline || t.qualifyingStartDate;
  const drawEvents = parseDrawEvents(t.drawSize, t.signinInstructions);
  const hasVenue = t.venue || t.venueAddress || t.city || t.venuePincode || t.venuePhone || t.surface || t.ballBrand || t.hasFloodlights;
  const hasDirector = t.directorName || t.directorPhone || t.directorEmail;
  const hasReferee = t.refereeName || t.refereePhone || t.refereeEmail;
  const hasFees = t.entryFeeSingles || t.entryFeeDoubles;
  const leftoverSignin = drawEvents.length === 0 ? t.signinInstructions : '';

  return (
    <div className="t-factsheet-body">
      <div className="t-week-info-bar" style={{ padding: '0 0 10px' }}>
        {t.surface && <span className="t-badge">{t.surface}</span>}
        {(t.city || t.venue) && (
          <span className="t-info-item">{[t.venue, t.city].filter(Boolean).join(', ')}</span>
        )}
        {t.startDate && <span className="t-info-item">{t.startDate}</span>}
      </div>

      <TableSection title="Tour Info" hasContent={hasTourInfo}>
        <TableRow label="Tournament Category" value={t.grade} />
        <TableRow label="Age Group" value={t.ageGroup} />
        <TableRow label="Entry Deadline" value={t.entryDeadline} danger />
        <TableRow label="Withdrawal Deadline" value={t.withdrawalDeadline} danger />
        {(t.qualifyingStartDate || t.qualifyingEndDate) && (
          <TableRow
            label="Qualifying"
            value={
              t.qualifyingEndDate && t.qualifyingEndDate !== t.qualifyingStartDate
                ? `${t.qualifyingStartDate} – ${t.qualifyingEndDate}`
                : t.qualifyingStartDate
            }
          />
        )}
      </TableSection>

      {drawEvents.length > 0 && (
        <div className="t-fs-section">
          <Banner>Draws &amp; Sign-in Details</Banner>
          <GridTable
            columns="1.3fr 0.9fr 1.6fr"
            headers={['Event', 'Draw Size', 'Sign-in']}
            rows={drawEvents.map(e => [e.event, e.size, e.signIn])}
          />
        </div>
      )}

      <TableSection title="Venue Details" hasContent={hasVenue}>
        <TableRow label="Name of the Venue" value={t.venue} />
        <TableRow label="Address" value={t.venueAddress} />
        <TableRow label="City" value={t.city} />
        <TableRow label="Pincode" value={t.venuePincode} />
        <TableRow label="Telephone No." value={t.venuePhone} href={t.venuePhone ? `tel:${t.venuePhone}` : undefined} />
        <TableRowSplit pairs={[
          { label: 'Court Surface', value: t.surface },
          { label: 'Brand of Balls', value: t.ballBrand },
        ]} />
        <TableRow label="Floodlights" value={t.hasFloodlights ? 'Yes' : ''} />
      </TableSection>

      <TableSection title="Tournament Officials" hasContent={hasDirector || hasReferee}>
        {hasDirector && (
          <>
            <TableRow label="Tournament Director" value={t.directorName} />
            <TableRowSplit pairs={[
              { label: 'Mobile No.', value: t.directorPhone, href: t.directorPhone ? `tel:${t.directorPhone}` : undefined },
              { label: 'E-mail', value: t.directorEmail, href: t.directorEmail ? `mailto:${t.directorEmail}` : undefined },
            ]} />
          </>
        )}
        {hasReferee && (
          <>
            <TableRow label="Tournament Referee" value={t.refereeName} />
            <TableRowSplit pairs={[
              { label: 'Mobile No.', value: t.refereePhone, href: t.refereePhone ? `tel:${t.refereePhone}` : undefined },
              { label: 'E-mail', value: t.refereeEmail, href: t.refereeEmail ? `mailto:${t.refereeEmail}` : undefined },
            ]} />
          </>
        )}
      </TableSection>

      {hasFees && (
        <div className="t-fs-section">
          <Banner>Entry Fees</Banner>
          <GridTable
            columns="1.2fr 1fr 1.3fr"
            headers={['Series', 'Singles', 'Doubles (Each Pair)']}
            rows={[[
              t.grade || t.ageGroup || '—',
              t.entryFeeSingles ? `₹${t.entryFeeSingles}` : '—',
              t.entryFeeDoubles ? `₹${t.entryFeeDoubles}` : '—',
            ]]}
          />
        </div>
      )}

      {t.dailyAllowance && (
        <div className="t-fs-section">
          <Banner>Daily Allowance (Main Draw Players)</Banner>
          <GridTable
            columns="1.5fr 1fr"
            headers={['Tournament', 'DA Per Day']}
            rows={[[t.grade || t.ageGroup || '—', `₹${t.dailyAllowance}`]]}
          />
        </div>
      )}

      {leftoverSignin && (
        <div className="t-fs-section">
          <Banner>Sign-in</Banner>
          <div className="t-fs-table">
            <TableRow label="Instructions" value={leftoverSignin} />
          </div>
        </div>
      )}

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
