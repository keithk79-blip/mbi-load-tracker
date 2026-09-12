# Load Tracker

Mobile-first load log for **Mr. Bult's, Inc. (MBI)** / CHItrader dispatch review, plus a **Windows desktop** shell via Tauri 2. This is not dispatch software — it only records and reviews loads.

The official MBI logo (black serif **MBI**, red road ribbon, *Mr. Bult's, inc.*) is stored intact at `public/brand/mbi-logo.png` and `src/assets/mbi-logo.png` (source: `public/brand/mbi-logo-source.png`). It is not recolored or redrawn. Headers show it on a white plate; the same file drives the splash, favicon, PWA icons, and Tauri window icon. UI accents use sampled **MBI red** `#d8282c` on charcoal.

Each load has exactly four fields:

1. Truck number
2. Pickup (transfer station or custom)
3. Commodity
4. Destination

No time clock, GPS, or truck assignment. The same React UI runs in the browser (phone or wide window) and inside the desktop app.

## Run in the browser

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default [http://127.0.0.1:4521](http://127.0.0.1:4521)).

- Phone-width: bottom tabs, big numpad, + Log load.
- **960px and wider** (desktop browser or the Tauri window): sidebar nav, Today feed + Day Totals side-by-side, keyboard truck # field (type digits and press Enter).

Production web build:

```bash
npm run build
npm run preview
```

Works as a phone web app in Safari and Chrome. Add to Home Screen for a standalone shell (manifest is included). Dates follow **America/Chicago**, not the device timezone.

## Windows desktop (Tauri 2)

One codebase: `src/` is the UI; `src-tauri/` is the native Windows shell only.

### Prerequisites (Windows)

1. **Node.js 20+** — [https://nodejs.org](https://nodejs.org)
2. **Rust** (MSVC toolchain) — [https://rustup.rs](https://rustup.rs) then `rustup default stable`
3. **Visual Studio Build Tools** with **Desktop development with C++** (MSVC, Windows SDK). Installer: [https://visualstudio.microsoft.com/visual-cpp-build-tools/](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
4. **WebView2 Runtime** — preinstalled on current Windows 10/11. If a PC is missing it, the NSIS/MSI bootstrapper downloads WebView2 on first install (`downloadBootstrapper` in `src-tauri/tauri.conf.json`).

Official Tauri notes: [https://v2.tauri.app/start/prerequisites/](https://v2.tauri.app/start/prerequisites/)

### Dev (native window)

```bash
npm install
npm run tauri dev
```

Equivalent: `npm run tauri:dev` or `npm run tauri -- dev`.

This compiles the Rust shell and starts Vite on port **4521**. The window title is **Load Tracker**. Do not run a second `npm run dev` on the same port at the same time.

### Build a Windows installer / .exe

Run this **on a Windows machine** (WiX `.msi` and NSIS `-setup.exe` are produced on Windows):

```bash
npm install
npm run tauri build
```

Equivalent: `npm run tauri:build` or `npm run tauri -- build`.

After a successful build you should have:

| Artifact | Typical path |
| --- | --- |
| Portable exe | `src-tauri/target/release/Load Tracker.exe` |
| NSIS installer | `src-tauri/target/release/bundle/nsis/Load Tracker_1.0.0_x64-setup.exe` |
| MSI | `src-tauri/target/release/bundle/msi/Load Tracker_1.0.0_x64_en-US.msi` |

This Linux/cloud environment scaffolds the Tauri project and can compile the frontend, but it does **not** produce a Windows installer (no MSVC/WiX/NSIS Windows toolchain here). After merging native-shell changes (including the SigAlert reqwest command used by the Chicago traffic card), run **`npm run tauri:build` on a Windows machine** — a cloud VM typically cannot complete the full Tauri NSIS/MSI bundle.

The **Chicago traffic** card on Today reads the **SigAlert Chicago** feed (`Map.asp` then rotating `ChicagoData.json` under `cdn-dynamic.sigalert.com`) on both desktop and the web/phone app.

- **Windows (Tauri):** Rust command `fetch_sigalert_chicago` (reqwest + rustls). `@tauri-apps/plugin-http` remains a fallback (SigAlert hosts in `src-tauri/capabilities/default.json`).
- **Web / phone (Cloudflare Pages):** `functions/api/sigalert.ts` proxies the same two-step fetch so the browser does not hit SigAlert CORS. The card calls `GET /api/sigalert` and reuses the existing hot-corridor filter.
- **`npm run dev`:** Vite middleware serves `/api/sigalert` with that same Node-side fetch. Production traffic on Pages requires deploying the `functions/` directory.

Optional last-resort cross-compile from Linux (NSIS only, not the recommended path): see [Tauri Windows installer — build on Linux](https://v2.tauri.app/distribute/windows-installer/#build-windows-apps-on-linux-and-macos) (`cargo-xwin` + `x86_64-pc-windows-msvc`).

## How data is stored

### Local-only (default, no env vars)

If `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are unset, loads stay in this device’s `localStorage` key `chitrader.load-tracker.v1` (Safari, Chrome, or the Tauri WebView each have their own store). First visit seeds sample rows. **Totals → Clear sample loads** removes those seeds.

### Shared crew cloud (Supabase)

With env vars set, dispatchers sign in and share one Postgres table. Today, Totals, truck search, and edits stay in sync across phones and the Windows app for each **America/Chicago** calendar date. Realtime pushes create/edit/delete within a few seconds. If the network drops, the UI keeps working and queues writes until you’re back.

#### 1. Create a Supabase project

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard) and create a project (any region; `us-east-1` is a reasonable default).
2. Copy **Project URL** and **anon public** key from **Project Settings → API**.
3. Copy `.env.example` to `.env` and fill those two values. Restart `npm run dev` / `npm run tauri dev`.

#### 2. Run the migration

In the dashboard: **SQL Editor → New query**. Paste `supabase/migrations/20260904120000_loads.sql` and `supabase/migrations/20260905003000_driver_availability.sql` and run them. That creates `public.loads` (Realtime CRUD for the crew), `public.driver_availability` (locked daily driver snapshots), and RLS (any **authenticated** user can use both — this is a trusted crew of ~4).

For the **Vacation** tab, also paste and Run **`Load-Tracker-vacation.sql`** once (same DDL is in `supabase/migrations/20260912040000_vacation_calendar.sql` and `Load-Tracker-sync-tables.sql`). That creates `public.vacation_weeks` and `public.vacation_entries` with the same authenticated-crew RLS + Realtime. Then open a signed-in client so the 2025–2026 seed can upload; other devices pick it up on refresh. If those tables are missing, the board still works in localStorage on that device only.

For **historical End-of-Day bubbles** (Dispatch Board Loads tab totals without truck-by-truck rows), paste and Run **`Load-Tracker-daily-eod-totals.sql`** once (same DDL is in `supabase/migrations/20260912180000_daily_eod_totals.sql` and `Load-Tracker-sync-tables.sql`). That creates `public.daily_eod_totals`. Insert one row per America/Chicago calendar day:

```sql
insert into public.daily_eod_totals (
  date, trash, leachate, walking_floor, loads, subs, source
) values (
  '2026-09-08', 334, 39, 31, 404, 15, 'sheet-import'
)
on conflict (date) do update set
  trash = excluded.trash,
  leachate = excluded.leachate,
  walking_floor = excluded.walking_floor,
  loads = excluded.loads,
  subs = excluded.subs,
  source = excluded.source,
  updated_at = now();
```

`trash` = Total MSW, `leachate` = Total Tank Loads, `walking_floor` = Total Walking-Floor Loads, `loads` = Total Loads (MSW + tank + WF), `subs` = Total Sub Loads. If a `daily_eod_totals` row exists for the selected date, Totals / Today prefer those five bubbles even when some truck rows exist (partial history). Live today with no snapshot still sums logged loads. The station picked-up / Closed table stays live-derived. You can also enter the five numbers on Totals. Sync is a separate pull/push from `loads` — it never deletes or invents truck rows. Local cache: `chitrader.load-tracker.daily-eod-totals.v1`.

Or with the Supabase CLI from the repo root:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

#### 3. Auth settings + invite four dispatchers

1. **Authentication → Providers → Email**: enable Email. Turn **Confirm email** off if you want password users to sign in immediately after you create them (optional).
2. **Authentication → URL Configuration**: add redirect URLs:
   - `http://localhost:4521/**`
   - your production origin, e.g. `https://loads.yourdomain.com/**`
3. Invite each dispatcher (Authentication → Users → **Invite** / **Add user**):
   - **Invite** sends a magic link so they can set a session from email.
   - **Add user** with email + password is fastest for yard phones: they sign in on the Login screen.
4. There is **no self-serve Sign up** in the app. Only invited emails can get in.

#### 4. Upload existing local rows / recover desktop-only loads

After sign-in the app **refreshes from a complete cloud snapshot**. Pending queue upserts and loads saved since the last successful sync stay on this device and are uploaded. **Stale local-only rows** (old `chitrader.load-tracker.v1` backups that are not in the flush queue) are **not** re-uploaded — that is how a phone with ghost ids inflated Sep 10 from **406 → 435**.

If this device already has a coherent last-good for a date that is almost the same as cloud except a small extra tail (desktop **406** vs cloud **435**), refresh **keeps the device set**, tombstones the extras, and **deletes those ids from Supabase**. Empty cloud still does not wipe the day.

The session bar always shows **Push all to cloud** while signed in (label becomes **Sync now** if the queue still has ops or the last flush failed). Do **not** tap Push all on the inflated phone until after a refresh that has tombstoned the ghosts. If this device still has non-sample rows in `chitrader.load-tracker.v1` that are not in the cloud cache, **Upload N local** also appears.

**Sep 10 2026 recovery (desktop ~406 authoritative, mobile/cloud 435):**

1. Deploy this build, then **open/refresh the Windows desktop app first**. It deletes the ~29 cloud extras and stays at 406.
2. **Hard-refresh the phone** (or clear site data for the Pages origin if ghosts remain). It should drop to 406 and must not Push all first.
3. After that, new loads logged on either device sync normally.

#### 5. Verify two devices

1. Sign in as dispatcher A in Chrome, dispatcher B in another browser (or a private window).
2. A taps **+ Log load**, saves a haul for today.
3. B’s Today feed and Totals should show that row without refresh (Realtime).
4. B edits or deletes it; A should see the change.
5. Turn on airplane mode, log a load, then reconnect — the queued row should appear for everyone.

#### Deploy notes

Vite bakes `VITE_*` in at **build** time. Set the same two variables in your host (or a `.env` next to the project before `npm run tauri build`). Do not put the **service_role** key in the app — only the anon key.

Without env vars, the app still runs as a single-device log so you can develop UI offline.

## Totals and Analytics

**Totals** is one Chicago calendar day. The running total sits at the top (“42 loads today”). Groups are **Transfer station**, **Landfill**, and **Commodity**. Tap a section header to collapse or expand it (Transfer station starts open on a yard phone). Day picker, **Export CSV**, and **Clear sample loads** (local-only) are unchanged.

**Analytics** is the running picture across dates already in the store — no extra backend. Year-to-date uses the current America/Chicago calendar year. A donut chart shows each **transfer station’s share of YTD loads** (name, count, %). Stations with zero loads are omitted; a long tail of tiny slices rolls into **Other**. Day-to-day shows the last 21 days as a bar chart and a list, plus **available drivers** and loads per available driver.

## Available drivers

Today and Analytics show:

`available = max(0, Burnham!L13 − full-day offs that apply that Chicago calendar day)`

- **Roster** (base): [Chicago available-drivers workbook](https://docs.google.com/spreadsheets/d/1mdNWIsz7LZauHCccQBB7QzjR-Wo9pukGn8HrmODnPpw) tab **Burnham**, cell **L13**. That cell is all-Chicago available (not the Burnham-only 63).
- **Call-offs**: [day notes workbook](https://docs.google.com/spreadsheets/d/1FnKGIuWfKCPvcaSwchnIpQjdezHKWC5O23jECPcJzyM) columns Name | Call Off date | Through Date | Reason. A row applies to day D when Call Off = D, or D is between Call Off and Through Date (inclusive).
- **Subtract** only full-day / status offs: P-day, Call off, FMLA, ok’d off, NCNS / no-call no-show, Jury Duty, Court, Vacation Day, Bereavement, Last Day / retiring.
- **Do not subtract** operational notes (parked by noon, ok’d to do 1–2 loads, coming in late, trailer work). If a reason is unclear, it is left on the roster.
- **Manual same-day offs**: on the Available drivers card, **+ Add** under Call offs stores an ad-hoc name for the selected Chicago day (Call Off / P-Day / Ok’d Off / NCNS / Late/Early). Pills show the name only; color is blue / green / yellow / red / orange. Sheet names stay; manuals are additive and can be removed (no sheet writeback). Same name on the same day is rejected. Manuals persist **per Chicago calendar date** in the driver-days `localStorage` key and, with Supabase, `public.manual_call_offs`. Switching the day picker shows that date’s pills and available count — not today’s list. Past days stay visible and editable (persist, not freeze). If that table is missing, desktop chips stay in LocalStorage and phones see nothing — paste and Run **`Load-Tracker-manual-call-offs.sql`** in the Supabase SQL Editor once (same DDL is also in `Load-Tracker-sync-tables.sql`), then open desktop logged in so Late/Early push, then hard-refresh the phone. Call Off, P-Day, Ok’d Off, and NCNS subtract from the available-drivers tally (weekday `L13 − offs`, and Saturday yard sum − those manual offs). Late/Early is orange status only and does **not** reduce available drivers or the day `drv` tally. Sheet Reason maps to those colors when it matches; other full-day sheet reasons use Call Off (blue). Cloud upsert/fetch/delete failures show on the Available drivers card instead of failing silently.
- **Lock each Chicago calendar day** after it is first computed. Today can refresh from the sheets until midnight Chicago; yesterday and earlier stay frozen even if L13 or the call-off tab changes. A day that was never snapshotted is computed once from the current sheets, then locked. Snapshots live in `localStorage` (`chitrader.load-tracker.driver-days.v1`) and, with Supabase, `public.driver_availability` (run `supabase/migrations/20260905003000_driver_availability.sql`).
- **No Saturday tally.** Chicago Saturdays are omitted from available-driver cards, day-to-day driver columns, and the YTD working-day average. Saturday **loads** still appear in load analytics.

The browser cannot read a **private** sheet. CHItrader should keep both workbooks as **Share → Anyone with the link → Viewer** (already how the live sheets are set). The Vite / Vercel `/sheets/roster` and `/sheets/offs` proxies fetch the CSV so the phone web app does not hit Google CORS. The Tauri Windows app talks to Google directly. Last successful sheet pull is cached in `localStorage` (`chitrader.load-tracker.drivers.v1`). **Refresh sheets** re-pulls L13 and the call-off tab for **today only**.

Classifier tests (real sheet wording):

```bash
npm test
```

## Export CSV


On **Totals**, tap **Export CSV**. The file is `load-tracker-YYYY-MM-DD.csv` with columns:

```
truck,pickup,commodity,destination
```

## Screens

| Tab / screen | What it does |
| --- | --- |
| **Today** | Running feed, commodity tallies, **+ Log load**. On desktop this sits beside Day Totals. **Chicago traffic** (SigAlert hot corridors) shows on web, phone, and the Windows app. |
| **Log load** | Truck # (keyboard or numpad), 17 stations or Custom, cascading commodity + destination |
| **Custom** | Free-text pickup / commodity / destination, with leachate tanker suggestions (CID, Kankakee, Reworld) |
| **Trucks** | Search a unit, pick any calendar day, list that day’s loads |
| **Edit load** | Change any of the four fields (cascade still applies). Delete duplicates. Totals recalculate. |
| **Totals** | Day totals for any Chicago calendar day. **End of day** bubbles (TRASH / LEACHATE / WF / LOADS / SUBS) use a `daily_eod_totals` snapshot when one exists for that date — even if some truck rows exist — otherwise they sum logged loads. Collapsible groups: **Transfer station** (pickup), **Landfill** (destination), **Commodity**. Transfer station starts open; tap a section header to expand or collapse. Tap a bar to list those loads. Export CSV and **Clear sample loads** (local mode) are unchanged. |
| **Analytics** | Running view of whatever is already in the store (localStorage or the Supabase cache). **Year to date** grand total, **available drivers** (Burnham!L13 minus classified offs, with Refresh sheets), a **transfer-station donut**, **day-to-day** bars + list (loads, available drivers, loads/driver) for the last 21 days, then YTD breakdowns by transfer station, landfill, and commodity. |
| **Vacation** | Crew vacation calendar (separate tab). Desktop-first week table: week-of, capacity or holiday/blocked badge, driver name pills. **Pending** = blue, **approved** = neutral, **paid** = green. Year picker (defaults to the current America/Chicago year), **This week** jump, **+ Year** to seed a future calendar without needing named rows. First open bootstraps **2025** (weeks + holidays) and **2026** (sheet names from the Vacation Calendar export). Local `chitrader.load-tracker.vacation.v1` plus Supabase `vacation_weeks` / `vacation_entries` (run **`Load-Tracker-vacation.sql`** once). |

When pickup changes, invalid commodity and destination values are cleared and shown with strikethrough until you pick replacements from that station’s lists.

## Smoke-test checklist

1. Open the app on a phone-width viewport. Today should show seeded loads and tallies (not an empty feed).
2. Tap **+ Log load**, enter a truck number on the numpad **or** the keyboard field, **Next** / Enter.
3. Pick **Melrose**. Confirm commodity chips are Wood / Recycle / Trash (MSW) / Cardboard and destinations include Covanta, RSI, Prairie Hill.
4. Switch pickup to **Tri-State**. Wood/Covanta should clear; chips should become Trash (MSW), Tires and Liberty, Prairie View.
5. Switch to **Custom…**, type pickup `Landfill`, chip **Leachate (tanker)**, destination **CID**, **Save**. The Today feed and tallies should include the new row.
6. Open **Trucks**, find `418`, confirm today’s loads. Change the day strip / date picker to yesterday and confirm historical rows.
7. Edit a Melrose load: change pickup to **Northlake**, pick a valid commodity + destination, **Save**. Today should show an **Updated** badge, **just edited** on the row, and new tallies.
8. Delete a duplicate from Edit. The row disappears and totals drop.
9. Open **Totals**. Confirm the sentence + number at the top (e.g. “7 loads today”), the date strip (defaults to today), and three collapsible groups: Transfer station (open), Landfill and Commodity (collapsed). Expand them and confirm ranked bars (highest first).
10. Tap **Trash (MSW)** (or another commodity bar). Matching loads should appear below. Edit one, save, and confirm the bars update without leaving Totals. Collapse a group — the bars hide; the header stays.
10b. Open **Analytics**. Confirm year-to-date load count, **available drivers** (today live from L13 minus offs, or “No Saturday tally” on a Chicago Saturday), a transfer-station donut, a 21-day bar chart, a day list with loads (driver counts on weekdays only; Saturdays loads-only), and YTD transfer / landfill / commodity groups. Tap **Refresh sheets** — today may change, locked past weekdays must not.
10c. On **Today**, confirm the compact available-drivers strip matches Analytics for the current Chicago date (hidden tally on Saturday).
10d. Open **Vacation**. Confirm the sidebar tab, year chips (2026 default), status legend, and a week table (not stuffed into Today). 2026 should list seeded names (e.g. Greg Cellarius the week of Jan 4). Tap a name to cycle pending (blue) / approved / paid (green). **+ Add** a driver on a week. **This week** scrolls to the current Chicago week. Capacity chips show “n of N filled”; holiday weeks show Memorial Day / Labor Day / etc.
11. Switch Totals to yesterday via the day chips. Counts should match that day’s loads. **Jump to today** returns to the current Chicago date.
11b. On a date with a `daily_eod_totals` row (SQL insert or Totals → Enter sheet totals), End of day / Today TRASH · LEACHATE · WF · LOADS · SUBS match the snapshot — even if some truck rows exist. The station table stays load-derived. A day without a snapshot still sums logged loads. Syncing totals must not delete or invent truck rows.
12. Totals → **Export CSV** and open the file: four columns (`truck,pickup,commodity,destination`), no extra fields.
13. Widen the window past 960px (or run `npm run tauri dev` on Windows). Confirm sidebar, Today + Totals side-by-side, and that typing a truck # + Enter works.
13b. On **Today** (web, phone, and Windows), the **Chicago traffic** card (SigAlert · Chicago) lists hot-corridor incidents. Incidents sort severe → moderate → minor; construction-like rows sit under Construction. Web/phone load via `/api/sigalert` (Pages Function in production, Vite middleware in `npm run dev`) — they must **not** call the Tauri invoke. If the feed fails, the card shows a truncated error. After merging, redeploy Cloudflare Pages **including `functions/`**, and rebuild the Windows exe (`npm run tauri:build`) so both platforms match.
14. **Clear sample loads** (local-only mode) and confirm only loads you logged remain (or the feed is empty).
15. With Supabase configured: sign in on two browsers as different users; log a load on one and confirm the other Today/Totals update without a refresh.


## Stack

Vite + React + TypeScript UI. Tauri 2 native shell in `src-tauri/`. Optional shared store: Supabase Postgres + Realtime (`supabase/migrations/`). Station master data is embedded in `src/data/stations.ts`. Brand assets: `public/brand/`. To regenerate desktop icons after replacing the logo:

```bash
node scripts/process-mbi-brand.mjs
npx tauri icon public/brand/mbi-icon-1024.png --output src-tauri/icons --ios-color "#ffffff"
```

Replace `public/brand/mbi-logo-source.png` with a new official PNG first if the mark changes. The script copies it intact — it does not recolor the ribbon.
