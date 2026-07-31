# Handoff: Match Tracker — 2026 redesign (Daylight / Floodlight)

## Overview

A full visual + responsive redesign of **Match Tracker Pro** (`mvmsreddy/match-tracker`, branch `main`) — a React + Vite tennis match-tracking app with point-by-point live scoring, tournament draws, AITA rankings, drills, nutrition and multi-role dashboards.

Two problems drove the work:

1. **Day/night didn't work.** `src/index.css` pins the shipped navy palette at `:root` so it can never flip, while `src/styles/app-tailwind.css`'s `.dark` block is a *different*, near-black theme with a blue primary. Light-mode tokens exist but every legacy class (`.panel`, `.field`, `.drawer-*`, `.role-overlay-*`, `.t-ds-*`, `.t-bmc-*`) hard-codes dark values, so flipping the toggle produces light-on-light text.
2. **No large-screen layout.** `.mt-rail` / `.mt-tabbar` are fully written but gated behind `[data-theme="navy"]`, which `ThemeContext` no longer sets — dead code. On a laptop every user gets the phone drawer and one narrow column. Width philosophies also conflict: `.wrap`/`.panel` cap at 680 px, app pages use `max-w-7xl`, brackets use absolutely-positioned 236 px cards.

The redesign delivers one token layer with three tiers resolved from local sunrise/sunset, a breakpoint system from 360 px to 1440 px+, and a contemporary visual language applied to all 18 routes.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing intended look, layout and behaviour. They are **not production code to copy**.

The task is to **recreate these designs inside the existing codebase** (React 18 + Vite + Tailwind v4 + React Router 6, with `lucide-react` icons, `recharts` charts, Radix primitives and Supabase) using its established patterns. Do not port the HTML. Do not introduce a new UI framework.

Each HTML file is a *gallery*: many phone (390 px) and laptop (1140 px) frames laid out side by side on one canvas, grouped into labelled sections. Frames are static — they show states, not interactions.

## Fidelity

**High-fidelity.** Colours, type sizes/weights/tracking, radii, spacing and copy are final and exact. Recreate them pixel-for-pixel using the codebase's components. Where a frame shows a typographic glyph (see **Assets**), substitute the named `lucide-react` icon.

## Sync status — 31 Jul 2026

**Migration steps 1–3 are already implemented upstream** (tree `42e694ee132e`). Read these files before writing anything; **the shipped code is the source of truth for token values**, and this README's tables now match it:

- `src/styles/app-tailwind.css` — the three tiers exist as `:root, [data-tier="day"]`, `[data-tier="night"], .dark`, `[data-tier="glare"]`, with `--app-accent-ink`, `--app-forced`, `--app-forced-background` and a real `--font-mono` (IBM Plex Mono, now imported).
- `src/context/ThemeContext.jsx` — 4-value `preference` with migration of old `light`/`dark`/`midnight`/`navy` values, `resolveTier` with the 30/45-minute margins, sun fetched only in `auto`, 5-minute interval + `visibilitychange` re-check, `data-tier` written to `<html>`, `.dark` kept in sync, and a legacy `{ theme, toggle }` shim for the six components not yet migrated.
- `src/lib/weather.js` — `getSunTimes()` returns `{ lat, lon, sunrise, sunset, day }` (epoch ms) with a per-calendar-day localStorage cache under `tt-sun-cache`; never throws.
- `src/index.css` — legacy `--bg`/`--accent`/`--text*` are now aliases of `--app-*`, so legacy classes follow the tier; the dead `[data-theme="navy"]` gate is gone.

**Still open — start here:** body copy still resolves to IBM Plex Sans (the approved design is Manrope throughout, so finish that swap in the `@layer utilities` block); `.header` and `.t-modal-lg` keep 680 px caps; `.t-bmc` bracket cards are still absolutely positioned at 236 px; `.mt-rail`/`.mt-tabbar` still default to `display: none` — confirm what gates them by width now; the `components/ui/*` + `components/primitives/*` duplication and the 10 px labels remain. **Steps 5–8 of the migration order are unstarted.**

## Design tokens

The three competing namespaces (`--bg/--accent/--text*` in index.css, `--app-*` in app-tailwind.css, `--color-tt-*` in tracker-tailwind.css) with **one `--app-*` layer**, keyed off `<html data-tier>`. Keep the other two as aliases for one release so nothing breaks mid-migration.

### Tier: Daylight (`data-tier="day"`)

