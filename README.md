# Match Tracker Pro — React + Vite

A full React rebuild of the Match Tracker Pro HTML app: point-by-point tennis
match tracking with live scoring, 16 shot categories, break points, weather
lookup, and full PDF reports — with a **login page**, **real permanent match
storage** (Supabase), and **Detail/Compare** pages so every match you log is
saved forever and reviewable any time.

## Opening this in VS Code

1. Unzip this folder.
2. In VS Code: **File → Open Folder...** and select the unzipped
   `tennis-tracker-react` folder.
3. Open a terminal in VS Code (**Terminal → New Terminal**) and run:
   ```
   npm install
   npm run dev
   ```
4. Vite will print a local URL (usually `http://localhost:5173`) — open it in
   your browser.

That's it for a first run — no build step needed for local development. Hot
reload is on by default; edit any file and the browser updates instantly.
**Without any further setup, the app runs against a local mock backend** (see
below) so you can try everything immediately. For real permanent storage, see
"Real persistence with Supabase" further down — takes about 5 minutes.

## Logging in

**Mock mode (default, no setup):** two demo accounts are seeded
automatically the first time the app loads, and the login page has clickable
rows that autofill them for you:

| Role   | Email                     | Password   |
|--------|---------------------------|------------|
| Coach  | coach@matchtracker.app    | coach123   |
| Parent | parent@matchtracker.app   | parent123  |

**Supabase mode:** you create your own real login(s) once in the Supabase
dashboard — see the setup steps below.

## What's in the project

```
src/
  main.jsx              entry point
  App.jsx                routes: /login, / (tracker), /history, /history/:id, /compare
  index.css               the app's full dark-navy theme

  lib/
    engine.js            pure scoring engine (sets/games/tiebreaks/MTB-10 decider/practice mode)
    analytics.js         all derived stats (break points, serve/return, shot categories, rally, errors)
    constants.js         shot categories, format presets, coaching-advice map
    wizardLogic.js       point-entry wizard's pure helper logic
    weather.js           geolocation + Open-Meteo weather lookup
    storage.js           per-user localStorage autosave (the in-progress session, not history)
    pdfReport.js         full jsPDF report generation (same sections as the original)
    format.js            shared point-description text
    supabaseClient.js    Supabase client, configured via .env

  api/
    index.js             picks mockApi or supabaseApi automatically (see below)
    mockApi.js           local no-setup fallback (localStorage)
    supabaseApi.js       real Postgres-backed implementation

  context/
    AuthContext.jsx      current-user state, wraps api/index.js

  hooks/
    useMatchTracker.js   the main state hook: points array, header fields,
                          autosave, and every mutating action

  components/
    ProtectedRoute.jsx   redirects to /login if not authenticated
    TopNav.jsx           nav bar + logout, shown on protected pages
    Header.jsx           name/tournament/date/surface/weather/format fields
    Scorebar.jsx         live score display
    Wizard.jsx           the point-entry flow (server -> outcome -> shot -> etc.)
    StatsPanel.jsx        match totals, shot-stats chart, serve/return tables
    PointLog.jsx          scrollable point-by-point log
    ActionButtons.jsx     Generate PDF / Copy summary / Reset match (also saves to history)

  pages/
    LoginPage.jsx
    TrackerPage.jsx        composes everything above
    MatchHistoryPage.jsx   lists every saved match, links to detail view
    MatchDetailPage.jsx    full reconstructed stats for one saved match, + PDF re-download
    ComparePage.jsx         select 2+ saved matches, see stats side by side

supabase/
  schema.sql              run once in the Supabase SQL Editor to create the matches table
```

## Real persistence with Supabase (recommended)

By default (no setup) the app uses a **mock backend** — data lives only in
your browser's local storage. To get **real, permanent, cross-device**
storage — matches you can keep adding to forever and pull up any time — wire
up a free Supabase project. Takes about 5 minutes, no server code required.

1. **Create a project**: go to https://supabase.com, sign up, "New Project"
   (pick any name/region, set a database password — you won't need it day to
   day).

2. **Create the matches table**: in your new project, open **SQL Editor ->
   New query**, paste in the contents of `supabase/schema.sql` from this
   project, and run it. This creates the `matches` table with Row Level
   Security so each login only ever sees their own matches.

3. **Get your API keys**: **Project Settings -> API**. You need the
   **Project URL** and the **anon/public key**.

4. **Configure the app**: copy `.env.example` to `.env` in this project's
   root folder, and fill in:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```
   Restart `npm run dev` after saving — the app auto-detects this and
   switches from the mock API to real Supabase calls (see `src/api/index.js`;
   nothing else in the app needed to change, since `mockApi.js` and
   `supabaseApi.js` share the exact same function signatures).

5. **Create your login(s)**: Supabase Authentication doesn't come with the
   demo coach/parent accounts — create real ones once: **Authentication ->
   Users -> Add user**, enter an email + password. Optionally set a display
   name by adding this to "User Metadata" (raw JSON) when creating the user:
   ```json
   { "name": "Coach Ramesh", "role": "coach" }
   ```
   That's what shows up in the top-right of the app instead of the email.

That's it — every match you generate a PDF for now gets saved permanently to
your own Postgres database, viewable any time from **Match History**, and
comparable on the **Compare** page.

## Viewing and comparing saved matches

- **Match History** (`/history`) lists every saved match/practice session.
  Tap any row to open its full detail view — the exact same stats/charts/log
  you'd see live, reconstructed from the stored point-by-point data — plus a
  button to re-download that match's PDF report any time.
- **Compare** (`/compare`) lets you tick two or more saved matches and see
  key stats side by side (score, W/FE, UE, ratio, serve/return numbers,
  break points) so you can track trends over time.

## Mock APIs — how they work, and how to replace them later

Everything backend-shaped lives in **`src/api/`**:

- `mockApi.js` — the local, no-setup fallback described above
- `supabaseApi.js` — the real Postgres-backed implementation
- `index.js` — picks whichever one is configured (see step 4 above) and
  re-exports it; every component imports from `'../api'`, never directly
  from `mockApi.js` or `supabaseApi.js`

Both implement the same functions: `login`, `logout`, `getSession`,
`listMatches`, `saveMatch`, `getMatch`, `deleteMatch`. If you ever want a
different backend entirely (your own Node/Express API, Firebase, etc.), add
a third file with the same function signatures and point `index.js` at it —
nothing in `components/`, `pages/`, or `hooks/` needs to change.

**The mock backend is not secure** — passwords are compared in plaintext and
its "token" is just a base64 blob. It's fine for local development; once
Supabase is configured you're using real, properly-hashed auth.

## Building for production

```
npm run build
```
Outputs a static `dist/` folder (plain HTML/CSS/JS) you can host anywhere —
Netlify, Vercel, GitHub Pages, S3, etc. `npm run preview` serves that build
locally to sanity-check it before deploying.

## Notes on fidelity to the original HTML app

Every piece of scoring logic (sets/games/tiebreaks, the Match Tiebreak-10
decider, Pro-set/Short Sets, practice mode, break points, all 16 shot
categories, the full PDF report layout) was ported directly from the
original single-file app — same algorithms, same section-by-section PDF
output. I validated this port by bundling the engine/analytics modules and
running the same match-simulation tests I used to verify the original
(6-4, 4-6, [10-7] Match Tiebreak scenarios, break-point detection, etc.) —
results matched exactly. I could not run `npm install`/`vite build` myself in
this environment (no internet access in my sandbox), so the very first
`npm install` + `npm run dev` on your machine is the first time this exact
dependency set has actually been resolved and started — if anything comes up
there, send me the error and I'll fix it.
