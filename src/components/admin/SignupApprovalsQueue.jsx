import { useEffect, useState } from 'react';
import * as api from '../../api';
import { compareAitaPlayerProfile } from '../../lib/signupApproval';
import { Button } from '@/components/primitives/button';
import { Badge } from '@/components/primitives/badge';

function timeAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const ROLE_LABELS = {
  player: 'Player',
  organizer: 'Organizer',
};

export default function SignupApprovalsQueue() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [aitaLookups, setAitaLookups] = useState({});

  function reload() {
    api.getPendingSignupApprovals()
      .then(setRows)
      .catch(e => setError(e.message || 'Could not load signup queue'));
  }

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (!rows?.length) return;
    let cancelled = false;
    for (const row of rows) {
      if (row.role !== 'player' || !row.aitaReg || aitaLookups[row.id]) continue;
      api.lookupAitaPlayer(row.aitaReg)
        .then(aita => {
          if (cancelled) return;
          setAitaLookups(prev => ({ ...prev, [row.id]: aita }));
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [rows, aitaLookups]);

  async function handleApprove(row, setVerified = false) {
    setBusyId(row.id);
    setError('');
    try {
      const aita = aitaLookups[row.id];
      const check = row.role === 'player' ? compareAitaPlayerProfile(row, aita) : { matched: true };
      await api.approveSignup(row.id, {
        setVerified: setVerified || row.role === 'organizer',
        aitaMatchVerified: row.role === 'player' ? check.matched : false,
      });
      setRows(prev => prev.filter(r => r.id !== row.id));
    } catch (e) {
      setError(e.message || 'Could not approve');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(row) {
    const reason = window.prompt('Optional rejection reason:') ?? '';
    setBusyId(row.id);
    setError('');
    try {
      await api.rejectSignup(row.id, reason);
      setRows(prev => prev.filter(r => r.id !== row.id));
    } catch (e) {
      setError(e.message || 'Could not reject');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-destructive">{error}</div>;
  if (rows === null) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">Loading…</div>;
  if (rows.length === 0) return <div className="border border-dashed border-border rounded-sm p-6 text-center text-sm text-muted-foreground">No pending signups.</div>;

  return (
    <div className="space-y-3">
      {rows.map(row => {
        const aita = aitaLookups[row.id];
        const check = row.role === 'player' ? compareAitaPlayerProfile(row, aita) : null;
        return (
          <div key={row.id} className="rounded-sm border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-bold text-sm">{row.displayName || 'Unnamed user'}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {ROLE_LABELS[row.role] || row.role} · requested {timeAgo(row.createdAt)}
                </div>
              </div>
              <Badge variant="secondary">{ROLE_LABELS[row.role] || row.role}</Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {row.aitaReg && <div><span className="text-muted-foreground">AITA reg:</span> <span className="font-semibold">{row.aitaReg}</span></div>}
              {row.stateAbbr && <div><span className="text-muted-foreground">State:</span> {row.stateAbbr}</div>}
              {row.dateOfBirth && <div><span className="text-muted-foreground">DOB:</span> {row.dateOfBirth}</div>}
              {row.gender && <div><span className="text-muted-foreground">Gender:</span> {row.gender}</div>}
              {row.clubName && <div><span className="text-muted-foreground">Club:</span> {row.clubName}</div>}
            </div>

            {row.role === 'player' && row.aitaReg && (
              <div className={`rounded-sm border px-3 py-2 text-xs ${check?.matched ? 'border-primary/30 bg-primary/5' : 'border-amber-500/30 bg-amber-500/10'}`}>
                {aita === undefined && 'Checking AITA player list…'}
                {aita === null && 'No matching AITA registration found — verify manually before approving.'}
                {aita && (
                  <>
                    AITA record: <span className="font-semibold">{aita.name || aita.playerName}</span>
                    {check?.issues?.length > 0 && (
                      <span className="text-amber-700 dark:text-amber-300"> — {check.issues.join('; ')}</span>
                    )}
                    {check?.matched && <span className="text-accent-ink"> — looks consistent</span>}
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busyId === row.id} onClick={() => handleApprove(row)}>
                Approve
              </Button>
              {row.role === 'organizer' && (
                <Button size="sm" variant="secondary" disabled={busyId === row.id} onClick={() => handleApprove(row, true)}>
                  Approve + verify organizer
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => handleReject(row)}>
                Reject
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
