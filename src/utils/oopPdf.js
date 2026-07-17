// ============================================================
// Order of Play PDF generator — AITA format
// One A4 landscape page per tournament day.
// Courts are column groups; matches listed in match-order sequence.
// ============================================================
import jsPDF from 'jspdf';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function playerStr(entry, showSeed = true) {
  if (!entry) return '—';
  if (entry.isBye) return 'BYE';
  const seed = showSeed && entry.seed ? `[${entry.seed}] ` : '';
  const name = entry.familyName + (entry.firstName ? `, ${entry.firstName.charAt(0)}.` : '');
  return seed + name;
}

function roundLbl(round, totalRounds) {
  const fe = (totalRounds || 5) - round;
  if (fe === 0) return 'Final';
  if (fe === 1) return 'Semi-Final';
  if (fe === 2) return 'Quarter-Final';
  return `R${round}`;
}

// Truncate string to maxChars, appending … if needed
function trunc(text, maxChars) {
  if (!text) return '';
  return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
}

// Estimate character limit that fits in widthMm at a given font size (pt)
// Rule of thumb: 1pt ≈ 0.353mm, average char width ≈ 0.55 × fontSize pt in mm
function charLimit(widthMm, fontSizePt) {
  const avgCharMm = fontSizePt * 0.353 * 0.55;
  return Math.floor(widthMm / avgCharMm);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function generateOOPPdf({ week, matches }) {
  if (!matches || matches.length === 0) return;

  // Only scheduled matches, sorted
  const scheduled = matches
    .filter(m => m.dayNumber != null && m.courtNumber != null && m.matchOrder != null)
    .sort((a, b) => a.dayNumber - b.dayNumber || a.courtNumber - b.courtNumber || a.matchOrder - b.matchOrder);

  if (scheduled.length === 0) return;

  const days = [...new Set(scheduled.map(m => m.dayNumber))].sort((a, b) => a - b);

  // Always landscape for OOP — more room for courts side by side
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 297;
  const pageH = 210;
  const margin = 12;
  const headerH = 28;
  const footerH = 8;

  const contentTop = margin + headerH;
  const contentH   = pageH - contentTop - footerH - margin;

  let firstPage = true;

  for (const day of days) {
    if (!firstPage) doc.addPage();
    firstPage = false;

    const dayMatches = scheduled.filter(m => m.dayNumber === day);
    const courts = [...new Set(dayMatches.map(m => m.courtNumber))].sort((a, b) => a - b);
    const numCourts = courts.length;

    // ---- HEADER ----------------------------------------------------------
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(week.name || 'Tournament', pageW / 2, margin + 7, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Order of Play — Day ${day}`, pageW / 2, margin + 14, { align: 'center' });

    const loc   = [week.city, week.stateAbbr].filter(Boolean).join(', ');
    const dates = week.startDate
      ? (week.endDate && week.endDate !== week.startDate
          ? `${week.startDate} – ${week.endDate}`
          : week.startDate)
      : '';
    const subLine = [loc, dates].filter(Boolean).join(' · ');
    if (subLine) {
      doc.setFontSize(7.5);
      doc.text(subLine, pageW / 2, margin + 20, { align: 'center' });
    }

    // Header rule
    doc.setLineWidth(0.5);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin, margin + headerH - 1, pageW - margin, margin + headerH - 1);

    if (numCourts === 0) continue;

    // ---- COURT LAYOUT ----------------------------------------------------
    const totalW  = pageW - 2 * margin;
    const colW    = totalW / numCourts;
    const padL    = 4;    // padding inside each column (left)
    const padR    = 4;    // padding inside each column (right)
    const innerW  = colW - padL - padR;

    // Determine adaptive match height based on max matches in any court this day
    const maxPerCourt = Math.max(...courts.map(c =>
      dayMatches.filter(m => m.courtNumber === c).length
    ), 1);

    // Heights for each match block
    const MATCH_H = maxPerCourt <= 5  ? 28
                  : maxPerCourt <= 7  ? 22
                  : maxPerCourt <= 10 ? 17
                  : 14;

    const compact = MATCH_H < 18; // drops the "vs" line when very tight

    // Court headers
    courts.forEach((courtNum, ci) => {
      const cx = margin + ci * colW;

      // Vertical divider (between columns, not before the first)
      if (ci > 0) {
        doc.setLineWidth(0.2);
        doc.setDrawColor(190, 190, 190);
        doc.line(cx, contentTop - 2, cx, pageH - footerH - margin);
        doc.setDrawColor(0, 0, 0);
      }

      // Court label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(`COURT ${courtNum}`, cx + colW / 2, contentTop + 5, { align: 'center' });

      // Underline
      doc.setLineWidth(0.35);
      doc.setDrawColor(0, 0, 0);
      doc.line(cx + padL, contentTop + 7, cx + colW - padR, contentTop + 7);
    });

    // ---- MATCH BLOCKS ----------------------------------------------------
    courts.forEach((courtNum, ci) => {
      const cx = margin + ci * colW + padL;
      const maxCharsName  = charLimit(innerW - 6, 7.5);
      const maxCharsEvent = charLimit(innerW - 4, 6);

      const courtMatches = dayMatches
        .filter(m => m.courtNumber === courtNum)
        .sort((a, b) => (a.matchOrder || 0) - (b.matchOrder || 0));

      let y = contentTop + 11;

      courtMatches.forEach((match, idx) => {
        const yMax = pageH - footerH - margin - 2;
        if (y + MATCH_H > yMax) return; // overflow guard

        const p1    = trunc(playerStr(match.entry1), maxCharsName);
        const p2    = trunc(playerStr(match.entry2), maxCharsName);
        const p1Won = match.winnerEntryId && match.winnerEntryId === match.entry1Id;
        const p2Won = match.winnerEntryId && match.winnerEntryId === match.entry2Id;

        const drawLbl  = match.drawType === 'qualifying' ? '[Q]' : '[M]';
        const rLbl     = roundLbl(match.round, match.totalRounds);
        const eventLbl = trunc(`${match.eventAgeGroup} ${match.eventCategory} ${drawLbl}`, maxCharsEvent);
        const roundTxt = rLbl;

        // — Match number + event/round on one line —
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(0, 0, 0);
        doc.text(`${idx + 1}.`, cx, y);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(90, 90, 90);
        doc.text(`${eventLbl} · ${roundTxt}`, cx + 5, y);
        doc.setTextColor(0, 0, 0);

        if (compact) {
          // Compact: P1 vs P2 on one line each
          const nameY1 = y + 5;
          const nameY2 = y + 11;

          doc.setFont('helvetica', p1Won ? 'bold' : 'normal');
          doc.setFontSize(7.5);
          doc.text(p1, cx + 3, nameY1);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.5);
          doc.setTextColor(150, 150, 150);
          doc.text('vs', cx + 3, nameY2 - 1);
          doc.setTextColor(0, 0, 0);

          doc.setFont('helvetica', p2Won ? 'bold' : 'normal');
          doc.setFontSize(7.5);
          doc.text(p2, cx + 3, nameY2 + 3);

        } else {
          // Normal: more spacing, score shown
          const nameY1 = y + 6.5;
          const vsY    = y + 12;
          const nameY2 = y + 17.5;

          doc.setFont('helvetica', p1Won ? 'bold' : 'normal');
          doc.setFontSize(8);
          doc.text(p1, cx + 3, nameY1);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6);
          doc.setTextColor(150, 150, 150);
          doc.text('vs', cx + 3, vsY);
          doc.setTextColor(0, 0, 0);

          doc.setFont('helvetica', p2Won ? 'bold' : 'normal');
          doc.setFontSize(8);
          doc.text(p2, cx + 3, nameY2);

          // Score / outcome
          if (match.status === 'complete') {
            const resultTxt = match.score
              || (match.outcomeType && match.outcomeType !== 'score'
                  ? match.outcomeType.toUpperCase()
                  : '');
            if (resultTxt) {
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(6);
              doc.setTextColor(110, 110, 110);
              doc.text(trunc(resultTxt, maxCharsEvent), cx + 3, nameY2 + 5.5);
              doc.setTextColor(0, 0, 0);
              doc.setFont('helvetica', 'normal');
            }
          }
        }

        // Separator between matches
        if (idx < courtMatches.length - 1) {
          doc.setLineWidth(0.12);
          doc.setDrawColor(210, 210, 210);
          doc.line(cx, y + MATCH_H - 1.5, cx + innerW, y + MATCH_H - 1.5);
          doc.setDrawColor(0, 0, 0);
        }

        doc.setFont('helvetica', 'normal');
        y += MATCH_H;
      });
    });

    // ---- FOOTER ----------------------------------------------------------
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(160, 160, 160);
    doc.text('Generated by Match Tracker', margin, pageH - 4);
    const totalScheduled = dayMatches.length;
    doc.text(
      `${totalScheduled} match${totalScheduled !== 1 ? 'es' : ''} · ` +
      new Date().toLocaleDateString('en-IN'),
      pageW - margin,
      pageH - 4,
      { align: 'right' },
    );
    doc.setTextColor(0, 0, 0);
  }

  // ---- SAVE --------------------------------------------------------------
  const safe = s => (s || '').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`${safe(week.name)}_Order_of_Play.pdf`);
}
