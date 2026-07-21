// ============================================================
// Draw Sheet PDF generator — AITA format
// Uses jsPDF (already a project dependency).
// Pure function, no side-effects beyond triggering file download.
// ============================================================
import jsPDF from 'jspdf';
import { bracketSize } from './aitaGradeRules';

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------
// posY(p)        — y of position-line for player at draw position p (1-based)
// midY(r, s)     — y of the winner/connector line for round r, match slot s
// bracketTopY    — top of vertical bracket for round r, slot s
// bracketBotY    — bottom of vertical bracket for round r, slot s
// ---------------------------------------------------------------------------

function makeHelpers(drawTop, slotH) {
  const posY = p => drawTop + p * slotH;

  // midPos(r,s) = (firstPos + lastPos) / 2 where firstPos = (s-1)*2^r + 1, lastPos = s*2^r
  //             = (2s-1) * 2^(r-1) + 0.5
  const midY = (r, s) => drawTop + ((2 * s - 1) * Math.pow(2, r - 1) + 0.5) * slotH;

  const bracketTopY = (r, s) => (r === 1 ? posY(2 * s - 1) : midY(r - 1, 2 * s - 1));
  const bracketBotY = (r, s) => (r === 1 ? posY(2 * s)     : midY(r - 1, 2 * s));

  return { posY, midY, bracketTopY, bracketBotY };
}

