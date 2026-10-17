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
- No service worker (avoid stale caches). Bump the `?v=` numbers in `index.html` when releasing CSS/JS changes.

## Testing
- `supabase/ar_tests.sql`: 48 checks; also run locally against Postgres 16 with the Supabase shim described in
  flexo-todo-app's CLAUDE.md (load Flexo Todo's schema.sql first).
- Browser: Playwright with `vendor/supabase-js-*` routed to a mock whose `rpc` goes to a local server running the real
  functions in Postgres (sign-in for each role, assign, upload/download, stale save, Access tab, import page, phone width).

## Status (2026-10-17)
Live: the owner completed every step in `SETUP.md` (schema, Cron, ar-email + webhook, GitHub Pages at
https://fmcai70.github.io/flexo-commitments/, import). UI review fixes and the new icon (registration mark) are shipped.
Export done once on 2026-10-17 (14 people, 208 projects, 1 sub plan, 6 attachments; Ricky Mutuc has no email).
Planned hosting: Hostinger (like Flexo Todo); then make this repo private. Update `ar_app_url()`, the portal's
`config.js` and Supabase Redirect URLs when it moves.
