repo: mvmsreddy/match-tracker
branch: main

## Last sync
date: 2026-07-31T11:56:00Z

### Updated in this project
- Audited theming + responsive setup across index.css, app-tailwind.css, tracker-tailwind.css
- Wrote a day/night/glare token spec resolved from local sunrise/sunset
- Rebuilt every route as a screen gallery: phone (390) + laptop (1180) frames per tier
- Added a file-by-file migration checklist with acceptance checks
- Corrected tournaments / order-of-play / profile / AITA-calendar screens against source; imported the real logo asset
- Explored a modern visual direction (Daylight / Floodlight) for dashboard + live track
- Rebuilt ALL 18 routes in the approved Daylight/Floodlight language (Match Tracker App 2026)
- Grounded the wizard steps, court zones, skill radar, fuel timer and drill correlation against source

## Screen map
| Project screen | Built from repo files |
|---|---|
| Responsive Theming Spec — tokens | src/index.css, src/styles/app-tailwind.css, src/styles/tracker-tailwind.css, src/context/ThemeContext.jsx |
| Responsive Theming Spec — components | src/components/ui/{card,button,badge,table}.jsx, src/components/primitives/{card,button,badge,table}.jsx, src/components/tracker/ChipButton.jsx |
| Match Tracker Screens — app chrome, drawer, rail | src/components/AppShell.jsx, src/components/NavDrawer.jsx, src/components/nav/MTNavChrome.jsx, src/App.jsx |
| Match Tracker Screens — login | src/pages/LoginPage.jsx |
| Match Tracker Screens — player dashboard | src/pages/DashboardPage.jsx, src/components/DashboardExtras.jsx, src/lib/streaks.js, src/lib/streakTokens.js |
| Match Tracker Screens — live track | src/components/Scorebar.jsx, src/components/Wizard.jsx, src/components/tracker/ChipButton.jsx, src/components/tracker/LandscapeScoreView.jsx, src/lib/constants.js |
| Match Tracker Screens — match detail | src/pages/MatchDetailPage.jsx, src/components/StatsPanel.jsx, src/components/PointLog.jsx, src/components/ShotLocationHeatmap.jsx |
| Match Tracker Screens — history | src/pages/MatchHistoryPage.jsx |
| Match Tracker Screens — compare | src/pages/ComparePage.jsx |
| Match Tracker Screens — tournaments, draw, order of play | src/pages/TournamentsListPage.jsx, src/pages/EventDetailPage.jsx, src/pages/OrderOfPlayPage.jsx, src/index.css (.t-bmc-*, .t-ds-*) |
| Match Tracker App 2026 — all screens (current direction) | Same sources as the rows above; chrome from AppShell/NavDrawer/nav/MTNavChrome, login from LoginPage.jsx, rings from motivation/WeeklyGoalRings.jsx + lib/motivation.js, OOP from OrderOfPlayPage.jsx, draw from index.css .t-bmc-*, tournaments from TournamentsListPage.jsx, profile from ProfilePage.jsx, calendar from AitaCalendarPage.jsx |
| Match Tracker App 2026 — live track wizard | src/components/Wizard.jsx, src/lib/wizardLogic.js, src/lib/courtZones.js, src/components/tracker/ChipButton.jsx |
| Match Tracker App 2026 — skill radar | src/components/SkillRadarCard.jsx, src/components/MatchSkillRating.jsx |
| Match Tracker App 2026 — fuel timer / drill correlation | src/components/NutritionCoachingPanel.jsx (PeriMatchFuelTimer), src/components/coach/CorrelationView.jsx |
| Brand mark used in all frames | scripts-tmp/logo.svg, assets/logo.png (copied into project) |
| Match Tracker Screens — AITA rankings / calendar | src/pages/AitaRankingsPage.jsx, src/pages/AitaCalendarPage.jsx |
| Match Tracker Screens — drills | src/pages/DrillsPage.jsx |
| Match Tracker Screens — nutrition | src/pages/NutritionPage.jsx, src/components/NutritionWidgets.jsx, src/components/NutritionCoachingPanel.jsx |
| Match Tracker Screens — messages | src/pages/MessagesPage.jsx |
| Match Tracker Screens — profile | src/pages/ProfilePage.jsx |
| Match Tracker Screens — coach home | src/pages/CoachIntelligencePage.jsx, src/components/coach/CoachIntelligenceShell.jsx |
| Match Tracker Screens — parent home | src/pages/ParentDashboardPage.jsx |
| Match Tracker 2026 — dashboard (Daylight / Floodlight) | src/pages/DashboardPage.jsx, src/components/motivation/WeeklyGoalRings.jsx, src/lib/motivation.js (computeWeeklyRings), src/lib/streaks.js |
| Match Tracker 2026 — live track | src/components/Scorebar.jsx, src/components/Wizard.jsx, src/components/tracker/ChipButton.jsx, src/hooks/useWakeLock.js |
| Match Tracker Screens — nutritionist home | src/pages/NutritionistDashboardPage.jsx |

## Sync history
- 2026-07-31T11:30:46Z — read WeeklyGoalRings + computeWeeklyRings for the new direction
- 2026-07-31T11:16:40Z — corrected 4 screens against source, imported logo asset
- 2026-07-31T10:50:47Z — initial audit + theming/responsive spec
