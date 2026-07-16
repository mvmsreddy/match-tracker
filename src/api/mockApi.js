// ---------------------------------------------------------------------------
// MOCK API LAYER
// ---------------------------------------------------------------------------
// This simulates a real backend (auth + match history) using localStorage and
// artificial network delay, so the app behaves like it's talking to a server.
// Every function returns a Promise, matching the shape a real fetch()-based
// API client would have — swapping this file for real HTTP calls later
// shouldn't require changing any component code.
//
// NOT SECURE — passwords are compared in plaintext and the "token" is just a
// base64 blob. This exists purely to make the login flow and match-history
// screens functional during development. Replace with a real backend + JWT
// (or session cookies) before this ever handles a real user's data.
// ---------------------------------------------------------------------------

const DELAY_MS = 500;
const USERS_KEY = 'mtp_mock_users_v1';
const SESSION_KEY = 'mtp_mock_session_v1';
const MATCHES_KEY = 'mtp_mock_matches_v1';

const DEMO_USERS = [
  { id: 'u_coach', name: 'Coach Ramesh', email: 'coach@matchtracker.app', password: 'coach123', role: 'coach' },
  { id: 'u_parent', name: 'Madhu (Parent)', email: 'parent@matchtracker.app', password: 'parent123', role: 'parent' },
];

function delay(ms = DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* ignore */
  }
}

function ensureUsersSeeded() {
  const existing = readJSON(USERS_KEY, null);
  if (!existing) writeJSON(USERS_KEY, DEMO_USERS);
}

function makeToken(user) {
  return btoa(JSON.stringify({ uid: user.id, iat: Date.now() }));
}

function decodeToken(token) {
  try {
    return JSON.parse(atob(token));
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signup(email, password, name) {
  ensureUsersSeeded();
  await delay();
  const users = readJSON(USERS_KEY, DEMO_USERS);
  const existing = users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.code = 'EMAIL_IN_USE';
    throw err;
  }
  const newUser = {
    id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: name || email.split('@')[0],
    email: String(email).trim().toLowerCase(),
    password,
    role: 'user',
  };
  users.push(newUser);
  writeJSON(USERS_KEY, users);
  const token = makeToken(newUser);
  writeJSON(SESSION_KEY, { token, userId: newUser.id });
  return { token, user: publicUser(newUser) };
}

export async function login(email, password) {
  ensureUsersSeeded();
  await delay();
  const users = readJSON(USERS_KEY, DEMO_USERS);
  const user = users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!user || user.password !== password) {
    const err = new Error('Incorrect email or password');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }
  const token = makeToken(user);
  const session = { token, userId: user.id };
  writeJSON(SESSION_KEY, session);
  return { token, user: publicUser(user) };
}

export async function logout() {
  await delay(150);
  localStorage.removeItem(SESSION_KEY);
  return { ok: true };
}

export async function getSession() {
  ensureUsersSeeded();
  await delay(200);
  const session = readJSON(SESSION_KEY, null);
  if (!session || !session.token) return null;
  const payload = decodeToken(session.token);
  if (!payload) return null;
  const users = readJSON(USERS_KEY, DEMO_USERS);
  const user = users.find((u) => u.id === payload.uid);
  return user ? { token: session.token, user: publicUser(user) } : null;
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// ---------------------------------------------------------------------------
// Match history
// ---------------------------------------------------------------------------

function allMatches() {
  return readJSON(MATCHES_KEY, []);
}

export async function listMatches(userId) {
  await delay();
  return allMatches()
    .filter((m) => m.userId === userId)
    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
}

export async function saveMatch(userId, record) {
  await delay(400);
  const matches = allMatches();
  const saved = {
    id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    userId,
    createdAt: new Date().toISOString(),
    ...record,
  };
  matches.push(saved);
  writeJSON(MATCHES_KEY, matches);
  return saved;
}

export async function getMatch(userId, matchId) {
  await delay(200);
  const match = allMatches().find((m) => m.id === matchId && m.userId === userId);
  if (!match) throw new Error('Match not found');
  return match;
}

export async function deleteMatch(userId, matchId) {
  await delay(300);
  const matches = allMatches().filter((m) => !(m.id === matchId && m.userId === userId));
  writeJSON(MATCHES_KEY, matches);
  return { ok: true };
}

export const DEMO_CREDENTIALS = DEMO_USERS.map((u) => ({ email: u.email, password: u.password, role: u.role }));

// Mock doesn't support Google OAuth — callers check loginWithGoogle !== null before showing the button.
export const loginWithGoogle = null;
