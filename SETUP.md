# Setting up ActionRegister (one time)

ActionRegister runs in the same Supabase project as Flexo Todo and uses the same Flexo accounts.
Nothing here needs a password or secret from anyone; the Microsoft 365 secrets are already in Supabase.

## 1. Database
1. Supabase → **SQL Editor** → New query → paste all of `supabase/schema.sql` → **Run**.
   It's safe to run again later. It also creates the private file storage bucket `actionregister`.
2. Optional check: run `supabase/ar_tests.sql` the same way. Expect "All 48 ActionRegister checks passed ✔".

## 2. Daily reminders (8:00 AM)
1. Supabase → **Integrations** → **Cron** → enable it (installs `pg_cron`).
2. Run `supabase/schema.sql` once more. It adds the job `ar-daily-reminders` (every day 00:00 UTC = 8:00 Manila).

## 3. Emails (Microsoft 365, same setup as Flexo Todo)
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via editor**. Name it `ar-email`, paste
   `supabase/functions/ar-email/index.ts`, deploy. Then in its **Details/Settings** turn **Verify JWT** **off**.
   No new secrets: it uses the ones already added for Flexo Todo (`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`,
   `MAIL_FROM`, `WEBHOOK_SECRET`).
2. Supabase → **Database** → **Webhooks** → **Create a new hook**:
   - Name `ar_outbox_email`, table `ar_outbox`, event **Insert**.
   - Type **Supabase Edge Functions**, function `ar-email`, method POST.
   - HTTP header `x-webhook-secret` = the same value as the Flexo Todo notifications webhook (the `WEBHOOK_SECRET`).
   Emails are sent from the `MAIL_FROM` mailbox (todo@flexo.com.ph) with subjects starting "[ActionRegister]".

## 4. Website (GitHub Pages, until it moves to Hostinger)
1. GitHub → `fmcai70/flexo-commitments` → **Settings → Pages** → Source **Deploy from a branch**, branch `main`, folder `/ (root)` → Save.
   After a minute the app is at https://fmcai70.github.io/flexo-commitments/.
2. Supabase → **Authentication → URL Configuration → Redirect URLs** → add `https://fmcai70.github.io/flexo-commitments/`.

## 5. Bring over the data
1. Make a fresh export just before switching (`migration/export-commitments.ps1`), so nothing entered in the old app is lost.
2. Sign in to ActionRegister as a Flexo admin, then open `https://fmcai70.github.io/flexo-commitments/import.html`.
3. Choose `actionregister-export.json` and the `C:\COMMITMENTS_FILES` folder → **Import**.
   To import again later (e.g. a newer export), tick **Replace**.
4. The page lists people without a Flexo account. Invite each one: Supabase → **Authentication → Users → Invite user**
   (their email is shown in ActionRegister → **Access**). Then in **Access**, tap **Give access** next to them.
5. Stop the old `FlexoCommitments` Windows service on FMCERICDEV, so it doesn't send reminders too.
   Keep the old database and `C:\COMMITMENTS_FILES` as a backup.

## Adding a person later
ActionRegister → **Access** → *Add a person* (Flexo email + name). If they have no Flexo account yet, invite them in
Supabase first (or after) and tap **Give access**. They sign in with the same email and password as Flexo Todo.
