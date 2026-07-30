# PRD — Features to Port from ACE Tracker into Tennis Tracker

**Status:** Draft for review
**Prepared:** 2026-07-30
**Source app reviewed:** ACE Tracker (`C:\ACETRACKING`, FastAPI + MongoDB + CRA, running locally at `http://localhost:3001` / API on `:8000`)
**Target app:** Tennis Tracker (this repo, Vite + React + Supabase/Postgres)

## 0. Method & Confidence

This document lists functionality that exists and works in ACE Tracker today but does **not** exist in Tennis Tracker today, based on:
1. A full read of ACE Tracker's backend (`server.py`, every file in `backend/routers/`, `insights.py`, `scheduler.py`, `report_charts.py`, `storage_client.py`) and frontend (every page in `frontend/src/pages/`, the shared components, `lib/`, `context/`, `design_guidelines.json`).
2. Direct verification against this repo's actual code for every claim below — not assumption. Where I checked and found a comparable (but different) feature already in Tennis Tracker, it's called out explicitly in §3 rather than silently omitted, so this doesn't read as "Tennis Tracker has nothing."

Note: `C:\ACETRACKING\docs\PRD.md` already contains a broader "merge the two products into a 360° platform" vision document (v2.0). This PRD is narrower and more actionable — it's a straight feature-gap/port list, not a product vision — and it corrects several gaps found in that document's own feature inventory (§9 below) rather than repeating them.

## 1. Executive Summary

ACE Tracker has **11 capabilities** that are genuinely new relative to Tennis Tracker — either entirely missing here, or present in a materially weaker form. Grouped by theme:

| # | Capability | Tennis Tracker today |
|---|---|---|
| 1 | Nutrition logging | Doesn't exist |
| 2 | Coach/player/parent messaging | Doesn't exist |
| 3 | Push notifications + live (SSE) notification stream | Polling only, 60s interval, no push |
| 4 | Streak gamification (current/best streak, grace days, freeze days) | Doesn't exist |
| 5 | Proactive email: daily log reminder + weekly coach digest (PDF attached) | Doesn't exist |
| 6 | Player-vs-player Compare + Saved Compare Views | Only same-player match-vs-match compare exists |
| 7 | Coach roster leaderboard (rank by streak/serve/drill-min/aces/wins) | Different tool exists (skill-gap roster), not a ranked leaderboard |
| 8 | Retroactive point-by-point entry on an already-saved match | Only live, in-the-moment point tracking exists |
| 9 | Video attached to a training/drill log | Doesn't exist (a separate, unrelated "Video Analysis Beta" stub exists — see §3) |
| 10 | Tournament "email a PDF snippet" sharing | Doesn't exist |
| 11 | Self-service "find my ranking on AITA" import UI | Rankings sync exists but is admin/scheduled-only, no player-facing import flow |

Each is detailed in §2. §3 documents where Tennis Tracker already has an equal-or-stronger answer to something ACE Tracker also does, so effort isn't wasted rebuilding it.

## 2. New Capabilities — Detailed

### 2.1 Nutrition Logging
**What ACE Tracker does:** Players log meals (breakfast/lunch/dinner/snack/pre-match/post-match) with calories, protein/carbs/fat grams, hydration (ml), and notes (`backend/routers/nutrition.py`, simple CRUD). A "Today's targets" card on the Nutrition page shows three progress bars (Calories / Water / Protein) against per-user goals set in Preferences (`kcal_goal`, `water_goal_ml`, `protein_goal_g`), with a "hit" badge at 100%. The coach PDF report includes nutrition-adherence donut rings (`report_charts.nutrition_ring_png`).

**Why it matters:** It's one of the PRD's own launch goals for the merged product (`C:\ACETRACKING\docs\PRD.md` §5, §6) and closes real ground — Tennis Tracker has zero nutrition capability today.

**Port scope:**
- New Supabase table `nutrition_logs` (user_id, log_date, meal_type, food_items text, calories, protein_g, carbs_g, fats_g, hydration_ml, notes) + RLS matching the existing `matches` table's ownership pattern.
- New Preferences fields on the profile (`kcal_goal`, `water_goal_ml`, `protein_goal_g`) — `ProfilePage.jsx` already has a preferences section to extend.
- New `NutritionPage.jsx` (log form + progress-bar goal card + history list), added to `App.jsx` routes and `NavDrawer.jsx`.
- Nutrition summary numbers folded into `DashboardPage.jsx`'s existing stats grid and into the coach `report.py`-equivalent PDF, if/when that gets built (see §2.5).

