import { jsPDF } from 'jspdf';
import { SHOT_CATEGORIES, getFormatConfig, adviceForStroke } from './constants';
import {
  computeStats, computeStrokeBreakdown, computeServeStats, computeReturnStats,
  computeFirstServeFaults, computeGroundstrokes, computeMomentumSeries,
  computeRallyBreakdown, computeErrorLocations, replayMatchAnalytics,
} from './analytics';
import { formatDuration } from './storage';

function fmtRatio(r) { return r === Infinity ? 'Inf' : r.toFixed(2); }
function fmtPct(p) { return p.toFixed(1) + '%'; }

function reasonLabel(pt, selfName, oppName) {
  const name = pt.endedBy === 'self' ? selfName : oppName;
  const firstFaultNote = pt.firstFaultLocation ? ' [1st serve missed ' + pt.firstFaultLocation + ']' : '';
  if (pt.reason === 'DoubleFault') return name + ' double fault (2nd: ' + pt.location + ')' + firstFaultNote;
  if (pt.reason === 'Winner') return name + ' ' + pt.stroke.toLowerCase() + (pt.stroke === 'Serve' ? ' (ace)' : '') + ' winner' + (pt.isReturn ? ' (return)' : '') + firstFaultNote;
  const kind = pt.reason === 'ForcedError' ? 'forced error' : 'unforced error';
  const locSuffix = pt.location ? ' - ' + pt.location : '';
  return name + ' ' + pt.stroke.toLowerCase() + ' ' + kind + locSuffix + (pt.isReturn ? ' (return)' : '') + firstFaultNote;
}

function pdfBarChart(doc, opts) {
  const { x, y, width, height, categories, series, colors, legendLabels, title } = opts;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 39, 51);
  doc.text(title, x, y);
  let legendX = x;
  const legendY = y + 13;
  doc.setFontSize(8);
  legendLabels.forEach((lbl, i) => {
    doc.setFillColor(colors[i][0], colors[i][1], colors[i][2]);
    doc.rect(legendX, legendY - 7, 6, 6, 'F');
    doc.setTextColor(70, 70, 70);
    doc.text(lbl, legendX + 9, legendY - 1);
    legendX += doc.getTextWidth(lbl) + 28;
  });
  const chartTop = y + 26;
  const chartBottom = chartTop + height;
  const maxVal = Math.max(1, ...series.flat());
  const catWidth = width / categories.length;
  const nSeries = series.length;
  const groupPad = catWidth * 0.1;
  const barAreaWidth = catWidth - 2 * groupPad;
  const barWidth = (barAreaWidth / nSeries) * 0.72;
  const barGap = (barAreaWidth / nSeries) * 0.28;
  doc.setDrawColor(240, 240, 240); doc.setLineWidth(0.5);
  doc.line(x, chartTop, x + width, chartTop);
  categories.forEach((cat, ci) => {
    const catX = x + ci * catWidth + groupPad;
    series.forEach((s, si) => {
      const val = s[ci];
      const barH = (val / maxVal) * height;
      const barX = catX + si * (barWidth + barGap);
      doc.setFillColor(colors[si][0], colors[si][1], colors[si][2]);
      if (barH > 0.3) doc.rect(barX, chartBottom - barH, barWidth, barH, 'F');
      if (val > 0) { doc.setFontSize(7); doc.setTextColor(30, 30, 30); doc.text(String(Math.round(val * 10) / 10), barX + barWidth / 2, chartBottom - barH - 3, { align: 'center' }); }
    });
    doc.setFontSize(6.6); doc.setTextColor(90, 90, 90);
    doc.text(cat, x + ci * catWidth + catWidth / 2, chartBottom + 11, { align: 'center' });
  });
  doc.setDrawColor(210, 210, 210); doc.setLineWidth(1);
  doc.line(x, chartBottom, x + width, chartBottom);
  return chartBottom + 28;
}

