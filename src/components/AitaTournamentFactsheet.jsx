import { useState } from 'react';
import { cn } from '../lib/utils';
import { buttonVariants } from './primitives/button';

// Scraped factsheet fields can balloon into a dump of the entire remaining
// PDF text when the sync parser's end-label match fails on a given PDF
// (seen live in venueAddress, then venuePhone on a different row — see
// sync-aita-calendar/index.ts's MAX_VALUE_LEN, added there for exactly
// this). Every value rendered below goes through this cap as a client-side
// backstop, since any field can in principle be the one a given row's sync
// run mis-parsed.
const TRUNCATE_AT = 220;

const URL_RE = /https?:\/\/\S+/g;
const MAPS_URL_RE = /maps\.(app\.)?goo\.gl|google\.[a-z.]+\/maps/i;

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

// ---------------------------------------------------------------------------
// "Leaked blob" salvage — when a sync run's between()/betweenAny() end-label
// search fails, the field it was extracting doesn't just get too long, it
// gets the rest of the official factsheet's text dumped into it verbatim
// (section headers and all). Rather than only truncating that mess, pull the
// real facts back out of it — this recovers info (draw first/last days,
// tournament week, a venue map link) that no column in the DB even has a
// place for otherwise.
// ---------------------------------------------------------------------------
const LEAK_SIGNATURE_RE = /TOUR INFO|VENUE DETAILS|DRAWS\s*&?\s*SIGN[- ]?IN|TOURNAMENT OFFICIALS/i;

function findLeakedBlob(t) {
  const candidates = [t.venueAddress, t.venuePhone, t.ballBrand, t.directorName, t.refereeName, t.signinInstructions, t.venue];
  return candidates.find(c => c && LEAK_SIGNATURE_RE.test(c)) || '';
}

// Same "cap it instead" fix as sync-aita-calendar/index.ts's MAX_VALUE_LEN —
// when none of the given end labels are found (a field that's absent on
// this particular tournament's template, e.g. no LOCATION line), this used
// to fall through to text.length and swallow everything after the start
// label. Confirmed live: EMAIL ID did exactly that when a venue had no
// LOCATION link to stop at.
const MAX_EXTRACT_LEN = 400;

function between(text, startLabel, endLabels) {
  const si = text.indexOf(startLabel);
  if (si === -1) return '';
  const valueStart = si + startLabel.length;
  let ei = -1;
  for (const label of endLabels) {
    const idx = text.indexOf(label, valueStart);
    if (idx !== -1 && (ei === -1 || idx < ei)) ei = idx;
  }
  if (ei === -1) ei = Math.min(valueStart + MAX_EXTRACT_LEN, text.length);
  return text.slice(valueStart, ei).replace(/\s+/g, ' ').trim();
}

function parseLeakedDraws(raw) {
  const startIdx = raw.search(/DRAWS\s*&?\s*SIGN[- ]?IN/i);
  if (startIdx === -1) return [];
  const venueIdx = raw.indexOf('VENUE DETAILS');
  const segment = raw.slice(startIdx, venueIdx !== -1 ? venueIdx : undefined);
  const eventRe = /(SINGLES QUALIFYING|SINGLES MAIN DRAW|DOUBLES MAIN DRAW)/gi;
  const marks = [...segment.matchAll(eventRe)];
  return marks.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : segment.length;
    const chunk = segment.slice(start, end).replace(/\s+/g, ' ').trim();
    const dateHits = chunk.match(/\d{2}-\d{2}-\d{4}/g) || [];
    const lastDay = dateHits[dateHits.length - 1] || '';
    const firstDay = dateHits.length > 1 ? dateHits[dateHits.length - 2] : '';
    const sizeMatch = chunk.match(/^(OPEN|\d+)/i);
    const size = sizeMatch ? sizeMatch[1] : '';
    let signIn = size ? chunk.slice(size.length) : chunk;
    if (lastDay) signIn = signIn.slice(0, signIn.lastIndexOf(lastDay));
    if (firstDay) signIn = signIn.slice(0, signIn.lastIndexOf(firstDay));
    return { event: m[1].replace(/\s+/g, ' '), size, signIn: signIn.trim(), firstDay, lastDay };
  });
}

