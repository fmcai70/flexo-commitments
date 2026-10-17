(function(){
const CFG = window.__CFG || {};
const PRES = 'President Romy', COO = 'COO VLI', EXECS = [PRES, COO];
const isExec = n => EXECS.includes(n);
const S = { plan: 'all', recent: {}, subplans: {},
  projects: [], team: { managers: [] }, db: null, live: false, ready: false,
  me: null, tab: null, month: null, selDay: null, filter: 'all', calMode: 'all',
  open: {}, drafts: {}
};
const pad = n => String(n).padStart(2,'0');
let now = new Date();
let TODAY = now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());
S.sync = { at: null, state: 'connecting', changed: 0 };
const hhmm = d => d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';
function liveBadge(){
  const el = document.getElementById('live'); if (!el) return;
  const st = S.sync.state;
  el.className = 'live ' + st;
  el.innerHTML = st === 'live' ? `<i></i>Live · synced ${hhmm(S.sync.at)}` : st === 'offline' ? `<i></i>Offline, reconnecting…` : st === 'local' ? `<i></i>Not shared` : `<i></i>Connecting…`;
  el.title = st === 'live' ? 'Changes by any manager appear here instantly. No refresh needed.' : '';
}
setInterval(() => { if (Object.keys(S.recent).some(k => Date.now() - S.recent[k] >= 600000)) { Object.keys(S.recent).forEach(k => { if (Date.now() - S.recent[k] >= 600000) delete S.recent[k]; }); render(); } const n = new Date(), t = n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate()); now = n; if (t !== TODAY) { TODAY = t; render(); } }, 60000);
S.month = TODAY.slice(0,7); S.selDay = TODAY;
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = d => { if(!d) return ''; const [y,m,dd]=d.split('-').map(Number); return MON[m-1]+' '+dd+(y!==now.getFullYear()?', '+y:''); };
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const initials = n => { const w=String(n||'?').replace(/^(President|Pres\.)\s+/i,'').trim().split(/\s+/); return (w.length>1 ? w[0][0]+w[1][0] : w[0].slice(0,2)).toUpperCase(); };
const firstName = n => String(n||'').split(/\s+/)[0];

// Everyone starts as themself. Admins may switch ("Viewing as"); an admin who isn't on the list picks a person first.
S.me = CFG.me || (CFG.canSwitch ? null : PRES);

