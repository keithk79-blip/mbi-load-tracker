# Keith's Load Tracker

Mobile-first load log for **Keith's Load Tracker** / CHItrader dispatch review, plus a **Windows desktop** shell via Tauri 2. This is not dispatch software — it only records and reviews loads.

The brand mark (black **K**/**T**, lime truck, *Keith's Loadtracker*) is stored intact at `public/brand/klt-logo.png` and `src/assets/klt-logo.png` (source: `public/brand/klt-logo-source.png`). Headers, splash, favicon, and PWA icons use that static PNG — not a looping MP4/GIF. UI accents stay `#d8282c` on charcoal.

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

This compiles the Rust shell and starts Vite on port **4521**. The window title is **Keith's Load Tracker**. Do not run a second `npm run dev` on the same port at the same time.

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
| Portable exe | `src-tauri/target/release/Keith's Load Tracker.exe` |
| NSIS installer | `src-tauri/target/release/bundle/nsis/Keith's Load Tracker_1.0.0_x64-setup.exe` |
| MSI | `src-tauri/target/release/bundle/msi/Keith's Load Tracker_1.0.0_x64_en-US.msi` |

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

In the dashboard: **SQL Editor → New query**. Paste `supabase/migrations/20260904120000_loads.sql` and `supabase/migrations/20260905003000_driver_availability.sql` and run them. That creates `public.loads` (Realtime CRUD for the crew), `public.driver_availability` (locked daily driver snapshots), and RLS (any **authenticated** user can use both — this is a trusted crew of ~4). If `public.loads` already exists, also paste and Run **`Load-Tracker-loads-driver-name.sql`** once (same DDL is in `supabase/migrations/20260913180000_loads_driver_name.sql` and `Load-Tracker-sync-tables.sql`). That adds optional `driver_name` — the Full Roster name snapshotted onto each load at log / truck-edit time. Safe to re-run. Does **not** backfill old rows from the current roster. Sync never deletes remote loads; upserts fall back if the column is not there yet.

For the **Vacation** tab, also paste and Run **`Load-Tracker-vacation.sql`** once (same DDL is in `supabase/migrations/20260912040000_vacation_calendar.sql` and `Load-Tracker-sync-tables.sql`). That creates `public.vacation_weeks` and `public.vacation_entries` with the same authenticated-crew RLS + Realtime. Then open a signed-in client so the 2025–2026 seed can upload; other devices pick it up on refresh. If those tables are missing, the board still works in localStorage on that device only.

If the vacation board already exists, paste and Run **`Load-Tracker-vacation-yard.sql`** (also in `supabase/migrations/20260912053000_vacation_yard.sql`). Safe to re-run. It adds a `yard` column (`rockford` | `chicago`), changes `vacation_weeks` to primary key `(yard, week_of)`, and sets every existing week/entry to **`yard = 'rockford'`**. Chicago rows are imported separately after that — the app does not invent Chicago names.

For the **Driver** tab (Full Roster + Sat Roster per yard), paste and Run **`Load-Tracker-driver-roster.sql`** once (same DDL is in `supabase/migrations/20260912210000_driver_roster.sql` and `Load-Tracker-sync-tables.sql`). That creates `public.driver_roster_entries` with authenticated-crew RLS + Realtime. If that table already exists, also paste **`Load-Tracker-driver-roster-no-auto-delete.sql`** (migration `20260912220000_driver_roster_no_auto_delete.sql`) — it adds `driver_roster_deletes_allowed()` so roster DELETE can be frozen (`select false`) while investigating a wipe — and **`Load-Tracker-driver-roster-assigned-truck.sql`** (migration `20260913150000_driver_roster_assigned_truck.sql`) for `assigned_truck` (unit / truck), which is separate from `truck_number` (EMP #). Sync is **upsert only**. A thin or empty pull or Vacation auto-VAC must **never** delete hired or Sat rows. The only remote DELETEs are an explicit UI × or Sat **Reset to full roster** (that yard’s Sat rows only). Local cache: `chitrader.load-tracker.driver-roster.v1`. If that table is missing, the tab still works in localStorage on that device. Full Roster is the in-app system of record. Names are added in the Driver tab. The app does not read or write a spreadsheet. Full Roster **as-of** date marks Vacation-tab names **Vac** automatically (`src/lib/rosterVacation.ts`: normalize / nickname / one-letter last-name match; Rockford vacation ↔ Rockford roster, Chicago vacation ↔ Burnham / Pontiac / Arc / Zion, then the other Vacation yard). Auto-VAC is derived — it is not written onto `status` and does not remove roster rows. The Driver tab shows hired − status − Vacation VAC for that yard/day. Today’s available-driver count uses Full Roster across all yards (not Burnham!L13 / Sat-sum cells), minus leftover full-day offs. Gone archive years are **Gone YYYY** by termination year (Gone 2026, then Gone 2027 the following year).

For the **Gone** archive on the Driver tab, paste and Run **`Load-Tracker-driver-gone.sql`** once (same DDL is in `supabase/migrations/20260912300000_driver_gone.sql` and `Load-Tracker-sync-tables.sql`). That creates `public.driver_gone_entries` with the same upsert-only sync and a `driver_gone_deletes_allowed()` kill-switch. A thin/empty pull must **never** delete Gone rows — only an explicit UI ×. Local cache: `chitrader.load-tracker.driver-gone.v1`. Add Gone rows with **+ Add** or by terminating a Full Roster hire. Full Roster × asks **Termination** (write Gone, then drop the hired row and matching Sat) vs **Edit (remove only)** (drop the hired/Sat row, do not write Gone). Terminated drivers leave Full Roster so they no longer count as hired.

For the **Customers** tab (per-load pay lanes), paste and Run **`Load-Tracker-customer-lanes.sql`** once (same DDL is in `supabase/migrations/20260917010000_customer_lanes.sql`, `20260917013000_driver_roster_phone.sql`, and `Load-Tracker-sync-tables.sql`). That creates `public.customer_lanes` and adds optional `phone` on `driver_roster_entries`. Full Roster cards show Sunday–Saturday pay from logged loads (driver name + truck snapshotted on the load) × the in-force contract book for that pickup/dest/commodity and the driver’s anniversary tier. First year = Tier 1; each anniversary moves up one; 4th anniversary = Tier 5 max. A new 5-year contract is a new `effective_date` — old loads keep the old rates.

For **historical End-of-Day bubbles** (Dispatch Board Loads tab totals without truck-by-truck rows), paste and Run **`Load-Tracker-daily-eod-totals.sql`** once (same DDL is in `supabase/migrations/20260912180000_daily_eod_totals.sql` and `Load-Tracker-sync-tables.sql`). That creates `public.daily_eod_totals`. Insert one row per America/Chicago calendar day:

```sql
insert into public.daily_eod_totals (
  date, trash, leachate, walking_floor, loads, subs, source
) values (
  '2026-09-08', 334, 39, 31, 404, 15, 'manual'
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

`trash` = Total MSW, `leachate` = Total Tank Loads, `walking_floor` = Total Walking-Floor Loads, `loads` = Total Loads (MSW + tank + WF), `subs` = Total Sub Loads. If a `daily_eod_totals` row exists for the selected date, Totals / Today prefer those five bubbles even when some truck rows exist (partial history). Live today with no snapshot still sums logged loads (MSW + tank + walking-floor). The station picked-up / Closed table stays live-derived. You can also type those Loads-footer counts on Today / Totals (**Enter day totals**). Total Loads is always MSW + tank + walking-floor. Sync is a separate pull/push from `loads` — it never deletes or invents truck rows. Local cache: `chitrader.load-tracker.daily-eod-totals.v1`.

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

`available = max(0, Full Roster available − leftover full-day manual offs)`

The card label is `{available} out of {hired}` — **hired** is every company driver on Full Roster across all yards. `base` (hired − status − Vacation VAC) is only the working headcount used for available math, not the “out of” number.

- **Roster** (base): in-app **Full Roster** across Burnham + Rockford + Pontiac + Arc + Zion (`hired − status − Vacation VAC`). Today does **not** read a spreadsheet. Available drivers come from Full Roster plus manuals — not Burnham!L13, Sat-* sums, or OOT grids.
- **Call-offs (app)**: Full Roster status + Vacation auto-VAC + **+ Add** manuals on the Available drivers card (`public.manual_call_offs`). Call-off names are entered in the app. Locked past days keep the pills that were already stored.
- **Subtract** only full-day / status offs: P-day, Call off, FMLA, ok’d off, NCNS / no-call no-show, Jury Duty, Court, Vacation Day, Bereavement, Last Day / retiring.
- **Do not subtract** operational notes (parked by noon, ok’d to do 1–2 loads, coming in late, trailer work). If a reason is unclear, it is left on the roster.
- **Manual same-day offs**: on the Available drivers card, **+ Add** under Call offs stores an ad-hoc name for the selected Chicago day (Call Off / P-Day / Ok’d Off / NCNS / Late/Early). Pills show the name only; color is blue / green / yellow / red / orange. Roster names stay; manuals are additive and can be removed. Same name on the same day is rejected. Manuals persist **per Chicago calendar date** in the driver-days `localStorage` key and, with Supabase, `public.manual_call_offs`. Switching the day picker shows that date’s pills and available count — not today’s list. Past days stay visible and editable (persist, not freeze). If that table is missing, desktop chips stay in LocalStorage and phones see nothing — paste and Run **`Load-Tracker-manual-call-offs.sql`** in the Supabase SQL Editor once (same DDL is also in `Load-Tracker-sync-tables.sql`), then open desktop logged in so Late/Early push, then hard-refresh the phone. Call Off, P-Day, Ok’d Off, and NCNS subtract from the available-drivers tally when that name is not already out on Full Roster / Vacation VAC. Late/Early is orange status only and does **not** reduce available drivers. Cloud upsert/fetch/delete failures show on the Available drivers card instead of failing silently.
- **Lock each Chicago calendar day** after it is first computed. Today recomputes from Full Roster + manuals until midnight Chicago; yesterday and earlier stay frozen. Snapshots live in `localStorage` (`chitrader.load-tracker.driver-days.v1`) and, with Supabase, `public.driver_availability`. `base` is the Full Roster available count, not L13.

**Refresh** on the Available drivers card syncs cloud days/manuals and recomputes from Full Roster.

Classifier tests (real off-reason wording):

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
| **Today** | Running feed, commodity tallies, **+ Log load**. On desktop this sits beside Day Totals. **Chicago traffic** (SigAlert hot corridors) shows on web, phone, and the Windows app. **Day loads** show truck + the driver name snapshotted when that load was logged (or when its truck was edited) — not a live Full Roster link. |
| **Log load** | Truck # (keyboard or numpad), 17 stations or Custom, cascading commodity + destination |
| **Custom** | Free-text pickup / commodity / destination, with leachate tanker suggestions (CID, Kankakee, Reworld) |
| **Trucks** | Search a unit, pick any calendar day, list that day’s loads and the driver name(s) snapshotted on those loads |
| **Edit load** | Change any of the four fields (cascade still applies). Delete duplicates. Totals recalculate. |
| **Totals** | Day totals for any Chicago calendar day. **End of day** bubbles (TRASH / LEACHATE / WF / LOADS / SUBS) use a `daily_eod_totals` snapshot when one exists for that date — even if some truck rows exist — otherwise they sum logged loads. Collapsible groups: **Transfer station** (pickup), **Landfill** (destination), **Commodity**. Transfer station starts open; tap a section header to expand or collapse. Tap a bar to list those loads. Export CSV and **Clear sample loads** (local mode) are unchanged. |
| **Analytics** | Running view of whatever is already in the store (localStorage or the Supabase cache). **Year to date** grand total, **available drivers** (Full Roster minus status / Vacation VAC / leftover full-day offs), a **transfer-station donut**, **day-to-day** bars + list (loads, available drivers, loads/driver) for the last 21 days, then YTD breakdowns by transfer station, landfill, and commodity. |
| **Driver** | Chicago-area roster system of record (separate tab, `/driver`). Desktop-first. Top flipper **Full Roster** (everyone **hired** at that yard) / **Sat Roster** (Saturday planning list) / **Gone** (terminated / left archive). Yard chips **Burnham · Rockford · Pontiac · Arc · Zion** on Full and Sat. Full rows are employee # + name + optional **unavailability** (oot/fmla/vac/wc) — marked drivers stay on the hired list but count as out (`hired − full-day status − Vacation VAC`). Vacation-tab names for the selected **as-of** week are marked **Vac** automatically (derived; stored oot/fmla/etc. stay on the row). Full Roster × asks **Termination** (archive on Gone with hire / termination dates + notes, then drop Full + matching Sat) or **Edit (remove only)** (drop the list row, no Gone). Gone is a dense table: Emp #, Name, Hire date, Termination date, Notes — dates/notes stay editable; no contact columns. Sat starts from that yard’s Full Roster when Sat is empty (first open / never edited); **Reset to full roster** replaces that yard’s Sat list with a fresh Full copy. Sat desktop layout is a 2–3 column chip grid (× / reorder still work). **+ Add** / × / Reset persist immediately (local + upsert; Reset may delete+replace that yard’s Sat rows). Copy/paste is still `emp# name` per line for email. First-open / **Import empty lists** can still fill empty yard lists from the available-drivers workbook (no sheet writeback; not used for Today’s count). Empty Gone seeds once from the in-app Gone archive. **Refresh** on Available drivers syncs Full Roster. Local `chitrader.load-tracker.driver-roster.v1` / `chitrader.load-tracker.driver-gone.v1` plus Supabase `driver_roster_entries` / `driver_gone_entries` (run **`Load-Tracker-driver-roster.sql`** and **`Load-Tracker-driver-gone.sql`**). Today’s available-drivers card uses this Full Roster (all yards) as the base — not L13. |
| **Vacation** | Crew vacation calendar (separate tab). Desktop-first week table: week-of, capacity or holiday/blocked badge, driver name pills. **Pending** = blue, **approved** = neutral, **paid** = green. Top flipper **Rockford 2026** / **Chicago 2026** (yards are stored separately; existing rows default to `yard=rockford`). Year picker (defaults to the current America/Chicago year), **This week** jump, **+ Year** to seed a future calendar without needing named rows. First open bootstraps **Rockford 2025** (weeks + holidays) and **Rockford 2026** (sheet names from the Vacation Calendar export) plus an empty **Chicago 2026** week grid (no invented names). Local `chitrader.load-tracker.vacation.v1` plus Supabase `vacation_weeks` / `vacation_entries` (run **`Load-Tracker-vacation.sql`**, then **`Load-Tracker-vacation-yard.sql`** if those tables already existed). |

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
10b. Open **Analytics**. Confirm year-to-date load count, **available drivers** (today live from Full Roster minus leftover manuals), a transfer-station donut, a 21-day bar chart, a day list with loads and driver counts, and YTD transfer / landfill / commodity groups. Tap **Refresh** — today may change from roster edits, locked past weekdays must not. The card must not pull L13.
10c. On **Today**, confirm the compact available-drivers strip matches Analytics for the current Chicago date (Full Roster base, not L13).
10d. Open **Vacation**. Confirm the sidebar tab, year chips (2026 default), status legend, and a week table (not stuffed into Today). 2026 should list seeded names (e.g. Greg Cellarius the week of Jan 4). Tap a name to cycle pending (blue) / approved / paid (green). **+ Add** a driver on a week. **This week** scrolls to the current Chicago week. Capacity chips show “n of N filled”; holiday weeks show Memorial Day / Labor Day / etc.
10e. Open **Driver** (sidebar or `/driver`). Confirm Full / Sat / Gone grouping, five yard chips on Full and Sat, and a hired table (not a separate unavailable list). Full Roster shows hired / out / available for the **as-of** date. A name on the Vacation tab for that week shows a **Vac** chip and counts as out without overwriting a stored OOT/FMLA mark. **+ Add** an employee # + name, then × and choose **Edit (remove only)** — they must not appear on Gone and hired count drops. × another hire and choose **Termination**, enter a date/notes — they appear on Gone and leave Full (and Sat if listed). Switch to Sat Roster: an empty Sat list for a yard with Full hires should seed from Full (emp# + name). Confirm the dense multi-column grid (not one tall row per driver), **Copy list** still newline `emp# name`, and **Reset to full roster** recopies that yard only. **Refresh** on Available drivers syncs Full Roster. Today’s available-drivers card matches Full Roster (all yards) minus leftover full-day offs — not L13.
11. Switch Totals to yesterday via the day chips. Counts should match that day’s loads. **Jump to today** returns to the current Chicago date.
11b. On a date with a `daily_eod_totals` row (SQL insert or Today / Totals → Enter day totals), End of day / Today TRASH · LEACHATE · WF · LOADS · SUBS match the snapshot — even if some truck rows exist. Total Loads is always MSW + tank + walking-floor. The station table stays load-derived. A day without a snapshot still sums logged loads. Syncing totals must not delete or invent truck rows.
12. Totals → **Export CSV** and open the file: four columns (`truck,pickup,commodity,destination`), no extra fields.
13. Widen the window past 960px (or run `npm run tauri dev` on Windows). Confirm sidebar, Today + Totals side-by-side, and that typing a truck # + Enter works.
13b. On **Today** (web, phone, and Windows), the **Chicago traffic** card (SigAlert · Chicago) lists hot-corridor incidents. Incidents sort severe → moderate → minor; construction-like rows sit under Construction. Web/phone load via `/api/sigalert` (Pages Function in production, Vite middleware in `npm run dev`) — they must **not** call the Tauri invoke. If the feed fails, the card shows a truncated error. After merging, redeploy Cloudflare Pages **including `functions/`**, and rebuild the Windows exe (`npm run tauri:build`) so both platforms match.
14. **Clear sample loads** (local-only mode) and confirm only loads you logged remain (or the feed is empty).
15. With Supabase configured: sign in on two browsers as different users; log a load on one and confirm the other Today/Totals update without a refresh.


## Stack

Vite + React + TypeScript UI. Tauri 2 native shell in `src-tauri/`. Optional shared store: Supabase Postgres + Realtime (`supabase/migrations/`). Station master data is embedded in `src/data/stations.ts`. Brand assets: `public/brand/`. To regenerate desktop icons after replacing the logo:

```bash
node scripts/process-klt-brand.mjs
npx tauri icon public/brand/klt-icon-1024.png --output src-tauri/icons --ios-color "#ffffff"
```

Replace `public/brand/klt-logo-source.png` with a new static PNG first if the mark changes. The script trims whitespace for the header/splash copies and pads a square icon — it does not animate the mark.
