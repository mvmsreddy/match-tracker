// Momentum Meter — blends recent form + activity + streak + self-rated
// skill into a single 0-100 "how hot are you" number. Still used by
// WeeklyDigestCard's opt-in Monday email preview on /profile.
export function computeMomentum({ matches = [], streak = 0, ratings = null }) {
  const matchOnly = matches.filter(m => m.sessionType !== 'practice');
  const last10 = matchOnly.slice(0, 10);

  // Recent form: win% of last 10 (0-40 points)
  const wins10 = last10.filter(m => m.winner === 'self').length;
  const formScore = last10.length > 0 ? (wins10 / last10.length) * 40 : 20;

  // Activity: sessions this week (0-25 points, cap at 5)
  const weekAgo = Date.now() - 7 * 86400000;
  const thisWeek = matches.filter(m => new Date(m.date).getTime() >= weekAgo).length;
  const activityScore = Math.min(1, thisWeek / 5) * 25;

  // Streak (0-20 points, cap at 10 days)
  const streakScore = Math.min(1, streak / 10) * 20;

  // Self-rated skill trend (0-15 points, cap at 8/10 avg)
  const avgSkill = ratings ? Object.values(ratings).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(ratings).length) : 5;
  const skillScore = Math.min(1, avgSkill / 8) * 15;

  const total = Math.round(formScore + activityScore + streakScore + skillScore);
  const label = total >= 80 ? 'On fire' : total >= 60 ? 'Climbing' : total >= 40 ? 'Holding' : total >= 20 ? 'Cooling' : 'Slow start';
  const tone = total >= 60 ? 'up' : total >= 40 ? 'flat' : 'down';
  return { score: total, label, tone, breakdown: { form: Math.round(formScore), activity: Math.round(activityScore), streak: Math.round(streakScore), skill: Math.round(skillScore) } };
}
