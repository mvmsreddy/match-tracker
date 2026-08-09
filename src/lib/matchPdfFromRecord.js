import { computeEngineState } from './engine';
import { buildMatchPdf, pdfFilename } from './pdfReport';

/** Build and download a PDF from an already-saved match record (any time, on demand). */
export function downloadMatchPdfFromRecord(match) {
  if (!match?.points?.length) {
    throw new Error('No point data saved for this match');
  }
  const cfgOpts = {
    sessionType: match.sessionType,
    formatPreset: match.formatPreset,
    pointTarget: match.pointTarget,
  };
  const engine = computeEngineState(match.points, cfgOpts, match.points[0]?.server || 'self');
  const doc = buildMatchPdf({
    points: match.points,
    sets: engine.sets,
    matchOver: engine.matchOver,
    matchWinner: engine.matchWinner,
    matchTiebreakActive: engine.matchTiebreakActive,
    matchTiebreakPts: engine.matchTiebreakPts,
    setGames: engine.setGames,
    gamePts: engine.gamePts,
    sessionType: match.sessionType,
    pointTarget: match.pointTarget,
    formatPreset: match.formatPreset,
    formatLabel: match.formatLabel,
    selfName: match.selfName,
    oppName: match.oppName,
    tournament: match.tournament,
    date: match.date,
    round: match.round,
    surface: match.surface,
    indoorOutdoor: match.indoorOutdoor,
    oppHandedness: match.oppHandedness,
    weather: match.weather,
    governingBody: match.governingBody,
    circuit: match.circuit,
    city: match.city,
    ageGroup: match.ageGroup,
    playingStyle: match.playingStyle,
    rankSeed: match.rankSeed,
    notes: match.notes,
    matchStartTime: match.matchDurationMs ? 1 : null,
    matchDurationMs: match.matchDurationMs,
  });
  doc.save(pdfFilename(match.selfName, match.oppName, match.sessionType));
}
