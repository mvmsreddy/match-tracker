import { useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { buildMatchPdf, pdfFilename } from '../lib/pdfReport';
import { computeStats } from '../lib/analytics';
import { formatDuration } from '../lib/storage';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';

async function saveAndSharePdfNative(doc, filename) {
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });
  await Share.share({ title: filename, url: uri });
}

export default function ActionButtons({
  header, updateHeader, sessionType, formatPreset, formatLabel, pointTarget, trackingMode,
  points, engine, analytics, matchStartTime, matchDurationMs, showStatus,
  resetMatch,
}) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
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

  async function handleCompleteAndSave() {
    if (points.length === 0) { showStatus('Log at least one point first'); return; }
    setSaving(true);
    try {
      await api.saveMatch(user.id, {
        selfName, oppName, tournament: header.tournament, date: header.date,
        sessionType, formatPreset, formatLabel, pointTarget, trackingMode,
        surface: header.surface, indoorOutdoor: header.indoorOutdoor,
        oppHandedness: header.oppHandedness, weather: header.weather, notes: header.notes,
        governingBody: header.governingBody, circuit: header.circuit,
        city: header.city, ageGroup: header.ageGroup,
        playingStyle: header.playingStyle, rankSeed: header.rankSeed,
        scoreSummary: scoreSummary(),
        winner: engine.matchWinner === 'self' ? 'self' : (engine.matchWinner === 'opp' ? 'opp' : null),
        pointCount: points.length,
        matchDurationMs,
        points,
        sets: engine.sets,
      });
      showStatus('Match saved to history');
      resetMatch();
    } catch (err) {
      showStatus('Could not save match: ' + err.message, 4000);
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePdf() {
    if (points.length === 0) { showStatus('Log at least one point first'); return; }
    setGenerating(true);
    try {
      const doc = buildMatchPdf({
        points, sets: engine.sets, matchOver: engine.matchOver, matchWinner: engine.matchWinner,
        matchTiebreakActive: engine.matchTiebreakActive, matchTiebreakPts: engine.matchTiebreakPts,
        setGames: engine.setGames, gamePts: engine.gamePts, sessionType, pointTarget, formatPreset, formatLabel,
        selfName, oppName, tournament: header.tournament, date: header.date, surface: header.surface,
        indoorOutdoor: header.indoorOutdoor, oppHandedness: header.oppHandedness, weather: header.weather,
        governingBody: header.governingBody, circuit: header.circuit,
        city: header.city, ageGroup: header.ageGroup,
        playingStyle: header.playingStyle, rankSeed: header.rankSeed,
        notes: header.notes, matchStartTime, matchDurationMs,
      });
      const filename = pdfFilename(selfName, oppName, sessionType);
      if (Capacitor.isNativePlatform()) {
        await saveAndSharePdfNative(doc, filename);
        showStatus('PDF ready to save or share');
      } else {
        doc.save(filename);
        showStatus('PDF downloaded');
      }
    } catch (err) {
      showStatus('Could not generate PDF: ' + err.message, 4000);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopySummary() {
    const s = computeStats(points);
    const formatLine = isPractice ? 'Practice session - race to ' + pointTarget + ' points' : ('Format: ' + formatLabel);
    const contextBits = [];
    if (header.governingBody) contextBits.push(header.governingBody + (header.circuit ? ' - ' + header.circuit : ''));
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

  function handleResetClick() {
    if (confirmingReset) {
      resetMatch();
      setConfirmingReset(false);
      clearTimeout(resetTimer.current);
    } else {
      setConfirmingReset(true);
      resetTimer.current = setTimeout(() => setConfirmingReset(false), 3000);
    }
  }

  return (
    <>
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

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={saving || points.length === 0}
          onClick={handleCompleteAndSave}
        >
          {saving ? 'Saving...' : 'Complete & Save Match'}
        </Button>
        <Button
          variant="outline"
          disabled={generating || points.length === 0}
          onClick={handleGeneratePdf}
          title={points.length === 0 ? 'Log at least one point first' : ''}
        >
          {generating ? 'Generating...' : 'Generate PDF'}
        </Button>
        <Button variant="outline" onClick={handleCopySummary}>Copy summary</Button>
        <Button
          variant={confirmingReset ? 'destructive-solid' : 'destructive'}
          className="ml-auto"
          onClick={handleResetClick}
        >
          {confirmingReset ? 'Tap again to confirm reset' : 'Reset match'}
        </Button>
      </div>
    </>
  );
}
