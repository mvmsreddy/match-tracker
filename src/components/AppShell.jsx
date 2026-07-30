import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import NotificationsBell from '@/components/NotificationsBell';
import {
  LayoutDashboard, Activity, Trophy, GitCompare, User, Users,
  Calendar, Medal, Sun, Moon, LogOut, Menu, X, TrendingUp,
} from 'lucide-react';

// All nav destinations live under one hamburger-triggered drawer (see
// `menuOpen` below) instead of being split across a desktop sidebar, a
// mobile bottom tab bar, and a separate mobile-only "more" drawer.
function getNavItems(role) {
  const dashboard = { id: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true };
  const track = { id: 'track', label: 'Track', to: '/track', icon: Activity };
  const performance = { id: 'performance', label: 'View My Performance', to: '/player-dashboard?tab=performance', icon: TrendingUp };
  const tournaments = { id: 'tournaments', label: 'Tournaments', to: '/tournaments', icon: Trophy };
  const compare = { id: 'compare', label: 'Compare', to: '/compare', icon: GitCompare };
  const profile = { id: 'profile', label: 'Profile', to: '/profile', icon: User };
  const calendar = { id: 'calendar', label: 'AITA Calendar', to: '/aita-calendar', icon: Calendar };
  const rankings = { id: 'rankings', label: 'AITA Rankings', to: '/aita-rankings', icon: Medal };
  const myPlayers = { id: 'my-players', label: 'My Players', to: '/my-players', icon: Users };
  const myCoaches = { id: 'my-coaches', label: 'My Coaches', to: '/my-coaches', icon: Users };

  if (role === 'organizer') {
    return [dashboard, tournaments, calendar, rankings, profile];
  }
  if (role === 'coach') {
    return [dashboard, track, myPlayers, compare, tournaments, calendar, rankings, profile];
  }
  return [dashboard, track, performance, tournaments, compare, myCoaches, calendar, profile];
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
  const items = getNavItems(role);
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

      {/* Consolidated nav drawer — the hamburger button above is the single
          entry point to every destination (previously split across a desktop
          sidebar and a mobile-only bottom tab bar + "more" drawer). */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-background border-r border-border p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-extrabold text-lg tracking-tighter">Menu</span>
              <button onClick={() => setMenuOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="space-y-1" onClick={() => setMenuOpen(false)}>
              {items.map((item) => (
                <NavItem key={item.id} item={item} className="flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold" />
              ))}
            </nav>
            <div className="h-px bg-border my-2" />
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
        </>
      )}
    </div>
  );
}