/* ---------- status logic ---------- */
function pStatus(p){
  if (p.progress) return (p.done || p.progress.status === 'done') ? 'done' : p.progress.status;
  const a = p.activities || [];
  if (p.done || (a.length && a.every(x => x.status === 'done'))) return 'done';
  if (a.some(x => x.status !== 'todo')) return 'prog';
  return 'none';
}
const isLate = (st, due) => st !== 'done' && due && due < TODAY;
function pCls(p){ const s = pStatus(p); return isLate(s, p.commitDate) ? 'late' : s; }
/* ---- recurring activities ---- */
const DOWN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], ORD = ['1st','2nd','3rd','4th','last'];
const ds = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const pd = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
const isRec = a => !!(a && a.repeat && a.repeat !== 'none' && a.due);
function nthDow(y, m, dow, n){ const first = new Date(y, m, 1), last = new Date(y, m + 1, 0).getDate(); let day = 1 + (dow - first.getDay() + 7) % 7 + 7 * (Math.min(n, 5) - 1); if (n >= 5 || day > last) { day = 1 + (dow - first.getDay() + 7) % 7; while (day + 7 <= last) day += 7; } return ds(new Date(y, m, day)); }
function repLabel(a){
  if (!isRec(a)) return ''; const d = pd(a.due), n = Math.ceil(d.getDate() / 7);
  const base = a.repeat === 'weekly' ? 'Every ' + DOWN[d.getDay()] : a.repeat === 'monthly-nth' ? ORD[Math.min(n,5)-1] + ' ' + DOWN[d.getDay()] + ' of every month' : 'Day ' + d.getDate() + ' of every month';
  return base + (a.until ? ' until ' + fmt(a.until) : '');
}
function occ(a, from, to){
  if (!a.due) return [];
  if (!isRec(a)) return a.due >= from && a.due <= to ? [a.due] : [];
  const out = [], start = pd(a.due), end = a.until && a.until < to ? a.until : to, n = Math.ceil(start.getDate() / 7);
  if (a.repeat === 'weekly') { let d = new Date(start); while (ds(d) < from) d.setDate(d.getDate() + 7); while (ds(d) <= end && out.length < 500) { out.push(ds(d)); d.setDate(d.getDate() + 7); } return out; }
  let y = start.getFullYear(), m = start.getMonth();
  for (let i = 0; i < 240; i++) {
    const s = a.repeat === 'monthly-nth' ? nthDow(y, m, start.getDay(), n) : ds(new Date(y, m, Math.min(start.getDate(), new Date(y, m + 1, 0).getDate())));
    if (s > end) break; if (s >= from && s >= a.due) out.push(s);
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}
function nextOcc(a){ const done = new Set(a.doneDates||[]); return occ(a, a.due, a.until || addDays(TODAY, 400)).find(x => !done.has(x)) || null; }
function missedOcc(a){ const done = new Set(a.doneDates||[]); return occ(a, a.due, addDays(TODAY, -1)).filter(x => !done.has(x)); }
function recCls(a){ if (!isRec(a)) return null; if (!nextOcc(a)) return 'done'; if (missedOcc(a).length) return 'late'; return (a.doneDates||[]).length ? 'prog' : 'todo'; }
const occCls = (a, date) => (a.doneDates||[]).includes(date) ? 'done' : date < TODAY ? 'late' : 'todo';

function aCls(a){ if (isRec(a)) return recCls(a); const s = a.status === 'done' ? 'done' : a.status === 'doing' ? 'prog' : 'todo'; return isLate(s, a.due) ? 'late' : s; }
function pct(p){ if (p.progress) return p.progress.status==='done' ? 100 : p.progress.status==='prog' ? (p.progress.pct||0) : 0; const a = p.activities || []; if (pStatus(p)==='done') return 100; if (!a.length) return 0; return Math.round(100 * a.filter(x=>x.status==='done').length / a.length); }
const LABEL = { done:'Done', prog:'In progress', todo:'Not started', none:'No estimate', late:'Overdue' };
const badge = c => `<span class="badge b-${c}">${LABEL[c]}</span>`;
const byId = id => S.projects.find(p => p.id === id);
const managers = () => (S.team.managers || []);
const isPres = () => isExec(S.me);
const PLAN = { SP:'Strategic plan', OP:'Operational plan', CM:'From co-managers' };
const approverOf = p => p.plan === 'CM' ? p.assignedBy : PRES;
const PJ = () => S.projects.filter(p => S.plan === 'all' || (S.plan === 'other' ? !p.plan : p.plan === S.plan));
const justBadge = p => (S.recent[p.id] && Date.now() - S.recent[p.id] < 600000) ? `<span class="badge b-new">Just updated by ${esc(firstName(p.updatedBy))}</span>` : '';
const planBadge = p => p.plan ? (p.plan==='CM' ? `<span class="badge b-cm">From ${esc(firstName(p.assignedBy))}</span>` : `<span class="badge ${p.plan==='SP'?'b-sp':'b-op'}">${p.plan==='SP'?'Strategic':'Operational'}</span>`) : '';
const withBadge = p => (p.coResp||[]).length ? `<span class="badge b-link">With: ${p.coResp.map(firstName).map(esc).join(', ')}</span>` : '';
const statOk = p => !S.stat || (S.stat.by === 'status' ? pStatus(p) === S.stat.s : pCls(p) === S.stat.s);
function statBar(n){
  if (!S.stat) return '';
  return `<div class="notice" style="background:var(--surface2);display:flex;align-items:center;gap:8px;flex-wrap:wrap">Showing <b>${S.stat.by==='status'&&S.stat.s!=='none'?PST[S.stat.s]:LABEL[S.stat.s]}</b>${S.plan!=='all'?' in '+esc(PLAN[S.plan]||'Other'):''}: ${n} project${n===1?'':'s'}<button class="btn ghost" style="padding:4px 10px;margin-left:auto" data-act="statclear">Show all</button></div>`;
}
function planBar(){
  const n = k => S.projects.filter(p => k==='all' || (k==='other' ? !p.plan : p.plan === k)).length;
  const opts = [['all','All plans'],['SP','Strategic'],['OP','Operational']];
  if (n('CM')) opts.push(['CM','Co-manager']);
  if (n('other')) opts.push(['other','Other']);
  return `<div class="calhead" style="margin:14px 0 0">${opts.map(o => `<button class="pillbtn" data-act="plan" data-v="${o[0]}" aria-pressed="${S.plan===o[0]}">${o[1]} <span class="muted">${n(o[0])}</span></button>`).join('')}</div>`;
}
const daysTo = d => { const [y,m,dd]=d.split('-').map(Number); return Math.round((new Date(y,m-1,dd) - new Date(now.getFullYear(),now.getMonth(),now.getDate()))/864e5); };
const pendingExt = p => p.extension && p.extension.status === 'pending' ? p.extension : null;
const dueSoon = p => pStatus(p) !== 'done' && p.commitDate && daysTo(p.commitDate) <= 7;
const needsCheckin = p => dueSoon(p) && !pendingExt(p) && !(p.checkin && p.checkin.forDeadline === p.commitDate);
function ciBadge(p){
  const e = pendingExt(p);
  if (e) return `<span class="badge b-prog">Extension to ${fmt(e.requested)} pending</span>`;
  if (needsCheckin(p)) return `<span class="badge b-late">Update required</span>`;
  if (p.checkin && p.checkin.forDeadline === p.commitDate && pStatus(p)!=='done') return p.checkin.status === 'ontrack' ? `<span class="badge b-done">On track · ${fmt(p.checkin.date)}</span>` : `<span class="badge b-prog">Needs review</span>`;
  return '';
}
const H = a => Array.isArray(a.helpers) ? a.helpers : (a.helper ? [a.helper] : []);
const setH = (a, list) => { a.helpers = [...new Set(list.filter(Boolean))]; delete a.helper; };
function helpPicker(selected, owner, act, attrs){
  const chips = selected.map(x => `<span class="chip">${esc(x)}<button class="x" data-act="${act}-rm" ${attrs} data-h="${esc(x)}" aria-label="Remove ${esc(x)}">×</button></span>`).join('');
  const left = managers().filter(m => m.name !== owner && !selected.includes(m.name));
  const sel = left.length ? `<select class="field" data-act="${act}" ${attrs} aria-label="Add help from"><option value="">${selected.length ? '+ Add another manager' : 'Help needed from…'}</option>${left.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('')}</select>` : '';
  return `<span class="chips" style="margin-top:0;align-items:center">${chips}${sel}</span>`;
}

/* ---------- storage ---------- */
const chains = {};
const saveErr = e => (e && e.message) || 'Change not saved.';
function saveProject(p){
  const body = JSON.parse(JSON.stringify(p)); delete body.id; body.updatedAt = new Date().toISOString(); body.updatedBy = S.me;
  const i = S.projects.findIndex(x => x.id === p.id);
  if (i >= 0) S.projects[i] = Object.assign({ id:p.id }, body); else S.projects.push(Object.assign({ id:p.id }, body));
  render();
  if (!S.db) return;
  chains[p.id] = (chains[p.id] || Promise.resolve()).then(() => S.db.doc('projects/' + p.id).set(body)).catch(e => {
    toast(saveErr(e));
  });
}
function mut(id, fn){ const p = byId(id); if (!p) return; const c = JSON.parse(JSON.stringify(p)); fn(c); if (pStatus(c)==='done') { if (!c.doneDate) c.doneDate = TODAY; } else c.doneDate = ''; saveProject(c); }
function deleteProject(id){
  S.projects = S.projects.filter(p => p.id !== id);
  S.projects.forEach(p => { if ((p.links||[]).includes(id)) mut(p.id, c => { c.links = c.links.filter(l => l !== id); }); });
  render();
  if (S.db) S.db.doc('projects/' + id).delete().catch(e => toast(saveErr(e)));
}
function ask(msg, yesLabel, onYes, onNo){
  let m = document.getElementById('askbox'); if (m) m.remove();
  m = document.createElement('div'); m.id = 'askbox'; m.className = 'askwrap'; m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true');
  m.innerHTML = `<div class="askcard"><div class="askmsg"></div><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-ask="no">Cancel</button><button class="btn" data-ask="yes"></button></div></div>`;
  m.querySelector('.askmsg').textContent = msg; m.querySelector('[data-ask="yes"]').textContent = yesLabel || 'Yes';
  const close = ok => { m.remove(); document.removeEventListener('keydown', key); (ok ? onYes : onNo || (() => {}))(); };
  const key = e => { if (e.key === 'Escape') close(false); };
  m.addEventListener('click', e => { const b = e.target.closest('[data-ask]'); if (b) close(b.dataset.ask === 'yes'); else if (e.target === m) close(false); });
  document.addEventListener('keydown', key);
  document.body.appendChild(m); m.querySelector('[data-ask="yes"]').focus();
}
let tt; function toast(m){ const t = document.getElementById('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 3200); }

/* ---------- signed-in user: the server resolves the Windows account to a manager name ---------- */
S.auth = { on: true, loaded: true, owner: !!CFG.isAdmin, id: CFG.me || 'admin', chose: false };
const boundName = () => CFG.me || null;
const locked = () => !CFG.canSwitch;
function gateNeeded(){ return !!CFG.canSwitch && !S.me && S.ready; }
const actingAsOther = () => !!CFG.canSwitch && !!S.me && S.me !== CFG.me;
function viewGate(){
  const people = EXECS.concat(managers().map(m => m.name));
  return `<h2>Who are you working as?</h2><div class="panel" style="padding:14px">
    <p class="muted" style="margin:0 0 10px">You're an administrator but not on the ActionRegister list yourself. Choose the person whose work you want to see or update.
    Everything you do is then saved as that person's action (the history notes it was you).</p>
    <div class="row">${people.map(n => `<button class="btn ghost" data-act="actas" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>`;
}
function switchTo(want){
  const un = unsavedIds();
  const go = () => { S.me = want; S.tab = null; S.drafts = {}; S.filter = 'all'; S.stat = null; render(); window.scrollTo(0, 0); };
  if (un.length) { renderHeader(); ask('You have ' + un.length + ' progress estimate' + (un.length>1?'s':'') + ' not saved yet. Switch and discard ' + (un.length>1?'them':'it') + '?', 'Discard and switch', go); return; }
  go();
}
S.members = null;
async function loadMembers(){ S.membersLoading = true; try { S.members = await (await api('GET', '/api/members')).json(); } catch(e){ S.members = []; toast(saveErr(e)); } S.membersLoading = false; render(); }
function viewAccess(){
  if (!S.members) { if (!S.membersLoading) loadMembers(); return `<p class="muted" style="margin-top:20px">Loading…</p>`; }
  const act = S.members.filter(m => m.isActive).length;
  let h = `<h2>People<small>${act} active of ${S.members.length}</small></h2><div class="panel" style="padding:4px 14px">` + S.members.map(m => `<div class="linkrow">
    <div class="t" style="font-weight:600">${esc(m.name)} ${m.role==='exec'?'<span class="badge b-sp">Executive</span>':''}${m.isAdmin?'<span class="badge b-op">Admin</span>':''}${m.seesAllFiles?'<span class="badge b-link">Sees all files</span>':''}${m.isActive?'':'<span class="badge b-late">Removed</span>'}${m.isActive && !m.email?'<span class="badge b-late">No email</span>':m.isActive && !m.hasAccount?'<span class="badge b-prog">No Flexo account yet</span>':m.isActive && !m.hasAccess?'<span class="badge b-late">No app access</span>':''}</div>
    <div class="muted" style="font-size:12.5px;margin-top:2px">${esc(m.dept)}${m.dept?' · ':''}${m.email?esc(m.email):'no email'}</div>
    <div class="row" style="margin-top:8px">
      <button class="btn ghost" style="padding:5px 10px" data-act="mflag" data-v="${m.id}" data-f="isAdmin">${m.isAdmin?'Remove admin':'Make admin'}</button>
      <button class="btn ghost" style="padding:5px 10px" data-act="mflag" data-v="${m.id}" data-f="seesAllFiles">${m.seesAllFiles?'Own files only':'See all files'}</button>
      <button class="btn ghost" style="padding:5px 10px" data-act="mflag" data-v="${m.id}" data-f="role">${m.role==='exec'?'Make manager':'Make executive'}</button>
      ${m.isActive && m.hasAccount && !m.hasAccess ? `<button class="btn" style="padding:5px 10px" data-act="mgrant" data-v="${m.id}">Give access</button>` : ''}
      <button class="btn ghost" style="padding:5px 10px" data-act="memail" data-v="${m.id}">${m.email?'Change email':'Add email'}</button>
      <button class="btn ${m.isActive?'danger':'ghost'}" style="padding:5px 10px" data-act="mflag" data-v="${m.id}" data-f="isActive">${m.isActive?'Remove':'Restore'}</button></div></div>`).join('') + `</div>`;
  h += `<h2>Add a person</h2><div class="panel form">
    <input class="field" type="email" data-draft="mem-email" placeholder="Flexo email, e.g. lourdes.villaflores@flexo.com.ph" aria-label="Flexo email" autocapitalize="off" autocorrect="off">
    <input class="field" data-draft="mem-name" placeholder="Name as shown in the app, e.g. Lou Villaflores" aria-label="Name">
    <input class="field" data-draft="mem-dept" placeholder="Department (optional)" aria-label="Department">
    <select class="field" data-draft="mem-role" aria-label="Role"><option value="manager">Manager</option><option value="exec">Executive (President / COO)</option></select>
    <div><button class="btn" data-act="addmember">Add person</button></div></div>
    <p class="muted" style="font-size:12.5px">People sign in with their Flexo account (the same email and password as Flexo Todo). Someone without an account yet needs an invite: Supabase → Authentication → Users → Invite user, using the email above. Then tap Give access here. A removed person keeps their projects and can be restored. Names can't be changed because projects refer to them.</p>`;
  return h;
}

/* ---------- Excel attachments ---------- */
const FILE_EXT = ['xlsx','xlsm','xls','csv'], MAX_FILE = 14 * 1024 * 1024;
const extOf = n => (String(n).split('.').pop() || '').toLowerCase();
const fsize = b => b > 1048576 ? (b/1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b/1024)) + ' KB';
const seesAllFiles = () => isExec(S.me) || (S.team.seesAll || []).includes(S.me);
function filesBlock(kind, id, files, owner, extra, canUpload){
  files = files || [];
  const full = seesAllFiles() || S.me === owner || (extra||[]).includes(S.me);
  const vis = full ? files : files.filter(f => f.by === S.me), hidden = files.length - vis.length;
  if (!vis.length && !canUpload && !hidden) return '';
  let h = `<div class="sub">Excel attachments <span class="muted" style="font-weight:500">optional</span></div><div class="files">`;
  h += vis.map(f => `<div class="frow"><span class="ficon">${extOf(f.name)==='csv'?'CSV':'XLS'}</span><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13.5px;word-break:break-word">${esc(f.name)}</div>
    <div class="muted" style="font-size:12px">${fsize(f.size)} · ${esc(firstName(f.by))} · ${fmt(f.at)}</div></div>
    <button class="btn ghost" style="padding:5px 10px" data-act="fview" data-v="${f.id}" data-n="${esc(f.name)}">View</button>
    <button class="btn ghost" style="padding:5px 10px" data-act="fdown" data-v="${f.id}" data-n="${esc(f.name)}">Download</button>
    ${(f.by === S.me || S.me === owner) && S.assets ? `<button class="x" data-act="fdel" data-k="${kind}|${id}" data-v="${f.id}" aria-label="Remove file">×</button>` : ''}</div>`).join('');
  if (hidden) h += `<div class="muted" style="font-size:12.5px;padding:4px 0">${hidden} more file${hidden>1?'s':''}, visible to the owner, President Romy, COO VLI and the CFO.</div>`;
  if (!vis.length && !hidden) h += `<div class="muted" style="font-size:13px;padding:2px 0 6px">None attached.</div>`;
  if (canUpload) h += S.assets ? `<label class="btn ghost" style="display:inline-block;margin-top:6px;cursor:pointer">Attach Excel file<input type="file" accept=".xlsx,.xlsm,.xls,.csv" style="display:none" data-act="fileup" data-k="${kind}|${id}"></label>`
    : `<div class="muted" style="font-size:12.5px">Attaching needs Contributor access to this page.</div>`;
  return h + `</div>`;
}
async function uploadFile(key, file){
  const [kind, id] = key.split('|');
  if (!FILE_EXT.includes(extOf(file.name))) { toast('Only Excel or CSV files (.xlsx, .xlsm, .xls, .csv).'); return; }
  if (file.size > MAX_FILE) { toast('File is over 14 MB. Please reduce it and try again.'); return; }
  toast('Uploading ' + file.name + '…');
  try {
    const fd = new FormData(); fd.append('kind', kind); fd.append('parentId', id); fd.append('file', file, file.name);
    const r = await (await api('POST', '/api/files', fd)).json();
    const meta = { id: r.id, name: r.name, size: r.size, by: S.me, at: TODAY };
    if (kind === 'p') mut(id, c => { c.files = (c.files||[]).concat(meta); });
    else { const sp = subOf(id); if (sp) { sp.files = (sp.files||[]).concat(meta); saveSub(id, true); render(); } }
    toast('Attached ' + file.name + '.');
  } catch (e) { toast(saveErr(e)); }
}
async function fetchFile(id){ const r = await api('GET', '/api/files/' + id); return new Uint8Array(await r.arrayBuffer()); }
let XLSX_P = null;
function loadXLSX(){ if (window.XLSX) return Promise.resolve(window.XLSX); if (!XLSX_P) XLSX_P = new Promise((res, rej) => { const add = (src, fail) => { const s = document.createElement('script'); s.src = src; s.onload = () => res(window.XLSX); s.onerror = fail; document.head.appendChild(s); }; add('vendor/xlsx-0.18.5.full.min.js', rej); }); return XLSX_P; }
async function viewFile(id, name){
  showSheet(name, null, 'Opening…');
  try {
    const [bytes, X] = await Promise.all([fetchFile(id), loadXLSX()]);
    const wb = extOf(name) === 'csv' ? X.read(new TextDecoder().decode(bytes), { type: 'string' }) : X.read(bytes, { type: 'array' });
    S.sheetView = { name, wb, idx: 0 }; drawSheet();
  } catch (e) { showSheet(name, null, 'Could not open this file.'); }
}
function drawSheet(){
  const v = S.sheetView, X = window.XLSX; if (!v) return;
  const ws = v.wb.Sheets[v.wb.SheetNames[v.idx]], rows = X.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const R = Math.min(rows.length, 400), C = Math.min(Math.max(0, ...rows.slice(0, R).map(r => r.length)), 40);
  let t = '<table class="sptable"><tbody>';
  for (let i = 0; i < R; i++) { t += '<tr><th>' + (i+1) + '</th>'; for (let j = 0; j < C; j++) t += '<td>' + esc(rows[i][j]) + '</td>'; t += '</tr>'; }
  t += '</tbody></table>';
  const tabs = v.wb.SheetNames.length > 1 ? `<div class="calhead" style="margin:0 0 8px">${v.wb.SheetNames.map((n, i) => `<button class="pillbtn" data-sheet="${i}" aria-pressed="${i===v.idx}">${esc(n)}</button>`).join('')}</div>` : '';
  showSheet(v.name, tabs + `<div class="scrollx" style="max-height:60vh;overflow:auto">${t}</div>` + (rows.length > R || C === 40 ? `<div class="muted" style="font-size:12px;margin-top:6px">Showing the first ${R} rows and up to 40 columns. Download for the full file.</div>` : ''));
}
function showSheet(name, body, msg){
  let m = document.getElementById('sheetbox'); if (!m) { m = document.createElement('div'); m.id = 'sheetbox'; m.className = 'askwrap'; document.body.appendChild(m);
    m.addEventListener('click', e => { const s = e.target.closest('[data-sheet]'); if (s) { S.sheetView.idx = Number(s.dataset.sheet); drawSheet(); return; } if (e.target === m || e.target.closest('[data-sheetclose]')) { m.remove(); S.sheetView = null; } }); }
  m.innerHTML = `<div class="askcard" style="max-width:min(1000px,96vw)"><div class="row" style="margin-top:0;justify-content:space-between"><b style="word-break:break-word">${esc(name)}</b><button class="btn ghost" data-sheetclose>Close</button></div><div style="margin-top:10px">${body || `<div class="muted">${esc(msg||'')}</div>`}</div></div>`;
}
async function downloadFile(id, name){
  try {
    let bytes = await fetchFile(id), fname = name, ext = extOf(name);
    if (ext === 'xls' || ext === 'xlsm') { const X = await loadXLSX(); const wb = X.read(bytes, { type: 'array' }); bytes = new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' })); fname = name.replace(/\.(xls|xlsm)$/i, '.xlsx'); }
    const url = URL.createObjectURL(new Blob([bytes])), a = document.createElement('a');
    a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) { toast('Download failed.'); }
}

/* ---------- rendering ---------- */
function tabsFor(){ const t = tabsFor0(); if (S.auth.owner) t.push(['access','Access']); return t; }
function tabsFor0(){
  if (isPres()) return [['cal','Calendar'],['req','Requests', S.projects.filter(p => pendingExt(p) && approverOf(p) === PRES).length],['mgrs','Managers'],['links','Connected work'],['assign','Assign']];
  const helpOpen = helpingMe().filter(x => x.a.status !== 'done').length;
  const due = S.projects.filter(p => p.owner === S.me && p.plan !== 'CM' && (needsCheckin(p) || pendingInputs(p).length)).length;
  const spCount = S.projects.filter(p => subOf(p.id) && subOf(p.id).assignee === S.me && p.owner !== S.me && spDue(p.id)).length;
  const cmCount = spCount + S.projects.filter(p => p.plan === 'CM' && p.owner === S.me && (needsCheckin(p) || !p.progress) && pStatus(p) !== 'done').length + S.projects.filter(p => pendingExt(p) && approverOf(p) === S.me).length;
  return [['dash','Dashboard'],['mine','MAIN plans', due],['help','From co-managers', helpOpen + cmCount],['cal','Calendar']];
}
function helpingMe(){
  const out = [];
  S.projects.forEach(p => (p.activities||[]).forEach(a => { if (H(a).includes(S.me) && p.owner !== S.me) out.push({ p, a }); }));
  return out;
}

function renderHeader(){
  const sel = document.getElementById('me');
  const opts = EXECS.concat(managers().map(m => m.name));
  if (S.ready && S.me && !opts.includes(S.me)) S.me = CFG.me && opts.includes(CFG.me) ? CFG.me : (CFG.canSwitch ? null : PRES);
  sel.innerHTML = (S.me ? '' : '<option value="" selected>Choose a person…</option>') + opts.map(o => `<option value="${esc(o)}" ${o===S.me?'selected':''}>${esc(o)}${o===CFG.me?' (you)':''}</option>`).join('');
  const lk = locked() || gateNeeded(); sel.style.display = lk ? 'none' : ''; let nm = document.getElementById('whoname');
  if (!nm) { nm = document.createElement('b'); nm.id = 'whoname'; nm.style.color = 'var(--ink)'; sel.parentNode.appendChild(nm); }
  nm.textContent = lk && !gateNeeded() ? (boundName() || 'Not signed in') : ''; nm.style.display = nm.textContent ? '' : 'none';
  // Admin working as someone else: say so plainly, all the time.
  let ban = document.getElementById('actas');
  if (!ban) { ban = document.createElement('div'); ban.id = 'actas'; ban.className = 'actas'; ban.setAttribute('role', 'status'); document.querySelector('header.top .bar').after(ban); }
  ban.hidden = !actingAsOther();
  if (actingAsOther()) ban.innerHTML = `<span>You're working as <b>${esc(S.me)}</b>. Changes are saved as theirs.</span>`
    + (CFG.me ? `<button class="btn" data-act="actas" data-v="${esc(CFG.me)}">Back to me</button>` : `<button class="btn" data-act="actas" data-v="">Change person</button>`);
  // Keep headings that we scroll to clear of the sticky header.
  document.documentElement.style.setProperty('--hdr', (document.querySelector('header.top').offsetHeight + 8) + 'px');
  const tabs = tabsFor();
  if (!tabs.some(t => t[0] === S.tab)) S.tab = tabs[0][0];
  document.getElementById('tabs').innerHTML = tabs.map(t => `<button role="tab" data-act="tab" data-v="${t[0]}" aria-selected="${t[0]===S.tab}">${t[1]}${t[2]?`<span class="n">${t[2]}</span>`:''}</button>`).join('');
}

function render(){
  const ae = document.activeElement, focusKey = ae && ae.dataset ? ae.dataset.draft : null;
  let selStart = null; try { selStart = ae && ae.selectionStart; } catch(e){}
  renderHeader(); liveBadge();
  const m = document.getElementById('main');
  let h = '';
  if (!S.live && S.ready) h += `<div class="notice">Shared storage isn't available in this view, so changes stay on this screen only. Open the published link to share with the team.</div>`;
  if (S.loadError) h += `<div class="notice" style="background:var(--late-bg)">Couldn't load the commitments: ${esc(S.loadError)} It keeps retrying every few seconds.</div>`;
  if (!S.ready || (S.auth.on && !S.auth.loaded)) h += `<p class="muted" style="margin-top:20px">Loading commitments…</p>`;
  else if (gateNeeded()) { h += viewGate(); document.getElementById('tabs').innerHTML = ''; }
  else if (S.tab === 'access') h += viewAccess();
  else if (S.tab === 'cal') h += viewCalendar();
  else if (S.tab === 'mgrs') h += viewManagers();
  else if (S.tab === 'links') h += viewLinks();
  else if (S.tab === 'assign') h += viewAssign();
  else if (S.tab === 'req') h += viewRequests();
  else if (S.tab === 'mine') h += viewMine();
  else if (S.tab === 'dash') h += viewMyDash();
  else if (S.tab === 'help') h += viewHelp();
  m.innerHTML = h;
  m.querySelectorAll('[data-draft]').forEach(el => { const k = el.dataset.draft; if (k in S.drafts && !Array.isArray(S.drafts[k])) el.value = S.drafts[k]; });
  if (focusKey){ const el = m.querySelector(`[data-draft="${CSS.escape(focusKey)}"]`); if (el){ el.focus(); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch(e){} } }
}

/* Calendar (President's main view, also available to managers) */
function calItems(){
  const map = {}, undated = [];
  const f = S.filter;
  PJ().forEach(p => {
    const involved = f === 'all' || p.owner === f || (subOf(p.id) && subOf(p.id).assignee === f) || (p.coResp||[]).includes(f) || (p.activities||[]).some(a => H(a).includes(f));
    if (!involved) return;
    if (p.commitDate) (map[p.commitDate] = map[p.commitDate] || []).push({ kind:'p', p });
    else undated.push(p);
    const [cy, cm] = S.month.split('-').map(Number), mFrom = S.month + '-01', mTo = S.month + '-' + pad(new Date(cy, cm, 0).getDate());
    if (S.calMode === 'all') (p.activities||[]).forEach(a => {
      if (!a.due) return;
      if (f !== 'all' && p.owner !== f && !H(a).includes(f)) return;
      if (isRec(a)) { if (pStatus(p) !== 'done') occ(a, mFrom, mTo).forEach(dt => (map[dt] = map[dt] || []).push({ kind:'ao', p, a, date: dt })); }
      else (map[a.due] = map[a.due] || []).push({ kind:'a', p, a });
    });
    const sp = subOf(p.id);
    if (S.calMode === 'all' && sp && !sp.complete && (f === 'all' || p.owner === f || sp.assignee === f)) spCycles(sp, mFrom, mTo).forEach(dt => (map[dt] = map[dt] || []).push({ kind:'sp', p, sp, date: dt }));
  });
  return { map, undated };
}
const narrowCal = () => window.innerWidth < 700;
function viewCalendar(){
  const [y, mo] = S.month.split('-').map(Number);
  const first = new Date(y, mo-1, 1), days = new Date(y, mo, 0).getDate(), lead = first.getDay();
  const { map, undated } = calItems();
  let g = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="dow">${d.slice(0,window.innerWidth<500?1:3)}</div>`).join('');
  for (let i = 0; i < lead; i++) g += `<div class="day pad"></div>`;
  for (let d = 1; d <= days; d++){
    const key = y+'-'+pad(mo)+'-'+pad(d), items = map[key] || [], dow = (lead + d - 1) % 7;
    const show = items.slice(0, 3).map(it => it.kind === 'p'
      ? `<span class="tag s-${pCls(it.p)}" data-act="jump" data-v="${key}" data-k="p-${it.p.id}" title="${esc(it.p.owner)}: ${esc(it.p.title)}">${esc(initials(it.p.owner))}${window.innerWidth>=700?' '+esc(it.p.title):''}</span>`
      : `<span class="tag act s-${itCls(it)}" data-act="jump" data-v="${key}" data-k="${itKey(it)}" title="${esc(itWho(it))}: ${esc(itText(it))}">${it.kind!=='a'?'↻ ':''}${esc(initials(itWho(it)))}${window.innerWidth>=700?' '+esc(itText(it)):''}</span>`).join('');
    g += `<button class="day ${key===TODAY?'today':''} ${key===S.selDay?'sel':''} ${dow===0||dow===6?'wk':''}" data-act="day" data-v="${key}" aria-label="${fmt(key)}, ${items.length} items"><span class="dn">${d}</span>${show}${items.length>3?`<span class="more" data-act="jump" data-v="${key}" data-k="">+${items.length-3} more</span>`:''}</button>`;
  }
  const opts = `<option value="all">All managers</option>` + managers().map(m => `<option ${S.filter===m.name?'selected':''} value="${esc(m.name)}">${esc(m.name)}</option>`).join('');
  let h = planBar() + `<div class="calhead">
    <button class="iconbtn" data-act="mon" data-v="-1" aria-label="Previous month">‹</button>
    <div class="month">${MONL[mo-1]} ${y}</div>
    <button class="iconbtn" data-act="mon" data-v="1" aria-label="Next month">›</button>
    <button class="pillbtn" data-act="mon" data-v="0">Today</button>
  </div>
  <div class="calhead" style="margin-top:0">
    <select data-act="filter" aria-label="Filter by manager">${opts}</select>
    <button class="pillbtn" data-act="calmode" data-v="proj" aria-pressed="${S.calMode==='proj'}">Projects only</button>
    <button class="pillbtn" data-act="calmode" data-v="all" aria-pressed="${S.calMode==='all'}">With activities</button>
  </div>
  <div class="legend"><span><i class="sw s-done"></i>Done</span><span><i class="sw s-prog"></i>In progress</span><span><i class="sw s-todo"></i>Not started</span><span><i class="sw s-none"></i>No estimate</span><span><i class="sw s-late"></i>Overdue</span><span><i class="sw" style="border:1.5px solid var(--ink2)"></i>Activity</span></div>
  <div class="grid">${g}</div>`;
  if (narrowCal()) {
    // Phones: the grid only fits initials, so list the whole month under it, day by day.
    const dates = Object.keys(map).filter(k => k.startsWith(y+'-'+pad(mo)+'-') && map[k].length).sort();
    h += `<h2 id="daylist-head">${MONL[mo-1]}<small>${dates.reduce((n, k) => n + map[k].length, 0)} due</small></h2>`;
    h += dates.length ? dates.map(k => `<h3 class="agday${k===TODAY?' today':''}" id="d-${k}">${DOWN[pd(k).getDay()].slice(0,3)}, ${fmt(k)}${k===TODAY?' · Today':''}</h3><div class="panel daylist">${map[k].map(dayItem).join('')}</div>`).join('')
      : `<div class="panel muted">Nothing due this month.</div>`;
  } else {
    // Day list
    const sel = map[S.selDay] || [];
    h += `<h2 id="daylist-head">${fmt(S.selDay)}<small>${sel.length ? sel.length + ' due' : 'Nothing due'}</small></h2>`;
    if (sel.length) h += `<div class="panel daylist">${sel.map(dayItem).join('')}</div>`;
  }
  if (isPres() || S.filter !== 'all') h += summaryPanel();
  if (undated.length){ const lim = S.showUndated ? undated.length : 8;
    h += `<h2>No commitment date yet<small>${undated.length}</small></h2><div class="panel">${undated.slice(0,lim).map(p => dayItem({kind:'p',p})).join('')}${undated.length>8?`<div style="padding-top:10px"><button class="btn ghost" data-act="undated">${S.showUndated?'Show fewer':'Show all '+undated.length}</button></div>`:''}</div>`; }
  return h;
}
const itCls = it => it.kind === 'ao' ? occCls(it.a, it.date) : it.kind === 'sp' ? spCycleCls(it.sp, it.date) : aCls(it.a);
const itKey = it => it.kind === 'ao' ? `o-${it.p.id}-${it.a.id}-${it.date}` : it.kind === 'sp' ? `s-${it.p.id}-${it.date}` : `a-${it.p.id}-${it.a.id}`;
const itWho = it => it.kind === 'sp' ? it.sp.assignee : it.p.owner;
const itText = it => it.kind === 'sp' ? 'Sub plan update: ' + it.sp.title : it.a.text;
function dayItem(it){
  if (it.kind === 'ao' || it.kind === 'sp'){
    const c = itCls(it), lbl = c === 'done' ? 'Done' : c === 'late' ? 'Missed' : 'Due';
    return `<div class="item" id="it-${itKey(it)}"><span class="bar4 s-${c}"></span><div><div class="t">↻ ${esc(itText(it))}</div>
      <div class="meta"><span class="badge b-${c==='todo'?'todo':c}">${lbl}</span> ${it.kind === 'sp' ? `Recurring sub plan update by ${esc(it.sp.assignee)} for ${esc(it.p.owner)} · ${SP_SCHED[it.sp.schedule]} · ${spPct(it.sp)}% filled` : `Recurring activity of ${esc(it.p.owner)} · ${esc(repLabel(it.a))}${H(it.a).length?' · help from '+esc(H(it.a).join(', ')):''}`}</div>
      <div class="meta">Project: ${esc(it.p.title)}</div></div></div>`;
  }
  if (it.kind === 'p'){
    const p = it.p, c = pCls(p), helpers = [...new Set((p.activities||[]).flatMap(H).filter(x=>x && x!==p.owner))];
    const links = (p.links||[]).map(byId).filter(Boolean);
    return `<div class="item" id="it-p-${p.id}"><span class="bar4 s-${c}"></span><div><div class="t">${esc(p.title)}</div>
      <div class="meta">${justBadge(p)}${badge(c)}${planBadge(p)} ${esc(p.owner)} · ${pct(p)}% · ${(p.activities||[]).length} activities${p.commitDate?' · due '+fmt(p.commitDate):''}</div>
      ${withBadge(p)?`<div class="meta">${withBadge(p)}</div>`:''}
      ${helpers.length||links.length?`<div class="meta">${helpers.map(x=>`<span class="badge b-link">Help: ${esc(firstName(x))}</span>`).join('')}${links.map(l=>`<span class="badge b-link">Linked: ${esc(short(l.title))} (${esc(firstName(l.owner))})</span>`).join('')}</div>`:''}
      ${ciBadge(p)?`<div class="meta">${ciBadge(p)}</div>`:''}
      ${p.progress?`<div class="meta"><b>${pct(p)}%</b> · ${esc(p.progress.remark)} <span class="muted">(${fmt(p.progress.date)})</span></div>`:p.note?`<div class="meta">Update: ${esc(p.note)} <span style="color:var(--late)">· no estimate yet</span></div>`:`<div class="meta" style="color:var(--late)">No estimate yet</div>`}</div></div>`;
  }
  const { p, a } = it, c = aCls(a);
  return `<div class="item" id="it-a-${p.id}-${a.id}"><span class="bar4 s-${c}"></span><div><div class="t">${esc(a.text)}</div>
    <div class="meta">${badge(c)} Activity of ${esc(p.owner)}${H(a).length?' · help from '+esc(H(a).join(', ')):''}</div>
    <div class="meta">Project: ${esc(p.title)}</div></div></div>`;
}
const short = t => t.length > 34 ? t.slice(0, 32) + '…' : t;

function summaryPanel(){
  const names = managers().map(m => m.name).filter(n => S.filter === 'all' || n === S.filter);
  const rows = names.map(n => {
    const ps = PJ().filter(p => p.owner === n);
    if (!ps.length) return '';
    const c = { done:0, prog:0, todo:0, none:0, late:0 }; ps.forEach(p => c[pCls(p)]++);
    const t = ps.length, w = k => (100*c[k]/t)+'%';
    const helping = PJ().reduce((s,p)=>s+(p.activities||[]).filter(a=>H(a).includes(n)&&p.owner!==n&&a.status!=='done').length,0);
    const dept = (managers().find(m=>m.name===n)||{}).dept;
    const avg = Math.round(ps.reduce((s,p)=>s+pct(p),0)/t), nu = ps.filter(p=>!p.progress && pStatus(p)!=='done').length;
    return `<div class="mgr"><div class="nm">${esc(n)}${dept?`<small>${esc(dept)}</small>`:''}</div>
      <div class="stack" title="${c.done} done, ${c.prog} in progress, ${c.todo} not started, ${c.none} no estimate, ${c.late} overdue"><i class="s-done" style="width:${w('done')}"></i><i class="s-prog" style="width:${w('prog')}"></i><i class="s-late" style="width:${w('late')}"></i><i class="s-todo" style="width:${w('todo')}"></i><i class="s-none" style="width:${w('none')}"></i></div>
      <div class="ct"><b style="color:var(--ink)">${avg}%</b> avg · ${c.done}/${t} done${nu?` · <b style="color:var(--late)">${nu} no estimate</b>`:''}${c.late?` · <b style="color:var(--late)">${c.late} late</b>`:''}${helping?` · helping ${helping}`:''}</div></div>`;
  }).join('');
  const all = PJ().filter(p => S.filter === 'all' || p.owner === S.filter);
  const k = { done:0, prog:0, todo:0, none:0, late:0 }; all.forEach(p => k[pCls(p)]++);
  const kpi = `<div class="kpis">${['done','prog','todo','none','late'].map(x => `<button class="kpi link" data-act="kpi" data-s="${x}" data-by="cls" aria-label="Show ${LABEL[x]} projects"><i class="sw s-${x}"></i><b>${k[x]}</b><span>${LABEL[x]}</span></button>`).join('')}<button class="kpi link" data-act="kpi" data-s="" aria-label="Show all projects"><b>${all.length ? Math.round(all.reduce((s,p)=>s+pct(p),0)/all.length) : 0}%</b><span>Avg progress</span></button></div>
  <div class="muted" style="font-size:12.5px;margin-top:6px">${all.filter(p=>p.progress).length} of ${all.length} projects have an owner's progress estimate${all.some(p=>p.progress&&daysTo(p.progress.date)>=-7)?`, ${all.filter(p=>p.progress&&daysTo(p.progress.date)>=-7).length} updated in the last 7 days`:''}.</div>` + (S.plan==='all' ? `<div class="kpis" style="margin-top:6px">${['SP','OP'].concat(all.some(p=>p.plan==='CM')?['CM']:[]).map(t => { const q = all.filter(p => p.plan===t), n = s => q.filter(p => pStatus(p)===s).length, avg = q.length ? Math.round(q.reduce((s,p)=>s+pct(p),0)/q.length) : 0;
      const lk = (s, lbl) => `<a href="#" class="klink" data-act="kpi" data-s="${s}" data-by="status" data-p="${t}">${n(s)} ${lbl}</a>`;
      return `<div class="kpi"><a href="#" class="klink" data-act="kpi" data-s="" data-p="${t}" style="text-decoration:none;color:inherit"><b>${avg}%</b></a><span>${PLAN[t]} avg progress</span><span>${lk('done','done')} · ${lk('prog','in progress')} · ${lk('todo','not started')} · ${lk('none','no estimate')}</span></div>`; }).join('')}</div>` : '');
  const done = all.filter(p => pStatus(p) === 'done').sort((a,b) => (b.doneDate||b.updatedAt||'').localeCompare(a.doneDate||a.updatedAt||''));
  const doneList = `<h2>Completed<small>${done.length}</small></h2>` + (done.length
    ? `<div class="panel">${done.map(p => { const onTime = !p.commitDate || !p.doneDate || p.doneDate <= p.commitDate;
        return `<div class="item"><span class="bar4 s-done"></span><div><div class="t">${esc(p.title)}</div><div class="meta">${badge('done')} ${esc(p.owner)}${p.doneDate?' · finished '+fmt(p.doneDate):''}${p.commitDate?' · committed '+fmt(p.commitDate):''}${p.doneDate&&p.commitDate?(onTime?' · <b style="color:var(--done)">on time</b>':' · <b style="color:var(--late)">late</b>'):''}</div></div></div>`; }).join('')}</div>`
    : `<div class="empty">No completed projects yet.</div>`);
  return `<h2>Dashboard${S.filter!=='all'?'<small>'+esc(S.filter)+'</small>':''}</h2>${kpi}<h2>Progress by manager</h2><div class="panel">${rows || '<div class="muted">No projects assigned yet.</div>'}</div>${doneList}`;
}

function viewManagers(){
  let h = planBar() + summaryPanel() + `<div id="list-head"></div>` + statBar(PJ().filter(statOk).length);
  managers().forEach(m => {
    const ps = PJ().filter(p => p.owner === m.name && statOk(p));
    if (!ps.length) return;
    const avg = Math.round(ps.reduce((s,p)=>s+pct(p),0)/ps.length);
    h += `<h2>${esc(m.name)}<small>${ps.length} project${ps.length>1?'s':''} · ${avg}% avg</small></h2><div class="panel" style="padding:4px 14px">` + sortP(ps).map((p, i) => progRow(p, false, i + 1)).join('') + `</div>`;
  });
  return h;
}
function sortP(ps){ const r = { late:0, prog:1, none:2, todo:3, done:4 }; return ps.slice().sort((a,b) => r[pCls(a)]-r[pCls(b)] || (a.commitDate||'9999').localeCompare(b.commitDate||'9999')); }

function viewLinks(){
  const help = [], links = [];
  S.projects.forEach(p => {
    (p.activities||[]).forEach(a => { if (H(a).some(x => x !== p.owner)) help.push({ p, a }); });
    (p.links||[]).forEach(id => { const q = byId(id); if (q) links.push({ p, q }); });
  });
  const inputs = S.projects.flatMap(p => (p.helperInputs||[]).map(x => ({ p, x }))).sort((a,b) => (b.x.date).localeCompare(a.x.date));
  let h = '';
  if (inputs.length) h += `<h2>Helper progress inputs<small>${inputs.filter(i=>i.x.state==='pending').length} awaiting owner</small></h2><div class="panel">${inputs.slice(0,30).map(({p,x}) => `<div class="linkrow"><div class="flow">${esc(firstName(x.by))}<span class="arrow">to</span>${esc(firstName(p.owner))}</div><div style="font-size:13px;margin:3px 0">${esc(p.title)}</div>${inputLine(x)}</div>`).join('')}</div>`;
  h += `<h2>Help between managers<small>${help.length}</small></h2>`;
  h += help.length ? `<div class="panel">${help.map(({p,a}) => { const c = aCls(a); return `<div class="linkrow">
    <div class="flow">${esc(firstName(p.owner))}<span class="arrow">asked</span>${esc(H(a).map(firstName).join(', '))}</div>
    <div style="margin-top:3px">${esc(a.text)}</div>
    <div class="meta muted" style="font-size:12.5px;margin-top:3px">${badge(c)}${a.due?'Due '+fmt(a.due)+' · ':''}${esc(p.title)}</div></div>`; }).join('')}</div>`
    : `<div class="empty">No manager has asked another for help yet.</div>`;
  h += `<h2>Connected projects<small>${links.length}</small></h2>`;
  h += links.length ? `<div class="panel">${links.map(({p,q}) => {
    const cp = pCls(p), cq = pCls(q), risk = cq !== 'done' && p.commitDate && q.commitDate && q.commitDate > p.commitDate;
    return `<div class="linkrow"><div class="flow">${esc(short(p.title))}<span class="arrow">connects to</span>${esc(short(q.title))}</div>
    <div class="meta muted" style="font-size:12.5px;margin-top:3px">${badge(cp)}${esc(firstName(p.owner))}${p.commitDate?' '+fmt(p.commitDate):''} &nbsp; ${badge(cq)}${esc(firstName(q.owner))}${q.commitDate?' '+fmt(q.commitDate):''}</div>
    ${risk?`<div style="font-size:12.5px;color:var(--late);margin-top:4px;font-weight:600">Timing risk: the connected project finishes after this one is due.</div>`:''}</div>`; }).join('')}</div>`
    : `<div class="empty">No projects are connected yet. Managers can connect related projects from their project cards.</div>`;
  return h;
}

function reqCard(p){ const e = p.extension; return `<div class="alert"><div class="t">${esc(p.title)}</div>
    <div class="meta">${esc(p.owner)} · ${pct(p)}% done · asked ${fmt(e.requestedAt)}</div>
    <div class="flow" style="margin-top:8px">${fmt(e.forDeadline)}<span class="arrow">to</span>${fmt(e.requested)}<span class="muted" style="font-weight:400;font-size:13px">(+${daysTo(e.requested)-daysTo(e.forDeadline)} days)</span></div>
    ${e.reason?`<div style="margin-top:6px">Reason: ${esc(e.reason)}</div>`:''}
    <textarea class="field" style="margin-top:8px" data-draft="rp-${p.id}" placeholder="Reply to ${esc(firstName(p.owner))} (optional)"></textarea>
    <div class="row"><button class="btn ok" data-act="approve" data-v="${p.id}">Approve new deadline</button><button class="btn danger" data-act="decline" data-v="${p.id}">Decline</button></div></div>`; }
function viewRequests(){
  const reqs = S.projects.filter(p => pendingExt(p) && approverOf(p) === PRES);
  let h = `<h2>Extension requests<small>${reqs.length}</small></h2>`;
  h += reqs.length ? reqs.map(reqCard).join('') : `<div class="empty">No extension requests waiting.</div>`;
  const cmReqs = S.projects.filter(p => pendingExt(p) && approverOf(p) !== PRES);
  if (cmReqs.length) h += `<h2>Between co-managers<small>${cmReqs.length} for the assigning manager to decide</small></h2><div class="panel">${cmReqs.map(p => `<div class="linkrow"><div class="flow">${esc(firstName(p.owner))}<span class="arrow">asked</span>${esc(firstName(p.assignedBy))}</div><div style="font-size:13px">${esc(p.title)}: ${fmt(p.extension.forDeadline)} to ${fmt(p.extension.requested)}</div></div>`).join('')}</div>`;
  const waiting = sortP(S.projects.filter(needsCheckin));
  h += `<h2>Awaiting manager update<small>${waiting.length}</small></h2>`;
  h += waiting.length ? `<div class="panel">${waiting.map(p => dayItem({kind:'p',p})).join('')}</div>` : `<div class="empty">All managers with deadlines this week have checked in.</div>`;
  const hist = S.projects.filter(p => (p.deadlineHistory||[]).length);
  if (hist.length) h += `<h2>Approved extensions<small>${hist.length}</small></h2><div class="panel">${hist.map(p => `<div class="item"><span class="bar4 s-${pCls(p)}"></span><div><div class="t">${esc(p.title)}</div><div class="meta">${esc(p.owner)} · ${p.deadlineHistory.map(x => fmt(x.from)+' → '+fmt(x.to)).join(', ')}</div></div></div>`).join('')}</div>`;
  return h;
}
function viewAssign(){
  const mopts = managers().map(m => `<option>${esc(m.name)}</option>`).join('');
  let h = `<h2>Assign a project</h2><div class="panel form">
    <input class="field" data-draft="new-title" placeholder="Project, e.g. Reduce interest expense" aria-label="Project title">
    <div class="row" style="margin-top:0"><select class="field grow" data-draft="new-owner" aria-label="Manager">${mopts}</select>
    <input class="field" type="date" data-draft="new-date" aria-label="Target date"></div>
    <select class="field" data-draft="new-plan" aria-label="Plan type"><option value="SP">Strategic plan</option><option value="OP">Operational plan</option></select>
    <textarea class="field" data-draft="new-note" placeholder="Instructions or expected outcome (optional)" aria-label="Instructions"></textarea>
    <div><button class="btn" data-act="assign">Assign project</button></div></div>`;
  h += `<h2>Add an activity for a manager</h2><div class="panel form">${planForm(S.drafts['r-owner']||'', 'r', true)}</div>`;
  if (S.auth.owner) h += `<p class="muted" style="font-size:12.5px">Managers and their roles are changed on the <b>Access</b> tab.</p>`;
  return h;
}

function planForm(owner, k, forRomy){
  const ps = owner ? S.projects.filter(p => p.owner === owner && (forRomy || p.plan !== 'CM')) : [];
  const cur = S.drafts[k+'-proj'] || '';
  const popts = `<option value="">Choose a project…</option>` + (()=>{ const o = sortP(ps).filter(p => pStatus(p)!=='done'), d = sortP(ps).filter(p => pStatus(p)==='done');
    const opt = (p, pre) => `<option value="${p.id}" ${p.id===cur?'selected':''}>${pre}${esc(short(p.title))}</option>`;
    return (o.length?`<optgroup label="Open">${o.map(p=>opt(p,'')).join('')}</optgroup>`:'') + (d.length?`<optgroup label="Completed">${d.map(p=>opt(p,'✓ ')).join('')}</optgroup>`:''); })();
  let h = '';
  if (forRomy) h += `<select class="field" data-act="rowner" aria-label="Manager"><option value="">Choose a manager…</option>${managers().map(m => `<option ${m.name===owner?'selected':''} value="${esc(m.name)}">${esc(m.name)}</option>`).join('')}</select>`;
  if (!owner) return h;
  if (!ps.length) return h + `<div class="muted" style="font-size:13px">${forRomy ? esc(firstName(owner)) + ' has no projects. Assign one above first.' : 'No projects yet. Add one below.'}</div>`;
  return h + `<select class="field" data-act="pickproj" data-k="${k}" aria-label="Project">${popts}</select>
    <input class="field" data-draft="${k}-text" placeholder="Activity to complete" aria-label="Activity">
    <div class="row" style="margin-top:0"><label for="${k}-date">Deadline</label><input id="${k}-date" class="field" type="date" data-draft="${k}-date">${repSelect(S.drafts[k+'-rep'], `data-draft="${k}-rep"`)}</div>
    <div>${helpPicker(S.drafts[k+'-help']||[], owner, 'dhelp', `data-k="${k}-help"`)}</div>
    <div><button class="btn" data-act="quickact" data-k="${k}" data-o="${esc(owner)}">Add activity</button></div>`;
}
function quickAdd(ps){
  let h = `<h2>Add to MAIN plans</h2><div class="panel form">` + planForm(S.me, 'q', false);
  h += `<div class="sub" style="margin-top:6px">Or add a project of your own</div>
    <input class="field" data-draft="own-title" placeholder="Project title" aria-label="Own project title">
    <select class="field" data-draft="own-plan" aria-label="Plan type"><option value="OP">Operational plan</option><option value="SP">Strategic plan</option></select>
    <div class="row" style="margin-top:0"><label for="own-date">Deadline</label><input id="own-date" class="field" type="date" data-draft="own-date"></div>
    <div><button class="btn ghost" data-act="ownproj">Add project</button></div></div>`;
  return h;
}
function checkinBox(p){
  const d = daysTo(p.commitDate), rev = S.open['rev-'+p.id];
  const when = d < 0 ? `was due ${fmt(p.commitDate)} (${-d} day${d===-1?'':'s'} ago)` : d === 0 ? 'is due today' : `is due ${fmt(p.commitDate)} (in ${d} day${d===1?'':'s'})`;
  const dec = p.extension && p.extension.status === 'declined' && p.extension.forDeadline === p.commitDate ? `<div style="font-size:12.5px;color:var(--late);margin-top:4px">${esc(p.extension.decidedBy||'President Romy')} declined the extension to ${fmt(p.extension.requested)}${p.extension.reply?': '+esc(p.extension.reply):''}.</div>` : '';
  let h = `<div class="alert"><div class="t">${esc(p.title)}</div><div class="meta">This project ${when}. Please confirm where it stands.</div>${dec}
    <div class="row" style="margin-top:8px"><button class="btn ${S.open['ci-'+p.id]?'ok':'ghost'}" data-act="citoggle" data-v="${p.id}">On track</button><button class="btn ${rev?'':'ghost'}" data-act="revtoggle" data-v="${p.id}">Needs further review</button></div>`;
  if (S.open['ci-'+p.id]) h += `<div style="margin-top:6px">${progForm(p)}</div>`;
  if (rev) h += revForm(p);
  return h + `</div>`;
}
function revForm(p){
  return `<div class="form" style="margin-top:10px"><div class="row" style="margin-top:0"><label for="rd-${p.id}">Revised deadline</label><input id="rd-${p.id}" class="field" type="date" data-draft="rd-${p.id}" ${p.commitDate?`min="${p.commitDate}"`:''}></div>
    <textarea class="field" data-draft="rr-${p.id}" placeholder="What needs review and why more time is needed"></textarea>
    <div><button class="btn" data-act="sendext" data-v="${p.id}">Request extension from ${approverOf(p) === PRES ? 'President Romy / COO' : esc(approverOf(p))}</button></div></div>`;
}
const PST = { todo:'Not started', prog:'In progress', done:'Done' };
function progSummary(p){
  const g = p.progress;
  if (!g) return `<div class="row muted" style="font-size:13px">No progress estimate yet.${p.note?' Last note: '+esc(p.note):''}</div>`;
  return `<div class="pgline"><div class="pgbar"><i class="s-${g.status==='done'?'done':g.status==='prog'?'prog':'todo'}" style="width:${pct(p)}%"></i></div><b>${pct(p)}%</b></div>
    <div style="font-size:13px;margin-top:4px">${badge(g.status==='done'?'done':g.status)} ${esc(g.remark)}</div>
    <div class="muted" style="font-size:12px;margin-top:2px">Estimated by ${esc(g.by||p.owner)} on ${fmt(g.date)}</div>`;
}
const hasDraft = id => { const p = byId(id), g = (p && p.progress) || {}, st = S.drafts['pg-st-'+id], rm = S.drafts['pg-rm-'+id], pc = S.drafts['pg-pct-'+id];
  return !!((st && st !== g.status) || (rm != null && rm.trim() && rm.trim() !== (g.remark||'')) || (pc != null && Number(pc) !== (g.pct||50) && (st||g.status) === 'prog')); };
const unsavedIds = () => [...new Set(Object.keys(S.drafts).filter(k => /^pg-(st|rm|pct)-/.test(k) && String(S.drafts[k]).trim()).map(k => k.replace(/^pg-(st|rm|pct)-/, '')))];
function progForm(p){
  const g = p.progress || {}, editing = !p.progress || S.open['pe-'+p.id];
  let h = `<div class="sub">Progress estimate <span class="muted" style="font-weight:500">required</span></div>`;
  if (!editing) return h + progSummary(p) + `<div class="row" style="margin-top:8px"><button class="btn ghost" data-act="peopen" data-v="${p.id}">Update estimate</button></div>`;
  const st = S.drafts['pg-st-'+p.id] || g.status || '', v = S.drafts['pg-pct-'+p.id] || (g.status==='prog' ? g.pct : 50);
  h += `<div class="seg" role="radiogroup" aria-label="Status">${['todo','prog','done'].map(k => `<button role="radio" aria-checked="${st===k}" class="${st===k?'on s-'+k:''}" data-act="pgst" data-v="${p.id}" data-s="${k}">${PST[k]}</button>`).join('')}</div>`;
  if (st === 'prog') h += `<div class="row"><label for="pgp-${p.id}">Percent complete</label><input id="pgp-${p.id}" type="range" min="5" max="95" step="5" value="${v}" data-draft="pg-pct-${p.id}" data-lbl="pgl-${p.id}" style="flex:1 1 140px"><b id="pgl-${p.id}" style="min-width:40px">${v}%</b></div>`;
  else if (st) h += `<div class="row muted" style="font-size:13px">${st==='done'?'Counts as 100% and marks the project complete.':'Counts as 0%.'}</div>`;
  h += `<textarea class="field" style="margin-top:8px" data-draft="pg-rm-${p.id}" placeholder="Remarks (required): what's done, what's next, any blocker">${esc(g.remark||'')}</textarea>
    <div class="row" style="margin-top:6px"><button class="btn" data-act="pgsave" data-v="${p.id}">Save progress</button>${p.progress?`<button class="btn ghost" data-act="pecancel" data-v="${p.id}">Cancel</button>`:''}${S.pgErr===p.id?'<span class="unsaved" style="color:var(--late)">Add a remark before saving.</span>':hasDraft(p.id)?'<span class="unsaved">Not saved yet. Tap Save progress.</span>':''}</div>`;
  return h;
}
function progRow(p, edit, n){
  const c = pCls(p), g = p.progress;
  return `<button class="prow${n?' numbered':''}" data-act="toggle" data-v="${p.id}" aria-expanded="${!!S.open[p.id]}">${numBox(n)}<div class="prbody">
    <div class="pt">${esc(p.title)}</div>
    <div class="pgline"><div class="pgbar"><i class="s-${c}" style="width:${pct(p)}%"></i></div><b>${pct(p)}%</b></div>
    <div class="meta">${justBadge(p)}${badge(c)}${planBadge(p)}${spSummary(p)}${p.commitDate?'Due '+fmt(p.commitDate):'No date'}${g?` · updated ${fmt(g.date)}`:' · <b style="color:var(--late)">no estimate yet</b>'}</div>
    ${g?`<div class="meta">${esc(g.remark)}${g.basedOn?` <span class="muted">(with input from ${esc(firstName(g.basedOn))})</span>`:''}</div>`:''}${pendingInputs(p).length?`<div class="meta"><span class="badge b-prog">${pendingInputs(p).length} helper input awaiting owner</span></div>`:''}</div></button>${S.open[p.id]?card(p,!!edit):''}`;
}
function viewMyDash(){
  const me = S.me, mine = PJ().filter(p => p.owner === me);
  const keep = S.filter; S.filter = me;
  let h = planBar() + summaryPanel().replace('<h2>Progress by manager</h2>', '<h2>My progress</h2>');
  S.filter = keep;
  const list = (title, ps, empty) => `<h2>${title}<small>${ps.length}</small></h2>` + (ps.length ? `<div class="panel" style="padding:4px 14px">${sortP(ps).map((p, i) => progRow(p, true, i + 1)).join('')}</div>` : `<div class="empty">${empty}</div>`);
  const open = mine.filter(p => pStatus(p) !== 'done');
  const attention = open.filter(p => spDue(p.id) || pCls(p) === 'late' || needsCheckin(p) || !p.progress || pendingInputs(p).length);
  const soon = open.filter(p => p.commitDate && daysTo(p.commitDate) >= 0 && daysTo(p.commitDate) <= 14);
  const stale = open.filter(p => p.progress && daysTo(p.progress.date) < -14);
  h += list('Needs your attention', attention, 'All your open projects have a current estimate. Nice.');
  h += list('Due in the next 14 days', soon, 'Nothing due in the next two weeks.');
  if (stale.length) h += list('Estimate older than 2 weeks', stale, '');
  const hp = helpProjects(me), acts = helpingMe().filter(x => x.a.status !== 'done');
  h += `<h2>Helping others<small>${hp.length} projects · ${acts.length} open activities</small></h2>`;
  h += hp.length ? `<div class="panel" style="padding:4px 14px">${sortP(hp).slice(0, 8).map(p => { const mineIn = (p.helperInputs||[]).filter(x => x.by === me).pop();
      return `<div class="prow" style="cursor:default"><div class="pt">${esc(p.title)}</div><div class="pgline"><div class="pgbar"><i class="s-${pCls(p)}" style="width:${pct(p)}%"></i></div><b>${pct(p)}%</b></div>
      <div class="meta">${badge(pCls(p))}Owner: ${esc(p.owner)}${p.commitDate?' · due '+fmt(p.commitDate):''}${mineIn?` · your input: ${mineIn.state==='pending'?'awaiting owner':mineIn.state==='accepted'?'accepted':'not accepted'}`:''}</div></div>`; }).join('')}${hp.length>8?`<div style="padding:10px 0"><button class="btn ghost" data-act="tab" data-v="help">See all ${hp.length}</button></div>`:''}</div>`
    : `<div class="empty">You're not helping on any project yet.</div>`;
  return h;
}
/* ---- connected-project suggestions ---- */
const STOP = new Set(('the a an and or of to for in on at by with from as is are be this that it its per via into than then also all any each other our your their we us can may will shall should need needs needed next last new done ongoing going update updated status responsible target date dates meeting meet provide complete completion finalize review follow check get set using use used based since before after still only more most less '+
  'project projects plan plans program item items team week month july august september october november december jan feb mar apr may jun sept aug sep oct nov dec monday friday tba day days '+
  'sir said per todoist recurring every lead monitor monitoring implement implementation development develop approval have against key minimum fixed system management process presentation online purchase reduce reduction recover sale cover delivery customer timeline product business action actions within should increase support grow various '+
  'identify explore determine evaluate evaluation coordinate coordination ensure consistently achieve regular list present all further off company execution').split(/\s+/));