function parseLeakedDetails(raw) {
  if (!raw || !LEAK_SIGNATURE_RE.test(raw)) return null;

  const week = between(raw, 'TOURNAMENT WEEK', ['TOURNAMENT DATES']);
  const dateRange = between(raw, 'TOURNAMENT DATES', ['TOURNAMENT CITY']);

  const urls = raw.match(URL_RE) || [];
  const entryUrl = urls.find(u => /aitatennis\.com/i.test(u)) || '';
  const mapUrl = urls.find(u => MAPS_URL_RE.test(u)) || urls.find(u => u !== entryUrl) || '';

  const draws = parseLeakedDraws(raw);

  const venueIdx = raw.indexOf('VENUE DETAILS');
  let venueName = '', venueAddress = '', pincode = '', phone = '', email = '', matchCourts = '';
  if (venueIdx !== -1) {
    const segment = raw.slice(venueIdx);
    venueName = between(segment, 'NAME OF THE VENUE', ['ADDRESS OF THE VENUE']);
    venueAddress = between(segment, 'ADDRESS OF THE VENUE', ['PINCODE', 'CITY', 'TELEPHONE NO.']).replace(/,\s*$/, '');
    pincode = between(segment, 'PINCODE', ['TELEPHONE NO.']);
    phone = between(segment, 'TELEPHONE NO.', ['EMAIL ID', 'LOCATION', 'COURT SURFACE']);
    email = between(segment, 'EMAIL ID', ['LOCATION', 'COURT SURFACE', 'TOURNAMENT OFFICIALS']);
    matchCourts = between(segment, 'NO. OF MATCH COURTS', ['FLOODLIGHTS', 'TOURNAMENT OFFICIALS']);
  }

  const hotels = parseLeakedHotels(raw);

  // "AGE ELIGIBILITY CATEGORY ELIGIBLE DOB UNDER 18 1/1/2008 – 31/12/2013" —
  // read straight off the template, never computed, since AITA's age-cutoff
  // rules are exactly the kind of thing that shouldn't be guessed at when
  // real entry eligibility rides on it.
  const ageEligMatch = raw.match(/AGE ELIGIBILITY\s*CATEGORY\s*ELIGIBLE\s*DOB\s+([A-Z0-9 &-]+?)\s+(\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4})/i);
  const ageEligibility = ageEligMatch ? { category: ageEligMatch[1].trim(), dob: ageEligMatch[2].replace(/\s+/g, ' ').trim() } : null;

  const hasAny = week || dateRange || draws.length > 0 || venueName || venueAddress || pincode || phone || email || matchCourts || mapUrl || entryUrl || hotels.length > 0 || ageEligibility;
  return hasAny ? { week, dateRange, entryUrl, mapUrl, draws, venueName, venueAddress, pincode, phone, email, matchCourts, hotels, ageEligibility } : null;
}

// Hotel/accommodation info has no DB column at all — this is pure upside
// when a leaked field happens to carry it. Two template variants seen so
// far ("SINGLE/DOUBLE ROOM RATE (₹)" vs "Non Ac Room"/"Ac Room" rows), so
// rates+breakfast+distance are kept as one free-text tail per hotel rather
// than split into precise cells that would only be right for one variant.
function parseLeakedHotels(raw) {
  const marks = [...raw.matchAll(/HOTEL\s*\d*\s*INFORMATION/gi)];
  if (marks.length === 0) return [];
  const stopIdx = raw.search(/ENTRY FEES|AGE ELIGIBILITY|AITA Registration Card/i);
  return marks.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : (stopIdx !== -1 ? stopIdx : raw.length);
    const chunk = raw.slice(start, end);
    const name = between(chunk, 'NAME OF HOTEL', ['ADDRESS', 'CONTACT PERSON']);
    const address = between(chunk, 'ADDRESS', ['PHONE NO.', 'CONTACT PERSON']);
    const phone = between(chunk, 'PHONE NO.', ['E-MAIL', 'CONTACT PERSON']);
    const contactPerson = between(chunk, 'CONTACT PERSON FOR RESERVATION', ['CONTACT PERSON PHONE', 'SINGLE ROOM', 'Non Ac', 'Rs ']);
    const notes = between(chunk, 'CONTACT PERSON PHONE NO.', []);
    return { name, address, phone, contactPerson, notes };
  }).filter(h => h.name);
}

function findDrawEvent(events, matcher) {
  return events.find(e => matcher(e.event.toLowerCase())) || null;
}

