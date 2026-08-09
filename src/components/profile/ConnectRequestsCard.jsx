import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';

export default function ConnectRequestsCard({ userId }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  async function reload() {
    setLoading(true);
    try {
      setRequests(await api.listIncomingConnectRequests(userId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function respond(id, status) {
    setBusyId(id);
    try {
      await api.respondPlayConnectRequest(id, userId, status);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return null;
  if (!requests.length) return null;

  return (
    <Card className="p-4 sm:p-6 space-y-3">
      <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Play connect requests</div>
      {requests.map((r) => (
        <div key={r.id} className="border border-border rounded-sm p-3 space-y-2">
          <div className="text-sm font-semibold">
            {r.fromProfileSlug ? (
              <Link to={`/p/${r.fromProfileSlug}`} className="text-accent-ink hover:underline">
                {r.fromDisplayName || 'Player'}
              </Link>
            ) : (r.fromDisplayName || 'Player')}
          </div>
          {r.message && <p className="text-sm text-muted-foreground">{r.message}</p>}
          <div className="flex gap-2">
            <Button size="sm" disabled={busyId === r.id} onClick={() => respond(r.id, 'accepted')}>Accept</Button>
            <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => respond(r.id, 'declined')}>Decline</Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