let SIDX = { ref: null };
const stem = w => w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
function toks(s, names){ return (String(s||'').toLowerCase().match(/[a-z][a-z0-9&]+/g) || []).filter(w => !STOP.has(w)).map(stem).filter(w => w.length > 2 && !STOP.has(w) && !names.has(w)); }
function suggestIndex(){
  if (SIDX.ref === S.projects) return SIDX;
  const names = new Set(managers().flatMap(m => m.name.toLowerCase().split(/\s+/)).concat(['romy','vli','coo','jake','isidro','noriel','maling','kenneth','ong','gina','cubelo','christelle','ellot','melissa','cristine']));
  const docs = S.projects.map(p => ({ id: p.id, t: new Set(toks(p.title, names)), n: new Set(toks(p.note + ' ' + (p.brief||'') + ' ' + (p.activities||[]).map(a => a.text).join(' '), names)) }));
  const df = {}; docs.forEach(d => new Set([...d.t, ...d.n]).forEach(w => df[w] = (df[w]||0) + 1));
  const N = docs.length, idf = w => Math.log((N + 1) / ((df[w]||0) + 1));
  SIDX = { ref: S.projects, docs: Object.fromEntries(docs.map(d => [d.id, d])), idf };
  return SIDX;
}
function suggestLinks(p, max, only){
  const ix = suggestIndex(), me = ix.docs[p.id]; if (!me) return [];
  const skip = new Set([p.id, ...(p.links||[]), ...(p.linkDismissed||[])]);
  S.projects.forEach(q => { if ((q.links||[]).includes(p.id) || (q.linkDismissed||[]).includes(p.id)) skip.add(q.id); });
  const out = [];
  S.projects.forEach(q => {
    if (skip.has(q.id) || (only && !only(q))) return;
    const o = ix.docs[q.id]; let sc = 0; const why = [];
    me.t.forEach(w => { if (o.t.has(w)) { sc += 2 * ix.idf(w); why.push(w); } else if (o.n.has(w)) { sc += 0.8 * ix.idf(w); why.push(w); } });
    me.n.forEach(w => { if (!me.t.has(w) && o.t.has(w)) { sc += 0.8 * ix.idf(w); why.push(w); } else if (!me.t.has(w) && o.n.has(w)) sc += 0.25 * ix.idf(w); });
    if (q.owner !== p.owner && ((p.coResp||[]).includes(q.owner) || (q.coResp||[]).includes(p.owner))) sc += 1.2;
    const uw = [...new Set(why)], strong = uw.some(w => ix.idf(w) >= Math.log((S.projects.length + 1) / (only ? 9 : 4)) && w.length >= 4 && me.t.has(w) && o.t.has(w));
    if (sc >= (only ? 3 : 4.5) && (uw.length >= 2 || strong)) out.push({ q, sc, why: [...new Set(why)].sort((a,b) => ix.idf(b) - ix.idf(a)).slice(0, 3) });
  });
  return out.sort((a,b) => b.sc - a.sc).slice(0, max || 4);
}
function detailBlock(q){
  const acts = q.activities || [], g = q.progress;
  return `<div class="det">
    <div><span class="muted">Owner</span> ${esc(q.owner)}${(q.coResp||[]).length?` · with ${q.coResp.map(esc).join(', ')}`:''}</div>
    <div><span class="muted">Deadline</span> ${q.commitDate?fmt(q.commitDate):'none'} · <span class="muted">Progress</span> ${pct(q)}%${g?` (${PST[g.status]}, ${fmt(g.date)})`:' (no estimate)'}</div>
    ${g?`<div><span class="muted">Owner's remark</span> ${esc(g.remark)}</div>`:''}
    ${q.note && (!g || q.note !== g.remark)?`<div><span class="muted">Description / status</span> ${esc(q.note)}</div>`:''}
    ${q.brief?`<div><span class="muted">Instructions</span> ${esc(q.brief)}</div>`:''}
    ${acts.length?`<div><span class="muted">Activities</span><ul style="margin:2px 0 0;padding-left:18px">${acts.map(a => `<li>${esc(a.text)}${a.due?' · '+fmt(a.due):''} · ${a.status==='done'?'done':a.status==='doing'?'working':'to do'}</li>`).join('')}</ul></div>`:''}
  </div>`;
}
function myMainConnect(q){
  const me = S.me, mine = S.projects.filter(p => p.owner === me && p.plan !== 'CM');
  const linked = mine.filter(p => (p.links||[]).includes(q.id) || (q.links||[]).includes(p.id));
  let h = `<div class="sub">Connected to your MAIN plans</div><div class="chips">${linked.map(p => `<span class="chip" title="${esc(p.title)}">${planBadge(p)}${esc(short(p.title))}${(p.links||[]).includes(q.id)?`<button class="x" data-act="hunlink" data-p="${q.id}" data-a="${p.id}" aria-label="Disconnect">×</button>`:''}</span>`).join('') || '<span class="muted" style="font-size:13px">None</span>'}</div>`;
  const sg = suggestLinks(q, 3, x => x.owner === me && x.plan !== 'CM' && !linked.includes(x));
  if (sg.length) h += `<div class="sugg"><div style="font-size:12.5px;font-weight:700;margin-bottom:4px">Suggested from your MAIN plans</div>${sg.map(({q:m,why}) => { const k = 'hs-'+q.id+'-'+m.id, op = S.open[k]; return `<div class="srow"><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13.5px">${esc(m.title)}</div>
    <div class="muted" style="font-size:12px">${badge(pCls(m))}${planBadge(m)} shares <b>${why.map(esc).join(', ')}</b> · <a href="#" class="klink" data-act="sgdet" data-v="${k}">${op?'Hide details':'Details'}</a></div>${op?detailBlock(m):''}</div>
    <button class="btn" style="padding:6px 12px" data-act="hlink" data-p="${q.id}" data-a="${m.id}">Connect</button>
    <button class="x" data-act="hdismiss" data-p="${q.id}" data-a="${m.id}" aria-label="Not related" title="Not related">×</button></div>`; }).join('')}</div>`;
  const rest = mine.filter(p => !linked.includes(p));
  if (rest.length) h += `<div class="row"><select class="field grow" data-act="hlinksel" data-v="${q.id}" aria-label="Connect to one of your MAIN plans"><option value="">Connect to one of your MAIN plans…</option>${['SP','OP',''].map(t => { const g = rest.filter(p => (p.plan||'') === t); return g.length ? `<optgroup label="${t?PLAN[t]:'Other'}">${g.map(p => `<option value="${p.id}">${esc(short(p.title))}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></div>`;
  return h;
}
function suggestBox(p){
  const sg = suggestLinks(p, 4);
  if (!sg.length) return '';
  return `<div class="sugg"><div style="font-size:12.5px;font-weight:700;margin-bottom:4px">Suggested connections</div>${sg.map(({q,why}) => { const k = 'sg-'+p.id+'-'+q.id, op = S.open[k]; return `<div class="srow">
    <div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13.5px">${esc(q.title)}</div>
    <div class="muted" style="font-size:12px">${badge(pCls(q))}${planBadge(q)}${esc(q.owner)}${q.owner===p.owner?' (yours)':''} · shares <b>${why.map(esc).join(', ')}</b> · <a href="#" class="klink" data-act="sgdet" data-v="${k}">${op?'Hide details':'Details'}</a></div>
    ${op?detailBlock(q):''}</div>
    <button class="btn" style="padding:6px 12px" data-act="sglink" data-p="${p.id}" data-a="${q.id}">Connect</button>
    <button class="x" data-act="sgno" data-p="${p.id}" data-a="${q.id}" aria-label="Not related" title="Not related">×</button></div>`; }).join('')}</div>`;
}
/* ================= SUB PLANS ================= */
const SP_PHASES = ['Price ok', 'Sample ok', 'Small scale', 'Large scale'];
const SP_DEFAULT_CATS = ['10 PET','12 PET','10 VMPET 2.2','10 VMPET 2.5','Foil 7','Foil 16.5','20 OPP','20 CPP','',''];
const subOf = pid => S.subplans[pid] || null;
function firstThu(y, m){ const d = new Date(y, m, 1); const off = (4 - d.getDay() + 7) % 7; const r = new Date(y, m, 1 + off); return r.getFullYear()+'-'+pad(r.getMonth()+1)+'-'+pad(r.getDate()); }
const SP_SCHED = { 'first-thu': 'monthly, 1st Thursday', 'weekly-thu': 'every Thursday', none: '' };
function spCycles(sp, from, to){
  if (!sp || !SP_SCHED[sp.schedule]) return [];
  const start = sp.createdAt || '0000-00-00', out = [];
  if (sp.schedule === 'weekly-thu') { let d = pd(from < start ? addDays(start, 1) : from); while (d.getDay() !== 4) d.setDate(d.getDate() + 1); while (ds(d) <= to && out.length < 500) { if (ds(d) > start) out.push(ds(d)); d.setDate(d.getDate() + 7); } return out; }
  let d = pd(from < start ? start : from), y = d.getFullYear(), m = d.getMonth();
  for (let i = 0; i < 120; i++) { const s = firstThu(y, m); if (s > to) break; if (s >= from && s > start) out.push(s); m++; if (m > 11) { m = 0; y++; } }
  return out;
}
function spDueInfo(sp){
  if (!sp || sp.complete || !SP_SCHED[sp.schedule]) return null;
  const past = spCycles(sp, sp.createdAt || '2000-01-01', TODAY), last = past[past.length - 1];
  if (last && (sp.lastSubmitted || '') < last) return { state: 'due', date: last };
  return { state: 'ok', date: spCycles(sp, addDays(TODAY, 1), addDays(TODAY, 400))[0] };
}
function spCycleCls(sp, date){
  const nx = spCycles(sp, addDays(date, 1), addDays(date, 40))[0] || '9999-12-31';
  if ((sp.submissions||[]).some(x => x.date >= date && x.date < nx)) return 'done';
  return date < TODAY ? 'late' : 'todo';
}
const spDue = pid => { const i = spDueInfo(subOf(pid)); return !!(i && i.state === 'due'); };
function spPct(sp){
  if (!sp) return 0;
  if (sp.template === 'steps') { const st = (sp.steps||[]).filter(s => s.text); return st.length ? Math.round(100 * st.filter(s => s.actual).length / st.length) : 0; }
  const sups = (sp.categories||[]).flatMap(c => c.suppliers.filter(s => s.name));
  if (!sups.length) return 0;
  return Math.round(100 * sups.reduce((a, s) => a + s.phases.filter(ph => ph.actual).length, 0) / (sups.length * SP_PHASES.length));
}
const supStage = s => { let k = 0; s.phases.forEach((ph, i) => { if (ph.actual) k = i + 1; }); return k; };
const canEditSp = sp => sp && (S.me === sp.owner || S.me === sp.assignee);
function newSupplier(){ return { id: uid('s'), name: '', currency: 'USD', moq: Array.from({length:5}, () => ({ qty:'', price:'' })), phases: SP_PHASES.map(() => ({ target:'', actual:'' })), remark: '' }; }
function blankSubplan(p, o){
  const sp = { projectId: p.id, owner: p.owner, assignee: o.assignee, title: o.title, template: o.template, schedule: o.schedule, createdAt: TODAY, lastSubmitted: '', submissions: [], complete: false };
  if (o.template === 'supplier') sp.categories = SP_DEFAULT_CATS.map(n => ({ id: uid('c'), name: n, suppliers: Array.from({length:5}, newSupplier) }));
  else sp.steps = Array.from({length:8}, () => ({ id: uid('t'), text: '', who: o.assignee, target: '', actual: '' }));
  return sp;
}
const spTimers = {}, spChains = {};
function saveSub(pid, immediate){
  const sp = subOf(pid); if (!sp) return;
  sp.updatedAt = new Date().toISOString(); sp.updatedBy = S.me;
  if (!S.db) { render(); return; }
  clearTimeout(spTimers[pid]);
  const go = () => { delete spTimers[pid]; const body = JSON.parse(JSON.stringify(sp)); spChains[pid] = (spChains[pid] || Promise.resolve()).then(() => S.db.doc('subplans/' + pid).set(body)).catch(e => toast(saveErr(e))); };
  if (immediate) go(); else spTimers[pid] = setTimeout(go, 500);
}
function setPath(obj, path, val){ const k = path.split('.'); let o = obj; for (let i = 0; i < k.length - 1; i++) o = o[isNaN(k[i]) ? k[i] : Number(k[i])]; o[k[k.length-1]] = val; }
function commitSp(key, val){
  const [, pid, path] = key.split('|'); const sp = subOf(pid);
  if (!sp || !canEditSp(sp)) { toast('Only the owner and the assigned manager can edit this sub plan.'); return; }
  setPath(sp, path, val); delete S.drafts[key]; saveSub(pid); render();
}
function spIn(pid, path, val, attrs){ const k = 'sp|'+pid+'|'+path; return `<input class="field" data-draft="${k}" value="${esc(val)}" ${attrs||''}>`; }
function spSummary(p){
  const sp = subOf(p.id); if (!sp) return '';
  const di = spDueInfo(sp);
  return `<span class="badge b-sub">Sub plan ${spPct(sp)}%</span>${di && di.state==='due' ? '<span class="badge b-late">Sub plan update due</span>' : ''}`;
}
function subplanSection(p, edit){
  const sp = subOf(p.id), isOwner = p.owner === S.me;
  if (!sp) {
    if (!(edit && isOwner && p.plan === 'SP')) return '';
    if (!S.open['spnew-'+p.id]) return `<div class="sub">Sub plan <span class="muted" style="font-weight:500">optional, one per strategic plan</span></div><button class="btn ghost" data-act="spnewtoggle" data-v="${p.id}">Add a sub plan</button>`;
    const mopts = managers().map(m => `<option value="${esc(m.name)}" ${m.name===S.me?'selected':''}>${esc(m.name)}${m.name===S.me?' (me)':''}</option>`).join('');
    return `<div class="sub">New sub plan</div><div class="panel form" style="background:var(--surface2)">
      <input class="field" data-draft="spn-title-${p.id}" placeholder="Sub plan title, e.g. Supplier qualification per RM category">
      <div class="row" style="margin-top:0"><label>Assign to</label><select class="field grow" data-draft="spn-who-${p.id}">${mopts}</select></div>
      <div class="row" style="margin-top:0"><label>Format</label><select class="field grow" data-draft="spn-tpl-${p.id}"><option value="supplier">Supplier qualification (RM category × 5 suppliers × MOQ × phases)</option><option value="steps">Workflow steps (step, who, target, actual)</option></select></div>
      <div class="row" style="margin-top:0"><label>Update schedule</label><select class="field grow" data-draft="spn-sch-${p.id}"><option value="first-thu">Every month, 1st Thursday, until complete</option><option value="weekly-thu">Every Thursday, until complete</option><option value="none">No fixed schedule</option></select></div>
      <div class="row" style="margin-top:0"><button class="btn" data-act="spcreate" data-v="${p.id}">Create sub plan</button><button class="btn ghost" data-act="spnewtoggle" data-v="${p.id}">Cancel</button></div></div>`;
  }
  const di = spDueInfo(sp), open = S.open['sp-'+p.id], can = canEditSp(sp);
  let h = `<div class="sub">Sub plan</div><div class="spbox">
    <button class="sphead" data-act="sptoggle" data-v="${p.id}" aria-expanded="${!!open}">
      <div style="flex:1;min-width:0"><div style="font-weight:700">${esc(sp.title)}</div>
      <div class="muted" style="font-size:12.5px;margin-top:2px">Assigned to ${esc(sp.assignee)} · ${sp.template==='supplier'?'Supplier qualification':'Workflow steps'}${SP_SCHED[sp.schedule]?' · '+SP_SCHED[sp.schedule]:''}</div>
      <div class="pgline"><div class="pgbar"><i class="s-prog" style="width:${spPct(sp)}%"></i></div><b>${spPct(sp)}%</b></div>
      <div style="font-size:12.5px;margin-top:4px">${sp.complete ? '<span class="badge b-done">Complete</span>' : di ? (di.state === 'due' ? `<span class="badge b-late">Update due since ${fmt(di.date)}</span>` : `<span class="badge b-todo">Next update ${fmt(di.date)}</span>`) : ''}${sp.lastSubmitted ? ` <span class="muted">Last submitted ${fmt(sp.lastSubmitted)}</span>` : ' <span class="muted">Not submitted yet</span>'}</div></div>
      <span class="muted" style="font-size:18px">${open ? '▴' : '▾'}</span></button>`;
  if (!open) return h + `</div>`;
  h += `<div class="spbody">`;
  if (sp.template === 'supplier') h += supplierMatrix(p.id, sp, can); else h += stepsTable(p.id, sp, can);
  if (isOwner) h += `<div class="row"><label>Update schedule</label><select class="field grow" data-draft="sp|${p.id}|schedule">${[['first-thu','Every month, 1st Thursday'],['weekly-thu','Every Thursday'],['none','No fixed schedule']].map(o => `<option value="${o[0]}" ${sp.schedule===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select></div>`;
  h += filesBlock('s', p.id, sp.files, sp.owner, [sp.assignee], canEditSp(sp));
  if (S.me === sp.assignee && !sp.complete) h += `<div class="row"><input class="field grow" data-draft="spsub-${p.id}" placeholder="Note for ${esc(firstName(sp.owner))} (optional)"><button class="btn ok" data-act="spsubmit" data-v="${p.id}">Submit ${sp.schedule==='weekly-thu'?'weekly':'monthly'} update</button></div>`;
  if ((sp.submissions||[]).length) h += `<div class="muted" style="font-size:12.5px;margin-top:8px">Update history: ${sp.submissions.slice(-6).reverse().map(x => `${fmt(x.date)} by ${esc(firstName(x.by))}${x.note?' ('+esc(x.note)+')':''}`).join(' · ')}</div>`;
  if (isOwner) h += `<div class="row">${sp.complete ? `<button class="btn ghost" data-act="spcomplete" data-v="${p.id}">Reopen sub plan</button>` : `<button class="btn ghost" data-act="spcomplete" data-v="${p.id}">Mark qualification complete</button>`}<button class="btn danger" data-act="spdelete" data-v="${p.id}">Delete sub plan</button></div>`;
  if (!can) h += `<div class="muted" style="font-size:12.5px;margin-top:6px">View only. ${esc(sp.owner)} and ${esc(sp.assignee)} can edit.</div>`;
  return h + `</div></div>`;
}
function supplierMatrix(pid, sp, can){
  const cats = sp.categories || [];
  // summary grid
  let h = `<div class="scrollx"><table class="sptable"><thead><tr><th>RM category</th><th>Suppliers</th>${SP_PHASES.map(x => `<th>${x}</th>`).join('')}<th>Late</th></tr></thead><tbody>`;
  cats.forEach((c, ci) => { const sups = c.suppliers.filter(s => s.name); const late = sups.filter(s => s.phases.some(ph => ph.target && !ph.actual && ph.target < TODAY)).length;
    h += `<tr><td><a href="#" class="klink" data-act="spcat" data-v="${pid}" data-a="${c.id}">${esc(c.name || 'Category ' + (ci+1))}</a></td><td>${sups.length}/5</td>${SP_PHASES.map((_, i) => `<td>${sups.filter(s => s.phases[i].actual).length}</td>`).join('')}<td ${late?'style="color:var(--late);font-weight:700"':''}>${late}</td></tr>`; });
  h += `</tbody></table></div><div class="muted" style="font-size:12px;margin:4px 0 8px">Counts show suppliers with an actual date for each phase. Tap a category to fill it in.</div>`;
  cats.forEach((c, ci) => {
    const key = 'spc-'+pid+'-'+c.id; if (!S.open[key]) return;
    h += `<div class="spcat" id="spc-${pid}-${c.id}"><div class="row" style="margin-top:0"><b style="min-width:22px">${ci+1}.</b>${can ? spIn(pid, `categories.${ci}.name`, c.name, `placeholder="RM category, e.g. 10 PET" aria-label="RM category" style="flex:1"`) : `<b>${esc(c.name)}</b>`}<button class="x" data-act="spcat" data-v="${pid}" data-a="${c.id}" aria-label="Close">×</button></div>`;
    c.suppliers.forEach((s, si) => {
      const st = supStage(s), base = `categories.${ci}.suppliers.${si}`;
      h += `<div class="spsup"><div class="row" style="margin-top:0"><span class="num" style="margin-top:0">${si+1}</span>${can ? spIn(pid, base+'.name', s.name, `placeholder="Supplier ${si+1} name" aria-label="Supplier name" style="flex:1 1 150px"`) : `<b style="flex:1">${esc(s.name || '—')}</b>`}
        ${can ? `<select class="field" data-draft="sp|${pid}|${base}.currency" aria-label="Currency">${['USD','RMB','PHP','EUR','JPY'].map(x => `<option ${x===s.currency?'selected':''}>${x}</option>`).join('')}</select>` : esc(s.currency)}
        <span class="badge ${st===4?'b-done':st?'b-prog':'b-todo'}">${st ? SP_PHASES[st-1] : 'Not started'}</span></div>
        <div class="sub" style="margin:8px 0 4px;font-size:12px">MOQ tiers and price</div>
        <div class="scrollx"><table class="sptable"><thead><tr><th></th>${s.moq.map((_, i) => `<th>Tier ${i+1}</th>`).join('')}</tr></thead><tbody>
          <tr><td>MOQ (kg)</td>${s.moq.map((m, i) => `<td>${can ? spIn(pid, `${base}.moq.${i}.qty`, m.qty, 'inputmode="decimal" aria-label="MOQ"') : esc(m.qty)}</td>`).join('')}</tr>
          <tr><td>Price/kg</td>${s.moq.map((m, i) => `<td>${can ? spIn(pid, `${base}.moq.${i}.price`, m.price, 'inputmode="decimal" aria-label="Price"') : esc(m.price)}</td>`).join('')}</tr></tbody></table></div>
        <div class="sub" style="margin:8px 0 4px;font-size:12px">Qualification phases</div>
        <div class="scrollx"><table class="sptable"><thead><tr><th>Phase</th><th>Target</th><th>Actual</th></tr></thead><tbody>
          ${s.phases.map((ph, i) => { const late = ph.target && !ph.actual && ph.target < TODAY; return `<tr><td>${i+1}. ${SP_PHASES[i]}${late?' <span class="badge b-late">late</span>':''}</td>
            <td>${can ? spIn(pid, `${base}.phases.${i}.target`, ph.target, 'type="date" aria-label="Target"') : fmt(ph.target)}</td>
            <td>${can ? spIn(pid, `${base}.phases.${i}.actual`, ph.actual, 'type="date" aria-label="Actual"') : fmt(ph.actual)}</td></tr>`; }).join('')}</tbody></table></div>
        ${can ? spIn(pid, base+'.remark', s.remark, 'placeholder="Remark (optional)" style="width:100%;margin-top:6px"') : (s.remark ? `<div class="muted" style="font-size:12.5px">${esc(s.remark)}</div>` : '')}</div>`;
    });
    h += `</div>`;
  });
  return h;
}
function stepsTable(pid, sp, can){
  const mopts = sel => managers().map(m => `<option ${m.name===sel?'selected':''}>${esc(m.name)}</option>`).join('');
  return `<div class="scrollx"><table class="sptable"><thead><tr><th>#</th><th>Step</th><th>Who</th><th>Target</th><th>Actual</th></tr></thead><tbody>${(sp.steps||[]).map((s, i) => { const late = s.target && !s.actual && s.target < TODAY; return `<tr${late?' class="late"':''}><td>${i+1}</td>
    <td>${can ? spIn(pid, `steps.${i}.text`, s.text, 'placeholder="Step" style="min-width:160px"') : esc(s.text)}</td>
    <td>${can ? `<select class="field" data-draft="sp|${pid}|steps.${i}.who">${mopts(s.who)}</select>` : esc(s.who)}</td>
    <td>${can ? spIn(pid, `steps.${i}.target`, s.target, 'type="date"') : fmt(s.target)}</td>
    <td>${can ? spIn(pid, `steps.${i}.actual`, s.actual, 'type="date"') : fmt(s.actual)}</td></tr>`; }).join('')}</tbody></table></div>
    ${can ? `<button class="btn ghost" style="margin-top:6px" data-act="spaddstep" data-v="${pid}">Add a step</button>` : ''}`;
}
function viewSubAssigned(me){
  const mine = S.projects.filter(p => subOf(p.id) && subOf(p.id).assignee === me && p.owner !== me);
  if (!mine.length) return '';
  return `<h2>Sub plans assigned to you<small>${mine.length}</small></h2>` + mine.map((p, i) => `<div class="card"><div style="padding:14px">
    <div class="t" style="font-weight:650;display:flex;gap:10px">${numBox(i+1)}<span>${esc(p.title)}</span></div>
    <div class="muted" style="font-size:12.5px;margin-top:4px">${planBadge(p)} Main plan owner: ${esc(p.owner)}</div>${subplanSection(p, true)}</div></div>`).join('');
}

function repSelect(val, attrs){ return `<select class="field" ${attrs} aria-label="Repeat">${[['none','Does not repeat'],['weekly','Every week'],['monthly-nth','Monthly, same week & day'],['monthly-date','Monthly, same date']].map(o => `<option value="${o[0]}" ${(val||'none')===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select>`; }
function viewMine(){
  const ps = S.projects.filter(p => p.owner === S.me && p.plan !== 'CM');
  const cmN = S.projects.filter(p => p.owner === S.me && p.plan === 'CM').length;
  if (!ps.length) return quickAdd(ps) + `<div class="empty" style="margin-top:14px">No projects yet. President Romy's assignments and the projects you add will appear here.</div>`;
  const c = { done:0, prog:0, todo:0, none:0, late:0 }; ps.forEach(p => c[pCls(p)]++);
  const due = sortP(ps.filter(needsCheckin));
  const alert = due.length ? `<h2>Update required<small>${due.length} due within a week</small></h2>` + due.map(checkinBox).join('') : '';
  const shown = ps.filter(p => (S.plan === 'all' || (S.plan === 'other' ? !p.plan : p.plan === S.plan)) && statOk(p));
  const groups = [['SP', PLAN.SP], ['OP', PLAN.OP], ['', 'Other assignments']];
  let list = '';
  groups.forEach(([k, label]) => { const g = shown.filter(p => (p.plan||'') === k); if (g.length) list += `<div class="sub" style="font-size:14px;margin:16px 0 8px">${label} <span class="muted">${g.length}</span></div>` + sortP(g).map((p, i) => card(p, true, i + 1)).join(''); });
  const rev = ps.filter(p => pendingInputs(p).length);
  const review = rev.length ? `<h2>Helper inputs to review<small>${rev.reduce((s,p)=>s+pendingInputs(p).length,0)}</small></h2>` + rev.map(reviewBox).join('') : '';
  const cmNote = cmN ? `<div class="notice" style="background:var(--surface2)">${cmN} project${cmN>1?'s':''} assigned by co-managers ${cmN>1?'are':'is'} in the <b>From co-managers</b> tab.</div>` : '';
  return review + alert + cmNote + quickAdd(ps) + `<h2>${esc(firstName(S.me))}'s MAIN plans<small>${c.done} done, ${c.prog} in progress, ${c.todo} not started${c.none?`, <b style="color:var(--late)">${c.none} need an estimate</b>`:''}${c.late?`, ${c.late} overdue`:''}</small></h2>` + `<div id="list-head"></div>` + planBar() + statBar(shown.length) + (list || '<div class="empty" style="margin-top:10px">Nothing in this plan.</div>');
}
const helpersOf = p => [...new Set([...(p.coResp||[]), ...(p.activities||[]).flatMap(H)])].filter(x => x && x !== p.owner);
const normT = t => String(t||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,60);
const mirrorOf = (q, me) => S.projects.find(p => p.owner === me && p.id !== q.id && normT(p.title) === normT(q.title) && ((p.links||[]).includes(q.id) || (q.links||[]).includes(p.id)));
const helpProjects = me => S.projects.filter(p => p.owner !== me && helpersOf(p).includes(me) && !mirrorOf(p, me));
const mirrorCount = me => S.projects.filter(p => p.owner !== me && helpersOf(p).includes(me) && mirrorOf(p, me)).length;
const pendingInputs = p => (p.helperInputs||[]).filter(x => x.state === 'pending');
function inputLine(x){
  const st = x.status === 'done' ? 'done' : x.status;
  const tag = x.state === 'pending' ? '<span class="badge b-prog">Awaiting owner</span>' : x.state === 'accepted' ? '<span class="badge b-done">Accepted</span>' : '<span class="badge b-late">Not accepted</span>';
  return `<div style="font-size:13px">${tag}${badge(st)} <b>${x.status==='prog'?x.pct+'%':x.status==='done'?'100%':'0%'}</b> · ${esc(x.remark)}</div>
    <div class="muted" style="font-size:12px">${esc(x.by)} · ${fmt(x.date)}${x.reply?` · Owner: ${esc(x.reply)}`:''}</div>`;
}
function helperForm(p){
  const k = 'hi-'+p.id, st = S.drafts[k+'-st'] || '', v = S.drafts[k+'-pct'] || 50;
  let h = `<div class="seg" role="radiogroup" aria-label="Status">${['todo','prog','done'].map(s => `<button role="radio" aria-checked="${st===s}" class="${st===s?'on s-'+s:''}" data-act="hist" data-v="${p.id}" data-s="${s}">${PST[s]}</button>`).join('')}</div>`;
  if (st === 'prog') h += `<div class="row"><label for="hip-${p.id}">Percent complete</label><input id="hip-${p.id}" type="range" min="5" max="95" step="5" value="${v}" data-draft="${k}-pct" data-lbl="hil-${p.id}" style="flex:1 1 140px"><b id="hil-${p.id}" style="min-width:40px">${v}%</b></div>`;
  h += `<textarea class="field" style="margin-top:8px;width:100%" data-draft="${k}-rm" placeholder="Your input (required): what you did, what's left"></textarea>
    <div class="row" style="margin-top:6px"><button class="btn" data-act="hisend" data-v="${p.id}">Send to ${esc(firstName(p.owner))} for acceptance</button></div>`;
  return h;
}
function reviewBox(p){
  return pendingInputs(p).map(x => `<div class="alert" style="border-left-color:var(--prog)">
    <div class="t">${esc(p.title)}</div>
    <div class="meta" style="margin-bottom:6px">Input from ${esc(x.by)}. Your remark is final and becomes the official update.</div>
    ${inputLine(x)}
    <textarea class="field" style="margin-top:8px;width:100%" data-draft="acc-${x.id}" placeholder="Your final remark (required)">${esc(x.remark)}</textarea>
    <div class="row"><button class="btn ok" data-act="hiacc" data-v="${p.id}" data-i="${x.id}">Accept as official</button><button class="btn danger" data-act="hidec" data-v="${p.id}" data-i="${x.id}">Don't accept</button></div></div>`).join('');
}
function viewHelp(){
  const me = S.me, toMe = sortP(S.projects.filter(p => p.plan === 'CM' && p.owner === me)), byMe = sortP(S.projects.filter(p => p.plan === 'CM' && p.assignedBy === me));
  const myReqs = S.projects.filter(p => pendingExt(p) && approverOf(p) === me);
  let out = '';
  out += viewSubAssigned(me);
  if (myReqs.length) out += `<h2>Extension requests for you<small>${myReqs.length}</small></h2>` + myReqs.map(reqCard).join('');
  const due = toMe.filter(needsCheckin);
  if (due.length) out += `<h2>Update required<small>${due.length}</small></h2>` + due.map(checkinBox).join('');
  out += `<h2>Assigned to you by co-managers<small>${toMe.length}</small></h2>` + (toMe.length ? toMe.map((p, i) => card(p, true, i + 1)).join('') : `<div class="empty">No co-manager has assigned you a project.</div>`);
  out += `<h2>Assigned by you<small>${byMe.length}</small></h2>` + (byMe.length ? `<div class="panel" style="padding:4px 14px">${byMe.map((p, i) => progRow(p, false, i + 1)).join('')}</div>` : '');
  const mopts = managers().filter(m => m.name !== me).map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');
  out += `<div class="panel form" style="margin-top:10px"><div class="sub" style="margin-top:0">Assign a project to a co-manager</div>
    <input class="field" data-draft="cm-title" placeholder="Project title" aria-label="Project title">
    <div class="row" style="margin-top:0"><select class="field grow" data-draft="cm-owner" aria-label="Co-manager"><option value="">Choose a co-manager…</option>${mopts}</select>
    <label for="cm-date">Deadline</label><input id="cm-date" class="field" type="date" data-draft="cm-date"></div>
    <textarea class="field" data-draft="cm-note" placeholder="What you need from them"></textarea>
    <div><button class="btn" data-act="cmassign">Assign</button></div></div>`;
  const projs = sortP(helpProjects(me).filter(p => p.plan !== 'CM' || p.assignedBy !== me));
  out += `<h2>Projects you're helping<small>${projs.length}</small></h2>`;
  const mc = mirrorCount(me);
  if (mc) out += `<div class="muted" style="font-size:12.5px;margin:-4px 0 8px">${mc} item${mc>1?'s':''} that also ${mc>1?'appear':'appears'} on your own list (the same item on both lists) ${mc>1?'are':'is'} hidden here. Update ${mc>1?'them':'it'} from your own card.</div>`;
  out += projs.length ? projs.map((p, i) => { const mine = (p.helperInputs||[]).filter(x => x.by === S.me), last = mine[mine.length-1], open = S.open['hf-'+p.id];
    return `<div class="card"><div style="padding:14px">
      <div class="t" style="font-weight:650;display:flex;gap:10px;align-items:flex-start">${numBox(i + 1)}<span>${esc(p.title)}</span></div>
      <div class="meta muted" style="font-size:12.5px;margin-top:4px">${badge(pCls(p))}${planBadge(p)} Owner: ${esc(p.owner)}${p.commitDate?' · due '+fmt(p.commitDate):''}</div>
      <div class="sub">Official estimate (owner's)</div>${progSummary(p)}
      ${last?`<div class="sub">Your latest input</div>${inputLine(last)}`:''}
      <div class="row">${last&&last.state==='pending'?'<span class="muted" style="font-size:13px">Waiting for the owner to review your input.</span>':`<button class="btn ${open?'':'ghost'}" data-act="hftoggle" data-v="${p.id}">${open?'Cancel':'Add my input'}</button>`}</div>
      ${open&&!(last&&last.state==='pending')?`<div style="margin-top:10px">${helperForm(p)}</div>`:''}
      ${myMainConnect(p)}</div></div>`; }).join('')
    : `<div class="empty">No manager has added you to a project yet.</div>`;
  const list = helpingMe();
  if (!list.length) return out;
  return out + `<h2>Activities asked of you<small>${list.length}</small></h2><div class="panel"><ul class="acts">${list.map(({p,a}) => `
    <li class="act ${a.status==='done'?'isdone':''}">${isRec(a) ? (nextOcc(a) ? `<button class="st doing" data-act="occdone" data-p="${p.id}" data-a="${a.id}" data-d="${nextOcc(a)}">✓ ${fmt(nextOcc(a))}</button>` : '<button class="st done" disabled>All done</button>') : `<button class="st ${a.status}" data-act="cyc" data-p="${p.id}" data-a="${a.id}">${a.status==='done'?'Done':a.status==='doing'?'Working':'To do'}</button>`}
    <div><div class="txt">${esc(a.text)}</div><div class="muted" style="font-size:12.5px">From ${esc(p.owner)} · ${esc(p.title)}</div></div>
    <span>${isLate(a.status==='done'?'done':'x', a.due)?badge('late'):''}</span>
    <div class="ctl">${a.due?'Due '+fmt(a.due):'No due date'}</div></li>`).join('')}</ul></div>`;
}

function ring(p){
  const v = pct(p), c = pCls(p), r = 14, C = 2*Math.PI*r;
  return `<svg class="ring" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="${r}" fill="none" stroke="var(--todo-bg)" stroke-width="4"/>
    <circle cx="17" cy="17" r="${r}" fill="none" stroke="var(--${c==='prog'?'prog':c==='done'?'done':c==='late'?'late':'todo'})" stroke-width="4" stroke-linecap="round" stroke-dasharray="${C*v/100} ${C}" transform="rotate(-90 17 17)"/>
    <text x="17" y="21" text-anchor="middle" font-size="9.5" font-weight="700" fill="currentColor">${v}</text></svg>`;
}
const numBox = n => n ? `<span class="num" aria-label="No. ${n}">${n}</span>` : '';
function card(p, edit, n){
  const c = pCls(p), open = !!S.open[p.id], acts = p.activities || [];
  const helpers = [...new Set(acts.flatMap(H).filter(x=>x && x!==p.owner))];
  let h = `<div class="card ${c==='late'?'late':''}"><button class="chead" data-act="toggle" data-v="${p.id}" aria-expanded="${open}">${numBox(n)}${ring(p)}
    <div style="flex:1;min-width:0"><div class="t">${esc(p.title)}</div>
    <div class="meta">${justBadge(p)}${badge(c)}${planBadge(p)}${spSummary(p)}${p.assignedBy===COO?'<span class="badge b-link">From COO VLI</span>':''}<span>${p.commitDate?'Commit '+fmt(p.commitDate):'No commitment date'}</span>${withBadge(p)}<span>${acts.filter(a=>a.status==='done').length}/${acts.length} activities</span>${helpers.length?`<span class="badge b-link">Help: ${helpers.map(firstName).map(esc).join(', ')}</span>`:''}${(p.links||[]).length?`<span class="badge b-link">${p.links.length} linked</span>`:''}</div></div></button>`;
  if (!open) return h + `</div>`;
  const mopts = (sel) => `<option value="">No help needed</option>` + managers().filter(m=>m.name!==p.owner).map(m => `<option ${sel===m.name?'selected':''} value="${esc(m.name)}">Help: ${esc(m.name)}</option>`).join('');
  h += `<div class="cbody">`;
  if (!edit && ciBadge(p)) h += `<div class="row">${ciBadge(p)}</div>`;
  if (p.brief) h += `<div class="row muted" style="font-size:13px">From ${esc(p.assignedBy||'President Romy')}: ${esc(p.brief)}</div>`;
  if (edit){
    h += p.commitDate
      ? `<div class="row"><label>Project deadline</label><b>${fmt(p.commitDate)}</b>${(p.deadlineHistory||[]).length?`<span class="muted" style="font-size:12.5px">originally ${fmt(p.deadlineHistory[0].from)}</span>`:''}${ciBadge(p)}
         ${pStatus(p)!=='done'&&!pendingExt(p)?`<button class="btn ghost" data-act="revtoggle" data-v="${p.id}">Request new deadline</button>`:''}</div>${S.open['rev-'+p.id]&&!pendingExt(p)?revForm(p):''}`
      : `<div class="row"><label for="cd-${p.id}">Project deadline</label><input id="cd-${p.id}" class="field" type="date" data-act="commit" data-v="${p.id}"><span class="muted" style="font-size:12.5px">Changes after this need President Romy's approval.</span></div>`;
    h += progForm(p);
    if (pendingInputs(p).length) h += `<div style="margin-top:10px">${reviewBox(p)}</div>`;
  } else {
    h += progSummary(p);
  }
  const hist = (p.helperInputs||[]).filter(x => x.state !== 'pending' || !edit);
  if (hist.length) h += `<div class="sub">Inputs from helpers</div>` + hist.slice(-5).reverse().map(x => `<div style="padding:6px 0;border-top:1px dashed var(--line)">${inputLine(x)}</div>`).join('');
  h += `<div class="sub">Activities</div><ul class="acts">`;
  if (!acts.length) h += `<li class="muted" style="font-size:13px;padding:6px 0">${edit?'Break this project into activities so progress shows on the calendar.':'No activities posted yet.'}</li>`;
  acts.forEach(a => {
    const canCycle = edit || H(a).includes(S.me);
    const rc = isRec(a), nx = rc ? nextOcc(a) : null, miss = rc ? missedOcc(a).length : 0;
    h += `<li class="act ${a.status==='done'?'isdone':''}">
      ${rc ? `<button class="st ${nx?'doing':'done'}" ${canCycle&&nx?`data-act="occdone" data-p="${p.id}" data-a="${a.id}" data-d="${nx}"`:'disabled'} title="Mark this occurrence done">${nx?'✓ '+fmt(nx):'All done'}</button>`
      : `<button class="st ${a.status}" ${canCycle?`data-act="cyc" data-p="${p.id}" data-a="${a.id}"`:'disabled'}>${a.status==='done'?'Done':a.status==='doing'?'Working':'To do'}</button>`}
      <div class="txt">${esc(a.text)}${isExec(a.addedBy)?` <span class="badge b-link">From ${a.addedBy===PRES?'Romy':'COO VLI'}</span>`:''}</div>
      ${edit?`<button class="x" data-act="rmact" data-p="${p.id}" data-a="${a.id}" aria-label="Remove activity">×</button>`:`<span></span>`}
      <div class="ctl">${edit
        ? `<input class="field" type="date" value="${esc(a.due||'')}" data-act="adue" data-p="${p.id}" data-a="${a.id}" aria-label="${rc?'Starts':'Deadline'}" title="${rc?'First date':'Deadline'}">${repSelect(a.repeat, `data-act="arep" data-p="${p.id}" data-a="${a.id}"`)}${rc?`<label style="font-size:12px">until</label><input class="field" type="date" value="${esc(a.until||'')}" data-act="auntil" data-p="${p.id}" data-a="${a.id}" aria-label="Repeat until">`:''}</div><div class="ctl">${helpPicker(H(a), p.owner, 'ahelp', `data-p="${p.id}" data-a="${a.id}"`)}`
        : `${a.due?(rc?'Starts ':'Due ')+fmt(a.due):'No due date'}${H(a).length?' · help from '+esc(H(a).join(', ')):''}`}${rc?'':(isLate(a.status==='done'?'done':'x',a.due)?badge('late'):'')}</div>
      ${rc?`<div class="ctl" style="color:var(--ink2)">↻ ${esc(repLabel(a))} · ${(a.doneDates||[]).length} done${miss?` · <b style="color:var(--late)">${miss} missed</b>`:''}${nx?' · next '+fmt(nx):''}</div>`:''}</li>`;
  });
  h += `</ul>`;
  if (edit){
    h += `<div class="row"><input class="field grow" data-draft="act-${p.id}" placeholder="Add an activity" aria-label="New activity">
      <input class="field" type="date" data-draft="actd-${p.id}" aria-label="Activity deadline or first date" title="Deadline or first date">${repSelect(S.drafts['actr-'+p.id], `data-draft="actr-${p.id}"`)}
      <button class="btn" data-act="addact" data-v="${p.id}">Add</button></div>
      <div class="row" style="margin-top:6px">${helpPicker(S.drafts['acth-'+p.id]||[], p.owner, 'dhelp', `data-k="acth-${p.id}"`)}</div>`;
  }
  h += filesBlock('p', p.id, p.files, p.owner, [], edit && p.owner === S.me);
  h += subplanSection(p, edit);
  const links = (p.links||[]).map(byId).filter(Boolean);
  h += `<div class="sub">Connected projects</div><div class="chips">${links.map(l => `<span class="chip" title="${esc(l.title)}"><a href="#" class="klink" style="font-weight:500" data-act="sgdet" data-v="ln-${p.id}-${l.id}">i</a>${badge(pCls(l))}${esc(short(l.title))} <span class="muted">${esc(firstName(l.owner))}</span>${edit?`<button class="x" data-act="unlink" data-p="${p.id}" data-a="${l.id}" aria-label="Disconnect">×</button>`:''}</span>`).join('') || '<span class="muted" style="font-size:13px">None</span>'}</div>`;
  links.forEach(l => { if (S.open['ln-'+p.id+'-'+l.id]) h += `<div class="sugg" style="border-style:solid"><div style="font-weight:600;font-size:13.5px">${esc(l.title)}</div>${detailBlock(l)}</div>`; });
  if (edit){
    h += suggestBox(p);
    const others = S.projects.filter(q => q.id !== p.id && !(p.links||[]).includes(q.id));
    if (others.length) h += `<div class="row"><select class="field grow" data-act="link" data-v="${p.id}" aria-label="Connect a project"><option value="">Connect to another project…</option>${others.map(q => `<option value="${q.id}">${esc(firstName(q.owner))}: ${esc(short(q.title))}</option>`).join('')}</select></div>`;
  }
  if (edit && p.owner === S.me) {
    const cur = p.plan === 'CM' ? 'CM:' + p.assignedBy : (p.plan || '');
    const opts = [['SP','MAIN plans: Strategic'],['OP','MAIN plans: Operational']].concat(managers().filter(m => m.name !== p.owner).map(m => ['CM:' + m.name, 'From co-manager: ' + m.name]));
    h += `<div class="sub">Plan</div><div class="row" style="margin-top:0"><select class="field grow" data-act="moveplan" data-v="${p.id}" aria-label="Move plan"${pendingExt(p)?' disabled':''}>${cur?'':'<option value="">Other assignment</option>'}${opts.map(o => `<option value="${esc(o[0])}" ${o[0]===cur?'selected':''}>${esc(o[1])}</option>`).join('')}</select></div>
      ${pendingExt(p)?'<div class="muted" style="font-size:12.5px">Can\'t move while an extension request is pending.</div>':''}${p.moved?`<div class="muted" style="font-size:12.5px;margin-top:4px">Moved from ${esc(p.moved.from)} on ${fmt(p.moved.date)}</div>`:''}`;
  }
  h += `<div class="row" style="margin-top:16px">`;
  if (isPres()) h += `<button class="btn danger" data-act="del" data-v="${p.id}">Delete project</button>`;
  h += `</div></div></div>`;
  return h;
}

/* ---------- events ---------- */
document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.draft; if (k) S.drafts[k] = e.target.value; if (k && /^pg-/.test(k)) { const id = k.replace(/^pg-(st|rm|pct)-/, ''); const btn = document.querySelector(`[data-act="pgsave"][data-v="${id}"]`); if (btn && !btn.parentNode.querySelector('.unsaved')) btn.insertAdjacentHTML('afterend', '<span class="unsaved">Not saved yet. Tap Save progress.</span>'); }
  const l = e.target.dataset && e.target.dataset.lbl; if (l) { const el = document.getElementById(l); if (el) el.textContent = e.target.value + '%'; } });
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (t.id === 'me'){ if (locked()) { t.value = S.me; return; } S.auth.chose = true; if (t.value) switchTo(t.value); return; }
  if (d.act === 'fileup' && t.files && t.files[0]) { uploadFile(d.k, t.files[0]); t.value = ''; return; }
  if (d.draft && d.draft.startsWith('sp|')){ commitSp(d.draft, t.value); return; }
  if (d.draft){ S.drafts[d.draft] = t.value; return; }
  switch (d.act){
    case 'rowner': S.drafts['r-owner'] = t.value; ['-proj','-text','-date','-help'].forEach(x => delete S.drafts['r'+x]); render(); break;
    case 'pickproj': S.drafts[d.k+'-proj'] = t.value; break;
    case 'filter': S.filter = t.value; render(); break;
    case 'moveplan': {
      const p = byId(d.v), v = t.value, label = x => x.plan === 'CM' ? 'From co-managers (' + x.assignedBy + ')' : x.plan === 'SP' ? 'MAIN plans: Strategic' : x.plan === 'OP' ? 'MAIN plans: Operational' : 'Other';
      if (!p || !v) return;
      const toCM = v.startsWith('CM:'), who = toCM ? v.slice(3) : null;
      const dest = toCM ? 'From co-managers (' + who + ')' : v === 'SP' ? 'MAIN plans: Strategic' : 'MAIN plans: Operational';
      ask('Move "' + p.title.slice(0, 60) + '" to ' + dest + '?' + (toCM ? ' Deadline changes will then need ' + who + '\'s approval.' : ''), 'Move', () => {
        mut(d.v, c => { const from = label(c);
          if (toCM) { if (c.plan !== 'CM') { c.mainPlan = c.plan || ''; c.mainAssignedBy = c.assignedBy || PRES; } c.plan = 'CM'; c.assignedBy = who; }
          else { c.plan = v; c.assignedBy = c.mainAssignedBy || (isExec(c.assignedBy) ? c.assignedBy : PRES); }
          c.moved = { from, to: dest, date: TODAY, by: S.me }; });
        toast('Moved to ' + dest + '.'); }, () => render());
      break;
    }
    case 'commit': { const p = byId(d.v); if (p && p.commitDate && !isPres()) { toast('Deadline changes need President Romy\'s approval.'); render(); break; } mut(d.v, c => { c.commitDate = t.value; }); break; }
    case 'arep': mut(d.p, c => { const a = c.activities.find(x => x.id === d.a); if (a) { a.repeat = t.value; if (t.value !== 'none' && !a.due) a.due = TODAY; } }); break;
    case 'auntil': mut(d.p, c => { const a = c.activities.find(x => x.id === d.a); if (a) a.until = t.value; }); break;
    case 'adue': mut(d.p, c => { const a = c.activities.find(x => x.id === d.a); if (a) a.due = t.value; }); break;
    case 'ahelp': if (t.value) { const v = t.value; mut(d.p, c => { const a = c.activities.find(x => x.id === d.a); if (a) setH(a, H(a).concat(v)); }); toast('Help requested from ' + v + '.'); } break;
    case 'dhelp': if (t.value) { S.drafts[d.k] = (S.drafts[d.k]||[]).concat(t.value); render(); } break;
    case 'hlinksel': if (t.value) { const mine = t.value; mut(mine, c => { c.links = [...new Set((c.links||[]).concat(d.v))]; }); toast('Connected to your MAIN plan.'); } break;
    case 'link': if (t.value) { const other = t.value; mut(d.v, c => { c.links = (c.links||[]).concat(other); }); } break;
  }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  const d = b.dataset;
  switch (d.act){
    case 'tab': S.stat = null; S.tab = d.v; render(); window.scrollTo(0,0); break;
    case 'actas': switchTo(d.v || null); break;
    case 'day':
    case 'jump': {
      S.selDay = d.v; render();
      const el = (d.act === 'jump' && d.k && document.getElementById('it-' + d.k)) || (narrowCal() && document.getElementById('d-' + d.v)) || document.getElementById('daylist-head');
      if (d.act === 'day' && !narrowCal()) break;
      if (el){ el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: d.k ? 'center' : 'start' });
        if (d.k){ el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }
      break;
    }
    case 'plan': S.plan = d.v; render(); break;
    case 'statclear': S.stat = null; render(); break;
    case 'kpi': {
      e.preventDefault();
      S.stat = d.s ? { s: d.s, by: d.by || 'cls' } : null; if (d.p) S.plan = d.p;
      S.tab = isPres() ? 'mgrs' : 'mine'; render();
      const el = document.getElementById('list-head'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
    case 'undated': S.showUndated = !S.showUndated; render(); break;
    case 'calmode': S.calMode = d.v; render(); break;
    case 'mon': {
      if (d.v === '0'){ S.month = TODAY.slice(0,7); S.selDay = TODAY; }
      else { let [y,m] = S.month.split('-').map(Number); m += Number(d.v); if (m < 1){ m = 12; y--; } if (m > 12){ m = 1; y++; } S.month = y+'-'+pad(m); S.selDay = S.month + '-01'; }
      render(); break;
    }
    case 'toggle': S.open[d.v] = !S.open[d.v]; render(); break;
    case 'note': { const v = S.drafts['note-'+d.v]; if (v == null) return; mut(d.v, c => { c.note = v.trim(); c.noteAt = TODAY; }); delete S.drafts['note-'+d.v]; toast('Update saved.'); break; }
    case 'addact': {
      const txt = (S.drafts['act-'+d.v]||'').trim(); if (!txt){ toast('Type the activity first.'); return; }
      const rep = S.drafts['actr-'+d.v] || 'none'; if (rep !== 'none' && !S.drafts['actd-'+d.v]) { toast('Set the first date for a repeating activity.'); return; }
      const a = { id: uid('a'), text: txt, due: S.drafts['actd-'+d.v] || '', repeat: rep, helpers: (S.drafts['acth-'+d.v]||[]).slice(), status: 'todo' };
      mut(d.v, c => { c.activities = (c.activities||[]).concat(a); });
      ['act-','actd-','acth-','actr-'].forEach(k => delete S.drafts[k+d.v]); render(); break;
    }
    case 'quickact': {
      const k = d.k, pid = S.drafts[k+'-proj'], txt = (S.drafts[k+'-text']||'').trim();
      if (!pid){ toast('Choose a project first.'); return; }
      if (!txt){ toast('Type the activity first.'); return; }
      if (!S.drafts[k+'-date']){ toast('Set a deadline for this activity.'); return; }
      const a = { id: uid('a'), text: txt, due: S.drafts[k+'-date'], repeat: S.drafts[k+'-rep'] || 'none', helpers: (S.drafts[k+'-help']||[]).slice(), status: 'todo', addedBy: S.me };
      mut(pid, c => { c.activities = (c.activities||[]).concat(a); });
      S.open[pid] = true; ['-proj','-text','-date','-help','-rep'].forEach(x => delete S.drafts[k+x]);
      toast('Activity added' + (k==='r' ? ' to ' + d.o + "'s plan" : '') + (a.helpers.length ? ', help requested from ' + a.helpers.join(', ') : '') + '.'); render(); break;
    }
    case 'ownproj': {
      const title = (S.drafts['own-title']||'').trim();
      if (!title){ toast('Type the project title first.'); return; }
      const id = uid('p');
      saveProject({ id, title, plan: S.drafts['own-plan'] || 'OP', owner: S.me, assignedBy: S.me, brief: '', commitDate: S.drafts['own-date'] || '', note: '', activities: [], links: [], done: false, createdAt: new Date().toISOString() });
      S.open[id] = true; delete S.drafts['own-title']; delete S.drafts['own-date']; delete S.drafts['own-plan'];
      toast('Project added. Now add its activities.'); render(); break;
    }
    case 'ahelp-rm': mut(d.p, c => { const a = c.activities.find(x => x.id === d.a); if (a) setH(a, H(a).filter(x => x !== d.h)); }); break;
    case 'dhelp-rm': S.drafts[d.k] = (S.drafts[d.k]||[]).filter(x => x !== d.h); render(); break;
    case 'revtoggle': S.open['rev-'+d.v] = !S.open['rev-'+d.v]; render(); break;
    case 'citoggle': S.open['ci-'+d.v] = !S.open['ci-'+d.v]; S.open['pe-'+d.v] = S.open['ci-'+d.v]; S.open['rev-'+d.v] = false; render(); break;
    case 'ontrack': mut(d.v, c => { c.checkin = { status:'ontrack', date: TODAY, forDeadline: c.commitDate }; }); toast('Marked on track. President Romy can see this.'); break;
    case 'sendext': {
      const p = byId(d.v), nd = S.drafts['rd-'+d.v], why = (S.drafts['rr-'+d.v]||'').trim();
      if (!nd){ toast('Pick the revised deadline.'); return; }
      if (p.commitDate && nd <= p.commitDate){ toast('The revised deadline must be after ' + fmt(p.commitDate) + '.'); return; }
      if (!why){ toast('Say briefly what needs review.'); return; }
      mut(d.v, c => { c.checkin = { status:'review', date: TODAY, forDeadline: c.commitDate }; c.extension = { status:'pending', requested: nd, reason: why, forDeadline: c.commitDate, requestedAt: TODAY, by: S.me }; });
      delete S.drafts['rd-'+d.v]; delete S.drafts['rr-'+d.v]; S.open['rev-'+d.v] = false;
      toast('Extension request sent to ' + (approverOf(byId(d.v)) === PRES ? 'President Romy and COO VLI' : approverOf(byId(d.v))) + '.'); break;
    }
    case 'approve': case 'decline': {
      if (!(approverOf(byId(d.v)) === S.me || (approverOf(byId(d.v)) === PRES && isPres()))) { toast('Only ' + (approverOf(byId(d.v)) === PRES ? 'President Romy or COO VLI' : approverOf(byId(d.v))) + ' can decide this.'); return; }
      const reply = (S.drafts['rp-'+d.v]||'').trim(), ok = d.act === 'approve';
      mut(d.v, c => { const e = c.extension; if (!e) return; e.status = ok ? 'approved' : 'declined'; e.reply = reply; e.decidedAt = TODAY; e.decidedBy = S.me;
        if (ok) { c.deadlineHistory = (c.deadlineHistory||[]).concat({ from: c.commitDate, to: e.requested, approvedAt: TODAY, reason: e.reason }); c.commitDate = e.requested; }
        else c.checkin = null; });
      delete S.drafts['rp-'+d.v]; toast(ok ? 'New deadline approved.' : 'Extension declined. The manager will be asked to update again.'); break;
    }
    case 'peopen': S.open['pe-'+d.v] = true; S.pgErr = null; render(); break;
    case 'pecancel': S.open['pe-'+d.v] = false; S.pgErr = null; ['pg-st-','pg-pct-','pg-rm-'].forEach(k => delete S.drafts[k+d.v]); render(); break;
    case 'pgst': S.drafts['pg-st-'+d.v] = d.s; render(); break;
    case 'pgsave': {
      const p = byId(d.v), st = S.drafts['pg-st-'+d.v] || (p.progress && p.progress.status), rm = (S.drafts['pg-rm-'+d.v] != null ? S.drafts['pg-rm-'+d.v] : (p.progress ? p.progress.remark : '')).trim();
      if (!st){ toast('Choose Not started, In progress or Done.'); return; }
      if (rm.length < 3){ S.pgErr = d.v; render(); toast('Remarks are required.'); return; }
      S.pgErr = null;
      const pc = st === 'prog' ? Number(S.drafts['pg-pct-'+d.v] || (p.progress && p.progress.status==='prog' ? p.progress.pct : 50)) : st === 'done' ? 100 : 0;
      const wasDue = dueSoon(p); S.open['ci-'+d.v] = false; S.open['pe-'+d.v] = false;
      mut(d.v, c => { c.progress = { status: st, pct: pc, remark: rm, date: TODAY, by: S.me }; c.done = st === 'done'; if (wasDue) c.checkin = { status: 'ontrack', date: TODAY, forDeadline: c.commitDate }; c.note = rm; c.noteAt = TODAY;
        c.progressLog = (c.progressLog||[]).concat({ status: st, pct: pc, remark: rm, date: TODAY }).slice(-20); });
      ['pg-st-','pg-pct-','pg-rm-'].forEach(k => delete S.drafts[k+d.v]); toast('Progress saved: ' + PST[st] + (st==='prog' ? ' ' + pc + '%' : '') + '.'); break;
    }
    case 'hftoggle': S.open['hf-'+d.v] = !S.open['hf-'+d.v]; render(); break;
    case 'hist': S.drafts['hi-'+d.v+'-st'] = d.s; render(); break;
    case 'hisend': {
      const k = 'hi-'+d.v, st = S.drafts[k+'-st'], rm = (S.drafts[k+'-rm']||'').trim();
      if (!st){ toast('Choose Not started, In progress or Done.'); return; }
      if (rm.length < 3){ toast('Your input remark is required.'); return; }
      const pc = st === 'prog' ? Number(S.drafts[k+'-pct'] || 50) : st === 'done' ? 100 : 0, p = byId(d.v);
      mut(d.v, c => { c.helperInputs = (c.helperInputs||[]).concat({ id: uid('h'), by: S.me, status: st, pct: pc, remark: rm, date: TODAY, state: 'pending' }).slice(-30); });
      ['-st','-pct','-rm'].forEach(x => delete S.drafts[k+x]); S.open['hf-'+d.v] = false;
      toast('Sent to ' + p.owner + ' for acceptance.'); break;
    }
    case 'hiacc': case 'hidec': {
      const ok = d.act === 'hiacc', rm = (S.drafts['acc-'+d.i] != null ? S.drafts['acc-'+d.i] : ((byId(d.v).helperInputs||[]).find(x=>x.id===d.i)||{}).remark || '').trim();
      if (ok && rm.length < 3){ toast('Your final remark is required.'); return; }
      mut(d.v, c => { const x = (c.helperInputs||[]).find(y => y.id === d.i); if (!x) return;
        x.state = ok ? 'accepted' : 'declined'; x.decidedAt = TODAY; if (!ok && rm && rm !== x.remark) x.reply = rm;
        if (ok) { c.progress = { status: x.status, pct: x.pct, remark: rm, date: TODAY, by: c.owner, basedOn: x.by }; c.done = x.status === 'done'; c.note = rm; c.noteAt = TODAY;
          c.progressLog = (c.progressLog||[]).concat({ status: x.status, pct: x.pct, remark: rm, date: TODAY, basedOn: x.by }).slice(-20); } });
      delete S.drafts['acc-'+d.i]; toast(ok ? 'Accepted. Official estimate updated.' : 'Input not accepted. The helper can see this.'); break;
    }
    case 'cmassign': {
      const title = (S.drafts['cm-title']||'').trim(), owner = S.drafts['cm-owner'];
      if (!title || !owner){ toast('Add a title and choose a co-manager.'); return; }
      saveProject({ id: uid('p'), title, plan: 'CM', owner, assignedBy: S.me, brief: (S.drafts['cm-note']||'').trim(), commitDate: S.drafts['cm-date'] || '', note: '', activities: [], links: [], done: false, createdAt: new Date().toISOString() });
      ['cm-title','cm-owner','cm-date','cm-note'].forEach(k => delete S.drafts[k]); toast('Assigned to ' + owner + '.'); render(); break;
    }
    case 'sglink': { const q = byId(d.a); mut(d.p, c => { c.links = [...new Set((c.links||[]).concat(d.a))]; }); toast('Connected to ' + (q ? q.owner + "'s project" : 'project') + '.'); break; }
    case 'sgdet': e.preventDefault(); S.open[d.v] = !S.open[d.v]; render(); break;
    case 'hlink': mut(d.a, c => { c.links = [...new Set((c.links||[]).concat(d.p))]; }); toast('Connected to your MAIN plan.'); break;
    case 'hdismiss': mut(d.a, c => { c.linkDismissed = [...new Set((c.linkDismissed||[]).concat(d.p))]; }); toast('Won\'t suggest this again.'); break;
    case 'hunlink': mut(d.a, c => { c.links = (c.links||[]).filter(x => x !== d.p); }); break;
    case 'sgno': mut(d.p, c => { c.linkDismissed = [...new Set((c.linkDismissed||[]).concat(d.a))]; }); break;
    case 'spnewtoggle': S.open['spnew-'+d.v] = !S.open['spnew-'+d.v]; render(); break;
    case 'sptoggle': S.open['sp-'+d.v] = !S.open['sp-'+d.v]; render(); break;
    case 'spcat': e.preventDefault(); { const k = 'spc-'+d.v+'-'+d.a; S.open[k] = !S.open[k]; render(); const el = S.open[k] && document.getElementById(k); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } break;
    case 'spcreate': {
      const p = byId(d.v), title = (S.drafts['spn-title-'+d.v]||'').trim() || 'Sub plan: ' + short(p.title);
      if (subOf(d.v)) { toast('This plan already has a sub plan.'); return; }
      S.subplans[d.v] = blankSubplan(p, { title, assignee: S.drafts['spn-who-'+d.v] || S.me, template: S.drafts['spn-tpl-'+d.v] || 'supplier', schedule: S.drafts['spn-sch-'+d.v] || 'first-thu' });
      ['title','who','tpl','sch'].forEach(k => delete S.drafts['spn-'+k+'-'+d.v]); S.open['spnew-'+d.v] = false; S.open['sp-'+d.v] = true;
      saveSub(d.v, true); toast('Sub plan created.'); render(); break;
    }
    case 'spsubmit': { const sp = subOf(d.v); if (!sp) return; sp.lastSubmitted = TODAY; sp.submissions = (sp.submissions||[]).concat({ date: TODAY, by: S.me, note: (S.drafts['spsub-'+d.v]||'').trim() }).slice(-24); delete S.drafts['spsub-'+d.v]; saveSub(d.v, true); toast('Monthly update submitted to ' + sp.owner + '.'); render(); break; }
    case 'spcomplete': { const sp = subOf(d.v); if (!sp) return; sp.complete = !sp.complete; saveSub(d.v, true); render(); break; }
    case 'spaddstep': { const sp = subOf(d.v); if (!sp) return; sp.steps.push({ id: uid('t'), text: '', who: sp.assignee, target: '', actual: '' }); saveSub(d.v, true); render(); break; }
    case 'spdelete': ask('Delete this sub plan and everything filled in? This cannot be undone.', 'Delete', () => { delete S.subplans[d.v]; render(); if (S.db) S.db.doc('subplans/' + d.v).delete().catch(e => toast(saveErr(e))); }); break;
    case 'occdone': mut(d.p, c => { const a = c.activities.find(x => x.id === d.a); if (!a) return; a.doneDates = [...new Set((a.doneDates||[]).concat(d.d))].sort(); a.status = nextOcc(a) ? 'doing' : 'done'; }); toast('Marked done for ' + fmt(d.d) + '.'); break;
    case 'mflag': {
      const m = (S.members||[]).find(x => String(x.id) === d.v); if (!m) return;
      const body = { department: m.dept, role: m.role, isAdmin: m.isAdmin, seesAllFiles: m.seesAllFiles, isActive: m.isActive, email: null };
      if (d.f === 'role') body.role = m.role === 'exec' ? 'manager' : 'exec'; else body[d.f] = !m[d.f];
      const go = () => api('PUT', '/api/members/' + m.id, body).then(() => { toast(m.name + ' updated.'); S.members = null; return reloadNow(); }).catch(e => toast(saveErr(e)));
      if (d.f === 'isActive' && m.isActive) ask('Remove ' + m.name + '? Their projects stay, and they can be restored later.', 'Remove', go); else go();
      break; }
    case 'mgrant': {
      const m = (S.members||[]).find(x => String(x.id) === d.v); if (!m) return;
      api('PUT', '/api/members/' + m.id, { department: m.dept, role: m.role, isAdmin: m.isAdmin, seesAllFiles: m.seesAllFiles, isActive: m.isActive })
        .then(() => { toast(m.name + ' can now use ActionRegister.'); S.members = null; render(); }).catch(e => toast(saveErr(e)));
      break; }
    case 'memail': {
      const m = (S.members||[]).find(x => String(x.id) === d.v); if (!m) return;
      const email = (window.prompt('Flexo email for ' + m.name + ' (the address they sign in with):', m.email || '') || '').trim();
      if (!email || email === m.email) return;
      api('PUT', '/api/members/' + m.id, { department: m.dept, role: m.role, isAdmin: m.isAdmin, seesAllFiles: m.seesAllFiles, isActive: m.isActive, email })
        .then(() => { toast(m.name + ' updated.'); S.members = null; return reloadNow(); }).catch(e => toast(saveErr(e)));
      break; }
    case 'addmember': {
      const body = { email: (S.drafts['mem-email']||'').trim(), displayName: (S.drafts['mem-name']||'').trim(), department: (S.drafts['mem-dept']||'').trim(), role: S.drafts['mem-role'] || 'manager' };
      if (!body.email || !body.displayName) { toast('Enter the Flexo email and the name.'); return; }
      api('POST', '/api/members', body).then(() => { ['mem-email','mem-name','mem-dept','mem-role'].forEach(k => delete S.drafts[k]); toast(body.displayName + ' added.'); S.members = null; return reloadNow(); }).catch(e => toast(saveErr(e)));
      break; }
    case 'fview': viewFile(d.v, d.n); break;
    case 'fdown': downloadFile(d.v, d.n); break;
    case 'fdel': { const [kind, id] = d.k.split('|'); ask('Remove this attachment for everyone?', 'Remove', () => {
        if (kind === 'p') mut(id, c => { c.files = (c.files||[]).filter(x => x.id !== d.v); });
        else { const sp = subOf(id); if (sp) { sp.files = (sp.files||[]).filter(x => x.id !== d.v); saveSub(id, true); render(); } }
        api('DELETE', '/api/files/' + d.v).catch(() => {}); }); break; }
    case 'cyc': mut(d.p, c => { const a = c.activities.find(x => x.id === d.a); if (a) a.status = a.status === 'todo' ? 'doing' : a.status === 'doing' ? 'done' : 'todo'; }); break;
    case 'rmact': mut(d.p, c => { c.activities = c.activities.filter(x => x.id !== d.a); }); break;
    case 'unlink': mut(d.p, c => { c.links = (c.links||[]).filter(x => x !== d.a); }); break;
    case 'done': mut(d.v, c => { c.done = !c.done; c.doneDate = c.done ? TODAY : ''; }); break;
    case 'del': { const p = byId(d.v); if (p) ask('Delete "' + p.title + '"? This removes it for everyone.', 'Delete', () => deleteProject(d.v)); break; }
    case 'assign': {
      const title = (S.drafts['new-title']||'').trim(), owner = S.drafts['new-owner'] || (managers()[0]||{}).name;
      if (!title || !owner){ toast('Add a project title and pick a manager.'); return; }
      saveProject({ id: uid('p'), title, plan: S.drafts['new-plan'] || 'SP', owner, assignedBy: S.me, brief: (S.drafts['new-note']||'').trim(), commitDate: S.drafts['new-date'] || '', note: '', activities: [], links: [], done: false, createdAt: new Date().toISOString() });
      ['new-title','new-note','new-date','new-plan'].forEach(k => delete S.drafts[k]); toast('Assigned to ' + owner + '.'); render(); break;
    }

  }
});
window.addEventListener('beforeunload', e => { if (unsavedIds().length) { e.preventDefault(); e.returnValue = ''; } });
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (S.tab === 'cal') render(); }, 200); });

