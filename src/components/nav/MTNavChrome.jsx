import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import NavDrawer from '../NavDrawer';

// Persistent nav chrome for the "Navy" design system: a bottom tab bar on
// phone, a left icon+label rail on tablet/desktop. Curated subset of
// NavDrawer's full link list (a 5/6-item bar can't hold all 8 links a
// player/coach has) — the hamburger button here still opens the same
// NavDrawer as every other theme, so nothing becomes unreachable, it's
// just no longer the *only* way to get around.
function navItemsForRole(role) {
  const dashboard = { id: 'dashboard', code: 'DB', label: 'Dashboard', to: '/' };
  const tournaments = { id: 'tournaments', code: 'TN', label: 'Tournaments', to: '/tournaments' };
  const calendar = { id: 'calendar', code: 'CA', label: 'Calendar', to: '/aita-calendar' };
  const rankings = { id: 'rankings', code: 'RK', label: 'Rankings', to: '/aita-rankings' };
  const profile = { id: 'profile', code: 'PR', label: 'Profile', to: '/profile' };

  if (role === 'organizer') {
    return {
      tabBar: [dashboard, tournaments, calendar, rankings],
      rail: [dashboard, tournaments, calendar, rankings, profile],
    };
  }

  const track = { id: 'track', code: 'TR', label: 'Track', to: '/track' };
  const stats = { id: 'stats', code: 'ST', label: 'Stats', to: '/compare' };
  const roster = role === 'coach'
    ? { id: 'roster', code: 'MP', label: 'My Players', to: '/my-players' }
    : { id: 'roster', code: 'MC', label: 'My Coaches', to: '/my-coaches' };

  // Rankings browser is coach/organizer territory (scouting across many
  // players' segments) — a player already sees their own rank on their
  // dashboard, so it's dropped from their nav instead of duplicating it.
  if (role === 'player') {
    return {
      tabBar: [dashboard, track, tournaments, stats],
      rail: [dashboard, track, tournaments, stats, roster, profile],
    };
  }

  return {
    tabBar: [dashboard, track, tournaments, stats, rankings],
    rail: [dashboard, track, tournaments, stats, rankings, roster, profile],
  };
}

export default function MTNavChrome({ active }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const role = user?.role || 'player';
  const { tabBar, rail } = navItemsForRole(role);
  const initials = (user?.displayName || user?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <>
      <div className="mt-topstrip">
        <button className="mt-hamburger" onClick={() => setDrawerOpen(true)} aria-label="Open menu">☰</button>
        <div className="mt-topstrip-brand">
          <span className="mt-brand-chip">MT</span>
          Match Tracker Pro
        </div>
      </div>

      <nav className="mt-tabbar">
        {tabBar.map(n => (
          <NavLink
            key={n.id}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => 'mt-tabbar-item' + ((isActive || active === n.id) ? ' active' : '')}
          >
            <span className="mt-tabbar-code">{n.code}</span>
            <span className="mt-tabbar-label">{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <nav className="mt-rail">
        <div className="mt-rail-brand">
          <span className="mt-brand-chip">MT</span>
          <span className="mt-rail-brand-text">Match Tracker</span>
        </div>
        {rail.map(n => (
          <NavLink
            key={n.id}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => 'mt-rail-item' + ((isActive || active === n.id) ? ' active' : '')}
          >
            <span className="mt-rail-code">{n.code}</span>
            <span className="mt-rail-label">{n.label}</span>
          </NavLink>
        ))}
        {user && (
          <div className="mt-rail-user">
            <span className="mt-rail-user-chip">{initials}</span>
            <div className="mt-rail-user-text">
              <div className="mt-rail-user-name">{user.displayName || user.name}</div>
              <div className="mt-rail-user-role">{role}</div>
            </div>
          </div>
        )}
      </nav>

      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={role}
        theme={theme}
        toggle={toggle}
        logout={logout}
      />
    </>
  );
}