| Role | Value | Notes |
|---|---|---|
| page ground | `#E6E9E4` | tinted, never used on a card |
| frame / section ground | `#F5F4EF` | phone body, laptop panel |
| card | `#FFFFFF` | with `box-shadow: 0 2px 10px -6px rgba(16,25,20,0.25)` |
| ink (foreground) | `#101914` | 11.9:1 on `#F5F4EF` |
| muted foreground | `#4E5A50` | secondary labels — 6.4:1 on page ground, 7.4:1 on card |
| body text on card | `#46524A` | paragraph copy |
| hairline / track | `#EAE9E2` / `#E1E4DD` | dividers, bar tracks |
| border (inputs, outlines) | `#DCDFD8` / `#C9CEC4` | |
| accent (lime) | `#D7F25C` | **fill only**, always with `#101914` text |
| accent ink (text) | `#4E6B10` | lime as *text*; the `#D7F25C` fill and `#7FA31C` graphic fill stay for bars/rings |
| win / self | `#43601A` text on `#E8F4C8` | always paired with a `W` letter |
| loss / opponent / destructive | `#96331E` text on `#F7DDD7` | pill fill `#FDF2EF` |
| forced error / amber | text `#8A5F00` on `#FFF6E4`; graphic fill `#E09A1F` — never amber text on white | |
| hydration / info | fill `#2E7BE8`, text `#1B5FBF`, track `#E3E9F5` | |
| inverted hero card | bg `#101914`, text `#F5F4EF`, muted `rgba(245,244,239,0.62)` | |

### Tier: Floodlight (`data-tier="night"`)

| Role | Value |
|---|---|
| page ground | `#0B0F0D` |
| card | `#141A16`, border `1px solid #26302A` |
| card raised / row hover | `#191F1B`; inset field `#0F1411` |
| foreground | `#F2F5F0` |
| muted foreground | `#7C8A80`; body `#A5B3A8`; strong body `#C4D0C7` |
| accent (lime) | `#C8FF4D` — text-safe on all night surfaces |
| accent glow | `box-shadow: 0 10px 24px -14px rgba(200,255,77,0.75)` on primary buttons only |
| hero gradient | `linear-gradient(150deg, #1B2A14 0%, #141A15 60%, #171D19 100%)`, border `1px solid rgba(200,255,77,0.22)` (gradient is a component style, not a token) |
| win / self | `#C8FF4D` on `rgba(200,255,77,0.16)` |
| loss / opponent | `#F0937F` on `rgba(232,110,86,0.12)`, border `rgba(232,110,86,0.35)` |
| forced / amber | `#F5B547` on `rgba(245,158,11,0.12)`, border `rgba(245,158,11,0.35)` |
| info / hydration | `#3B82F6`; track `#26302A` |
| divider / border / track | `#26302A` (ships as one value — night `--app-border` equals `--app-muted`, `133 12% 15%`) |

### Tier: Glare (`data-tier="glare"`) — manual only

Pure white `#FFFFFF`, ink `#07131C`, muted `#2C4152`, borders **2 px** `#14293D` / `#8DA0AE`, accent fill `#14293D` with white text, win `#1D6128`, loss `#A5250F`, amber `#6E4B00`, accent ink `#3B5210`. No muted greys for meaningful text; 7:1 minimum; chips grow to 60 px. Reachable in **one tap from the scorebar** — it's needed when the sun turns mid-match, not buried in a menu.

### Typography

- Single family: **Manrope** (400/500/600/700/800), already loaded in `app-tailwind.css`.
- **IBM Plex Mono** (400/500/600) is reserved for live scores, set boxes, score summaries, reg numbers and table numerals — never labels.
- Fix the misnomer: `--font-tt-mono` currently resolves to IBM Plex *Sans*. Point `--font-mono` at IBM Plex Mono and use `tabular-nums` wherever digits change live.

| Use | Size / weight / tracking |
|---|---|
| Page title (phone) | 26 px / 800 / −0.038em |
| Page title (laptop) | 26–32 px / 800 / −0.038em |
| Section heading | 20 px / 800 / −0.03em |
| Card title | 15–16 px / 800 / −0.02em |
| Big metric | 34–48 px / 800 / −0.045em |
| Live game score | 46–48 px phone, 34 px laptop bar, 62 px landscape / 800 / −0.05em, mono |
| Body | 14–15 px / 500–600 |
| Secondary / meta | 12.5–13 px / 500–600, muted |
| Micro label | 11.5–12 px / 700 — **12 px floor**, up from today's `text-[10px]` |
| Button label | 14–15 px / 800 |

