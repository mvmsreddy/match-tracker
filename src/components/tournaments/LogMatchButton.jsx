import { useNavigate } from 'react-router-dom';

// "Track this match" — Phase 4 of the multi-segment dashboard plan. Launches
// the tracker prefilled from a real tournament match (opponent, tournament,
// round, date, segment, and the event_match_id link itself), via
// location.state rather than query params so the payload can carry an
// object without URL-encoding concerns. TrackerPage consumes
// location.state.trackerPrefill once on mount (see src/pages/TrackerPage.jsx).
export default function LogMatchButton({ match, opponentName, tournamentName, date, round, category, subcategory, className }) {
  const navigate = useNavigate();

  function handleClick() {
    navigate('/track', {
      state: {
        trackerPrefill: {
          oppName: opponentName || '',
          tournament: tournamentName || '',
          round: round || '',
          date: date || '',
          governingBody: 'AITA',
          eventMatchId: match.id,
          normalizedCategory: category,
          normalizedSubcategory: subcategory,
        },
      },
    });
  }

  return (
    <button className={className || 'action-btn primary'} onClick={handleClick}>
      Track this match
    </button>
  );
}
