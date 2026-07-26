# AITA Player Rankings — Research & Implementation Plan

> **Status:** Phase 2 complete — all Juniors (Boys/Girls U-12/14/16/18) backfilled
> **Last Updated:** 2026-07-26
> **Source:** https://aitatennis.com/playerranking/

---

## Table of Contents

1. [Overview](#1-overview)
2. [Source Site Mechanics](#2-source-site-mechanics)
3. [Full Catalog](#3-full-catalog)
4. [PDF Format Variants](#4-pdf-format-variants)
5. [Data Model](#5-data-model)
6. [Implementation Phases](#6-implementation-phases)
7. [Open Items / Risks](#7-open-items--risks)

---

## 1. Overview

Goal: mirror the existing **AITA Calendar** feature (`supabase/functions/sync-aita-calendar`, `aita_tournaments` table, [AitaCalendarPage.jsx](src/pages/AitaCalendarPage.jsx)) for **AITA Player Rankings**, so players/coaches can browse rankings inside the app instead of manually working the AITA site's PDF-download form.

This doc exists so the mechanics we reverse-engineered (session cookies, endpoint names, PDF link pattern, per-category column formats) don't need to be rediscovered in a future session.

---

## 2. Source Site Mechanics

`https://aitatennis.com/playerranking/` is an old jQuery-free vanilla-JS form. It is **not** a clean API — reconstructed by reading the page's inline `<script>` blocks and confirming with curl/Playwright.

**Step 1 — Category → SubCategory** (requires a `PHPSESSID` cookie, set on first page load):
```
GET https://aitatennis.com/management/ajax/ranking.php?q=<Category>
```
Returns an HTML `<select>` snippet with `<option>` subcategory values. The server remembers `Category` in the PHP session for step 2 — **step 2 will return empty if called without the same session cookie from step 1.**

**Step 2 — SubCategory → available Ranking dates** (same session cookie):
```
GET https://aitatennis.com/management/ajax/ranking2.php?q=<SubCategory>
```
Returns `<option value="YYYY-MM-DD">DD-MM-YYYY</option>` per published ranking date, newest first.

**Step 3 — date → PDF link** (plain GET, **no session/cookie needed** — confirmed via stateless curl):
```
GET https://aitatennis.com/rankingresult/?cat=<Category>&subcat=<SubCategory>&date1=<YYYY-MM-DD>
```
Renders a real WordPress page containing a `<table class="tour1">` with one row:
```html
<td>1. Boys U-12 as on 13 th Jul 2026 <a href="../management/upload/ranking/2026-07-13_BU-12.pdf">(Download File)</a></td>
```
Extract the `.pdf` href (relative to `/rankingresult/`) — it always lives under `management/upload/ranking/`. Don't grab the first `.pdf` link on the page — the site nav has many unrelated PDFs (Constitution, coaching docs, etc.) that appear earlier in the HTML.

**Note:** the browser's real form submission goes through a 4th step I didn't find in static HTML — clicking Submit opens `https://aitatennis.com/rankingresult/?cat=...&subcat=...&date1=...` in a new tab (confirmed via Playwright network capture; the field is named `date1` in the URL despite the form input being named `date`). Step 3 above reproduces this directly with plain `fetch`/curl, no browser needed.

---

## 3. Full Catalog

38 Category/SubCategory combos, enumerated 2026-07-26 (see `scripts/aita-rankings/discover-dates.mjs` → `ranking_dates_catalog.json` for the raw per-combo date lists — regenerate any time with `node scripts/aita-rankings/discover-dates.mjs`):

| Category (`cat` value) | SubCategories | Dates each | Notes |
|---|---|---|---|
| `Boys` | U-12, U-14, U-16, U-18 | ~249 | current, weekly, back to 2021-01-11 |
| `Girls` | U-12, U-14, U-16, U-18 | ~249 | current, weekly, back to 2021-01-11 |
| `Men` | Singles, Doubles | ~249 | current, weekly, back to 2021-01-11 |
| `Women` | Singles, Doubles | ~249 | current, weekly, back to 2021-01-11 |
| `Seniors` (Senior Men) | 35+ through 65+ × Singles/Doubles (14 combos) | 2-3 | **dead since 2021-06-07** — AITA stopped publishing |
| `Seniorwomen` | 35+ through 50+ × Singles/Doubles (8 combos) | 1 | **one-time publish, 2021-06-14, then nothing** |
| `Wheelchair` | Mens/Womens × Singles/Doubles (4 combos) | 14-15 | current, back to 2022-09-05 |

**Total: 3,086 combo×date pairs = 3,086 PDFs for full history.** Junior/Open PDFs run ~15 pages, 700+ ranked players each → full backfill is on the order of **2-3 million ranking rows**.

---

## 4. PDF Format Variants

Confirmed by downloading and text-extracting one PDF per category type (`pdfjs-dist/legacy/build/pdf.mjs` in Node — the non-legacy build throws `DOMMatrix is not defined` outside a browser).

**A. Juniors (Boys/Girls, all age groups)** — e.g. `2026-07-13_BU-12.pdf`:
```
RANK | NAME OF PLAYER | REG NO. | DOB | STATE | SING. PTS | DBLS. PTS | 25% BEST DBLS. PTS | NO SHOW/LATE WL | TTL. PTS (Final)
1 | RIAAN ATUL NANDANKAR | 440090 | 20-Nov-14 | (GJ) | 725 | 675 | 168.75 | 0 | 1077.75
```

**B. Open Men/Women (Singles/Doubles)** — e.g. `2026-07-13_MS.pdf`, `2026-07-13_WD.pdf`:
```
RANK | Name | REG.NO | DOB | STATE | QLY/ITF PTS | ATP-or-WTA PTS | NO SHOW/LATE WL | TTL. PTS
1 | SUMIT NAGAL | 404958 | 16-Aug-97 | (HR) | 0 | ...
```

**C. Seniors (both genders)** — e.g. `2021-06-07_35+SINGLES.pdf` — **no DOB column**, `REG NO.` often blank:
```
S.NO. | NAME | REG NO. | STATE | BEST 4 POINTS | ITF | TOTAL Ranking Points
1 | ADITYA KHANNA | | DL | 0 | 1700 | 3400
```

**D. Wheelchair** — e.g. `2026-07-06_WHEELCHAIR MS.pdf` — **no DOB column**, different point labels:
```
RANK | Name | REG. No. | STATE | ITF POINTS | AITA PTS | TTL.
1 | SHEKAR VEERASWAMY | WC0018 | KA | 10 | 20 | 125
```

Universal across all 4: **Rank, Name, State, Total points**. Everything else (DOB presence, REG NO. presence, and the point-breakdown columns) varies by category type — this is why the schema below uses a flexible `points_breakdown jsonb` column rather than fixed named columns per point type.

---

## 5. Data Model

**Important**: AITA's ranking tables give **tied players the same rank number** (standard competition-ranking convention) — confirmed live: 9 different players (each with a distinct reg_no and matching point total) all printed as rank `739` in one sample PDF. So `rank` is not a unique key within a snapshot. The schema below uses `row_order` (the true 1-based position in the PDF) for the uniqueness constraint, keeping `rank` as the real printed value for display.

```sql
create table aita_rankings (
  id uuid primary key default gen_random_uuid(),
  category text not null,          -- 'Boys','Girls','Men','Women','Seniors','Seniorwomen','Wheelchair'
  subcategory text not null,       -- 'U-12','Singles','35+ Doubles','Wheelchair-Mens-Singles', etc.
  ranking_date date not null,      -- the "as on" date (= date1 query param)
  row_order integer not null,      -- 1-based position in the PDF — the real uniqueness key (see note above)
  rank integer not null,           -- printed rank — can repeat across tied players
  player_name text not null,
  reg_no text,                     -- nullable — blank for some Seniors rows
  dob date,                        -- nullable — absent for Seniors/Wheelchair PDFs
  state text,
  total_points numeric,
  points_breakdown jsonb,          -- category-specific columns, e.g. {"singles_pts":725,"doubles_pts":675,"best25_doubles_pts":168.75,"cut_pts":0}
  pdf_url text not null,
  source_url text,                 -- the /rankingresult/?... page it came from
  synced_at timestamptz default now(),
  unique (category, subcategory, ranking_date, row_order)
);
create index idx_aita_rankings_lookup on aita_rankings (category, subcategory, ranking_date);
create index idx_aita_rankings_regno on aita_rankings (reg_no);
```

---

## 6. Implementation Phases

- [x] **Research** — mechanics, full catalog, PDF format variants (this doc)
- [x] **Phase 1 — Girls U-12, full pipeline, end to end:** ✅ complete 2026-07-26
  - [x] `aita_rankings` migration (`supabase/phase27_aita_rankings.sql`)
  - [x] Junior-format PDF parser (`scripts/aita-rankings/lib.mjs`)
  - [x] Rate-limited backfill script (`scripts/aita-rankings/backfill.mjs`)
  - [x] Backfill run: **249/249 dates, 133,859 rows, 0 errors**
  - [x] Data-quality check: date range matches exactly (2021-01-11 to 2026-07-13), row_order gapless per date, 0 null player_name, tie-handling verified correct
  - [x] Frontend view built: `PerformanceTab.jsx` on the player dashboard (auto-discovers circuits per reg no.)
- [x] **Phase 2 — remaining Juniors: Boys U-12/14/16/18, Girls U-14/16/18 (format A, same parser):** ✅ complete 2026-07-26
  - [x] Verified via full pagination (not just row counts, which are misleading under Supabase's 1000-row response cap) that every combo now has full date coverage matching AITA's published catalog: Boys U-12/14/16/18 and Girls U-12/14/16 at 249/249 dates, Girls U-18 at 248/248 (AITA published one fewer date for this combo)
  - [x] Filled gaps found: Boys U-14 (1 date), Boys U-16 (1 date), Girls U-16 (2 dates), Girls U-18 (142 dates — this combo previously only had 2024-04-08 onward, now backfilled to 2021-01-11)
  - [x] Fixed a real bug in `alreadySyncedDates()` in `scripts/aita-rankings/backfill.mjs` — it queried existing dates without pagination, so on a combo with >1000 rows it only "saw" a handful of already-synced dates and would've needlessly re-fetched/re-parsed the rest on any re-run (harmless due to upsert, but wasteful, and would've affected Phase 6's incremental sync too)
  - [x] Data-quality spot check: 0 null `player_name` across all 7 combos
  - [x] **Resolved data anomaly**: Girls U-14 had 1,031 rows under a bogus `ranking_date` of `"20214-05-13"`. Root cause confirmed via investigation, not assumption: AITA's own `ranking2.php` date list (still live as of 2026-07-26) lists the same 13-May-2024 ranking PDF twice, once correctly and once with a typo (`2024` → `20214`, confirmed by the "As on 13th May, 2024" text printed inside the actual PDF). A correctly-dated `2024-05-13` entry already existed with the identical row count (1,031) — an exact duplicate, not a missing/wrong date. This duplicate had been silently inflating the distinct-date count to look complete (249/249), masking a real gap at `2021-03-08`. Fixed by deleting the 1,031 duplicate rows and backfilling the real gap (903 rows) — see `scripts/aita-rankings/backfill-one-date.mjs`, a targeted single-date backfill tool (bypasses `listDatesFor`, needed whenever AITA's site relists the same PDF under two date values, since the normal `backfill.mjs` would just re-fetch the bogus one again). No other combo had this issue — checked live against all 7 other Junior combos.
- [ ] **Phase 3** — Open Men/Women Singles/Doubles (format B, new parser branch)
- [ ] **Phase 4** — Wheelchair (format D, new parser branch)
- [ ] **Phase 5 (low priority)** — Seniors/Senior Women (format C) — only ~38 PDFs total across all 22 combos since AITA abandoned this in 2021; low value, do last or skip
- [ ] **Phase 6 — incremental sync** (weekly cron Edge Function, mirrors `sync-aita-calendar`): code complete 2026-07-26, **not yet deployed**. Scoped to the 8 Junior combos only (Phases 1-2, format A) — doesn't wait on Phase 3/4/5, since those need their own PDF parsers first. Extending coverage later just means adding the new combos + parser branch to `sync-aita-rankings`.
  - [x] `unpdf`'s `getDocumentProxy` verified to expose the same low-level `getPage()`/`getTextContent()` API as `pdfjs-dist`, so the existing per-item pipe-joined text extraction (and therefore `JUNIOR_ROW_RE` itself) ports to Deno unchanged — the risk here was that `unpdf`'s higher-level `extractText()` helper (what `sync-aita-calendar` uses) returns space/newline-joined merged text, which would NOT match the existing regex.
  - [x] `aita_rankings_sync_state` + `aita_rankings_skip_dates` tables (`supabase/phase28_aita_rankings_sync.sql`) — tracks a per-combo high-water-mark date so sync doesn't have to re-page the whole table every run, plus a skip-list guard for the recurring Girls U-14 duplicate
  - [x] `supabase/functions/sync-aita-rankings/index.ts` Edge Function — checks all 8 combos every run (cheap), caps the expensive PDF fetch+parse to `MAX_PDF_PARSES_PER_RUN = 8` per invocation
  - [x] `triggerAitaRankingsSync()` in `supabaseApi.js` (+ `src/api/index.js` re-export) + organizer-gated "Sync Now" button on `AitaRankingsPage.jsx`, same pattern as `AitaCalendarPage.jsx`
  - [x] `npm run build` verified clean after all frontend changes
  - [ ] **Deploy — needs to be done by the user**: no Supabase CLI available in the dev sandbox this was built in. Run `supabase/phase28_aita_rankings_sync.sql` in the SQL Editor, then `supabase functions deploy sync-aita-rankings`, then fill in the real project URL/secret/service-role values in that SQL file's `cron.schedule` block and run just that block.
- [x] **Phase 7 — frontend browse/search UI**: already built and live, contrary to this doc's prior status — `AitaRankingsPage.jsx` at `/aita-rankings`, wired into `MTNavChrome`, `SideDrawer`, and linked from `PerformanceTab.jsx`'s "View full rankings table →". Backed by `listAitaRankingFacets` / `listAitaRankingDates` / `listAitaRankings` in `supabaseApi.js`. This doc just hadn't been updated to reflect it — found while scoping Phase 6.

---

## 7. Open Items / Risks

- **Politeness**: 3,086 requests total for full history — backfill must be rate-limited (not hammering AITA's server) and resumable if interrupted.
- **PDF extraction**: `pdfjs-dist` legacy build throws a `TT: undefined function` warning on some PDFs — text extraction still worked in testing, but worth watching for silently-dropped text on some files.
- **Multi-page parsing**: only validated page 1 of a 15-page sample so far — need to confirm pages 2+ don't repeat/break the header row pattern before trusting bulk parsing.
- **`ranking_date` cross-check**: the date is known from the `date1` query param — should spot-check it against the date printed inside the PDF itself ("as on 13th Jul 2026") to make sure they always agree.
