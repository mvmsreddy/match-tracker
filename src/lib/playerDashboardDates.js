import { todayLocalIso, toLocalIso } from './dates';

function parseIso(iso) {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function daysUntil(iso, fromIso = todayLocalIso()) {
  const a = new Date(fromIso + 'T00:00:00');
  const b = new Date(iso + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function addDaysIso(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalIso(d);
}

/** Collect upcoming important dates from tournament weeks + AITA interest rows. */
export function collectImportantDates({ tournamentItems = [], interestRows = [], aitaTournaments = [] }) {
  const today = todayLocalIso();
  const rows = [];
  const aitaById = new Map((aitaTournaments || []).map(t => [t.id, t]));

  for (const item of tournamentItems || []) {
    const week = item.week;
    const t = item.interest?.tournament;
    const src = week || t;
    if (!src) continue;
    const name = item.name || week?.name || t?.name || 'Tournament';
    const push = (kind, date, label) => {
      const d = parseIso(date);
      if (!d || d < today) return;
      rows.push({ kind, date: d, label, tournamentName: name, daysUntil: daysUntil(d, today) });
    };
    push('entry', src.entryDeadline || t?.entryDeadline, 'Entry deadline');
    push('freeze', src.freezeDeadline || t?.freezeDeadline, 'Freeze deadline');
    push('withdrawal', src.withdrawalDeadline || t?.withdrawalDeadline, 'Withdrawal deadline');
    push('signin', src.startDate || t?.startDate, 'Sign-in / tournament start');
    push('qualifying', src.qualifyingStartDate || t?.qualifyingStartDate, 'Qualifying starts');
  }

  for (const row of interestRows || []) {
    if (row.status !== 'declared') continue;
    const t = aitaById.get(row.aitaTournamentId) || row.tournament;
    if (!t) continue;
    const name = t.name || 'AITA event';
    const push = (kind, date, label) => {
      const d = parseIso(date);
      if (!d || d < today) return;
      rows.push({ kind, date: d, label, tournamentName: name, daysUntil: daysUntil(d, today) });
    };
    push('entry', t.entryDeadline, 'Entry deadline');
    push('withdrawal', t.withdrawalDeadline, 'Withdrawal deadline');
    push('signin', t.startDate, 'Sign-in / tournament start');
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

export function tomorrowIso(fromIso = todayLocalIso()) {
  return addDaysIso(fromIso, 1);
}

/** Win/loss + tournament participation summary from matches + tournament items. */
export function computePlayerCareerSummary(matches, tournamentItems) {
  const tracked = (matches || []).filter(m => m.points?.length > 0);
  let wins = 0;
  let losses = 0;
  for (const m of tracked) {
    if (m.winner === 'self') wins += 1;
    else if (m.winner === 'opp') losses += 1;
  }
  const tournaments = (tournamentItems || []).length;
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null;
  return { wins, losses, winRate, tournaments, matchesTracked: tracked.length };
}
