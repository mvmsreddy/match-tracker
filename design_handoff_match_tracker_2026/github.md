repo: mvmsreddy/match-tracker
branch: main

## Last sync
date: 2026-07-31T16:24:42Z
tree: 42e694ee132e

### Updated in this project
- Upstream shipped migration steps 1–3: tiered `--app-*` tokens, 4-value ThemeContext, `getSunTimes()`
- Aligned the Floodlight frames to the shipped night border token (`#26302A`)
- Marked the two theming blockers fixed in the spec audit and listed what's still open
- Refreshed the Claude Code handoff README with a sync-status section and struck-through steps 1–3
- Audited every text/background pair programmatically and fixed 274 low-contrast colours (muted greys, lime/amber/blue used as text)
- Consolidated to ONE design file: Match Tracker App 2026 (retired the navy recreation and the direction exploration)

## Screen map
| Project screen | Built from repo files |
|---|---|
| Match Tracker App 2026 — token layer + tier resolution | src/styles/app-tailwind.css, src/context/ThemeContext.jsx, src/lib/weather.js, src/index.css |
| Match Tracker App 2026 — app chrome, sheet menu, rail | src/components/AppShell.jsx, src/components/NavDrawer.jsx, src/components/nav/MTNavChrome.jsx, src/App.jsx, src/index.css (.mt-rail, .mt-tabbar) |
| Match Tracker App 2026 — login | src/pages/LoginPage.jsx |
| Match Tracker App 2026 — player dashboard | src/pages/DashboardPage.jsx, src/components/DashboardExtras.jsx, src/lib/streaks.js, src/lib/streakTokens.js, src/components/motivation/WeeklyGoalRings.jsx, src/lib/motivation.js |
| Match Tracker App 2026 — skill radar | src/components/SkillRadarCard.jsx, src/components/MatchSkillRating.jsx, src/lib/localStore.js |
| Match Tracker App 2026 — live track wizard | src/components/Wizard.jsx, src/lib/wizardLogic.js, src/lib/courtZones.js, src/components/ShotLocationCourt.jsx, src/components/tracker/ChipButton.jsx, src/lib/constants.js |
| Match Tracker App 2026 — scorebar, landscape, wake lock | src/components/Scorebar.jsx, src/components/tracker/LandscapeScoreView.jsx, src/hooks/useWakeLock.js, src/hooks/useOrientation.js |
| Match Tracker App 2026 — match detail | src/pages/MatchDetailPage.jsx, src/components/StatsPanel.jsx, src/components/PointLog.jsx, src/components/ShotLocationHeatmap.jsx |
| Match Tracker App 2026 — history | src/pages/MatchHistoryPage.jsx |
| Match Tracker App 2026 — compare | src/pages/ComparePage.jsx |
| Match Tracker App 2026 — tournaments, draw, order of play | src/pages/TournamentsListPage.jsx, src/pages/EventDetailPage.jsx, src/pages/OrderOfPlayPage.jsx, src/index.css (.t-bmc-*, .t-ds-*) |
| Match Tracker App 2026 — AITA rankings / calendar | src/pages/AitaRankingsPage.jsx, src/pages/AitaCalendarPage.jsx |
| Match Tracker App 2026 — drills | src/pages/DrillsPage.jsx |
| Match Tracker App 2026 — nutrition + fuel timer | src/pages/NutritionPage.jsx, src/components/NutritionWidgets.jsx, src/components/NutritionCoachingPanel.jsx |
| Match Tracker App 2026 — messages | src/pages/MessagesPage.jsx |
| Match Tracker App 2026 — profile | src/pages/ProfilePage.jsx |
| Match Tracker App 2026 — coach home + correlation | src/pages/CoachIntelligencePage.jsx, src/components/coach/CoachIntelligenceShell.jsx, src/components/coach/CorrelationView.jsx, src/lib/coachAnalytics.js |
| Match Tracker App 2026 — parent home | src/pages/ParentDashboardPage.jsx |
| Match Tracker App 2026 — organizer home | src/pages/DashboardPage.jsx (organizer branch), src/pages/TournamentsListPage.jsx |
| Match Tracker App 2026 — nutritionist home | src/pages/NutritionistDashboardPage.jsx |
| Responsive Theming Spec — tokens, breakpoints, migration | src/index.css, src/styles/app-tailwind.css, src/styles/tracker-tailwind.css, src/context/ThemeContext.jsx, src/lib/weather.js |
| Responsive Theming Spec — component specs | src/components/ui/{card,button,badge,table}.jsx, src/components/primitives/{card,button,badge,table}.jsx, src/components/tracker/ChipButton.jsx |
| Brand mark used in all frames | scripts-tmp/logo.svg, assets/logo.png (copied into project) |

## Upstream implementation status
- Step 1 tokens — **done** (`app-tailwind.css`, three `[data-tier]` blocks + accent-ink/forced/font-mono)
- Step 2 ThemeContext — **done** (4-value preference, sun-based resolver, `.dark` shim)
- Step 3 weather sunrise/sunset — **done** (`getSunTimes()`, per-day cache)
- Step 4 index.css — **partial** (legacy aliases + navy gate removed; 680 px caps, `.root` overflow, Manrope body and rail width-gating outstanding)
- Steps 5–8 (unified AppNav, ui/primitives merge, wizard/tracker layout, legacy class sweep) — **not started**

## Design-side corrections not yet in the code
- Daylight muted text is `#4E5A50` (was `#6B7A6E`, failed 4.5:1) — update `--app-muted-foreground`
- Lime/amber/blue as *text* darken to `#4E6B10` / `#8A5F00` / `#1B5FBF`; the fills stay as shipped
- Floodlight muted floor is `#7C8A80`; never near-black text on dark surfaces

## Sync history
- 2026-07-31T11:56:00Z — grounded wizard steps, court zones, skill radar, fuel timer, correlation
- 2026-07-31T11:30:46Z — read WeeklyGoalRings + computeWeeklyRings for the new direction
- 2026-07-31T11:16:40Z — corrected 4 screens against source, imported logo asset
- 2026-07-31T10:50:47Z — initial audit + theming/responsive spec
