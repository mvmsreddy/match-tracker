import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TrackerPage from './pages/TrackerPage';
import MatchHistoryPage from './pages/MatchHistoryPage';
import MatchDetailPage from './pages/MatchDetailPage';
import ComparePage from './pages/ComparePage';
import TournamentsListPage from './pages/TournamentsListPage';
import TournamentDetailPage from './pages/TournamentDetailPage';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/track" element={<ProtectedRoute><TrackerPage /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><MatchHistoryPage /></ProtectedRoute>} />
            <Route path="/history/:matchId" element={<ProtectedRoute><MatchDetailPage /></ProtectedRoute>} />
            <Route path="/compare" element={<ProtectedRoute><ComparePage /></ProtectedRoute>} />
            <Route path="/tournaments" element={<ProtectedRoute><TournamentsListPage /></ProtectedRoute>} />
            <Route path="/tournaments/:id" element={<ProtectedRoute><TournamentDetailPage /></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
