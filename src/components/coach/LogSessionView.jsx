import { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { SKILL_LABELS } from './SkillGroupsView';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

// Bulk session logging — real training_sessions writes, one row per
// (present player × checked drill) pair actually on that drill's
// assignment. Checklist and present-player list are built from this coach's
// real active drill_assignments + roster, not a fixed daily schedule.
export default function LogSessionView({ roster }) {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState(null);
  const [unloggedFlags, setUnloggedFlags] = useState({});
  const [error, setError] = useState('');
  const [checkedAssignments, setCheckedAssignments] = useState({});
  const [presentPlayers, setPresentPlayers] = useState({});
  const [date, setDate] = useState(todayIso());
  const [duration, setDuration] = useState('120');
  const [court, setCourt] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getDrillAssignments(user.id)
      .then(async (all) => {
        if (cancelled) return;
        const active = all.filter(a => a.status === 'active');
        setAssignments(active);
        const cutoff = daysAgoIso(7);
        const flags = {};
        await Promise.all(active.map(async (a) => {
          const rows = await Promise.all(a.playerIds.map(pid => api.getTrainingSessions(pid, a.category, a.subcategory)));
          const anyRecent = rows.some(sessions => (sessions || []).some(s => s.sessionDate >= cutoff && (s.drillIds || []).includes(a.drillId)));
          flags[a.id] = !anyRecent;
        }));
        if (!cancelled) setUnloggedFlags(flags);
      })
      .catch(e => { if (!cancelled) { setError(e.message || 'Could not load assigned blocks'); setAssignments([]); } });
    return () => { cancelled = true; };
  }, [user.id]);

  const doneAssignments = useMemo(() => (assignments || []).filter(a => checkedAssignments[a.id]), [assignments, checkedAssignments]);
  const presentIds = useMemo(() => Object.keys(presentPlayers).filter(id => presentPlayers[id]), [presentPlayers]);

  // Rows actually written on save = present players who are on the checked
  // assignment's own player list — not every present player × every drill.
  const plannedRows = useMemo(() => {
    let n = 0;
    for (const a of doneAssignments) n += a.playerIds.filter(pid => presentPlayers[pid]).length;
    return n;
  }, [doneAssignments, presentPlayers]);

  async function handleSave() {
    if (doneAssignments.length === 0 || presentIds.length === 0) return;
    setSaving(true);
    setError('');
    try {
      for (const a of doneAssignments) {
        const rowsFor = a.playerIds.filter(pid => presentPlayers[pid]);
        for (const playerId of rowsFor) {
          await api.logTrainingSession(playerId, {
            category: a.category, subcategory: a.subcategory,
            sessionDate: date, durationMinutes: duration ? Number(duration) : null,
            focusAreas: [SKILL_LABELS[a.skillKey] || a.skillKey],
            drillIds: [a.drillId],
            notes: notes || null,
          });
        }
      }
      setSaved(true);
    } catch (e) {
      setError(e.message || 'Could not log session');
    } finally {
      setSaving(false);
    }
  }

  if (assignments === null) return <div className="text-sm text-muted-foreground">Loading assigned blocks…</div>;

  const unloggedList = (assignments || []).filter(a => unloggedFlags[a.id]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
      <Card className="p-4 sm:p-6 space-y-5">
        <div>
          <div className="font-bold text-sm">What happened on court</div>
          <div className="text-xs text-muted-foreground">From your active assigned blocks — check what was actually completed</div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={e => { setDate(e.target.value); setSaved(false); }} />
          </Field>
          <Field label="Duration (min)">
            <Input type="number" value={duration} onChange={e => { setDuration(e.target.value); setSaved(false); }} />
          </Field>
          <Field label="Court">
            <Input value={court} onChange={e => setCourt(e.target.value)} placeholder="Court 2 · hard" />
          </Field>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Drills completed</div>
          {(assignments || []).length === 0 && <div className="text-sm text-muted-foreground">No active assigned blocks — assign a routine from a Skill Group first.</div>}
          <div className="space-y-2">
            {(assignments || []).map(a => {
              const on = !!checkedAssignments[a.id];
              return (
                <button
                  key={a.id}
                  className={`w-full flex items-center gap-3 p-3 rounded-sm border text-left ${on ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                  onClick={() => { setCheckedAssignments(c => ({ ...c, [a.id]: !on })); setSaved(false); }}
                >
                  <div className={`w-5 h-5 rounded-sm border flex items-center justify-center text-xs shrink-0 ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>{on ? '✓' : ''}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{a.drillTitle}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{a.category} {a.subcategory} &middot; {SKILL_LABELS[a.skillKey] || a.skillKey}</div>
                  </div>
                  <div className={`text-xs font-bold shrink-0 ${on ? 'text-primary' : 'text-muted-foreground'}`}>{a.playerIds.length} players</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Players present</div>
          <div className="flex flex-wrap gap-2">
            {(roster || []).map(p => {
              const on = !!presentPlayers[p.id];
              return (
                <button
                  key={p.id}
                  className={`px-3 py-1.5 rounded-sm text-xs font-semibold border ${on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
                  onClick={() => { setPresentPlayers(pr => ({ ...pr, [p.id]: !on })); setSaved(false); }}
                >
                  {p.displayName}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Notes · visible to the player">
          <Textarea rows={3} value={notes} onChange={e => { setNotes(e.target.value); setSaved(false); }} />
        </Field>

        {error && <div className="text-destructive text-xs">{error}</div>}

        <Button disabled={saving || doneAssignments.length === 0 || presentIds.length === 0} onClick={handleSave}>
          {saved ? 'Session logged ✓' : (saving ? 'Saving…' : 'Log session')}
        </Button>
      </Card>

      <div className="space-y-4">
        <Card className="p-4 sm:p-6">
          <div className="font-bold text-sm mb-4">Session summary</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 p-3 rounded-sm bg-secondary/50">
              <div className="text-xs text-muted-foreground">Blocks completed</div>
              <div className="font-bold text-sm">{doneAssignments.length}</div>
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-sm bg-secondary/50">
              <div className="text-xs text-muted-foreground">Players present</div>
              <div className={`font-bold text-sm ${presentIds.length ? 'text-primary' : 'text-destructive'}`}>{presentIds.length}</div>
            </div>
            <div className="flex items-center justify-between gap-3 p-3 rounded-sm bg-secondary/50">
              <div className="text-xs text-muted-foreground">Session rows to write</div>
              <div className="font-bold text-sm">{plannedRows}</div>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="font-bold text-sm mb-3">Unlogged this week</div>
          {unloggedList.length === 0 && <div className="text-sm text-muted-foreground">Every active block has a session logged in the last 7 days.</div>}
          <div className="space-y-2">
            {unloggedList.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-sm border-l-4 border-destructive bg-secondary/50">
                <div className="flex-1 min-w-32">
                  <div className="text-sm font-semibold">{a.drillTitle}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{a.playerIds.length} players &middot; no session in 7 days</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setCheckedAssignments(c => ({ ...c, [a.id]: true }))}>Log</Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
