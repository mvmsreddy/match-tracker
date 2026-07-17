import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SideDrawer from './SideDrawer';

export default function TopNav() {
  const { user, logout } = useAuth();
  const { theme, setTheme, THEMES } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div className="top-nav">
        <button className="hamburger-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
          ☰
        </button>
        <span className="top-nav-brand">Tennis Tracker</span>
        {user && (
          <div className="top-nav-avatar" title={user.name}>
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        logout={logout}
        theme={theme}
        setTheme={setTheme}
        THEMES={THEMES}
      />
    </>
  );
}