/* ---------- server storage and live refresh ---------- */
// The old server's /api routes are now Supabase database functions; js/cloud.js translates (window.ARCloud.fetch).
// Every call carries the "Viewing as" name so an admin's choice is honoured by the database's permission checks.
async function api(method, url, body, extra){
  const h = Object.assign({}, extra || {});
  if (S.me && S.me !== CFG.me) h['X-Acting-As'] = encodeURIComponent(S.me);
  let payload;
  if (body instanceof FormData) payload = body; else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await window.ARCloud.fetch(url, { method, headers: h, body: payload });
  if (r.status === 409) { const e = new Error('Someone else just changed this. Your change was not saved. The latest version is loading, please redo it.'); e.code = 'stale'; throw e; }
  if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch(_){} const e = new Error(m || ('Request failed (' + r.status + ').')); e.status = r.status; throw e; }
  return r;
}
const VER = {}, prevStamp = {};
let pendingSaves = 0, lastStamp = null, polling = false, firstLoad = true;
// Same small interface the screens already use for saving: db.doc('projects/<id>').set(body) / .delete().
S.db = { doc(path){
  const [col, id] = path.split('/');
  return {
    async set(body){
      pendingSaves++;
      try { const j = await (await api('PUT', '/api/' + col + '/' + encodeURIComponent(id), body, { 'X-Base-Version': VER[path] || '' })).json(); VER[path] = j.version; return j; }
      catch (e) { if (e.code === 'stale') { lastStamp = null; setTimeout(poll, 300); } throw e; }
      finally { pendingSaves--; }
    },
    async delete(){
      pendingSaves++;
      try { await api('DELETE', '/api/' + col + '/' + encodeURIComponent(id)); delete VER[path]; }
      finally { pendingSaves--; }
    }
  };
} };
S.assets = true; S.live = true;

