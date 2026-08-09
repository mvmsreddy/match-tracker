import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { getInitials } from '../lib/initials';
import { PLAYS_PUBLIC } from '../lib/publicProfile';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Textarea } from '@/components/primitives/textarea';

export default function PublicProfilePage({ mode = 'slug' }) {
  const { slug, token } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [connectMsg, setConnectMsg] = useState('');
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectSent, setConnectSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const load = mode === 'token'
      ? api.getPublicProfileByToken(token)
      : api.getPublicProfileBySlug(slug);
    load
      .then((p) => {
        if (cancelled) return;
        if (!p) setError('This profile is private or not found.');
        else setProfile(p);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message.includes('function') || e.message.includes('column')
            ? 'Public profiles are not enabled yet — run supabase/phase59_public_profiles.sql'
            : e.message);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug, token, mode]);

  async function handleConnect() {
    if (!user) {
      navigate('/login', { state: { from: { pathname: window.location.pathname } } });
      return;
    }
    if (user.id === profile.id) return;
    setConnectBusy(true);
    setError('');
    try {
      await api.sendPlayConnectRequest(user.id, profile.id, connectMsg.trim() || null);
      setConnectSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setConnectBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
        Loading profile…
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-3">
        <div className="text-lg font-display font-extrabold">Profile unavailable</div>
        <p className="text-sm text-muted-foreground max-w-md">{error}</p>
        <Link to="/" className="text-sm text-primary underline">Go to Match Tracker</Link>
      </div>
    );
  }

  const stats = profile.stats || {};
  const highlights = profile.highlights || [];
  const avail = profile.availability;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between max-w-lg mx-auto">
        <Link to="/" className="font-display font-extrabold text-sm tracking-tight">Match Tracker</Link>
        {!user && <Link to="/login" className="text-xs font-semibold text-accent-ink">Log in</Link>}
      </header>

      <main className="max-w-lg mx-auto p-4 pb-10 space-y-4">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display font-extrabold text-xl shrink-0">
              {getInitials(profile.displayName)}
            </div>
            <div className="min-w-0">
              <h1 className="font-display font-extrabold text-xl tracking-tight truncate">{profile.displayName}</h1>
              <div className="text-sm text-muted-foreground mt-0.5">
                {[profile.city, profile.stateAbbr].filter(Boolean).join(', ')}
                {profile.clubName ? ` · ${profile.clubName}` : ''}
              </div>
              {profile.plays && (
                <div className="text-xs text-muted-foreground mt-1">{PLAYS_PUBLIC[profile.plays] || profile.plays}</div>
              )}
            </div>
          </div>

          {profile.publicBio && (
            <p className="text-sm mt-4 leading-relaxed">{profile.publicBio}</p>
          )}

          <div className="grid grid-cols-3 gap-3 mt-5">
            {profile.ranking != null && (
              <div className="text-center p-2 rounded-sm bg-muted/50">
                <div className="font-display font-extrabold text-xl">{profile.ranking}</div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">AITA</div>
              </div>
            )}
            {stats.winRate != null && (
              <div className="text-center p-2 rounded-sm bg-muted/50">
                <div className="font-display font-extrabold text-xl">{stats.winRate}%</div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Win rate</div>
              </div>
            )}
            {stats.titles != null && (
              <div className="text-center p-2 rounded-sm bg-muted/50">
                <div className="font-display font-extrabold text-xl">{stats.titles}</div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Wins</div>
              </div>
            )}
          </div>

          {(stats.tournaments != null || stats.matchesTracked != null || profile.trackerRating != null) && (
            <div className="text-xs text-muted-foreground mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {stats.tournaments != null && <span>{stats.tournaments} tournaments</span>}
              {stats.matchesTracked != null && <span>{stats.matchesTracked} matches tracked</span>}
              {profile.trackerRating != null && <span>Rating {profile.trackerRating}</span>}
            </div>
          )}
        </Card>

        {highlights.length > 0 && (
          <Card className="p-4 sm:p-5">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Career highlights</div>
            <ul className="space-y-1.5">
              {highlights.map((h, i) => (
                <li key={i} className="text-sm">
                  · {h.label}{h.date ? ` (${h.date})` : ''}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {avail && (
          <Card className="p-4 sm:p-5 border-primary/30 bg-primary/5">
            <div className="text-xs uppercase tracking-wider font-bold text-accent-ink mb-1">Interested to play</div>
            <div className="text-sm">
              {[avail.city, avail.area].filter(Boolean).join(' · ')}
              {[avail.surface, avail.format, avail.time_window || avail.timeWindow].filter(Boolean).length > 0 && (
                <div className="text-muted-foreground mt-1">
                  {[avail.surface, avail.format, avail.time_window || avail.timeWindow].filter(Boolean).join(' · ')}
                </div>
              )}
              {avail.notes && <div className="mt-2">{avail.notes}</div>}
            </div>
          </Card>
        )}

        {user?.id !== profile.id && (
          <Card className="p-4 sm:p-5 space-y-3">
            <div className="text-sm font-semibold">Connect to play</div>
            <p className="text-xs text-muted-foreground">
              Send a request — your phone number is not shared automatically.
            </p>
            {connectSent ? (
              <div className="text-sm text-accent-ink font-semibold">Request sent! They can accept from their profile.</div>
            ) : (
              <>
                <Textarea
                  rows={2}
                  placeholder="Hi — saw you're free this week. Up for a practice hit?"
                  value={connectMsg}
                  onChange={(e) => setConnectMsg(e.target.value)}
                />
                <Button disabled={connectBusy} onClick={handleConnect}>
                  {connectBusy ? 'Sending…' : user ? 'Send connect request' : 'Log in to connect'}
                </Button>
              </>
            )}
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Match history, scores, and contact details are private on Match Tracker.
        </p>

        {error && profile && <div className="text-sm text-destructive text-center">{error}</div>}
      </main>
    </div>
  );
}
