# Tournament Module — Full Requirements & Implementation Plan

> **Status:** Planning Complete — Ready for Implementation  
> **Last Updated:** July 2026  
> **Author:** Product Discussion Summary

---

## Table of Contents

1. [Overview](#1-overview)
2. [User Roles & Personas](#2-user-roles--personas)
3. [Tournament Structure](#3-tournament-structure)
4. [Player Participation Rules](#4-player-participation-rules)
5. [Draw Engine](#5-draw-engine)
6. [Order of Play Engine](#6-order-of-play-engine)
7. [Score Entry & Match Outcomes](#7-score-entry--match-outcomes)
8. [Qualifying → Main Draw Link](#8-qualifying--main-draw-link)
9. [Withdrawals & Alternates](#9-withdrawals--alternates)
10. [PDF Outputs](#10-pdf-outputs)
11. [Data Model](#11-data-model)
12. [Implementation Phases](#12-implementation-phases)
13. [Open Items & Future Scope](#13-open-items--future-scope)

---

## 1. Overview

The Tournament Module transforms the app from a personal match tracker into a **full tournament management platform** that serves three distinct user types:

- **Organizers** host events, manage draws, enter scores, and generate official documents
- **Players** register for tournaments, view their schedule, track results and ranking points
- **Coaches** monitor their players across all events and tournaments

### Core Principles

- One tournament week can host **multiple events** (Boys Singles U14, Girls Doubles U16, etc.)
- All events in a week **share courts** — the Order of Play is generated across all events simultaneously
- Players can enter **multiple events** within the same week with defined limits
- The system enforces **ITF seeding rules** automatically, with organizer override
- **Non-platform players** can be entered manually by the organizer — no account required
- **PDF outputs** (draw sheet + OOP) match the official AITA format exactly

---

## 2. User Roles & Personas

### 2.1 Role Selection

Chosen at signup — users pick one role:

| Role | Who | Signs Up As |
|---|---|---|
| Player | Competing athletes | Self-selects at signup |
| Coach | Trainers / academies | Self-selects at signup |
| Organizer | Club / association hosts | Self-selects, soft verification |

> **Verification:** Organizers self-declare. A `is_verified` flag is set by the system admin (via Supabase dashboard) for trusted clubs/associations. Verified badge shown on tournament cards.

---

### 2.2 Organizer

**Can:**
- Create tournament weeks and add events within them
- Enter players manually (for players not on the platform)
- Link platform users to draw slots (by AITA reg or name search)
- Generate and adjust the draw (auto-seed + manual swap)
- Enter match scores, walkovers, retirements, defaults
- Generate and download Draw Sheet PDF and Order of Play PDF
- Manage alternates / lucky losers
- Add courts, set daily start times

**Cannot:**
- See other organizers' private tournament data (only their own)
- Modify another organizer's event

---

### 2.3 Player

**Can:**
- Browse all upcoming tournament weeks
- View draw sheets and brackets for any event (read-only)
- See their own schedule (which court, what time, which round)
- View match history, results, ranking points earned
- Accept/decline coach link requests
- Use the personal match tracker (existing feature)

**Cannot:**
- Create tournaments
- Enter scores

---

### 2.4 Coach

**Can:**
- View all their linked players' stats, history, and schedules
- Monitor any tournament their players are entered in
- See real-time OOP for their players' matches
- Use the tracker to log practice matches for/with their players
- Send link requests to players (player must accept)

**Cannot:**
- Create tournaments
- Enter official scores

---

### 2.5 Coach ↔ Player Linking

```
Coach searches for player by name or AITA reg
  → System finds the player's profile
  → Sends a link request (in-app notification)
  → Player accepts or declines
  → Either party can unlink at any time

One coach can have many players
One player can have many coaches (e.g. academy + private coach)
```

---

## 3. Tournament Structure

### 3.1 Two-Level Hierarchy

```
Tournament Week  (the umbrella)
  └── Event 1: Girls Singles U14
  └── Event 2: Girls Singles U16
  └── Event 3: Girls Doubles U14
  └── Event 4: Boys Singles U14
  └── Event 5: Boys Singles U16
  └── Event 6: Boys Doubles U14
  └── ... (as many events as needed)
```

### 3.2 Tournament Week Fields

```
Name                   e.g. "SMTA AITA Circuit"
Subtitle / Series      e.g. "AITA Circuit"
Location / Venue       e.g. "SLTA Academy"
City                   e.g. "Hyderabad"
State                  e.g. "TS"
Surface                Hard / Clay / Grass / Carpet / Artificial Grass
Start Date
End Date
Week Number
Referee Name
Tournament Code        e.g. "HYD-2026-07"
Number of Courts       (shared across all events)
Court Names            ["Centre Court", "Court 1", "Court 2", "Court 3"]
Day Start Time         default 9:00 AM
Match Duration         fixed 90 minutes (for OOP calculation)
Rest Between Matches   fixed 30 minutes (per player, between their matches)
```

### 3.3 Event Fields (per category within the week)

```
Category        Girls Singles / Boys Singles / Girls Doubles / Boys Doubles
                Mixed Doubles / Women Singles / Men Singles / etc.
Age Group       U12 / U14 / U16 / U18 / Open
Is Doubles      boolean (changes entry structure)
Draw Size       128 / 64 / 32 / 16 / 8
Number of Seeds 2 / 4 / 8 / 16
Has Qualifying  boolean
Qualifying Size 64 / 32 / 16 (if has_qualifying = true)
Qualifying Spots  integer — how many advance to main draw (e.g. 4 from R32 qualifying)
Status          upcoming / in_progress / complete
```

---

## 4. Player Participation Rules

### 4.1 Per-Player Limits (per tournament week)

| Event Type | Max Per Player |
|---|---|
| Singles events | **2** |
| Doubles events | **1** |
| Total max | **3 events** |

**Example — Bhosale:**
```
✓ Girls Singles U14    (singles #1)
✓ Girls Singles U16    (singles #2 — playing up, allowed)
✓ Girls Doubles U14    (doubles #1)
✗ Girls Doubles U16    BLOCKED — already in 1 doubles event
✗ Boys Singles U14     BLOCKED — wrong gender
```

### 4.2 Age Eligibility

```
Playing UP   → Allowed    U14 player CAN enter U16
Playing DOWN → Blocked    U16 player CANNOT enter U14
```

Age calculated from DOB as of January 1 of the tournament year:

```
Age ≤ 12  → eligible: U12, U14, U16, U18, Open
Age ≤ 14  → eligible: U14, U16, U18, Open
Age ≤ 16  → eligible: U16, U18, Open
Age ≤ 18  → eligible: U18, Open
```

### 4.3 Validation at Entry Time

When organizer adds a player to an event, the system checks:

1. **Singles limit:** Is this a singles event and player already in 2 singles? → Block with message
2. **Doubles limit:** Is this a doubles event and player already in 1 doubles? → Block with message
3. **Age eligibility:** Is player's age group eligible for this event? → Block (down) or allow (up)
4. **Duplicate entry:** Is player already in this exact event? → Block
5. **Gender match:** Does player gender match event category? → Warn (organizer can override)

**Player identity across events:** The system uses `aita_reg` as the cross-event unique identifier. Even for manually-entered players (not on platform), the same AITA reg number links them across draw_entries in different events.

### 4.4 Configurable Rules (stored on tournament_week)

```
max_singles_per_player    2   (could be 1 for smaller events)
max_doubles_per_player    1
rest_minutes_between      30
playing_up_allowed        true
playing_down_allowed      false
```

---

## 5. Draw Engine

### 5.1 Player Entry Methods

**Method A — Platform User:**
- Organizer searches by name or AITA reg
- System finds the user_profile
- Ranking, state, DOB auto-filled from profile
- `draw_entry.player_id` links to their account

**Method B — Manual Entry (player not on platform):**
- Organizer types: AITA Reg, Family Name, First Name, State, Ranking, DOB, Status Code
- No user account required
- `draw_entry.player_id` is null, identified by AITA reg only

**For Doubles — Team Entry:**
```
Player 1: (same as above — platform or manual)
Player 2 (partner): Family Name, First Name, AITA Reg, State
  → also linked to platform if they have an account
```

### 5.2 Seeding Logic

```
1. Organizer specifies: num_seeds = 8 (for example)

2. System sorts all entries by AITA ranking (ascending)

3. Top 8 players by ranking become Seeds 1–8

4. System shows organizer: "These players will be seeded"
   with option to manually adjust (drag any player to a different seed number)

5. Seeded players' names shown in BOLD on all draw sheets
```

### 5.3 ITF Seeding Placement Rules

Seeds are placed into specific quarter/eighth positions:

```
R32, 8 seeds:
  Seed 1  → Position 1   (top of top half — quarter 1 top)
  Seed 2  → Position 32  (bottom of bottom half — quarter 4 bottom)
  Seed 3 or 4 → Position 9   (quarter 2 top — randomly drawn between 3 & 4)
  Seed 4 or 3 → Position 24  (quarter 3 top — randomly drawn)
  Seeds 5–8  → Randomly assigned to positions 5, 13, 20, 28
               (one per eighth, randomly drawn)

R16, 4 seeds:
  Seed 1  → Position 1
  Seed 2  → Position 16
  Seed 3 or 4 → Position 5  (randomly)
  Seed 4 or 3 → Position 12 (randomly)

R64, 16 seeds:
  Seed 1  → Position 1
  Seed 2  → Position 64
  Seeds 3–4  → Quarters 2 & 3 (randomly)
  Seeds 5–8  → Eighths (randomly)
  Seeds 9–16 → Sixteenths (randomly)
```

### 5.4 BYE Placement

When draw is not full (e.g. 28 players in R32 = 4 BYEs):

```
BYEs go to highest seeds first:
  Seed 1's position 2 → BYE (Seed 1 auto-advances to R16)
  Seed 2's position 31 → BYE
  Seed 3's adjacent position → BYE
  Seed 4's adjacent position → BYE

Result: Top seeds don't play Round 1, they start in Round 2
```

### 5.5 Unseeded Player Placement

After seeds and BYEs are placed, remaining positions are filled by randomly distributing unseeded players into the empty slots.

### 5.6 Organizer Override (Draw Editor)

After auto-generation, organizer sees the full draw grid and can:

- **Swap two players** — click player A, click player B → positions swap
- System **warns** if swap violates seeding rules (e.g. Seed 1 moved out of top quarter) but still allows it
- System **blocks** swapping a BYE slot with a seeded player (BYEs stay adjacent to seeds)
- Once happy: click **"Lock Draw"** → matches are created, draw is official

---

## 6. Order of Play Engine

### 6.1 One Round Per Day Rule

```
Day 1  → All Qualifying Round 1 matches (across all events that have qualifying)
Day 2  → All Qualifying Round 2 matches / All Main Round 1 matches
...continues...
Final Day → Semifinals + Final (can be combined on same day)
```

> The system targets completing one full round per day. If courts aren't enough to finish all matches in one day, carry-over matches go first on Day N+1.

### 6.2 OOP Generation Algorithm

```
Input:
  All round matches across ALL events for today
  Courts: [Centre Court, Court 1, Court 2, Court 3]
  Day start: 9:00 AM
  Match duration: 90 min
  Rest time: 30 min between a player's consecutive matches

Step 1 — Build player timeline map
  Key = AITA reg number (works for platform + manual players)
  Value = list of assigned time slots
  {
    "442320": [],   ← Bhosale
    "443899": [],   ← Karnam
    ...
  }

Step 2 — Sort matches by scheduling priority
  Priority 1: Matches with highest-seeded players (give them best courts)
  Priority 2: Singles before Doubles (doubles needs 4 players free)
  Priority 3: Random within same priority level

Step 3 — Assign matches to court slots
  For each match (in priority order):
    a. Get all players: 2 for singles, 4 for doubles
    b. Find earliest available slot where:
         - Court is free for this slot
         - ALL players in this match are free
         - ALL players have 30 min rest gap after previous match
    c. Assign match to that court + slot
    d. Mark court as busy for this slot
    e. Mark all players as busy for this slot + 90 min duration

Step 4 — Calculate Not Before times
  Slot 1 on any court: Day start time (9:00 AM)
  Slot 2 on any court: 9:00 + 90 min + 15 min buffer = 10:45 AM
  Slot 3 on any court: 10:45 + 90 + 15 = 12:30 PM
  etc.
  (Buffer accounts for overruns — actual next match starts when court is free)

Step 5 — Output
  Court × sequence grid with Not Before times and event labels
```

### 6.3 Cross-Event Conflict Example

```
Bhosale is in:  Girls Singles U14  +  Girls Singles U16  +  Girls Doubles U14

OOP engine detects:
  → Cannot schedule GS-U14 and GS-U16 at the same time (same player)
  → Cannot schedule GD-U14 until 30 min after Bhosale's singles match ends

Result (4 courts, Day 1):
  9:00 AM   Centre Court  [GS-U14]  Bhosale vs JK
  9:00 AM   Court 1       [GS-U16]  Panchal vs Alluri      ← different players
  9:00 AM   Court 2       [GS-U14]  Karnam vs Krishna
  9:00 AM   Court 3       [BS-U14]  Sharma vs Paturi
  
  10:45 AM  Centre Court  [GS-U16]  Bhosale vs opponent    ← Bhosale's 2nd match
  10:45 AM  Court 1       [GS-U14]  Dokku vs Byri
  11:00 AM  Court 2       [GD-U14]  Bhosale+P vs Team2     ← after 30min rest from 1st match
  10:45 AM  Court 3       [BS-U14]  Jain vs Kenguru
```

### 6.4 OOP Regeneration Triggers

The OOP for the current day is **recalculated** whenever:
- A match score is entered (frees up court, updates actual finish times)
- A match is a walkover (immediate — slot freed immediately)
- Organizer manually adjusts court count or adds/removes a court
- A match is postponed or carried over

### 6.5 Carry-Over Matches

If all matches in a round cannot finish on one day (e.g. rain delay):
```
Carry-over matches → placed FIRST in next day's OOP
  → Before any new round matches start
  → Marked as "CARRY OVER" on the OOP PDF
  → Remaining round's new matches follow after
```

---

## 7. Score Entry & Match Outcomes

### 7.1 Outcome Types

| Type | Display | When |
|---|---|---|
| Score | `6-3, 6-4` | Normal match completion |
| Walkover | `w/o` | Opponent no-show before match starts |
| Retirement | `6-3, 2-1 ret.` | Opponent started, couldn't finish |
| Default | `def.` | Opponent defaulted (code violation) |

### 7.2 Score Entry Form

```
Score field       (free text: "6-3, 6-4" or "6-3, 3-6, [10-7]" etc.)
Outcome type      Score / Walkover / Retirement / Default
Winner            Select: Player A or Player B
Umpire name       (optional)

On save:
  → Winner marked on draw sheet
  → Winner auto-populated in next round's match slot
  → OOP recalculated for remaining matches
  → Player's match history updated (if they have a platform account)
```

### 7.3 Winner Auto-Advancement

```
Round 1, Match 1 winner → placed as Entry1 in Round 2, Match 1
Round 1, Match 2 winner → placed as Entry2 in Round 2, Match 1
Round 1, Match 3 winner → placed as Entry1 in Round 2, Match 2
...etc.

Slot calculation:
  Next round match slot = ceil(current_slot / 2)
  Entry position = odd slot → Entry1, even slot → Entry2
```

---

## 8. Qualifying → Main Draw Link

### 8.1 Qualifier Slots in Main Draw

When an event has a qualifying draw, the main draw has pre-assigned "Q" positions:

```
Main draw R32, 4 qualifying spots:
  Position 9  → Q1 (qualifier from top quarter of qualifying)
  Position 17 → Q2
  Position 25 → Q3
  Position 33 → Q4  (R64 main)
  
  (These positions show "Q" on the draw sheet until qualifying completes)
```

### 8.2 Auto-Population

When the qualifying draw's final round is complete:
```
Qualifying winner from top quarter → fills Main draw Position 9 (Q1)
Qualifying winner from 2nd quarter → fills Position 17 (Q2)
...etc.

On draw sheet: "Q" is replaced by the player's name automatically
On main draw OOP: qualifier name appears in their match
```

### 8.3 Qualifier Identification on Draw Sheet

```
Player name shown as:  "BHOSALE Trisha (Q)"
Indicating she qualified from the qualifying draw
```

---

## 9. Withdrawals & Alternates

### 9.1 Alternate List

Each event draw has a ranked alternate list:

```
Alternates (in priority order):
  1st Alternate: PLAYER_A  (first called if a withdrawal)
  2nd Alternate: PLAYER_B
  3rd Alternate: PLAYER_C
  ...

On draw sheet (bottom section):
  # Alternates    Replacing
  1  PLAYER_A    ___________
  2  PLAYER_B    ___________
```

### 9.2 Withdrawal Before Play Starts

```
Player withdraws before their first match:
  → Organizer selects "Withdraw" on the player
  → System shows: "Call alternate? Pick from list"
  → Organizer selects which alternate to call in
  → Alternate replaces withdrawn player in ALL their remaining matches
  → Draw sheet shows: "ALT_PLAYER (replaces WITHDRAWN_PLAYER)"
  → OOP regenerated (alternate may have different conflict profile)
```

### 9.3 Withdrawal After Play Has Started (Lucky Loser — Qualifying)

```
Main draw player withdraws after they've won some matches:
  → Cannot be replaced by alternate
  → Opponent gets walkover in next round
  
Qualifying: losing finalist who lost the best score = Lucky Loser
  → Called in to replace the withdrawn main draw player
```

### 9.4 Walkover Chain

```
If Seed 1 withdraws after R2:
  Their R3 opponent → gets walkover → advances to QF
  No replacement player — the draw has a "hole" from that point
```

---

## 10. PDF Outputs

### 10.1 Draw Sheet PDF

**Generated per event. Can be printed at any stage — always shows current state.**

```
HEADER (every page):
┌────────────────────────────────────────────────────────────────┐
│ SMTA AITA Circuit                    GIRLS SINGLES             │
│ AITA Circuit                         QUALIFYING DRAW (32)      │
│ Week of: 20-07-26                                              │
│ City, State: HYDERABAD, TS           Grade: NATIONAL SERIE     │
│ Tourn. ID: [code]                    AITA Referee: LAVLEEN R.  │
└────────────────────────────────────────────────────────────────┘

BODY — Draw table:
┌──┬────────┬──┬────┬────┬─────────────┬──────────┬───────┬───────────┬────────────┐
│# │AITA Reg│St│Rank│Seed│Family Name  │First Name│State  │Finals     │Qualifiers  │
├──┼────────┼──┼────┼────┼─────────────┼──────────┼───────┼───────────┼────────────┤
│1 │442320  │WC│ 17 │ 1  │BHOSALE      │Trisha    │MH     │           │            │
│  │ Umpire:│  │    │    │             │          │6-3,6-4│           │            │
│2 │447418  │  │    │    │JK           │Kala      │TS     │           │            │
│  │─────── │  │    │    │             │          │       │           │            │
│3 │443899  │  │    │    │KARNAM       │Kashika   │TS     │           │            │
...

KEY:
  Seeded player names → BOLD + highlighted
  Completed score → shown on the "Umpire" line between two players
  BYE → shown explicitly in position
  Qualifier slot → shows "Q" until filled
  Walkover → shown as "w/o" instead of score
  
Rolling update:
  As rounds complete, winner names fill the right columns
  The PDF always prints the CURRENT STATE:
    Completed rounds: show actual scores and winners
    In-progress round: show scheduled matches (names but no score)
    Future rounds: blank lines only

FOOTER:
  Seeded Players list    │  Alternates list    │  Draw date/time
  1. BHOSALE             │  #1 ALT_PLAYER      │  Last Accepted Player
  2. PANCHAL             │  #2 ALT_PLAYER      │
  ...                    │                     │  Player Representatives:
                         │                     │  BHOSALE
                         │                     │  
                         │                     │  AITA Referee signature: ________
```

### 10.2 Order of Play PDF

**Generated per day. Can be reprinted anytime — always shows current schedule.**

```
HEADER:
┌────────────────────────────────────────────────────────────────┐
│ SMTA AITA CIRCUIT — ORDER OF PLAY                              │
│ Day 1 — Wednesday, 23 July 2026                                │
│ Play begins at 9:00 AM                                         │
│ Referee: LAVLEEN RAIZADA                                       │
└────────────────────────────────────────────────────────────────┘

BODY — Court columns:

CENTRE COURT              COURT 1                   COURT 2                   COURT 3
────────────────────────  ────────────────────────  ────────────────────────  ────────────────────────
[GS-U14] Not Before 9:00  [GS-U14] Not Before 9:00  [GS-U16] Not Before 9:00  [BS-U14] Not Before 9:00
[1] BHOSALE T             KARNAM K                  [2] PANCHAL S             SHARMA K
vs JK K                   vs KRISHNAMOHAN V         vs ALLURI J               vs PATURI S
Umpire: ___________       Umpire: ___________       Umpire: ___________       Umpire: ___________

[GD-U14] Not Before 10:45 [GS-U14] Not Before 10:45 [GS-U16] Not Before 10:45 [BS-U14] Not Before 10:45
[1] BHOSALE T +           GOPIREDDY J               [1] BHOSALE T             MUKKAMALLA K
PARTNER                   vs KODIMELA T             vs [opponent]             vs DAURAVU C
vs TEAM 2                 Umpire: ___________       (30min rest enforced)     Umpire: ___________
Umpire: ___________

FOOTER:
  "Schedule is subject to change. Next match starts when court is available."
  "All results to be reported to the Referee immediately."
  Referee signature: _______________________

KEY on PDF:
  [GS-U14] = Girls Singles Under 14
  [BS-U16] = Boys Singles Under 16
  [GD-U14] = Girls Doubles Under 14
  [BD-U16] = Boys Doubles Under 16
  [1] = Seed 1   [2] = Seed 2   etc.
```

### 10.3 PDF Rules

| Rule | Detail |
|---|---|
| Draw sheet | One PDF per event. Landscape orientation. |
| Draw sheet update | Can be regenerated and reprinted at any time |
| OOP | One PDF per day. Portrait or landscape. |
| OOP update | Regenerated after every score entry |
| Header | Tournament week details on every page |
| Font | Matches AITA official format (monospace for numbers, uppercase names) |
| Seeded names | Bold, uppercase |

---

## 11. Data Model

### 11.1 New Tables

```sql
-- User profiles (extends auth.users)
user_profiles
  id              uuid PK (= auth.users.id)
  role            text  -- 'player' | 'coach' | 'organizer'
  display_name    text
  aita_reg        text  -- players only
  state_abbr      text
  date_of_birth   date  -- players only (for age group eligibility)
  club_name       text
  ranking         integer  -- current AITA ranking
  is_verified     boolean  -- organizers only
  bio             text

-- Coach ↔ Player relationships
coach_player_links
  id          uuid PK
  coach_id    uuid → user_profiles
  player_id   uuid → user_profiles
  status      text  -- 'pending' | 'active' | 'declined'
  created_at  timestamptz

-- Tournament weeks (the umbrella)
tournament_weeks
  id                  uuid PK
  created_by          uuid → auth.users
  created_at          timestamptz
  name                text
  subtitle            text
  location            text
  city                text
  state_abbr          text
  surface             text
  start_date          date
  end_date            date
  referee             text
  tournament_code     text
  num_courts          integer
  court_names         text[]   -- ["Centre Court", "Court 1", "Court 2"]
  day_start_time      time     -- 09:00:00
  match_duration_mins integer  -- 90
  rest_minutes        integer  -- 30
  max_singles         integer  -- 2
  max_doubles         integer  -- 1
  playing_up_allowed  boolean  -- true
  playing_down_allowed boolean -- false

-- Events (each specific draw within a week)
events
  id                  uuid PK
  tournament_week_id  uuid → tournament_weeks
  category            text  -- 'Girls Singles' | 'Boys Singles' | 'Girls Doubles' etc.
  age_group           text  -- 'U12' | 'U14' | 'U16' | 'U18' | 'Open'
  is_doubles          boolean
  draw_size           integer  -- 128 | 64 | 32 | 16 | 8
  num_seeds           integer  -- 2 | 4 | 8 | 16
  has_qualifying      boolean
  qualifying_size     integer  -- 64 | 32 | 16
  qualifying_spots    integer  -- how many advance to main
  status              text  -- 'upcoming' | 'draw_ready' | 'in_progress' | 'complete'

-- Draw entries (players / teams in a draw)
draw_entries
  id                  uuid PK
  event_id            uuid → events
  draw_type           text  -- 'qualifying' | 'main'
  position            integer  -- 1-based draw position
  seed                integer  -- null if unseeded
  is_bye              boolean
  qualifier_slot      integer  -- for main draw Q slots (1, 2, 3, 4)
  -- Player 1 (singles player or doubles team member 1)
  player_id           uuid → user_profiles  (nullable)
  family_name         text
  first_name          text
  aita_reg            text  -- cross-event identity key
  player_state        text
  ranking             integer
  date_of_birth       date
  status_code         text  -- 'WC' | 'LL' | 'Q' | 'PR' | 'ITF'
  -- Partner (doubles only)
  partner_id          uuid → user_profiles  (nullable)
  partner_family_name text
  partner_first_name  text
  partner_aita_reg    text
  partner_state       text
  partner_ranking     integer
  -- Alternate tracking
  is_alternate        boolean
  replacing_name      text
  unique (event_id, draw_type, position)

-- Match slots (one per match in the bracket)
event_matches
  id              uuid PK
  event_id        uuid → events
  draw_type       text  -- 'qualifying' | 'main'
  round           integer  -- 1 = first round
  match_slot      integer  -- slot within the round
  entry1_id       uuid → draw_entries
  entry2_id       uuid → draw_entries
  score           text   -- e.g. "6-3, 6-4"
  winner_entry_id uuid → draw_entries
  outcome_type    text  -- 'score' | 'walkover' | 'retirement' | 'default'
  umpire          text
  status          text  -- 'pending' | 'live' | 'complete'
  day_number      integer
  unique (event_id, draw_type, round, match_slot)

-- Order of play (cross-event daily schedule)
order_of_play
  id                   uuid PK
  tournament_week_id   uuid → tournament_weeks
  day_number           integer
  day_date             date
  court_name           text
  sequence_number      integer  -- 1st, 2nd, 3rd match on this court today
  match_id             uuid → event_matches
  event_id             uuid → events  -- for quick event label lookup
  not_before_time      time
  status               text  -- 'scheduled' | 'on_court' | 'complete' | 'postponed'
  is_carryover         boolean

-- Alternates list per event draw
alternates
  id          uuid PK
  event_id    uuid → events
  draw_type   text
  priority    integer  -- 1 = first called
  entry_id    uuid → draw_entries
  status      text  -- 'waiting' | 'called_in' | 'declined'
```

### 11.2 RLS Policies Summary

| Table | Select | Insert / Update / Delete |
|---|---|---|
| user_profiles | Own row only | Own row only |
| coach_player_links | Own rows (as coach or player) | Coach creates, either party updates status |
| tournament_weeks | All authenticated users | Creator only |
| events | All authenticated users | Week creator only |
| draw_entries | All authenticated users | Event's week creator only |
| event_matches | All authenticated users | Event's week creator only |
| order_of_play | All authenticated users | Week creator only |
| alternates | All authenticated users | Week creator only |

---

## 12. Implementation Phases

### Phase 1 — Role System & Profiles
**Goal:** Every user has a role and a profile. Login/signup updated.

```
Tasks:
  □ user_profiles table + RLS
  □ coach_player_links table + RLS
  □ Role selector in signup form (Player / Coach / Organizer)
  □ Profile completion page (AITA reg, DOB, state for players; club for organizers)
  □ AuthContext loads user_profiles on login → role available app-wide
  □ Role-aware SideDrawer (Organizer sees "My Tournaments", Coach sees "My Players")
  □ Role-aware Dashboard routing
  □ Coach → Player link request flow (search, send request, accept/decline)
```

---

### Phase 2 — Tournament Week + Events Creation
**Goal:** Organizer can create a tournament week and add multiple events.

```
Tasks:
  □ tournament_weeks table + RLS
  □ events table + RLS
  □ TournamentWeekCreatePage (form for week-level info + courts)
  □ EventCreateForm (add event within a week — category, age group, draw config)
  □ TournamentWeeksListPage (all public tournaments, card view)
  □ TournamentWeekDetailPage (header + list of events within the week)
  □ Update SideDrawer: "Tournaments" nav link
  □ Update App.jsx routes
```

---

### Phase 3 — Player Entry
**Goal:** Organizer populates draw entries for each event.

```
Tasks:
  □ draw_entries table + RLS
  □ Manual entry form (per player — singles)
  □ Manual entry form (per team — doubles, includes partner fields)
  □ Bulk paste entry (CSV format: position, aitaReg, statusCode, rank, seed, familyName, firstName, playerState)
  □ Platform user search + link (by name or AITA reg)
  □ Entry validation:
      - Singles count check (max 2 per player per week)
      - Doubles count check (max 1 per player per week)
      - Age eligibility check
      - Duplicate entry check
  □ Draw entries list view (shows all entered players before draw generation)
  □ Alternates entry (separate list, ranked priority order)
```

---

### Phase 4 — Draw Engine
**Goal:** System generates the draw using ITF rules; organizer can adjust.

```
Tasks:
  □ Seeding logic (sort by ranking, assign seed numbers 1–N)
  □ ITF placement algorithm (seed positions per draw size)
  □ BYE placement (adjacent to top seeds, fill remaining slots)
  □ Random draw for unseeded players
  □ Draw editor UI:
      - Full draw grid display
      - Click two players to swap positions
      - Warning on seeding rule violations
      - "Lock Draw" button → creates event_matches rows
  □ event_matches table + RLS
  □ Round 1 match generation (pair positions: 1v2, 3v4, ...)
  □ Future round slot generation (empty slots for R2, QF, SF, Final)
  □ Draw Sheet view (AITA table format)
```

---

### Phase 5 — Score Entry & Winner Advancement
**Goal:** Organizer enters scores, winners auto-advance through the bracket.

```
Tasks:
  □ Match card component (shows two entries, score input, outcome type selector)
  □ Score save API (updateMatchScore)
  □ Winner auto-advancement (advanceWinner to next round slot)
  □ All outcome types: score, walkover, retirement, default
  □ Bracket view (rounds as tabs/sections, all matches per round)
  □ Carry-over match flagging (match not finished → mark as carryover)
  □ Supabase Realtime subscription → live score updates for viewers
```

---

### Phase 6 — Qualifying → Main Draw Link
**Goal:** Qualifying winners automatically populate main draw Q slots.

```
Tasks:
  □ Qualifier slot definition on main draw entries (qualifier_slot field)
  □ "Q" placeholder display on main draw sheet
  □ Auto-populate trigger: when qualifying final round complete →
      find qualifier slots → fill with qualifying winners
  □ Show "(Q)" suffix on qualifying player's name in main draw
  □ Notify organizer: "Qualifying complete — 4 qualifiers placed in main draw"
```

---

### Phase 7 — Order of Play Engine
**Goal:** Fully automated daily court schedule across all events.

```
Tasks:
  □ order_of_play table + RLS
  □ OOP generation algorithm:
      - Collect all round matches across all events for the day
      - Build player timeline map (by AITA reg)
      - Priority sort matches
      - Assign to court slots with conflict detection
      - Calculate Not Before times
  □ OOP view page (court columns, match cards with event labels)
  □ OOP regeneration on score entry
  □ Carry-over matches placed first in next day's OOP
  □ Court occupancy status (pending → on_court → complete)
  □ Organizer can manually override: move a match to a different court or slot
```

---

### Phase 8 — PDF — Draw Sheet
**Goal:** Official AITA-format draw sheet PDF, downloadable anytime.

```
Tasks:
  □ jsPDF implementation for draw sheet
  □ AITA table format (positions, names, round columns)
  □ Tournament week header on every page
  □ Seeded names in bold/uppercase
  □ Rolling state: completed scores in round columns, blank future rounds
  □ BYE positions clearly marked
  □ Footer: seeded players list, alternates list, draw date, last accepted player
  □ Landscape orientation, print-optimized layout
```

---

### Phase 9 — PDF — Order of Play
**Goal:** Official OOP PDF per day, always reflects current schedule.

```
Tasks:
  □ jsPDF implementation for OOP
  □ Tournament week header
  □ Court column layout
  □ Match cards: event label, seed badges, player names, Not Before time, umpire line
  □ Carry-over matches marked
  □ Postponed matches marked
  □ Footer: referee signature line, scheduling notice
  □ Regenerate and re-download at any time
```

---

### Phase 10 — Withdrawals & Alternates
**Goal:** Handle post-draw player changes cleanly.

```
Tasks:
  □ Withdraw player action (from draw entry)
  □ If before play: call alternate from list
  □ Alternate replaces player in all their remaining matches
  □ OOP regenerated (alternate may have different conflict profile)
  □ Draw sheet updated: "ALT_NAME (replaces WITHDRAWN_NAME)"
  □ Lucky Loser flow (qualifying): best loser identified, called into main draw
  □ Alternate status tracking (waiting → called_in → declined)
```

---

### Phase 11 — Player & Coach Dashboards
**Goal:** Role-specific home screens showing relevant info.

```
Player Dashboard:
  □ My Tournaments: list of tournament weeks I'm entered in
  □ My Events: within each week, which events (GS-U14, GD-U14 etc.)
  □ My Schedule: today's matches (court, time, opponent)
  □ My Draw Position: current bracket position in each event
  □ My Results: match history with scores
  □ My Stats: existing personal tracker stats

Coach Dashboard:
  □ My Players: linked player list with status indicators
  □ Each player's current tournament + schedule
  □ Cross-player view: all my players' matches today
  □ Player stats comparison
```

---

### Phase 12 — Ranking Points (Future)
**Goal:** Track AITA ranking points earned per round per grade.

```
Tasks:
  □ Points table (grade × round → points)
  □ Auto-calculate points earned when a match result is entered
  □ Player's total points displayed on profile
  □ Points history per tournament
```

---

## 13. Open Items & Future Scope

### Confirmed Decisions

| Decision | Choice |
|---|---|
| OOP match duration | 90 minutes fixed |
| OOP timing | Recalculates after each match completes |
| Seeding placement | Auto ITF + organizer override |
| AITA ranking input | Organizer enters manually at event setup |
| Multi-event per week | Yes — tournament_weeks → events hierarchy |
| Doubles entry | Team pairs per draw_entry (player + partner) |
| Max singles per player | 2 per tournament week |
| Max doubles per player | 1 per tournament week |
| Playing up | Allowed |
| Playing down | Blocked |
| Player identity | AITA reg number (cross-event) |
| Courts | Shared across all events in the week |
| OOP generation | Fully automated, one round per day |
| Court priority | Seeded players → Centre Court first match |

### Future Scope (Not in Current Plan)

- **AITA ranking database integration** — live ranking lookup instead of manual entry
- **Push notifications** — player notified when their match is next (30 min warning)
- **Live score display** — public-facing scoreboard for spectators
- **Round robin / group stages** — not in AITA junior format, skip for now
- **Prize money tracking** — not applicable to AITA junior events
- **Umpire management module** — assign certified umpires per match from a roster
- **Weather / surface condition log** — per-day notes affecting OOP
- **Multi-referee support** — large tournaments with multiple officials
- **Mobile app** — current web app is mobile-responsive; native app is future scope
- **AITA points table automation** — auto-assign ranking points by grade and round

---

*Document generated from planning discussions — July 2026*  
*Next step: Begin implementation with Phase 1 (Role System & Profiles)*
