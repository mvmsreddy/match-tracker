const STORAGE_PREFIX = 'matchTrackerPro_session_v1_';

export function storageKeyFor(userId) {
  return STORAGE_PREFIX + (userId || 'anon');
}

export function saveSession(userId, state) {
  try {
    localStorage.setItem(storageKeyFor(userId), JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSession(userId) {
  try {
    const raw = localStorage.getItem(storageKeyFor(userId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function clearSession(userId) {
  try {
    localStorage.removeItem(storageKeyFor(userId));
  } catch (e) {
    /* ignore */
  }
}

export function formatDuration(ms) {
  if (!ms || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? (h + ':' + pad(m) + ':' + pad(sec)) : (m + ':' + pad(sec));
}
