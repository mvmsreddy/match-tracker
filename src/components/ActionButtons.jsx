import { useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { buildMatchPdf, pdfFilename } from '../lib/pdfReport';
import { computeStats } from '../lib/analytics';
import { formatDuration } from '../lib/storage';

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
    if (header.surface) contextBits.push(header.surface);
    if (header.indoorOutdoor) contextBits.push(header.indoorOutdoor);
    if (header.oppHandedness) contextBits.push('Opponent: ' + header.oppHandedness);
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
      <div className="panel notes">
        <h2 className="panel-title">Match Notes</h2>
        <textarea
          placeholder="Coaching notes, focus areas, things to work on..."
          value={header.notes}
          onChange={(e) => updateHeader({ notes: e.target.value })}
        />
      </div>

      <div className="action-bar">
        <button
          className="action-btn primary"
          disabled={saving || points.length === 0}
          onClick={handleCompleteAndSave}
        >
          {saving ? 'Saving...' : 'Complete & Save Match'}
        </button>
        <button
          className="action-btn"
          disabled={generating || points.length === 0}
          onClick={handleGeneratePdf}
          title={points.length === 0 ? 'Log at least one point first' : ''}
        >
          {generating ? 'Generating...' : 'Generate PDF'}
        </button>
        <button className="action-btn" onClick={handleCopySummary}>Copy summary</button>
        <button className={'action-btn danger' + (confirmingReset ? ' confirming' : '')} onClick={handleResetClick}>
          {confirmingReset ? 'Tap again to confirm reset' : 'Reset match'}
        </button>
      </div>
    </>
  );
}
