import { useState } from 'react';
import { Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
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

  return (
    <>
      <div className="flex h-14 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4">
        <button
          className="flex items-center justify-center w-9 h-9 rounded-sm bg-transparent hover:bg-secondary"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-display font-extrabold text-sm tracking-tighter text-foreground">
          TENNIS TRACKER
        </span>
        {user && (
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <div
              className="w-8 h-8 rounded-sm bg-secondary flex items-center justify-center text-xs font-bold"
              title={user.name}
            >
              {user.name.charAt(0).toUpperCase()}
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
