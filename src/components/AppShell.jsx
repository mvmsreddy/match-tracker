import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import NotificationsBell from '@/components/NotificationsBell';
import NavDrawer from '@/components/NavDrawer';
import { Trophy, Sun, Moon, LogOut, Menu } from 'lucide-react';

export default function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const role = user?.role || 'player';
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = (user?.displayName || user?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background border-b border-border px-4 lg:px-8 py-3 flex items-center justify-between gap-3">
        <button
          className="flex items-center justify-center w-9 h-9 rounded-sm bg-transparent hover:bg-secondary"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-accent flex items-center justify-center rounded-sm">
            <Trophy className="w-3.5 h-3.5 text-accent-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-display font-extrabold text-sm lg:text-lg tracking-tighter">TENNIS TRACKER</span>
        </div>
        <div className="max-lg:hidden lg:block text-xs uppercase tracking-[0.15em] font-bold text-muted-foreground">
          {role}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <button
            onClick={toggle}
            className="flex items-center justify-center w-9 h-9 rounded-sm bg-transparent hover:bg-secondary"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="w-9 h-9 rounded-sm bg-secondary flex items-center justify-center text-sm font-bold"
            >
              {initials}
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-11 z-50 w-56 rounded-sm border border-border bg-popover text-popover-foreground p-2">
                  <div className="px-2 py-1.5">
                    <div className="text-sm font-bold truncate">{user?.displayName || user?.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                  </div>
                  <div className="h-px bg-border my-1" />
                  <NavLink
                    to="/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="block px-2 py-1.5 rounded-sm text-sm hover:bg-secondary"
                  >
                    Edit Profile
                  </NavLink>
                  <button
                    onClick={logout}
                    className="w-full text-left px-2 py-1.5 rounded-sm text-sm bg-transparent hover:bg-secondary flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 pb-8">
        <Outlet />
      </main>

      <NavDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        role={role}
        theme={theme}
        toggle={toggle}
        logout={logout}
      />
    </div>
  );
}
