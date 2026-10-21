> **Moved (2026-10-21):** ActionRegister now lives in the private `fmcai70/flexo-portal` repository (folder
> `actionregister/`, history kept) and runs at https://flexo.com.ph/portal/actionregister/. This repository only keeps
> the old GitHub Pages address forwarding there; don't change the app here.

# ActionRegister

Flexo's register of commitments: MAIN plans (strategic / operational), projects assigned between co-managers,
check-ins, deadline extension requests, sub plans with supplier matrices, a calendar, and Excel attachments.

It is the cloud version of the on-premise **Flexo Commitments** app (ASP.NET + SQL Server on FMCERICDEV), moved onto
the same stack as Flexo Todo: plain HTML/CSS/JS, Supabase (database, sign-in, file storage), Microsoft 365 email.

- **Sign-in:** Flexo accounts (same email and password as Flexo Todo and the Flexo Portal), instead of Windows sign-in.
- **Who can use it:** people on ActionRegister's own list (tab **Access**, admins) who also have ActionRegister app
  access. Adding someone in Access gives them app access automatically.
- **Rules:** unchanged from the old app (see the top of `supabase/schema.sql`).

Setup steps for the owner: **`SETUP.md`**. Moving the website to `https://flexo.com.ph/actionregister/`: **`HOSTINGER.md`**.

## Files
| File | What it is |
|---|---|
| `index.html`, `css/` | The page, sign-in screen and look |
| `js/commitments.js` | All the screens (from the old app, nearly unchanged) |
| `js/cloud.js` | Sign-in, and the connection to Supabase (answers the old `/api/...` requests) |
| `config.js` | Supabase address and public key |
| `import.html`, `js/import.js` | One-time import of the old data and attachments |
| `supabase/schema.sql` | Tables, rules, emails, reminders (run in Supabase SQL Editor) |
| `supabase/ar_tests.sql` | 48 permission checks against the real database |
| `supabase/functions/ar-email/` | Sends ActionRegister emails through Microsoft 365 |
| `migration/export-commitments.ps1` | Exports the old SQL Server data (run on a Flexo PC) |
| `vendor/` | Supabase and SheetJS libraries, served from this site |
| `.htaccess` | Hostinger settings (HTTPS, no caching, hides notes and scripts) |
