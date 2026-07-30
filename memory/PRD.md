# Tennis Tracker Pro — UI/UX + Feature Expansion

## Original Problem Statement
Tennis Analytics application (React + Vite + Tailwind v4 + Recharts + Supabase mock). User requested a full "build everything" sprint from a PRD v2.0 (360° Junior-to-Pro Platform) — pick the actionable Phase-1 items feasible on the current tech stack without new backend integrations.

## Tech Stack (Unchanged)
- **Frontend:** React 18.3.1, Vite 5.4.8, Tailwind CSS 4.3.3
- **UI Components:** Radix UI primitives, lucide-react icons
- **Charts:** Recharts 3.10.1 (Line, Bar, Pie, Radar, Composed)
- **Backend:** Supabase mock via localStorage
- **New in this iteration:** `/app/src/lib/localStore.js` — namespaced localStorage layer for drills, water, skill self-ratings, dashboard prefs (no backend dependency)

## What's Been Implemented — Iteration 5

### Player Dashboard makeover
1. **LogTodayReminder banner** — after 6pm if no session logged today, dismissable per day (`sessionStorage`). Deep-links to Track.
2. **QuickAddGrid** — 3 tap-to-log tiles: Log Match / Log Drill / Log Meal — shown for player + coach roles.
3. **Skill Radar on Dashboard** — 6-axis radar (Serve · Forehand · Backhand · Volley · Footwork · Mental), computed from the latest 5 self-rated matches. Empty state with CTA when no ratings exist.
4. **Digest Preview Card** — in-app preview of "what your weekly digest email would say" (matches/W-L/win-rate/practices/streak/goal) — computed client-side, no backend needed.
5. **Recent-5 Sessions Strip** — compact list of last 5 sessions with W/L/PR badges, clickable to open detail.

### Nutrition overhaul
6. **MacroDonut** — daily macros donut (Carbs · Protein · Fats) with center kcal total and %-breakdown legend.
7. **WaterTracker** — tap-chip logger (+250/+500/+750 ml) with progress bar, reset today, and 7-day average.
8. **WeeklyAverageCard** — 7-day averages of calories/protein/water vs goals, with "on-track" indicators.
9. Nutrition page reorganized: header → macros + water grid → weekly avg → existing meal log + goals (kept intact).

### Drills module (net-new)
10. **DrillsPage** at `/drills` — full CRUD:
    - 8 drill types (Forehand/Backhand/Serve/Volley/Footwork/Fitness/Match Play/Other) with emoji icons
    - Intensity chips (Low/Medium/High)
    - Duration + notes + video URL
    - Week stats card (count / minutes / high-intensity sessions)
11. **Nav integration** — Drills item added to NavDrawer for player and coach roles.

### Match Analysis
12. **MatchSkillRating component** — 1-10 slider grid for 6 skills, saves per-match to localStorage, feeds Dashboard Skill Radar. Injected into MatchDetailPage below ShotLocationHeatmap.
13. Shot-location heatmap already existed (`ShotLocationHeatmap.jsx`) — verified visible on Match Detail.

### Compare / Head-to-Head
14. **H2HInsight** — head-to-head card on Compare page: groups matches by opponent (played 2+ times), shows W-L, dominance indicator, W/L stacked progress bar, last-result date.

### Housekeeping
15. Consolidated initials logic — AppShell, TopNav, ProfilePage, ParentDashboardPage all now use `/app/src/lib/initials.js`.
16. Streak Freeze card redesigned with icon, pill chips, better empty states.

## No Functionality Regressions
All existing features (match tracker, PDF export, tournaments, rankings, calendar, messaging, coach analytics, order-of-play) preserved. The new modules are additive.

