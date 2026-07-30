// Node harness for src/lib/streakTokens.js + src/lib/streaks.js with a localStorage shim.
const store = new Map();
global.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
};

const { autoProtectStreak, getTokenState } = await import('/app/src/lib/streakTokens.js');
const { computeStreak } = await import('/app/src/lib/streaks.js');

const DAY = 86400000;
const iso = n => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  d.setTime(d.getTime() + n * DAY);
  return d.toISOString().slice(0, 10);
};
const today = iso(0);

function scenario(name, offsets, tokens) {
  store.clear();
  store.set('mtp_freeze_tokens_v1', JSON.stringify({ u: { tokens, lastEarnedIso: today, autoConsumed: [] } }));
  const logDates = offsets.map(iso);
  const p1 = autoProtectStreak('u', logDates, []);
  const p2 = autoProtectStreak('u', logDates, []); // idempotency / StrictMode second call
  const ts = getTokenState('u');
  const streak = computeStreak(logDates, { freezeDates: p2.freezeDates });
  console.log(`${name}\n  logs=${JSON.stringify(logDates)} startTokens=${tokens}` +
    `\n  spends1=${JSON.stringify(p1.newSpends)} spends2=${JSON.stringify(p2.newSpends)}` +
    `\n  tokensLeft=${ts.tokens} autoConsumed=${JSON.stringify(ts.autoConsumed)}` +
    `\n  streak.current=${streak.current} best=${streak.best} loggedToday=${streak.loggedToday}`);
  return { p1, p2, ts, streak };
}

let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log('  ASSERT FAIL: ' + msg); } };

// A: today + 3 days ago, 3 tokens -> expect 2 spends (yesterday, 2-ago)
let r = scenario('A today+(-3), tokens=3', [0, -3], 3);
check(r.ts.tokens === 1, 'expected 1 token left');
check(r.ts.autoConsumed.length === 2 && r.ts.autoConsumed.includes(iso(-1)) && r.ts.autoConsumed.includes(iso(-2)), 'expected gap days consumed');
check(r.p2.newSpends.length === 0, 'second call must not double-spend');

// B: today + 3 days ago, only 1 token -> 1 spend
r = scenario('B today+(-3), tokens=1', [0, -3], 1);
check(r.ts.tokens === 0 && r.ts.autoConsumed.length === 1, 'expected exactly 1 spend');

// C: today + yesterday -> no spends
r = scenario('C today+(-1), tokens=3', [0, -1], 3);
check(r.ts.tokens === 3 && r.ts.autoConsumed.length === 0, 'no spend expected when no gap');
check(r.streak.current === 2, 'streak should be 2');

// D: only a log 5 days ago -> trailing inactivity, no spend expected
r = scenario('D only(-5), tokens=3', [-5], 3);
check(r.ts.tokens === 3 && r.ts.autoConsumed.length === 0, 'no spend expected for trailing inactivity');

// E: logs at -1 and -4 (today unlogged) -> gap days -2,-3 frozen
r = scenario('E (-1)+(-4), tokens=3', [-1, -4], 3);
check(r.ts.autoConsumed.includes(iso(-2)) && r.ts.autoConsumed.includes(iso(-3)), 'expected -2/-3 frozen');

// F: no logs at all -> skip
r = scenario('F no logs, tokens=3', [], 3);
check(r.ts.tokens === 3 && r.ts.autoConsumed.length === 0, 'no spend when no logs');

// G: long gap beyond window: today + (-10), tokens=3 -> only 3 spends max
r = scenario('G today+(-10), tokens=3', [0, -10], 3);
check(r.ts.tokens === 0 && r.ts.autoConsumed.length === 3, 'should cap at available tokens');

console.log(fails === 0 ? '\nALL NODE ASSERTIONS PASSED' : `\n${fails} NODE ASSERTIONS FAILED`);
