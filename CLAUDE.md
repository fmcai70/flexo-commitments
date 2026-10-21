# ActionRegister: notes for Claude / developers

Cloud version of the on-premise Flexo Commitments app (ASP.NET 8 + SQL Server `AccessRequestPortal` on FMCERICDEV,
Windows service `FlexoCommitments`). Plain HTML/CSS/JS, no build step. Shares the Supabase project, accounts,
`profiles`, `app_access` and Microsoft 365 email setup with `fmcai70/flexo-todo-app` (see its `SHARED_AUTH.md`).
App id: `actionregister`. Everything in the database is prefixed `ar_`; never alter Flexo Todo's tables.

## How it works
- `js/commitments.js` is the old app's UI, kept close to the original. It still calls `/api/...` routes;
  `js/cloud.js` (`ARCloud.fetch`) answers them with `ar_*` database functions and the private `actionregister` bucket.
  Optimistic concurrency: `X-Base-Version` → `p_base` (`ar_projects.version`); a mismatch raises `AR409` → "stale".
  "Viewing as" (admins only) → `p_as`; the database checks rules as that person and records `acting_as`.
- Error codes from the database: `AR400` bad input, `AR403` not allowed, `AR404` gone, `AR409` stale/duplicate.
- Tables have RLS on and no policies; the app only calls the security-definer `ar_*` functions, which port
  `CommitmentRules.cs` (CheckProjectWrite / CheckSubplanWrite / NeedsCheckin / LatestSubplanCycle) and `ApiController.cs`.
- Members are linked to Flexo accounts by email (`ar_members.email`, `user_id` filled on first sign-in). Projects
  refer to people by display name; `ar_rename_member` (Access → Rename) changes a name everywhere it appears as a whole JSON value. Access = `has_app_access('actionregister')` and (active member
  or admin). Admin = `ar_members.is_admin` or a Flexo admin (`profiles.role = 'admin'`).
- Emails: functions insert into `ar_outbox`; a Database Webhook calls `supabase/functions/ar-email` (Graph). Daily
  digests: `ar_daily_reminders()` via pg_cron at 00:00 UTC (8:00 Manila), de-duplicated by `ar_notification_log`.
- Attachments: `ar_file_begin` checks rules and reserves `yyyyMM/<hex>.<ext>`; storage policies allow upload only to
  a reserved path by its uploader, reads per `ar_storage_can_read`, deletes only of paths no longer listed.
  Imported files live under `legacy/`.
- The app URL used in emails is `ar_app_url()` in schema.sql; change it when hosting moves.
- Admins start as themselves (an admin not on the list picks a person first); while working as someone else a banner (#actas) says so. The choice is not remembered between visits.
- `sw.js` caches nothing (network only; an "offline" page for navigations): it exists so phones offer installing. The "Install app" button (cloud.js) follows Flexo Todo: Chrome prompt, iPhone instructions, Samsung → Chrome. Bump the `?v=` numbers in `index.html` when releasing CSS/JS changes.

## Testing
- `supabase/ar_tests.sql`: 48 checks; also run locally against Postgres 16 with the Supabase shim described in
  flexo-todo-app's CLAUDE.md (load Flexo Todo's schema.sql first).
- Browser: Playwright with `vendor/supabase-js-*` routed to a mock whose `rpc` goes to a local server running the real
  functions in Postgres (sign-in for each role, assign, upload/download, stale save, Access tab, import page, phone width).

## Status (2026-10-17)
Live: the owner completed every step in `SETUP.md` (schema, Cron, ar-email + webhook, GitHub Pages at
https://fmcai70.github.io/flexo-commitments/, import). UI review fixes and the new icon (registration mark) are shipped.
Export done once on 2026-10-17 (14 people, 208 projects, 1 sub plan, 6 attachments; Ricky Mutuc has no email).
Hosting moves to **https://flexo.com.ph/actionregister/**: a folder `public_html/actionregister` beside the company
WordPress site on Hostinger, deployed with hPanel Git (steps in `HOSTINGER.md`). `ar_app_url()` in schema.sql already
says the new address (the owner runs that one statement in Supabase); the portal's `config.js` tile changes once the
new address works. Then make this repo private and drop the GitHub Pages address from Supabase Redirect URLs.
All paths in the app are relative, so it works in a sub-folder unchanged.