// ---------------------------------------------------------------------------
// Round label helper
// ---------------------------------------------------------------------------
// Qualifying draws stop at the "deciding round" (enough winners to fill the
// promotion spots) rather than running to a single champion — real AITA
// qualifying sheets only ever say "Finals" for the last round, never QF/SF.
function roundLabel(r, totalRounds, isQualifying) {
  const fromEnd = totalRounds - r;
  if (isQualifying) {
    return fromEnd === 0 ? 'FINALS' : `ROUND ${r}`;
  }
  if (fromEnd === 0) return 'FINAL';
  if (fromEnd === 1) return 'SEMI-FINALS';
  if (fromEnd === 2) return 'QUARTER-FINALS';
  return `ROUND ${r}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function generateDrawSheetPDF({ event, week, entries, matches }) {
  const drawSize = entries.length; // actual filled draw size (already padded to a power of two)
  if (drawSize < 2) return;
  const isQualifying = event.drawType === 'qualifying';
  const fullRounds = Math.ceil(Math.log2(drawSize));
  const decidingRound = (isQualifying && event.qualifyingSize && event.qualifyingSpots)
    ? Math.round(Math.log2(bracketSize(event.qualifyingSize) / event.qualifyingSpots))
    : 0;
  const totalRounds = (isQualifying && decidingRound > 0) ? Math.min(decidingRound, fullRounds) : fullRounds;

  // Page setup — landscape for 32+ draws
  const landscape = drawSize >= 32;
  const doc = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW   = landscape ? 297 : 210;
  const pageH   = landscape ? 210 : 297;
  const margin  = 12;
  const headerH = 26;
  const footerH = 8;
  const posColW = 8;   // left column for position numbers

  const drawTop = margin + headerH;
  const drawH   = pageH - drawTop - footerH - margin;
  const drawW   = pageW - 2 * margin - posColW;
  const slotH   = drawH / drawSize;
  // Cap column width so low-round-count draws (e.g. a 2-round qualifying
  // sheet) don't stretch each column across the whole page — that pushes the
  // bracket connector far right, disconnected from its round's label. 42mm
  // is enough for a full name + state at this font size with no overlap.
  const MAX_COL_W = 42;
  const colW    = Math.min(MAX_COL_W, drawW / totalRounds);

  const colX   = r => margin + posColW + (r - 1) * colW;
  const brackX = r => colX(r) + colW * 0.80;

  const { posY, midY, bracketTopY, bracketBotY } = makeHelpers(drawTop, slotH);

  // Data maps
  const entryByPos = new Map(entries.map(e => [e.position, e]));
  const entryById  = new Map(entries.map(e => [e.id,       e]));
  const matchByKey = new Map((matches || []).map(m => [`${m.round}-${m.matchSlot}`, m]));

  // ---- HEADER ----------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(week.name || 'Tournament', pageW / 2, margin + 7, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const drawTypeLabel = event.drawType === 'qualifying' ? ' — Qualifying Draw' : '';
  doc.text(`${event.category} · ${event.ageGroup}${drawTypeLabel}`, pageW / 2, margin + 13, { align: 'center' });

  const locParts  = [week.city, week.stateAbbr].filter(Boolean).join(', ');
  const dateParts = week.startDate
    ? (week.endDate && week.endDate !== week.startDate
        ? `${week.startDate} – ${week.endDate}`
        : week.startDate)
    : '';
  const subLine = [locParts, dateParts].filter(Boolean).join(' · ');
  if (subLine) {
    doc.setFontSize(7.5);
    doc.text(subLine, pageW / 2, margin + 19, { align: 'center' });
  }

  // Header rule
  doc.setLineWidth(0.5);
  doc.setDrawColor(0, 0, 0);
  doc.line(margin, drawTop - 2, pageW - margin, drawTop - 2);

  // Draw size info (top-left) + Grade (top-right)
  doc.setFontSize(6);
  doc.setTextColor(120, 120, 120);
  doc.text(`Draw of ${drawSize}`, margin, drawTop - 3.5);
  if (week.grade) {
    doc.text(week.grade, pageW - margin, drawTop - 3.5, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);

  // ---- ROUND LABELS ----------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(80, 80, 80);
  for (let r = 1; r <= totalRounds; r++) {
    const lbl = roundLabel(r, totalRounds, isQualifying);
    doc.text(lbl, colX(r) + colW / 2, drawTop - 3, { align: 'center' });
  }
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  // ---- R1 PLAYER POSITION LINES ----------------------------------------------
  doc.setLineWidth(0.22);
  doc.setDrawColor(60, 60, 60);

  for (let pos = 1; pos <= drawSize; pos++) {
    const y  = posY(pos);
    const x0 = colX(1);
    const x1 = brackX(1);

    // Position number
    doc.setFontSize(5.5);
    doc.setTextColor(160, 160, 160);
    doc.text(String(pos), x0 - 1.5, y - 0.6, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // Horizontal line
    doc.line(x0, y, x1, y);

    // Player text
    const entry = entryByPos.get(pos);
    if (!entry) continue;

    if (entry.isBye) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6);
      doc.setTextColor(190, 190, 190);
      doc.text('BYE', x0 + 1.5, y - 1);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
    } else {
      const isSeed = !!entry.seed;
      doc.setFont('helvetica', isSeed ? 'bold' : 'normal');
      doc.setFontSize(6.5);
      if (entry.isWithdrawn) doc.setTextColor(180, 180, 180);

      let text = isSeed ? `[${entry.seed}]  ` : '';
      text += entry.familyName || '';
      if (entry.firstName) text += `, ${entry.firstName.charAt(0)}.`;
      if (entry.playerState) text += `  (${entry.playerState})`;
      if (entry.statusCode && entry.statusCode !== '') text += `  ${entry.statusCode}`;
      if (entry.isAlternate) text += '  (ALT)';
      if (entry.isWithdrawn) text += '  (WD)';

      doc.text(text, x0 + 1.5, y - 1);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
    }
  }

  // ---- BRACKET LINES (all rounds) --------------------------------------------
  doc.setLineWidth(0.22);
  doc.setDrawColor(60, 60, 60);

  for (let r = 1; r <= totalRounds; r++) {
    const matchCount = drawSize / Math.pow(2, r);
    const xB   = brackX(r);
    // Qualifying draws end in several simultaneous "Finals" matches, not one
    // champion — so the last round's stub only needs to span its own column,
    // not run all the way to the page edge (that's reserved for the main
    // draw's single-champion connector, which the CHAMPION label sits at).
    const xOut = r < totalRounds
      ? colX(r + 1)
      : (isQualifying ? colX(r) + colW : pageW - margin - 2);

    for (let s = 1; s <= matchCount; s++) {
      const tY = bracketTopY(r, s);
      const bY = bracketBotY(r, s);
      const mY = midY(r, s);

      // Vertical bracket
      doc.line(xB, tY, xB, bY);

      // Horizontal connector / winner line
      doc.line(xB, mY, xOut, mY);

      // Winner name + score from DB
      const match = matchByKey.get(`${r}-${s}`);
      if (!match) continue;

      const winner = match.winnerEntryId ? entryById.get(match.winnerEntryId) : null;
      if (winner && !winner.isBye) {
        const nameStr = winner.familyName + (winner.firstName ? `, ${winner.firstName.charAt(0)}.` : '');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(15, 70, 160);
        doc.text(nameStr, xB + 1.5, mY - 1);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
      }

      if (match.score) {
        doc.setFontSize(5.5);
        doc.setTextColor(90, 90, 90);
        doc.text(match.score, xB + 1.5, mY + 2.8);
        doc.setTextColor(0, 0, 0);
      } else if (match.outcomeType && match.outcomeType !== 'score' && match.status === 'complete') {
        doc.setFontSize(5);
        doc.setTextColor(130, 130, 130);
        doc.text(match.outcomeType.toUpperCase(), xB + 1.5, mY + 2.8);
        doc.setTextColor(0, 0, 0);
      }
    }
  }

  // ---- CHAMPION LABEL ---------------------------------------------------------
  // Qualifying draws don't produce a single champion — the deciding round can
  // have several simultaneous winners (all promoted as qualifiers), so there's
  // no single position for this label. Skip it for qualifying draws.
  if (!isQualifying) {
    const champY = midY(totalRounds, 1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('CHAMPION', pageW - margin - 1.5, champY - 1, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

  // ---- SEEDINGS LEGEND (if any seeded players) --------------------------------
  const seededEntries = entries.filter(e => e.seed && !e.isBye).sort((a, b) => a.seed - b.seed);
  if (seededEntries.length > 0 && slotH > 4) {
    const legendX = pageW - margin;
    let legendY   = drawTop + 2;
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('SEEDS', legendX, legendY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    legendY += 3;
    for (const e of seededEntries.slice(0, 8)) {
      const nm = `[${e.seed}] ${e.familyName}${e.firstName ? ', ' + e.firstName.charAt(0) + '.' : ''}`;
      doc.setFontSize(5);
      doc.text(nm, legendX, legendY, { align: 'right' });
      legendY += 2.6;
      if (legendY > drawTop + drawH) break;
    }
  }

  // ---- FOOTER ----------------------------------------------------------------
  doc.setFontSize(5.5);
  doc.setTextColor(160, 160, 160);
  doc.text('Generated by Match Tracker', margin, pageH - 4);
  doc.text(new Date().toLocaleDateString('en-IN'), pageW - margin, pageH - 4, { align: 'right' });

  // ---- SAVE ------------------------------------------------------------------
  const safe = s => (s || '').replace(/[^a-zA-Z0-9]/g, '_');
  const drawTypeSuffix = event.drawType === 'qualifying' ? '_Q' : '';
  const filename = `${safe(week.name)}_${safe(event.category)}_${safe(event.ageGroup)}${drawTypeSuffix}_draw.pdf`;
  doc.save(filename);
}
