import { NavLink, useLocation } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { downloadAppGuide } from '../lib/appGuidePdf';

function linkClass({ isActive }) {
  return `flex items-center px-3 py-2.5 rounded-sm text-sm font-semibold ${
    isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
  }`;
}

// Same drawer chrome as AppShell's consolidated hamburger menu, reused by
// TopNav (Track / Match Detail / Video Analysis) so every hamburger in the
// app opens something that looks the same.
export default function SideDrawer({ open, onClose, user, logout }) {
  const role = user?.role || 'player';
  const { pathname } = useLocation();
  const onTrackPage = pathname === '/track';

  function handleLogout() {
    onClose();
    logout();
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 z-50 w-72 bg-background border-r border-border p-4 overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <span className="font-display font-extrabold text-lg tracking-tighter">Menu</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-sm bg-transparent hover:bg-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="space-y-1" onClick={onClose}>
          <NavLink to="/" end className={linkClass}>Dashboard</NavLink>

          {(role === 'player' || role === 'coach') && !onTrackPage && (
            <NavLink to="/track" className="flex items-center px-3 py-2.5 rounded-sm text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
              + Track Match
            </NavLink>
          )}

          {role === 'coach' && (
            <NavLink to="/my-players" className={linkClass}>My Players</NavLink>
          )}

          {role === 'player' && (
            <NavLink to="/my-coaches" className={linkClass}>My Coaches</NavLink>
          )}

          <NavLink to="/tournaments" className={linkClass}>Tournaments</NavLink>
          <NavLink to="/aita-calendar" className={linkClass}>AITA Calendar</NavLink>

          {role !== 'player' && (
            <NavLink to="/aita-rankings" className={linkClass}>AITA Rankings</NavLink>
          )}
        </nav>

        <div className="h-px bg-border my-3" />

        <button
          onClick={downloadAppGuide}
          className="w-full text-left px-3 py-2.5 rounded-sm text-sm font-semibold bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          Download Guide PDF ↓
        </button>

        {user && (
          <div className="mt-auto pt-4 border-t border-border">
            <div className="text-sm font-bold truncate">{user.displayName || user.name}</div>
            <div className="text-xs text-muted-foreground truncate mb-2">{user.email}</div>
            <NavLink to="/profile" onClick={onClose} className="block text-xs font-semibold text-primary hover:underline mb-3">
              Edit Profile →
            </NavLink>
            {user.role && (
              <div className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide rounded-sm px-1.5 py-0.5 bg-secondary text-muted-foreground mb-3">
                {user.role === 'player' ? 'Player' : user.role === 'coach' ? 'Coach' : 'Organizer'}
                {user.isVerified && ' ✓'}
              </div>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-semibold bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="w-4 h-4" strokeWidth={2.5} />
              Log out
            </button>
          </div>
        )}
      </div>
    </>
  );
}