function pdfLineChart(doc, opts, selfName, oppName) {
  const { x, y, width, height, values, title, vLines, gameVLines, pointLabels } = opts;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20, 39, 51);
  doc.text(title, x, y);
  const chartTop = y + 12;
  const chartBottom = chartTop + height;
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const range = (maxV - minV) || 1;
  const n = values.length;
  const stepX = width / Math.max(1, n - 1);
  const pointY = (i) => chartBottom - ((values[i] - minV) / range) * height;
  const zeroY = chartBottom - ((0 - minV) / range) * height;
  doc.setDrawColor(225, 225, 225); doc.setLineWidth(0.6);
  doc.line(x, zeroY, x + width, zeroY);
  // Game boundaries: light, thin lines with a small running game-score label
  (gameVLines || []).forEach((vl) => {
    const px = x + Math.min(vl.index, n - 1) * stepX;
    doc.setDrawColor(222, 222, 222); doc.setLineWidth(0.4);
    doc.line(px, chartTop, px, chartBottom);
    doc.setFontSize(5.5); doc.setTextColor(150, 150, 150);
    doc.text(vl.label, px, chartTop - 2, { align: 'center' });
  });
  // Set boundaries: darker lines with a bold set-score label
  (vLines || []).forEach((vl) => {
    const px = x + Math.min(vl.index, n - 1) * stepX;
    doc.setDrawColor(190, 190, 190); doc.setLineWidth(0.6);
    doc.line(px, chartTop, px, chartBottom);
    doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
    doc.text(vl.label, px, chartBottom + 10, { align: 'center' });
  });
  doc.setDrawColor(20, 39, 51); doc.setLineWidth(1.1);
  for (let i = 1; i < n; i++) {
    const x1 = x + (i - 1) * stepX, y1 = pointY(i - 1);
    const x2 = x + i * stepX, y2 = pointY(i);
    doc.line(x1, y1, x2, y2);
  }
  // Point-level markers: small tick + score label (e.g. 0-15, 15-30) at every point
  for (let i = 0; i < n; i++) {
    const px = x + i * stepX, py = pointY(i);
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.3);
    doc.line(px, py - 3, px, py + 3);
    doc.setFillColor(20, 39, 51);
    doc.circle(px, py, 1, 'F');
    const label = (pointLabels || [])[i];
    if (label) {
      doc.setFontSize(4); doc.setTextColor(140, 140, 140);
      doc.text(label, px, py - 3.5, { angle: 90 });
    }
  }
  doc.setDrawColor(210, 210, 210); doc.setLineWidth(1);
  doc.line(x, chartBottom, x + width, chartBottom);
  doc.setFontSize(7); doc.setTextColor(90, 90, 90);
  doc.text('\u2190 ' + oppName, x, chartBottom + 20);
  doc.text(selfName + ' \u2192', x + width, chartBottom + 20, { align: 'right' });
  return chartBottom + 32;
}

/**
 * ctx = {
 *   points, sets, matchOver, matchWinner, matchTiebreakActive, matchTiebreakPts,
 *   setGames, gamePts, sessionType, pointTarget, formatPreset, formatLabel,
 *   selfName, oppName, tournament, date, surface, indoorOutdoor, oppHandedness,
 *   weather, notes, matchStartTime, matchDurationMs,
 * }
 * Returns a jsPDF instance (caller decides how to output/save it).
 */
