import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { minEligibleAgeGroup } from '../utils/eligibility';
import { isPushSupported, getPushSubscriptionStatus, subscribeToPush, unsubscribeFromPush } from '../lib/push';
import { getInitials } from '../lib/initials';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { Badge } from '@/components/primitives/badge';

// AITA Rules KB — Annual Tournament Limits (junior circuit only; count is
// combined across all age groups a player enters, per §2). Adult ("Open")
// entries aren't capped.
const ANNUAL_ENTRY_CAP = { U10: 18, U12: 18, U14: 25, U16: 30, U18: null, Open: null };

const STATES = [
  'AP','AR','AS','BR','CG','GA','GJ','HR','HP','JH','KA','KL',
  'MP','MH','MN','ML','MZ','NL','OD','PB','RJ','SK','TN','TS',
  'TR','UP','UK','WB','AN','CH','DN','DD','DL','JK','LA','LD','PY',
];

const ROLE_LABELS = {
  player:    'Player',
  coach:     'Coach',
  parent:    'Parent',
  organizer: 'Tournament Organizer',
};

const GENDER_LABELS   = { M: 'Male', F: 'Female' };
const PLAYS_LABELS    = { R: 'Right-handed', L: 'Left-handed' };
const BACKHAND_LABELS = { '1H': 'One-handed', '2H': 'Two-handed' };

function getAge(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age--;
  return age;
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-right">{value || value === 0 ? value : '—'}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

const selectCls = 'rounded-sm border border-input bg-transparent px-3 py-1.5 text-sm h-9';

// Phase 41 — daily reminder + weekly coach digest email toggles.
function ReminderPrefsCard({ user, refreshProfile }) {
  const [reminderEnabled, setReminderEnabled] = useState(user.reminderEnabled || false);
  const [reminderTime, setReminderTime] = useState(user.reminderTime?.slice(0, 5) || '18:00');
  const [weeklyDigest, setWeeklyDigest] = useState(user.weeklyDigest || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isCoach = user.role === 'coach';

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      await api.updateReminderPrefs(user.id, { reminderEnabled, reminderTime, weeklyDigest: isCoach ? weeklyDigest : undefined });
      await refreshProfile();
    } catch (e) {
      setError(e.message || 'Could not save preferences');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Email Reminders</div>
      <label className="flex items-center gap-2 mt-3 text-sm">
        <input type="checkbox" className="accent-primary w-4 h-4" checked={reminderEnabled} onChange={e => setReminderEnabled(e.target.checked)} />
        Remind me if I haven't logged anything today
      </label>
      {reminderEnabled && (
        <div className="mt-2 ml-6">
          <Field label="Reminder time">
            <Input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} className="w-32" />
          </Field>
        </div>
      )}
      {isCoach && (
        <label className="flex items-center gap-2 mt-3 text-sm">
          <input type="checkbox" className="accent-primary w-4 h-4" checked={weeklyDigest} onChange={e => setWeeklyDigest(e.target.checked)} />
          Send me a weekly roster digest every Monday
        </label>
      )}
      {error && <div className="text-destructive text-xs mt-2">{error}</div>}
      <Button size="sm" className="mt-3" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
    </Card>
  );
}

