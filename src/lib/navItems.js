import {
  LayoutDashboard, Activity, Trophy, User, Users,
  Calendar, Medal, ShieldCheck,
} from 'lucide-react';

// Canonical nav list per role, shared by every nav presentation (phone side
// drawer, tablet icon rail, laptop labelled rail). Moved here from
// NavDrawer so AppNav can consume the exact same list instead of a second,
// independently-curated one (that's what left .mt-rail/.mt-tabbar showing a
// different, stale link set before this migration).
export function getNavItems(role) {
  const dashboard = { id: 'dashboard', label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true };
  const track = { id: 'track', label: 'Track', to: '/track', icon: Activity };
  const tournaments = { id: 'tournaments', label: 'Tournaments', to: '/tournaments', icon: Trophy };
  const profile = { id: 'profile', label: 'Profile', to: '/profile', icon: User };
  const calendar = { id: 'calendar', label: 'Tournament Calendar', to: '/aita-calendar', icon: Calendar };
  const rankings = { id: 'rankings', label: 'AITA Rankings', to: '/aita-rankings', icon: Medal };
  const myPlayers = { id: 'my-players', label: 'My Players', to: '/my-players', icon: Users };
  const myParentPlayers = { id: 'my-parent-players', label: 'My Players', to: '/my-parents', icon: Users };
  const adminReview = { id: 'admin-review', label: 'Admin Review', to: '/admin/aita-review', icon: ShieldCheck };

  if (role === 'super_admin') {
    return [adminReview, calendar, rankings, profile];
  }
  if (role === 'organizer') {
    return [dashboard, tournaments, calendar, rankings, profile];
  }
  if (role === 'coach') {
    return [dashboard, track, myPlayers, tournaments, calendar, rankings, profile];
  }
  if (role === 'parent') {
    return [dashboard, myParentPlayers, tournaments, calendar, profile];
  }
  return [dashboard, track, tournaments, calendar, profile];
}