function applyState(st){
  if (st.execs && st.execs.length) EXECS.splice(0, EXECS.length, ...st.execs);
  S.team = { managers: st.managers || [], seesAll: st.seesAllFiles || [] };
  const fresh = st.projects.map(p => { VER['projects/' + p.id] = p._v; delete p._v; return p; });
  if (!firstLoad) fresh.forEach(p => { if (prevStamp[p.id] !== p.updatedAt && p.updatedBy && p.updatedBy !== S.me) S.recent[p.id] = Date.now(); });
  fresh.forEach(p => prevStamp[p.id] = p.updatedAt);
  S.projects = fresh;
  const next = {};
  Object.keys(st.subplans).forEach(k => { const dd = st.subplans[k]; VER['subplans/' + k] = dd._v; delete dd._v; next[k] = dd; });
  S.subplans = next;
  firstLoad = false; S.loadError = null;
}
async function poll(){
  if (polling || document.hidden) return;
  polling = true;
  try {
    const st = await (await api('GET', '/api/state' + (lastStamp ? '?stamp=' + encodeURIComponent(lastStamp) : ''))).json();
    S.sync = { at: new Date(), state: 'live' };
    if (!st.unchanged) {
      // Don't overwrite what's being saved; try again on the next pass.
      if (pendingSaves || Object.keys(spTimers).length) { lastStamp = null; }
      else { lastStamp = st.stamp; applyState(st); render(); }
    }
    liveBadge();
  } catch (e) { S.sync.state = 'offline'; liveBadge(); }
  finally { polling = false; }
}
function reloadNow(){ lastStamp = null; return poll(); }

/* ---------- boot ---------- */
render();
(async function(){
  try {
    const st = await (await api('GET', '/api/state')).json();
    lastStamp = st.stamp; applyState(st); S.sync = { at: new Date(), state: 'live' };
  } catch (e) { S.sync = { at: null, state: 'offline' }; S.loadError = e && e.message; }
  S.ready = true; render(); liveBadge();
  setInterval(poll, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  window.addEventListener('online', poll);
})();
})();