function formatDateRange(first, last) {
  if (first && last) return first === last ? first : `${first} – ${last}`;
  return first || last || '';
}

function Banner({ children }) {
  return (
    <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/40">
      {children}
    </div>
  );
}

// Any scraped field can in principle be the one that ballooned, so every
// value cell goes through this — not just a hand-picked subset of fields.
// A value long enough to need truncating is also long enough to no longer
// be a real phone/email, so it drops the tel:/mailto: link in that case.
// URLs found inside a value (e.g. a venue's Google Maps link) are always
// pulled out and shown as their own clickable line, never left buried
// inside truncated or expanded text.
function FieldValue({ value, href }) {
  const [expanded, setExpanded] = useState(false);
  const urls = value.match(URL_RE) || [];
  const textOnly = urls.length ? value.replace(URL_RE, ' ').replace(/\s+/g, ' ').trim() : value;
  const isLong = textOnly.length > TRUNCATE_AT;
  const linkable = href && !isLong;
  const shown = !isLong || expanded ? textOnly : `${textOnly.slice(0, TRUNCATE_AT).trimEnd()}…`;
  return (
    <span className="whitespace-pre-wrap">
      {linkable ? <a className="text-primary underline underline-offset-2 hover:no-underline" href={href}>{shown}</a> : shown}
      {isLong && (
        <>
          {' '}
          <button type="button" className="text-primary text-xs font-semibold hover:underline" onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </>
      )}
      {urls.map(u => (
        <div key={u} className="mt-1">
          <a className="text-primary underline underline-offset-2 hover:no-underline" href={u} target="_blank" rel="noopener noreferrer">
            {MAPS_URL_RE.test(u) ? '📍 Open in Google Maps ↗' : `${u.length > 46 ? `${u.slice(0, 46)}…` : u} ↗`}
          </a>
        </div>
      ))}
    </span>
  );
}

function TableRow({ label, value, href, danger }) {
  if (!value) return null;
  return (
    <div className={cn('grid grid-cols-[160px_1fr] gap-3 px-4 py-2 text-sm border-b border-border last:border-0', danger && 'bg-destructive/5')}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn(danger && 'text-destructive font-semibold')}><FieldValue value={value} href={href} /></div>
    </div>
  );
}

function TableRowSplit({ pairs }) {
  const visible = pairs.filter(p => p.value);
  if (visible.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-4 px-4 py-2 border-b border-border last:border-0">
      {visible.map((p) => (
        <div key={p.label}>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{p.label}</div>
          <div className="text-sm"><FieldValue value={p.value} href={p.href} /></div>
        </div>
      ))}
    </div>
  );
}

function TableSection({ title, hasContent, children }) {
  if (!hasContent) return null;
  return (
    <div className="rounded-sm border border-border bg-card overflow-hidden">
      <Banner>{title}</Banner>
      <div>{children}</div>
    </div>
  );
}