## Design Principles Applied
- Mobile-first (390px baseline)
- All interactive elements ≥44×44 px touch target
- Consistent iconography (lucide-react across the board)
- Recharts for all visualizations (Line/Bar/Pie/Radar/Area/Composed all in use)
- Solid `bg-primary` / `bg-card` / `bg-*/5` colors (no gradient utilities — v4 preflight-skip incompatible)
- Semantic testids on every interactive element

## Testing Status
- **Iteration 4** — 12/13 pass. Found 1 MEDIUM CSS bug: `hsl(var(--color-X))` was invalid on all 4 new components + preexisting player-tab charts.
- **Iteration 5** — 8/8 pass on the CSS-fix re-verification. All colors now render correctly (verified computed styles + visual screenshots).
- **Post-iteration-5 polish** applied by main agent:
  - Fixed remaining `hsl(var(...))` in `/app/src/index.css` (focus outline + table hover)
  - Backed nutrition logs with `/app/src/api/nutritionMock.js` (localStorage), so MacroDonut populates end-to-end in demo mode
  - Fixed UTC→local timezone in `todayIso()` in NutritionPage so today's meals are recognized regardless of server time
  - Verified: 3 pie cells render with `var(--color-primary)`, `var(--color-chart-3)`, `var(--color-chart-4)` fills when meals exist

