import { useState } from 'react';
import { Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SideDrawer from './SideDrawer';
import NotificationsBell from './NotificationsBell';

// Shared top bar for pages rendered outside AppShell (Track, Match Detail,
// Video Analysis) — kept visually identical to AppShell's own header so the
// app doesn't shift design language when navigating into these full-screen
// flows. Opens the same SideDrawer as everywhere else.
export default function TopNav() {
  const { user, logout } = useAuth();
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
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={user}
        logout={logout}
      />
    </>
  );
}