Fluid display where it must scale: `clamp(22px, 4.4vw, 34px)`; game score `clamp(28px, 7vw, 48px)`.

### Radius, spacing, elevation

- Radius: phone frame `34px`; hero/panel `26–28px`; card `20–24px`; control `14–18px`; chip/tile `20–24px`; pill `999px`; inline chip `12–14px`.
- Spacing scale: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 22 / 26 / 32 / 40.
- Elevation: Daylight uses one shadow step (`0 2px 10px -6px rgba(16,25,20,0.25)`; frames `0 24px 60px -28px rgba(16,25,20,0.45)`). Floodlight uses borders, not shadows, except the lime glow. Glare uses neither.
- Touch targets: wizard outcome tiles **72–92 px** tall; primary actions **54 px**; secondary **46–50 px**; icon buttons **40 px** (44 px minimum hit area); gaps ≥ 8 px so a sweaty thumb can't hit two.

## Theme resolution (implement in `src/context/ThemeContext.jsx`)

Preference becomes `'auto' | 'day' | 'night' | 'glare'` (localStorage key `tt-theme`, migrate old `'light'`/`'dark'`/`'midnight'`/`'navy'` values). Resolved tier is written to `document.documentElement.dataset.tier`; keep the `.dark` class in sync for one release.

```js
const PRE_DAWN = 30, PRE_DUSK = 45;            // minutes of margin

function resolveTier(pref, sun, now = new Date()) {
  if (pref !== 'auto') return pref;
  if (!sun) return matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
  const t = now.getTime();
  const from = sun.sunrise + PRE_DAWN * 60000;
  const to   = sun.sunset  - PRE_DUSK * 60000;
  return t >= from && t < to ? 'day' : 'night';
}

useEffect(() => {
  const apply = () => { document.documentElement.dataset.tier = resolveTier(pref, sun); };
  apply();
  const id = setInterval(apply, 5 * 60 * 1000);          // catch dusk mid-match
  document.addEventListener('visibilitychange', apply);   // and after a screen lock
  return () => { clearInterval(id); document.removeEventListener('visibilitychange', apply); };
}, [pref, sun]);
```

`sun` comes from the Open-Meteo call `src/lib/weather.js` already makes — add `daily=sunrise,sunset`, cache `{ lat, lon, sunrise, sunset, day }` in localStorage, refetch once per calendar day, expose `getSunTimes()`. No location permission → fall back to `prefers-color-scheme`.

Rules: never flip tier mid-interaction — if a wizard step or modal is open, defer to the next idle render. Transition `background-color` and `color` over 240 ms so an automatic dusk switch doesn't read as a crash.

## Breakpoints

| Range | Name | Chrome | Content |
|---|---|---|---|
| ≤ 359 | Compact | Floating bottom bar, 5 items | 1 col, 12 px gutters, tiles 2-up |
| 360–767 | Phone | Floating bottom bar (4 + More sheet) | 1 col, 14–16 px gutters, tiles 3-up |
| 768–1023 | Tablet | 72 px icon rail, no drawer | 2 cols; wizard stays 1 col |
| 1024–1439 | Laptop | Persistent 226 px labelled rail | 2–3 cols; tracker splits wizard / live analysis |
| ≥ 1440 | Wide | Rail + optional right context pane | Content capped 1360 px; extra width to the pane, never to line length |

Orientation rules on top of width: phone **landscape under 500 px tall** drops to the existing `tracker/LandscapeScoreView.jsx` (score + last point only, 62 px score); tablet landscape is treated as Laptop.

Also remove: the 680 px `.wrap`/`.panel` caps, `.root { height: 100dvh; overflow: hidden }` (it lets Android keyboards clip the wizard), and the `[data-theme="navy"]` gates on `.mt-rail`/`.mt-tabbar`.

## Screens / views

All 18 routes from `src/App.jsx`. Frames live in **`Match Tracker App 2026.dc.html`**, sections 00–08.

### 01 · App chrome (`components/AppShell.jsx`, `NavDrawer.jsx`, `nav/MTNavChrome.jsx`)

Collapse the three into one `<AppNav>` fed by the existing `getNavItems(role)`.

