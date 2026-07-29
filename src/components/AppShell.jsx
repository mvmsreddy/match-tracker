import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import NotificationsBell from '@/components/NotificationsBell';
import {
  LayoutDashboard, Activity, Trophy, GitCompare, User, Users,
  Calendar, Medal, Sun, Moon, LogOut, Menu, X,
} from 'lucide-react';

// Use `max-lg:hidden` instead of the bare `hidden` utility below — index.css
// already defines a legacy `.hidden { display: none !important }` (used by
// older components), which collides with and permanently beats Tailwind's own
// `.hidden`/`lg:flex` pair regardless of breakpoint since !important always
// wins. `max-lg:hidden` compiles to a differently-named class, sidestepping
// the collision entirely.

// Curated per-role route sets. Mirrors the existing MTNavChrome.navItemsForRole
// split (a handful of primary items for the mobile bottom nav, the rest folded
// into the desktop sidebar only) — see src/components/nav/MTNavChrome.jsx.
function getNavItems(role) {
  const dashboard = { id: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true };
  const track = { id: 'track', label: 'Track', to: '/track', icon: Activity };
  const tournaments = { id: 'tournaments', label: 'Tournaments', to: '/tournaments', icon: Trophy };
  const compare = { id: 'compare', label: 'Compare', to: '/compare', icon: GitCompare };
  const profile = { id: 'profile', label: 'Profile', to: '/profile', icon: User };
  const calendar = { id: 'calendar', label: 'AITA Calendar', to: '/aita-calendar', icon: Calendar };
  const rankings = { id: 'rankings', label: 'AITA Rankings', to: '/aita-rankings', icon: Medal };
  const myPlayers = { id: 'my-players', label: 'My Players', to: '/my-players', icon: Users };
  const myCoaches = { id: 'my-coaches', label: 'My Coaches', to: '/my-coaches', icon: Users };

  if (role === 'organizer') {
    return { primary: [dashboard, tournaments, calendar, rankings], secondary: [profile] };
  }
  if (role === 'coach') {
    return { primary: [dashboard, track, myPlayers, compare, profile], secondary: [tournaments, calendar, rankings] };
  }
  return { primary: [dashboard, track, tournaments, compare, profile], secondary: [myCoaches, calendar] };
}

function NavItem({ item, className }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `${className} ${isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`
      }
    >
      <Icon className="w-4 h-4 shrink-0" strokeWidth={2.5} />
      <span>{item.label}</span>
    </NavLink>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const role = user?.role || 'player';
  const { primary, secondary } = getNavItems(role);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const initials = (user?.displayName || user?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Desktop sidebar */}
      <aside className="max-lg:hidden lg:flex w-64 border-r border-border flex-col fixed h-screen bg-background">
        <div className="px-6 py-6 border-b border-border flex items-center gap-2">
          <div className="w-8 h-8 bg-accent flex items-center justify-center rounded-sm">
            <Trophy className="w-4 h-4 text-accent-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-display font-extrabold text-lg tracking-tighter">TENNIS TRACKER</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {primary.map((item) => (
            <NavItem key={item.id} item={item} className="flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold" />
          ))}
          {secondary.length > 0 && <div className="h-px bg-border my-2" />}
          {secondary.map((item) => (
            <NavItem key={item.id} item={item} className="flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold" />
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-border space-y-1">
          <button
            onClick={toggle}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" strokeWidth={2.5} /> : <Moon className="w-4 h-4" strokeWidth={2.5} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="w-4 h-4" strokeWidth={2.5} />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background border-b border-border px-4 lg:px-8 py-3 flex items-center justify-between gap-3">
          <button
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-sm bg-transparent hover:bg-secondary"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 bg-accent flex items-center justify-center rounded-sm">
              <Trophy className="w-3.5 h-3.5 text-accent-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-display font-extrabold text-sm tracking-tighter">TENNIS TRACKER</span>
          </div>
          <div className="max-lg:hidden lg:block text-xs uppercase tracking-[0.15em] font-bold text-muted-foreground">
            {role}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <button
              onClick={toggle}
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-sm bg-transparent hover:bg-secondary"
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

        <main className="flex-1 pb-24 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border grid" style={{ gridTemplateColumns: `repeat(${primary.length}, minmax(0, 1fr))` }}>
        {primary.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-0 h-0.5 w-8 bg-primary" />}
                  <Icon className="w-4 h-4" strokeWidth={2.5} />
                  {item.label}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Mobile nav drawer (secondary links + sign out) */}
      {mobileNavOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileNavOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-background border-r border-border p-4 lg:hidden overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-extrabold text-lg tracking-tighter">Menu</span>
              <button onClick={() => setMobileNavOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="space-y-1" onClick={() => setMobileNavOpen(false)}>
              {[...primary, ...secondary].map((item) => (
                <NavItem key={item.id} item={item} className="flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold" />
              ))}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
