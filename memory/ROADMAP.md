# Tennis Tracker Pro — Roadmap & Future Improvements

_Consolidated backlog as of Feb 2026. Every deferred item, next-action pick, and enhancement idea from every session gathered in one place. Ordered by priority within each phase; check the "blocked by" column before starting._

---

## 🔴 P0 — External Credentials Blocking (unblock in one call)

Everything in this bucket is fully coded but waiting on user-supplied credentials or config.

| # | Item | What's needed | Notes |
|---|------|---------------|-------|
| 1 | **Activate Weekly Digest Emails** | `RESEND_API_KEY` + `SENDER_EMAIL` (verified domain) in `/app/backend/.env` | Backend endpoint + UI fully wired. Currently shows "Coming soon" pill on Profile. `sudo supervisorctl restart backend` to activate. |
| 2 | **Monday Auto-Send Cron** | After #1: add a supervisor-scheduled Python worker that hits `/api/digest/send` for every opted-in player at 8am local Monday | Currently digest is manual-only via "Send preview now" |
| 3 | **Real Supabase Backend** | Real Supabase project URL + anon key in `/app/.env` (or `frontend/.env`) | Every user is mock/localStorage today — data doesn't persist across devices. Supabase schema already exists in the codebase. |
| 4 | **Emergent-Auth / Google OAuth** | Follow Emergent Google Auth playbook in `integration_playbook_expert_v2` | Login page already has a `Continue with Google` slot; `loginWithGoogle` is null in mock mode. |

---

## 🟠 P1 — Killer Differentiators (already scaffolded, small effort to complete)

Big user-facing wins that fit the existing architecture.

| # | Item | Rationale | Effort | Blocked by |
|---|------|-----------|--------|------------|
| 5 | **Real Nutritionist ↔ Player Linking** | Player-initiated invite by email so the nutritionist roster fills naturally instead of auto-seeding u_player | S | — |
| 6 | **Tournament Nutrition Timeline** | Auto-generate D-7 → D+1 meal plan when player enters a tournament, drawing from Meal Templates library | M | Meal templates ✓ + tournament schedule hook |
| 7 | **Photo Food Journal** | Snap a plate → LLM (nano-banana / Claude vision) estimates macros → pre-fills log form | M | Emergent LLM Key ✓ + camera permission UX |
| 8 | **Menstrual Cycle Sync (opt-in)** | Cycle-phase toggle nudges day-type macros (extra iron in luteal, more carbs pre-ovulation) — real edge for female athletes | M | Female-athlete privacy discussion |
| 9 | **Advisor Voice Mode** | Read the AI tactical tip aloud via ElevenLabs / OpenAI TTS so the player can hear it courtside | S | ElevenLabs or OpenAI TTS key |
| 10 | **Rival Rematch Trigger** | Push notif when a lost H2H opponent enters your tournament bracket, with a personalised "prep drill" playlist | S | Push notif VAPID + tournament data ✓ |
| 11 | **Shareable Badge Cards → Web Share** | Add Twitter/WhatsApp/LinkedIn share buttons alongside the current Save + Native Share | S | — |
| 12 | **Player Ranking Data — Rich Mock** | Extend mockRankingHistory to reflect real AITA circuits + doubles standings so demo mode looks fuller | S | — |

---

## 🟡 P2 — Depth & Polish

Meaningful improvements that need dedicated implementation slots.

### Motivation & Gamification
| # | Item | Notes |
|---|------|-------|
| 13 | **Team / Rival leaderboard** | Compare against a shortlist of opponents you've faced 2+ times |
| 14 | **Season Playbook** | Long-form monthly recap: your matches, best skill, biggest jump, top opponent conquered |
| 15 | **Achievement rarity tiers** | Bronze/Silver/Gold badges with unlock ceremony animation |
| 16 | **Momentum Meter breakdown drill-down** | Tap Form/Active/Streak/Skill to see the exact matches contributing |

### Nutrition (deep)
| # | Item | Notes |
|---|------|-------|
| 17 | **Hydration Auto-Reminders** | Dynamic push notifications sized to training + heat index (needs weather API + push) |
| 18 | **Recipe Library** | Nutritionist-facing browsable recipes with macros pre-calculated |
| 19 | **Compliance Alerts Inbox** | Nutritionist dashboard: dedicated inbox for red-flag athletes (currently only inline flag on roster) |
| 20 | **Bloodwork Intake** | Nutritionist can upload athlete lab values → auto-adjust iron/D3 targets |
| 21 | **Weight Cut / Bulk Phase toggles** | Calorie curves for competition weight |
| 22 | **Peer benchmarking** | Anonymous compare-to-age-group averages for a chosen macro |

### Match Tracking
| # | Item | Notes |
|---|------|-------|
| 23 | **Rally-by-rally shot mapper** | Log each shot type + placement, aggregate patterns |
| 24 | **Serve heatmap** | First/second serve placement map by opponent |
| 25 | **Match video timestamp linker** | Sync uploaded video with tracked point log |
| 26 | **Score-clock differential trend** | Chart momentum swings within a match |

### Coach Tools
| # | Item | Notes |
|---|------|-------|
| 27 | **Coach — multi-player calendar** | See all athletes' matches + training in one grid |
| 28 | **Group drill assign** | Assign a drill to N athletes with one tap |
| 29 | **Video review annotation** | Draw arrows / add voice notes on player videos |
| 30 | **Coach messaging templates** | Save common feedback phrases |

