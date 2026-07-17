import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RoleSetupOverlay from './RoleSetupOverlay';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="login-screen">
        <div className="login-subtitle">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Google OAuth (or any sign-in without role selection) lands here.
  // Block access to all pages until the user explicitly picks their role.
  if (!user.roleConfirmed) {
    return <RoleSetupOverlay />;
  }

  return children;
}
