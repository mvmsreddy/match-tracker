import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function TopNav() {
  const { user, logout } = useAuth();

  return (
    <div className="top-nav">
      <div className="top-nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Tracker</NavLink>
        <NavLink to="/history" className={({ isActive }) => (isActive ? 'active' : '')}>Match History</NavLink>
        <NavLink to="/compare" className={({ isActive }) => (isActive ? 'active' : '')}>Compare</NavLink>
      </div>
      {user && (
        <div className="user-chip">
          <span>{user.name}</span>
          <span className="logout-link" onClick={logout}>Log out</span>
        </div>
      )}
    </div>
  );
}
