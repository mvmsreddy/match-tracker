import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import SideDrawer from './SideDrawer';
import NotificationsBell from './NotificationsBell';

export default function TopNav({ variant = 'default' }) {
  const { user, logout } = useAuth();
  const { theme, setTheme, THEMES } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isTracker = variant === 'tracker';

  return (
    <>
      <div className={isTracker
        ? 'flex h-14 flex-shrink-0 items-center justify-between border-b border-tt-border bg-tt-background px-4'
        : 'top-nav'
      }>
        <button
          className={isTracker
            ? 'cursor-pointer rounded-tt border border-transparent bg-transparent p-1.5 text-lg text-tt-foreground hover:border-tt-border'
            : 'hamburger-btn'
          }
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>
        <span className={isTracker
          ? 'font-tt-display text-sm font-bold uppercase tracking-wider text-tt-brand'
          : 'top-nav-brand'
        }>
          Tennis Tracker
        </span>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationsBell />
            <div
              className={isTracker
                ? 'flex h-8 w-8 items-center justify-center rounded-full border border-tt-border bg-tt-surface font-tt-mono text-xs font-bold text-tt-brand'
                : 'top-nav-avatar'
              }
              title={user.name}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
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