// Phase 39 — Web Push toggle. Self-contained: owns its own
// support-check/status/subscribe/unsubscribe rather than threading through
// the profile `form` state, since the subscription lives in the browser
// (Push API + service worker), not as a field on the profile record.
function PushToggleCard({ userId }) {
  const [status, setStatus] = useState('checking'); // 'checking' | 'unsupported' | 'subscribed' | 'unsubscribed'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isPushSupported()) { setStatus('unsupported'); return; }
    getPushSubscriptionStatus().then(setStatus).catch(() => setStatus('unsubscribed'));
  }, []);

  async function handleToggle() {
    setBusy(true);
    setError('');
    try {
      if (status === 'subscribed') {
        await unsubscribeFromPush();
        setStatus('unsubscribed');
      } else {
        await subscribeToPush(userId);
        setStatus('subscribed');
      }
    } catch (e) {
      setError(e.message || 'Could not update push notifications');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'unsupported') return null;

  return (
    <Card className="p-4 sm:p-6 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Push Notifications</div>
        <div className="text-xs text-muted-foreground mt-1">
          {status === 'subscribed' ? 'Enabled on this device' : 'Get notified here even when the app is closed'}
        </div>
        {error && <div className="text-destructive text-xs mt-1">{error}</div>}
      </div>
      <Button size="sm" variant={status === 'subscribed' ? 'outline' : 'default'} onClick={handleToggle} disabled={busy || status === 'checking'}>
        {busy ? 'Updating…' : status === 'subscribed' ? 'Turn off' : 'Turn on'}
      </Button>
    </Card>
  );
}