- **Phone header** — 8 px padding, brand mark 38 px, title 15 px/800, role subtitle 12.5 px/500 muted, then bell (40 px, 14 px radius, `#EAE9E2` day) and avatar (40 px, 14 px radius, ink fill, initials 13 px/800).
- **Phone bottom bar** — sticky, `#101914` (day) / `#171D19` + `1px #262F28` (night), 26 px radius, 8 px padding, five 46 px items at 18 px radius; active item is a lime pill with icon + label, inactive icon-only at 65 % opacity. Sits above `env(safe-area-inset-bottom)`, with a gradient fade behind it.
- **More sheet** — replaces the slide-in drawer: 26 px card holding a 2-col grid of 18 px tiles (icon 19 px + label 14 px/700, active = lime fill), then an Appearance card (3-state Auto/Day/Night pill group, "Sunset 19:06 · switching to night in 42 min", Glare toggle 46×28 px), then Guide PDF + Log out (destructive tint).
- **Laptop rail** — 226 px, `#F5F4EF`, 24 px radius, brand row 34 px mark + 14.5 px/800 title, items 11 px padding / 16 px radius / 14 px, active = ink fill with `#F5F4EF` text, unread count as a lime pill, user card pinned to the bottom (`margin-top: auto`). Topbar carries page title 20 px/800, the tier pill group and the bell.

### 02 · `/login` (`pages/LoginPage.jsx`)

1140 px split, 32 px radius, min-height 640 px. **Left 48 %** is Floodlight: `#0B0F0D`, radial lime glow `rgba(200,255,77,0.20)`, a court motif from 1 px `rgba(242,245,240,0.09)` rules, brand lockup (52 px mark, 19 px/800 title, "PRO · EST. 2025" 12 px/700 at 0.22em), headline 52 px/800/−0.045em (`Every point. / Every insight. / Elevate your game.` with "Elevate" in `#C8FF4D`), 15.5 px body at `#A5B3A8`, two stats (34 px/800: 12,847 matches tracked this month · 3.2M rally points logged), footer 12.5 px with a lime status dot. **Right** is Daylight `#E6E9E4` holding a 430 px white card at 28 px radius / 32 px padding: title 32 px/800, 14.5 px sub, Sign in / Sign up pill group, 52 px Google button (18 px radius, 1 px `#DCDFD8`), "or with email" rule, two 52 px fields (18 px radius; filled `#F5F4EF` at rest, white with a 2 px ink border on focus), 54 px ink submit, then demo-account rows.

Sign-up mode adds Full name, the five role tiles (Player / Coach / Parent / Nutritionist / Organizer) as a 2-col pill grid, and Confirm password — same fields as today. Below 1024 px the hero collapses to a Floodlight band behind the lockup and the card goes full width with 20 px gutters; inputs stay 16 px to stop iOS zoom. Login keeps this fixed pairing in both tiers.

### 03 · `/` Player dashboard (`pages/DashboardPage.jsx`, `components/DashboardExtras.jsx`)

Order: header (greeting + `AITA 1104782 · Rank 214 · 1 coach` — the role banner folds into this subtitle) → **on-court-today hero** (ink card, lime status dot, 30 px/800 opponent, meta line, 52 px lime "Start tracking" + `H2H 3–1`) → **two metric cards** (12 d streak with a 7-day bar strip and freeze-token chips; 61 % win rate with a 7-bar form sparkline and `11W 7L · 9 practices`) → **weekly goal rings** → **skill radar** → **recent sessions** → bottom bar.

**Goal rings** must match `components/motivation/WeeklyGoalRings.jsx` + `computeWeeklyRings` in `src/lib/motivation.js`: exactly three rings — Matches (primary lime), Practice (`#f59e0b`), Hydration (`#3b82f6`, avg/day) — each with `done / goal` beneath, a "2 of 3" closed-count pill, and "Perfect Week" when all three close. The frames render 86 px rings with a 66 px knockout centre; in code keep the existing SVG stroke-dashoffset ring so the 800 ms animation survives.

**Skill radar** must match `SkillRadarCard.jsx`: 6 axes — Serve, Forehand, Backhand, Volley, Footwork, Mental — on a **0–10** scale, fed by `avgSkillRatings(userId, 5)`, rated per match 1–10 in `MatchSkillRating.jsx`. Keep the recharts `RadarChart`; the frame's CSS hexagon is only a stand-in.

Laptop: 3-column grid, hero spanning all three, three metric cards, then recent sessions (span 2) + weekly digest.

### 04 · `/track` Live track (`pages/TrackerPage.jsx`, `components/Wizard.jsx`, `Scorebar.jsx`)

