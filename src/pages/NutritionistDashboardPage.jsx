import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import * as api from '../api';
import { getNutritionLogs } from '../api/nutritionMock';
import {
  DAY_TYPE_LABELS, listDayTypes, getAllTargets, saveTargets,
  getNutritionProfile, saveNutritionProfile,
  getAthleteRoster, addAthlete,
  listTemplates, saveTemplate, deleteTemplate,
  listMessages, sendMessage, markAllMessagesRead, unreadCount,
  listBodyLog, addBodyEntry,
} from '../lib/nutritionStore';
import { weeklyReport, bandColor, detectGiTriggers } from '../lib/nutritionCompliance';
import {
  Apple, Users, Salad, Beaker, MessageSquare, Activity, ChevronRight,
  Plus, Trash2, Send, AlertTriangle, TrendingUp, TrendingDown, Utensils, Weight,
} from 'lucide-react';

const TABS = [
  { id: 'roster',     label: 'Athletes',           icon: Users },
  { id: 'plan',       label: 'Plan',               icon: Salad },
  { id: 'protocols',  label: 'Protocols',          icon: Beaker },
  { id: 'templates',  label: 'Meal Templates',     icon: Utensils },
  { id: 'body',       label: 'Body Composition',   icon: Weight },
  { id: 'messages',   label: 'Messages',           icon: MessageSquare },
];

