import {
  LayoutDashboard, Activity, Trophy, GitCompare, User, Users,
  Calendar, Medal, Video, Apple, Dumbbell,
} from 'lucide-react';

// Canonical nav list per role, shared by every nav presentation (phone side
// drawer, tablet icon rail, laptop labelled rail). Moved here from
// NavDrawer so AppNav can consume the exact same list instead of a second,
// independently-curated one (that's what left .mt-rail/.mt-tabbar showing a
// different, stale link set before this migration).
export function getNavItems(role) {
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

  if (role === 'organizer') {
    return [dashboard, tournaments, calendar, rankings, profile];
  }
  if (role === 'coach') {
    return [dashboard, track, drills, videoAnalysis, myPlayers, compare, nutrition, tournaments, calendar, rankings, profile];
  }
  if (role === 'parent') {
    return [dashboard, myParentPlayers, tournaments, calendar, profile];
  }
  return [dashboard, track, drills, videoAnalysis, tournaments, compare, nutrition, myCoaches, myParents, calendar, profile];
}
