# AITA Player Rankings — Research & Implementation Plan

> **Status:** Phase 1 in progress — Girls U-12 (full pipeline build-out)
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
- [ ] **Phase 1 (current) — Girls U-12, full pipeline, end to end:**
  - [ ] `aita_rankings` migration
  - [ ] Junior-format PDF parser (format A above)
  - [ ] Rate-limited backfill script (~249 PDFs for this one combo)
  - [ ] Data-quality check against a few known dates
  - [ ] Decide + build a minimal way to view it (frontend page scope TBD once data's in)
- [ ] **Phase 2** — remaining Juniors: Boys U-12/14/16/18, Girls U-14/16/18 (format A, same parser)
- [ ] **Phase 3** — Open Men/Women Singles/Doubles (format B, new parser branch)
- [ ] **Phase 4** — Wheelchair (format D, new parser branch)
- [ ] **Phase 5 (low priority)** — Seniors/Senior Women (format C) — only ~38 PDFs total across all 22 combos since AITA abandoned this in 2021; low value, do last or skip
- [ ] **Phase 6** — incremental sync (weekly cron Edge Function, mirrors `sync-aita-calendar`) — only once Phases 1-4 are backfilled, to keep data current going forward
- [ ] **Phase 7** — frontend browse/search UI across the full dataset

---

## 7. Open Items / Risks

- **Politeness**: 3,086 requests total for full history — backfill must be rate-limited (not hammering AITA's server) and resumable if interrupted.
- **PDF extraction**: `pdfjs-dist` legacy build throws a `TT: undefined function` warning on some PDFs — text extraction still worked in testing, but worth watching for silently-dropped text on some files.
- **Multi-page parsing**: only validated page 1 of a 15-page sample so far — need to confirm pages 2+ don't repeat/break the header row pattern before trusting bulk parsing.
- **`ranking_date` cross-check**: the date is known from the `date1` query param — should spot-check it against the date printed inside the PDF itself ("as on 13th Jul 2026") to make sure they always agree.
