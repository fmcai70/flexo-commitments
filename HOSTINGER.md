# Moving ActionRegister to Hostinger (flexo.com.ph/actionregister)

**Result:** the app runs at **https://flexo.com.ph/actionregister/**. That's a folder on the Hostinger plan that
already hosts the company WordPress site. Updates go live automatically when the code changes, and the GitHub
repository can then be made private.

**Who:** whoever manages Hostinger (hPanel) and Supabase. **Time:** about 20 minutes.

- No new subdomain, DNS record or SSL certificate is needed: `flexo.com.ph` already has HTTPS.
- **Don't touch the WordPress files or the email records.** Everything here goes into a *new*, empty folder.
  The folder's own `.htaccess` keeps WordPress out of it, and keeps it out of WordPress.

---

## Part 1: Hostinger: the folder
1. Sign in to **hPanel** (https://hpanel.hostinger.com) → **Websites** → **Manage** next to `flexo.com.ph`.
2. **Files** → **File Manager** → open `public_html` (the WordPress files are here; leave them alone).
3. **New folder** → `actionregister`. Keep it **empty**, because the Git deploy needs an empty folder.

## Part 2: Hostinger: put the app there (Git, updates automatically)
1. hPanel → search the menu for **Git** (under **Advanced**).
2. **Private repository key** (needed once the repo is private; do it now): click **Generate SSH key** (or copy the
   key shown under *Private Git Repository*). Then on GitHub: `fmcai70/flexo-commitments` → **Settings** →
   **Deploy keys** → **Add deploy key** → title `Hostinger`, paste the key, leave **Allow write access** unticked →
   **Add key**. (If Flexo Todo already uses this key, GitHub refuses the same key on a second repository.
   In that case generate a new one, or use the File Manager method below.)
3. Back in hPanel → **Create a new repository**:

   | Field | Value |
   |---|---|
   | Repository | `git@github.com:fmcai70/flexo-commitments.git` |
   | Branch | `main` |
   | Install path / Directory | `actionregister` (the folder from Part 1, inside `public_html`) |

   Click **Create**, then **Deploy** (or **Pull**) once.
4. **Automatic updates:** on the repository row click **Auto Deployment** and copy the **Webhook URL**. On GitHub →
   `fmcai70/flexo-commitments` → **Settings** → **Webhooks** → **Add webhook** → paste it into *Payload URL*, keep
   *Just the push event* → **Add webhook**. From now on every update goes live within a minute.

**No Git option on your plan?** Use File Manager instead: on GitHub click **Code → Download ZIP**, upload the zip
into `public_html/actionregister`, **Extract**, and move the files out of the extracted `flexo-commitments-main`
folder so `index.html` sits directly in `public_html/actionregister`. Repeat for each update.

## Part 3: Supabase: the new address
1. **SQL Editor** → New query → run this one statement. It's the address used in ActionRegister's emails, and is
   already updated in `supabase/schema.sql`:
   ```sql
   create or replace function public.ar_app_url() returns text language sql immutable as $$
     select 'https://flexo.com.ph/actionregister/'
   $$;
   ```
2. **Authentication → URL Configuration → Redirect URLs:** add `https://flexo.com.ph/actionregister/` and **keep**
   `https://fmcai70.github.io/flexo-commitments/` for now (people still using the old link). **Don't change the
   Site URL**: it belongs to Flexo Todo. **Save.**

## Part 4: Test (5 minutes)
On a PC and a phone, open `https://flexo.com.ph/actionregister/`:
- [ ] The padlock shows (HTTPS), and the ActionRegister sign-in page appears (not a WordPress page).
- [ ] Sign in with your Flexo email and password; the projects are there (same database).
- [ ] **Forgot password?** → the email's button opens `flexo.com.ph/actionregister/` on *Choose a new password*.
- [ ] Assign a project to someone → their email's "Open it here" link is `https://flexo.com.ph/actionregister/`.
- [ ] Android (Chrome) / iPhone (Safari): **Install app** from the new address; it opens and works.
- [ ] `https://flexo.com.ph/actionregister/CLAUDE.md` shows **Forbidden** (notes aren't public).
- [ ] `https://flexo.com.ph/` (the WordPress site) still works as before.

## Part 5: Switch everyone over
1. Update the Flexo Portal's ActionRegister tile (`fmcai70/flexo-portal` → `config.js`, already prepared) so the
   launcher opens the new address.
2. Send staff the new link. Anyone who installed the old app removes it and installs from
   `https://flexo.com.ph/actionregister/`. They sign in once; nothing is lost, since all data is in the database.
3. After about a week, make the code private: GitHub → `fmcai70/flexo-commitments` → **Settings** → **General** →
   **Danger Zone** → **Change visibility** → **Private**. This also switches off the old
   `fmcai70.github.io/flexo-commitments` address. Hostinger keeps updating through the deploy key from Part 2.
4. Then remove the old address from Supabase **Redirect URLs**.

## Troubleshooting

| Problem | Fix |
|---|---|
| A WordPress "page not found" appears | The files aren't in `public_html/actionregister`, or `index.html` is one folder too deep. |
| "Index of /actionregister" or Forbidden on the main page | `index.html` is missing from the folder: deploy again (Part 2.3). |
| Git deploy fails: "Permission denied (publickey)" | The deploy key (Part 2.2) isn't on the GitHub repository, or a different key was pasted. |
| Git deploy fails: "directory not empty" | Empty `public_html/actionregister` first (Part 1). |
| Sign-in / reset link goes back to the old address | Part 3.2 not done (Redirect URLs). |
| Email links still show the old address | Part 3.1 not done (`ar_app_url`). |
| Phones still show an old version | Close and reopen the app (twice). The `.htaccess` file must be present. |
