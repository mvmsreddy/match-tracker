import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import {
  Sparkles, Loader2, Timer, MessageSquare, ChevronRight,
  AlertTriangle, Trophy, Droplet, Send, Salad, Play, Check,
} from 'lucide-react';
import {
  DAY_TYPE_LABELS, listDayTypes, getActiveDayType, setActiveDayType,
  getTargetForDay, getNutritionProfile,
  activeFuelSession, startFuelSession, tickFuelSession, endFuelSession,
  listMessages, sendMessage, markAllMessagesRead,
} from '../lib/nutritionStore';
import {
  complianceForDay, weeklyReport, bandColor, detectGiTriggers,
  computeNutritionAchievements,
} from '../lib/nutritionCompliance';

// ─── Day-type picker + Today's compliance rings ────────────────────────────
export function ComplianceHero({ athleteId, logs }) {
  const [dayType, setDayTypeState] = useState(() => getActiveDayType(athleteId));
  const day = useMemo(() => complianceForDay(logs, athleteId, undefined, dayType), [logs, athleteId, dayType]);

  function change(dt) {
    setDayTypeState(dt);
    setActiveDayType(athleteId, dt);
  }

  const macros = [
    { k: 'calories',    label: 'Calories', unit: 'kcal' },
    { k: 'proteinG',    label: 'Protein',  unit: 'g' },
    { k: 'carbsG',      label: 'Carbs',    unit: 'g' },
    { k: 'fatsG',       label: 'Fat',      unit: 'g' },
    { k: 'hydrationMl', label: 'Water',    unit: 'ml' },
  ];

  return (
    <Card className="p-4 sm:p-5 space-y-4" data-testid="compliance-hero">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-primary">Today's Plan</div>
          <div className="text-sm font-bold">{DAY_TYPE_LABELS[dayType]}</div>
        </div>
        <select
          value={dayType}
          onChange={e => change(e.target.value)}
          className="h-9 rounded-full border border-border bg-background px-3 text-xs font-bold cursor-pointer"
          data-testid="day-type-select"
        >
          {listDayTypes().map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {macros.map(m => {
          const c = day.compliance[m.k];
          const pct = Math.min(150, Math.round((c.ratio || 0) * 100));
          return (
            <div key={m.k} className="space-y-1" data-testid={`compliance-bar-${m.k}`}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold">{m.label}</span>
                <span className="font-mono text-muted-foreground">
                  {Math.round(c.value)}<span className="text-[10px]"> / {c.goal}{m.unit}</span>
                </span>
              </div>
              <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
                {/* Target hint at 100% */}
                <div className="absolute inset-y-0 left-[66.6%] w-px bg-foreground/20" />
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (pct / 150) * 100)}%`, background: bandColor(c.band) }}
                />
              </div>
              <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: bandColor(c.band) }}>
                {c.band === 'green' ? '🟢 On target' : c.band === 'amber' ? '🟡 Close (±20%)' : c.band === 'orange' ? '🟠 Off track' : '🔴 Red flag'} · {pct}%
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── AI Meal Suggester (streaming) ─────────────────────────────────────────
export function AiMealSuggester({ athleteId }) {
  const [context, setContext] = useState('pre-match in 45 min');
  const [minutes, setMinutes] = useState(45);
  const [tip, setTip] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');

  async function fetchSuggestion() {
    setTip(''); setError(''); setState('streaming');
    const profile = getNutritionProfile(athleteId);
    const dt = getActiveDayType(athleteId);
    const target = getTargetForDay(athleteId, dt);
    try {
      const backendUrl = import.meta.env.VITE_REACT_APP_BACKEND_URL
        || import.meta.env.REACT_APP_BACKEND_URL
        || window.location.origin;
      const res = await fetch(`${backendUrl}/api/nutrition/suggest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: `${athleteId}-${Date.now()}`,
          context,
          minutes_until_match: minutes || null,
          day_type: dt,
          target_macros: target,
          allergens: profile.allergens || [],
          preferences: profile.preferences || [],
          weight_kg: profile.weightKg,
        }),
      });
      if (!res.ok) throw new Error(`Suggester unavailable (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: done')) { setState('done'); return; }
          if (line.startsWith('event: error')) throw new Error('LLM error');
          if (line.startsWith('data: ')) {
            const chunk = line.slice(6);
            if (chunk === '[DONE]') { setState('done'); return; }
            // Convert escaped newlines back
            setTip(prev => prev + chunk.replace(/\\n/g, '\n'));
          }
        }
      }
      setState('done');
    } catch (e) {
      setError(e.message || 'Could not reach suggester');
      setState('error');
    }
  }

  return (
    <Card className="p-4 border-l-4 border-l-primary bg-primary/5" data-testid="ai-meal-suggester">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-primary">AI Dietitian</div>
          <div className="text-sm font-bold">What should I eat right now?</div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-2">
        {[
          { c: 'pre-match in 45 min',    m: 45,  label: 'Pre-match (45m)' },
          { c: 'pre-match in 2 hours',   m: 120, label: 'Pre-match (2h)' },
          { c: 'post-match recovery',    m: 0,   label: 'Post-match' },
          { c: 'morning of tournament',  m: 240, label: 'T-day morning' },
        ].map(preset => (
          <button
            key={preset.label}
            onClick={() => { setContext(preset.c); setMinutes(preset.m); }}
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${context === preset.c ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:border-primary/50'}`}
            data-testid={`suggest-preset-${preset.m}`}
          >{preset.label}</button>
        ))}
      </div>

      <Button size="sm" onClick={fetchSuggestion} disabled={state === 'streaming'} className="w-full" data-testid="suggest-fetch-btn">
        {state === 'streaming' ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Thinking…</> : <><Salad className="w-4 h-4 mr-1.5" />Suggest for me</>}
      </Button>

      {(tip || state === 'streaming') && (
        <div className="mt-3 pt-3 border-t border-primary/15 text-sm whitespace-pre-wrap leading-relaxed" data-testid="suggest-output">
          {tip || '…'}
        </div>
      )}
      {error && <div className="mt-3 text-xs text-destructive font-semibold">{error}</div>}
    </Card>
  );
}

