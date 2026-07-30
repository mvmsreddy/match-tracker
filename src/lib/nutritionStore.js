// Nutrition data model — pure localStorage-backed store for the mock
// backend. All read/write is per-userId; nutritionist prescriptions are
// stored under the ATHLETE'S userId so the player app just reads its own
// blob. This lets a nutritionist (a separate role in the app) build plans
// for many athletes without cross-key contamination.

const KEYS = {
  profile:      'tt.nutrition.profile',       // per-athlete: allergens, prefs, cycle, body comp entries
  targets:      'tt.nutrition.targets',       // per-athlete: day-type -> macro targets
  activeDayType:'tt.nutrition.activeDayType', // per-athlete: current day type
  templates:    'tt.nutrition.templates',     // per-nutritionist: reusable meal templates
  athletes:     'tt.nutrition.athletes',      // per-nutritionist: their athlete IDs
  messages:     'tt.nutrition.messages',      // per-athlete: nutritionist ↔ player thread
  bodyLog:      'tt.nutrition.bodyLog',       // per-athlete: weight / BF% / hydration % entries
  achievements: 'tt.nutrition.achievements',  // per-athlete: unlocked nutrition-badges
  fuelSessions: 'tt.nutrition.fuelSessions',  // per-athlete: peri-match fueling timer sessions
};

const DAY_TYPES = ['rest', 'light', 'training', 'heavy', 'match', 'tournament-prep', 'travel'];
export const DAY_TYPE_LABELS = {
  'rest':             'Rest Day',
  'light':            'Light Training',
  'training':         'Training Day',
  'heavy':            'Heavy Training',
  'match':            'Match Day',
  'tournament-prep':  'Tournament Prep',
  'travel':           'Travel Day',
};

// Sensible defaults — mid-adolescent tennis athlete, 55kg, INR context.
const DEFAULT_TARGETS = {
  'rest':             { calories: 2200, proteinG: 90,  carbsG: 260, fatsG: 70, hydrationMl: 2500, sodiumMg: 1800 },
  'light':            { calories: 2500, proteinG: 100, carbsG: 320, fatsG: 75, hydrationMl: 2800, sodiumMg: 2200 },
  'training':         { calories: 2800, proteinG: 110, carbsG: 380, fatsG: 80, hydrationMl: 3200, sodiumMg: 2600 },
  'heavy':            { calories: 3200, proteinG: 120, carbsG: 460, fatsG: 85, hydrationMl: 3800, sodiumMg: 3200 },
  'match':            { calories: 3100, proteinG: 115, carbsG: 470, fatsG: 80, hydrationMl: 4000, sodiumMg: 3500 },
  'tournament-prep':  { calories: 3000, proteinG: 110, carbsG: 500, fatsG: 75, hydrationMl: 3500, sodiumMg: 2800 },
  'travel':           { calories: 2400, proteinG: 100, carbsG: 300, fatsG: 78, hydrationMl: 2600, sodiumMg: 2200 },
};

const DEFAULT_MICROS = {
  ironMg: 15, magnesiumMg: 350, calciumMg: 1200, vitDIu: 800, potassiumMg: 3500,
};

const DEFAULT_SUPPLEMENTS = {
  electrolyteMlPerHour: 600,
  sodiumMgPerHour: 700,
  caffeineMgPreMatch: 100,
  postMatchProteinG: 30,
  postMatchCarbG: 60,
  carbLoadingDaysBefore: 3,
  carbLoadingGPerKg: 8,
};

// ─── LocalStorage helpers ──────────────────────────────────────────────────
function readJSON(k, fb) { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } }
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
function readForUser(k, uid, fb) { const all = readJSON(k, {}); return all[uid] ?? fb; }
function writeForUser(k, uid, v) { const all = readJSON(k, {}); all[uid] = v; writeJSON(k, all); }

// ─── Targets & day types ───────────────────────────────────────────────────
export function getAllTargets(athleteId) {
  const stored = readForUser(KEYS.targets, athleteId, null);
  return stored || { ...DEFAULT_TARGETS };
}
export function saveTargets(athleteId, targets) {
  writeForUser(KEYS.targets, athleteId, targets);
  return targets;
}
export function getActiveDayType(athleteId) {
  return readForUser(KEYS.activeDayType, athleteId, 'training');
}
export function setActiveDayType(athleteId, dayType) {
  if (!DAY_TYPES.includes(dayType)) return null;
  writeForUser(KEYS.activeDayType, athleteId, dayType);
  return dayType;
}
export function getTargetForDay(athleteId, dayType) {
  const all = getAllTargets(athleteId);
  return all[dayType] || all['training'];
}
export function listDayTypes() {
  return DAY_TYPES.map(d => ({ id: d, label: DAY_TYPE_LABELS[d] }));
}

// ─── Nutrition profile (allergens, prefs, micros, supplements) ─────────────
export function getNutritionProfile(athleteId) {
  const stored = readForUser(KEYS.profile, athleteId, null);
  return stored || {
    allergens: [],           // ['dairy', 'nuts', 'gluten']
    preferences: [],         // ['vegetarian', 'halal']
    micronutrientTargets: { ...DEFAULT_MICROS },
    supplements: { ...DEFAULT_SUPPLEMENTS },
    notes: '',
    weightKg: null,
    heightCm: null,
  };
}
export function saveNutritionProfile(athleteId, profile) {
  writeForUser(KEYS.profile, athleteId, profile);
  return profile;
}

