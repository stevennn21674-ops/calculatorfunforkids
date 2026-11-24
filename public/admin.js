/* UnStevened Social — owner & staff panel */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const I = USI.icon;
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (t) => t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  let ME = null, viewNet = '', page = 'overview';
  let PANEL = ''; // owner unlock token — only kept in this page, so every visit asks again
  const papi = (path, opts = {}) => USS.api(path, { ...opts, headers: { ...(opts.headers || {}), ...(PANEL ? { 'X-Panel': PANEL } : {}) } });
  const api = (path, opts) => papi('admin/' + path + (viewNet ? (path.includes('?') ? '&' : '?') + 'net=' + viewNet : ''), opts);
  const has = (p) => ME.owner || ME.perms.includes(p);
  let toastT;
  const toast = (m, bad) => { const t = $('#toast'); t.textContent = m; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3000); };
  const sheet = (h, fn) => { $('#sheet').innerHTML = h; $('#modal').hidden = false; fn && fn($('#sheet')); };
  const close = () => { $('#modal').hidden = true; };
  $('#modal').onclick = e => { if (e.target.id === 'modal') close(); };
  const run = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, true); } };

  const PAGES = [
    ['overview', 'chart', 'Overview', 'stats'],
    ['credits', 'bolt', 'Usage & limits', 'owner'],
    ['users', 'users', 'People', 'users.view'],
    ['clips', 'clips', 'Clips', 'posts.hide|posts.delete'],
    ['reports', 'flag', 'Reports', 'reports.view'],
    ['calls', 'phone', 'Live calls', 'calls.view'],
    ['groups', 'chat', 'Group chats', 'groups.view'],
    ['roles', 'crown', 'Roles', 'roles.manage|roles.assign'],
    ['settings', 'gear', 'Site settings', 'settings|announce|filter'],
    ['nets', 'globe', 'Networks', 'nets.view'],
    ['devices', 'lock', 'Device bans', 'users.devban'],
    ['audit', 'list', 'Audit log', 'audit']
  ];
  const allowed = (p) => p[3] === 'owner' ? ME.owner : p[3].split('|').some(has);

  USS.onChange(async S => {
    if (S.online === null || S.server === null) return;
    if (!S.me || !(S.me.perms || []).includes('panel')) {
      $('#gate').innerHTML = `<div class="gate-box">${USI.logo(80)}<h1>Staff only</h1><p>${S.me ? "Your account can't open the panel." : 'Sign in on the main page first.'}</p><a class="btn" href="./">Back to UnStevened Social</a></div>`;
      return;
    }
    if (ME) return;
    const who = await USS.api('admin/me');
    if (who.owner && !PANEL) { // ask for the owner password every time
      if ($('#gate').dataset.pw === '1') return; $('#gate').dataset.pw = '1';
      $('#gate').innerHTML = `<div class="gate-box">${USI.logo(80)}<h1>Owner panel</h1><p>Enter the owner password to continue.</p><form id="pwF" style="display:flex;flex-direction:column;gap:10px"><input id="pwI" type="password" autocomplete="current-password" placeholder="Owner password"><div class="err" id="pwE"></div><button class="btn">Unlock</button></form><a href="./">Back to UnStevened Social</a></div>`;
      $('#pwI').focus();
      $('#pwF').onsubmit = async e => {
        e.preventDefault(); $('#pwE').textContent = '';
        try { PANEL = (await USS.api('admin/unlock', { method: 'POST', json: { password: $('#pwI').value } })).panel; $('#gate').dataset.pw = ''; ME = who; $('#gate').hidden = true; $('#adm').hidden = false; renderSide(); show('overview'); }
        catch (er) { $('#pwE').textContent = er.message; $('#pwI').select(); }
      };
      return;
    }
    ME = who;
    $('#gate').hidden = true; $('#adm').hidden = false;
    renderSide(); show('overview');
  });
  function renderSide() {
    $('#side').innerHTML = `<div class="brand">${USI.logo(28)}<b>${ME.owner ? 'Owner' : 'Staff'}</b><i>Panel</i></div>` +
      (ME.owner && viewNet ? `<div class="announce warn" style="margin:0 0 8px;font-size:12px">Viewing another network <button class="btn sm ghost" id="backNet">Mine</button></div>` : '') +
      PAGES.filter(allowed).map(p => `<button data-p="${p[0]}" class="${page === p[0] ? 'on' : ''}">${I(p[1], 18)}${p[2]}</button>`).join('') +
      `<div class="sep">Site</div><button onclick="location.href='./'">${I('back', 18)}Back to Social</button>`;
    $$('[data-p]', $('#side')).forEach(b => b.onclick = () => show(b.dataset.p));
    $('#backNet') && ($('#backNet').onclick = () => { viewNet = ''; renderSide(); show(page); });
  }
  async function show(p) {
    page = p; $$('[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
    const body = $('#body'); body.innerHTML = '<p style="color:var(--mut)">Loading…</p>';
    try { await VIEWS[p](body); } catch (e) { body.innerHTML = `<div class="card">${esc(e.message)}</div>`; }
  }
  const head = (ic, t, extra = '') => `<div class="row" style="justify-content:space-between;flex-wrap:wrap"><h2>${I(ic, 24)}${t}</h2><div class="row">${extra}</div></div>`;
  const SAVER = ['Normal', 'Saving', 'Heavy saving', 'Paused'];
  const SAVER_TXT = ['Everything runs at full speed.', 'Chats sync half as often.', 'Clips capped at 30 s and shrunk more, chats sync ¼ as often.', 'New clips paused, clips stop loading, chats sync ⅛ as often. Calls still work.'];

  const VIEWS = {
    async overview(b) {
      const d = await api('overview');
      b.innerHTML = head('chart', 'Overview', `<span class="tag">Wi-Fi ${esc(USS.S.network)}</span>`) + (ME.owner ? `<div class="card" style="border-color:${d.cfg.shutdown ? 'var(--bad)' : 'var(--line)'}"><h3>${I('lock', 18)} ${d.cfg.shutdown ? 'The site is SHUT DOWN' : 'Shut down the whole site'}</h3>
          <span style="color:var(--mut)">${d.cfg.shutdown ? 'Nobody but you can use it, and their devices stop talking to the server (no credits used).' : 'Closes everything for everyone (clips, chats, calls, staff too). Only you can log in. Their devices stop using credits.'}</span>
          ${d.cfg.shutdown ? `<button class="btn" id="sdOpen" style="align-self:flex-start">${I('door', 18)}Open the site back up</button>` : `<input id="sdMsg" maxlength="200" placeholder="Message people see (optional)" value="${esc(d.cfg.shutdownMsg || '')}"><button class="btn danger" id="sdGo" style="align-self:flex-start">${I('lock', 18)}Shut down site</button>`}</div>` : '') + (ME.owner ? `<div class="card"><h3>${I('lock', 18)} Entry code</h3><span style="color:var(--mut)">People crack the code once per device. This makes everyone (except you) crack a new one next time they open the site.</span><div class="row" style="flex-wrap:wrap"><button class="btn ${d.cfg.codeOn === false ? '' : 'ghost'}" id="codeTog">${d.cfg.codeOn === false ? 'Turn the code ON' : 'Turn the code OFF'}</button><button class="btn ghost" id="relock">${I('lock', 16)}Make everyone enter it again</button></div><small style="color:var(--mut)">Right now: <b>${d.cfg.codeOn === false ? 'OFF — anyone can get in' : 'ON'}</b>. Changes show up for people within about 20 seconds.</small></div><div class="card"><h3>${I('lock', 18)} Google sign-in</h3><span style="color:var(--mut)">${d.cfg.googleOn ? 'New accounts must connect a Google account, and you can see their Google name and email in People.' : 'Off: add the GOOGLE_CLIENT_ID setting in Cloudflare to turn it on (see SETUP.md).'}</span><div class="row" style="flex-wrap:wrap"><input id="gDom" placeholder="Only allow emails from (e.g. myschool.org)" value="${esc(d.cfg.googleDomain || '')}" style="flex:1;min-width:220px"><button class="btn ghost" id="gDomSave">Save</button></div><small style="color:var(--mut)">Leave empty to allow any Google account.</small></div>` : '') + `<div class="grid4">
        ${[['People', d.users], ['Clips', d.posts], ['Clips today', d.postsToday], ['Total views', d.views], [d.r2 ? 'Cloudflare storage' : 'Storage', d.r2 ? d.r2GB + ' / 9 GB' : d.storageMB + ' MB'], ['Live calls', d.liveCalls], ['Open reports', d.openReports], ['Networks', d.networks]].map(([k, v]) => `<div class="kpi"><b>${v}</b><span>${k}</span></div>`).join('')}</div>
        <div class="card"><h3>Saver: ${SAVER[d.saver]}</h3><span style="color:var(--mut)">${SAVER_TXT[d.saver]}</span>${ME.owner ? '<button class="btn ghost sm" style="align-self:flex-start" id="goCred">Open usage</button>' : ''}</div>
        <div class="card"><h3>Rules right now</h3><span>${d.cfg.postMax} clips every ${d.cfg.postWindowMin} min · clips up to ${d.cfg.maxVideoSec}s (${d.cfg.maxVideoSecLong}s with the long-clips permission) · groups max ${Math.min(5, d.cfg.groupMax)} · calls max ${d.cfg.callMax}${d.cfg.slowModeSec ? ' · slow mode ' + d.cfg.slowModeSec + 's' : ''}${d.cfg.maintenance ? ' · <b style="color:var(--c)">MAINTENANCE ON</b>' : ''}</span></div>`;
      $('#goCred') && ($('#goCred').onclick = () => show('credits'));
      $('#gDomSave') && ($('#gDomSave').onclick = async () => { await run(() => api('settings', { method: 'POST', json: { googleDomain: $('#gDom').value } }), 'Saved'); show('overview'); });
      $('#codeTog') && ($('#codeTog').onclick = async () => { await run(() => api('settings', { method: 'POST', json: { codeOn: d.cfg.codeOn === false } }), d.cfg.codeOn === false ? 'Code is ON' : 'Code is OFF'); show('overview'); });
      $('#relock') && ($('#relock').onclick = async () => { if (!confirm('Make everyone crack the entry code again?')) return; await run(() => api('settings', { method: 'POST', json: { codeEpoch: 1 } }), 'Everyone has to enter the code again'); });
      $('#sdGo') && ($('#sdGo').onclick = async () => { if (!confirm('Shut down UnStevened Social for everyone?')) return; await run(() => api('settings', { method: 'POST', json: { shutdown: true, shutdownMsg: $('#sdMsg').value } }), 'Site shut down'); show('overview'); });
      $('#sdOpen') && ($('#sdOpen').onclick = async () => { await run(() => api('settings', { method: 'POST', json: { shutdown: false } }), 'Site is open again'); show('overview'); });
    },

    async credits(b) {
      const d = await api('budget'); const s = (await api('settings')).cfg;
      const pct = Math.min(100, d.calls / d.limit * 100);
      b.innerHTML = head('bolt', 'Usage & limits') + `
        <div class="card"><h3>Today on Cloudflare (free plan)</h3>
          <div class="grid4"><div class="kpi"><b>${d.calls.toLocaleString()}</b><span>server requests of ${d.limit.toLocaleString()}</span></div><div class="kpi"><b>${d.storageGB} GB</b><span>clips stored (auto-cleanup at ${d.cleanGB} GB)</span></div><div class="kpi"><b>${SAVER[d.saver]}</b><span>saver level</span></div><div class="kpi"><b>${new Date(d.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b><span>daily limit resets</span></div></div>
          <div class="meter"><div style="width:${pct}%"></div></div>
          <small style="color:var(--mut)">Page files, watching clips and calls are free and unlimited. Only server requests (chats, likes, feed, uploads) count toward the 100,000/day. The saver slows things down automatically near the limit.</small></div>
        <div class="card"><h3>Saver mode</h3><div class="lvl"><button data-l="-1" class="${d.saverForce < 0 ? 'on' : ''}">Automatic</button>${SAVER.map((n, i) => `<button data-l="${i}" class="${d.saverForce === i ? 'on' : ''}">${n}</button>`).join('')}</div><button class="btn" id="cSave" style="align-self:flex-start">Save</button></div>
        <div class="card"><h3>Post limit</h3><div class="f2"><label>Clips per window<input type="number" id="pMax" value="${s.postMax}"></label><label>Window (minutes)<input type="number" id="pWin" value="${s.postWindowMin}"></label></div>
          <div class="row"><button class="btn" id="pSave">Save limit</button><button class="btn danger" id="pReset">${I('clock', 18)}Reset everyone's limits now</button></div>
          <small style="color:var(--mut)">Only you (the owner) can reset limits. No role can.</small></div>
        <div class="card"><h3>Clip storage</h3><div class="f2"><label>Max clip size (MB)<input type="number" id="r2Max" value="${s.maxVideoMB}"></label><label>Auto-cleanup above (GB, 10 = free limit)<input type="number" id="r2Gb" step="0.5" value="${s.r2CleanGB}"></label></div><small style="color:var(--mut)">When storage passes this, the oldest clips are deleted automatically (pinned & featured ones are kept).</small><button class="btn ghost" id="r2Save" style="align-self:flex-start">Save</button></div>`;
      let force = d.saverForce;
      $$('[data-l]', b).forEach(x => x.onclick = () => { force = Number(x.dataset.l); $$('[data-l]', b).forEach(y => y.classList.toggle('on', y === x)); });
      $('#cSave').onclick = () => run(() => api('settings', { method: 'POST', json: { saverForce: force } }), 'Saved');
      $('#r2Save').onclick = () => run(() => api('settings', { method: 'POST', json: { maxVideoMB: +$('#r2Max').value, r2CleanGB: Math.min(9.5, +$('#r2Gb').value) } }), 'Saved');
      $('#pSave').onclick = () => run(() => api('settings', { method: 'POST', json: { postMax: +$('#pMax').value, postWindowMin: +$('#pWin').value } }), 'Limit saved');
      $('#pReset').onclick = () => sheet(`<h3>Reset everyone's post limit?</h3><p style="margin:0;color:var(--mut)">Everyone can post ${s.postMax} clips again right away.</p><div class="row"><button class="btn ghost" style="flex:1" onclick="document.getElementById('modal').hidden=true">Cancel</button><button class="btn danger" style="flex:1" id="rY">Reset</button></div>`, x => $('#rY', x).onclick = () => { close(); run(() => api('resetall', { method: 'POST', json: {} }), 'Everyone\'s limits were reset'); });
    },

    async users(b) {
      b.innerHTML = head('users', 'People', `<input id="uq" placeholder="Search name or email" style="width:220px">${ME.owner ? `<button class="btn sm ghost" id="expAll">${I('save', 14)}Export all</button><button class="btn sm ghost" id="impBtn">${I('plus', 14)}Import</button>` : ''}`) + '<div class="tw"><table><thead><tr><th>Who</th><th>Roles</th><th>Status</th><th>Posts</th><th>Last seen</th><th></th></tr></thead><tbody id="ut"></tbody></table></div>';
      let t; const load = async () => {
        const d = await api('users?q=' + encodeURIComponent($('#uq').value));
        $('#ut').innerHTML = d.users.map(u => `<tr><td><b>${esc(u.display || u.u)}</b>${u.verified ? ' ' + I('check', 14) : ''}<br><small style="color:var(--mut)">@${esc(u.u)}</small>${u.google ? `<br><small title="Google account">${esc(u.google.name)} · ${esc(u.google.email)}</small>` : ''}</td>
          <td>${u.owner ? '<span class="tag warn">Owner</span>' : (u.roleIds || []).map(r => `<span class="tag">${esc(r)}</span>`).join('') || '—'}</td>
          <td>${u.timeout ? '<span class="tag bad">Timed out</span>' : ''}${u.status.banned ? `<span class="tag bad">${u.status.banned.until ? 'Suspended' : 'Banned'}</span>` : ''}${u.status.muted ? '<span class="tag warn">Muted</span>' : ''}${u.status.postban ? '<span class="tag warn">No posting</span>' : ''}${u.status.warns.length ? `<span class="tag warn">${u.status.warns.length} warn</span>` : ''}${!u.status.banned && !u.status.muted && !u.status.postban ? '<span class="tag ok">OK</span>' : ''}</td>
          <td>${u.posts24}${u.extraPosts ? ` <span class="tag">+${u.extraPosts}</span>` : ''}</td><td>${when(u.lastSeen)}</td>
          <td>${u.owner ? '' : `<button class="btn sm ghost" data-u="${esc(u.u)}">Manage</button>`}</td></tr>`).join('') || '<tr><td colspan="6">Nobody.</td></tr>';
        $$('[data-u]', b).forEach(x => x.onclick = () => manage(d.users.find(u => u.u === x.dataset.u), load));
      };
      $('#uq').oninput = () => { clearTimeout(t); t = setTimeout(load, 400); }; load();
      $('#expAll') && ($('#expAll').onclick = () => exportAccounts());
      $('#impBtn') && ($('#impBtn').onclick = () => importAccounts(load));
    },

    async clips(b) {
      const d = await api('posts');
      b.innerHTML = head('clips', 'Clips') + `<div class="tw"><table><thead><tr><th></th><th>Clip</th><th>By</th><th>Views</th><th>Likes</th><th></th></tr></thead><tbody>${d.posts.map(p => `<tr><td><img class="thumb" src="${p.thumb}" loading="lazy"></td><td>${esc(p.title || '(no title)')}<br><small style="color:var(--mut)">${when(p.created)} · ${(p.size / 1048576).toFixed(1)} MB</small><br>${p.pinned ? '<span class="tag">Pinned</span>' : ''}${p.featured ? '<span class="tag warn">Featured</span>' : ''}${p.hidden ? '<span class="tag bad">Hidden</span>' : ''}</td><td>@${esc(p.user)}</td><td>${p.views}</td><td>${p.likes}</td>
        <td><div class="row" style="flex-wrap:wrap">${has('posts.pin') ? `<button class="btn sm ghost" data-a="pin" data-id="${p.id}">${p.pinned ? 'Unpin' : 'Pin'}</button>` : ''}${has('posts.feature') ? `<button class="btn sm ghost" data-a="feature" data-id="${p.id}">${p.featured ? 'Unfeature' : 'Feature'}</button>` : ''}${has('posts.hide') ? `<button class="btn sm ghost" data-a="hide" data-id="${p.id}">${p.hidden ? 'Unhide' : 'Hide'}</button>` : ''}${has('posts.delete') ? `<button class="btn sm danger" data-a="delete" data-id="${p.id}">Delete</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="6">No clips.</td></tr>'}</tbody></table></div>`;
      $$('[data-a]', b).forEach(x => x.onclick = async () => { if (x.dataset.a === 'delete' && !confirm('Delete this clip for everyone?')) return; await run(() => api(`post/${x.dataset.id}/${x.dataset.a}`, { method: 'POST', json: {} }), 'Done'); show('clips'); });
    },

    async reports(b) {
      const d = await api('reports'); const open = d.reports.filter(r => r.open), done = d.reports.filter(r => !r.open).slice(0, 30);
      const row = (r) => `<div class="card" style="padding:12px"><div class="row" style="justify-content:space-between"><b>${r.type === 'clip' ? I('clips', 16) + ' Clip' : I('chat', 16) + ' Message'} by @${esc(r.user)}</b><small style="color:var(--mut)">${when(r.t)} · reported by @${esc(r.by)}</small></div>
        ${r.text ? `<div style="background:var(--bg3);padding:8px 10px;border-radius:10px">${esc(r.text)}${r.img ? ' [photo]' : ''}</div>` : ''}<span style="color:var(--mut)">Reason: ${esc(r.reason || '—')}</span>
        ${r.open && has('reports.resolve') ? `<div class="row" style="flex-wrap:wrap"><button class="btn sm ghost" data-close="${r.id}">Close</button>${r.type === 'message' && has('msgs.delete') ? `<button class="btn sm danger" data-del="${r.id}">Remove message & close</button>` : ''}${r.type === 'clip' && has('posts.delete') ? `<button class="btn sm danger" data-delclip="${esc(r.target)}" data-rid="${r.id}">Delete clip & close</button>` : ''}<button class="btn sm ghost" data-who="${esc(r.user)}">Manage @${esc(r.user)}</button></div>` : r.open ? '' : `<small style="color:var(--mut)">Closed by @${esc(r.closedBy || '?')}</small>`}</div>`;
      b.innerHTML = head('flag', 'Reports', `<span class="tag">${open.length} open</span>`) + (open.map(row).join('') || '<div class="card">No open reports.</div>') + (done.length ? '<h3 style="margin:10px 0 0;color:var(--mut)">Closed</h3>' + done.map(row).join('') : '');
      $$('[data-close]', b).forEach(x => x.onclick = async () => { await run(() => api('reports', { method: 'POST', json: { id: x.dataset.close } })); show('reports'); });
      $$('[data-del]', b).forEach(x => x.onclick = async () => { await run(() => api('reports', { method: 'POST', json: { id: x.dataset.del, deleteMessage: true } }), 'Message removed'); show('reports'); });
      $$('[data-delclip]', b).forEach(x => x.onclick = async () => { await run(() => api(`post/${x.dataset.delclip}/delete`, { method: 'POST', json: {} })); await run(() => api('reports', { method: 'POST', json: { id: x.dataset.rid } }), 'Clip deleted'); show('reports'); });
      $$('[data-who]', b).forEach(x => x.onclick = async () => { const d2 = await api('users?q=' + encodeURIComponent(x.dataset.who)); const u = d2.users.find(y => y.u === x.dataset.who); if (u) manage(u, () => {}); });
    },

    async calls(b) {
      const d = await api('calls');
      b.innerHTML = head('phone', 'Live calls', '<button class="btn sm ghost" id="rf">Refresh</button>') + (d.calls.map(c => `<div class="card" style="padding:12px"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><div><b>${c.kind === 'group' ? esc(c.gname) : 'Call from @' + esc(c.from)}</b> <span class="tag">${c.video ? 'Video' : 'Voice'}</span><span class="tag ${c.state === 'active' ? 'ok' : 'warn'}">${c.state}</span><br><small style="color:var(--mut)">${c.members.map(u => '@' + esc(u)).join(', ')} · started ${when(c.created)}</small></div>
        <div class="row">${has('calls.join') ? `<a class="btn sm" href="./?joincall=${c.id}">${I('phone', 14)}Join</a>` : ''}${has('calls.end') ? `<button class="btn sm danger" data-end="${c.id}">End</button>` : ''}</div></div></div>`).join('') || '<div class="card">No calls going on right now.</div>') +
        `<small style="color:var(--mut)">When you join, everyone in the call sees an ADMIN tag on you. ${has('calls.troll') ? 'Use the wand button in the call for the soundboard and effects.' : ''}</small>`;
      $('#rf').onclick = () => show('calls');
      $$('[data-end]', b).forEach(x => x.onclick = async () => { await run(() => USS.api(`call/${x.dataset.end}/end`, { method: 'POST', json: {} }), 'Call ended'); show('calls'); });
    },

    async groups(b) {
      const d = await api('groups');
      b.innerHTML = head('chat', 'Group chats') + `<div class="tw"><table><thead><tr><th>Name</th><th>Members</th><th>Made by</th><th>Created</th><th></th></tr></thead><tbody>${d.groups.map(g => `<tr><td><b>${esc(g.name)}</b></td><td>${g.members.length}/5 · ${g.members.map(u => '@' + esc(u)).join(', ')}</td><td>@${esc(g.owner)}</td><td>${when(g.created)}</td><td>${has('groups.delete') ? `<button class="btn sm danger" data-g="${g.id}">Delete</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5">No groups.</td></tr>'}</tbody></table></div><small style="color:var(--mut)">Staff can see group names and members, not the messages (only reported ones).</small>`;
      $$('[data-g]', b).forEach(x => x.onclick = async () => { if (!confirm('Delete this group and its messages?')) return; await run(() => api('groups', { method: 'POST', json: { action: 'delete', id: x.dataset.g } }), 'Group deleted'); show('groups'); });
    },

    async roles(b) {
      const d = await api('roles'); const roles = d.roles, P = d.perms;
      const canEdit = has('roles.manage');
      const groups = {}; for (const [k, v] of Object.entries(P)) (groups[k.split('.')[0]] ||= []).push([k, v]);
      const NAMES = { panel: 'Panel', stats: 'Stats', users: 'People', posts: 'Clips', reports: 'Reports', calls: 'Calls', groups: 'Groups', msgs: 'Messages', chat: 'Chat', roles: 'Roles', announce: 'Site', settings: 'Site', filter: 'Site', audit: 'Site', nets: 'Networks' };
      const draw = () => {
        b.innerHTML = head('crown', 'Roles', canEdit ? '<button class="btn sm" id="addR">New role</button><button class="btn sm" id="saveR">Save roles</button>' : '') +
          `<small style="color:var(--mut)">Higher rank = more power. People can only manage people with a lower rank. Post-limit resets are owner-only and aren't a permission.</small>` +
          Object.entries(roles).sort((x, y) => y[1].rank - x[1].rank).map(([k, r]) => `<div class="card" data-role="${esc(k)}">
            <div class="row" style="flex-wrap:wrap"><span class="role" style="color:${r.color}">${I(USI.BADGE[r.badge] || 'star', 12)}${esc(r.name)}</span>
            ${canEdit ? `<input data-f="name" value="${esc(r.name)}" style="width:150px"><input data-f="color" type="color" value="${r.color}" style="width:50px;padding:2px"><select data-f="badge" style="width:120px">${['shield', 'hammer', 'heart', 'star', 'bolt', 'spark', 'check'].map(x => `<option ${x === r.badge ? 'selected' : ''}>${x}</option>`).join('')}</select><label style="display:flex;gap:6px;align-items:center;font-size:13px">Rank<input data-f="rank" type="number" value="${r.rank}" style="width:80px"></label><button class="btn sm danger" data-delr="${esc(k)}">Delete</button>` : `<span class="tag">rank ${r.rank}</span>`}</div>
            <div class="perms">${Object.entries(groups).map(([g, list]) => `<div style="grid-column:1/-1;font-size:11px;color:var(--mut);text-transform:uppercase;margin-top:6px">${NAMES[g] || g}</div>` + list.map(([p, label]) => `<label><input type="checkbox" data-p="${p}" ${r.perms.includes(p) ? 'checked' : ''} ${canEdit ? '' : 'disabled'}>${esc(label)}</label>`).join('')).join('')}</div></div>`).join('');
        $$('[data-role]', b).forEach(card => {
          const k = card.dataset.role;
          $$('[data-f]', card).forEach(i => i.oninput = () => { roles[k][i.dataset.f] = i.dataset.f === 'rank' ? +i.value : i.value; });
          $$('[data-p]', card).forEach(c => c.onchange = () => { roles[k].perms = c.checked ? [...new Set([...roles[k].perms, c.dataset.p])] : roles[k].perms.filter(x => x !== c.dataset.p); });
        });
        $$('[data-delr]', b).forEach(x => x.onclick = () => { if (confirm('Delete this role? People lose it.')) { delete roles[x.dataset.delr]; draw(); } });
        $('#addR') && ($('#addR').onclick = () => { const id = (prompt('Role id (letters, e.g. "builder")') || '').toLowerCase().replace(/[^a-z0-9_]/g, ''); if (id && !roles[id]) { roles[id] = { name: id, color: '#5cc8ff', badge: 'spark', rank: 10, perms: [] }; draw(); } });
        $('#saveR') && ($('#saveR').onclick = async () => { const r = await run(() => api('roles', { method: 'POST', json: { roles } }), 'Roles saved'); if (r) { Object.assign(roles, r.roles); draw(); } });
      };
      draw();
    },

    async settings(b) {
      const s = (await api('settings')).cfg;
      const sw = (k, label, perm = 'settings') => `<label class="sw"><span>${label}</span><input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''} ${has(perm) ? '' : 'disabled'}></label>`;
      const num = (k, label) => `<label>${label}<input type="number" data-k="${k}" value="${s[k]}" ${has('settings') ? '' : 'disabled'}></label>`;
      b.innerHTML = head('gear', 'Site settings', '<button class="btn sm" id="sSave">Save</button>') + `
        ${has('settings') ? `<div class="card"><h3>Switches</h3>${sw('maintenance', 'Maintenance mode (only staff with settings can use the site)')}${sw('signups', 'Allow new accounts')}${sw('postsOpen', 'Allow posting clips')}${sw('dmOpen', 'Allow messaging')}${sw('callsOpen', 'Allow calls')}${sw('gifs', 'Allow GIFs in chats')}</div>
        <div class="card"><h3>Numbers</h3><div class="f2">${num('maxVideoSec', 'Max clip length (s)')}${num('maxVideoSecLong', 'Max with long-clip permission (s)')}${num('maxVideoMB', 'Max clip size (MB)')}${num('gifMaxKB', 'Max GIF size (KB)')}${num('slowModeSec', 'Chat slow mode (s, 0 = off)')}${num('textPostMax', 'Text / picture / poll posts per window')}${num('groupMax', 'Group chat size (2–5)')}${num('callMax', 'Max people per call')}</div>
        <small style="color:var(--mut)">Post limit (${s.postMax} per ${s.postWindowMin} min) is under Credits & limits${ME.owner ? '' : ' (owner only)'}.</small></div>` : ''}
        ${has('announce') ? `<div class="card"><h3>Announcement banner</h3><textarea id="aText" rows="2" maxlength="300" placeholder="Shows at the top for everyone">${esc(s.announce?.text || '')}</textarea><div class="row"><select id="aStyle" style="width:160px"><option value="info">Normal</option><option value="warn" ${s.announce?.style === 'warn' ? 'selected' : ''}>Warning</option><option value="alert" ${s.announce?.style === 'alert' ? 'selected' : ''}>Alert</option></select><button class="btn sm ghost" id="aClear">Remove banner</button></div>
          <label style="font-size:13px;color:var(--mut)">Message of the day (sign-in screen)<input id="motd" maxlength="200" value="${esc(s.motd)}"></label></div>` : ''}
        ${has('filter') ? `<div class="card"><h3>Word filter</h3><textarea id="wf" rows="5" placeholder="One word per line — they get replaced with ****">${esc((s.wordFilter || []).join('\n'))}</textarea></div>` : ''}`;
      $('#aClear') && ($('#aClear').onclick = () => { $('#aText').value = ''; });
      $('#sSave').onclick = async () => {
        const body = {};
        if (has('settings')) $$('[data-k]', b).forEach(i => body[i.dataset.k] = i.type === 'checkbox' ? i.checked : +i.value);
        if (has('announce')) { body.announce = $('#aText').value.trim() ? { text: $('#aText').value.trim(), style: $('#aStyle').value } : null; body.motd = $('#motd').value; }
        if (has('filter')) body.wordFilter = $('#wf').value;
        await run(() => api('settings', { method: 'POST', json: body }), 'Settings saved');
      };
    },

    async nets(b) {
      const d = await api('nets');
      b.innerHTML = head('globe', 'Networks', `<span class="tag">${d.devBans} device bans</span>`) + `<div class="tw"><table><thead><tr><th>Network</th><th>Accounts made</th><th>First seen</th><th>Last signup</th><th></th></tr></thead><tbody>${d.nets.map(n => `<tr><td><b>${n.short}</b> ${n.mine ? '<span class="tag ok">yours</span>' : ''}${n.banned ? '<span class="tag bad">banned</span>' : ''}</td><td>${n.users || 0}</td><td>${when(n.first)}</td><td>${when(n.last)}</td><td><div class="row">${ME.owner && !n.mine ? `<button class="btn sm ghost" data-view="${n.id}">View</button>` : ''}${has('nets.ban') && !n.mine ? `<button class="btn sm ${n.banned ? 'ghost' : 'danger'}" data-ban="${n.id}" data-b="${n.banned ? 0 : 1}">${n.banned ? 'Unban' : 'Ban'}</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div><small style="color:var(--mut)">Each Wi-Fi is its own little world. As owner you can view and moderate other networks.</small>`;
      $$('[data-view]', b).forEach(x => x.onclick = () => { viewNet = x.dataset.view; renderSide(); show('overview'); });
      $$('[data-ban]', b).forEach(x => x.onclick = async () => { const ban = x.dataset.b === '1'; const reason = ban ? prompt('Reason (shown to them)') ?? '' : ''; await run(() => api('nets', { method: 'POST', json: { net: x.dataset.ban, ban, reason } }), ban ? 'Network banned' : 'Network unbanned'); show('nets'); });
    },

    async devices(b) {
      const d = await api('devbans');
      b.innerHTML = head('lock', 'Device bans') + `<div class="tw"><table><thead><tr><th>Device</th><th>By</th><th>Reason</th><th>When</th><th></th></tr></thead><tbody>${d.devBans.map(x => `<tr><td><code>${esc(x.device.slice(0, 10))}…</code></td><td>@${esc(x.by)}</td><td>${esc(x.reason || '—')}</td><td>${when(x.t)}</td><td>${has('users.unban') ? `<button class="btn sm ghost" data-d="${esc(x.device)}">Unban</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5">No banned devices.</td></tr>'}</tbody></table></div>`;
      $$('[data-d]', b).forEach(x => x.onclick = async () => { await run(() => api('devbans', { method: 'POST', json: { device: x.dataset.d } }), 'Device unbanned'); show('devices'); });
    },

    async audit(b) {
      const d = await api('audit');
      b.innerHTML = head('list', 'Audit log') + `<div class="tw"><table><thead><tr><th>When</th><th>Who</th><th>Did</th><th>To</th><th>Details</th></tr></thead><tbody>${d.log.slice(0, 300).map(l => `<tr><td>${when(l.t)}</td><td>@${esc(l.by)}</td><td>${esc(l.action)}</td><td>${esc(l.target)}</td><td style="color:var(--mut)">${esc(l.extra)}</td></tr>`).join('') || '<tr><td colspan="5">Nothing yet.</td></tr>'}</tbody></table></div>`;
    }
  };

  // ------------------------------------------------ export / import accounts (owner only)
  async function exportAccounts(only) {
    const d = await run(() => api('export' + (only ? '?users=' + only.join(',') : ''))); if (!d) return;
    const blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `unstevened-accounts-${d.from}-${only ? only.join('_') : 'all'}.json`; document.body.appendChild(a); a.click(); a.remove();
    toast(`Exported ${d.accounts.length} account${d.accounts.length === 1 ? '' : 's'}. Keep this file private — it can log into them.`);
  }
  function importAccounts(reload) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => {
      let data; try { data = JSON.parse(await i.files[0].text()); } catch { return toast('That file is not valid.', true); }
      if (data.type !== 'unstevened-social-accounts') return toast('That is not an UnStevened Social accounts file.', true);
      sheet(`<h3>Import ${data.accounts.length} account(s)</h3><p style="margin:0;color:var(--mut)">From network <b>${esc(data.from)}</b> into <b>${viewNet ? 'the network you are viewing' : 'your network (' + esc(USS.S.network) + ')'}</b>. They keep their passwords and profile pictures.</p>
        <label class="sw"><span>If a username is already taken here</span><select id="impMode" style="width:150px"><option value="skip">Skip it</option><option value="rename">Add as name_2</option></select></label>
        <button class="btn" id="impGo">Import</button>`, s => $('#impGo', s).onclick = async () => {
          const r = await run(() => api('import', { method: 'POST', json: { ...data, mode: $('#impMode', s).value } })); close();
          if (r) { toast(`Imported ${r.added.length + r.renamed.length}, skipped ${r.skipped.length}`); reload && reload(); }
        });
    };
    i.click();
  }
  // ------------------------------------------------ manage one person
  async function manage(u, reload) {
    const R = (await api('roles').catch(() => ({ roles: {} }))).roles;
    const act = async (a, extra = {}) => { await run(() => api(`user/${encodeURIComponent(u.u)}/${a}`, { method: 'POST', json: extra }), 'Done'); close(); reload(); };
    const durSel = `<select id="dur" style="width:150px"><option value="10">10 minutes</option><option value="60">1 hour</option><option value="1440" selected>1 day</option><option value="10080">1 week</option><option value="0">Forever</option></select>`;
    const btn = (perm, a, ic, label, cls = 'ghost') => has(perm) ? `<button class="btn sm ${cls}" data-a="${a}">${I(ic, 14)}${label}</button>` : '';
    sheet(`<h3>@${esc(u.u)}${u.display ? ' · ' + esc(u.display) : ''}</h3>
      ${u.google ? `<div><b>Google:</b> ${esc(u.google.name)} · ${esc(u.google.email)}</div>` : ''}<small style="color:var(--mut)">Joined ${when(u.created)} · last seen ${when(u.lastSeen)} · ${u.devices.length} device(s) · ${u.posts24} posts in the current window</small>
      <label style="font-size:13px;color:var(--mut)">Reason (they see this)<input id="why" maxlength="200" placeholder="Optional"></label>
      <div class="row">${durSel}<span style="font-size:12px;color:var(--mut)">for mute / suspend / post ban</span></div>
      <b style="font-size:13px">Moderation</b><div class="row" style="flex-wrap:wrap">
        ${btn('users.warn', 'warn', 'flag', 'Warn')}${u.status.muted ? btn('users.unban', 'unmute', 'mic', 'Unmute') : btn('users.mute', 'mute', 'micOff', 'Mute')}
        ${u.status.postban ? btn('users.unban', 'unpostban', 'clips', 'Allow posting') : btn('users.postban', 'postban', 'clips', 'Ban from posting')}
        ${u.status.banned ? btn('users.unban', 'unban', 'door', 'Unban', '') : btn('users.suspend', 'suspend', 'clock', 'Suspend', 'danger') + btn('users.ban', 'ban', 'lock', 'Ban forever', 'danger')}
        ${btn('users.devban', 'devban', 'lock', 'Ban their devices', 'danger')}${btn('users.unban', 'undevban', 'door', 'Unban devices')}</div>
      <b style="font-size:13px">Account</b><div class="row" style="flex-wrap:wrap">
        ${btn('users.rename', 'rename', 'edit', 'Change name')}${btn('users.avatar', 'avatar', 'image', 'Remove photo')}${btn('users.resetpw', 'resetpw', 'lock', 'Force new password')}${btn('users.verify', 'verify', 'check', u.verified ? 'Remove verified' : 'Verify')}${btn('posts.delete', 'purge', 'trash', 'Delete all their clips', 'danger')}${btn('users.delete', 'delete', 'trash', 'Delete account', 'danger')}</div>
      ${u.timeout ? `<div class="row"><span class="tag bad">Timed out until ${when(u.timeout)}</span>${btn('users.unban', 'untimeout', 'clock', 'Lift timeout', '')}</div>` : ''}
      ${ME.owner ? `<b style="font-size:13px">Account file (owner only)</b><div class="row"><button class="btn sm ghost" id="expOne">${I('save', 14)}Export this account</button></div>` : ''}
      ${ME.owner ? `<b style="font-size:13px">Post limit (owner only)</b><div class="row" style="flex-wrap:wrap"><button class="btn sm" data-a="resetlimit">${I('clock', 14)}Reset their limit</button><input id="extra" type="number" min="0" max="50" value="${u.extraPosts}" style="width:90px"><button class="btn sm ghost" data-a="extra">Set bonus posts</button></div>` : ''}
      ${has('roles.assign') ? `<b style="font-size:13px">Roles</b><div class="perms">${Object.entries(R).sort((a, b) => b[1].rank - a[1].rank).map(([k, r]) => `<label><input type="checkbox" data-role="${esc(k)}" ${(u.roleIds || []).includes(k) ? 'checked' : ''} ${!ME.owner && r.rank >= ME.rank ? 'disabled' : ''}><span style="color:${r.color}">${esc(r.name)}</span></label>`).join('')}</div><button class="btn sm" data-a="roles">Save roles</button>` : ''}`, s => {
      $('#expOne', s) && ($('#expOne', s).onclick = () => exportAccounts([u.u]));
      $$('[data-a]', s).forEach(b => b.onclick = async () => {
        const a = b.dataset.a, reason = $('#why', s).value, minutes = +$('#dur', s).value;
        if (['ban', 'devban', 'delete', 'purge'].includes(a) && !confirm(`Really ${b.textContent.trim().toLowerCase()} for @${u.u}?`)) return;
        if (a === 'rename') { const n = prompt('New display name', u.display || ''); if (n !== null) act(a, { display: n }); return; }
        if (a === 'extra') return act(a, { amount: +$('#extra', s).value });
        if (a === 'roles') return act(a, { roles: $$('[data-role]', s).filter(x => x.checked).map(x => x.dataset.role) });
        act(a, { reason, minutes });
      });
    });
  }
})();
