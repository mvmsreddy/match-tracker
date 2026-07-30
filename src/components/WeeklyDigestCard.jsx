import { useEffect, useState } from 'react';
import { Card } from '@/components/primitives/card';
import { Mail, Send, Check, AlertCircle, Loader2 } from 'lucide-react';
import { computeMomentum } from '../lib/motivation';
import { computeStreak } from '../lib/streaks';
import { avgSkillRatings } from '../lib/localStore';
import * as api from '../api';

const LS_OPT_IN_KEY = 'mtp_digest_optin_v1';

function readOptIn(userId) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_OPT_IN_KEY)) || {};
    return !!all[userId];
  } catch { return false; }
}
function writeOptIn(userId, on) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_OPT_IN_KEY)) || {};
    all[userId] = !!on;
    localStorage.setItem(LS_OPT_IN_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

async function buildDigestStats({ user, matches }) {
  const weekAgo = Date.now() - 7 * 86400000;
  const inWeek = (matches || []).filter(m => new Date(m.date).getTime() >= weekAgo);
  const matchesOnly = inWeek.filter(m => m.sessionType !== 'practice');
  const wins = matchesOnly.filter(m => m.winner === 'self').length;
  const losses = matchesOnly.filter(m => m.winner === 'opp').length;
  const practices = inWeek.filter(m => m.sessionType === 'practice').length;

  const streak = computeStreak((matches || []).map(m => m.date));
  const ratings = avgSkillRatings(user.id, 5);
  const topSkillKey = ratings ? Object.entries(ratings).sort(([, a], [, b]) => b - a)[0] : null;
  const momentum = computeMomentum({ matches: matches || [], streak: streak.current, ratings });

  return {
    matches_played: matchesOnly.length,
    matches_won: wins,
    matches_lost: losses,
    practices,
    streak_days: streak.current,
    top_skill: topSkillKey ? topSkillKey[0] : null,
    top_skill_rating: topSkillKey ? Number(topSkillKey[1].toFixed(1)) : null,
    momentum_score: momentum.score,
    momentum_label: momentum.label,
    achievements_unlocked: 0,
  };
}

/**
 * WeeklyDigestCard — Profile-page control for opting in to the Monday
 * summary email and firing off a preview to your own inbox. All state is
 * client-side (localStorage opt-in); the actual send goes to the backend
 * /api/digest/send which proxies Resend.
 */
export default function WeeklyDigestCard({ user }) {
  const [optedIn, setOptedIn] = useState(() => readOptIn(user.id));
  const [matches, setMatches] = useState([]);
  const [state, setState] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.listMatches(user.id)
      .then(m => { if (!cancelled) setMatches(m || []); })
      .catch(() => { if (!cancelled) setMatches([]); });
    return () => { cancelled = true; };
  }, [user.id]);

  function toggle() {
    const next = !optedIn;
    setOptedIn(next);
    writeOptIn(user.id, next);
  }

  async function sendNow() {
    setState('sending');
    setError('');
    try {
      const stats = await buildDigestStats({ user, matches });
      const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL
        || import.meta.env.REACT_APP_BACKEND_URL
        || window.location.origin;
      const res = await fetch(`${backendUrl}/api/digest/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_email: user.email,
          player_name: user.displayName || user.name || 'Player',
          stats,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Digest send failed (${res.status})`);
      setState('sent');
      setTimeout(() => setState('idle'), 4000);
    } catch (e) {
      setError(e.message || 'Could not send digest');
      setState('error');
    }
  }

  return (
    <Card className="p-4 sm:p-5 shadow-sm" data-testid="weekly-digest-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5 text-primary" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Weekly Digest</div>
              <div className="text-sm font-bold mt-0.5">Monday morning summary email</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0" data-testid="digest-optin-toggle">
              <input type="checkbox" checked={optedIn} onChange={toggle} className="sr-only peer" />
              <div className="w-11 h-6 bg-muted peer-checked:bg-primary rounded-full transition-colors peer-focus:ring-2 peer-focus:ring-primary/30">
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mt-0.5 ${optedIn ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </label>
          </div>

          <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Get an inbox recap of last week's matches, streak and top skill — every Monday at 8am your local time.
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={sendNow}
              disabled={state === 'sending'}
              className="rounded-full bg-primary text-primary-foreground px-3.5 py-2 text-xs font-bold inline-flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.97]"
              data-testid="digest-send-now-btn"
            >
              {state === 'sending' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {state === 'sent' && <Check className="w-3.5 h-3.5" />}
              {state !== 'sending' && state !== 'sent' && <Send className="w-3.5 h-3.5" />}
              {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Sent' : 'Send preview now'}
            </button>
            <span className="text-[11px] text-muted-foreground">→ {user.email}</span>
          </div>

          {state === 'error' && (
            <div className="mt-3 text-xs text-destructive font-semibold flex items-start gap-1.5" data-testid="digest-error">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
