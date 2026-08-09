# Multi-Format Tournament Guide

> **Phase 58** — Round robin, corporate team ties, pools, Swiss, and more.  
> **Required:** Run `supabase/phase58_multi_format.sql` in your Supabase SQL editor before using league formats.

---

## Supported formats (14 types)

| Format | Best for |
|--------|----------|
| **Single Elimination** | AITA / ITF juniors (existing knockout page) |
| **Double Elimination** | Events where one bad match shouldn’t end the run |
| **Main + Consolation** | USTA-style back draw for first-round losers |
| **Round Robin** | Small leagues; champion = table leader |
| **Double Round Robin** | Home & away / club seasons |
| **Season League** | Same as RR, spread across many match days |
| **Round Robin + Playoffs** | Corporate 2-day events → Final + 3rd place |
| **RR + Page Playoff** | Top 4 special playoff (McIntyre style) |
| **Pool Play + Knockout** | World Cup style (groups then KO) |
| **Pool RR Only** | Group stages without knockout |
| **Swiss System** | Large fields, fixed rounds, pair by record |
| **Compass Draw** | Recreational / USTA compass |
| **King of the Court** | Social rotation on multiple courts |
| **Team Tie League** | Davis Cup / corporate rubbers (tie score) |
| **Corporate RR + Playoffs** | Exact 5-team corporate format with dual courts |

---

## Quick start — Corporate event (organiser paper schedule)

### 1. Create tournament
1. **Dashboard → Host a Tournament → Non-AITA / Private**
2. Step 1: Name, dates, **4 courts**, start time
3. Step 2: Add event → Format: **Corporate Team RR + Playoffs** (or pick template **5-Team Corporate** on format page)
4. Create

### 2. Set up teams
1. Open tournament → click the event (opens **Format** page, not knockout draw)
2. **Teams** tab → enter: Defenders, Invincibles, Legends, Warriors, Guardians  
   (or click template on Overview to pre-fill)
3. **Save teams**

### 3. Generate fixtures
1. **Overview** → **Generate fixtures & schedule**
2. **Fixtures** tab → all 10 round-robin ties listed with suggested courts

### 4. Enter results
1. After each tie, enter **tie score** (e.g. `2-1` = team 1 won 2 rubbers, team 2 won 1)
2. Click **Save** on each row

### 5. Playoffs
1. When all league fixtures are saved → **Standings** tab shows table
2. Click **Generate playoffs from standings**
3. **Playoffs** tab → enter Final and 3rd place tie scores

### 6. Order of Play
- Link from Overview → **Order of Play** for court/time scheduling across the week

---

## Format picker — where to find it

| Location | What you can do |
|----------|-----------------|
| **Create tournament → Step 2** | Format column per event |
| **Tournament → + Add Event** | Full format selector + config |
| **Event Format page → Overview** | Change format, templates, regenerate draw |

Knockout (AITA) events still use the original **Event Detail** page with seeds, qualifying, and draw sheet PDF.

League / team / hybrid events use **`/tournaments/:id/events/:eventId/format`**.

---

## Templates (one-click presets)

| Template | Format |
|----------|--------|
| 5-Team Corporate | Team RR + Final + 3rd, 5 teams pre-named |
| 8-Team Club League | Season league, 8 teams |
| 16-Team Pools + KO | 4 pools × 4, top 2 advance |
| 16-Player Compass | Compass draw |
| 6-Team Davis Cup Style | Team ties + semis |

---

## Customization

Each format has **config fields** on the Overview tab:

- **numParticipants / teams**
- **playoffMode** — Final+3rd, top-4 semis, final only
- **rubbersPerTie / courts per tie** — dual-court corporate ties
- **numPools / poolSize / advancePerPool** — pool+KO
- **swissRounds** — Swiss system
- **matchDays** — season league length

Change config → **Regenerate fixtures** (warning: clears existing match results).

---

## Telugu quick reference (త్వరిత గైడ్)

**Corporate tournament:**
1. Tournament create → Format: **Corporate Team RR + Playoffs**
2. Teams add → **Generate fixtures**
3. Prati tie tarvata score enter (2-1 laga)
4. Standings → **Generate playoffs** → Final / 3rd place scores

**AITA knockout:** Format **Single Elimination** — purana draw page use avutundi.

**Club league (season):** **Season League** or **Double Round Robin** — chala rojulu league table update avutundi.

---

## Database setup

```sql
-- Run once in Supabase SQL Editor:
-- Copy contents of supabase/phase58_multi_format.sql
```

Without this migration, format pages show an error asking you to run the SQL.

---

## Limitations (current pass)

- Swiss round 1 is random pairing; later rounds should re-pair by score (manual for now)
- Compass / double elimination / consolation generate structure; full bracket UI same as fixtures list
- Individual player entry for Swiss/compass uses draw entries (team formats use Teams tab)
- Live point tracker links per rubber — use **Track** from player dashboard for deep stats

---

*Match Tracker Pro — Phase 58*
