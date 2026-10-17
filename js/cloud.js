/*
 * ActionRegister: sign-in (shared Flexo accounts) and the connection to Supabase.
 *
 * The screens (js/commitments.js) were written for the old on-premise server and call /api/... routes.
 * ARCloud.fetch() answers those same routes with the ar_* database functions (supabase/schema.sql) and the
 * private 'actionregister' storage bucket, so the screens didn't need rewriting:
 *   GET /api/state            → ar_state           PUT/DELETE /api/projects/{id} → ar_put_project / ar_delete_project
 *   GET/POST/PUT/PATCH /api/members → ar_members_list, ar_add_member, ar_update_member, ar_rename_member    PUT/DELETE /api/subplans/{id} → ar_put_subplan / ar_delete_subplan
 *   POST/GET/DELETE /api/files → ar_file_begin + upload / ar_file_key + download / ar_file_delete + remove
 */
(function () {
  'use strict';

  const CFG = window.AR_CONFIG;
  const $ = (id) => document.getElementById(id);

  // Read the link we arrived from before the Supabase client consumes and clears it.
  const startHash = new URLSearchParams(location.hash.replace(/^#/, ''));
  let recovering = startHash.get('type') === 'recovery'; // opened from a "reset password" email
  const linkError = startHash.get('error_description');

  const sb = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
    })
    : null; // library failed to load
  const appUrl = () => location.origin + location.pathname;
  let user = null; // signed-in auth user once the app is open

  // Plain-language versions of common errors.
  function friendly(error) {
    const msg = (error && error.message) || String(error);
    if (/Invalid login credentials/i.test(msg)) return 'Wrong email or password.';
    if (/rate limit/i.test(msg)) return 'Too many emails were sent in the last hour. Wait about an hour, or sign in with your password.';
    if (/only request this after/i.test(msg)) return 'An email was just sent. Check your inbox (and Junk), or wait a minute before asking again.';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'No internet connection. Please try again.';
    if (/different from the old password/i.test(msg)) return 'That is already your password. Choose a different one.';
    if (/reauthenticat/i.test(msg)) return 'For security, sign out and sign in again, then change your password.';
    if (/could not find the function|schema cache/i.test(msg)) return 'ActionRegister isn\'t set up in the database yet (run supabase/schema.sql).';
    return msg;
  }
  const check = ({ error, data }) => { if (error) throw new Error(friendly(error)); return data; };

  function showScreen(which) {
    $('loadingScreen').hidden = which !== 'loading';
    $('authScreen').hidden = which !== 'auth';
    $('appShell').hidden = which !== 'app';
  }

  // ---- sign-in -------------------------------------------------------
  function showAuth(errorText, infoText, blocked) {
    showScreen('auth');
    $('signInForm').hidden = !sb || !!blocked;
    $('newPasswordForm').hidden = true;
    $('blockedBox').hidden = !blocked;
    $('authSub').textContent = 'Sign in with your Flexo account';
    $('authError').textContent = errorText || (sb ? '' : 'Could not load the sign-in service. Check your internet connection and reload the page.');
    $('authInfo').textContent = infoText || '';
  }
  function showNewPassword() {
    recovering = true;
    showScreen('auth');
    $('signInForm').hidden = true;
    $('blockedBox').hidden = true;
    $('newPasswordForm').hidden = false;
    $('authSub').textContent = 'Choose a new password';
    $('authError').textContent = '';
    $('authInfo').textContent = '';
    $('newPassword').focus();
  }
  async function authAction(fn, info) {
    $('authError').textContent = '';
    $('authInfo').textContent = '';
    const controls = document.querySelectorAll('#authScreen button, #authScreen input');
    controls.forEach((n) => { n.disabled = true; });
    try {
      await fn();
      if (info) $('authInfo').textContent = info;
    } catch (err) {
      $('authError').textContent = friendly(err);
    } finally {
      controls.forEach((n) => { n.disabled = false; });
    }
  }
  function authEmail() {
    const email = $('authEmail').value.trim();
    if (!email) { $('authError').textContent = 'Enter your email first.'; $('authEmail').focus(); }
    return email;
  }

  $('signInForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!$('authPassword').value) { $('authError').textContent = 'Enter your password, or use "Email me a sign-in link".'; return; }
    authAction(async () => check(await sb.auth.signInWithPassword({ email: $('authEmail').value.trim(), password: $('authPassword').value })));
  });
  $('magicLinkBtn').addEventListener('click', () => {
    const email = authEmail();
    if (email) {
      authAction(async () => check(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: appUrl() } })),
        'Check your email for a sign-in link (it can take a minute).');
    }
  });
  $('forgotBtn').addEventListener('click', () => {
    const email = authEmail();
    if (email) {
      authAction(async () => check(await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() })),
        'Check your email for a link to set a new password.');
    }
  });
  $('newPasswordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    authAction(async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) throw new Error('This reset link has expired. Go back and tap "Forgot password?" again.');
      check(await sb.auth.updateUser({ password: $('newPassword').value }));
      $('newPassword').value = '';
      recovering = false;
      enter(data.session);
    });
  });
  async function signOut() {
    try { localStorage.removeItem('fc_me'); } catch (e) { /* private mode */ }
    if (sb) await sb.auth.signOut();
    location.replace(appUrl()); // fresh page: the screens keep state in memory
  }
  $('blockedSignOut').addEventListener('click', signOut);
  $('portalLink').href = CFG.portalUrl;

  // ---- account: change password, sign out -------------------------------
  function addAccountButton() {
    const bar = document.querySelector('.top .bar');
    if (!bar || $('acctBtn')) return;
    const b = document.createElement('button');
    b.id = 'acctBtn';
    b.className = 'acct';
    b.type = 'button';
    b.title = 'Your account: password and sign out';
    b.setAttribute('aria-label', 'Your account');
    b.textContent = '👤';
    b.addEventListener('click', () => {
      $('accountEmail').textContent = user ? user.email : '';
      $('accountError').textContent = '';
      $('accountPassword').value = '';
      $('accountPassword2').value = '';
      $('accountDialog').showModal();
    });
    bar.appendChild(b);
    addInstallButton(bar, 'btn ghost bar-install');
    bar.appendChild(b); // keep the account button last
  }
  $('accountForm').addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    const p1 = $('accountPassword').value, p2 = $('accountPassword2').value;
    if (!p1 && !p2) { $('accountDialog').close(); return; }
    if (p1.length < 8) { $('accountError').textContent = 'Use at least 8 characters.'; return; }
    if (p1 !== p2) { $('accountError').textContent = 'The two passwords don\'t match.'; return; }
    $('accountSave').disabled = true;
    try {
      check(await sb.auth.updateUser({ password: p1 }));
      $('accountDialog').close();
      toast('Password changed. Use it for every Flexo app.');
    } catch (err) {
      $('accountError').textContent = friendly(err);
    } finally {
      $('accountSave').disabled = false;
    }
  });
  $('accountSignOut').addEventListener('click', signOut);
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 3200); }

  // ---- opening the app ---------------------------------------------------
  let entering = false, opened = false;
  async function enter(session) {
    if (recovering || entering || opened) return;
    entering = true;
    try {
      showScreen('loading');
      const who = check(await sb.rpc('ar_whoami'));
      if (!who.allowed) {
        showAuth('', '', true);
        $('blockedText').textContent = who.appAccess
          ? 'You are not on the ActionRegister list yet. Ask an ActionRegister administrator to add you.'
          : 'Your Flexo account (' + session.user.email + ') doesn\'t have access to ActionRegister. Ask an admin to give you access.';
        return;
      }
      user = session.user;
      opened = true;
      window.__CFG = { me: who.me, isAdmin: who.isAdmin, canSwitch: who.canSwitch };
      showScreen('app');
      addAccountButton();
      const s = document.createElement('script');
      s.src = 'js/commitments.js?v=' + encodeURIComponent(document.documentElement.dataset.version || '');
      document.body.appendChild(s);
    } catch (err) {
      showAuth('Could not open ActionRegister: ' + friendly(err));
    } finally {
      entering = false;
    }
  }

  async function start() {
    if (!sb) { showAuth(); return; }
    if (linkError) showAuth('That link didn\'t work: ' + linkError + '. Ask for a new one below.');
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') showNewPassword();
      else if (event === 'SIGNED_IN' && session && !recovering) enter(session);
      else if (event === 'SIGNED_OUT' && opened) location.replace(appUrl());
    });
    const { data } = await sb.auth.getSession();
    if (recovering) return;
    if (data.session) enter(data.session);
    else if (!linkError) showAuth();
  }

  // ---- the old /api routes, answered by Supabase ------------------------------
  const STATUS = { AR400: 400, AR403: 403, AR404: 404, AR409: 409 };
  function reply(status, data) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => data,
      arrayBuffer: async () => data,
    };
  }
  function failed(error) {
    const msg = (error && error.message) || String(error);
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) throw new Error('No internet connection.');
    return reply(STATUS[error && error.code] || 500, { error: STATUS[error && error.code] ? msg : friendly(error) });
  }
  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw error;
    return data;
  }
  const bucket = () => sb.storage.from(CFG.bucket);
  async function removeStored(keys) {
    if (keys && keys.length) await bucket().remove(keys).catch(() => {});
  }

  async function apiFetch(url, opts) {
    const o = opts || {};
    const method = (o.method || 'GET').toUpperCase();
    const h = o.headers || {};
    const as = h['X-Acting-As'] ? decodeURIComponent(h['X-Acting-As']) : null;
    const base = h['X-Base-Version'] || null;
    const u = new URL(url, location.href);
    const [col, id] = u.pathname.split('/api/')[1].split('/').map(decodeURIComponent);
    const body = typeof o.body === 'string' ? JSON.parse(o.body) : o.body;
    try {
      if (col === 'state' && method === 'GET') {
        return reply(200, await rpc('ar_state', { p_stamp: u.searchParams.get('stamp') }));
      }
      if (col === 'projects' || col === 'subplans') {
        const one = col === 'projects' ? 'project' : 'subplan';
        if (method === 'PUT') return reply(200, await rpc('ar_put_' + one, { p_id: id, p_body: body, p_base: base, p_as: as }));
        if (method === 'DELETE') { await removeStored(await rpc('ar_delete_' + one, { p_id: id, p_as: as })); return reply(204, null); }
      }
      if (col === 'members') {
        if (method === 'GET') return reply(200, await rpc('ar_members_list'));
        if (method === 'POST') {
          return reply(200, await rpc('ar_add_member', {
            p_email: body.email, p_name: body.displayName, p_dept: body.department || null, p_role: body.role || 'manager',
            p_is_admin: !!body.isAdmin, p_sees_all_files: !!body.seesAllFiles,
          }));
        }
        if (method === 'PATCH') return reply(200, await rpc('ar_rename_member', { p_id: Number(id), p_new: body.name }));
        if (method === 'PUT') {
          await rpc('ar_update_member', {
            p_id: Number(id), p_dept: body.department || null, p_role: body.role, p_is_admin: !!body.isAdmin,
            p_sees_all_files: !!body.seesAllFiles, p_is_active: body.isActive !== false, p_email: body.email || null,
          });
          return reply(204, null);
        }
      }
      if (col === 'files') {
        if (method === 'POST') {
          const file = body.get('file');
          const r = await rpc('ar_file_begin', { p_kind: body.get('kind'), p_parent: body.get('parentId'), p_name: file.name, p_size: file.size, p_as: as });
          const up = await bucket().upload(r.key, file, { contentType: file.type || 'application/octet-stream', upsert: false });
          if (up.error) {
            await rpc('ar_file_delete', { p_id: r.id, p_as: as }).catch(() => {});
            return reply(500, { error: 'Upload failed: ' + friendly(up.error) });
          }
          return reply(200, { id: r.id, name: r.name, size: r.size, by: r.by, at: r.at });
        }
        if (method === 'GET') {
          const r = await rpc('ar_file_key', { p_id: id, p_as: as });
          const dl = await bucket().download(r.key);
          if (dl.error) return reply(404, { error: 'The stored file is missing.' });
          return reply(200, await dl.data.arrayBuffer());
        }
        if (method === 'DELETE') {
          const r = await rpc('ar_file_delete', { p_id: id, p_as: as });
          await removeStored(r && r.key ? [r.key] : []);
          return reply(204, null);
        }
      }
      return reply(404, { error: 'Unknown request.' });
    } catch (error) {
      return failed(error);
    }
  }

  // ---- "Install app" (add to the phone's home screen) --------------------
  // Chrome/Edge offer installing once sw.js is registered; we show our own button for it.
  // iPhone Safari never offers it, and Samsung Internet's installs get blocked by Google Play Protect,
  // so for those the button explains what to do instead (same as Flexo Todo).
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSamsungBrowser = /SamsungBrowser/i.test(navigator.userAgent);
  let installPrompt = null;
  const showInstall = (on) => document.querySelectorAll('.install-btn').forEach((b) => { b.hidden = !on; });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    if (!isSamsungBrowser) installPrompt = e;
    showInstall(true);
  });
  window.addEventListener('appinstalled', () => { showInstall(false); toast('ActionRegister was added to your home screen.'); });
  async function install() {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      showInstall(false);
    } else if (isSamsungBrowser) {
      if (confirm('Please install ActionRegister from Chrome.\n\nInstalling from Samsung Internet gets blocked by Google Play Protect ("Unsafe app blocked"). '
        + 'That is a Samsung problem, not the app.\n\nOpen this page in Chrome now? Then tap ⋮ → "Add to home screen" → Install.')) {
        location.href = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;package=com.android.chrome;end';
      }
    } else {
      alert('To install on iPhone/iPad:\n\n1. Tap the Share button (square with an arrow) at the bottom of Safari\n2. Choose "Add to Home Screen"\n3. Tap "Add"');
    }
  }
  function addInstallButton(where, cls) {
    if (!where) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'install-btn ' + cls;
    b.textContent = 'Install app';
    b.hidden = !(installPrompt || ((isIOS || isSamsungBrowser) && !standalone));
    b.addEventListener('click', install);
    where.appendChild(b);
  }
  addInstallButton(document.querySelector('.ar-card'), 'ar-link ar-install');

  window.ARCloud = { fetch: apiFetch, client: sb, friendly };
  start();
})();
