import { useState } from 'react';
import { Menu, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getInitials } from '@/lib/initials';
import NavDrawer from './NavDrawer';
import NotificationsBell from './NotificationsBell';

// Shared top bar for pages rendered outside AppShell (Track, Match Detail,
// Video Analysis) — kept visually identical to AppShell's own header, and
// opens the exact same NavDrawer AppShell does, so the menu never looks or
// behaves differently depending on which screen you opened it from.
export default function TopNav() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const displayName = user?.displayName || user?.name || '?';
  const initials = getInitials(displayName);

  return (
    <>
      <div 
        className="flex h-14 flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 sm:px-4"
        data-testid="top-nav"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-transparent hover:bg-secondary transition-colors shrink-0"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            data-testid="top-nav-menu-btn"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-accent flex items-center justify-center rounded-lg shrink-0">
              <Trophy className="w-4 h-4 text-accent-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-display font-extrabold text-sm sm:text-base tracking-tighter text-foreground truncate">
              TENNIS TRACKER
            </span>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <NotificationsBell />
            <div
              className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0"
              title={displayName}
              data-testid="top-nav-avatar"
            >
              {initials}
            </div>
          </div>
        )}
      </div>
      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={user?.role}
        theme={theme}
        toggle={toggle}
        logout={logout}
      />
    </>
  );
}
