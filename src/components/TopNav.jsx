import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function TopNav() {
  const { user, logout } = useAuth();
  const { theme, setTheme, THEMES } = useTheme();

  return (
    <div className="top-nav">
      <div className="top-nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Tracker</NavLink>
        <NavLink to="/history" className={({ isActive }) => (isActive ? 'active' : '')}>Match History</NavLink>
        <NavLink to="/compare" className={({ isActive }) => (isActive ? 'active' : '')}>Compare</NavLink>
      </div>
      <div className="theme-picker">
        {THEMES.map(t => (
          <button
            key={t.id}
            className={`theme-swatch${theme === t.id ? ' active' : ''}`}
            style={{ background: t.swatch }}
            title={t.label}
            onClick={() => setTheme(t.id)}
          />
        ))}
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
