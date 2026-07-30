import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { downloadAppGuide } from '@/lib/appGuidePdf';
import {
  LayoutDashboard, Activity, Trophy, GitCompare, User, Users,
  Calendar, Medal, Sun, Moon, LogOut, X, FileDown, Video, Apple, MessageCircle, Dumbbell,
} from 'lucide-react';

// Single canonical hamburger-menu drawer for the whole app. AppShell (every
// page under it) and TopNav (Track / Match Detail / Video Analysis, which
// render outside AppShell) both open this exact component so the menu never
// looks or behaves differently depending on which screen you opened it from.
function getNavItems(role) {
  const dashboard = { id: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true };
  const track = { id: 'track', label: 'Track', to: '/track', icon: Activity };
  const drills = { id: 'drills', label: 'Drills', to: '/drills', icon: Dumbbell };
  const videoAnalysis = { id: 'video-analysis', label: 'Video Analysis (Beta)', to: '/video-analysis-test', icon: Video };
  const tournaments = { id: 'tournaments', label: 'Tournaments', to: '/tournaments', icon: Trophy };
  const compare = { id: 'compare', label: 'Compare', to: '/compare', icon: GitCompare };
  const profile = { id: 'profile', label: 'Profile', to: '/profile', icon: User };
  const calendar = { id: 'calendar', label: 'AITA Calendar', to: '/aita-calendar', icon: Calendar };
  const rankings = { id: 'rankings', label: 'AITA Rankings', to: '/aita-rankings', icon: Medal };
  const myPlayers = { id: 'my-players', label: 'My Players', to: '/my-players', icon: Users };
  const myCoaches = { id: 'my-coaches', label: 'My Coaches', to: '/my-coaches', icon: Users };
  const myParentPlayers = { id: 'my-parent-players', label: 'My Players', to: '/my-parents', icon: Users };
  const myParents = { id: 'my-parents', label: 'My Parents', to: '/my-parents', icon: Users };
  const nutrition = { id: 'nutrition', label: 'Nutrition', to: '/nutrition', icon: Apple };
  const messages = { id: 'messages', label: 'Messages', to: '/messages', icon: MessageCircle };

  if (role === 'organizer') {
    return [dashboard, tournaments, calendar, rankings, profile];
  }
  if (role === 'coach') {
    return [dashboard, track, drills, videoAnalysis, myPlayers, compare, nutrition, messages, tournaments, calendar, rankings, profile];
  }
  if (role === 'parent') {
    return [dashboard, myParentPlayers, messages, tournaments, calendar, profile];
  }
  return [dashboard, track, drills, videoAnalysis, tournaments, compare, nutrition, messages, myCoaches, myParents, calendar, profile];
}

function NavItem({ item, className }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `${className} ${isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`
      }
      data-testid={`nav-item-${item.id}`}
    >
      <Icon className="w-4 h-4 shrink-0" strokeWidth={2.5} />
      <span>{item.label}</span>
    </NavLink>
  );
}

export default function NavDrawer({ open, onClose, role, theme, toggle, logout }) {
  const items = getNavItems(role || 'player');

  useEffect(() => {
    if (!open) return;
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" 
        onClick={onClose} 
        data-testid="nav-drawer-overlay"
      />
      <div 
        className="fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] bg-background border-r border-border overflow-y-auto shadow-2xl animate-in slide-in-from-left duration-200"
        data-testid="nav-drawer"
      >
        <div className="sticky top-0 z-10 bg-background border-b border-border flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent flex items-center justify-center rounded-lg">
              <Trophy className="w-4 h-4 text-accent-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-display font-extrabold text-base tracking-tighter">TENNIS TRACKER</span>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-transparent hover:bg-secondary transition-colors text-foreground"
            data-testid="nav-drawer-close-btn"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
        
        <div className="p-3">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-2 px-3">
            Menu
          </div>
          <nav className="space-y-1" onClick={onClose}>
            {items.map((item) => (
              <NavItem key={item.id} item={item} className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition-colors" />
            ))}
          </nav>
        </div>
        
        <div className="mt-2 mx-3 h-px bg-border" />
        
        <div className="p-3 space-y-1">
          <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-2 px-3">
            Preferences
          </div>
          <button
            onClick={toggle}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            data-testid="drawer-theme-toggle"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" strokeWidth={2.5} /> : <Moon className="w-4 h-4" strokeWidth={2.5} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            onClick={downloadAppGuide}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            data-testid="drawer-download-guide"
          >
            <FileDown className="w-4 h-4" strokeWidth={2.5} />
            Download Guide PDF
          </button>
        </div>
        
        <div className="mt-2 mx-3 h-px bg-border" />
        
        <div className="p-3">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold bg-transparent text-destructive hover:bg-destructive/10 transition-colors"
            data-testid="drawer-logout-btn"
          >
            <LogOut className="w-4 h-4" strokeWidth={2.5} />
            Log out
          </button>
        </div>
      </div>
    </>
  );
}