export default function NutritionistDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const [tab, setTab] = useState('roster');
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [roster, setRoster] = useState([]);
  const [logsByAthlete, setLogsByAthlete] = useState({});

  useEffect(() => {
    if (!user) return;
    const r = getAthleteRoster(user.id);
    // Seed with the demo player on first load so the panel isn't empty
    if (r.length === 0) {
      const seeded = [{ id: 'u_player', name: 'Aarav Sharma', email: 'player@matchtracker.app', addedAt: new Date().toISOString() }];
      addAthlete(user.id, seeded[0]);
      setRoster(seeded);
    } else {
      setRoster(r);
    }
  }, [user]);

  useEffect(() => {
    Promise.all(roster.map(a => getNutritionLogs(a.id).then(l => [a.id, l])))
      .then(pairs => {
        const map = {};
        for (const [id, logs] of pairs) map[id] = logs;
        setLogsByAthlete(map);
      });
  }, [roster]);

  useEffect(() => {
    if (params.athleteId) {
      const a = roster.find(x => x.id === params.athleteId);
      if (a) { setSelectedAthlete(a); setTab('plan'); }
    }
  }, [params.athleteId, roster]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-6 space-y-4" data-testid="nutritionist-dashboard">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
          <Apple className="w-6 h-6 text-primary" strokeWidth={2.2} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-primary">Nutritionist Console</div>
          <h1 className="font-display font-extrabold text-2xl leading-tight">Hi, {user.displayName || user.name}</h1>
        </div>
      </div>

      {/* Athlete selector + Tab strip */}
      {selectedAthlete && (
        <Card className="p-3 flex items-center justify-between" data-testid="nutritionist-selected-athlete">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Editing plan for</div>
            <div className="font-bold text-sm">{selectedAthlete.name}</div>
          </div>
          <button
            className="text-xs font-bold text-primary underline"
            onClick={() => { setSelectedAthlete(null); setTab('roster'); }}
            data-testid="nutritionist-clear-athlete"
          >
            Change
          </button>
        </Card>
      )}

      <div className="flex overflow-x-auto gap-1 border-b border-border pb-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-secondary'
            }`}
            data-testid={`nutritionist-tab-${t.id}`}
          >
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'roster' && (
        <AthleteRosterTab
          roster={roster}
          logsByAthlete={logsByAthlete}
          onSelect={a => { setSelectedAthlete(a); setTab('plan'); }}
          nutritionistId={user.id}
          onRosterChange={setRoster}
        />
      )}
      {tab === 'plan' && selectedAthlete && <PlanConfigTab athleteId={selectedAthlete.id} />}
      {tab === 'plan' && !selectedAthlete && <SelectAthleteHint onGo={() => setTab('roster')} />}
      {tab === 'protocols' && selectedAthlete && <SupplementalProtocolsTab athleteId={selectedAthlete.id} />}
      {tab === 'protocols' && !selectedAthlete && <SelectAthleteHint onGo={() => setTab('roster')} />}
      {tab === 'templates' && <MealTemplatesTab nutritionistId={user.id} />}
      {tab === 'body' && selectedAthlete && <BodyCompositionTab athleteId={selectedAthlete.id} />}
      {tab === 'body' && !selectedAthlete && <SelectAthleteHint onGo={() => setTab('roster')} />}
      {tab === 'messages' && selectedAthlete && <MessagesTab athleteId={selectedAthlete.id} fromRole="nutritionist" />}
      {tab === 'messages' && !selectedAthlete && <SelectAthleteHint onGo={() => setTab('roster')} />}
    </div>
  );
}

function SelectAthleteHint({ onGo }) {
  return (
    <Card className="p-6 text-center">
      <div className="text-sm font-bold">Pick an athlete first</div>
      <div className="text-xs text-muted-foreground mt-1">Open the Athletes tab and choose one to configure.</div>
      <Button size="sm" className="mt-3" onClick={onGo}>Open roster</Button>
    </Card>
  );
}

// ─── Athlete Roster ────────────────────────────────────────────────────────
function AthleteRosterTab({ roster, logsByAthlete, onSelect }) {
  return (
    <div className="space-y-3" data-testid="nutritionist-roster">
      <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Your athletes</div>
      {roster.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">No athletes assigned yet. Ask them to link with you from their profile.</Card>
      )}
      {roster.map(a => {
        const logs = logsByAthlete[a.id] || [];
        const rep = weeklyReport(logs, a.id);
        const worst = rep.worstMacro;
        const gi = detectGiTriggers(logs);
        const flag = worst || gi.length > 0 || rep.cramps > 1;
        return (
          <Card
            key={a.id}
            className={`p-4 flex items-start justify-between gap-3 cursor-pointer hover:border-primary/50 transition-colors ${flag ? 'border-l-4 border-l-amber-500' : ''}`}
            onClick={() => onSelect(a)}
            data-testid={`roster-athlete-${a.id}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="font-bold text-sm">{a.name}</div>
                {flag && <span className="text-[10px] uppercase font-bold text-amber-500 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />Flag</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{a.email}</div>
              <div className="mt-2 grid grid-cols-5 gap-1 max-w-md">
                {['calories', 'proteinG', 'carbsG', 'fatsG', 'hydrationMl'].map(m => (
                  <div key={m} className="text-center">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${rep.hitPct[m]}%`, background: bandColor(rep.hitPct[m] >= 60 ? 'green' : rep.hitPct[m] >= 40 ? 'amber' : 'red') }} />
                    </div>
                    <div className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground mt-1">
                      {m === 'proteinG' ? 'P' : m === 'carbsG' ? 'C' : m === 'fatsG' ? 'F' : m === 'hydrationMl' ? 'H2O' : 'Cal'}
                    </div>
                  </div>
                ))}
              </div>
              {gi.length > 0 && (
                <div className="mt-2 text-[11px] text-amber-600 font-semibold">
                  🩺 GI trigger suspects: {gi.slice(0, 3).map(g => g.word).join(', ')}
                </div>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
          </Card>
        );
      })}
    </div>
  );
}

// ─── Plan Config (Day-type macro grid) ─────────────────────────────────────
function PlanConfigTab({ athleteId }) {
  const [targets, setTargetsState] = useState(() => getAllTargets(athleteId));
  const dayTypes = listDayTypes();
  const [saved, setSaved] = useState(false);
  const [profile, setProfileState] = useState(() => getNutritionProfile(athleteId));

  useEffect(() => { setTargetsState(getAllTargets(athleteId)); setProfileState(getNutritionProfile(athleteId)); }, [athleteId]);

  function updateCell(dt, macro, val) {
    setTargetsState(t => ({ ...t, [dt]: { ...t[dt], [macro]: Number(val) || 0 } }));
    setSaved(false);
  }
  function persist() {
    saveTargets(athleteId, targets);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }
  function toggleTag(kind, tag) {
    const list = profile[kind] || [];
    const next = list.includes(tag) ? list.filter(t => t !== tag) : [...list, tag];
    const updated = { ...profile, [kind]: next };
    setProfileState(updated);
    saveNutritionProfile(athleteId, updated);
  }
  function updateMicro(key, val) {
    const updated = { ...profile, micronutrientTargets: { ...profile.micronutrientTargets, [key]: Number(val) || 0 } };
    setProfileState(updated);
    saveNutritionProfile(athleteId, updated);
  }

  const macros = [
    { k: 'calories',    label: 'Cal',    unit: 'kcal' },
    { k: 'proteinG',    label: 'P',      unit: 'g' },
    { k: 'carbsG',      label: 'C',      unit: 'g' },
    { k: 'fatsG',       label: 'F',      unit: 'g' },
    { k: 'hydrationMl', label: 'H₂O',    unit: 'ml' },
    { k: 'sodiumMg',    label: 'Na',     unit: 'mg' },
  ];

  return (
    <div className="space-y-6" data-testid="nutritionist-plan">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Day-type macro grid</div>
            <div className="text-sm font-bold">Prescribe daily targets by day type</div>
          </div>
          <Button size="sm" onClick={persist} data-testid="plan-save-btn">{saved ? 'Saved ✓' : 'Save plan'}</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-2 pr-3 font-bold">Day Type</th>
                {macros.map(m => <th key={m.k} className="text-center py-2 px-2 font-bold">{m.label}<div className="text-[9px] font-normal text-muted-foreground">{m.unit}</div></th>)}
              </tr>
            </thead>
            <tbody>
              {dayTypes.map(dt => (
                <tr key={dt.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-semibold">{dt.label}</td>
                  {macros.map(m => (
                    <td key={m.k} className="py-1 px-1">
                      <Input
                        type="number"
                        value={targets[dt.id]?.[m.k] ?? 0}
                        onChange={e => updateCell(dt.id, m.k, e.target.value)}
                        className="h-8 text-xs text-center"
                        data-testid={`plan-cell-${dt.id}-${m.k}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2">Allergens</div>
        <div className="flex flex-wrap gap-2">
          {['dairy', 'nuts', 'gluten', 'eggs', 'soy', 'shellfish', 'sesame'].map(t => (
            <button
              key={t}
              onClick={() => toggleTag('allergens', t)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${profile.allergens?.includes(t) ? 'bg-destructive text-destructive-foreground border-destructive' : 'bg-card text-foreground border-border hover:border-destructive/50'}`}
              data-testid={`allergen-${t}`}
            >{t}</button>
          ))}
        </div>
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2 mt-4">Preferences</div>
        <div className="flex flex-wrap gap-2">
          {['vegetarian', 'vegan', 'halal', 'jain', 'gluten-free', 'high-carb'].map(t => (
            <button
              key={t}
              onClick={() => toggleTag('preferences', t)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${profile.preferences?.includes(t) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:border-primary/50'}`}
            >{t}</button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2">Micronutrient targets (daily)</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { k: 'ironMg',       label: 'Iron (mg)' },
            { k: 'magnesiumMg',  label: 'Mg (mg)' },
            { k: 'calciumMg',    label: 'Ca (mg)' },
            { k: 'vitDIu',       label: 'Vit D (IU)' },
            { k: 'potassiumMg',  label: 'K (mg)' },
          ].map(m => (
            <label key={m.k} className="block">
              <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{m.label}</span>
              <Input
                type="number"
                value={profile.micronutrientTargets?.[m.k] ?? 0}
                onChange={e => updateMicro(m.k, e.target.value)}
                className="h-9 text-xs mt-1"
              />
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Supplemental Protocols ────────────────────────────────────────────────
function SupplementalProtocolsTab({ athleteId }) {
  const [profile, setProfileState] = useState(() => getNutritionProfile(athleteId));
  useEffect(() => setProfileState(getNutritionProfile(athleteId)), [athleteId]);
  function update(k, v) {
    const updated = { ...profile, supplements: { ...profile.supplements, [k]: Number(v) || 0 } };
    setProfileState(updated);
    saveNutritionProfile(athleteId, updated);
  }
  const fields = [
    { k: 'electrolyteMlPerHour',   label: 'Electrolyte drink per hour of play',  unit: 'ml' },
    { k: 'sodiumMgPerHour',        label: 'Sodium intake per hour of play',      unit: 'mg' },
    { k: 'caffeineMgPreMatch',     label: 'Pre-match caffeine',                  unit: 'mg' },
    { k: 'postMatchProteinG',      label: 'Post-match protein (within 30 min)',  unit: 'g' },
    { k: 'postMatchCarbG',         label: 'Post-match carbs (within 30 min)',    unit: 'g' },
    { k: 'carbLoadingDaysBefore',  label: 'Carb-loading window before tournament',unit: 'days' },
    { k: 'carbLoadingGPerKg',      label: 'Carb load target',                    unit: 'g per kg body weight' },
  ];
  return (
    <Card className="p-4 space-y-3" data-testid="nutritionist-protocols">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Supplemental Protocols</div>
        <div className="text-sm font-bold">Fine-tune hydration, timing & tournament prep rules</div>
      </div>
      {fields.map(f => (
        <label key={f.k} className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{f.label}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.unit}</div>
          </div>
          <Input
            type="number"
            value={profile.supplements?.[f.k] ?? 0}
            onChange={e => update(f.k, e.target.value)}
            className="w-24 h-9 text-xs text-right"
            data-testid={`protocol-${f.k}`}
          />
        </label>
      ))}
    </Card>
  );
}

// ─── Meal Templates ────────────────────────────────────────────────────────
function MealTemplatesTab({ nutritionistId }) {
  const [templates, setTemplates] = useState(() => listTemplates(nutritionistId));
  const [draft, setDraft] = useState({ name: '', description: '', calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, tag: 'pre-match' });

  function refresh() { setTemplates(listTemplates(nutritionistId)); }
  function save() {
    if (!draft.name.trim()) return;
    saveTemplate(nutritionistId, draft);
    setDraft({ name: '', description: '', calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, tag: 'pre-match' });
    refresh();
  }
  function del(id) { deleteTemplate(nutritionistId, id); refresh(); }

  return (
    <div className="space-y-4" data-testid="nutritionist-templates">
      <Card className="p-4">
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-3">Add a template</div>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Name (e.g. Pre-match banana toast)" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="col-span-2" data-testid="template-name" />
          <Input placeholder="Short description" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} className="col-span-2" />
          <Input type="number" placeholder="Cal" value={draft.calories} onChange={e => setDraft({ ...draft, calories: Number(e.target.value) || 0 })} />
          <Input type="number" placeholder="Protein (g)" value={draft.proteinG} onChange={e => setDraft({ ...draft, proteinG: Number(e.target.value) || 0 })} />
          <Input type="number" placeholder="Carbs (g)" value={draft.carbsG} onChange={e => setDraft({ ...draft, carbsG: Number(e.target.value) || 0 })} />
          <Input type="number" placeholder="Fat (g)" value={draft.fatsG} onChange={e => setDraft({ ...draft, fatsG: Number(e.target.value) || 0 })} />
          <select value={draft.tag} onChange={e => setDraft({ ...draft, tag: e.target.value })} className="col-span-2 h-9 rounded-md border border-border bg-background text-sm px-3">
            {['pre-match', 'post-match', 'breakfast', 'lunch', 'dinner', 'snack', 'recovery'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Button size="sm" onClick={save} className="mt-3 w-full" data-testid="template-save-btn"><Plus className="w-4 h-4 mr-1" />Add template</Button>
      </Card>

      <div className="space-y-2">
        {templates.length === 0 && <Card className="p-4 text-sm text-muted-foreground text-center">No templates yet — add your first above.</Card>}
        {templates.map(t => (
          <Card key={t.id} className="p-3 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="font-bold text-sm">{t.name}</div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{t.tag}</span>
              </div>
              {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
              <div className="text-xs font-mono mt-1 text-muted-foreground">
                {t.calories} Cal · P {t.proteinG}g · C {t.carbsG}g · F {t.fatsG}g
              </div>
            </div>
            <button onClick={() => del(t.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" data-testid={`template-delete-${t.id}`}>
              <Trash2 className="w-4 h-4" />
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Body Composition ──────────────────────────────────────────────────────
function BodyCompositionTab({ athleteId }) {
  const [entries, setEntries] = useState(() => listBodyLog(athleteId));
  const [draft, setDraft] = useState({ date: new Date().toISOString().slice(0, 10), weightKg: '', bodyFatPct: '', hydrationPct: '' });
  useEffect(() => setEntries(listBodyLog(athleteId)), [athleteId]);
  function save() {
    if (!draft.weightKg) return;
    addBodyEntry(athleteId, draft);
    setEntries(listBodyLog(athleteId));
    setDraft({ date: new Date().toISOString().slice(0, 10), weightKg: '', bodyFatPct: '', hydrationPct: '' });
  }
  const latest = entries[0];
  const prev = entries[1];
  const wDelta = latest && prev ? (latest.weightKg - prev.weightKg) : 0;

  return (
    <div className="space-y-4" data-testid="nutritionist-body">
      <Card className="p-4">
        <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2">Log new entry</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} className="h-9" />
          <Input type="number" step="0.1" placeholder="Weight (kg)" value={draft.weightKg} onChange={e => setDraft({ ...draft, weightKg: e.target.value })} className="h-9" data-testid="body-weight" />
          <Input type="number" step="0.1" placeholder="Body fat %" value={draft.bodyFatPct} onChange={e => setDraft({ ...draft, bodyFatPct: e.target.value })} className="h-9" />
          <Input type="number" step="0.1" placeholder="Hydration %" value={draft.hydrationPct} onChange={e => setDraft({ ...draft, hydrationPct: e.target.value })} className="h-9" />
        </div>
        <Button size="sm" onClick={save} className="mt-3 w-full" data-testid="body-save-btn"><Plus className="w-4 h-4 mr-1" />Log entry</Button>
      </Card>

      {latest && (
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Weight</div>
              <div className="font-display font-extrabold text-2xl tracking-tighter">{latest.weightKg}<span className="text-sm text-muted-foreground">kg</span></div>
              {wDelta !== 0 && (
                <div className={`text-[10px] font-bold ${wDelta > 0 ? 'text-amber-500' : 'text-primary'}`}>
                  {wDelta > 0 ? <TrendingUp className="w-3 h-3 inline" /> : <TrendingDown className="w-3 h-3 inline" />} {wDelta > 0 ? '+' : ''}{wDelta.toFixed(1)} kg
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Body Fat</div>
              <div className="font-display font-extrabold text-2xl tracking-tighter">{latest.bodyFatPct || '—'}<span className="text-sm text-muted-foreground">%</span></div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Hydration</div>
              <div className="font-display font-extrabold text-2xl tracking-tighter">{latest.hydrationPct || '—'}<span className="text-sm text-muted-foreground">%</span></div>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-1">
        {entries.map(e => (
          <div key={e.id} className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/40 text-xs font-mono">
            <span className="text-muted-foreground">{e.date}</span>
            <span>{e.weightKg}kg · {e.bodyFatPct || '—'}% BF · {e.hydrationPct || '—'}% H₂O</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Messages (nutritionist ↔ athlete thread) ──────────────────────────────
function MessagesTab({ athleteId, fromRole }) {
  const [messages, setMessages] = useState(() => listMessages(athleteId));
  const [draft, setDraft] = useState('');
  useEffect(() => { markAllMessagesRead(athleteId, fromRole); setMessages(listMessages(athleteId)); }, [athleteId, fromRole]);
  function send() {
    if (!draft.trim()) return;
    sendMessage(athleteId, { from: fromRole, text: draft.trim() });
    setDraft('');
    setMessages(listMessages(athleteId));
  }
  return (
    <Card className="p-4 flex flex-col gap-3" data-testid="nutritionist-messages" style={{ height: 'calc(100vh - 320px)' }}>
      <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Chat with athlete</div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {messages.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No messages yet — start the conversation.</div>}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.from === fromRole ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.from === fromRole ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'}`}>
              {m.text}
              <div className={`text-[9px] mt-0.5 ${m.from === fromRole ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                {new Date(m.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-border pt-3">
        <Input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Write a message…" className="flex-1" data-testid="message-input" />
        <Button size="sm" onClick={send} data-testid="message-send-btn"><Send className="w-4 h-4" /></Button>
      </div>
    </Card>
  );
}