## Iteration 6 — Performance Merge + Login Redesign (Feb 2026)
17. **PerformanceSummarySection** wired into main `DashboardPage.jsx` for player role — merges the "View My Performance" content (rank/points/best/best-pts + points-growth & rank-progress mini charts + circuit pills) directly inline in the Dashboard flow, wrapped in `SegmentProvider`. No separate card/tab feel — sits naturally between Recent Form and Skill Radar. Removed collapse chevron and "Browse all" link so it reads as native dashboard content.
18. **Login page redesign** — editorial dark-navy hero panel (52% width on desktop) with:
    - Rotating brand stats ("12,847 matches tracked this month" etc, cycles every 3.5s with animated dot indicators)
    - Amber-gradient Trophy brand mark with soft glow
    - Grain overlay + court-lines SVG motif
    - Serif italic accents in headline ("Every point. Every insight. Elevate your game.")
    - Live-system indicator dot in footer
    - Right form panel on warm off-white (#f7f6f2) with pill-style Sign In / Sign Up toggle, floating icon focus-color transitions, larger 11px input heights, dark-navy CTA with hover translate arrow
    - Refined mobile: compact brand header above card, ambient navy backdrop bleed
    - Demo accounts as tap-to-fill cards with monospace password chip
    - Terms/Privacy trust footer
    - Signup role picker: 2×2 grid with selected role in solid navy (much clearer active state)

### Testing
- Verified via screenshot tool on desktop (1920×800) + mobile (390×844)
- No console errors; benign Supabase-not-configured warnings only (mock-mode expected)
- Signup mode renders correctly with role selector and confirm-password field

## Iteration 7 — Performance-tab kill, Motivation engine, H2H rivalry, mock ranking (Feb 2026)

### What shipped
- **Performance tab fully removed** from PlayerDashboardPage nav strip AND from the app-wide NavDrawer. Manual navigation to `/player-dashboard?tab=performance` now silently falls back to Overview (whitelist-based validation). `MyPerformanceTab.jsx` deleted; all functionality is now inline on the main Dashboard.
- **Mock AITA ranking history generator** (`/app/src/lib/mockRankingHistory.js`) — deterministic per-aitaReg trajectory across 3 circuits (U16 Singles, U16 Doubles, U18 Singles) with 10-13 fortnightly snapshots each. Rising-but-realistic arc so the Performance Snapshot shows meaningful charts in demo mode. New demo Player user added (player@matchtracker.app / player123 with aitaReg=AITA2019X4021).
- **Motivation engine** (`/app/src/lib/motivation.js`) — pure functions for:
  - **Momentum Meter (0-100)** — blends recent form / activity / streak / skill self-rating into one headline score with tone (On fire / Climbing / Holding / Cooling / Slow start) + 4-bar breakdown.
  - **Weekly Goal Rings** — Apple-Watch-style rings for Matches / Practice / Hydration (per-day framing), with a "Perfect Week" badge when all 3 close.
  - **Daily Mission** — rotating tap-to-complete challenge (rate match / log water / drill / notes / etc). Deterministic day-of-year seed. Mission streak flame.
  - **Achievements** — 15 badges across firsts / streaks / wins / practice / self-awareness / rank-climb. Unlocks stamped with timestamp; NEW ribbon within 48h. Rank-climber achievement now correctly wired to real rank history via SegmentProvider.
  - **Next Milestone** — nearest-boundary top-N goal ("13 ranks to break top-50") with proportional progress bar. Falls through to wins → streak targets when the player has no ranking data.
- **H2HRivalryCard** — spotlight card that appears when the player has an upcoming/today match against an opponent they've faced before. Shows W-L, dominance bar, last-result marker, and a tactical hint. Zero-render when there's no prior history.
- **PerformanceSummarySection upgraded** — now defaults to the player's STRONGEST circuit (lowest best-ever rank) instead of most-recent, so the dashboard headline shows their pride segment.
- **New motivation cluster on Dashboard**: Momentum → H2H Alert → Rings + Mission side-by-side → Achievements Reel, then the Performance Snapshot and Next Milestone. Everything else on Dashboard preserved.
- **All motivation components are theme-aware** — no hardcoded slate-*/amber-50 classes; uses amber-500/N opacity + border-border + text-foreground/muted-foreground.

### Testing
- iteration_6.json: 13/14 pass, 6 issues surfaced
- iteration_7.json: 11/12 pass (92%), 1 progress-bar math bug — fixed post-report
- Regression: no console errors on any flow

## Iteration 8 — Backend for Live Advisor + Weekly Digest via Resend (planned next)
- Stand up minimal FastAPI backend at /app/backend
- POST /api/advisor/tip — real-time AI shot suggestions during a tracked match using Emergent LLM key (no user key needed)
- POST /api/digest/send + weekly cron — Weekly digest email via Resend (needs user's Resend API key + verified sender domain)

## Iteration 8-9 — FastAPI backend, Live Advisor, Streak Freeze Tokens, Shareable Badges, Weekly Digest (Feb 2026)

### Backend (new)
- Fresh minimal FastAPI backend at `/app/backend/server.py` bound to port 8001 via supervisor.
- `GET /api/health` — reports advisor_ready + digest_ready flags.
- `POST /api/advisor/tip` — SSE-streaming endpoint that returns a 1-2 sentence tactical tip via Emergent LLM Key (Claude Sonnet 4.6). System prompt enforces punchy, concrete, imperative coaching.
- `POST /api/digest/send` — HTML weekly digest email via Resend. Returns 503 with a friendly message until `RESEND_API_KEY` + `SENDER_EMAIL` are set.
- pytest suite at `/app/backend/tests/backend_test.py`: 7/7 pass.

### Frontend
- **LiveMatchAdvisor** (`/app/src/components/LiveMatchAdvisor.jsx`) — floating "AI Coach" card inside the in-match tracker (MatchRunningView). One-tap streaming tip; reads `data: <token>` SSE frames into a live-updating italicised sentence with cursor. Uses the composed match context.
- **Streak Freeze Tokens** (`/app/src/lib/streakTokens.js` + StreakCard) — 1 token every 7 days, cap 3. Bounded-gap auto-consumption: only spends tokens on missed days BETWEEN two logged anchors (never wasted on trailing inactivity). Persists autoConsumed across renders. StreakCard now shows a 3-slot indicator bar and an "🛡️ Auto-protected" note when tokens have been recently spent. `streaks.js` updated so frozen days count toward the streak — a spent token now visibly extends the streak by 1.
- **Shareable Badge Cards** (`/app/src/components/motivation/ShareBadgeModal.jsx`) — every unlocked achievement in AchievementsReel is now a clickable button that opens a modal with a 1080×1920 SVG-rendered PNG matching the app's dark editorial aesthetic (deep navy background, court motif, gold medal ring, serif branding). Native `navigator.share` on mobile with download fallback.
- **WeeklyDigestCard** (`/app/src/components/WeeklyDigestCard.jsx`) — profile-page card with opt-in toggle and "Send preview now" CTA. Auto-detects whether the backend Resend integration is configured via `/api/health` and gracefully shows a "Coming soon" pill when it isn't (user opted to skip Resend credentials for now).

### Testing
- iteration_8.json: 12 tests, 6 pass, 6 targeted fixes needed (all fixed → iteration_9)
- iteration_9.json: All 4 targeted fixes verified. Backend 7/7 pytest pass. 2 new MEDIUM design issues (streak semantics + token efficiency) — resolved by updating streaks.js to count frozen days.
- Rank ##180 double-hash typo on profile — fixed by stripping the prefix from seed data.

## Iteration 10 — Complete Nutritionist Module (Feb 2026)

### New role
- **Nutritionist** added as a 4th role in signup + demo credentials (`nutritionist@matchtracker.app / nutri123`, "Dt. Priya"). `HomeRoute` branches to `NutritionistDashboardPage` for this role.

### Nutritionist Command Center (`/nutritionist`)
6-tab console:
1. **Athletes** — roster with weekly-compliance mini-bar snapshot per player + amber flag when GI triggers / red-flag macro / cramps surface. Click-through selects an athlete for the rest of the tabs.
2. **Plan** — 7×6 day-type macro grid (Rest / Light / Training / Heavy / Match / Tournament-Prep / Travel × Cal/P/C/F/H₂O/Na). Editable, persists to `tt.nutrition.targets`. Below: allergen chips (dairy/nuts/gluten/eggs/soy/shellfish/sesame), preference chips (veg/vegan/halal/jain/gluten-free/high-carb), 5 micronutrient targets (iron/Mg/Ca/Vit D/K).
3. **Protocols** — 7 supplemental-protocol inputs (electrolyte ml/h, sodium mg/h, pre-match caffeine, post-match protein+carb, carb-loading days, g/kg body weight).
4. **Meal Templates** — reusable library (name / description / macros / tag) with add + delete.
5. **Body Composition** — weight / body fat % / hydration % log with trend indicator (▲/▼).
6. **Messages** — chat thread with the selected athlete (mirrors to the player-side DietitianChatCard).

### Player-side coaching layer (injected atop `/nutrition`)
- **ComplianceHero** — day-type dropdown + color-coded compliance bars using bands: ±10% 🟢 / ±20% 🟡 / ±30% 🟠 / beyond 🔴.
- **AI Meal Suggester** — POST `/api/nutrition/suggest` SSE endpoint (Claude Sonnet 4.6, India-context system prompt, allergen-aware, timing-aware). 4 preset contexts (pre-match 45m / 2h / post / T-day). Output renders as markdown via inline `TinyMarkdown` (bold, bullets, headings).
- **PeriMatchFuelTimer** — 6 timeline checkpoints (T-2h → T+30) with tap-to-check. Persists session in localStorage.
- **WeeklyReportCard** — 5 hit% metrics, avg energy, cramp count, "focus" callout for worst-missed macro.
- **WellnessQuickLog** — 1-10 sliders for court energy + gut comfort + cramp checkbox + notes.
- **GiTriggerCard** — pattern-detects foods eaten in 6h before ≤5/10 gut reports. Shows word candidates with incident counts.
- **DietitianChatCard** — collapsible thread with unread badge, syncs with nutritionist's Messages tab.

### Cross-module
- 7 nutrition badges (First Fuel / Hydration Hero / Protein Pro / Perfect Prep Week / Bounce Back / Gut Detective / Body Data Nerd) merged into the main Dashboard Trophy Cabinet (unlockedCount + locked "next up" reel expanded to 6).
- Backend `/api/nutrition/suggest` — pytest 10/10 green.

### Fixes shipped in the same iteration
- shadcn `<Input>` was missing `text-foreground` — invisible text in dark mode fixed globally.
- Native `<select>` in coaching panel + templates page now use `text-foreground bg-background`.
- Plan grid uses `min-w-[560px]` + per-column min-width to scroll horizontally on mobile instead of clipping 4-digit values.
- WaterTracker + ComplianceHero now share hydration state (water quick-logs mirror into nutrition logs; WaterTracker sums today's non-water nutrition-log hydration too).
- Nutritionist message-thread timestamp contrast improved.

### Testing
- iteration_10.json: 10/10 backend pytest, ~90% frontend (all 17 features render + function), 1 HIGH styling defect + 3 MEDIUM + 1 LOW — all resolved.

## Iteration 11 — Live Match Command Center (Feb 2026)

The "heart of the app" upgrade — a persistent context bar that wraps the existing point-entry UI (QuickMode/Wizard) during a live match. Purpose: keep every high-value on-court signal one glance away, so a player never leaves the Track tab mid-match.

### What shipped
- **LiveMatchCommandCenter** (`/app/src/components/tracker/LiveMatchCommandCenter.jsx`) — wraps QuickMode/Wizard on the Track tab, adds:
  - **Score Hero** — big current-game score (font-display 4xl), server chip with pulse dot, live match duration (mm:ss ticking every 1s), sets pill, per-set games.
  - **Momentum micro-strip** — last-8 points as W/L color dots.
  - **Streak indicator** — "X in a row" primary/destructive pill when the last ≥2 points share a winner.
  - **Break-point burst** — pulsing amber pill when the receiver is at 40 with server ≤ 30 or receiver holds advantage.
  - **Commit flash overlay** — full-panel 550ms green (self) / red (opp) pulse on every point commit; instant visual acknowledgement.
  - **Floating Undo pill** — appears bottom-center-fixed for 5s after each commit; one-tap undo without hunting.
  - **AI Coach inline** — one-tap "Ask coach" streams a real-time tactical tip via `/api/advisor/tip` SSE (Claude Sonnet 4.6). Uses live match context (score, server, opponent, recent form). Inline card can be refreshed for new tips.
  - **Changeover timer** — auto-triggered 90s countdown at every odd-game boundary (1, 3, 5…), persisted through GameTransitionCard remounts via `sessionStorage`. Dismissible.
  - **Distraction-Free / Focus mode** — Eye-toggle collapses the whole shell to just a huge score card + the winner buttons.

### Testing
- iteration_11.json: 10/12 pass — Score Hero / Momentum / Streak / Break-point / Commit flash / Floating undo / AI Coach SSE (real "Serve wide to the deuce court, then attack the open court with your forehand." tip received) / Distraction-free / QuickMode regression / zero console errors → all PASS.
- 2 fixes applied post-report: duration counter now 1s (not 30s) so it ticks live; changeover timer now uses sessionStorage to survive GameTransitionCard unmount cycles.

### Test IDs added
- `live-command-center` · `live-command-center-distraction` · `live-game-score` · `match-duration` · `momentum-strip` · `streak-indicator` · `floating-undo-pill` · `advisor-quick-btn` · `advisor-inline` · `advisor-inline-tip` · `distraction-toggle-on` · `distraction-toggle-off` · `changeover-timer` · `serve-first-self-btn` · `serve-first-opp-btn`

## What's Been Implemented — Iteration 12 (Feb 2026): Tracker P0 Trio

### Big-Screen Landscape Mode
- New `useOrientation()` hook (`/app/src/hooks/useOrientation.js`) — detects `isLandscape` + `isMobile` (coarse pointer OR small side < 500px). Correctly excludes laptops in landscape.
- New `LandscapeScoreView` (`/app/src/components/tracker/LandscapeScoreView.jsx`) — fullscreen spectator view with `clamp(6rem, 22vw, 20rem)` giant score, sets/games/duration, server + court-side chip, streak + break-point pills, momentum strip.
- LiveMatchCommandCenter short-circuits to LandscapeScoreView when phone-in-landscape; discreet "Exit landscape" button restores normal UI; re-armed on next rotation.

### Server-Side Deuce/Ad Indicator
- New exported helper `getNextServeCourtSide(state)` in `/app/src/lib/engine.js`. Regular game: `(gamePts.self + gamePts.opp) % 2 === 0 ? 'deuce' : 'ad'`. Tiebreak: uses engine-tracked `tiebreakCourtSide`.
- Rendered as coloured pill next to server chip in the Score Hero (`data-testid="court-side-indicator"`). Green = Deuce, Amber = Ad.
- Passed into AI Advisor payload's `game_state` — coach can now suggest wide/T placement.

### Post-Match Highlight Reel
- Backend: new `POST /api/advisor/highlight-reel` SSE endpoint (Claude Sonnet 4.6) — takes final score, duration, points played, longest win/loss streaks, and up to 3 in-match coach tips and returns a 2-3 sentence recap.
- Frontend: new `HighlightReelCard` (`/app/src/components/tracker/HighlightReelCard.jsx`) — auto-fetches recap on mount, shows final score, Best-run / Tough-patch streak stats, unique dedup'd list of AI tips whispered during the match, plus native Share and text-file Save.
- `TrackerPage.jsx` tracks `advisorHistory` (tips lifted from LiveMatchCommandCenter via new `onAdvisorTip` callback prop) and passes it through `MatchOverBlock`, which now renders the HighlightReelCard below the Match-Over summary.

### Test IDs added
- `court-side-indicator` · `landscape-score-view` · `landscape-game-score` · `landscape-court-side` · `landscape-duration` · `landscape-momentum-strip` · `landscape-exit-btn` · `highlight-reel-card` · `highlight-final-score` · `highlight-recap` · `highlight-regen-btn` · `highlight-share-btn` · `highlight-download-btn` · `highlight-tip-{i}` · `swing-win` · `swing-loss` · `quick-win-self-btn` · `quick-win-opp-btn` · `quick-end-match-btn`

### Testing
- iteration_12.json: 8/8 pytest (backend SSE happy path + variants + validation + regression on `/api/advisor/tip`, `/api/nutrition/suggest`, `/api/health`) → PASS. Frontend end-to-end at 812x375 phone-landscape: giant score, court chip, exit button all correct; laptop 1366x768 no longer hijacked (post-fix).
- Post-report fixes: `useOrientation` isMobile threshold tightened to prevent laptop hijack; HighlightReelCard duration now shows sub-minute values (`{n}s`) instead of "0 min".

## What's Been Implemented — Iteration 15 (Feb 2026): Tournament Live Match + Polish

### Today's Match Hero (Player Dashboard Overview)
- New `TodaysMatchHero` component (`/app/src/components/player/TodaysMatchHero.jsx`) auto-mounts at top of Overview tab when any tournament match is scheduled for TODAY in the current segment. Deep-links to `/track` with a full prefill payload including opponent name, tournament, round token → label mapping, date, circuit (mapped from AITA grade), age-group (mapped from segment), and normalized segment.

### Historical Tournament Filter (Tournaments Tab)
- New `TournamentHistoryFilter` sub-component with All / This year / Last 12 months / Custom range chips plus year facets (last 3 years) and month facets (last 12 months). Custom range uses local-date `<input type="date">`. Header shows filtered/total count.
- `filter-*` test IDs across the board; empty state via `tournaments-empty-filtered`.

### Tournament Mock Layer
- New `/app/src/api/tournamentsMock.js` seeds 5 tournaments spanning today (Deccan Open, QF today), last month, earlier this year, last year, and 2 years back. All Boys U-18 Singles so segment matches align.
- Wired via `hasSupabaseConfig ? supabaseApi.* : tournamentsMock.*` in `/app/src/api/index.js` for `getMyEntries`, `getEventMatches`, `getDrawEntries`.

### Taxonomy Unification
- `mockRankingHistory.js` CIRCUITS aligned to `normalizeEventSegment()` shape: `{Boys, U-14|U-16|U-18}` (was `{U16, Singles}` — mismatched everywhere).
- `TrackerPage.jsx` new `ROUND_TOKEN_TO_LABEL` map + `normalizeRoundPrefill()` so 'QF' → 'Quarterfinal' when the hero prefills the Round select.
- Locked in with node verification: `normalizeEventSegment('Boys Singles', 'U18')` → `{Boys, U-18}` matches `buildCircuits()`.

### Screen Wake Lock (P0 Spark)
- New `/app/src/hooks/useWakeLock.js`. Hoisted to TrackerPage level, keyed on `matchStarted && !matchOver`. Testing agent verified 1 request per match (was 16 pre-hoist).

### Instagram Story 1080×1920 (P0 Spark)
- New `/app/src/lib/highlightReelStory.js` — draws dark editorial navy 9:16 canvas with brand strip, winner headline, giant score, streak stat boxes, AI recap block (padded 30px from court border), optional COACH WHISPERED tips section as filler when recap is short. Ellipsis suppressed after terminal punctuation.
- New `data-testid="highlight-story-btn"` in `HighlightReelCard` — uses Web Share files when available, downloads PNG otherwise.

### Serve Placement Suggest (P0 Spark)
- `/api/advisor/tip` system prompt now requires one of WIDE / T / BODY when player is serving, using the court-side (deuce/ad) already passed in game_state. Verified 7/7 backend pytest.

### Cross-cutting Polish
- New `/app/src/lib/dates.js` (todayLocalIso, toLocalIso) — replaces all `new Date().toISOString().slice(0,10)` calls that broke around midnight in non-UTC timezones.
- `useMatchTracker` no longer defaults `selfName` to a hardcoded stranger's name — backfills from `user.displayName || fullName || name || email prefix`.
- Overview "Matches this month" and "Upcoming tournaments" stat cards now include tournament schedule matches, not just self-logged sessions.
- Setup form: new `data-testid` on selfName / oppName / tournament / date / round / circuit / age-group for E2E testability.
- Tournament rows: `data-testid="tournament-entry-<id>"`.
- Custom range date inputs: explicit `text-foreground` for contrast.

### Testing (Iteration 13 → 15)
- iteration_13: 100% pytest, TodaysMatchHero + Tournaments filter blocked by empty mock → seed added
- iteration_14: RCA identified taxonomy mismatch + round index vs draw-size bug → fixed
- iteration_15: 100% pytest (7/7), all 5 requested features verified green end-to-end. LOW polish items now shipped in this same iteration.

## 📋 Roadmap
See **`/app/memory/ROADMAP.md`** for the full prioritised backlog (56+ items across P0–P6, from unblock-with-a-key items to distant wishlist ideas). This section used to duplicate that list — now it's the single source of truth.

**Immediate P0 (unblock with credentials):**
- Activate Resend Weekly Digest — needs `RESEND_API_KEY` + `SENDER_EMAIL`
- Real Supabase backend — needs Supabase project
- Emergent-Auth / Google OAuth — follow playbook

## Environment
- Frontend: `npm run dev` on port 3000 (supervised)
- Backend: FastAPI on port 8001 (supervised)
- Preview URL: https://0e360100-eae9-4867-811b-c1ce9b3f6a38.preview.emergentagent.com
- Test credentials in `/app/memory/test_credentials.md`
- Full roadmap in `/app/memory/ROADMAP.md`