### 2.2 Messaging (Coach / Player / Parent threads)
**What ACE Tracker does:** One thread per player (`backend/routers/messages.py`); anyone with a `coach_of`/`parent_of` link to that player, or the player themself, can post/read. `Messages.jsx` is a two-pane thread list + chat bubble UI, capped at 2000 chars/message, nav-gated to coach/parent roles.

**Why it matters:** Direct communication between a coach and a player currently only happens outside the app. This is a genuinely missing collaboration primitive.

**Port scope:**
- New Supabase tables: `message_threads` (one per player) and `messages` (thread_id, sender_id, body, created_at), RLS scoped through the existing `links`-equivalent delegation model (this repo already has coach↔player and parent-analog relationships via the segment/role system — reuse that authorization check rather than inventing a new one).
- New `MessagesPage.jsx`, added to routes + `NavDrawer.jsx` (coach/player roles; extend to organizer only if a parallel need emerges — no parent role exists in this app today, so ACE Tracker's 3-way thread collapses to a 2-way one here).
- Real-time: either Supabase Realtime subscriptions (this repo currently has none anywhere — see §2.3) or simple polling matching the existing `useNotifications` pattern, for v1.

### 2.3 Push Notifications + Live Notification Stream
**What Tennis Tracker has today:** `useNotifications.js` polls `getMyNotifications()`/`getUnreadNotificationCount()` every 60 seconds. No push, no realtime, no service worker — confirmed by direct grep, nothing push/VAPID/service-worker-related exists anywhere in `src/`.

**What ACE Tracker does:** A real Web Push implementation (`backend/routers/push.py`) — generates and persists its own VAPID keypair, `/push/subscribe`/`/unsubscribe`, sends via `pywebpush`, auto-cleans dead subscriptions on 404/410. Plus a Server-Sent-Events stream (`GET /notifications/stream`) that pushes new notifications to the browser within ~3 seconds instead of up to 60s later, with heartbeat keep-alive and a `?token=` fallback for `EventSource`'s header limitation.

**Why it matters:** the polling-only model is the single biggest latency/battery gap between the two apps for anything time-sensitive (a coach message, a ranking change, a streak-at-risk reminder).

**Port scope:**
- Supabase has native Realtime (Postgres change-data-capture over websockets) — this is very likely a better fit than hand-rolling SSE, since the backend here is Supabase, not a FastAPI process that can hold long-lived connections cheaply. Recommend: adopt Supabase Realtime subscriptions on the `notifications` table instead of porting ACE Tracker's SSE mechanism literally.
- Web Push: needs a VAPID keypair + `push_subscriptions` table + a Supabase Edge Function (this repo already has 2 scheduled edge functions to model the pattern on — `sync-aita-rankings`, `sync-aita-calendar`) to actually send pushes, since push delivery has to happen server-side.
- Service worker registration on the frontend (none exists today).

### 2.4 Streak Gamification (current/best streak, grace days, freeze days)
**What ACE Tracker does:** `insights.compute_streak()` derives a logging streak from the union of match/drill/nutrition log dates, with 1 "grace day" (a single missed day silently tolerated without breaking the streak) and user-declared "freeze days" (`backend/routers/streak.py` — e.g. travel dates that count as neither logged nor missed). Surfaced on the Dashboard (flame icon, current/best, grace-available chip) and a Profile card to manage freeze dates.

**Why it matters:** Tennis Tracker has zero gamification today — no streaks, no badges, nothing (confirmed: no hits for streak/badge/achievement/gamif anywhere in `src/`, aside from the generic `Badge` UI pill component which is unrelated). This is a cheap, well-scoped, genuinely motivating feature with a clean existing reference implementation.

**Port scope:**
- The streak computation itself is pure logic over existing dates (matches + whatever training-session logging already exists via `TrainingLogTab.jsx`) — no new data capture needed, just a derived value. Low effort, high payoff.
- New `streak_freezes` table (user_id, freeze_date) for the freeze-day feature.
- A streak cell on `DashboardPage.jsx`'s hero section, next to the existing Form/stats cards.

### 2.5 Proactive Email — Daily Reminder + Weekly Coach Digest
**What ACE Tracker does:** Two scheduled jobs (`backend/scheduler.py`, APScheduler): (a) a per-user, timezone-aware reminder email if nothing's been logged today past the user's configured reminder time; (b) a Monday-morning weekly digest to coaches, summarizing every linked player (wins/losses/sessions/drill-min/streak/tournament results/latest ranking) **with a per-player PDF report attached**.

**Why it matters:** This is a real retention lever that doesn't exist here at all, and directly supports a metric this project would presumably also care about (weekly active logging).

**Port scope:**
- This repo already has the infrastructure pattern for scheduled server-side jobs (Supabase Edge Functions + `pg_cron`, used for AITA sync). Add two more: a reminder-check function and a weekly-digest function, using the same `pg_cron` scheduling approach rather than introducing a second job-runner technology (APScheduler) into a Supabase-native stack.
- Needs an email-sending integration (ACE Tracker uses `EMERGENT_EMAIL_KEY`; this repo would need to pick a provider — Resend/Postmark/SendGrid are the common Supabase-ecosystem choices).
- Depends on §2.4's streak/logging-date data and, for the digest's attached PDF, on a coach report generator (Tennis Tracker doesn't have PDF coach reports yet — ACE Tracker's `report.py` + `report_charts.py`, matplotlib+reportlab, is a solid reference to model but the actual charts would need porting to whatever chart/PDF story fits a Vite/Supabase stack, e.g. server-side chart rendering in the Edge Function or client-triggered generation).

### 2.6 Player-vs-Player Compare + Saved Compare Views
**What Tennis Tracker has today:** `ComparePage.jsx` — select 2+ of *your own* saved matches and compare their stats side by side. Same-player, match-vs-match only.

**What ACE Tracker does:** `Compare.jsx` (backed by `analytics.py`'s `/analytics/compare`) — pick two *different, linked* people and compare their aggregate stats over a time range: mini stat cards, an overlaid skill radar, a grouped bar chart (matches/aces/winners/UE/drill-min), and a "Gap insight" callout naming who leads on which skill and by how much. Plus **Saved Compare Views** (`routers/compare.py`) — bookmark a (player pair, range) combination for one-click reload later.

**Why it matters:** This is a different axis of comparison (person-vs-person, not match-vs-match) that a coach managing a roster, or two training partners, would plausibly want and that nothing in Tennis Tracker currently covers.

**Port scope:**
- Requires exposing "linked players" as a pickable list — this repo already has the coach↔player relationship (used throughout `CoachIntelligenceShell.jsx`'s roster), so the data model piece is mostly there; this is primarily a new UI + a new aggregate-comparison query, not a new relationship model.
- New `saved_compares` table (owner_id, name, player_a_id, player_b_id, range) if the bookmarking feature is included in v1.
- Could live as a second tab on the existing `ComparePage.jsx` ("My Matches" vs. "Players") rather than a new page, to keep nav simple.

### 2.7 Coach Roster Leaderboard
**What Tennis Tracker has today:** `CoachIntelligenceShell.jsx`'s **Roster** and **Skill Groups** views — these segment the roster by *skill gap* (who needs work on what), which is a genuinely more sophisticated coaching tool than a leaderboard. See §3 for why this isn't a straight gap.

**What ACE Tracker does:** `Team.jsx` (`GET /team/leaderboard`) — a simple, competitive, sortable leaderboard: 5 metric tabs (Streak / Serve rating / Drill minutes / Aces / Wins), rank badges (gold/silver/bronze for top 3), one row per linked player.

**Why it matters:** It's a different *mode* — competitive/motivational framing for the roster, versus the existing diagnostic framing. Cheap to add as a sixth tab in `CoachIntelligenceShell.jsx` alongside the existing 5, reusing roster data that's already fetched.

**Port scope:**
- New "Leaderboard" tab in `COACH_TABS` (`CoachIntelligenceShell.jsx`). Mostly a client-side sort/rank over data the roster view already has, plus the new streak metric from §2.4 and existing match/serve-rating data. Low effort.

### 2.8 Retroactive Point-by-Point Entry on a Saved Match
**What Tennis Tracker has today:** `Wizard.jsx` / `QuickMode.jsx` only run during **live** tracking (`TrackerPage.jsx`'s Track tab, while `t.matchStarted` is true). There's no way to add shot-by-shot detail to a match that was logged after the fact (e.g., quickly saved the final score courtside, want to add point detail later from memory or video).

**What ACE Tracker does:** `PointWizard.jsx` — a modal opened from any saved match card on `Performance.jsx` (a "detailed point-by-point" icon), letting a user retroactively add points to a match that already exists, independent of live tracking. Same underlying point schema as live tracking, just a different entry path with its own mini stat bar and named-zone quick-tap buttons.

**Why it matters:** matches logged in a hurry (or by a parent/coach after watching from the stands without live-tracking) currently can never get point-level detail added in Tennis Tracker. This closes that gap.

**Port scope:**
- The heaviest lift here is UI, not data model — `Wizard.jsx`'s point-commit logic and the `match_points`-equivalent schema already exist for live tracking; this is packaging the same commit path into a modal reachable from a saved match's detail view (`MatchDetailPage.jsx` or `MatchHistoryPage.jsx`) instead of requiring `t.matchStarted`.

### 2.9 Video Attached to a Training/Drill Log
**What Tennis Tracker has today:** `TrainingLogTab.jsx` (session date, duration, focus areas, intensity, notes) has no video attachment at all. Separately, there's a `/video-analysis-test` page — but that's a thin, unrelated stub (`videoAnalysisApi.js` just POSTs a file to an external analysis microservice URL and polls a job) for AI technique analysis, not for attaching evidence/footage to a logged session.

**What ACE Tracker does:** `Drills.jsx` — attach a video to a drill log via multipart upload (40MB cap) to object storage; client-side thumbnail + duration are captured from the video file itself (canvas frame grab) *before* upload so the UI has something to show immediately; thumbnails/video are fetched as authenticated blobs and played in-modal.

**Why it matters:** distinct from the AI-analysis stub — this is "attach my practice footage to this session log," a simple, valuable capture feature with no AI dependency.

**Port scope:**
- Needs object storage (Supabase Storage is the natural fit, already in the same platform this app uses for auth/DB).
- New fields on whatever table backs `TrainingLogTab.jsx` (`video_path`, `thumbnail_path`, `duration_sec`) + a Storage bucket with RLS.
- Client-side thumbnail-capture logic (`captureVideoThumbnail()` in ACE Tracker's `lib/video.js`) is a good direct port — it's pure browser Canvas/Video API code, no backend dependency.

### 2.10 Tournament "Email a PDF Snippet" Sharing
**What Tennis Tracker has today:** Confirmed via direct search — no sharing/email capability anywhere in `TournamentDetailPage.jsx` or elsewhere in the tournament pages.

**What ACE Tracker does:** `POST /tournaments/{id}/share` — emails a one-page PDF (KPI table + shot heatmap) to one or more recipients with an optional personal message, defaulting reply-to to the player's configured coach email.

**Why it matters:** low-effort, concrete "show my coach/parent how this tournament went" feature with no dependency on anything else in this list except email delivery (§2.5).

**Port scope:** small — one endpoint/Edge Function (PDF generation + email send) plus a share dialog on `TournamentDetailPage.jsx`. Natural to build alongside §2.5 once email delivery exists, rather than standing up a separate email path just for this.

### 2.11 Self-Service AITA Ranking Import UI
**What Tennis Tracker has today:** AITA ranking sync is a scheduled, server-side, admin-facing job (`supabase/functions/sync-aita-rankings`, `pg_cron`) — this is architecturally *more robust* than ACE Tracker's per-user job runner (see §3), but there is no player-facing "find and import my ranking right now" flow.

**What ACE Tracker does:** `Rankings.jsx`'s Import dialog — "Find on AITA" mode walks category → subcategory → date pickers that live-query the backend's reverse-engineered AITA scrape (`routers/rankings.py`'s `/rankings/aita/categories`, `/dates`, `/discover`), shows a preview of the matched row before confirming, and can create a recurring auto-refresh subscription on confirm. There's also a manual "paste a PDF URL" fallback mode.

**Why it matters:** even with a robust scheduled sync running, a player who just wants to check/import *right now* (e.g. results just published, don't want to wait for the next scheduled run) has no self-service path today.

**Port scope:** this is the smallest, most optional item on this list, since the underlying sync already exists and works on a schedule. If pursued, it's a UI-only addition — a manual "check now" trigger against the existing sync Edge Function, plus (optionally) the discovery-picker UX layered on top — not a new backend capability.

## 3. Already Covered — Don't Rebuild This

To keep this from reading as "Tennis Tracker has nothing," these are places Tennis Tracker's existing implementation is equal to or more sophisticated than ACE Tracker's equivalent, verified directly:

- **Drill/training analytics.** ACE Tracker's Drills are simple CRUD + video. Tennis Tracker's Coach Intelligence system (`SkillGroupsView.jsx`, `DrillLibraryView.jsx`, `CorrelationView.jsx`) computes a **measured drill success rate** by comparing each assigned player's last 4 tracked matches before a drill block against their first 4 after it (`computeDrillCorrelation` in `lib/coachAnalytics.js`) — this is a genuinely more advanced "did this drill actually work" analytic than anything in ACE Tracker, which has no correlation/before-after analysis at all. Only gap: video attachment (§2.9) — port that onto the existing system, don't replace the system.
- **Cross-segment coaching suggestions.** `lib/coachingSuggestions.js` compares a player's own stroke win rates across two independent AITA age-group standings they're active in (e.g. U-14 vs U-16) — ACE Tracker has no concept of segments/age-group standings at all, so has nothing comparable.
- **AITA ranking sync architecture.** Scheduled, server-side, `pg_cron`-driven (see §2.11) — more robust than ACE Tracker's per-job-runner model, which the existing `docs/PRD.md` in ACE Tracker's own repo already recommends standardizing on.
- **Tournament draw/seeding/eligibility.** ACE Tracker has none of this (confirmed — tournament CRUD + rollups only, no draw engine). Tennis Tracker's `drawEngine.js`/`eligibility.js`/`nominationSort.js`/order-of-play system has no ACE Tracker equivalent whatsoever.
- **Match/practice stat comparison (same-player).** `ComparePage.jsx` already does this well; §2.6 is additive (a different axis), not a replacement.

## 4. Suggested Phasing

Ordered by (low effort × high value) first, and by dependency:

1. **Streak gamification (§2.4)** — pure derived logic over existing data, no new external dependency, immediate Dashboard payoff.
2. **Retroactive point entry (§2.8)** and **Coach leaderboard tab (§2.7)** — both mostly UI work reusing existing data/logic paths.
3. **Nutrition logging (§2.1)** and **Player-vs-player Compare (§2.6)** — new but self-contained data domains, no dependency on other items here.
4. **Messaging (§2.2)** — needs a realtime decision (see §2.3) to feel good, so sequence after or alongside push/realtime work.
5. **Push notifications + Realtime (§2.3)** — infrastructural; unlocks better messaging (§2.2) and timelier streak/reminder nudges (§2.5).
6. **Video on training logs (§2.9)** — needs a Supabase Storage bucket decision; independent of everything else, can slot in anytime.
7. **Email: reminders + weekly digest + tournament sharing (§2.5, §2.10)** — bundle together since they share the "pick an email provider" dependency; digest depends on streaks (§2.4) existing first.
8. **Self-service AITA import UI (§2.11)** — optional, smallest, do last or skip.

## 5. Open Questions

- Does this app want a `parent` role at all? ACE Tracker's messaging/nutrition-visibility model assumes one; Tennis Tracker currently only has player/coach/organizer. Several ported features (messaging in particular) need an explicit decision here rather than silently collapsing ACE Tracker's 3-way model into 2 roles.
- Email provider choice for §2.5/§2.10 (Resend/Postmark/SendGrid/other) — not decided by anything in either codebase.
- Supabase Realtime vs. SSE for §2.3 — recommended Realtime above since it's native to the existing stack, but worth confirming against actual latency/cost needs before building.
