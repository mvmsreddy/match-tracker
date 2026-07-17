import { NavLink } from 'react-router-dom';
import { downloadAppGuide } from '../lib/appGuidePdf';

export default function SideDrawer({ open, onClose, user, logout, theme, setTheme, THEMES }) {
  const role = user?.role || 'player';

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

          {/* Player + Coach: personal match tracker */}
          {(role === 'player' || role === 'coach') && (
            <NavLink to="/track" className={({ isActive }) => 'drawer-link drawer-link-cta' + (isActive ? ' active' : '')} onClick={onClose}>
              + Track Match
            </NavLink>
          )}

          {/* Player + Coach: personal history */}
          {(role === 'player' || role === 'coach') && (
            <NavLink to="/history" className={({ isActive }) => 'drawer-link' + (isActive ? ' active' : '')} onClick={onClose}>
              Match History
            </NavLink>
          )}

          {/* Player + Coach: compare */}
          {(role === 'player' || role === 'coach') && (
            <NavLink to="/compare" className={({ isActive }) => 'drawer-link' + (isActive ? ' active' : '')} onClick={onClose}>
              Compare
            </NavLink>
          )}

          {/* Coach: my players */}
          {role === 'coach' && (
            <NavLink to="/my-players" className={({ isActive }) => 'drawer-link' + (isActive ? ' active' : '')} onClick={onClose}>
              My Players
            </NavLink>
          )}

          {/* Player: my coaches */}
          {role === 'player' && (
            <NavLink to="/my-coaches" className={({ isActive }) => 'drawer-link' + (isActive ? ' active' : '')} onClick={onClose}>
              My Coaches
            </NavLink>
          )}

          {/* All roles: tournaments */}
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
            <div className="drawer-user-name">{user.displayName || user.name}</div>
            <div className="drawer-user-email">{user.email}</div>
            <NavLink
              to="/profile"
              className="drawer-link"
              style={{ fontSize: '0.68rem', padding: '4px 0', marginBottom: 6 }}
              onClick={onClose}
            >
              Edit Profile →
            </NavLink>
            {user.role && (
              <div className={`drawer-role-badge role-badge-${user.role}`}>
                {user.role === 'player' ? 'Player'
                  : user.role === 'coach' ? 'Coach'
                  : 'Organizer'}
                {user.isVerified && ' ✓'}
              </div>
            )}
            <button className="drawer-logout-btn" onClick={handleLogout}>Log out</button>
          </div>
        )}
      </div>
    </>
  );
}