function GridTable({ columns, headers, rows }) {
  const style = { gridTemplateColumns: columns };
  return (
    <div className="text-sm">
      <div className="grid bg-muted/40 text-xs font-bold uppercase tracking-wide text-muted-foreground border-b border-border" style={style}>
        {headers.map(h => <div key={h} className="px-4 py-2">{h}</div>)}
      </div>
      {rows.map((r, ri) => (
        <div className="grid border-b border-border last:border-0" style={style} key={ri}>
          {r.map((c, ci) => <div key={ci} className="px-4 py-2">{c || '—'}</div>)}
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
// / Daily Allowance), filled from the sync's normal columns and topped up
// with whatever parseLeakedDetails() can recover when one of those columns
// turns out to hold a mis-parsed dump instead of its real value.
export default function AitaTournamentFactsheet({ t }) {
  const leakedBlob = findLeakedBlob(t);
  const leaked = parseLeakedDetails(leakedBlob);

  // If a specific column's raw value IS the leaked blob, show the cleanly
  // recovered sub-value there instead of the whole dump.
  const venueName = t.venue || leaked?.venueName || '';
  const venueAddress = (t.venueAddress === leakedBlob && leaked?.venueAddress) ? leaked.venueAddress : t.venueAddress;
  const venuePincode = t.venuePincode || leaked?.pincode || '';
  const venuePhone = (t.venuePhone === leakedBlob && leaked?.phone) ? leaked.phone : t.venuePhone;
  const venueEmail = leaked?.email || '';
  const venuePhoneHref = venuePhone && venuePhone.length < 40 ? `tel:${venuePhone.split('/')[0].replace(/[^\d+]/g, '')}` : undefined;

  const combinedDraws = parseDrawEvents(t.drawSize, t.signinInstructions);
  const drawEvents = leaked?.draws?.length ? leaked.draws : combinedDraws;
  const drawsHaveDayCols = drawEvents.some(e => e.firstDay || e.lastDay);
  const qualifyingDraw = findDrawEvent(drawEvents, e => e.includes('qualifying'));
  const mainSinglesDraw = findDrawEvent(drawEvents, e => e.includes('main') && !e.includes('doubles'));
  const mainDoublesDraw = findDrawEvent(drawEvents, e => e.includes('doubles'));

  const hasTourInfo = t.grade || t.ageGroup || t.entryDeadline || t.withdrawalDeadline || t.qualifyingStartDate
    || leaked?.week || leaked?.dateRange || qualifyingDraw || mainSinglesDraw || mainDoublesDraw;
  const hasVenue = venueName || venueAddress || t.city || venuePincode || venuePhone || venueEmail || t.surface || t.ballBrand || t.hasFloodlights || leaked?.mapUrl;
  const hasDirector = t.directorName || t.directorPhone || t.directorEmail;
  const hasReferee = t.refereeName || t.refereePhone || t.refereeEmail;
  const hasFees = t.entryFeeSingles || t.entryFeeDoubles;
  const leftoverSignin = drawEvents.length === 0 ? t.signinInstructions : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 pb-1">
        {t.surface && (
          <span className="inline-flex items-center rounded-sm border border-transparent bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
            {t.surface}
          </span>
        )}
        {(t.city || t.venue) && (
          <span className="text-sm text-muted-foreground">{[t.venue, t.city].filter(Boolean).join(', ')}</span>
        )}
        {t.startDate && <span className="text-sm text-muted-foreground">{t.startDate}</span>}
      </div>

      <TableSection title="Tour Info" hasContent={hasTourInfo}>
        <TableRow label="Tournament Category" value={t.grade} />
        <TableRow label="Age Group" value={t.ageGroup} />
        <TableRow label="Tournament Week" value={leaked?.week} />
        <TableRow label="Tournament Dates" value={leaked?.dateRange} />
        <TableRow label="Entry Deadline" value={t.entryDeadline} danger />
        <TableRow label="Withdrawal Deadline" value={t.withdrawalDeadline} danger />
        <TableRow
          label="Qualifying Dates"
          value={
            (t.qualifyingStartDate || t.qualifyingEndDate)
              ? (t.qualifyingEndDate && t.qualifyingEndDate !== t.qualifyingStartDate
                ? `${t.qualifyingStartDate} – ${t.qualifyingEndDate}`
                : t.qualifyingStartDate)
              : formatDateRange(qualifyingDraw?.firstDay, qualifyingDraw?.lastDay)
          }
        />
        <TableRow label="Qualifying Sign-in" value={qualifyingDraw?.signIn && qualifyingDraw.signIn !== 'NA' ? qualifyingDraw.signIn : ''} />
        <TableRow label="Qualifying Draw Size" value={qualifyingDraw?.size} />
        <TableRow label="Main Draw (Singles) Dates" value={formatDateRange(mainSinglesDraw?.firstDay, mainSinglesDraw?.lastDay)} />
        <TableRow label="Main Draw (Singles) Sign-in" value={mainSinglesDraw?.signIn && mainSinglesDraw.signIn !== 'NA' ? mainSinglesDraw.signIn : ''} />
        <TableRow label="Main Draw (Singles) Draw Size" value={mainSinglesDraw?.size} />
        <TableRow label="Main Draw (Doubles) Dates" value={formatDateRange(mainDoublesDraw?.firstDay, mainDoublesDraw?.lastDay)} />
        <TableRow label="Main Draw (Doubles) Sign-in" value={mainDoublesDraw?.signIn && mainDoublesDraw.signIn !== 'NA' ? mainDoublesDraw.signIn : ''} />
        <TableRow label="Main Draw (Doubles) Draw Size" value={mainDoublesDraw?.size} />
        <TableRow label="Online Entry" value={leaked?.entryUrl ? 'Enter online at aitatennis.com' : ''} href={leaked?.entryUrl} />
      </TableSection>

      {drawEvents.length > 0 && (
        <div className="rounded-sm border border-border bg-card overflow-hidden">
          <Banner>Draws &amp; Sign-in Details</Banner>
          <GridTable
            columns={drawsHaveDayCols ? '1.1fr 0.7fr 1.3fr 0.8fr 0.8fr' : '1.3fr 0.9fr 1.6fr'}
            headers={drawsHaveDayCols ? ['Event', 'Draw Size', 'Sign-in', 'First Day', 'Last Day'] : ['Event', 'Draw Size', 'Sign-in']}
            rows={drawEvents.map(e => drawsHaveDayCols ? [e.event, e.size, e.signIn, e.firstDay, e.lastDay] : [e.event, e.size, e.signIn])}
          />
        </div>
      )}

      <TableSection title="Venue Details" hasContent={hasVenue}>
        <TableRow label="Name of the Venue" value={venueName} />
        <TableRow label="Address" value={venueAddress} />
        <TableRow label="City" value={t.city} />
        <TableRow label="Pincode" value={venuePincode} />
        <TableRow label="Telephone No." value={venuePhone} href={venuePhoneHref} />
        <TableRow label="Email ID" value={venueEmail} href={venueEmail ? `mailto:${venueEmail}` : undefined} />
        <TableRow label="Location" value={leaked?.mapUrl ? 'Open in Google Maps' : ''} href={leaked?.mapUrl} />
        <TableRowSplit pairs={[
          { label: 'Court Surface', value: t.surface },
          { label: 'Brand of Balls', value: t.ballBrand },
        ]} />
        <TableRow label="No. of Match Courts" value={leaked?.matchCourts} />
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
        <div className="rounded-sm border border-border bg-card overflow-hidden">
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

      {leaked?.hotels?.length > 0 && (
        <div className="rounded-sm border border-border bg-card overflow-hidden">
          <Banner>Accommodation</Banner>
          {leaked.hotels.map((h, i) => (
            <div className={cn(i < leaked.hotels.length - 1 && 'border-b-4 border-background')} key={h.name || i}>
              <TableRow label="Hotel" value={h.name} />
              <TableRow label="Address" value={h.address} />
              <TableRow label="Phone" value={h.phone} href={h.phone ? `tel:${h.phone.split(/[,/]/)[0].replace(/[^\d+]/g, '')}` : undefined} />
              <TableRow label="Contact Person" value={h.contactPerson} />
              <TableRow label="Rates & Notes" value={h.notes} />
            </div>
          ))}
        </div>
      )}

      {leaked?.ageEligibility && (
        <div className="rounded-sm border border-border bg-card overflow-hidden">
          <Banner>Age Eligibility</Banner>
          <GridTable
            columns="1.5fr 1fr"
            headers={['Category', 'Eligible DOB']}
            rows={[[leaked.ageEligibility.category, leaked.ageEligibility.dob]]}
          />
        </div>
      )}

      {t.dailyAllowance && (
        <div className="rounded-sm border border-border bg-card overflow-hidden">
          <Banner>Daily Allowance (Main Draw Players)</Banner>
          <GridTable
            columns="1.5fr 1fr"
            headers={['Tournament', 'DA Per Day']}
            rows={[[t.grade || t.ageGroup || '—', `₹${t.dailyAllowance}`]]}
          />
        </div>
      )}

      {leftoverSignin && (
        <div className="rounded-sm border border-border bg-card overflow-hidden">
          <Banner>Sign-in</Banner>
          <TableRow label="Instructions" value={leftoverSignin} />
        </div>
      )}

      {leaked && (
        <div className="text-xs text-muted-foreground">
          Some fields above were recovered from a mis-synced field — cross-check against the official PDF if anything looks off.
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {t.factsheetUrl && (
          <a className={buttonVariants({ size: 'sm' })} href={t.factsheetUrl} target="_blank" rel="noopener noreferrer">
            ⬇ Download Fact Sheet (PDF)
          </a>
        )}
        {t.sourceUrl && (
          <a className={buttonVariants({ variant: 'outline', size: 'sm' })} href={t.sourceUrl} target="_blank" rel="noopener noreferrer">
            View on AITA site ↗
          </a>
        )}
      </div>
    </div>
  );
}