### Parent Tools
| # | Item | Notes |
|---|------|-------|
| 31 | **Digest-my-kid** email — the same Monday digest but for parent inbox |
| 32 | **Match-day travel checklist** | Auto-generated packing list from upcoming schedule |

### Trophy Cabinet enhancements
| # | Item | Notes |
|---|------|-------|
| 33 | **Nutrition badges — surface locked next-up tiles alongside main achievements more prominently** |

---

## 🟢 P3 — New Modules (Phase 2+ of original PRD)

Big scope, each is a mini-product.

| # | Module | Roles | Notes / Blockers |
|---|--------|-------|------------------|
| 34 | **Fitness Trainer role** | Full RBAC — fitness plans, load management, S&C sessions | Blocked on §5.3 permission matrix + §13 DPDP compliance decisions |
| 35 | **Physician role** | Injury log, return-to-play protocols, doctor's notes | Same block as above; healthcare data governance |
| 36 | **Sports Psychologist role** | Mental prep sessions, mood/anxiety tracking, breathing exercises | Same block + minor privacy sensitivity |
| 37 | **Formal RBAC + granular permissions** | Field-level ACL for medical / mental / nutrition data | Depends on 34-36 direction |
| 38 | **Live Match Session — audience view** | Coach/parent watches score + notes in real time | Needs WebSocket layer |
| 39 | **AI Match Post-Mortem Report** | LLM writes a coach-quality analysis after each match | Emergent LLM Key ✓ |

---

## 🔵 P4 — Device & Data Integrations

Hardware/vendor-dependent — plan when partnership deals happen.

| # | Integration | Value |
|---|-------------|-------|
| 40 | **Pocket Radar / Bushnell** | Serve speed auto-log |
| 41 | **Babolat Play** | Racquet-embedded shot analytics |
| 42 | **HR wearables (Whoop / Garmin / Apple Watch)** | Recovery + strain sync |
| 43 | **Hawk-Eye / SwingVision** | Video-based line calling |
| 44 | **AITA Live Feed** | Auto-import tournament brackets & results |
| 45 | **Google Fit / Apple Health** | Nutrition + steps sync |
| 46 | **Weather API** | Heat-adjusted hydration targets |

---

## 🟣 P5 — Platform Hygiene & Infra

Not user-visible but essential for scale.

| # | Item | Notes |
|---|------|-------|
| 47 | **Server-side ranking history endpoint** | Replace `mockRankingHistory` generator with a real DB read |
| 48 | **Backend test coverage** — expand pytest suite | Currently 10/10 but only 3 endpoints tested |
| 49 | **Frontend E2E harness** | Playwright suite for critical flows |
| 50 | **Analytics — Mixpanel or PostHog** | Product usage funnel |
| 51 | **Sentry / error monitoring** | Currently console-only |
| 52 | **CDN + image optimisation** for badge shares |
| 53 | **PWA install prompt + offline shell** | We already have manifest bits |
| 54 | **i18n scaffolding** | Currently English only; target market is bilingual (EN + HI) |
| 55 | **Legal — Terms & Privacy pages** | Login footer links to nothing today |
| 56 | **DPDP / GDPR data export + deletion flows** | Legal requirement for India + EU |

---

## 🟤 P6 — Distant Ideas / Wishlist

Interesting but not on the near path. Kept here so nothing is forgotten.

- **Community feed** — highlights, badge unlocks, tournament wins
- **AI opponent scout report** — "You're playing X — here's what to expect"
- **Match-day nerves manager** — guided breathing widget triggered pre-match
- **Cross-app training exchange** — book a hitting session with another user at your NTRP band
- **Marketplace** — coaches, nutritionists list openings; players book directly
- **Live subscription tiers** — free vs. pro (AI Advisor, unlimited templates, etc.)
- **Federation dashboard** — AITA / state-body view of aggregate junior data

---

## ✅ Already Shipped (for reference — do NOT re-suggest)

Phase 1 dashboard + Nutritionist module iterations shipped these — kept here so we don't propose them again:

Dashboard: Skill Radar · Quick-Add tiles · Nutrition macro donut · water tap-to-log · weekly avg · Compare page · Head-to-Head · Drills · Match skill rating · Streak Card · Form bars · Momentum Meter · Weekly Goal Rings · Daily Mission · Trophy Cabinet · Next Milestone · H2H Rivalry Card · Streak Freeze Tokens · Shareable Badge Cards (Instagram Story format) · Login page editorial redesign · Performance Snapshot merged inline · mock AITA ranking data

Backend: FastAPI at `/app/backend` · `/api/health` · `/api/advisor/tip` (Live Match Advisor SSE) · `/api/nutrition/suggest` (AI Meal Suggester SSE) · `/api/digest/send` (Resend, awaiting keys)

Nutritionist Module: New role · 6-tab command center · Day-type macro grid · Supplemental protocols · Meal templates · Body composition · Athlete roster with compliance flags · Nutritionist ↔ player messaging · Allergen/preference tags · Micronutrient targets · Compliance color bands (±10/20/30%) · Weekly report card · GI trigger detection · Wellness quick log · Peri-match fuel timer · AI meal suggester · Dietitian chat card · Nutrition achievements merged into Trophy Cabinet

---

## How to work this list

- Pick items **top-down within a phase**. P0 unblocks P1; don't leap.
- **Small (S)** effort ≈ 1-2 hours; **Medium (M)** ≈ half a day; larger items break into sub-tasks.
- Anything blocked on "user decision" or "external credentials" — surface in the next `ask_human` before starting.
- When shipping, add a `## Iteration N — <title>` block to `/app/memory/PRD.md` and remove the item from here.