export function buildMatchPdf(ctx) {
  const {
    points, sets, matchOver, matchWinner, matchTiebreakActive, matchTiebreakPts,
    setGames, gamePts, sessionType, pointTarget, formatPreset, formatLabel,
    selfName, oppName, tournament, date, surface, indoorOutdoor, oppHandedness,
    weather, notes, matchStartTime, matchDurationMs,
  } = ctx;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40, pageBottom = 780;
  let y = 50;
  const ensureSpace = (needed) => { if (y + needed > pageBottom) { doc.addPage(); y = 50; } };
  const sectionHeading = (title) => {
    ensureSpace(30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20, 39, 51);
    doc.text(title, marginX, y); y += 6;
    doc.setDrawColor(210, 210, 210); doc.line(marginX, y, 555, y); y += 16;
  };
  const tableRow = (cells, xs, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
    cells.forEach((c, i) => doc.text(String(c), xs[i], y));
    y += 15;
  };

  const isPractice = sessionType === 'practice';
  const cfgOpts = { sessionType, formatPreset };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(20, 39, 51);
  doc.text(selfName + ' vs ' + oppName + (isPractice ? ' (Practice)' : ''), marginX, y); y += 20;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 90, 90);
  doc.text((tournament ? tournament + ' | ' : '') + (date || ''), marginX, y); y += 16;

  const contextBits = [];
  if (surface) contextBits.push(surface);
  if (indoorOutdoor) contextBits.push(indoorOutdoor);
  if (oppHandedness) contextBits.push('Opponent: ' + oppHandedness);
  if (weather) contextBits.push('Weather: ' + weather);
  if (contextBits.length > 0) {
    const ctxLines = doc.splitTextToSize(contextBits.join(' | '), 515);
    doc.text(ctxLines, marginX, y); y += ctxLines.length * 14 + 2;
  }
  if (matchStartTime) { doc.text('Time on court: ' + formatDuration(matchDurationMs), marginX, y); y += 16; }
  const formatStr = isPractice ? 'Format: Practice - race to ' + pointTarget + ' points' : ('Format: ' + formatLabel);
  doc.text(formatStr, marginX, y); y += 16;

  if (isPractice) {
    if (matchOver) doc.text('Final Score: ' + gamePts.self + '-' + gamePts.opp + '   Winner: ' + (matchWinner === 'self' ? selfName : oppName), marginX, y);
    else doc.text('Score (in progress): ' + gamePts.self + '-' + gamePts.opp, marginX, y);
  } else {
    const finalScoreStr = sets.map((st) => st.isMatchTiebreak ? '[' + st.tb.self + '-' + st.tb.opp + ']' : (st.self + '-' + st.opp)).join(', ');
    if (matchOver) doc.text('Final Score: ' + finalScoreStr + '   Winner: ' + (matchWinner === 'self' ? selfName : oppName), marginX, y);
    else if (matchTiebreakActive) doc.text('Score (in progress): ' + finalScoreStr + (finalScoreStr ? ', ' : '') + '[' + matchTiebreakPts.self + '-' + matchTiebreakPts.opp + ' MTB]', marginX, y);
    else doc.text('Score (in progress): ' + finalScoreStr + (finalScoreStr ? ', ' : '') + setGames.self + '-' + setGames.opp, marginX, y);
  }
  y += 28;

  const s = computeStats(points);
  sectionHeading('Stats Totals');
  tableRow(['Metric', selfName, oppName], [marginX, 300, 440], true);
  y += 2; doc.setDrawColor(230, 230, 230); doc.line(marginX, y - 11, 555, y - 11);
  tableRow(['Winners/Forced Errors', s.self.wfe, s.opp.wfe], [marginX, 300, 440]);
  tableRow(['Unforced Errors', s.self.ue, s.opp.ue], [marginX, 300, 440]);
  tableRow(['Ratio', fmtRatio(s.self.ratio), fmtRatio(s.opp.ratio)], [marginX, 300, 440]);
  tableRow(['Points Won', s.self.pointCount, s.opp.pointCount], [marginX, 300, 440]);
  y += 12;

  sectionHeading('Stroke Breakdown - ' + selfName);
  ensureSpace(160);
  const selfStrokes = computeStrokeBreakdown(points, 'self');
  y = pdfBarChart(doc, {
    x: marginX, y, width: 515, height: 90,
    categories: selfStrokes.map((r) => r.stroke),
    series: [selfStrokes.map((r) => r.wfe), selfStrokes.map((r) => r.ue)],
    colors: [[127, 191, 63], [225, 72, 75]],
    legendLabels: ['Winners/Forced', 'Unforced Errors'],
    title: 'Winners/Forced Errors vs Unforced Errors',
  });
  y += 6;

  sectionHeading('Stroke Breakdown - ' + oppName);
  ensureSpace(160);
  const oppStrokes = computeStrokeBreakdown(points, 'opp');
  y = pdfBarChart(doc, {
    x: marginX, y, width: 515, height: 90,
    categories: oppStrokes.map((r) => r.stroke),
    series: [oppStrokes.map((r) => r.wfe), oppStrokes.map((r) => r.ue)],
    colors: [[127, 191, 63], [225, 72, 75]],
    legendLabels: ['Winners/Forced', 'Unforced Errors'],
    title: 'Winners/Forced Errors vs Unforced Errors',
  });
  y += 12;

  doc.addPage(); y = 50;
  const ss = computeServeStats(points, 'self'), so = computeServeStats(points, 'opp');
  const analytics = replayMatchAnalytics(points, cfgOpts);
  sectionHeading('Serving Statistics');
  tableRow(['Metric', selfName, oppName], [marginX, 300, 440], true);
  y += 2; doc.line(marginX, y - 11, 555, y - 11);
  if (isPractice) tableRow(['Service Points', ss.totalServicePts, so.totalServicePts], [marginX, 300, 440]);
  else tableRow(['Service Games', ss.gamesPlayed, so.gamesPlayed], [marginX, 300, 440]);
  if (!isPractice) {
    tableRow(['Service Games Won', fmtPct(ss.gamesPlayed > 0 ? analytics.svcGamesWon.self / ss.gamesPlayed * 100 : 0), fmtPct(so.gamesPlayed > 0 ? analytics.svcGamesWon.opp / so.gamesPlayed * 100 : 0)], [marginX, 300, 440]);
    tableRow(['Break Points Saved', analytics.bp.self.savedServing + '/' + analytics.bp.self.facedServing, analytics.bp.opp.savedServing + '/' + analytics.bp.opp.facedServing], [marginX, 300, 440]);
  }
  tableRow(['Aces', ss.aces, so.aces], [marginX, 300, 440]);
  tableRow(['Double Faults', ss.dfs, so.dfs], [marginX, 300, 440]);
  tableRow(['1st Serve %', fmtPct(ss.firstPct), fmtPct(so.firstPct)], [marginX, 300, 440]);
  tableRow(['Won on 1st Serve', ss.wonOn1st + '/' + ss.firstIn, so.wonOn1st + '/' + so.firstIn], [marginX, 300, 440]);
  tableRow(['2nd Serve %', fmtPct(ss.secondPct), fmtPct(so.secondPct)], [marginX, 300, 440]);
  tableRow(['Won on 2nd Serve', ss.wonOn2nd + '/' + ss.secondIn, so.wonOn2nd + '/' + so.secondIn], [marginX, 300, 440]);
  tableRow(['Ace/DF Ratio', fmtRatio(ss.ratio), fmtRatio(so.ratio)], [marginX, 300, 440]);
  const fsfSelf = computeFirstServeFaults(points, 'self'), fsfOpp = computeFirstServeFaults(points, 'opp');
  tableRow(['1st Serve Faults - Net', fsfSelf.Net, fsfOpp.Net], [marginX, 300, 440]);
  tableRow(['1st Serve Faults - Wide', fsfSelf.Wide, fsfOpp.Wide], [marginX, 300, 440]);
  tableRow(['1st Serve Faults - Long', fsfSelf.Long, fsfOpp.Long], [marginX, 300, 440]);
  y += 10;
  ensureSpace(150);
  const serveChartRowY = y;
  pdfBarChart(doc, {
    x: marginX, y: serveChartRowY, width: 250, height: 80,
    categories: ['1st Serve', '2nd Serve'],
    series: [[ss.firstPct, ss.secondPct], [ss.firstIn > 0 ? ss.wonOn1st / ss.firstIn * 100 : 0, ss.secondIn > 0 ? ss.wonOn2nd / ss.secondIn * 100 : 0]],
    colors: [[127, 191, 63], [225, 72, 75]], legendLabels: ['% In', '% Won'], title: selfName,
  });
  pdfBarChart(doc, {
    x: marginX + 280, y: serveChartRowY, width: 250, height: 80,
    categories: ['1st Serve', '2nd Serve'],
    series: [[so.firstPct, so.secondPct], [so.firstIn > 0 ? so.wonOn1st / so.firstIn * 100 : 0, so.secondIn > 0 ? so.wonOn2nd / so.secondIn * 100 : 0]],
    colors: [[127, 191, 63], [225, 72, 75]], legendLabels: ['% In', '% Won'], title: oppName,
  });
  y = serveChartRowY + 54 + 80 + 12;

  doc.addPage(); y = 50;
  const rs = computeReturnStats(points, 'self'), ro = computeReturnStats(points, 'opp');
  sectionHeading('Return Statistics');
  tableRow(['Metric', selfName, oppName], [marginX, 300, 440], true);
  y += 2; doc.line(marginX, y - 11, 555, y - 11);
  if (isPractice) tableRow(['Return Points', rs.totalReturnPts, ro.totalReturnPts], [marginX, 300, 440]);
  else tableRow(['Return Games', rs.gamesPlayed, ro.gamesPlayed], [marginX, 300, 440]);
  if (!isPractice) {
    tableRow(['Return Games Won', fmtPct(rs.gamesPlayed > 0 ? (rs.gamesPlayed - analytics.svcGamesWon.opp) / rs.gamesPlayed * 100 : 0), fmtPct(ro.gamesPlayed > 0 ? (ro.gamesPlayed - analytics.svcGamesWon.self) / ro.gamesPlayed * 100 : 0)], [marginX, 300, 440]);
    tableRow(['Break Points Won', analytics.bp.self.wonReturning + '/' + analytics.bp.self.facedReturning, analytics.bp.opp.wonReturning + '/' + analytics.bp.opp.facedReturning], [marginX, 300, 440]);
  }
  tableRow(['Won Returning 1st', rs.won1st + '/' + rs.total1st, ro.won1st + '/' + ro.total1st], [marginX, 300, 440]);
  tableRow(['Won Returning 2nd', rs.won2nd + '/' + rs.total2nd, ro.won2nd + '/' + ro.total2nd], [marginX, 300, 440]);
  tableRow(['Return Winners/Forced', rs.retWinnersForced, ro.retWinnersForced], [marginX, 300, 440]);
  tableRow(['Return Unforced Errors', rs.retUE, ro.retUE], [marginX, 300, 440]);
  y += 10;

  doc.addPage(); y = 50;
  sectionHeading('Shot Stats - All Categories');
  const gsSelf = computeGroundstrokes(points, 'self'), gsOpp = computeGroundstrokes(points, 'opp');
  tableRow(['Player', 'Winners/Forced', 'Unforced Errors'], [marginX, 300, 440], true);
  y += 2; doc.line(marginX, y - 11, 555, y - 11);
  tableRow([selfName, gsSelf.reduce((sum, r) => sum + r.wfe, 0), gsSelf.reduce((sum, r) => sum + r.ue, 0)], [marginX, 300, 440]);
  tableRow([oppName, gsOpp.reduce((sum, r) => sum + r.wfe, 0), gsOpp.reduce((sum, r) => sum + r.ue, 0)], [marginX, 300, 440]);
  y += 10;
  ensureSpace(30);
  tableRow(['Shot Category', selfName + ' W/FE', selfName + ' UE', oppName + ' W/FE', oppName + ' UE'], [marginX, 220, 320, 400, 490], true);
  y += 2; doc.setDrawColor(230, 230, 230); doc.line(marginX, y - 11, 555, y - 11);
  SHOT_CATEGORIES.forEach((cat, i) => {
    ensureSpace(15);
    tableRow([cat, gsSelf[i].wfe, gsSelf[i].ue, gsOpp[i].wfe, gsOpp[i].ue], [marginX, 220, 320, 400, 490]);
  });
  y += 10;

  if (points.length > 1) {
    doc.addPage(); y = 50;
    sectionHeading(isPractice ? 'Momentum - Session' : 'Momentum - Match');
    ensureSpace(160);
    const momentum = computeMomentumSeries(points);
    const boundaries = isPractice ? [] : analytics.boundaries;
    const gameBoundaries = isPractice ? [] : analytics.gameBoundaries;
    const pointLabels = [null, ...points.map((pt) => pt.scoreAfter)];
    y = pdfLineChart(doc, {
      x: marginX, y, width: 515, height: 90, values: momentum,
      title: 'Cumulative point differential', vLines: boundaries, gameVLines: gameBoundaries, pointLabels,
    }, selfName, oppName);
    y += 12;
  }

  doc.addPage(); y = 50;
  sectionHeading('Rally Length - ' + selfName + ' Serving');
  const rlSelf = computeRallyBreakdown(points, 'self');
  ensureSpace(150);
  y = pdfBarChart(doc, {
    x: marginX, y, width: 515, height: 80, categories: rlSelf.cats,
    series: [rlSelf.serverEnded.green, rlSelf.serverEnded.red], colors: [[127, 191, 63], [225, 72, 75]],
    legendLabels: ['Winners/Forced', 'Unforced Errors'], title: "Points ending on server's shot",
  });
  y += 4;
  ensureSpace(150);
  y = pdfBarChart(doc, {
    x: marginX, y, width: 515, height: 80, categories: rlSelf.cats,
    series: [rlSelf.receiverEnded.green, rlSelf.receiverEnded.red], colors: [[127, 191, 63], [225, 72, 75]],
    legendLabels: ['Winners/Forced', 'Unforced Errors'], title: "Points ending on returner's shot",
  });
  y += 16;

  doc.addPage(); y = 50;
  sectionHeading('Rally Length - ' + oppName + ' Serving');
  const rlOpp = computeRallyBreakdown(points, 'opp');
  ensureSpace(150);
  y = pdfBarChart(doc, {
    x: marginX, y, width: 515, height: 80, categories: rlOpp.cats,
    series: [rlOpp.serverEnded.green, rlOpp.serverEnded.red], colors: [[127, 191, 63], [225, 72, 75]],
    legendLabels: ['Winners/Forced', 'Unforced Errors'], title: "Points ending on server's shot",
  });
  y += 4;
  ensureSpace(150);
  y = pdfBarChart(doc, {
    x: marginX, y, width: 515, height: 80, categories: rlOpp.cats,
    series: [rlOpp.receiverEnded.green, rlOpp.receiverEnded.red], colors: [[127, 191, 63], [225, 72, 75]],
    legendLabels: ['Winners/Forced', 'Unforced Errors'], title: "Points ending on returner's shot",
  });

  doc.addPage(); y = 50;
  sectionHeading('Unforced Error Locations - ' + selfName);
  ensureSpace(160);
  const errLoc = computeErrorLocations(points, 'self');
  y = pdfBarChart(doc, {
    x: marginX, y, width: 515, height: 90,
    categories: errLoc.map((r) => r.category),
    series: [errLoc.map((r) => r.Net), errLoc.map((r) => r.Wide), errLoc.map((r) => r.Long)],
    colors: [[127, 191, 63], [225, 72, 75], [30, 30, 30]],
    legendLabels: ['Net', 'Wide', 'Long'],
    title: 'Errors by shot and miss direction',
  });
  y += 16;

  sectionHeading('Unforced Error Locations - ' + oppName);
  ensureSpace(160);
  const errLocOpp = computeErrorLocations(points, 'opp');
  y = pdfBarChart(doc, {
    x: marginX, y, width: 515, height: 90,
    categories: errLocOpp.map((r) => r.category),
    series: [errLocOpp.map((r) => r.Net), errLocOpp.map((r) => r.Wide), errLocOpp.map((r) => r.Long)],
    colors: [[127, 191, 63], [225, 72, 75], [30, 30, 30]],
    legendLabels: ['Net', 'Wide', 'Long'],
    title: 'Errors by shot and miss direction',
  });
  y += 12;

  doc.addPage(); y = 50;
  sectionHeading('Focus Areas for Next Session');
  const buckets = {};
  points.filter((pt) => pt.endedBy === 'self' && (pt.reason === 'UnforcedError' || pt.reason === 'DoubleFault')).forEach((pt) => {
    const key = pt.reason === 'DoubleFault' ? 'Second Serve|' + pt.location : pt.stroke + '|' + pt.location;
    buckets[key] = (buckets[key] || 0) + 1;
  });
  const sortedBuckets = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
  if (sortedBuckets.length === 0) {
    doc.text('No unforced errors logged yet - nothing to flag.', marginX, y); y += 16;
  } else {
    sortedBuckets.forEach(([key, count]) => {
      const [stroke, loc] = key.split('|');
      const advice = adviceForStroke(stroke, loc);
      const line = count + '\u00d7 ' + stroke + ' (' + loc + ') - ' + advice;
      const lines = doc.splitTextToSize(line, 515);
      ensureSpace(lines.length * 14 + 6);
      doc.text(lines, marginX, y);
      y += lines.length * 14 + 6;
    });
  }
  y += 10;

  sectionHeading('Match Notes');
  const noteLines = doc.splitTextToSize(notes || '-', 515);
  ensureSpace(noteLines.length * 14);
  doc.text(noteLines, marginX, y);
  y += noteLines.length * 14 + 20;

  doc.addPage(); y = 50;
  sectionHeading('Point-by-Point Log');
  tableRow(['Score', 'Detail', 'Rally'], [marginX, 150, 500], true);
  y += 2; doc.line(marginX, y - 11, 555, y - 11);
  points.forEach((pt) => {
    ensureSpace(16);
    const detail = reasonLabel(pt, selfName, oppName);
    const lines = doc.splitTextToSize(detail, 330);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(40, 40, 40);
    doc.text(String(pt.scoreAfter), marginX, y);
    doc.text(lines, 150, y);
    doc.text(String(pt.rally), 500, y);
    y += Math.max(14, lines.length * 12);
  });

  return doc;
}

export function pdfFilename(selfName, oppName, sessionType) {
  const safe = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const kind = sessionType === 'practice' ? '-practice-report.pdf' : '-report.pdf';
  return safe(selfName) + '-vs-' + safe(oppName) + kind;
}
