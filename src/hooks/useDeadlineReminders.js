import { useEffect } from 'react';
import * as api from '../api';
import { collectImportantDates } from '../lib/playerDashboardDates';

const STORAGE_PREFIX = 'mtp_deadline_reminder_';

/** Create one in-app notification per urgent deadline (once per day). */
export function useDeadlineReminders({ playerId, tournamentItems, interestRows, enabled = true }) {
  useEffect(() => {
    if (!enabled || !playerId) return;
    const dates = collectImportantDates({ tournamentItems, interestRows })
      .filter(d => d.daysUntil >= 0 && d.daysUntil <= 2);
    if (dates.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const pending = dates.filter(d => {
      const key = `${STORAGE_PREFIX}${today}_${d.kind}_${d.date}_${d.tournamentName}`;
      return !localStorage.getItem(key);
    });
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const d of pending.slice(0, 3)) {
        const key = `${STORAGE_PREFIX}${today}_${d.kind}_${d.date}_${d.tournamentName}`;
        try {
          await api.createNotificationsForUsers?.([playerId], {
            type: 'deadline_reminder',
            title: d.label,
            body: `${d.tournamentName} — ${d.daysUntil === 0 ? 'due today' : d.daysUntil === 1 ? 'due tomorrow' : `in ${d.daysUntil} days`} (${d.date})`,
          });
          if (!cancelled) localStorage.setItem(key, '1');
        } catch {
          /* notifications optional in mock mode */
        }
      }
    })();

    return () => { cancelled = true; };
  }, [playerId, tournamentItems, interestRows, enabled]);
}