**Scorebar** — gradient hero (night) / ink card, `Set 2 · you serve` 12 px/800 uppercase, a break-point pill, two player rows (17 px/800 name, lime serving dot with a soft glow, mono set numbers — completed sets muted, live set lime), game score 46–48 px/800 mono, `1:12:04 · ⦿ awake` (surface `useWakeLock` state here), and a one-tap Glare control. Make the bar `position: sticky; top: <header-height>` so it never scrolls away mid-point. Give the serving dot an aria label — it's colour-only today.

**Wizard** — the step chain is **dynamic**, driven by `getActiveStep(pending, trackingMode)`; never label it "step N of 4":

- Expert: serve screen → fault location → rally length → ball in play → wing → shot type → court tap (hit from → dropped at) → optional infraction.
- Standard drops the court tap and infraction; Basic keeps only the serve screen and outcome.

Step titles are the real ones: `1st Serve` / `2nd Serve`, `1st Serve Fault — Where?`, `Rally Length`, `Ball in Play`, `Select Wing`, `<Wing> — Select Shot`, `Unforced Error — Where did it go?`, `Infraction? (Optional)`, and the return branch `<Player> — Return Error`. A breadcrumb shows the path (`Ball In → You: Winner → Forehand`); a `‹ Back` control and right-swipe step back one screen.

Two-column steps put self on the left and opponent on the right, with the server's column highlighted. **Ball in play** = three tiles per column: Winner / Forced error / Unforced error. **Rally length** = a single row of chips 1–7 where 7 renders `7+` (an integer, not a bucket — `PointLog` renders `pt.rally` as a plain number). Serve screen = Ace / Fault / Ball In for the server, Return Winner / Return Error for the receiver, plus a full-width `Let — Replay <1st|2nd> Serve`. Fault and unforced-error locations are `Long | Wide | Net` (`LOCATIONS` in `lib/constants.js`). Infractions are Net Touch / Double Bounce / Foot Fault / Code Violation plus `Skip — No Infraction`.

**Court tap** — the two-tap diagram from `ShotLocationCourt.jsx` with zone names from `lib/courtZones.js`: far/near halves, `Deep L / Deep C / Deep R`, `Mid-Court`, `Ad Box`, `Deuce Box` (via `SHORT_LABEL`), plus out zones `Wide` and `Long`. First tap = hit from, second = dropped at; keep the crosshair marker.

Footer: `↩ Undo last point` (wide) and a `✕ Delete` that expands to Yes/Cancel — never adjacent to an outcome tile.

At ≥ 1024 px, drop the Match / Live / Stats tab switch and use two panes: wizard + court on the left, live totals / shot stats / point log on the right. Keep the tabs below that width. Landscape under 500 px tall → `LandscapeScoreView`.

### 05 · `/history`, `/history/:id`, `/compare`

- **History** — title 26 px/800 + count, three summary cards (Wins inverted to ink + lime), All / Matches / Practice pill group, then rows: 22 px radius white card, 44 px result badge (`W` on `#E8F4C8` / `L` on `#F7DDD7` / `PR` neutral), opponent 14.5 px/700, tournament + round + date 12.5 px muted, mono score right-aligned. Month sub-headers. Swipe a row for PDF / delete.
- **Match detail** — ink hero: outcome pill, `You vs <Opponent>` 28 px/800, meta line, set boxes as 12 px-radius chips (decider highlighted lime), duration + point count, then three action buttons (Download PDF report / Add point detail / Rate your skills). Below: **Match totals** as paired proportional bars (winners-forced, unforced, points won, plus the W/FE : UE ratio row), **Serve & return** as a 2×3 metric grid (1st serve %, aces/DF, BP saved, BP won, service games won, return winners), and **Where the points went** — two `ShotLocationHeatmap` courts (you · hit from / opponent · dropped at) with a Winner / Forced / Unforced legend and the coaching note from `adviceForStroke`.
- **Compare** — My matches / Players pill group; left column has rivalries (W–L split bar, Leading / Even / Trailing, last result) and the selectable match list (selected rows invert to ink with a lime check); right column is the metric table (Result, winners/forced, unforced, ratio, 1st serve %, aces/DF, BP saved, BP won) with better/worse values coloured, closing on an ink **Gap insight** card.

### 06 · Tournaments, draws, order of play

