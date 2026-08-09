import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../../api';
import { Button } from '@/components/primitives/button';
import { Card } from '@/components/primitives/card';
import OrganizerTournamentCard from './OrganizerTournamentCard';
import HostTournamentModal from './HostTournamentModal';
import { computeOrganizerStage } from '../../utils/organizerTournamentStage';

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
  return `${Math.round(hours / 24)} day${Math.round(hours / 24) !== 1 ? 's' : ''} ago`;
}

function claimStatusLabel(status) {
  if (status === 'pending') return 'Waiting for admin approval';
  if (status === 'rejected') return 'Not approved — you can resubmit';
  if (status === 'approved') return 'Approved';
  return status;
}

export default function OrganizerHome({ user, onHostTournament }) {
  const navigate = useNavigate();
  const [weeks, setWeeks] = useState(null);
  const [claims, setClaims] = useState(null);
  const [showHostModal, setShowHostModal] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.listMyTournamentWeeks(user.id),
      api.listMyAitaClaims(user.id),
    ])
      .then(([w, c]) => {
        if (cancelled) return;
        setWeeks(w);
        setClaims(c);
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load organizer data'); });
    return () => { cancelled = true; };
  }, [user.id]);

  const pendingClaims = useMemo(
    () => (claims || []).filter(c => c.status === 'pending' || c.status === 'rejected'),
    [claims],
  );

  const liveWeeks = useMemo(() => {
    return (weeks || [])
      .map(w => ({
        week: w,
        events: w.events || [],
        stage: computeOrganizerStage(w, w.events || []),
      }))
      .filter(({ stage }) => stage.stage !== 'complete')
      .slice(0, 5);
  }, [weeks]);

  const needsAttention = useMemo(() => {
    return liveWeeks.filter(({ stage }) =>
      stage.stage === 'setup'
      || (stage.stage === 'entries' && stage.events?.some(e => e.entriesOpen))
      || stage.stage === 'draw',
    );
  }, [liveWeeks]);

  function handleCardAction(action, week, events) {
    if (action === 'add_event' || action === 'open_all_entries') {
      navigate(`/tournaments/${week.id}`);
      return;
    }
    const ev = events?.[0];
    if (ev) navigate(`/tournaments/${week.id}/events/${ev.id}`);
    else navigate(`/tournaments/${week.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="p-4 flex flex-col gap-3">
          <div className="text-sm font-bold">Claim an AITA event</div>
          <div className="text-xs text-muted-foreground flex-1">
            Official AITA tournaments sync automatically. Claim the one you run to accept entries and track matches.
          </div>
          <Link to="/aita-calendar?mode=claim">
            <Button size="sm" className="w-full sm:w-auto">Find AITA tournament →</Button>
          </Link>
        </Card>
        <Card className="p-4 flex flex-col gap-3">
          <div className="text-sm font-bold">Create a standalone event</div>
          <div className="text-xs text-muted-foreground flex-1">
            For club tournaments, invitational meets, or anything not listed on the AITA calendar.
          </div>
          <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => (onHostTournament ? onHostTournament('standalone') : setShowHostModal(true))}>
            Create new event
          </Button>
        </Card>
      </div>

      {pendingClaims.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Pending claims</div>
          <div className="space-y-2">
            {pendingClaims.slice(0, 5).map(claim => (
              <div key={claim.id} className="rounded-sm border border-border bg-card p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{claim.tournament?.name || 'AITA tournament'}</div>
                  <div className="text-xs text-muted-foreground">
                    {claimStatusLabel(claim.status)}
                    {claim.createdAt && ` · submitted ${timeAgo(claim.createdAt)}`}
                  </div>
                </div>
                <Link to={claim.tournament ? `/aita-calendar/${claim.tournament.id}` : '/aita-calendar?mode=claim'}>
                  <Button size="sm" variant="outline">View</Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {needsAttention.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Needs attention</div>
          <div className="space-y-2">
            {needsAttention.map(({ week, events }) => (
              <OrganizerTournamentCard
                key={week.id}
                week={{ ...week, eventCount: events.length }}
                events={events}
                compact
                onAction={handleCardAction}
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">My live events</div>
          <Link to="/tournaments" className="text-xs font-semibold text-accent-ink hover:underline">View all →</Link>
        </div>
        {error && <div className="text-sm text-muted-foreground border border-dashed border-border rounded-sm p-4 text-center">{error}</div>}
        {weeks === null && !error && <div className="text-sm text-muted-foreground border border-dashed border-border rounded-sm p-4 text-center">Loading…</div>}
        {weeks && liveWeeks.length === 0 && !error && (
          <div className="text-sm text-muted-foreground border border-dashed border-border rounded-sm p-4 text-center">
            No live events yet — claim an AITA tournament or create a standalone one to get started.
          </div>
        )}
        {liveWeeks.length > 0 && (
          <div className="space-y-2">
            {liveWeeks.map(({ week, events }) => (
              <OrganizerTournamentCard
                key={week.id}
                week={{ ...week, eventCount: events.length }}
                events={events}
                compact
                onAction={handleCardAction}
              />
            ))}
          </div>
        )}
      </div>

      <HostTournamentModal
        open={showHostModal}
        onClose={() => setShowHostModal(false)}
        onClaimAita={() => navigate('/aita-calendar?mode=claim')}
        onCreateStandalone={() => {
          setShowHostModal(false);
          onHostTournament?.('standalone');
        }}
      />
    </div>
  );
}
