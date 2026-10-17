/*
 * One-time import of the old on-premise Commitments data (supabase/schema.sql → ar_import, Flexo admins only).
 * Reads the export JSON and the copied C:\COMMITMENTS_FILES folder in the browser, then uploads the attachments
 * to the private storage bucket under the paths ar_import returns.
 */
(function () {
  'use strict';
  const CFG = window.AR_CONFIG;
  const $ = (id) => document.getElementById(id);
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
    auth: { flowType: 'implicit', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
  });
  const log = (line) => { $('log').hidden = false; $('log').textContent += line + '\n'; };

  async function start() {
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      $('who').innerHTML = 'Sign in to <a href="./">ActionRegister</a> first (as a Flexo admin), then come back to this page.';
      return;
    }
    $('who').textContent = 'Signed in as ' + data.session.user.email + '.';
    $('form').hidden = false;
  }

  $('go').addEventListener('click', async () => {
    const file = $('exportFile').files[0];
    if (!file) { alert('Choose the export file first.'); return; }
    const folder = [...$('filesFolder').files];
    $('go').disabled = true;
    $('log').textContent = '';
    try {
      const data = JSON.parse(await file.text());
      log('Export from ' + data.source + ' (' + data.exportedAt + '): ' + data.members.length + ' people, ' +
        data.projects.length + ' projects, ' + data.subplans.length + ' sub plans, ' + data.files.length + ' attachments.');
      if (data.files.length && !folder.length && !confirm('No attachments folder chosen. Import without the attachment files?')) return;
      const { data: res, error } = await sb.rpc('ar_import', { p_data: data, p_replace: $('replace').checked });
      if (error) throw error;
      log('Imported ' + res.projects + ' projects, ' + res.subplans + ' sub plans and ' + res.members + ' people.');

      // Files in the chosen folder, by their path inside it (e.g. "202610/abc.xlsx").
      const byPath = new Map(folder.map((f) => [f.webkitRelativePath.split('/').slice(1).join('/').toLowerCase(), f]));
      let done = 0;
      const missing = [];
      for (const u of res.uploads) {
        const f = byPath.get(u.source.toLowerCase());
        if (!f) { missing.push(u.source); continue; }
        const up = await sb.storage.from(CFG.bucket).upload(u.key, f, { contentType: f.type || 'application/octet-stream', upsert: false });
        if (up.error && !/exists|duplicate/i.test(up.error.message)) { missing.push(u.source + ' (' + up.error.message + ')'); continue; }
        done++;
        log('  uploaded ' + u.source);
      }
      log('Attachments uploaded: ' + done + ' of ' + res.uploads.length + '.');
      if (missing.length) log('Not uploaded:\n  ' + missing.join('\n  '));
      if (res.noAccount.length) {
        log('\nThese people have no Flexo account yet (invite them in Supabase → Authentication → Users → Invite user,' +
          ' using the email shown in ActionRegister → Access):\n  ' + res.noAccount.join('\n  '));
      }
      log('\nDone. People with a Flexo account were given ActionRegister access.');
    } catch (err) {
      log('Import failed: ' + ((err && (err.message || JSON.stringify(err))) || err));
    } finally {
      $('go').disabled = false;
    }
  });

  start();
})();
