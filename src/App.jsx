import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SegmentProvider } from './context/SegmentContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
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
import CoachIntelligencePage from './pages/CoachIntelligencePage';
import EventDetailPage from './pages/EventDetailPage';
import OrderOfPlayPage from './pages/OrderOfPlayPage';
import VideoAnalysisTestPage from './pages/VideoAnalysisTestPage';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SegmentProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/history" element={<MatchHistoryPage />} />
                <Route path="/compare" element={<ComparePage />} />
              </Route>
              <Route path="/player-dashboard" element={<ProtectedRoute><PlayerDashboardPage /></ProtectedRoute>} />
              <Route path="/track" element={<ProtectedRoute><TrackerPage /></ProtectedRoute>} />
              <Route path="/history/:matchId" element={<ProtectedRoute><MatchDetailPage /></ProtectedRoute>} />
              <Route path="/tournaments" element={<ProtectedRoute><TournamentsListPage /></ProtectedRoute>} />
              <Route path="/tournaments/:id" element={<ProtectedRoute><TournamentDetailPage /></ProtectedRoute>} />
              <Route path="/tournaments/:id/events/:eventId" element={<ProtectedRoute><EventDetailPage /></ProtectedRoute>} />
              <Route path="/tournaments/:id/oop" element={<ProtectedRoute><OrderOfPlayPage /></ProtectedRoute>} />
              <Route path="/aita-calendar" element={<ProtectedRoute><AitaCalendarPage /></ProtectedRoute>} />
              <Route path="/aita-calendar/:id" element={<ProtectedRoute><AitaTournamentFactsheetPage /></ProtectedRoute>} />
              <Route path="/aita-rankings" element={<ProtectedRoute><AitaRankingsPage /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/my-players" element={<ProtectedRoute><CoachIntelligencePage /></ProtectedRoute>} />
              <Route path="/my-coaches" element={<ProtectedRoute><CoachPlayersPage /></ProtectedRoute>} />
              <Route path="/coach/players/:playerId/dashboard" element={<ProtectedRoute><PlayerDashboardPage /></ProtectedRoute>} />
              <Route path="/video-analysis-test" element={<ProtectedRoute><VideoAnalysisTestPage /></ProtectedRoute>} />
            </Routes>
          </SegmentProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
