import { NavLink } from 'react-router-dom';
import { downloadAppGuide } from '@/lib/appGuidePdf';
import {
  LayoutDashboard, Activity, Trophy, GitCompare, User, Users,
  Calendar, Medal, Sun, Moon, LogOut, X, TrendingUp, FileDown, Video,
} from 'lucide-react';

// Single canonical hamburger-menu drawer for the whole app. AppShell (every
// page under it) and TopNav (Track / Match Detail / Video Analysis, which
// render outside AppShell) both open this exact component so the menu never
// looks or behaves differently depending on which screen you opened it from.
function getNavItems(role) {
  const dashboard = { id: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true };
  const track = { id: 'track', label: 'Track', to: '/track', icon: Activity };
  const videoAnalysis = { id: 'video-analysis', label: 'Video Analysis (Beta)', to: '/video-analysis-test', icon: Video };
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
    return [dashboard, track, videoAnalysis, myPlayers, compare, tournaments, calendar, rankings, profile];
  }
  return [dashboard, track, videoAnalysis, performance, tournaments, compare, myCoaches, calendar, profile];
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

export default function NavDrawer({ open, onClose, role, theme, toggle, logout }) {
  const items = getNavItems(role || 'player');

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 z-50 w-72 bg-background border-r border-border p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="font-display font-extrabold text-lg tracking-tighter">Menu</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>
        <nav className="space-y-1" onClick={onClose}>
          {items.map((item) => (
            <NavItem key={item.id} item={item} className="flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold" />
          ))}
        </nav>
        <div className="h-px bg-border my-2" />
        <button
          onClick={downloadAppGuide}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <FileDown className="w-4 h-4" strokeWidth={2.5} />
          Download Guide PDF
        </button>
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
  );
}
