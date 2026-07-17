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
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
