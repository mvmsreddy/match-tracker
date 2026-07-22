import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { computeEngineState } from '../lib/engine';
import { replayMatchAnalytics } from '../lib/analytics';
import { buildMatchPdf, pdfFilename } from '../lib/pdfReport';
import TopNav from '../components/TopNav';
import Scorebar from '../components/Scorebar';
import StatsPanel from '../components/StatsPanel';
import PointLog from '../components/PointLog';
import ShotLocationHeatmap from '../components/ShotLocationHeatmap';

export default function MatchDetailPage() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const [match, setMatch] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getMatch(user.id, matchId)
      .then((m) => { if (!cancelled) setMatch(m); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load this match'); });
    return () => { cancelled = true; };
  }, [user.id, matchId]);

  if (error) {
    return (
      <div className="root">
        <TopNav />
        <div className="history-empty">{error} — <Link to="/history" style={{ color: '#C6E23D' }}>back to history</Link></div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="root">
        <TopNav />
        <div className="history-empty">Loading match...</div>
      </div>
    );
  }

  const cfgOpts = { sessionType: match.sessionType, formatPreset: match.formatPreset, pointTarget: match.pointTarget };
  const engine = computeEngineState(match.points, cfgOpts, match.points[0]?.server || 'self');
  const analytics = replayMatchAnalytics(match.points, cfgOpts);
  const header = {
    selfName: match.selfName, oppName: match.oppName, tournament: match.tournament, date: match.date,
    surface: match.surface, indoorOutdoor: match.indoorOutdoor, oppHandedness: match.oppHandedness,
    weather: match.weather, notes: match.notes,
  };

  function handleDownloadPdf() {
    const doc = buildMatchPdf({
      points: match.points, sets: engine.sets, matchOver: engine.matchOver, matchWinner: engine.matchWinner,
      matchTiebreakActive: engine.matchTiebreakActive, matchTiebreakPts: engine.matchTiebreakPts,
      setGames: engine.setGames, gamePts: engine.gamePts, sessionType: match.sessionType,
      pointTarget: match.pointTarget, formatPreset: match.formatPreset, formatLabel: match.formatLabel,
      selfName: match.selfName, oppName: match.oppName, tournament: match.tournament, date: match.date,
      surface: match.surface, indoorOutdoor: match.indoorOutdoor, oppHandedness: match.oppHandedness,
      weather: match.weather, notes: match.notes,
      matchStartTime: match.matchDurationMs ? 1 : null, matchDurationMs: match.matchDurationMs,
    });
    doc.save(pdfFilename(match.selfName, match.oppName, match.sessionType));
  }

  return (
    <div className="root">
      <TopNav />
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
        <Link to="/history"><button className="action-btn">Back to history</button></Link>
      </div>

      <StatsPanel points={match.points} header={header} sessionType={match.sessionType} analytics={analytics} />
      <ShotLocationHeatmap points={match.points} selfName={match.selfName} oppName={match.oppName} />
      <PointLog points={match.points} header={header} />

      {match.notes && (
        <div className="panel notes">
          <h2 className="panel-title">Match Notes</h2>
          <div style={{ fontFamily: 'Inter', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{match.notes}</div>
        </div>
      )}
    </div>
  );
}
