# User Workflows — Tennis Tracker

> Describes what each role can actually do in the app today (not the original plan — see
> `TOURNAMENT_MODULE_REQUIREMENTS.md` for that). Grounded in the current `src/` implementation.
> Last verified: 2026-07-21.

---

## 1. Roles & Onboarding

At signup (`LoginPage.jsx`) the user picks one role via a role-card picker: **Player**, **Coach**,
or **Organizer**. The role is stored on `user_profiles.role` and drives which dashboard banner,
nav links, and page permissions the user sees from then on (`AuthContext` loads the profile on
login; `DashboardPage.jsx` renders `OrganizerBanner` / `CoachBanner` / `PlayerBanner` accordingly).

Profile fields relevant later (`ProfilePage.jsx`):
- **Player** — AITA reg, date of birth, state, ranking, display name. DOB and AITA reg are what
  self-entry, doubles invites, age-eligibility checks, and annual-limit checks all key off.
- **Coach** — club name.
- **Organizer** — club name; `is_verified` is a manually-set flag (Supabase dashboard only) shown
  as a badge on tournament cards.

A single Supabase user can only hold one role at a time — there's no dual player/coach account.

---

## 2. Organizer Workflow

### 2.1 Create the tournament — `TournamentsListPage.jsx`

Two entry points:
- **Upload the AITA factsheet PDF** — `parseFactsheetPdf()` extracts name, dates, venue, grade,
  deadlines, entry fees, and daily allowance directly into the form.
- **Manual entry** — fill in the two-step create modal yourself.

Step 2 of the modal adds events (category × age group). Draw size, seed count, and qualifying
config **auto-fill from the verified AITA grade-rules table** (`src/utils/aitaGradeRules.js`,
`getAitaDrawDefaults()`) the moment you pick a category — e.g. Championship Series (7-Day) gives
a 32-draw with 8 seeds and an "Open draw — adjust after sign-in" note on qualifying, since AITA
qualifying for CS7/TS7 has no fixed cap. `maxMainDirect` / `maxQualDirect` (the 8-qualifier +
1-special-exempt composition) are computed and saved at creation time, not just backfilled later.

### 2.2 Open entries — `EventDetailPage.jsx` / `TournamentDetailPage.jsx`

Per event, click **"Open Entries"**. From here, two entry paths run in parallel until you close
entries:

