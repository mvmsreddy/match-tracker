import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SegmentProvider } from './context/SegmentContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ParentDashboardPage from './pages/ParentDashboardPage';
import NutritionistDashboardPage from './pages/NutritionistDashboardPage';
import PlayerDashboardPage from './pages/PlayerDashboardPage';
import TrackerPage from './pages/TrackerPage';
import LiveTrackingPage from './pages/LiveTrackingPage';
import MatchDetailPage from './pages/MatchDetailPage';
import ComparePage from './pages/ComparePage';
import TournamentsListPage from './pages/TournamentsListPage';
import PlayerTournamentsPage from './pages/PlayerTournamentsPage';
import TournamentDetailPage from './pages/TournamentDetailPage';
import AitaCalendarPage from './pages/AitaCalendarPage';
import AitaTournamentFactsheetPage from './pages/AitaTournamentFactsheetPage';
import AitaRankingsPage from './pages/AitaRankingsPage';
import AitaAdminReviewPage from './pages/AitaAdminReviewPage';
import ProfilePage from './pages/ProfilePage';
import CoachPlayersPage from './pages/CoachPlayersPage';
import ParentPlayersPage from './pages/ParentPlayersPage';
import CoachIntelligencePage from './pages/CoachIntelligencePage';
import EventDetailPage from './pages/EventDetailPage';
import FormatEventPage from './pages/FormatEventPage';
import OrderOfPlayPage from './pages/OrderOfPlayPage';
import VideoAnalysisTestPage from './pages/VideoAnalysisTestPage';
import NutritionPage from './pages/NutritionPage';
import DrillsPage from './pages/DrillsPage';
import PublicProfilePage from './pages/PublicProfilePage';

// Parent's home experience (linked-player list) is different enough from
// DashboardPage's player/coach/organizer branches that it's routed here
// instead of adding a 4th branch to that already-large component. The
// nutritionist has an entirely separate command centre — same story.
// super_admin follows suit: its only job is the upload review queue, so
// that's its home too rather than a 4th/5th branch grafted onto
// DashboardPage.
function HomeRoute() {
  const { user } = useAuth();
  if (user?.role === 'parent') return <ParentDashboardPage />;
  if (user?.role === 'nutritionist') return <NutritionistDashboardPage />;
  if (user?.role === 'super_admin') return <AitaAdminReviewPage />;
  if (user?.role === 'player') return <PlayerDashboardPage />;
  return <DashboardPage />;
}

// /tournaments is scoped per role: an organizer only ever sees tournaments
// they host (TournamentsListPage), a player gets their own "My Tournaments +
// Browse & Enroll" screen (PlayerTournamentsPage). Coach/parent are
// deliberately left on today's unscoped list for now — a separate change.
function TournamentsRoute() {
  const { user } = useAuth();
  if (user?.role === 'player') return <PlayerTournamentsPage />;
  return <TournamentsListPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SegmentProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/p/:slug" element={<PublicProfilePage mode="slug" />} />
              <Route path="/p/t/:token" element={<PublicProfilePage mode="token" />} />
              <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                <Route path="/" element={<HomeRoute />} />
                <Route path="/history" element={<Navigate to="/compare" replace />} />
                <Route path="/compare" element={<ComparePage />} />
                <Route path="/player-dashboard" element={<Navigate to="/" replace />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/my-players" element={<CoachIntelligencePage />} />
                <Route path="/my-coaches" element={<CoachPlayersPage />} />
                <Route path="/my-parents" element={<ParentPlayersPage />} />
                <Route path="/nutrition" element={<NutritionPage />} />
                <Route path="/nutritionist" element={<NutritionistDashboardPage />} />
                <Route path="/nutritionist/athlete/:athleteId" element={<NutritionistDashboardPage />} />
                <Route path="/drills" element={<DrillsPage />} />
                <Route path="/coach/players/:playerId/dashboard" element={<PlayerDashboardPage />} />
                <Route path="/parent/players/:playerId/dashboard" element={<PlayerDashboardPage />} />
                <Route path="/aita-calendar" element={<AitaCalendarPage />} />
                <Route path="/aita-calendar/:id" element={<AitaTournamentFactsheetPage />} />
                <Route path="/aita-rankings" element={<AitaRankingsPage />} />
                <Route path="/admin/aita-review" element={<AitaAdminReviewPage />} />
                <Route path="/tournaments" element={<TournamentsRoute />} />
                <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
                <Route path="/tournaments/:id/events/:eventId" element={<EventDetailPage />} />
                <Route path="/tournaments/:id/events/:eventId/format" element={<FormatEventPage />} />
                <Route path="/tournaments/:id/oop" element={<OrderOfPlayPage />} />
              </Route>
              <Route path="/track" element={<ProtectedRoute><TrackerPage /></ProtectedRoute>} />
              <Route path="/track/live/:sessionId" element={<ProtectedRoute><LiveTrackingPage /></ProtectedRoute>} />
              <Route path="/history/:matchId" element={<ProtectedRoute><MatchDetailPage /></ProtectedRoute>} />
              <Route path="/video-analysis-test" element={<ProtectedRoute><VideoAnalysisTestPage /></ProtectedRoute>} />
            </Routes>
          </SegmentProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