// Phase 34 — user-declared streak freeze days (travel/rest dates that count
// as neither logged nor missed — src/lib/streaks.js). Self-contained: owns
// its own fetch/add/delete rather than threading through the big profile
// `form` state, since freeze dates save immediately and aren't part of the
// edit/cancel/save flow the rest of this page uses.
function StreakFreezeCard({ userId }) {
  const [freezes, setFreezes] = useState(null);
  const [date, setDate] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getStreakFreezes(userId)
      .then(data => { if (!cancelled) setFreezes(data); })
      .catch(() => { if (!cancelled) setFreezes([]); });
    return () => { cancelled = true; };
  }, [userId]);

  async function handleAdd() {
    if (!date) return;
    setError('');
    try {
      const created = await api.addStreakFreeze(userId, date);
      setFreezes(prev => [created, ...(prev || [])].sort((a, b) => b.freezeDate.localeCompare(a.freezeDate)));
      setDate('');
    } catch (e) {
      setError(e.message || 'Could not add freeze day');
    }
  }

  async function handleRemove(id) {
    try {
      await api.deleteStreakFreeze(id);
      setFreezes(prev => prev.filter(f => f.id !== id));
    } catch (e) {
      setError(e.message || 'Could not remove freeze day');
    }
  }

  return (
    <Card className="p-4 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold">Streak Freeze</div>
          <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Mark travel or rest days so they don't break your logging streak.
          </div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="flex-1"
          data-testid="freeze-day-date-input"
        />
        <Button size="sm" onClick={handleAdd} disabled={!date} data-testid="freeze-day-add-btn">
          + Add freeze day
        </Button>
      </div>
      {error && <div className="text-destructive text-xs mt-2">{error}</div>}
      {freezes === null ? (
        <div className="text-xs text-muted-foreground mt-4">Loading…</div>
      ) : freezes.length === 0 ? (
        <div className="text-xs text-muted-foreground mt-4 italic">No freeze days set.</div>
      ) : (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">
            Frozen dates ({freezes.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {freezes.map(f => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 bg-primary/10 text-primary border border-primary/20"
                data-testid={`freeze-day-${f.id}`}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" />
                </svg>
                {f.freezeDate}
                <button
                  onClick={() => handleRemove(f.id)}
                  className="ml-0.5 -mr-1 w-5 h-5 flex items-center justify-center rounded-full hover:bg-destructive hover:text-white transition-colors text-primary"
                  title="Remove"
                  aria-label={`Remove freeze day ${f.freezeDate}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();

  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('bio');

  const [form, setForm] = useState({
    displayName:   user.displayName || user.name || '',
    role:          user.role || 'player',
    aitaReg:       user.aitaReg || '',
    stateAbbr:     user.stateAbbr || '',
    dateOfBirth:   user.dateOfBirth || '',
    gender:        user.gender || '',
    ranking:       user.ranking || '',
    clubName:      user.clubName || '',
    bio:           user.bio || '',

    phone:         user.phone || '',
    homeCourt:     user.homeCourt || '',
    nationality:   user.nationality || '',
    country:       user.country || '',
    city:          user.city || '',
    region:        user.region || '',
    postalCode:    user.postalCode || '',
    height:        user.height || '',
    plays:         user.plays || '',
    backhand:      user.backhand || '',

    racquetBrand:  user.racquetBrand || '',
    racquetName:   user.racquetName || '',
    racquetYear:   user.racquetYear || '',
    stringBrand:   user.stringBrand || '',
    stringName:    user.stringName || '',
    stringTension: user.stringTension || '',
    shoeBrand:     user.shoeBrand || '',
    shoeName:      user.shoeName || '',
    bagBrand:      user.bagBrand || '',
    bagName:       user.bagName || '',
    gripBrand:     user.gripBrand || '',
    gripName:      user.gripName || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  function handleCancel() {
    setForm({
      displayName:   user.displayName || user.name || '',
      role:          user.role || 'player',
      aitaReg:       user.aitaReg || '',
      stateAbbr:     user.stateAbbr || '',
      dateOfBirth:   user.dateOfBirth || '',
      gender:        user.gender || '',
      ranking:       user.ranking || '',
      clubName:      user.clubName || '',
      bio:           user.bio || '',
      phone:         user.phone || '',
      homeCourt:     user.homeCourt || '',
      nationality:   user.nationality || '',
      country:       user.country || '',
      city:          user.city || '',
      region:        user.region || '',
      postalCode:    user.postalCode || '',
      height:        user.height || '',
      plays:         user.plays || '',
      backhand:      user.backhand || '',
      racquetBrand:  user.racquetBrand || '',
      racquetName:   user.racquetName || '',
      racquetYear:   user.racquetYear || '',
      stringBrand:   user.stringBrand || '',
      stringName:    user.stringName || '',
      stringTension: user.stringTension || '',
      shoeBrand:     user.shoeBrand || '',
      shoeName:      user.shoeName || '',
      bagBrand:      user.bagBrand || '',
      bagName:       user.bagName || '',
      gripBrand:     user.gripBrand || '',
      gripName:      user.gripName || '',
    });
    setError('');
    setEditing(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.displayName.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await api.upsertProfile(user.id, {
        ...form,
        ranking:     form.ranking ? Number(form.ranking) : null,
        racquetYear: form.racquetYear ? Number(form.racquetYear) : null,
      });
      await refreshProfile();
      setSaved(true);
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  const isPlayer    = form.role === 'player';
  const isCoach     = form.role === 'coach';
  const isOrganizer = form.role === 'organizer';
  const age = getAge(form.dateOfBirth);

  // Annual entry allowance (real count, not decorative)
  const [entryCount, setEntryCount] = useState(null);
  useEffect(() => {
    if (!isPlayer || !user.aitaReg) return;
    let cancelled = false;
    api.getMyTournamentEntryCountThisYear(user.aitaReg)
      .then(count => { if (!cancelled) setEntryCount(count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isPlayer, user.aitaReg]);
  const ageGroup = form.dateOfBirth ? minEligibleAgeGroup(form.dateOfBirth, new Date().getFullYear()) : null;
  const entryCap = ageGroup ? ANNUAL_ENTRY_CAP[ageGroup] : null;

  // Profile completeness for players
  const missingPlayerFields = isPlayer
    ? [
        !form.aitaReg && 'AITA Registration No.',
        !form.dateOfBirth && 'Date of Birth',
        !form.gender && 'Gender',
        !form.stateAbbr && 'State',
      ].filter(Boolean)
    : [];

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto space-y-4">
      <Card className="p-5 sm:p-6 bg-primary/5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display font-extrabold text-xl sm:text-2xl shrink-0 shadow-lg ring-4 ring-primary/10">
            {getInitials(form.displayName)}
          </span>
          <div className="flex-1 min-w-40">
            <h1 className="font-display font-extrabold text-xl sm:text-2xl tracking-tighter">{form.displayName || 'Unnamed Player'}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary">{ROLE_LABELS[form.role] || form.role}</Badge>
              {user.isVerified && <Badge className="bg-primary/10 text-primary border-transparent">✓ Verified</Badge>}
              {isPlayer && form.ranking && (
                <Badge className="bg-primary/10 text-primary border-transparent">Rank #{form.ranking}</Badge>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => (editing ? handleCancel() : setEditing(true))}>
            {editing ? 'Cancel' : '✎ Edit'}
          </Button>
        </div>
      </Card>

      {missingPlayerFields.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400 shadow-sm">
          <span className="text-2xl shrink-0">⚠</span>
          <span>
            Complete your profile to enter tournaments.
            Missing: <strong>{missingPlayerFields.join(', ')}</strong>.
          </span>
        </div>
      )}

      {!editing && isPlayer && ageGroup && entryCap != null && entryCount !== null && (
        <Card className="p-4 sm:p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Annual Entry Allowance</div>
            <div className="text-xs font-bold text-primary">
              {Math.round((entryCount / entryCap) * 100)}%
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="font-display font-extrabold text-3xl text-primary">{entryCount}</div>
            <div className="text-xs text-muted-foreground">of {entryCap} {ageGroup} tournaments used this year</div>
          </div>
          <div className="h-2.5 rounded-full bg-muted mt-3 overflow-hidden">
            <div 
              className="h-full rounded-full bg-primary transition-all duration-500" 
              style={{ width: `${Math.min(100, Math.round((entryCount / entryCap) * 100))}%` }} 
            />
          </div>
          <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {Math.max(0, entryCap - entryCount)} entr{entryCap - entryCount === 1 ? 'y' : 'ies'} remain. Two age groups at
            one venue count as two tournaments — this is advisory and doesn't block entry.
          </div>
        </Card>
      )}

      {!editing && <PushToggleCard userId={user.id} />}
      {!editing && !isOrganizer && <ReminderPrefsCard user={user} refreshProfile={refreshProfile} />}
      {!editing && !isOrganizer && <StreakFreezeCard userId={user.id} />}

      {!editing && (
        <div className="inline-flex border border-border rounded-sm p-1 bg-card gap-1">
          <button
            type="button"
            className={`px-4 py-1.5 rounded-sm text-xs font-semibold transition-colors ${tab === 'bio' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setTab('bio')}
          >
            Bio
          </button>
          <button
            type="button"
            className={`px-4 py-1.5 rounded-sm text-xs font-semibold transition-colors ${tab === 'ratings' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setTab('ratings')}
          >
            Ratings
          </button>
        </div>
      )}

      {editing ? (
        <form onSubmit={handleSave} className="space-y-4">
          <Card className="p-4 sm:p-6">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Basic Info</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Display Name *">
                <Input value={form.displayName} onChange={e => handleChange('displayName', e.target.value)} placeholder="Your full name" />
              </Field>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Role</div>
                <div className="grid grid-cols-2 gap-2">
                  {['player', 'coach', 'parent', 'organizer'].map(r => (
                    <button
                      key={r}
                      type="button"
                      className={`px-2 py-1.5 rounded-sm text-xs font-semibold border ${form.role === r ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                      onClick={() => handleChange('role', r)}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-6">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Contact &amp; Location</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Phone"><Input value={form.phone} onChange={e => handleChange('phone', e.target.value)} placeholder="Phone number" /></Field>
              <Field label="Home Court"><Input value={form.homeCourt} onChange={e => handleChange('homeCourt', e.target.value)} placeholder="e.g. SLTA Academy Courts" /></Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <Field label="Nationality"><Input value={form.nationality} onChange={e => handleChange('nationality', e.target.value)} /></Field>
              <Field label="Country"><Input value={form.country} onChange={e => handleChange('country', e.target.value)} /></Field>
              <Field label="City"><Input value={form.city} onChange={e => handleChange('city', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="Region"><Input value={form.region} onChange={e => handleChange('region', e.target.value)} /></Field>
              <Field label="Postal Code"><Input value={form.postalCode} onChange={e => handleChange('postalCode', e.target.value)} /></Field>
            </div>
          </Card>

          {(isPlayer || isCoach) && (
            <Card className="p-4 sm:p-6">
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">
                {isPlayer ? 'Player Details' : 'Coaching Details'}
              </div>
              {isPlayer && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="AITA Registration No."><Input value={form.aitaReg} onChange={e => handleChange('aitaReg', e.target.value)} placeholder="e.g. 442320" /></Field>
                  <Field label="Current AITA Ranking"><Input type="number" value={form.ranking} onChange={e => handleChange('ranking', e.target.value)} placeholder="e.g. 17" min="1" /></Field>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <Field label="State">
                  <select className={selectCls} value={form.stateAbbr} onChange={e => handleChange('stateAbbr', e.target.value)}>
                    <option value="">Select state…</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                {isPlayer && (
                  <Field label="Date of Birth">
                    <Input type="date" value={form.dateOfBirth} onChange={e => handleChange('dateOfBirth', e.target.value)} />
                  </Field>
                )}
                {isPlayer && (
                  <Field label="Gender">
                    <select className={selectCls} value={form.gender} onChange={e => handleChange('gender', e.target.value)}>
                      <option value="">Select…</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </Field>
                )}
                {isCoach && (
                  <Field label="Club / Academy">
                    <Input value={form.clubName} onChange={e => handleChange('clubName', e.target.value)} placeholder="Club or academy name" />
                  </Field>
                )}
              </div>
              {isPlayer && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                  <Field label="Height"><Input value={form.height} onChange={e => handleChange('height', e.target.value)} placeholder={'e.g. 5\'11" or 180 cm'} /></Field>
                  <Field label="Plays">
                    <select className={selectCls} value={form.plays} onChange={e => handleChange('plays', e.target.value)}>
                      <option value="">Select…</option>
                      <option value="R">Right-handed</option>
                      <option value="L">Left-handed</option>
                    </select>
                  </Field>
                  <Field label="Backhand">
                    <select className={selectCls} value={form.backhand} onChange={e => handleChange('backhand', e.target.value)}>
                      <option value="">Select…</option>
                      <option value="1H">One-handed</option>
                      <option value="2H">Two-handed</option>
                    </select>
                  </Field>
                </div>
              )}
            </Card>
          )}

          {isOrganizer && (
            <Card className="p-4 sm:p-6">
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Organizer Details</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Club / Organisation Name"><Input value={form.clubName} onChange={e => handleChange('clubName', e.target.value)} placeholder="e.g. SLTA Academy" /></Field>
                <Field label="State">
                  <select className={selectCls} value={form.stateAbbr} onChange={e => handleChange('stateAbbr', e.target.value)}>
                    <option value="">Select state…</option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              {user.isVerified && <Badge className="bg-primary/10 text-primary border-transparent mt-3">Verified Organizer</Badge>}
            </Card>
          )}

          {(isPlayer || isCoach) && (
            <Card className="p-4 sm:p-6">
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">Equipment</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Racquet Brand"><Input value={form.racquetBrand} onChange={e => handleChange('racquetBrand', e.target.value)} /></Field>
                <Field label="Racquet Name"><Input value={form.racquetName} onChange={e => handleChange('racquetName', e.target.value)} /></Field>
                <Field label="Racquet Year"><Input type="number" value={form.racquetYear} onChange={e => handleChange('racquetYear', e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <Field label="String Brand"><Input value={form.stringBrand} onChange={e => handleChange('stringBrand', e.target.value)} /></Field>
                <Field label="String Name"><Input value={form.stringName} onChange={e => handleChange('stringName', e.target.value)} /></Field>
                <Field label="String Tension"><Input value={form.stringTension} onChange={e => handleChange('stringTension', e.target.value)} placeholder="e.g. 52 lbs" /></Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <Field label="Shoe Brand"><Input value={form.shoeBrand} onChange={e => handleChange('shoeBrand', e.target.value)} /></Field>
                <Field label="Shoe Name"><Input value={form.shoeName} onChange={e => handleChange('shoeName', e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <Field label="Bag Brand"><Input value={form.bagBrand} onChange={e => handleChange('bagBrand', e.target.value)} /></Field>
                <Field label="Bag Name"><Input value={form.bagName} onChange={e => handleChange('bagName', e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <Field label="Grip Brand"><Input value={form.gripBrand} onChange={e => handleChange('gripBrand', e.target.value)} /></Field>
                <Field label="Grip Name"><Input value={form.gripName} onChange={e => handleChange('gripName', e.target.value)} /></Field>
              </div>
            </Card>
          )}

          <Card className="p-4 sm:p-6">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-3">About</div>
            <Textarea value={form.bio} onChange={e => handleChange('bio', e.target.value)} placeholder="A short bio (optional)" rows={3} />
          </Card>

          {error && <div className="text-destructive text-sm">{error}</div>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Profile'}</Button>
            {saved && <span className="text-sm text-primary font-semibold">Saved!</span>}
          </div>
        </form>
      ) : tab === 'bio' ? (
        <div className="space-y-4">
          <Card className="p-4 sm:p-6">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Contact</div>
            <Row label="Email" value={user.email} />
            <Row label="Phone" value={form.phone} />
          </Card>

          <Card className="p-4 sm:p-6">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Location</div>
            <Row label="Home Court" value={form.homeCourt} />
            <Row label="Nationality" value={form.nationality} />
            <Row label="Country" value={form.country} />
            <Row label="City" value={form.city} />
            <Row label="Region" value={form.region} />
            <Row label="Postal Code" value={form.postalCode} />
          </Card>

          {isPlayer && (
            <Card className="p-4 sm:p-6">
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Physical</div>
              <Row label="Age" value={age} />
              <Row label="Gender" value={GENDER_LABELS[form.gender]} />
              <Row label="Height" value={form.height} />
              <Row label="Plays" value={PLAYS_LABELS[form.plays]} />
              <Row label="Backhand" value={BACKHAND_LABELS[form.backhand]} />
            </Card>
          )}

          <Card className="p-4 sm:p-6">
            <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">About</div>
            <div className="text-sm">{form.bio || '—'}</div>
          </Card>

          {(isPlayer || isCoach) && (
            <Card className="p-4 sm:p-6">
              <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Equipment</div>
              <Row label="Racquet Brand" value={form.racquetBrand} />
              <Row label="Racquet Name" value={form.racquetName} />
              <Row label="Racquet Year" value={form.racquetYear} />
              <Row label="String Brand" value={form.stringBrand} />
              <Row label="String Name" value={form.stringName} />
              <Row label="String Tension" value={form.stringTension} />
              <Row label="Shoe Brand" value={form.shoeBrand} />
              <Row label="Shoe Name" value={form.shoeName} />
              <Row label="Bag Brand" value={form.bagBrand} />
              <Row label="Bag Name" value={form.bagName} />
              <Row label="Grip Brand" value={form.gripBrand} />
              <Row label="Grip Name" value={form.gripName} />
            </Card>
          )}
        </div>
      ) : (
        <Card className="p-4 sm:p-6">
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Ranking &amp; Status</div>
          <Row label="Role" value={ROLE_LABELS[form.role] || form.role} />
          <Row label="Verified" value={user.isVerified ? 'Yes' : 'No'} />
          {isPlayer && <Row label="AITA Registration No." value={form.aitaReg} />}
          {isPlayer && <Row label="Current AITA Ranking" value={form.ranking} />}
          <Row label="State" value={form.stateAbbr} />
          {(isCoach || isOrganizer) && <Row label="Club / Academy" value={form.clubName} />}
        </Card>
      )}
    </div>
  );
}
