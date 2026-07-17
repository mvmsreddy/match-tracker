import { jsPDF } from 'jspdf';

/**
 * buildAppGuidePdf()
 * Generates a comprehensive multi-page A4 PDF user guide for Tennis Tracker Pro.
 * Returns a jsPDF instance.
 *
 * Color palette:
 *   headings  : RGB(20,39,51)
 *   accent    : RGB(127,191,63)   green
 *   danger    : RGB(225,72,75)    red
 *   body text : RGB(40,40,40)
 *   muted     : RGB(100,100,100)
 *   light line: RGB(210,210,210)
 */
export function buildAppGuidePdf() {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  const pageWidth = 595;
  const usableWidth = pageWidth - marginX * 2; // 515
  const pageBottom = 800;
  let y = 50;

  // ─── core helpers ────────────────────────────────────────────────────────────

  const ensureSpace = (needed) => {
    if (y + needed > pageBottom) {
      doc.addPage();
      y = 50;
    }
  };

  const newPage = () => { doc.addPage(); y = 50; };

  const sectionHeading = (title) => {
    ensureSpace(36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(20, 39, 51);
    doc.text(title, marginX, y);
    y += 6;
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(1);
    doc.line(marginX, y, marginX + usableWidth, y);
    y += 14;
  };

  const subHeading = (title) => {
    ensureSpace(24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20, 39, 51);
    doc.text(title, marginX, y);
    y += 14;
  };

  const subSubHeading = (title) => {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(127, 191, 63);
    doc.text(title, marginX, y);
    y += 13;
  };

  const bodyText = (text, indent) => {
    const ix = marginX + (indent || 0);
    const wrap = usableWidth - (indent || 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(text, wrap);
    ensureSpace(lines.length * 13 + 4);
    doc.text(lines, ix, y);
    y += lines.length * 13 + 4;
  };

  const muted = (text, indent) => {
    const ix = marginX + (indent || 0);
    const wrap = usableWidth - (indent || 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const lines = doc.splitTextToSize(text, wrap);
    ensureSpace(lines.length * 12 + 3);
    doc.text(lines, ix, y);
    y += lines.length * 12 + 3;
  };

  const bulletPoint = (text, indent) => {
    const ix = marginX + (indent || 0) + 14;
    const wrap = usableWidth - (indent || 0) - 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(text, wrap);
    ensureSpace(lines.length * 13 + 2);
    doc.setFillColor(127, 191, 63);
    doc.circle(marginX + (indent || 0) + 4, y - 4, 2.2, 'F');
    doc.text(lines, ix, y);
    y += lines.length * 13 + 2;
  };

  const numberedPoint = (num, text, indent) => {
    const ix = marginX + (indent || 0) + 18;
    const wrap = usableWidth - (indent || 0) - 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(text, wrap);
    ensureSpace(lines.length * 13 + 2);
    doc.setFont('helvetica', 'bold');
    doc.text(String(num) + '.', marginX + (indent || 0), y);
    doc.setFont('helvetica', 'normal');
    doc.text(lines, ix, y);
    y += lines.length * 13 + 2;
  };

  const gap = (n) => { y += (n || 8); };

  const hLine = (color) => {
    ensureSpace(6);
    const c = color || [210, 210, 210];
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(0.6);
    doc.line(marginX, y, marginX + usableWidth, y);
    y += 8;
  };

  // table helpers
  const tableHeaderRow = (cells, xs) => {
    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 39, 51);
    cells.forEach((c, i) => doc.text(String(c), xs[i], y));
    y += 5;
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.7);
    doc.line(marginX, y, marginX + usableWidth, y);
    y += 12;
  };

  const tableRow = (cells, xs, bold) => {
    ensureSpace(16);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    cells.forEach((c, i) => doc.text(String(c), xs[i], y));
    y += 15;
  };

  const tableAltRow = (cells, xs, shade) => {
    if (shade) {
      ensureSpace(16);
      doc.setFillColor(246, 248, 246);
      doc.rect(marginX - 2, y - 11, usableWidth + 4, 14, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    cells.forEach((c, i) => doc.text(String(c), xs[i], y));
    y += 15;
  };

  // accent block (green left border + shaded bg for callouts)
  const calloutBox = (lines) => {
    const lineHeight = 13;
    const totalH = lines.length * lineHeight + 14;
    ensureSpace(totalH + 6);
    doc.setFillColor(245, 252, 236);
    doc.rect(marginX, y - 10, usableWidth, totalH, 'F');
    doc.setFillColor(127, 191, 63);
    doc.rect(marginX, y - 10, 3, totalH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    lines.forEach((line, i) => {
      doc.text(line, marginX + 10, y + i * lineHeight);
    });
    y += totalH + 4;
  };

  const warningBox = (lines) => {
    const lineHeight = 13;
    const totalH = lines.length * lineHeight + 14;
    ensureSpace(totalH + 6);
    doc.setFillColor(254, 245, 245);
    doc.rect(marginX, y - 10, usableWidth, totalH, 'F');
    doc.setFillColor(225, 72, 75);
    doc.rect(marginX, y - 10, 3, totalH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    lines.forEach((line, i) => {
      doc.text(line, marginX + 10, y + i * lineHeight);
    });
    y += totalH + 4;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // COVER PAGE
  // ─────────────────────────────────────────────────────────────────────────────

  // green accent strip at top
  doc.setFillColor(127, 191, 63);
  doc.rect(0, 0, pageWidth, 6, 'F');

  y = 90;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(34);
  doc.setTextColor(20, 39, 51);
  doc.text('Tennis Tracker Pro', marginX, y);
  y += 10;

  doc.setFillColor(127, 191, 63);
  doc.rect(marginX, y, usableWidth, 3, 'F');
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.setTextColor(100, 100, 100);
  doc.text('Complete Feature Guide & Reference', marginX, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text('All features as of July 2026', marginX, y);
  y += 36;

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, marginX + usableWidth, y);
  y += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  const descText =
    'Tennis Tracker Pro is a comprehensive mobile-first web application for recording, ' +
    'analysing and reviewing tennis matches and practice sessions. The app guides you through ' +
    'every point with a step-by-step wizard — capturing serve direction, rally length, shot type, ' +
    'wing, outcome and infractions — then compiles the data into rich statistics and a printable ' +
    'match report. Whether you are tracking a competitive singles match across five sets or a ' +
    'casual practice session, Tennis Tracker Pro gives you the insight to improve your game.';
  const descLines = doc.splitTextToSize(descText, usableWidth);
  doc.text(descLines, marginX, y);
  y += descLines.length * 14 + 28;

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, marginX + usableWidth, y);
  y += 18;

  // Table of Contents
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(20, 39, 51);
  doc.text('Table of Contents', marginX, y);
  y += 16;

  const tocEntries = [
    ['1.  Overview & Navigation', '2'],
    ['2.  Setting Up a Match (Match Tab)', '2'],
    ['3.  Live Tracking — The Wizard (Live Track Tab)', '4'],
    ['4.  Scoring System', '6'],
    ['5.  Tiebreak Rules (Standard 7-Point)', '7'],
    ['6.  Match Tiebreak (10-Point)', '8'],
    ['7.  Game Transition Card (After Each Game)', '9'],
    ['8.  Stats Tab', '10'],
    ['9.  Match Report PDF', '12'],
    ['10. Match History', '13'],
    ['11. Key Scenarios Reference', '13'],
  ];

  tocEntries.forEach(([title, pg]) => {
    ensureSpace(16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text(title, marginX + 10, y);
    doc.setTextColor(100, 100, 100);
    doc.text(pg, marginX + usableWidth, y, { align: 'right' });
    // dotted leader
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.4);
    const titleW = doc.getTextWidth(title) + 16;
    const pageNumW = doc.getTextWidth(pg) + 4;
    const leaderStart = marginX + 10 + titleW + 4;
    const leaderEnd = marginX + usableWidth - pageNumW - 4;
    if (leaderEnd > leaderStart) {
      let lx = leaderStart;
      while (lx < leaderEnd) {
        doc.line(lx, y - 2, Math.min(lx + 2, leaderEnd), y - 2);
        lx += 5;
      }
    }
    y += 16;
  });

  // footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('Tennis Tracker Pro — User Guide', marginX, 830);
  doc.text('Page 1', marginX + usableWidth, 830, { align: 'right' });

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE 2 — SECTION 1: OVERVIEW & NAVIGATION
  // ─────────────────────────────────────────────────────────────────────────────
  newPage();

  doc.setFillColor(127, 191, 63);
  doc.rect(0, 0, pageWidth, 4, 'F');

  sectionHeading('1.  Overview & Navigation');

  bodyText(
    'Tennis Tracker Pro is organised around four tabs that appear at the bottom (or top) of the ' +
    'screen. Each tab becomes active or inactive depending on the current match state.'
  );
  gap(6);

  subHeading('The Four Tabs');

  const tabCols = [marginX, 160, 360];
  tableHeaderRow(['Tab', 'Purpose', 'Active When'], tabCols);
  tableRow(['Match', 'Set up or reconfigure match details', 'Always (before & after a match)'], tabCols);
  tableRow(['Live Track', 'Step-by-step point entry wizard', 'After "Start Match" is pressed'], tabCols);
  tableRow(['Stats', 'Momentum graph and statistics tables', 'At least one point has been logged'], tabCols);
  tableRow(['Close', 'Export PDF, save, and close match', 'After "Start Match" is pressed'], tabCols);
  gap(10);

  subHeading('The Scorebar (ATP-Style Board)');
  bodyText(
    'Once a match is underway the Scorebar appears at the top of the screen, always visible. ' +
    'It mirrors the look of a professional scoreboard and shows:'
  );
  bulletPoint('Player names on two rows (you on top, opponent below)');
  bulletPoint('Set scores for every completed set');
  bulletPoint('Current game score (0/15/30/40/Deuce/AD) or tiebreak point count');
  bulletPoint('A service indicator (ball icon) next to the player currently serving');
  bulletPoint('During a tiebreak: current court side badge — "Deuce Court" or "Ad Court"');
  bulletPoint('During a tiebreak when 6 combined points are reached: a pulsing "Change Ends" alert');
  gap(10);

  subHeading('The Status Message Bar');
  bodyText(
    'A single line below the Scorebar displays context-sensitive messages such as "Your serve — ' +
    'Deuce Court", "Tiebreak in progress", "Game to Kundanapriya", or "Match complete". This ' +
    'message updates automatically after every point and game transition.'
  );
  gap(10);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 2: SETTING UP A MATCH
  // ─────────────────────────────────────────────────────────────────────────────
  sectionHeading('2.  Setting Up a Match (Match Tab)');

  bodyText(
    'Before tracking begins, fill in the Match tab. All fields (except Your Name) are optional ' +
    'but provide richer reports when completed. Tap "Start Match" once you are ready.'
  );
  gap(8);

  subHeading('Player Details');
  bulletPoint('Your Name (required) — the name used for "self" throughout the app and in reports.');
  bulletPoint('Opponent Name — identifies the opposing player in all stats and PDF exports.');
  bulletPoint('Tournament / Location — tournament name or venue, printed in the match header.');
  bulletPoint('Date — auto-filled with today\'s date when you tap "Start Match"; editable.');
  gap(8);

  subHeading('Court & Conditions');
  bulletPoint('Surface — choose from: Acrylic Hard-Court, Artificial Clay, Artificial Grass, ' +
    'Asphalt Hard-Court, Carpet, Clay, Concrete Hard-Court, Grass, or Other.');
  bulletPoint('Indoor / Outdoor — toggle between indoor and outdoor environment.');
  bulletPoint(
    'Opponent Handedness — Right-Handed or Left-Handed. Useful for reviewing tactical patterns ' +
    'in the stats (e.g. how often you hit to the backhand of a left-hander).'
  );
  gap(6);

  subHeading('Weather');
  bodyText(
    'Type any weather description manually (e.g. "Sunny, 28°C, light breeze") or tap the ' +
    '"Get Weather" button. The button uses the device\'s geolocation API to retrieve the ' +
    'current conditions automatically and populates the field. Internet access and location ' +
    'permission are required for automatic weather fetching.'
  );
  gap(8);

  subHeading('Session Type');
  bulletPoint(
    'Match — a scored tennis match. Select a Match Format (see below). Game, set and match ' +
    'scoring rules apply in full.'
  );
  bulletPoint(
    'Practice — a practice session. Game and set structure is replaced by a simple point race. ' +
    'Select a Points Target of 10, 15, or 21 points.'
  );
  gap(8);

  subHeading('Match Format (Match mode only)');

  const fmtCols = [marginX, 210, 355, marginX + usableWidth - 10];
  tableHeaderRow(['Format', 'Sets to Win', 'Decider / Notes'], [marginX, 210, 370]);
  tableAltRow(['Best of 3 Sets (Full)', '2 of 3', 'Full 3rd set played to 6 games'], [marginX, 210, 370], false);
  tableAltRow(['Best of 3 (Match Tiebreak-10)', '2 of 3', '10-point Match Tiebreak as decider'], [marginX, 210, 370], true);
  tableAltRow(['Best of 5 Sets', '3 of 5', 'Full 5th set'], [marginX, 210, 370], false);
  tableAltRow(['Pro-Set', '1 set', 'First to 8 games (no set tiebreak)'], [marginX, 210, 370], true);
  tableAltRow(['Short Sets', '2 of 3', 'First to 4 games per set'], [marginX, 210, 370], false);
  gap(10);

  subHeading('Points Target (Practice mode only)');
  bulletPoint('10 points — quick drill session.');
  bulletPoint('15 points — medium session.');
  bulletPoint('21 points — extended practice.');
  gap(10);

  subHeading('"Serves First" Picker');
  bodyText(
    'After you tap "Start Match" and before the first point is recorded, the app shows a ' +
    '"Who serves first?" picker. Tap the player who won the coin toss and will serve the ' +
    'opening game. The app then tracks server rotation automatically for the entire match, ' +
    'including through tiebreaks and the next set after a tiebreak.'
  );
  gap(4);

  calloutBox([
    'Tip: You can revisit most Match tab fields mid-match (e.g. add a tournament name you',
    'forgot) without disrupting the point log. Changing player names updates all labels',
    'immediately. Session type and match format cannot be changed after starting.'
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE 3 — SECTION 3: LIVE TRACKING — THE WIZARD
  // ─────────────────────────────────────────────────────────────────────────────
  newPage();

  doc.setFillColor(127, 191, 63);
  doc.rect(0, 0, pageWidth, 4, 'F');

  sectionHeading('3.  Live Tracking — The Wizard (Live Track Tab)');

  bodyText(
    'The Live Track tab runs a sequential wizard that collects one piece of information at a ' +
    'time. Each screen has large, easy-to-tap buttons. Follow the steps for every point and the ' +
    'app assembles a complete point record including serve, rally, wing, shot type and outcome.'
  );
  gap(8);

  subHeading('Step 1 — Serve Screen (1st Serve)');
  bodyText('The first screen always shows four options on the server\'s side and two on the receiver\'s side:');

  subSubHeading('Server side');
  bulletPoint('Ace — the serve lands in and the receiver does not touch it. Point committed immediately to server. Wizard ends for this point.');
  bulletPoint('Fault — the 1st serve is out (missed). Proceeds to fault location then 2nd serve screen.');
  bulletPoint('Ball In — the serve goes in and the rally begins. Proceeds to the rally section.');

  subSubHeading('Receiver side');
  bulletPoint('Return Winner — the receiver hits an outright winner off the serve. Proceeds to Wing and Shot Type, then point committed to receiver.');
  bulletPoint('Return Error — the receiver misses the return. Choose Forced Error (server\'s fault — point to server) or Unforced Error (receiver\'s fault — point to server).');
  gap(8);

  subHeading('Fault Path in Detail');

  subSubHeading('1st Serve Fault');
  bodyText('After a first serve fault, the wizard asks for the fault location:');
  bulletPoint('Long — the ball landed beyond the service box baseline.');
  bulletPoint('Wide — the ball landed outside the sideline of the service box.');
  bulletPoint('Net — the ball hit the net cord without going over.');
  bodyText('After selecting a location the wizard advances to the 2nd serve screen.');
  gap(4);

  subSubHeading('2nd Serve / Double Fault');
  bodyText(
    'The 2nd serve screen is identical to the 1st serve screen but with one important difference: ' +
    'a fault here is a Double Fault. After selecting the fault location the point ends immediately — ' +
    'the point is awarded to the receiver. Both fault locations (1st and 2nd serve) are recorded ' +
    'for fault direction analysis in the Stats tab and Match Report.'
  );
  gap(4);

  subSubHeading('Let');
  bodyText(
    'If a let is called (the ball clips the net cord but lands correctly in the service box), ' +
    'tap "Let" on the serve screen. The app replays the same serve attempt — the same serve ' +
    'number (1st or 2nd) — and nothing is logged. Lets do not count as faults.'
  );
  gap(8);

  subHeading('Ball In Path — Rally Tracking');

  subSubHeading('Rally Length');
  bodyText(
    'After a serve lands in, select the number of shots hit in the rally from 1 through 7+. ' +
    'This count includes the serve return and all subsequent shots up to and including the shot ' +
    'that ended the point. A rally of "1" means the return was the point-ending shot.'
  );
  gap(4);

  subSubHeading('Ball in Play Outcome Grid');
  bodyText('A 2-row grid shows outcome buttons for each player:');

  const outcomeCols = [marginX, 140, marginX + usableWidth];
  tableHeaderRow(['Outcome', 'Effect'], [marginX, 140]);
  tableRow(['Winner (your side)', 'Point to you (server or receiver)', ], [marginX, 140]);
  tableRow(['Forced Error (your side)', 'Counts as opponent\'s winner — point to OPPONENT', ], [marginX, 140]);
  tableRow(['Unforced Error (your side)', 'Your mistake — point to OPPONENT'], [marginX, 140]);
  tableRow(['Winner (opp side)', 'Point to opponent'], [marginX, 140]);
  tableRow(['Forced Error (opp side)', 'Counts as your winner — point to YOU'], [marginX, 140]);
  tableRow(['Unforced Error (opp side)', 'Opponent\'s mistake — point to YOU'], [marginX, 140]);
  gap(8);

  subSubHeading('Wing Selection');
  bodyText('After a winner or forced error, the wizard asks which wing produced the shot:');
  bulletPoint('Forehand');
  bulletPoint('Backhand');
  gap(4);

  subSubHeading('Shot Type');
  bodyText('Select the shot type used on the point-ending stroke:');
  bulletPoint('Ground — standard groundstroke (topspin / flat drive)');
  bulletPoint('Slice — backspin groundstroke or low approach');
  bulletPoint('Volley — struck before the ball bounces (net play)');
  bulletPoint('Smash — overhead strike');
  bulletPoint('Lob — high arc shot over the opponent');
  bulletPoint('Passing Shot — groundstroke hit past a net-rushing opponent');
  bulletPoint('Dropshot — short, softly-struck shot designed to barely clear the net');
  gap(8);

  subHeading('Infraction Step');
  bodyText(
    'After the main outcome is recorded, the wizard optionally asks whether a rule infraction ' +
    'occurred on the point. If so, the infraction is recorded against the player at fault and the ' +
    'point outcome is adjusted accordingly. Tap "Skip" if there was no infraction.'
  );
  bulletPoint('Net Touch — player or racket touched the net during the point. Point to opponent.');
  bulletPoint('Double Bounce — ball bounced twice before being struck. Point to opponent.');
  bulletPoint('Foot Fault — server\'s foot crossed the baseline during the serve. Point to receiver.');
  bulletPoint('Code Violation — umpire issues a code violation. Point to opponent (if point penalty applied).');
  bulletPoint('Skip — no infraction. Continue normally.');
  gap(8);

  subHeading('Undo Button');
  bodyText(
    'An "Undo" button is always available on the Live Track tab. Pressing Undo removes the most ' +
    'recently committed point from the log and reverts the score to its previous state — including ' +
    'game score, set score and server. After a Game Transition Card is displayed, pressing Undo ' +
    'dismisses the card and removes the last point of the completed game, returning to an ' +
    'in-progress game. Undo is not available after the match is closed.'
  );
  gap(4);
  warningBox([
    'Note: Undo only removes one point at a time. For deeper corrections, undo multiple',
    'times in sequence — each press removes one additional point going backward.'
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE 4 — SECTION 4: SCORING SYSTEM
  // ─────────────────────────────────────────────────────────────────────────────
  newPage();

  doc.setFillColor(127, 191, 63);
  doc.rect(0, 0, pageWidth, 4, 'F');

  sectionHeading('4.  Scoring System');

  subHeading('Regular Game Scoring');
  bodyText('Tennis uses a non-linear point naming convention within each game:');

  const ptCols = [marginX, 150, 290, 400];
  tableHeaderRow(['Points Won in Game', 'Score Shown', 'Notes'], [marginX, 160, 290]);
  tableRow(['0', '0', ''], [marginX, 160, 290]);
  tableRow(['1', '15', ''], [marginX, 160, 290]);
  tableRow(['2', '30', ''], [marginX, 160, 290]);
  tableRow(['3', '40', 'One more point wins game (if opponent not also at 40)'], [marginX, 160, 290]);
  tableRow(['Both at 40', 'Deuce', 'Next point is Advantage'], [marginX, 160, 290]);
  tableRow(['After Deuce: +1', 'AD-40 / 40-AD', 'Advantage; one more wins the game'], [marginX, 160, 290]);
  tableRow(['After Advantage: lost', 'Deuce', 'Returns to Deuce'], [marginX, 160, 290]);
  gap(8);

  bodyText(
    'A game is won when a player reaches 40 (or Advantage after Deuce) and their opponent has ' +
    'fewer points — i.e. a player needs to be at least two points ahead to win from Deuce. ' +
    'The Scorebar shows the current game score in real time.'
  );
  gap(4);
  bodyText('Server rotation: the player who served one game becomes the receiver for the next game.');
  gap(10);

  subHeading('Set Scoring');
  bulletPoint('A standard set is won by the first player to reach 6 games with a 2-game lead (e.g. 6-3, 6-4, 7-5).');
  bulletPoint('If the score reaches 5-5, play continues to 7-5 or until a 6-6 tiebreak is reached.');
  bulletPoint('At 6-6, a 7-point Tiebreak is played (see Section 5).');
  bulletPoint('Pro-Set: no tiebreak; first to 8 games (win by 2 — 8-6, 9-7, etc.).');
  bulletPoint('Short Sets: first to 4 games (with 2-game lead). At 3-3, a tiebreak is played.');
  gap(10);

  subHeading('Match Format Summary');

  const mfCols = [marginX, 190, 310, 420];
  tableHeaderRow(['Format', 'Sets to Win', 'Final Set Decider', 'Set Tiebreak?'], mfCols);
  tableAltRow(['Best of 3 (Full)', '2 sets', 'Full 3rd set', '7-pt at 6-6'], mfCols, false);
  tableAltRow(['Best of 3 (MTB)', '2 sets', '10-pt Match Tiebreak', '7-pt at 6-6'], mfCols, true);
  tableAltRow(['Best of 5', '3 sets', 'Full 5th set', '7-pt at 6-6'], mfCols, false);
  tableAltRow(['Pro-Set', '8 games', 'N/A (single set)', 'None'], mfCols, true);
  tableAltRow(['Short Sets', '2 sets (4 gm)', '7-pt at 3-3', '7-pt at 3-3'], mfCols, false);
  gap(10);

  subHeading('Practice Mode Scoring');
  bodyText(
    'In Practice mode, game and set structure is entirely removed. Each rally outcome simply ' +
    'increments the point total for the winner. When one player reaches the chosen points target ' +
    '(10, 15, or 21), the session ends immediately. The app freezes the wizard and displays a ' +
    '"Session complete" banner.'
  );
  gap(4);
  calloutBox([
    'In Practice mode the Scorebar shows running point totals (e.g. "8 — 6") instead of',
    'game scores. All serve and shot tracking still functions exactly the same way.'
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE 5 — SECTION 5: TIEBREAK RULES
  // ─────────────────────────────────────────────────────────────────────────────
  newPage();

  doc.setFillColor(127, 191, 63);
  doc.rect(0, 0, pageWidth, 4, 'F');

  sectionHeading('5.  Tiebreak Rules (Standard 7-Point)');

  bodyText(
    'A standard 7-point tiebreak is played whenever a set reaches 6-6 in games (or 3-3 in Short ' +
    'Sets). The tiebreak replaces what would otherwise be a 13th game. Points are counted as ' +
    '1, 2, 3 … instead of 0/15/30/40. The first player to reach 7 points with a minimum 2-point ' +
    'lead wins the tiebreak and the set (set score is recorded as 7-6).'
  );
  gap(10);

  subHeading('When Triggered');
  bulletPoint('Standard sets (Best of 3 / Best of 5): at 6-6 in games.');
  bulletPoint('Short Sets: at 3-3 in games.');
  bulletPoint('Pro-Sets: no tiebreak — play continues until one player leads by 2 games from 8-8 onward.');
  bodyText(
    'Exception: In the Best of 3 Match Tiebreak (MTB) format, the deciding "third set" is ' +
    'replaced entirely by a 10-point Match Tiebreak (see Section 6). This happens immediately ' +
    'when each player has won 1 set — there is no 6-6 trigger for the decider.'
  );
  gap(10);

  subHeading('Serving Rotation');
  bodyText(
    'The serving rotation in a tiebreak follows a strict pattern. The player who would have ' +
    'served next in the regular game rotation serves the first point of the tiebreak — this ' +
    'player is called the "tiebreak starter". The rotation is then:'
  );
  bulletPoint('Point 1: Tiebreak starter serves (from the Deuce court side).');
  bulletPoint('Points 2-3: Opponent serves (2 consecutive service points).');
  bulletPoint('Points 4-5: Tiebreak starter serves again (2 consecutive).');
  bulletPoint('Points 6-7: Opponent serves (2 consecutive).');
  bodyText(
    'After Point 7, the pattern continues: alternating pairs of 2 service points for the ' +
    'remainder of the tiebreak. The app tracks this rotation automatically and highlights the ' +
    'correct server in the Scorebar service indicator before each point.'
  );
  gap(8);

  subHeading('Court Side (Deuce / Ad Court)');
  bodyText(
    'In a tiebreak, the serving court alternates with every point — the opposite of regular ' +
    'games where two points are played from each court.'
  );

  tableHeaderRow(['Tiebreak Point Numbers', 'Serving Court'], [marginX, 260]);
  tableRow(['1, 3, 5, 7, 9, 11 … (odd numbers)', 'Deuce Court'], [marginX, 260]);
  tableRow(['2, 4, 6, 8, 10, 12 … (even numbers)', 'Ad Court'], [marginX, 260]);
  gap(6);
  bodyText(
    'The Scorebar displays a "Deuce Court" or "Ad Court" badge on every tiebreak point so ' +
    'both players always know which side to line up.'
  );
  gap(10);

  subHeading('Change of Ends');
  bodyText(
    'Players change ends during the tiebreak every time the combined total of points played ' +
    'is a multiple of 6 (i.e., after the 6th point, 12th point, 18th point, etc.).'
  );
  calloutBox([
    'When a "change ends" moment is reached, the app displays a pulsing "Change Ends"',
    'alert on the Scorebar. A quick drink break is customary but no formal 90-second rest',
    'period applies — the app does not enforce a timer, simply confirming the change.'
  ]);
  gap(8);

  subHeading('Winning the Tiebreak');
  bulletPoint('First player to reach 7 points AND lead by at least 2 points wins.');
  bulletPoint('Examples: 7-0, 7-3, 7-5 are all valid wins.');
  bulletPoint('If the score reaches 6-6, play continues until one player leads by 2 (8-6, 9-7, 10-8, etc.).');
  gap(8);

  subHeading('After the Tiebreak');
  bodyText(
    'The set score is recorded as 7-6 regardless of the tiebreak point score. The tiebreak ' +
    'mini-score (e.g., 7-5) is stored internally and shown in brackets on the match report.'
  );
  bodyText(
    'Server for the next set: the player who RECEIVED the first serve of the tiebreak becomes ' +
    'the server for the first game of the following set. This is the standard ATP/WTA rule and ' +
    'the app assigns this automatically — you do not need to track it manually.'
  );
  gap(4);
  warningBox([
    'Important: The player who served Point 1 of the tiebreak will RETURN (not serve) the',
    'first game of the next set. The app enforces this rule and will show the correct server.'
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE 6 — SECTION 6: MATCH TIEBREAK (10-POINT)
  // ─────────────────────────────────────────────────────────────────────────────
  newPage();

  doc.setFillColor(127, 191, 63);
  doc.rect(0, 0, pageWidth, 4, 'F');

  sectionHeading('6.  Match Tiebreak (10-Point)');

  bodyText(
    'The 10-point Match Tiebreak (MTB) is used exclusively in the "Best of 3 Sets — Match ' +
    'Tiebreak-10 Decider" format. When each player has won exactly 1 set (1-1 in sets), instead ' +
    'of playing a full third set, a single 10-point Match Tiebreak is played. The winner of the ' +
    'MTB wins the match.'
  );
  gap(8);

  subHeading('When the Match Tiebreak Is Triggered');
  bulletPoint('Format: Best of 3 Sets (Match Tiebreak-10 Decider) only.');
  bulletPoint('Trigger: Sets score reaches 1-1 (each player has won one full set).');
  bulletPoint('The MTB is treated as a third "set" in the match record.');
  gap(8);

  subHeading('Serving Rotation');
  bodyText(
    'The serving rotation mirrors the standard 7-point tiebreak exactly:'
  );
  bulletPoint('Point 1: The player whose turn it is to serve starts (MTB starter), serving from the Deuce court.');
  bulletPoint('Points 2-3: Opponent serves (2 consecutive).');
  bulletPoint('Points 4-5: MTB starter serves (2 consecutive).');
  bodyText('Then alternating pairs of 2 for the remainder of the MTB. The app tracks the server automatically.');
  gap(8);

  subHeading('Court Side and Change of Ends');
  bulletPoint('Odd-numbered points (1, 3, 5, 7 …): Deuce Court — identical to the standard tiebreak.');
  bulletPoint('Even-numbered points (2, 4, 6, 8 …): Ad Court.');
  bulletPoint('Change of ends every 6 combined points — same rule as the standard tiebreak.');
  bodyText(
    'The same "Change Ends" pulsing alert appears on the Scorebar at points 6, 12, 18, etc.'
  );
  gap(8);

  subHeading('Winning the Match Tiebreak');
  bulletPoint('First player to reach 10 points AND lead by at least 2 points wins the MTB and the match.');
  bulletPoint('Examples of valid winning scores: 10-0, 10-5, 10-8, 11-9, 12-10, 15-13, etc.');
  bulletPoint('If the score reaches 9-9, play continues until a 2-point lead is established.');
  gap(8);

  subHeading('How the Score Is Recorded');
  bodyText(
    'The MTB is recorded as a set in the match log. The set score appears in square brackets to ' +
    'distinguish it from regular sets. For example, if the final MTB score is 10-8, the match ' +
    'score display and the PDF report will show: 6-4, 4-6, [10-8].'
  );
  gap(4);
  calloutBox([
    'Example match score display:',
    '  Kundanapriya  6   4   [10]',
    '  Haswith       4   6   [8]',
    'The player whose MTB score is shown as [10] won the match.'
  ]);
  gap(8);

  subHeading('Stats and Reports for the Match Tiebreak');
  bodyText(
    'All shot tracking, serve tracking, and rally tracking function identically inside a Match ' +
    'Tiebreak. Serve stats, fault locations, shot types and rally lengths are all captured and ' +
    'included in the Stats Tab and the Match Report PDF, attributed correctly to the serving ' +
    'and receiving player for each point.'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE 7 — SECTION 7: GAME TRANSITION CARD
  // ─────────────────────────────────────────────────────────────────────────────
  newPage();

  doc.setFillColor(127, 191, 63);
  doc.rect(0, 0, pageWidth, 4, 'F');

  sectionHeading('7.  Game Transition Card (After Each Game)');

  bodyText(
    'After every game ends, the Live Track wizard pauses and a Transition Card slides in. The ' +
    'Transition Card shows a snapshot of the just-completed game\'s statistics before you ' +
    'continue to the next game. The card type depends on what just ended.'
  );
  gap(10);

  subHeading('Game-End Transition Card');
  bodyText('Shown after every game that does not end a set:');
  bulletPoint('"Game to [Player Name]" — large headline showing the game winner.');
  bulletPoint('Current set game score — e.g. "Kundanapriya  4 – 2  Haswith".');
  bulletPoint('"Serves next: [Player Name]" — shows who will serve the following game.');
  gap(4);
  bodyText('Per-game statistics table for the game just completed:');

  const statCols = [marginX, 310];
  tableHeaderRow(['Statistic', 'Description'], statCols);
  tableRow(['Points Won', 'Total points won in this game by each player'], statCols);
  tableRow(['Winners / Forced Errors (W+FE)', 'Outright winners plus shots creating forced errors'], statCols);
  tableRow(['Unforced Errors (UE)', 'Self-inflicted errors (excluding double faults)'], statCols);
  tableRow(['1st Serve %', 'Percentage of first serves landing in the service box'], statCols);
  tableRow(['Won on 1st Serve', 'Points won when the first serve landed in'], statCols);
  tableRow(['Won on 2nd Serve', 'Points won on second-serve rallies'], statCols);
  tableRow(['Aces – Double Faults (A–DF)', 'Aces and double faults recorded in this game'], statCols);
  gap(8);

  bodyText('Buttons on the game-end card:');
  bulletPoint('"Undo" — dismisses the card, removes the last point, and returns to the in-progress game.');
  bulletPoint('"Next Game" — dismisses the card and starts the next game wizard.');
  gap(10);

  subHeading('Set-End Transition Card');
  bodyText('Shown when a game completes a set:');
  bulletPoint('"Set [N] to [Player Name]" — large headline (e.g. "Set 2 to Kundanapriya").');
  bulletPoint('Full set score: sets won by each player (e.g. "Kundanapriya 2 – 0 Haswith").');
  bulletPoint('Per-game stats for the last game of the set (same columns as above).');
  bulletPoint('Button: "Next Set" — begins tracking the following set.');
  gap(10);

  subHeading('Match-End Transition Card');
  bodyText('Shown when the final game or tiebreak completes the match:');
  bulletPoint('"[Player Name] wins the match!" — large headline.');
  bulletPoint('Full set-by-set score for the entire match.');
  bulletPoint('Per-game stats for the final game.');
  bulletPoint('Button: "Continue" — dismisses the card.');
  gap(6);
  bodyText(
    'After "Continue" is tapped, a frozen "Match complete" summary block appears on the Live ' +
    'Track tab. This block shows the final score and two action buttons: "View Stats" (jumps to ' +
    'the Stats tab) and "Close Match" (jumps to the Close tab to save and export). The wizard ' +
    'does NOT reappear — no further point entry is possible without closing and starting a new match.'
  );
  gap(10);

  subHeading('Practice Session End');
  bodyText(
    'In Practice mode, when the point target is reached the wizard freezes immediately — there is ' +
    'no transition card. A "Session complete — [Player Name] wins the session!" banner replaces ' +
    'the wizard area. The Undo button remains available to correct the final point if needed. A ' +
    '"View Stats" button is shown; the Close tab is used to save the session and export the report.'
  );
  gap(4);
  calloutBox([
    'The per-game stats on the transition card are calculated only for the points in the',
    'just-completed game. They do not affect the cumulative stats shown in the Stats tab,',
    'which always cover the full match from point 1.'
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE 8 — SECTION 8: STATS TAB
  // ─────────────────────────────────────────────────────────────────────────────
  newPage();

  doc.setFillColor(127, 191, 63);
  doc.rect(0, 0, pageWidth, 4, 'F');

  sectionHeading('8.  Stats Tab');

  bodyText(
    'The Stats tab provides a complete analytical view of the match in progress or the completed ' +
    'match. Navigate to it at any time after at least one point has been logged. All data updates ' +
    'in real time as points are added or undone.'
  );
  gap(10);

  subHeading('Momentum Graph');
  bodyText(
    'The Momentum Graph is a line chart displaying the cumulative point differential across the ' +
    'entire match. At any given point in time the value is: (your points won) minus (opponent\'s ' +
    'points won). Interpreting the chart:'
  );
  bulletPoint('Line above the zero baseline: you are winning overall on points.');
  bulletPoint('Line below the zero baseline: your opponent is winning overall on points.');
  bulletPoint('A steeply rising line indicates a run of consecutive points in your favour.');
  bulletPoint('Vertical dashed lines mark set boundaries, labelling each set number (Set 1, Set 2, etc.).');
  bodyText(
    'The chart helps you identify momentum shifts and key winning or losing runs during the match.'
  );
  gap(10);

  subHeading('Match Totals Table');
  bodyText('A two-column table comparing cumulative totals for you and your opponent:');

  const mtCols = [marginX, 250, 400];
  tableHeaderRow(['Metric', 'What It Measures'], [marginX, 260]);
  tableRow(['Winners / Forced Errors (W+FE)', 'Total outright winners plus forced errors caused'], [marginX, 260]);
  tableRow(['Unforced Errors (UE)', 'Total self-inflicted errors (incl. double faults)'], [marginX, 260]);
  tableRow(['Ratio (W+FE / UE)', 'Efficiency ratio — higher is better; Inf means zero UE'], [marginX, 260]);
  tableRow(['Points Won', 'Total points won across all games and sets'], [marginX, 260]);
  gap(10);

  subHeading('Serving Statistics');
  bodyText('The Serving Statistics panel covers all service-related metrics for both players:');
  bulletPoint('Service Games / Service Points — total games (or points in Practice) on serve.');
  bulletPoint('Service Games Won % — percentage of service games held.');
  bulletPoint('Break Points Saved — number of break points saved out of those faced (e.g. 4/6).');
  bulletPoint('Aces — outright serves not touched by the receiver.');
  bulletPoint('Double Faults — second serve faults; point awarded to the receiver.');
  bulletPoint('1st Serve % — proportion of all service points where the first serve landed in.');
  bulletPoint('Won on 1st Serve — points won when the first serve landed in (count / attempts).');
  bulletPoint('2nd Serve % — proportion of second-serve attempts that landed in.');
  bulletPoint('Won on 2nd Serve — points won on second-serve rallies (count / attempts).');
  bulletPoint('Ace/DF Ratio — aces divided by double faults; higher indicates more serve aggression.');
  gap(10);

  subHeading('Return Statistics');
  bodyText('The Return Statistics panel mirrors the serving panel from the returner\'s perspective:');
  bulletPoint('Return Games / Return Points — total games (or points in Practice) on return.');
  bulletPoint('Return Games Won % — percentage of opponent\'s service games broken.');
  bulletPoint('Break Points Won — break points converted out of those faced returning (e.g. 2/6).');
  bulletPoint('Won Returning 1st — return points won on the opponent\'s first serve (count / total).');
  bulletPoint('Won Returning 2nd — return points won on the opponent\'s second serve (count / total).');
  bulletPoint('Return Winners / Forced — outright return winners plus returns that forced an error.');
  bulletPoint('Return Unforced Errors — return errors where the ball was comfortably playable.');
  gap(10);

  subHeading('Shot Stats Bar Chart');
  bodyText(
    'A grouped bar chart breaks down every shot category by wing (e.g. "Forehand Ground", ' +
    '"Backhand Slice", "Forehand Volley") and shows:'
  );
  bulletPoint('Green bar: Winners + Forced Errors caused — your attacking production with that shot.');
  bulletPoint('Red bar: Unforced Errors — your mistakes with that shot.');
  bodyText(
    'Categories shown: Forehand Ground, Backhand Ground, Forehand Slice, Backhand Slice, ' +
    'Forehand Volley, Backhand Volley, Forehand Smash, Backhand Smash, Forehand Lob, Backhand ' +
    'Lob, Forehand Passing Shot, Backhand Passing Shot, Forehand Dropshot, Backhand Dropshot. ' +
    'Serves (aces) are tracked separately in the serving section.'
  );
  gap(10);

  subHeading('Point Log');
  bodyText(
    'The full point-by-point log appears at the bottom of the Stats tab. Each entry shows:'
  );
  bulletPoint('Score context — the score at the time the point was played (e.g. "30-15, 3rd game, Set 2").');
  bulletPoint('Point detail — a text description: who served, serve outcome, shot type, wing, error location, rally length, first fault location if applicable, and infraction if any.');
  bodyText(
    'The log is scrollable and provides a complete human-readable record of every point played.'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE 9 — SECTION 9: MATCH REPORT PDF
  // ─────────────────────────────────────────────────────────────────────────────
  newPage();

  doc.setFillColor(127, 191, 63);
  doc.rect(0, 0, pageWidth, 4, 'F');

  sectionHeading('9.  Match Report PDF');

  bodyText(
    'From the Close tab, tap "Export PDF" to generate a comprehensive printable match report. ' +
    'The PDF is formatted for A4 paper and can be saved, printed, or shared directly from the ' +
    'device. The report contains the following sections in order:'
  );
  gap(8);

  const pdfCols = [marginX, 200];
  tableHeaderRow(['Report Section', 'Contents'], pdfCols);
  tableRow(['Match Header', 'Players, tournament, date, surface, indoor/outdoor, opponent handedness, weather, time on court, format'], pdfCols);
  tableRow(['Stats Totals', 'Winners+FE, Unforced Errors, Ratio, Points Won (both players)'], pdfCols);
  tableRow(['Stroke Breakdown — You', 'Bar chart: Winners+FE vs Unforced Errors per shot type (your shots)'], pdfCols);
  tableRow(['Stroke Breakdown — Opponent', 'Same chart for the opponent\'s shots'], pdfCols);
  tableRow(['Serving Statistics', 'Full serving table + two small bar charts (% In and % Won for 1st and 2nd serve)'], pdfCols);
  tableRow(['Return Statistics', 'Full return table with all return metrics'], pdfCols);
  tableRow(['Shot Stats — All Categories', 'Table listing every shot category with W+FE and UE for each player, plus grand totals'], pdfCols);
  tableRow(['Momentum Chart', 'Line chart of cumulative point differential with set boundary lines'], pdfCols);
  tableRow(['Rally Length — Your Serve', 'Bar charts showing points ending on your shot vs returner\'s shot at each rally length'], pdfCols);
  tableRow(['Rally Length — Opponent\'s Serve', 'Same charts from the opponent\'s serving games'], pdfCols);
  tableRow(['Unforced Error Locations — You', 'Bar chart: Net / Wide / Long breakdown per shot type (your errors)'], pdfCols);
  tableRow(['Unforced Error Locations — Opponent', 'Same chart for the opponent\'s error directions'], pdfCols);
  tableRow(['Focus Areas', 'Top 4 recurring unforced error patterns (shot + direction) with coaching advice'], pdfCols);
  tableRow(['Match Notes', 'Any notes you typed during or after the match'], pdfCols);
  tableRow(['Point-by-Point Log', 'Every point with score context, rally length, and full detail description'], pdfCols);
  gap(10);

  subHeading('Exporting and Saving the PDF');
  bulletPoint('Tap "Export PDF" on the Close tab to build the report in-browser using jsPDF.');
  bulletPoint('The file is named automatically based on player names (e.g. "kundanapriya-vs-haswith-report.pdf").');
  bulletPoint('Practice sessions are named with "-practice-report.pdf" suffix.');
  bulletPoint('On mobile, the PDF opens in the browser\'s built-in PDF viewer for sharing or saving.');
  bulletPoint('On desktop, the file downloads directly to the Downloads folder.');
  gap(4);
  calloutBox([
    'The PDF is generated entirely on-device — no data is sent to any server.',
    'The report can be created even without an internet connection once the app has loaded.'
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE 10 — SECTION 10: MATCH HISTORY
  // ─────────────────────────────────────────────────────────────────────────────
  newPage();

  doc.setFillColor(127, 191, 63);
  doc.rect(0, 0, pageWidth, 4, 'F');

  sectionHeading('10.  Match History');

  bodyText(
    'Tennis Tracker Pro automatically saves each completed match to the device\'s local storage. ' +
    'The Match History page lets you browse, review and compare all your saved sessions without ' +
    'needing an account or internet connection.'
  );
  gap(10);

  subHeading('Browsing Match History');
  bulletPoint('All saved matches and practice sessions are listed in reverse chronological order (most recent first).');
  bulletPoint('Each entry shows: date, player names, final set score (or practice result), surface, and session type (Match / Practice).');
  bulletPoint('Use the filter controls to narrow the list by session type, surface, or date range.');
  gap(10);

  subHeading('Viewing a Past Match');
  bodyText(
    'Tap any entry in the history list to open its detailed stats view. This shows the full ' +
    'Stats Tab equivalent for the saved match — including the Momentum Graph, all serving and ' +
    'return tables, shot stats charts, and the complete point-by-point log. You can also ' +
    're-export the match PDF from this view.'
  );
  gap(10);

  subHeading('Deleting a Match');
  bodyText(
    'From the detail view of any saved match, tap the delete (trash) icon to permanently remove ' +
    'the session from local storage. A confirmation prompt appears before deletion. Once deleted, ' +
    'the match record cannot be recovered — ensure you have exported a PDF before deleting if you ' +
    'want a permanent record.'
  );
  gap(10);

  subHeading('Compare Page');
  bodyText(
    'The Compare feature lets you select any two saved matches side by side and review their ' +
    'key statistics in a split-view layout. To use it:'
  );
  numberedPoint(1, 'Open Match History.');
  numberedPoint(2, 'Tap "Compare" (or the compare icon) to enter compare mode.');
  numberedPoint(3, 'Select the first match from the list — it appears in the left column.');
  numberedPoint(4, 'Select the second match — it appears in the right column.');
  numberedPoint(5, 'The app displays all main stats side by side: totals, serving, returning, and shot efficiency.');
  gap(6);
  bodyText(
    'The Compare page is useful for tracking improvement over time (e.g. comparing this week\'s ' +
    'match against the same opponent from a month ago) or for comparing performances on different ' +
    'surfaces or in different match formats.'
  );
  gap(4);
  calloutBox([
    'Match History is stored in the browser\'s localStorage. Clearing browser data,',
    'reinstalling the app (as a PWA), or switching browsers will clear history.',
    'Export PDFs of important matches as a permanent archive.'
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // PAGE 11 — SECTION 11: KEY SCENARIOS REFERENCE
  // ─────────────────────────────────────────────────────────────────────────────
  newPage();

  doc.setFillColor(127, 191, 63);
  doc.rect(0, 0, pageWidth, 4, 'F');

  sectionHeading('11.  Key Scenarios Reference');

  bodyText(
    'The table below summarises the most important edge-case scenarios you may encounter during ' +
    'tracking, what the app does automatically, and what (if anything) you need to do.'
  );
  gap(8);

  const scCols = [marginX, 36, 220, 390];

  // We build this section as numbered callout entries for readability
  const scenarios = [
    {
      num: 1,
      title: 'Server is 0-40 down (Break Point)',
      detail:
        'The server has lost 3 consecutive points in the game: 0-15, 0-30, 0-40. ' +
        'The app shows the score correctly as "0-40". This is break point — one more point ' +
        'wins the game for the receiver. No action required from you; the score updates automatically.',
    },
    {
      num: 2,
      title: 'Deuce (40-40)',
      detail:
        'Both players have won 3 points in the game. The app displays "Deuce" instead of "40-40". ' +
        'The next point is Advantage. If the Advantage holder wins the next point, they win the game. ' +
        'If they lose it, the score returns to Deuce. This can repeat indefinitely.',
    },
    {
      num: 3,
      title: 'Tiebreak starts at 6-6',
      detail:
        'When the game score reaches 6-6 in a set, the app automatically switches to tiebreak mode. ' +
        'The Scorebar shows a tiebreak point counter (0-0) instead of a game score. A court side badge ' +
        '("Deuce Court") and the correct server indicator appear immediately. No action required.',
    },
    {
      num: 4,
      title: 'Tiebreak reaches 6 combined points — Change Ends',
      detail:
        'When the sum of tiebreak points played equals 6 (or 12, 18, etc.), the Scorebar displays a ' +
        'pulsing "Change Ends" alert. Both players should swap ends. Acknowledge the change, take a ' +
        'quick drink break if desired, then continue entering the next point normally.',
    },
    {
      num: 5,
      title: 'Double Fault',
      detail:
        'The server faults on both the 1st and 2nd serve. After logging the 1st serve fault location ' +
        'and then faulting on the 2nd serve and logging its location, the point ends automatically ' +
        'with the receiver winning. Both fault locations are stored for the fault direction analysis ' +
        'in the Stats tab and the Match Report PDF.',
    },
    {
      num: 6,
      title: 'Let Called — Same Serve Replayed',
      detail:
        'If the ball clips the net cord and lands correctly in the service box (a let), tap "Let" ' +
        'on the serve screen. The wizard returns to the same serve attempt (1st or 2nd). Nothing is ' +
        'logged for the let — it is as if the serve was never struck. Lets do not count as faults ' +
        'and do not reduce fault count.',
    },
    {
      num: 7,
      title: 'Infraction — Net Touch, Double Bounce, Foot Fault, Code Violation',
      detail:
        'After logging the main point outcome, the wizard offers an optional infraction step. ' +
        'Select the type of infraction if one occurred. The infraction is recorded against the ' +
        'player at fault and the point is awarded to their opponent. Infractions appear in the ' +
        'point log description. Tap "Skip" if there was no infraction.',
    },
    {
      num: 8,
      title: 'Game Ends — Transition Card Appears',
      detail:
        'The moment you log the point that wins the game, the Live Track wizard pauses and a ' +
        'Transition Card slides in showing the game winner, updated set score, next server, and ' +
        'per-game statistics. Tap "Next Game" to resume or "Undo" to revert the final point.',
    },
    {
      num: 9,
      title: 'Undo After Transition Card Is Shown',
      detail:
        'If you spot a mistake after the Transition Card appears, tap "Undo" directly on the card. ' +
        'The card is dismissed, the last point is removed from the log, and the game score reverts ' +
        'as if that point never happened. The wizard resumes the in-progress game at the corrected score.',
    },
    {
      num: 10,
      title: 'Practice Session Complete',
      detail:
        'When a player reaches the chosen point target (10, 15, or 21 points), the wizard freezes ' +
        'immediately — no transition card is shown. A "Session complete — [Player Name] wins the ' +
        'session!" banner replaces the wizard. The Undo button remains active. Tap "View Stats" to ' +
        'see the stats tab or go to the Close tab to save and export.',
    },
    {
      num: 11,
      title: 'Match Saved — Appears in Match History',
      detail:
        'After closing a match via the Close tab (by tapping "Save Match"), the session is saved to ' +
        'local storage and immediately appears at the top of the Match History list. From history you ' +
        'can view full stats, re-export the PDF, or compare it with another saved match. The saved ' +
        'record persists until you manually delete it from the history page.',
    },
  ];

  scenarios.forEach((sc) => {
    ensureSpace(50);
    // number badge
    doc.setFillColor(127, 191, 63);
    doc.circle(marginX + 8, y - 4, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(String(sc.num), marginX + 8, y - 1, { align: 'center' });
    // title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20, 39, 51);
    doc.text(sc.title, marginX + 22, y);
    y += 14;
    // detail
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const detailLines = doc.splitTextToSize(sc.detail, usableWidth - 12);
    ensureSpace(detailLines.length * 13 + 10);
    doc.text(detailLines, marginX + 12, y);
    y += detailLines.length * 13 + 12;
    // light separator
    doc.setDrawColor(235, 235, 235);
    doc.setLineWidth(0.4);
    doc.line(marginX, y - 4, marginX + usableWidth, y - 4);
    y += 4;
  });

  gap(12);

  // ─────────────────────────────────────────────────────────────────────────────
  // BACK COVER / FINAL PAGE
  // ─────────────────────────────────────────────────────────────────────────────
  newPage();

  doc.setFillColor(20, 39, 51);
  doc.rect(0, 0, pageWidth, 5, 'F');

  y = 80;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(20, 39, 51);
  doc.text('Quick Reference Card', marginX, y);
  y += 8;

  doc.setFillColor(127, 191, 63);
  doc.rect(marginX, y, usableWidth, 3, 'F');
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text('Key shortcuts and reminders for use during a match:', marginX, y);
  y += 20;

  const qrCols = [marginX, 250];
  tableHeaderRow(['Action / Situation', 'What to Do / What the App Does'], qrCols);

  const qrData = [
    ['Start a match', 'Fill in Match tab → tap "Start Match" → pick who serves first'],
    ['Log a point', 'Live Track tab → follow the wizard step by step'],
    ['Ace', 'Serve screen → Ace → point automatically to server'],
    ['1st serve fault', 'Serve screen → Fault → choose location → 2nd serve screen shown'],
    ['Double fault', '2nd serve screen → Fault → choose location → receiver wins point'],
    ['Let', 'Serve screen → Let → same serve attempt replays, nothing logged'],
    ['Return winner', 'Serve screen receiver side → Return Winner → Wing → Shot Type'],
    ['Return error', 'Serve screen receiver side → Return Error → Forced or Unforced'],
    ['Ball in play — rally', 'Serve in → Rally Length → Outcome Grid → Wing → Shot → Infraction'],
    ['Undo last point', 'Tap "Undo" on Live Track tab (also available on transition cards)'],
    ['Tiebreak starts', 'Automatic at 6-6 — app switches mode, shows court side badge'],
    ['Change ends (tiebreak)', 'Alert appears at 6, 12, 18 combined points — swap sides'],
    ['MTB (10-pt) starts', 'Automatic in Best of 3 MTB format when sets reach 1-1'],
    ['Game ends', 'Transition card appears — review stats → tap "Next Game"'],
    ['Match ends', 'Transition card → "Continue" → "Close Match" or "View Stats"'],
    ['Practice session ends', 'Wizard freezes → banner shown → "View Stats" or Close tab'],
    ['Export PDF', 'Close tab → "Export PDF" → file saved / opened in browser'],
    ['View saved matches', 'Open Match History page from app home screen'],
    ['Compare two matches', 'Match History → "Compare" → select two entries'],
  ];

  qrData.forEach(([action, detail], idx) => {
    tableAltRow([action, detail], qrCols, idx % 2 === 0);
  });

  gap(24);
  hLine([210, 210, 210]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(20, 39, 51);
  doc.text('Serve Rotation Cheat Sheet', marginX, y);
  y += 16;

  subSubHeading('Standard Game');
  bodyText('Server alternates after every game. If Player A served Game 1, Player B serves Game 2, and so on.');
  gap(6);

  subSubHeading('Tiebreak (7-pt) and Match Tiebreak (10-pt)');
  const tbCols = [marginX, 110, 220];
  tableHeaderRow(['Points', 'Server', 'Court Side'], tbCols);
  const tbData = [
    ['1', 'Tiebreak Starter', 'Deuce'],
    ['2-3', 'Opponent', 'Ad, Deuce'],
    ['4-5', 'Tiebreak Starter', 'Ad, Deuce'],
    ['6-7', 'Opponent', 'Ad, Deuce'],
    ['8-9', 'Tiebreak Starter', 'Ad, Deuce'],
    ['10-11', 'Opponent', 'Ad, Deuce'],
    ['…', 'Alternating pairs', '…'],
  ];
  tbData.forEach(([pts, server, court], idx) => {
    tableAltRow([pts, server, court], tbCols, idx % 2 === 0);
  });
  gap(6);
  bodyText('Change ends every 6 combined points during any tiebreak or match tiebreak.');

  gap(16);
  hLine([210, 210, 210]);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const finalNote =
    'Tennis Tracker Pro — Complete Feature Guide — All features as of July 2026. ' +
    'Generated automatically by the app. Stats are calculated from the logged point data; ' +
    'accuracy depends on correct wizard entries during the match.';
  const fnLines = doc.splitTextToSize(finalNote, usableWidth);
  ensureSpace(fnLines.length * 12 + 6);
  doc.text(fnLines, marginX, y);
  y += fnLines.length * 12 + 10;

  // green footer strip
  doc.setFillColor(127, 191, 63);
  doc.rect(0, 836, pageWidth, 6, 'F');

  // page numbers on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Tennis Tracker Pro — User Guide', marginX, 830);
    doc.text('Page ' + p, marginX + usableWidth, 830, { align: 'right' });
  }

  return doc;
}

/**
 * downloadAppGuide()
 * Builds the app guide PDF and triggers a browser download.
 */
export function downloadAppGuide() {
  buildAppGuidePdf().save('tennis-tracker-pro-guide.pdf');
}