- **Player self-entry** (see §3.2) — players enter themselves from `TournamentDetailPage`.
- **Organizer manual entry** — `AddEntryModal` (search a platform user by name/AITA reg, or type
  in a non-platform player's details directly — no account required) or `BulkImportModal`, which
  has five tabs: Full List / Main Draw / Qualifying / Alternates / Withdrawal, for pasting a whole
  acceptance list at once.

Every entry — self or manual — is checked against:
- Singles/doubles-per-player-per-week caps (`week.maxSinglesPerPlayer` / `maxDoublesPerPlayer`,
  default 2/1).
- Age eligibility — playing up always allowed, playing down blocked unless the organizer flips
  `playingDownAllowed` on (`src/utils/eligibility.js`).
- **Annual AITA tournament-limit advisory** — non-blocking warning if the player's combined
  U12/U14/U16 tournament count for the year would exceed their cap (18/25/30; U18 uncapped).
  Shown with an explicit "Add Anyway" override, since the count can't perfectly replicate every
  edge case in the rules (two age groups at one venue = 2 tournaments, etc.).

### 2.3 Close entries & finalize the field

Click **"Close Entries"** (`entryCloseDate` is stamped). Review the acceptance list — status
codes now include `WC` (wild card), `LL` (lucky loser), `Q` (qualifier), `SE` (special exempt),
`PR` (protected ranking), `ITF`. For doubles, the draw stats bar flags **"below 8 pairs — no
ranking points"** if fewer than 8 pairs are entered (the AITA minimum for doubles points).

### 2.4 Seed and build the draw

- **Auto-Seed** — ranks entries and places seeds at the correct ITF quarter/eighth positions
  (`src/utils/drawEngine.js`: `applySeeding`, `getSeededPositions`). Manual override: click two
  players to swap; the app warns but still allows swaps that break seeding rules.
- **Fill Byes** — places BYEs adjacent to top seeds when the draw isn't full
  (`buildByeEntries`).

### 2.5 Lock the draw

Locking creates every round's `event_matches` rows, auto-advances any Round-1 BYE walkovers,
flips the event's status `setup → draw_ready`, sends a `draw_published` notification to every
entered player, and makes the Draw Sheet PDF generatable (`src/utils/drawPdf.js`).

### 2.6 Schedule play — `OrderOfPlayPage.jsx`

Cross-event daily court schedule. Builds a per-player timeline keyed by AITA reg number (so it
works for non-platform players too), refuses to double-book a player across simultaneous events,
and enforces the rest gap between a player's own matches. Regenerates automatically after each
score entry or walkover.

### 2.7 Run the tournament — score entry

Click a match in the bracket, enter score / outcome type (score, walkover, retirement, default) +
optional umpire. On save: winner auto-advances into the next round's slot, event status flips
`draw_ready → in_progress` on the very first score of the event, and the Order of Play recalculates.

### 2.8 Handle withdrawals mid-event

From the Withdrawal tab, mark a player:
- `W` — on-time withdrawal
- `LW` — late withdrawal
- `NS` — no-show

This **automatically computes and stores the ranking-point penalty** in `withdrawal_audit`
(No-Show: −5 TS7/CS7/SS, −10 NS, −15 Nationals; Late Withdrawal: −15 from the 3rd occurrence in a
calendar year, SS/NS/Nationals only) — visible as a "Penalty" column in the Audit Log tab. Before
play starts, call in a ranked alternate from the alternates list; after qualifying concludes, call
in a Lucky Loser from the dedicated panel. Qualifier winners auto-populate their reserved `Q`
slots in the main draw once the qualifying deciding round completes (`qualifier_promoted`
notification fires to the promoted player).

### 2.9 Generate official PDFs

- **Draw Sheet PDF** — one per event, regenerable at any time, always reflects current state
  (completed rounds show scores, in-progress round shows scheduled matches, future rounds blank).
- **Order of Play PDF** — one per day, court-column layout, regenerated after every score entry.

### 2.10 Complete the event

Once the final is scored, the bracket is fully resolved and the event effectively reaches its
terminal state — there's no separate "mark complete" button; it's the natural end state once
every match has a winner.

---

## 3. Player Workflow

### 3.1 Profile setup

Complete AITA reg, date of birth, state, and ranking in `ProfilePage.jsx` before entering
anything — these fields are what self-entry, age-eligibility checks, and the annual-limit
advisory all read from.

### 3.2 Browsing and entering tournaments — `TournamentDetailPage.jsx`

Browse all public tournament weeks and their events (draw size, seeds, qualifying, sign-in
window are all shown on each event card). For an event with entries open:

- **Singles** — click Enter. `computeSelfEntryPlacement()` previews where you'd land on the
  acceptance list by ranking before you confirm; `selfEnterSingles()` then creates the entry. Runs
  through the exact same singles/doubles caps, age-eligibility, and annual-limit checks an
  organizer's manual entry does.
- **Doubles** — search for a partner by name/AITA reg (`searchDoublesPartners`, scoped to the
  event's age group and gender) and send them an invite (`sendDoublesInvitation`). The invite
  appears on the partner's own Dashboard with Accept/Decline (`respondToInvitation`); the team is
  only entered once they accept.

You can withdraw yourself from an event you're entered in (`withdrawFromEvent`, logged as an
on-time `W`).

### 3.3 Tracking your tournament

- **Draw sheets and brackets** — read-only, viewable for any event at any time.
- **Today's matches and recent results** — surfaced on the Dashboard via
  `useTournamentActivity([user.aitaReg])`: opponent, event, round, court, and match order for
  anything scheduled today, plus win/loss + score for recent completions.
- **Match History** — `MatchHistoryPage.jsx`, full result history.

### 3.4 Coach links

Accept or decline incoming coach link requests from `CoachPlayersPage.jsx` (shown there as "My
Coaches" for a player). Either side can unlink at any time.

### 3.5 Personal match tracker

`TrackerPage.jsx` / `ComparePage.jsx` — the app's original standalone feature, unrelated to AITA
tournaments: log your own practice or casual matches and compare stats over time. Independent of
the tournament module.

### 3.6 Notifications

An in-app bell (`NotificationsBell.jsx`, backed by `useNotifications.js`) surfaces:

| Type | Fired when |
|---|---|
| `entries_open` | Organizer opens entries for an event |
| `draw_published` | Organizer locks the draw |
| `qualifier_promoted` | You win the qualifying deciding round and move into the main draw |
| `withdrawal_replacement` | You're called in as an alternate or lucky loser |
| Doubles invitation | A partner invites you into a doubles event |

---

## 4. Coach Workflow

### 4.1 Linking players — `CoachPlayersPage.jsx` ("My Players" for a coach)

Search for a player by name or AITA reg, send a link request (`sendCoachRequest`) — it appears as
a pending incoming request on the player's own "My Coaches" view, which they accept or decline
(`respondToCoachRequest`). Either party can unlink at any time. One coach can link many players;
one player can have multiple coaches (e.g. academy + private coach).

### 4.2 Monitoring the roster

The Dashboard's `CoachBanner` shows active/pending link counts. `useTournamentActivity()` accepts
an array of AITA regs, so a coach's view feeds in every linked player's reg at once — today's
matches and recent results across the *entire roster* appear in one list, each row labeled with
which player it belongs to (the `showOwner`/`ownerName` props on `TodayMatchRow`/`ResultRow`).

### 4.3 What a coach cannot do

Cannot create tournaments, enter official scores, or manage draws — those are organizer-only
actions gated by `week.createdBy === user.id` checks throughout `EventDetailPage.jsx`.

---

## 5. Event Status Lifecycle (cross-cutting)

```
setup ──(lock draw)──> draw_ready ──(first score entered)──> in_progress ──(final scored)──> complete
```

`entries_open` toggles independently of this lifecycle — organizers typically close entries
before locking the draw, but the two are separate flags (`event.entriesOpen`, `event.status`).

---

## 6. Known Gaps

- **`phase21_aita_penalties.sql` must be run manually** in the Supabase SQL Editor — the
  no-show/late-withdrawal penalty columns don't exist on a fresh database until then.
- **`tournaments_schema.sql` / `schema.sql` are legacy/dead files** — the live app only ever
  queries `tournament_weeks` → `events` → `draw_entries` → `event_matches` (from `phase2_schema.sql`
  onward). Don't run the old `tournaments`-table schema against a database that already has the
  phase-based one; the column names conflict (`tournament_id` vs `event_id`).
- **No ranking-points engine** — `user_profiles.ranking` is manually entered, not calculated from
  match results (see `TOURNAMENT_MODULE_REQUIREMENTS.md` §Phase 12, still unbuilt).
