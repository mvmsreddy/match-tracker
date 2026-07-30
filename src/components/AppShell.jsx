import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import NotificationsBell from '@/components/NotificationsBell';
import NavDrawer from '@/components/NavDrawer';
import { Trophy, Sun, Moon, LogOut, Menu, User } from 'lucide-react';

export default function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const role = user?.role || 'player';
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = user?.displayName || user?.name || '?';
  const initials = displayName.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header 
        className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-3 sm:px-4 lg:px-8 py-2.5 flex items-center justify-between gap-2"
        data-testid="app-shell-header"
      >
        {/* Left side: Menu + Brand */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-transparent hover:bg-secondary transition-colors shrink-0"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            data-testid="menu-toggle-btn"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-accent flex items-center justify-center rounded-lg shrink-0">
              <Trophy className="w-4 h-4 text-accent-foreground" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="font-display font-extrabold text-sm sm:text-base tracking-tighter leading-none truncate">TENNIS TRACKER</div>
              <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mt-0.5 leading-none">
                {role}
              </div>
            </div>
          </div>
        </div>

        {/* Right side: Notifications + Theme + Avatar */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <NotificationsBell />
          <button
            onClick={toggle}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-transparent hover:bg-secondary transition-colors"
            aria-label="Toggle theme"
            data-testid="theme-toggle-btn"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center text-sm font-bold hover:shadow-md transition-shadow"
              aria-label="User menu"
              data-testid="user-menu-btn"
            >
              {initials}
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-12 z-50 w-64 rounded-lg border border-border bg-popover text-popover-foreground p-2 shadow-xl">
                  <div className="px-3 py-2.5 flex items-center gap-3 border-b border-border">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{displayName}</div>
                      <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
                    </div>
                  </div>
                  <NavLink
                    to="/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="mt-1 flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-secondary transition-colors"
                    data-testid="menu-profile-link"
                  >
                    <User className="w-4 h-4" />
                    Edit Profile
                  </NavLink>
                  <button
                    onClick={logout}
                    className="w-full mt-0.5 text-left px-3 py-2 rounded-md text-sm bg-transparent hover:bg-destructive/10 hover:text-destructive transition-colors flex items-center gap-2"
                    data-testid="menu-logout-btn"
                  >
                    <LogOut className="w-4 h-4" /> Log out
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
