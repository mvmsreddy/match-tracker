import { useEffect, useState } from 'react';
import * as api from '../../api';
import { useSegmentMatchSchedule } from '../../hooks/useSegmentMatchSchedule';
import TodaysMatchHero from './TodaysMatchHero';
import MyAitaParticipationCard from './MyAitaParticipationCard';
import { LogTodayReminder } from '@/components/DashboardExtras';
import { Button } from '@/components/primitives/button';

// Consolidates everything that used to be scattered across the old
// single-page dashboard into one "what needs my attention today" list:
// today's match, pending doubles invitations, tournament entry/withdrawal
// deadlines + draw-sheet uploads (via MyAitaParticipationCard), and the
// log-today nudge. Sits above the tab content so it's visible no matter
// which tab is active. Renders nothing for a coach/parent viewing a linked
// player — none of these are actions they can take on the player's behalf.
export default function TodayPanel({ playerId, circuit, isOwnDashboard }) {
  const schedule = useSegmentMatchSchedule(playerId, circuit);
  const [matches, setMatches] = useState(null);
  const [pendingInvites, setPendingInvites] = useState([]);

  useEffect(() => {
    if (!isOwnDashboard) return;
    let cancelled = false;
    api.listMatches(playerId)
      .then(list => { if (!cancelled) setMatches(list); })
      .catch(() => { if (!cancelled) setMatches([]); });
    api.getMyPendingInvitations()
      .then(data => { if (!cancelled) setPendingInvites(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [playerId, isOwnDashboard]);

  if (!isOwnDashboard) return null;

  async function respond(inv, accept) {
    try {
      await api.respondToInvitation(inv.id, accept);
      setPendingInvites(prev => prev.filter(i => i.id !== inv.id));
    } catch (e) {
      alert(e.message);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const loggedToday = matches ? matches.some(m => m.date === today) : true; // avoid a flash before matches load

  return (
    <div className="space-y-4">
      {circuit && <TodaysMatchHero upcoming={schedule.upcoming} circuit={circuit} isOwnDashboard={isOwnDashboard} />}

      {pendingInvites.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-amber-500">
            Doubles Invitations ({pendingInvites.length})
          </div>
          {pendingInvites.map(inv => (
            <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-sm border border-border bg-card flex-wrap">
              <div>
                <div className="text-sm font-bold">
                  Doubles invitation — {inv.event?.tournament_week?.name || 'tournament'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {inv.event?.category} {inv.event?.age_group} · From AITA {inv.inviter_aita_reg}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => respond(inv, true)}>Accept</Button>
                <Button size="sm" variant="outline" onClick={() => respond(inv, false)}>Decline</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <MyAitaParticipationCard isOwnDashboard={isOwnDashboard} />

      {matches && <LogTodayReminder loggedToday={loggedToday} />}
    </div>
  );
}