- **`/tournaments`** — organizer actions are `⬆ Upload factsheet PDF` (ink) and `+ Create` (white); players with an incomplete profile get a `#FDF2EF` warning naming the missing fields with an "Update profile →" link. Cards: name 16 px/800, subtitle, pills for surface / tournament code / event count, then location, date range and court count.
- **Draw** — phone: a round pill strip (R32 · R16 · QF · SF · F) then one 22 px-radius card per match — winner row tinted `#E8F4C8` with seed + `✓`, score strip below, `Enter score →` as an ink strip when actionable, byes and `Winner of M12` placeholders at 70 % opacity. Laptop: three columns with sticky round labels in a horizontal scroll region. **Replace the absolutely-positioned 236 px `.t-bmc-*` cards with a min-width grid.**
- **Order of play** — breadcrumb, Courts input + `⚡ Auto-schedule` + `⬇ PDF`, a stats line (`28 matches · 22 scheduled · ⚠ 2 conflicts`), Table / Board toggle, and All / Unscheduled / Scheduled / Complete filters. Table columns are the real ones: Event/Round, Matchup, Day, Ct, #, Status (Complete / Pending), with conflict rows tinted amber and a `⚠` glyph. Board view = one 224 px column per court, cards in match order — that's the view that survives the phone breakpoint; the editable Day/Ct/# table is organizer-on-laptop only.
- **`/aita-rankings`** — filter row (category / subcategory / date / search), result count, then rows in an 8 px-padded card: rank chip (podium 1–3 amber/grey), name 13.5 px/800, mono reg no., state, singles, total in accent ink. **Your own row is pinned and inverted to ink with a "You" badge.** Below 768 px each row becomes a card with a 3-up breakdown (singles / doubles / 25 % best doubles). Organizer sees `⟳ Sync now`.
- **`/aita-calendar`** — 2×2 filter grid (age group / city / grade / search), All dates / This month / Next 3 months preset group, "Last synced 22 min ago", then cards with name, age-group + grade pills, an entry-deadline urgency pill (`Closes in 2d` red ≤3 d, lime ≤7 d), venue and start date. Cards run 1-up phone / 2-up tablet / 3-up laptop; tapping opens the factsheet (modal on phone, full page at `/aita-calendar/:id`).

### 07 · Drills, nutrition, messages, profile

