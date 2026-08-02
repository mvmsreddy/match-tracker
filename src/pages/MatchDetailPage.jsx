import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { computeEngineState } from '../lib/engine';
import { replayMatchAnalytics, computeBreakPointEvents, computeStrokeBreakdown } from '../lib/analytics';
import { strokeWinRates } from '../lib/segmentAnalytics';
import { buildMatchPdf, pdfFilename } from '../lib/pdfReport';
import { getSkillRatingsForMatch } from '../lib/localStore';
import AppNav from '../components/AppNav';
import Scorebar from '../components/Scorebar';
import StatsPanel from '../components/StatsPanel';
import PointLog from '../components/PointLog';
import ShotLocationHeatmap from '../components/ShotLocationHeatmap';
import MatchSkillRating from '../components/MatchSkillRating';
import MomentumGraph from '../components/MomentumGraph';
import RetroactivePointEntryModal from '../components/RetroactivePointEntryModal';
import { Card, CardHeader, CardTitle, CardContent } from '../components/primitives/card';

export default function MatchDetailPage() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const [match, setMatch] = useState(null);
  const [error, setError] = useState('');
  const [addingPoints, setAddingPoints] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getMatch(user.id, matchId)
      .then((m) => { if (!cancelled) setMatch(m); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load this match'); });
    return () => { cancelled = true; };
  }, [user.id, matchId]);

  if (error) {
    return (
      <AppNav>
        <div className="history-empty">{error} — <Link to="/compare" style={{ color: '#C6E23D' }}>back to matches</Link></div>
      </AppNav>
    );
  }

  if (!match) {
    return (
      <AppNav>
        <div className="history-empty">Loading match...</div>
      </AppNav>
    );
  }

  const cfgOpts = { sessionType: match.sessionType, formatPreset: match.formatPreset, pointTarget: match.pointTarget };
  const engine = computeEngineState(match.points, cfgOpts, match.points[0]?.server || 'self');
  const analytics = replayMatchAnalytics(match.points, cfgOpts);
  const breaks = computeBreakPointEvents(match.points, cfgOpts, 'self');
  const wings = strokeWinRates(computeStrokeBreakdown(match.points, 'self'), 3)
    .filter(r => ['Forehand', 'Backhand', 'Serve'].includes(r.stroke) && r.winRate !== null);
  const header = {
    selfName: match.selfName, oppName: match.oppName, tournament: match.tournament, date: match.date, round: match.round,
    surface: match.surface, indoorOutdoor: match.indoorOutdoor, oppHandedness: match.oppHandedness,
    governingBody: match.governingBody, circuit: match.circuit,
    city: match.city, ageGroup: match.ageGroup,
    playingStyle: match.playingStyle, rankSeed: match.rankSeed,
    weather: match.weather, notes: match.notes,
  };

  function handleDownloadPdf() {
    const doc = buildMatchPdf({
      points: match.points, sets: engine.sets, matchOver: engine.matchOver, matchWinner: engine.matchWinner,
      matchTiebreakActive: engine.matchTiebreakActive, matchTiebreakPts: engine.matchTiebreakPts,
      setGames: engine.setGames, gamePts: engine.gamePts, sessionType: match.sessionType,
      pointTarget: match.pointTarget, formatPreset: match.formatPreset, formatLabel: match.formatLabel,
      selfName: match.selfName, oppName: match.oppName, tournament: match.tournament, date: match.date, round: match.round,
      surface: match.surface, indoorOutdoor: match.indoorOutdoor, oppHandedness: match.oppHandedness,
      governingBody: match.governingBody, circuit: match.circuit,
      city: match.city, ageGroup: match.ageGroup,
      playingStyle: match.playingStyle, rankSeed: match.rankSeed,
      weather: match.weather, notes: match.notes,
      matchStartTime: match.matchDurationMs ? 1 : null, matchDurationMs: match.matchDurationMs,
    });
    doc.save(pdfFilename(match.selfName, match.oppName, match.sessionType));
  }

  return (
    <AppNav>
      <div className="header">
        <div className="title-row">
          <h1 className="title">{match.selfName} vs {match.oppName}</h1>
        </div>
        <div className="subtitle">
          {(match.tournament ? match.tournament + ' | ' : '')}{match.date || ''} &middot; {match.formatLabel}
          {match.sessionType === 'practice' ? ' (Practice)' : ''} &middot; Saved {new Date(match.createdAt).toLocaleDateString()}
        </div>
      </div>

      <Scorebar
        header={header} sessionType={match.sessionType} pointTarget={match.pointTarget}
        engine={engine} nextServer={engine.currentServer}
        matchStartTime={match.matchDurationMs ? 1 : null} matchDurationMs={match.matchDurationMs || 0}
      />

      <div className="wrap" style={{ margin: '14px 0' }}>
        <button className="action-btn primary" onClick={handleDownloadPdf}>Download PDF report</button>
        {' '}
        <button className="action-btn" onClick={() => setAddingPoints(true)}>Add point detail</button>
        {' '}
        <Link to="/compare"><button className="action-btn">Back to matches</button></Link>
      </div>

      {addingPoints && (
        <RetroactivePointEntryModal
          match={match}
          onClose={() => setAddingPoints(false)}
          onSaved={(updated) => { setMatch(updated); setAddingPoints(false); }}
        />
      )}

      <MomentumGraph points={match.points} selfName={match.selfName} oppName={match.oppName} analytics={analytics} />

      <StatsPanel points={match.points} header={header} sessionType={match.sessionType} analytics={analytics} />

      {wings.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Wing &amp; Serve Win Rates</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-0">
            {wings.map(w => (
              <div key={w.stroke}>
                <div className="flex items-baseline justify-between mb-1">
                  <div className="text-sm font-semibold">{w.stroke}</div>
                  <div className={`text-sm font-bold ${w.winRate >= 55 ? 'text-accent-ink' : 'text-blue-400'}`}>{w.winRate}%</div>
                </div>
                <div className="h-2 rounded-sm bg-muted">
                  <div className={`h-full rounded-sm ${w.winRate >= 55 ? 'bg-primary' : 'bg-blue-400'}`} style={{ width: `${w.winRate}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {breaks.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Break Points</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            {breaks.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.outcome === 'missed' ? 'bg-destructive' : 'bg-primary'}`} />
                <span className="flex-1">{b.text}</span>
                <span className="text-muted-foreground">{b.at}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ShotLocationHeatmap points={match.points} selfName={match.selfName} oppName={match.oppName} />

      {user && (
        <MatchSkillRating
          userId={user.id}
          matchId={match.id}
          existing={getSkillRatingsForMatch(user.id, match.id)}
        />
      )}

      <PointLog points={match.points} header={header} />

      {match.notes && (
        <div className="panel notes">
          <h2 className="panel-title">Match Notes</h2>
          <div style={{ fontFamily: 'Inter', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{match.notes}</div>
        </div>
      )}
    </AppNav>
  );
}