// ─── Peri-Match Fueling Timer ──────────────────────────────────────────────
export function PeriMatchFuelTimer({ athleteId }) {
  const [session, setSession] = useState(() => activeFuelSession(athleteId));
  const [matchIn, setMatchIn] = useState('120');

  const checkpoints = useMemo(() => {
    if (!session) return [];
    const start = new Date(session.matchStartIso || session.startedAt).getTime();
    return [
      { id: 't-120', label: 'T-2h · Solid meal (rice, dal, veg)', offsetMin: -120 },
      { id: 't-60',  label: 'T-1h · Light carb top-up (banana)',  offsetMin: -60 },
      { id: 't-30',  label: 'T-30m · Small sip (electrolyte)',    offsetMin: -30 },
      { id: 't-0',   label: 'Match start · take 250ml on court',  offsetMin: 0 },
      { id: 't+15',  label: 'Changeover · sip + salt tab',        offsetMin: 15 },
      { id: 't+30',  label: 'Post-match · 30g protein + 60g carb',offsetMin: 30 },
    ].map(cp => ({ ...cp, at: new Date(start + cp.offsetMin * 60000).toISOString(), done: !!session.checks.find(c => c.id === cp.id && c.done) }));
  }, [session]);

  function begin() {
    const mins = Number(matchIn);
    if (!mins || mins < 0) return;
    const matchTime = new Date(Date.now() + mins * 60000).toISOString();
    setSession(startFuelSession(athleteId, matchTime));
  }
  function toggle(cpId) {
    const s = tickFuelSession(athleteId, session.id, cpId, !checkpoints.find(c => c.id === cpId)?.done);
    setSession(s);
  }
  function stop() {
    endFuelSession(athleteId, session.id);
    setSession(null);
  }

  return (
    <Card className="p-4" data-testid="fuel-timer">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
          <Timer className="w-5 h-5 text-amber-500" strokeWidth={2.2} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Peri-Match Timer</div>
          <div className="text-sm font-bold">Fuel your match by the clock</div>
        </div>
      </div>

      {!session ? (
        <div className="flex items-center gap-2">
          <Input type="number" value={matchIn} onChange={e => setMatchIn(e.target.value)} placeholder="Minutes until match" className="flex-1" data-testid="fuel-timer-mins" />
          <Button size="sm" onClick={begin} data-testid="fuel-timer-start"><Play className="w-4 h-4 mr-1" />Start</Button>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {checkpoints.map(cp => {
              const past = new Date(cp.at).getTime() <= Date.now();
              return (
                <button
                  key={cp.id}
                  onClick={() => toggle(cp.id)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-colors ${cp.done ? 'bg-primary/10 border-primary/40' : past ? 'bg-amber-500/5 border-amber-500/30' : 'bg-card border-border hover:border-primary/30'}`}
                  data-testid={`fuel-check-${cp.id}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${cp.done ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    {cp.done && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{cp.label}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {new Date(cp.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      {past && !cp.done && ' · overdue'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <Button size="sm" variant="outline" onClick={stop} className="w-full mt-3" data-testid="fuel-timer-stop">End session</Button>
        </>
      )}
    </Card>
  );
}

// ─── Weekly Report Card ────────────────────────────────────────────────────
export function WeeklyReportCard({ athleteId, logs }) {
  const report = useMemo(() => weeklyReport(logs, athleteId), [logs, athleteId]);
  const cramps = report.cramps;

  return (
    <Card className="p-4" data-testid="weekly-report-card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 text-primary" strokeWidth={2.2} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">This Week</div>
          <div className="text-sm font-bold">Compliance report card</div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 text-center">
        {[
          { k: 'calories',    label: 'Cal' },
          { k: 'proteinG',    label: 'Pro' },
          { k: 'carbsG',      label: 'Carb' },
          { k: 'fatsG',       label: 'Fat' },
          { k: 'hydrationMl', label: 'H₂O' },
        ].map(m => (
          <div key={m.k}>
            <div className="font-display font-extrabold text-xl tracking-tighter" style={{ color: report.hitPct[m.k] >= 60 ? 'var(--color-primary)' : report.hitPct[m.k] >= 40 ? '#f59e0b' : '#ef4444' }}>
              {report.hitPct[m.k]}%
            </div>
            <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground">Avg court energy</div>
          <div className="font-bold">{report.avgEnergy != null ? `${report.avgEnergy}/10` : '—'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Cramp reports</div>
          <div className="font-bold" style={{ color: cramps > 0 ? '#ef4444' : undefined }}>{cramps}</div>
        </div>
      </div>

      {report.worstMacro && (
        <div className="mt-3 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs">
          <span className="font-bold text-amber-500">🎯 Focus:</span> Your <span className="font-bold">{report.worstMacro.replace('G', '').replace('Ml', '').toLowerCase()}</span> has been off-target on multiple days this week.
        </div>
      )}
    </Card>
  );
}

// ─── GI Trigger Detection ──────────────────────────────────────────────────
export function GiTriggerCard({ logs }) {
  const triggers = useMemo(() => detectGiTriggers(logs), [logs]);
  if (triggers.length === 0) return null;
  return (
    <Card className="p-4 border-l-4 border-l-amber-500" data-testid="gi-trigger-card">
      <div className="flex items-center gap-3 mb-2">
        <AlertTriangle className="w-5 h-5 text-amber-500" strokeWidth={2.2} />
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">GI Detective</div>
          <div className="text-sm font-bold">Foods correlated with discomfort</div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mb-2 leading-relaxed">
        Cross-referencing meals you ate in the 6 hours before you reported gut discomfort (≤5/10).
      </div>
      <div className="flex flex-wrap gap-2">
        {triggers.map(t => (
          <div key={t.word} className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 text-xs font-bold border border-amber-500/30" data-testid={`gi-trigger-${t.word}`}>
            {t.word} <span className="opacity-60">· {t.incidents}×</span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-muted-foreground mt-2 italic">Consider trialing an elimination phase — remove these one at a time for a week and watch how you feel.</div>
    </Card>
  );
}

// ─── Wellness Log (quick court-energy + gut + cramps) ──────────────────────
export function WellnessQuickLog({ athleteId, onLogged }) {
  const [energy, setEnergy] = useState(7);
  const [gut, setGut] = useState(7);
  const [cramp, setCramp] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setSaving(true);
    const { createNutritionLog } = await import('../api/nutritionMock');
    await createNutritionLog(athleteId, {
      mealType: 'wellness',
      description: `Wellness check-in · Energy ${energy}/10 · Gut ${gut}/10${cramp ? ' · CRAMP' : ''}`,
      courtEnergy: energy,
      gutComfort: gut,
      crampFlag: cramp,
      notes: note,
    });
    setSaving(false); setSaved(true);
    onLogged?.();
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <Card className="p-4" data-testid="wellness-log">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <MessageSquare className="w-5 h-5 text-primary" strokeWidth={2.2} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Quick Wellness Check-in</div>
          <div className="text-sm font-bold">How did you feel on court?</div>
        </div>
      </div>
      <div className="space-y-3">
        <RatingRow label="Court energy" value={energy} onChange={setEnergy} testid="wellness-energy" />
        <RatingRow label="Digestive comfort" value={gut} onChange={setGut} testid="wellness-gut" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cramp} onChange={e => setCramp(e.target.checked)} className="rounded" data-testid="wellness-cramp" />
          I had a cramp today
        </label>
        <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Any notes for your nutritionist?" data-testid="wellness-note" />
        <Button size="sm" onClick={submit} disabled={saving} className="w-full" data-testid="wellness-submit">
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Log check-in'}
        </Button>
      </div>
    </Card>
  );
}

function RatingRow({ label, value, onChange, testid }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="font-semibold">{label}</span>
        <span className="font-display font-extrabold text-lg tracking-tighter">{value}<span className="text-xs text-muted-foreground">/10</span></span>
      </div>
      <input
        type="range" min="1" max="10" value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        data-testid={testid}
      />
    </div>
  );
}

// ─── Nutritionist chat panel (player-side) ────────────────────────────────
export function DietitianChatCard({ athleteId }) {
  const [messages, setMessages] = useState(() => listMessages(athleteId));
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) { markAllMessagesRead(athleteId, 'player'); setMessages(listMessages(athleteId)); }
  }, [athleteId, open]);

  function send() {
    if (!draft.trim()) return;
    sendMessage(athleteId, { from: 'player', text: draft.trim() });
    setDraft('');
    setMessages(listMessages(athleteId));
  }

  const unread = messages.filter(m => !m.read && m.from !== 'player').length;
  return (
    <Card className="p-4" data-testid="dietitian-chat-card">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen(v => !v)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 relative">
            <MessageSquare className="w-5 h-5 text-primary" strokeWidth={2.2} />
            {unread > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">{unread}</span>}
          </div>
          <div className="text-left">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Nutritionist chat</div>
            <div className="text-sm font-bold">Ask your dietitian anything</div>
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 pt-3 border-t border-border" data-testid="dietitian-chat-open">
          <div className="max-h-48 overflow-y-auto space-y-2 mb-2">
            {messages.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No messages yet.</div>}
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.from === 'player' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${m.from === 'player' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'}`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Type a message…" className="flex-1 h-9" data-testid="player-message-input" />
            <Button size="sm" onClick={send} data-testid="player-message-send"><Send className="w-4 h-4" /></Button>
          </div>
        </div>
      )}
    </Card>
  );
}