// ─── Meal templates (per-nutritionist library) ─────────────────────────────
export function listTemplates(nutritionistId) {
  return readForUser(KEYS.templates, nutritionistId, []);
}
export function saveTemplate(nutritionistId, template) {
  const list = listTemplates(nutritionistId);
  const idx = list.findIndex(t => t.id === template.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...template };
  else list.push({ ...template, id: template.id || `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` });
  writeForUser(KEYS.templates, nutritionistId, list);
  return list[idx >= 0 ? idx : list.length - 1];
}
export function deleteTemplate(nutritionistId, templateId) {
  const list = listTemplates(nutritionistId).filter(t => t.id !== templateId);
  writeForUser(KEYS.templates, nutritionistId, list);
}

// ─── Athlete roster (per-nutritionist list of athlete IDs + display info) ─
export function getAthleteRoster(nutritionistId) {
  return readForUser(KEYS.athletes, nutritionistId, []);
}
export function addAthlete(nutritionistId, athlete) {
  const list = getAthleteRoster(nutritionistId);
  if (list.find(a => a.id === athlete.id)) return list;
  list.push({ ...athlete, addedAt: new Date().toISOString() });
  writeForUser(KEYS.athletes, nutritionistId, list);
  return list;
}
export function removeAthlete(nutritionistId, athleteId) {
  const list = getAthleteRoster(nutritionistId).filter(a => a.id !== athleteId);
  writeForUser(KEYS.athletes, nutritionistId, list);
}

// ─── Body composition log ──────────────────────────────────────────────────
export function listBodyLog(athleteId) {
  return readForUser(KEYS.bodyLog, athleteId, []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
export function addBodyEntry(athleteId, entry) {
  const list = readForUser(KEYS.bodyLog, athleteId, []);
  list.push({
    id: `body_${Date.now()}`,
    date: entry.date || new Date().toISOString().slice(0, 10),
    weightKg: Number(entry.weightKg) || null,
    bodyFatPct: Number(entry.bodyFatPct) || null,
    hydrationPct: Number(entry.hydrationPct) || null,
    notes: entry.notes || '',
    createdAt: new Date().toISOString(),
  });
  writeForUser(KEYS.bodyLog, athleteId, list);
  return list[list.length - 1];
}

// ─── Messages ──────────────────────────────────────────────────────────────
export function listMessages(athleteId) {
  return readForUser(KEYS.messages, athleteId, []);
}
export function sendMessage(athleteId, msg) {
  const list = listMessages(athleteId);
  const rec = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    from: msg.from, // 'player' | 'nutritionist'
    text: msg.text || '',
    createdAt: new Date().toISOString(),
    read: false,
  };
  list.push(rec);
  writeForUser(KEYS.messages, athleteId, list);
  return rec;
}
export function markAllMessagesRead(athleteId, byRole) {
  const list = listMessages(athleteId).map(m => (m.from !== byRole ? { ...m, read: true } : m));
  writeForUser(KEYS.messages, athleteId, list);
  return list;
}
export function unreadCount(athleteId, forRole) {
  return listMessages(athleteId).filter(m => !m.read && m.from !== forRole).length;
}

// ─── Fuel timer sessions ───────────────────────────────────────────────────
export function activeFuelSession(athleteId) {
  const sessions = readForUser(KEYS.fuelSessions, athleteId, []);
  return sessions.find(s => !s.endedAt) || null;
}
export function startFuelSession(athleteId, matchStartIso) {
  const sessions = readForUser(KEYS.fuelSessions, athleteId, []);
  const active = sessions.find(s => !s.endedAt);
  if (active) return active;
  const rec = { id: `fuel_${Date.now()}`, startedAt: new Date().toISOString(), matchStartIso, endedAt: null, checks: [] };
  sessions.push(rec);
  writeForUser(KEYS.fuelSessions, athleteId, sessions);
  return rec;
}
export function tickFuelSession(athleteId, sessionId, checkId, done) {
  const sessions = readForUser(KEYS.fuelSessions, athleteId, []);
  const s = sessions.find(x => x.id === sessionId);
  if (!s) return null;
  const existing = s.checks.find(c => c.id === checkId);
  if (existing) existing.done = !!done;
  else s.checks.push({ id: checkId, done: !!done, at: new Date().toISOString() });
  writeForUser(KEYS.fuelSessions, athleteId, sessions);
  return s;
}
export function endFuelSession(athleteId, sessionId) {
  const sessions = readForUser(KEYS.fuelSessions, athleteId, []);
  const s = sessions.find(x => x.id === sessionId);
  if (s) s.endedAt = new Date().toISOString();
  writeForUser(KEYS.fuelSessions, athleteId, sessions);
}

// ─── Achievements ──────────────────────────────────────────────────────────
export function getNutritionAchievements(athleteId) {
  return readForUser(KEYS.achievements, athleteId, {});
}
export function unlockNutritionAchievement(athleteId, id) {
  const cur = getNutritionAchievements(athleteId);
  if (cur[id]) return cur;
  cur[id] = { unlockedAt: new Date().toISOString() };
  writeForUser(KEYS.achievements, athleteId, cur);
  return cur;
}