- **`/drills`** — ink week card (310 min, 5 sessions, 2 high intensity, 7-day intensity strip), 52 px lime `+ Log a drill`, then entries with a 44 px **typographic type token** (`FH`, `SV`, `FW` — replaces today's emoji), intensity pill (High `#FDF2EF` / Medium `#FFF6E4` / Low `#E8F4C8`), `▷ Video` link, date + duration, notes.
- **`/nutrition`** — compliance card with day-type context and three goal bars (calories / carbs / protein, `✓` when hit), then macro donut (`conic-gradient`, kcal in the knockout centre) + water tracker (4×2 glass grid, `+ 250 ml`), then the **peri-match fuel timer** — minutes-until-match input + `▷ Start`, tickable checkpoints, `End session` (content from `PeriMatchFuelTimer` in `NutritionCoachingPanel.jsx`; do not hard-code checkpoint copy) — then `+ Log a meal` and the meal list.
- **`/messages`** — 236 px thread list (38 px initials tile, name, last-message preview, unread lime count) + conversation pane: incoming bubbles white at `20px 20px 20px 6px`, outgoing ink at `20px 20px 6px 20px`, 11.5 px timestamps, 48 px composer + lime Send. Below 768 px the list becomes a horizontal thread strip above the conversation.
- **`/profile`** — 68 px avatar tile, name 22 px/800, `AITA · state · age group`, role pill, three stat cards (Rank / Points / Entries), then grouped field blocks — **Identity** (Display name*, Phone, Home court), **Player details** (AITA reg no., Current ranking, Date of birth, State, Plays, Backhand, Club/Academy), **Equipment** (collapsed summary; racquet brand/name/year, string brand/name/tension, shoes, bag, grip), plus Nationality / Country / City / Region / Postal code, Gender, Height, Bio and Reminder time. Fields are 48 px, 16 px radius, filled. Then the reminder toggle and a 54 px Save.

### 08 · Role homes

- **Coach** (`/my-players` → `CoachIntelligencePage` + `CoachIntelligenceShell`) — title + subtitle, "Analytics fresh" indicator, `Log a session`, the six-tab pill group (Skill groups / Roster / Drill library / Correlation / Log session / Leaderboard), a session/roster count, then skill-group cards (name, count, criterion, member avatars, action) and a correlation card. **Correlation must follow `coach/CorrelationView.jsx` + `computeDrillCorrelation`:** verdict (Working ≥ 60 % / Modest gain ≥ 40 % / Not working), `<drill> → <skill>`, "N of M assigned players with data · F×/week · W-week block · started <date>", success rate, and two bars — last 4 matches before vs first 4 after.
- **Parent** (`ParentDashboardPage.jsx`) — ink "on court today" card for the child, then linked-player rows (46 px initials tile, name, meta, chevron) that hand off to `PlayerDashboardPage` in viewer mode, plus a read-only-access explainer.
- **Organizer** — ink live-event card with three counts (scores pending / draws to seed / withdrawals) and a lime "Open order of play", then per-event cards with status pills.
- **Nutritionist** (`NutritionistDashboardPage.jsx`) — athlete rows with compliance % and a red/green initials tile, an "Adjust match-day plan" action, and the day-type macro grid (Match / Training / Rest with kcal · carbs · protein).

## Contrast law (non-negotiable)

Every colour carries a **fill** value and a separate **ink** value; they are never interchanged.

- Lime, amber and blue are **fills**. As text they darken: lime → `#4E6B10`, amber → `#8A5F00`, blue → `#1B5FBF`.
- **Never white text on a lime fill** — lime fills always take `#101914`. **Never near-black text on a dark surface** — Floodlight text is `#F2F5F0` / `#C4D0C7` / `#A5B3A8`, and the lightest muted allowed is `#7C8A80`.
- Muted text is `#4E5A50` in Daylight (not a mid-grey) and `#7C8A80` in Floodlight. Below 13 px, use the foreground colour, not muted.
- Minimums: **4.5:1** for body and label text, **3:1** for display text ≥ 24 px (or ≥ 18.66 px at weight 700+), **7:1** everywhere in Glare.
- Verify by measurement, not by eye: every pair in the frames was audited programmatically and passes.

## Interactions & behaviour

- **Navigation** — bottom bar ≤ 767 px (first four items + More sheet), icon rail 768–1023, labelled rail ≥ 1024. Active state = lime pill (phone) / ink fill (rail). Sheet and modals close on Escape and on backdrop tap.
- **Tier switching** — 3-state Auto/Day/Night group plus a Glare toggle; 240 ms colour transition; deferred while a wizard step or modal is open; re-evaluated every 5 min and on `visibilitychange`.
- **Wizard** — every tap advances one step and pushes the previous `pending` onto a history stack; `‹ Back` and a >60 px right-swipe pop it; when history is empty, Back falls through to `onUndo()`. Ace, double fault and infraction chips commit immediately; everything else commits when `getActiveStep` returns `null`. Scroll the step card into view on change (use a scroll method other than `scrollIntoView` if the host forbids it).
- **Destructive actions** — Delete match expands in place to `Yes, Delete` / `Cancel`; row deletes confirm first.
- **Loading / empty / error** — skeletons for stat grids and list rows (`primitives/skeleton.jsx`); empty states are a dashed 2 px card with an icon, one sentence and the action that fixes it; errors render inline in the destructive tint, never as an alert.
- **Colour is never the only signal** — W/L letters, the serving dot's aria label, `⚠` on conflicts, `✓` on met goals, verdict words on correlation.
- **Screen & battery** — keep `useWakeLock` and surface its state in the scorebar; Floodlight is the battery-cheap default after dusk.

## State management

No new state model — the redesign is presentational. Keep `AuthContext`, `SegmentContext`, `useMatchTracker`, `useTournamentActivity`, `useOrientation`, `useWakeLock`, `useNotifications` and the `src/api` façade (`mockApi` / `supabaseApi`) exactly as they are. Two additions only:

1. `ThemeContext` gains `preference` (`'auto' | 'day' | 'night' | 'glare'`), a resolved `tier`, and `sun` from `getSunTimes()`.
2. `lib/weather.js` gains a per-calendar-day sunrise/sunset cache.

Both of these already exist upstream — consume `useTheme()`'s `{ preference, setPreference, tier, sun }` rather than the legacy `{ theme, toggle }` shim, and migrate the six components still on the shim (TopNav, AppShell, MTNavChrome, TrackerPage, MatchDetailPage, VideoAnalysisTestPage).

Do not change the point/rally data model: `rally` stays an integer, outcomes stay `Winner | ForcedError | UnforcedError | DoubleFault`, locations stay `Long | Wide | Net`, and zone names stay exactly as `courtZones.js` defines them.

## Assets

- **Brand mark** — `logo.svg` in this bundle (from `scripts-tmp/logo.svg`): a lime `#C6E23D` ball with two navy `#14293D` seam curves. Use it at 34–52 px. `logo.png` (from `assets/logo.png`) is the raster/store version. The frames' earlier lime "T" square was a placeholder and is gone.
- **Icons** — every glyph in the HTML frames is a **typographic stand-in**. Ship the `lucide-react` icons the code already imports, at `w-4`/`w-5` with `strokeWidth` 2–2.5:

  `▤` LayoutDashboard · `◈` Activity · `◷` History · `♛` Trophy · `⇄` GitCompare · `◇` Dumbbell · `◉` Apple / Droplet · `✉` MessageCircle · `▦` Calendar · `★` Medal · `▷` Video / Play · `◔` Bell · `↩` Undo2 · `⇥` LogOut · `⇩` FileDown · `⌕` Search · `≡` Menu · `✕` X · `▲` Flame · `✦` Sparkles · `⚡` Zap · `🗑` Trash2 · `›` ChevronRight · `⦿` wake-lock indicator (use `MonitorSmartphone` or similar).

- **Fonts** — Manrope + IBM Plex Sans are already imported in `app-tailwind.css`; add **IBM Plex Mono** and repoint the mono token.
- **Charts** — keep `recharts` (radar, momentum) rather than reimplementing the frames' CSS approximations.

## Migration order

1. ~~`styles/app-tailwind.css` — rewrite token blocks as `[data-tier="day"|"night"|"glare"]`; add `--app-accent-ink` and `--app-forced`; point `--font-mono` at IBM Plex Mono.~~ **Done upstream.**
2. ~~`context/ThemeContext.jsx` — 4-value preference, write `data-tier`, keep `.dark` in sync for one release.~~ **Done upstream.**
3. ~~`lib/weather.js` — `daily=sunrise,sunset`, per-day cache, `getSunTimes()`.~~ **Done upstream.**
4. `index.css` — **partly done** (aliases in place, navy gate removed). Remaining: finish the Manrope body switch, remove the 680 px caps on `.header`/`.t-modal-lg`, drop `.root { overflow: hidden }`, and confirm the width gating for `.mt-rail`/`.mt-tabbar`.
5. `AppShell` + `NavDrawer` + `nav/MTNavChrome` → one `<AppNav>` with the three width presentations.
6. Merge the duplicated `components/ui/*` and `components/primitives/*` into one set; `tt-*` classes become plain token classes; bump 10 px labels to 12 px and table cells to 13 px.
7. `TrackerPage` + `Wizard` + `ChipButton` — tile sizes, the two-pane layout at ≥ 1024, landscape switch.
8. Sweep the remaining legacy classes (`.panel .field .drawer-* .role-overlay-* .history-empty .t-ds-* .t-bmc-*`) onto tokens — these are what break light mode today; convert the bracket to a min-width grid.

### Acceptance checks

- Every screen renders in all three tiers with no hard-coded hex left in `src/` outside the token blocks.
- 360 / 390 / 768 / 834 / 1024 / 1440 px wide: no horizontal scroll, no clipped headings (today the dashboard's "MY STATS" clips).
- Text ≥ 4.5:1 in Day/Night, ≥ 7:1 in Glare; every status carries a non-colour cue.
- Auto tier flips within 5 minutes of local sunset without interrupting an open wizard step.
- Wizard step chain matches `getActiveStep` for all three tracking modes; recorded point entries are byte-identical to today's.

## Files in this bundle

| File | What it is |
|---|---|
| `Match Tracker App 2026.dc.html` | **The design. Single source of truth.** All 18 routes, sections 00–08, phone + laptop frames in both tiers. Every text/background pair is contrast-audited. |
| `Responsive Theming Spec.dc.html` | Audit of the current code, full token tables with contrast ratios, breakpoint table, component specs, migration checklist. |
| `github.md` | Source association (repo, branch, sync receipt) and a screen → repo-file map. |
| `logo.svg`, `logo.png` | Brand mark, copied from the repo. |
| `support.js` | Runtime for the `.dc.html` files. Keep it beside them to open them in a browser; **not** for production. |

Open any `.dc.html` directly in a browser with `support.js` in the same folder. They are pan/zoom canvases — scroll to move, pinch or ⌘-scroll to zoom.
