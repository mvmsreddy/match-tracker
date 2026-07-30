import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SegmentProvider } from './context/SegmentContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ParentDashboardPage from './pages/ParentDashboardPage';
import PlayerDashboardPage from './pages/PlayerDashboardPage';
import TrackerPage from './pages/TrackerPage';
import MatchHistoryPage from './pages/MatchHistoryPage';
import MatchDetailPage from './pages/MatchDetailPage';
import ComparePage from './pages/ComparePage';
import TournamentsListPage from './pages/TournamentsListPage';
import TournamentDetailPage from './pages/TournamentDetailPage';
import AitaCalendarPage from './pages/AitaCalendarPage';
import AitaTournamentFactsheetPage from './pages/AitaTournamentFactsheetPage';
import AitaRankingsPage from './pages/AitaRankingsPage';
import ProfilePage from './pages/ProfilePage';
import CoachPlayersPage from './pages/CoachPlayersPage';
import ParentPlayersPage from './pages/ParentPlayersPage';
import CoachIntelligencePage from './pages/CoachIntelligencePage';
import EventDetailPage from './pages/EventDetailPage';
import OrderOfPlayPage from './pages/OrderOfPlayPage';
import VideoAnalysisTestPage from './pages/VideoAnalysisTestPage';

// Parent's home experience (linked-player list) is different enough from
// DashboardPage's player/coach/organizer branches that it's routed here
// instead of adding a 4th branch to that already-large component.
function HomeRoute() {
  const { user } = useAuth();
  return user?.role === 'parent' ? <ParentDashboardPage /> : <DashboardPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SegmentProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                <Route path="/" element={<HomeRoute />} />
                <Route path="/history" element={<MatchHistoryPage />} />
                <Route path="/compare" element={<ComparePage />} />
                <Route path="/player-dashboard" element={<PlayerDashboardPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/my-players" element={<CoachIntelligencePage />} />
                <Route path="/my-coaches" element={<CoachPlayersPage />} />
                <Route path="/my-parents" element={<ParentPlayersPage />} />
                <Route path="/coach/players/:playerId/dashboard" element={<PlayerDashboardPage />} />
                <Route path="/parent/players/:playerId/dashboard" element={<PlayerDashboardPage />} />
                <Route path="/aita-calendar" element={<AitaCalendarPage />} />
                <Route path="/aita-calendar/:id" element={<AitaTournamentFactsheetPage />} />
                <Route path="/aita-rankings" element={<AitaRankingsPage />} />
                <Route path="/tournaments" element={<TournamentsListPage />} />
                <Route path="/tournaments/:id" element={<TournamentDetailPage />} />
                <Route path="/tournaments/:id/events/:eventId" element={<EventDetailPage />} />
                <Route path="/tournaments/:id/oop" element={<OrderOfPlayPage />} />
              </Route>
              <Route path="/track" element={<ProtectedRoute><TrackerPage /></ProtectedRoute>} />
              <Route path="/history/:matchId" element={<ProtectedRoute><MatchDetailPage /></ProtectedRoute>} />
              <Route path="/video-analysis-test" element={<ProtectedRoute><VideoAnalysisTestPage /></ProtectedRoute>} />
            </Routes>
          </SegmentProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
