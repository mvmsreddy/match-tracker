import { NavLink } from 'react-router-dom';
import { downloadAppGuide } from '../lib/appGuidePdf';

export default function SideDrawer({ open, onClose, user, logout, theme, setTheme, THEMES }) {
  function handleLogout() {
    onClose();
    logout();
  }

  return (
    <>
      <div className={`drawer-overlay${open ? ' visible' : ''}`} onClick={onClose} />
      <div className={`side-drawer${open ? ' open' : ''}`}>
        <div className="drawer-header">
          <span className="drawer-title">Tennis Tracker</span>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>

        <nav className="drawer-nav">
          <NavLink to="/" end className={({ isActive }) => 'drawer-link' + (isActive ? ' active' : '')} onClick={onClose}>
            Dashboard
          </NavLink>
          <NavLink to="/track" className={({ isActive }) => 'drawer-link drawer-link-cta' + (isActive ? ' active' : '')} onClick={onClose}>
            + Add New Match
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => 'drawer-link' + (isActive ? ' active' : '')} onClick={onClose}>
            Match History
          </NavLink>
          <NavLink to="/compare" className={({ isActive }) => 'drawer-link' + (isActive ? ' active' : '')} onClick={onClose}>
            Compare
          </NavLink>
          <NavLink to="/tournaments" className={({ isActive }) => 'drawer-link' + (isActive ? ' active' : '')} onClick={onClose}>
            Tournaments
          </NavLink>
        </nav>

        <div className="drawer-divider" />

        <div className="drawer-section">
          <div className="drawer-section-label">Theme</div>
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
        </div>

        <div className="drawer-divider" />

        <button className="guide-btn drawer-guide-btn" onClick={downloadAppGuide}>
          Download Guide PDF ↓
        </button>

        {user && (
          <div className="drawer-user">
            <div className="drawer-user-name">{user.name}</div>
            <div className="drawer-user-email">{user.email}</div>
            <button className="drawer-logout-btn" onClick={handleLogout}>Log out</button>
          </div>
        )}
      </div>
    </>
  );
}
