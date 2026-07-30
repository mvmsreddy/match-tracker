// Local-storage backed mock for nutrition logs so MacroDonut / meal history
// work in demo mode (without Supabase). Same shape the Supabase API returns.
const KEY = 'tt.nutrition.logs';

function todayLocalIso() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

function read(userId) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    return all[userId] || [];
  } catch { return []; }
}
function write(userId, list) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    all[userId] = list;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export async function getNutritionLogs(userId) {
  return read(userId).sort((a, b) => (b.logDate || '').localeCompare(a.logDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function createNutritionLog(userId, payload) {
  const rec = {
    id: `nut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    logDate: payload.logDate || todayLocalIso(),
    mealType: payload.mealType || 'meal',
    description: payload.description || '',
    calories: Number(payload.calories) || 0,
    proteinG: Number(payload.proteinG) || 0,
    carbsG: Number(payload.carbsG) || 0,
    fatsG: Number(payload.fatsG) || 0,
    hydrationMl: Number(payload.hydrationMl) || 0,
    sodiumMg: Number(payload.sodiumMg) || 0,
    // Subjective inputs a player can attach to any log (or a standalone
    // wellness entry with mealType='wellness')
    courtEnergy: payload.courtEnergy != null ? Number(payload.courtEnergy) : null, // 1-10
    gutComfort:  payload.gutComfort  != null ? Number(payload.gutComfort)  : null, // 1-10
    crampFlag:   !!payload.crampFlag,
    notes: payload.notes || '',
  };
  const list = read(userId);
  list.unshift(rec);
  write(userId, list);
  return rec;
}

export async function deleteNutritionLog(userId, id) {
  const list = read(userId).filter(l => l.id !== id);
  write(userId, list);
}
