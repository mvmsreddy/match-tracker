import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { computeStats } from '../lib/analytics';
import { formatDuration } from '../lib/storage';
import { Card, CardHeader, CardTitle, CardContent } from './primitives/card';
import { Textarea } from './primitives/textarea';
import { Button } from './primitives/button';

export default function ActionButtons({
  header, updateHeader, sessionType, formatPreset, formatLabel, pointTarget, trackingMode,
  points, engine, analytics, matchStartTime, matchDurationMs, showStatus,
  resetMatch, subjectPlayerId = null, liveSessionId = null, onLiveSessionEnded,
}) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetTimer = useRef(null);

  const selfName = header.selfName || 'Self';
  const oppName = header.oppName || 'Opponent';
  const isPractice = sessionType === 'practice';

  function scoreSummary() {
    if (isPractice) {
      return engine.matchOver
        ? engine.gamePts.self + '-' + engine.gamePts.opp + ' (FINAL)'
        : engine.gamePts.self + '-' + engine.gamePts.opp;
    }
    return engine.sets.map((st) => (st.isMatchTiebreak ? '[' + st.tb.self + '-' + st.tb.opp + ']' : st.self + '-' + st.opp)).join(', ');
  }

  async function handleSaveMatch() {
    if (points.length === 0) { showStatus('Log at least one point first'); return; }
    setSaving(true);
    try {
      const ownerId = subjectPlayerId || user.id;
      await api.saveMatch(ownerId, {
        selfName, oppName, tournament: header.tournament, date: header.date, round: header.round,
        sessionType, formatPreset, formatLabel, pointTarget, trackingMode,
        trackedBy: subjectPlayerId ? user.id : null,
        surface: header.surface, indoorOutdoor: header.indoorOutdoor,
        oppHandedness: header.oppHandedness, weather: header.weather, notes: header.notes,
        governingBody: header.governingBody, circuit: header.circuit,
        city: header.city, ageGroup: header.ageGroup,
        eventMatchId: header.eventMatchId,
        normalizedCategory: header.normalizedCategory, normalizedSubcategory: header.normalizedSubcategory,
        playingStyle: header.playingStyle, rankSeed: header.rankSeed,
        scoreSummary: scoreSummary(),
        winner: engine.matchWinner === 'self' ? 'self' : (engine.matchWinner === 'opp' ? 'opp' : null),
        pointCount: points.length,
        matchDurationMs,
        points,
        sets: engine.sets,
      });
      if (liveSessionId) {
        await api.endLiveTrackingSession(liveSessionId).catch(() => {});
        onLiveSessionEnded?.();
      }
      const partial = !engine.matchOver;
      showStatus(
        subjectPlayerId
          ? `Match saved to ${selfName}'s history`
          : partial
            ? 'Partial match saved — open My Matches for stats; PDF anytime from there'
            : 'Match saved — open My Matches for stats; PDF anytime from there',
      );
      resetMatch();
    } catch (err) {
      showStatus('Could not save match: ' + err.message, 4000);
    } finally {
      setSaving(false);
    }
  }

  async function handleCopySummary() {
    const s = computeStats(points);
    const formatLine = isPractice ? 'Practice session - race to ' + pointTarget + ' points' : ('Format: ' + formatLabel);
    const contextBits = [];
    if (header.governingBody) contextBits.push(header.governingBody + (header.circuit ? ' - ' + header.circuit : ''));
    if (header.round) contextBits.push(header.round);
    if (header.ageGroup) contextBits.push(header.ageGroup);
    if (header.city) contextBits.push(header.city);
    if (header.surface) contextBits.push(header.surface);
    if (header.indoorOutdoor) contextBits.push(header.indoorOutdoor);
    if (header.oppHandedness) contextBits.push('Opponent: ' + header.oppHandedness);
    if (header.playingStyle) contextBits.push('Opponent style: ' + header.playingStyle);
    if (header.rankSeed) contextBits.push('Opponent rank/seed: ' + header.rankSeed);
    if (header.weather) contextBits.push('Weather: ' + header.weather);
    if (matchStartTime) contextBits.push('Time on court: ' + formatDuration(matchDurationMs));
    const text = (isPractice ? 'TENNIS PRACTICE SUMMARY\n' : 'TENNIS MATCH SUMMARY\n') + selfName + ' vs ' + oppName + '\n' +
      (header.tournament ? header.tournament + ' - ' : '') + (header.date || '') + '\n' +
      formatLine + '\n' +
      (contextBits.length > 0 ? contextBits.join(' | ') + '\n' : '') + '\n' +
      selfName + ': ' + s.self.wfe + ' W/FE, ' + s.self.ue + ' UE, ' + s.self.pointCount + ' points won\n' +
      oppName + ': ' + s.opp.wfe + ' W/FE, ' + s.opp.ue + ' UE, ' + s.opp.pointCount + ' points won\n\n' +
      'Notes: ' + (header.notes || '-');
    try {
      await navigator.clipboard.writeText(text);
      showStatus('Copied to clipboard');
    } catch (e) {
      showStatus('Could not copy');
    }
  }

  const hasUnsavedPoints = points.length > 0;

  function handleResetClick() {
    if (confirmingReset) {
      resetMatch();
      setConfirmingReset(false);
      clearTimeout(resetTimer.current);
    } else {
      setConfirmingReset(true);
      resetTimer.current = setTimeout(() => setConfirmingReset(false), 5000);
    }
  }

  return (
    <>
      {!engine.matchOver && hasUnsavedPoints && (
        <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm space-y-1">
          <div className="font-semibold text-foreground">Match stopped early?</div>
          <p className="text-muted-foreground">
            Rain, injury, walkover, or any reason — save now to keep every point you logged.
            Open <span className="font-semibold text-foreground">My Matches</span> anytime for stats; PDF on demand from there.
          </p>
          <p className="text-xs text-muted-foreground">
            Tip: add why it stopped in Match Notes below (e.g. &quot;Stopped: rain after set 2&quot;).
          </p>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Match Notes</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <Textarea
            placeholder="Coaching notes, focus areas, things to work on..."
            value={header.notes}
            onChange={(e) => updateHeader({ notes: e.target.value })}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground -mt-2">
        Save records every point and stat to My Matches. Generate a PDF later from match history — no need to export now.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={saving || points.length === 0}
          onClick={handleSaveMatch}
        >
          {saving ? 'Saving...' : engine.matchOver ? 'Save match to history' : 'Save partial match to history'}
        </Button>
        <Button variant="outline" onClick={handleCopySummary}>Copy summary</Button>
        <Button
          variant={confirmingReset ? 'destructive-solid' : 'destructive'}
          className="ml-auto"
          onClick={handleResetClick}
        >
          {confirmingReset
            ? (hasUnsavedPoints ? 'Tap again — discard unsaved points' : 'Tap again to confirm reset')
            : 'Reset match'}
        </Button>
      </div>
    </>
  );
}
