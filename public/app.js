/* UnStevened Social — app */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const I = USI.icon, api = USS.api;
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
  const users = {};                       // username -> public profile cache
  let me = null, tab = 'clips';
  const GAMES = window.US2_GAMES_URL || 'https://unstevened2-reupload.netlify.app';

  // ------------------------------------------------ small UI helpers
  let toastT;
  function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
  function sheet(html, onOpen) { $('#sheet').innerHTML = html; $('#modal').hidden = false; onOpen && onOpen($('#sheet')); }
  function closeSheet() { $('#modal').hidden = true; $('#sheet').innerHTML = ''; }
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeSheet(); });
  const confirmIt = (title, text, yes = 'Yes', bad) => new Promise(res => {
    sheet(`<h3>${esc(title)}</h3><p style="margin:0;color:var(--mut)">${esc(text)}</p><div class="row"><button class="btn ghost" style="flex:1" data-n>Cancel</button><button class="btn ${bad ? 'danger' : ''}" style="flex:1" data-y>${esc(yes)}</button></div>`, s => {
      $('[data-n]', s).onclick = () => { closeSheet(); res(false); }; $('[data-y]', s).onclick = () => { closeSheet(); res(true); };
    });
  });
  const askText = (title, ph = '', val = '') => new Promise(res => {
    sheet(`<h3>${esc(title)}</h3><input id="askIn" placeholder="${esc(ph)}" value="${esc(val)}" maxlength="200"><div class="row"><button class="btn ghost" style="flex:1" data-n>Cancel</button><button class="btn" style="flex:1" data-y>OK</button></div>`, s => {
      const i = $('#askIn', s); i.focus();
      $('[data-n]', s).onclick = () => { closeSheet(); res(null); }; $('[data-y]', s).onclick = () => { closeSheet(); res(i.value.trim()); };
      i.onkeydown = e => { if (e.key === 'Enter') $('[data-y]', s).click(); };
    });
  });
  let pres = {}; const isOn = (u) => u === me?.u || (pres[u] > 0 && Date.now() - pres[u] < 90000); // 0/negative = left the site
  function av(u, cls = '') {
    const p = users[u] || {}; if (isOn(u) && u !== me?.u && pres[u]) cls += ' on'; const style = p.avatar ? `style="background-image:url('${p.avatar}')"` : '';
    return `<span class="av ${cls}" ${style}>${p.avatar ? '' : esc((p.display || u || '?')[0].toUpperCase())}</span>`;
  }
  function nameTag(u) {
    const p = users[u] || {}; const roles = p.roles || [];
    const col = p.color ? `style="color:${p.color}"` : '';
    const badge = roles.includes('owner') ? I('crown', 14) : '';
    return `<span class="name" ${col}>${esc(p.display || u)}${p.verified ? `<span class="verified">${I('check', 15)}</span>` : ''}${badge}</span>`;
  }
  function roleChips(p) {
    const R = USS.S.hello?.roles || {};
    return (p.roles || []).map(r => r === 'owner' ? `<span class="role" style="color:#ffc928">${I('crown', 12)}Owner</span>` : R[r] ? `<span class="role" style="color:${R[r].color}">${I(USI.BADGE[R[r].badge] || 'star', 12)}${esc(R[r].name)}</span>` : '').join('');
  }
  $$('[data-ic]').forEach(e => e.innerHTML = I(e.dataset.ic, 22));
  $('#brandLogo').innerHTML = USI.logo(30);
  const setIc = (sel, name, size = 22) => $(sel).insertAdjacentHTML('afterbegin', I(name, size));
  setIc('#adminBtn', 'shield'); setIc('#newGroupBtn', 'users'); setIc('#addFriendBtn', 'addUser'); setIc('#chatBack', 'back');
  setIc('#chatCall', 'phone'); setIc('#chatVideo', 'video'); setIc('#chatMore', 'more'); setIc('#imgBtn', 'image'); setIc('#sendBtn', 'send', 20);
  $('.drop-ic').innerHTML = I('clips', 40);
  $('#adminBtn').onclick = () => location.href = 'admin.html';

  // ------------------------------------------------ entry code: crack it to get in (no hints). Owner: press ` (or hold the blurry box) + password
  let codeTok = null, codeBusy = false;
  function codeGate(g) {
    if (g.dataset.code === '1' && !g.hidden) return;
    g.hidden = false; g.dataset.code = '1'; g.dataset.auth = '';
    g.innerHTML = `<div class="gate-box">${USI.logo(72)}<h1>Enter the code</h1><p>Crack the code to get in.</p>
      <div class="code-digits" id="codeDigits"><span>·</span><span>·</span><span>·</span><span>·</span></div>
      <form id="codeForm" style="display:flex;flex-direction:column;gap:10px"><input id="codeGuess" inputmode="numeric" maxlength="4" placeholder="Answer" autocomplete="off"><div class="err" id="codeErr"></div><button class="btn">Enter</button></form>
      <button type="button" class="btn ghost sm" id="ownerIn2" style="align-self:center;opacity:.45">Owner</button><div class="code-secret locked" id="codeSecret"><b>Answer</b><div class="cs-ans" id="csAns"></div><b>Logic</b><div class="cs-logic" id="csLogic"></div></div></div>`;
    lockSecret(); newCode();
    clearInterval(window.__codeT); window.__codeT = setInterval(() => { if (g.hidden || g.dataset.code !== '1') return clearInterval(window.__codeT); if (!document.hidden) USS.hello(); }, 20000); // owner may switch the code off
    $('#ownerIn2').onclick = () => { ownerLogin = true; g.dataset.code = ''; renderGate({ ...USS.S, me: null }); };
    $('#codeForm').onsubmit = async e => {
      e.preventDefault(); if (!codeTok || codeBusy) return; codeBusy = true;
      try {
        const r = await api('code/check', { method: 'POST', json: { token: codeTok, guess: $('#codeGuess').value } });
        if (r.correct) { g.dataset.code = ''; USS.setPass(r.pass); USS.hello(); }
        else { $('#codeErr').textContent = `Wrong. ${r.left} ${r.left === 1 ? 'try' : 'tries'} left on this code.`; $('#codeGuess').select(); }
      } catch (er) { $('#codeErr').textContent = er.message; if (er.data?.newCode) newCode(true); }
      codeBusy = false;
    };
    let lpT; const box = $('#codeSecret');
    box.addEventListener('pointerdown', () => { lpT = setTimeout(askCodePassword, 700); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => box.addEventListener(ev, () => clearTimeout(lpT)));
  }
  function lockSecret() { const b = $('#codeSecret'); if (!b) return; b.classList.add('locked'); $('#csAns').textContent = String(Math.floor(Math.random() * 9000) + 1000); $('#csLogic').textContent = 'Only the owner can see this.'; }
  async function newCode(keepErr) {
    lockSecret(); if (!keepErr && $('#codeErr')) $('#codeErr').textContent = '';
    try { const d = await api('code/new'); codeTok = d.token; $('#codeDigits').innerHTML = [...d.code].map(x => `<span>${x}</span>`).join(''); if ($('#codeGuess')) $('#codeGuess').value = ''; }
    catch (e) { if ($('#codeErr')) $('#codeErr').textContent = e.message; }
  }
  function askCodePassword() {
    if (!codeTok || !$('#modal').hidden) return;
    sheet(`<h3>${I('lock', 20)} Owner password</h3><input id="cpw" type="password" autocomplete="off" placeholder="Password"><div class="err" id="cpErr"></div><button class="btn" id="cpGo">Unlock</button>`, s => {
      const i = $('#cpw', s); setTimeout(() => i.focus(), 50);
      const go = async () => {
        try { const r = await api('code/reveal', { method: 'POST', json: { token: codeTok, password: i.value } }); closeSheet(); $('#csAns').textContent = r.answer; $('#csLogic').textContent = r.logic; $('#codeSecret').classList.remove('locked'); }
        catch (e) { $('#cpErr', s).textContent = e.message; i.select(); }
      };
      $('#cpGo', s).onclick = go; i.onkeydown = e => { if (e.key === 'Enter') go(); };
    });
  }
  addEventListener('keydown', e => { if ((e.key === '`' || e.code === 'Backquote') && $('#gate')?.dataset.code === '1' && !$('#gate').hidden) { e.preventDefault(); askCodePassword(); } });

  // ------------------------------------------------ gate: offline / sign in / banned / maintenance
  let authMode = 'login', ownerLogin = false;
  function renderGate(S) {
    const g = $('#gate');
    if (S.online === null) { g.hidden = false; g.innerHTML = `<div class="gate-box">${USI.logo(84)}<p>Connecting…</p></div>`; return true; }
    if (!S.online || S.server === false) {
      g.hidden = false;
      g.innerHTML = `<div class="gate-box">${USI.logo(84)}<h1>You're offline</h1><p>${S.online ? "Can't reach UnStevened Social right now." : USS.OFFLINE}</p><button class="btn" id="retry">Try again</button><a href="${GAMES}">Back to UnStevened games</a></div>`;
      $('#retry').onclick = () => { g.innerHTML = `<div class="gate-box">${USI.logo(84)}<p>Checking…</p></div>`; USS.check(true); };
      return true;
    }
    if (S.blocked?.banned) { g.hidden = false; g.innerHTML = `<div class="gate-box">${USI.logo(84)}<h1>Access blocked</h1><p>${esc(S.blocked.error || 'You are banned.')}</p>${S.me ? '<button class="btn ghost" id="lo">Sign out</button>' : ''}</div>`; $('#lo') && ($('#lo').onclick = () => { USS.S.blocked = null; USS.logOut(); }); return true; }
    if (S.blocked?.timeout) { // spam timeout: nothing works until it's over (refreshing / new accounts don't help)
      g.hidden = false; g.dataset.auth = ''; g.dataset.code = '';
      const until = S.blocked.timeout;
      g.innerHTML = `<div class="gate-box">${USI.logo(84)}<h1>You're timed out</h1><p>You were spamming, so you can't use UnStevened Social for a bit.</p><div class="countdown" id="toLeft" style="font-size:44px"></div><p style="font-size:13px">Refreshing, logging out or making a new account won't skip it.</p></div>`;
      clearInterval(window.__toT);
      const tick = () => { const ms = until - Date.now(); if (ms <= 0) { clearInterval(window.__toT); USS.S.blocked = null; USS.check(true); return; } const sx = Math.ceil(ms / 1000); $('#toLeft') && ($('#toLeft').textContent = Math.floor(sx / 60) + ':' + String(sx % 60).padStart(2, '0')); };
      tick(); window.__toT = setInterval(tick, 1000);
      return true;
    }
    if (S.blocked?.shutdown && !ownerLogin) {
      g.hidden = false; g.dataset.auth = '';
      g.innerHTML = `<div class="gate-box">${USI.logo(84)}<h1>We're closed</h1><p>${esc(S.blocked.error)}</p><p style="font-size:13px">Check back later!</p><a href="${GAMES}">UnStevened games</a><button class="btn ghost sm" id="ownerIn" style="align-self:center;opacity:.5">Owner</button></div>`;
      $('#ownerIn').onclick = () => { ownerLogin = true; renderGate({ ...S, blocked: null, me: null }); };
      return true;
    }
    if (S.blocked?.maintenance) { g.hidden = false; g.innerHTML = `<div class="gate-box">${USI.logo(84)}<h1>Be right back</h1><p>${esc(S.blocked.error)}</p></div>`; return true; }
    if (!USS.hasPass() && !S.me?.owner && !(ownerLogin && !S.me)) { codeGate(g); return true; }
    g.dataset.code = '';
    if (!S.me) {
      if (g.dataset.auth === '1' && !g.hidden) return true;
      g.hidden = false; g.dataset.auth = '1';
      g.innerHTML = `<div class="gate-box">${USI.logo(84)}<h1>UnStevened <span style="background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent">Social</span></h1>
        <p>Clips, chats and calls with people on your Wi-Fi.</p>
        <div class="seg"><button data-m="login">Log in</button><button data-m="signup">Sign up</button></div>
        <form id="authForm" style="display:flex;flex-direction:column;gap:10px">
          <input id="au" autocomplete="username" autocapitalize="none" placeholder="Username" maxlength="20">
          <input id="ap" type="password" autocomplete="current-password" placeholder="Password" maxlength="100">
          <div id="gwrap" hidden style="display:flex;flex-direction:column;align-items:center;gap:6px"><div id="gbtn"></div><small id="gnote" style="color:var(--mut);text-align:center"></small></div>
          <div class="err" id="aerr"></div><button class="btn" id="ago"></button></form>
        <p style="font-size:12px">Network <b>${esc(S.network)}</b> · accounts only work on the Wi-Fi they were made on.</p>
        <a href="${GAMES}">Back to UnStevened games</a></div>`;
      const GID = S.hello?.cfg?.googleId, GDOM = S.hello?.cfg?.googleDomain; let gTok = '', gNeed = false;
      const gShow = () => {
        const on = GID && (authMode === 'signup' || gNeed); $('#gwrap').hidden = !on; if (!on) return;
        $('#gnote').innerHTML = gTok ? '✓ Google account connected' : `${authMode === 'signup' ? 'New accounts need' : 'This account needs'} a Google account${GDOM ? ` (@${esc(GDOM)})` : ''}. The site owner can see your Google name and email.`;
        if ($('#gbtn').dataset.r) return;
        const draw = () => { google.accounts.id.initialize({ client_id: GID, callback: r => { gTok = r.credential; gShow(); }, ...(GDOM ? { hd: GDOM } : {}) }); google.accounts.id.renderButton($('#gbtn'), { theme: 'filled_black', shape: 'pill', text: 'continue_with' }); $('#gbtn').dataset.r = 1; };
        if (window.google?.accounts?.id) draw(); else { const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.onload = draw; sc.onerror = () => $('#gnote').textContent = 'Google sign-in could not load. Check your connection.'; document.head.appendChild(sc); }
      };
      const seg = () => { $$('.seg button', g).forEach(b => b.classList.toggle('on', b.dataset.m === authMode)); $('#ago').textContent = authMode === 'login' ? 'Log in' : 'Create account'; gShow(); };
      $$('.seg button', g).forEach(b => b.onclick = () => { authMode = b.dataset.m; seg(); }); seg();
      $('#authForm').onsubmit = async e => {
        e.preventDefault(); $('#aerr').textContent = ''; $('#ago').disabled = true;
        try { await (authMode === 'login' ? USS.logIn : USS.signUp)($('#au').value, $('#ap').value, gTok || undefined); g.dataset.auth = ''; }
        catch (er) { $('#aerr').textContent = er.message; if (er.data?.needGoogle || /Google/.test(er.message)) { gNeed = true; if (/different|already|Only @/.test(er.message)) gTok = ''; gShow(); } }
        $('#ago').disabled = false;
      };
      return true;
    }
    g.hidden = true; g.dataset.auth = '';
    return false;
  }

  USS.onChange(S => {
    if (renderGate(S)) return;
    const first = !me || me.u !== S.me.u;
    me = S.me; users[me.u] = me;
    $('#netChip').hidden = false; $('#netChip').textContent = 'Wi-Fi ' + S.network;
    $('#adminBtn').hidden = !(me.perms || []).includes('panel');
    const a = S.hello?.announce, sv = S.saver;
    const ann = $('#announce');
    if (sv >= 3) { ann.hidden = false; ann.className = 'announce alert'; ann.innerHTML = I('bolt', 18) + '<span>The site is saving its monthly credits: new clips are paused and chats update slower until the month resets.</span>'; }
    else if (S.hello?.cfg?.shutdown) { ann.hidden = false; ann.className = 'announce alert'; ann.innerHTML = I('lock', 18) + '<span>The site is SHUT DOWN — only you can see it. Open it back up in the Owner panel.</span>'; }
    else if (a && localStorage.getItem('uss_ann_x') !== String(a.t)) { ann.hidden = false; ann.className = 'announce ' + (a.style || ''); ann.innerHTML = I('mega', 18) + `<span>${esc(a.text)}</span><button class="icon-btn x" title="Close" style="width:28px;height:28px">${I('close', 16)}</button>`; $('.x', ann).onclick = () => { localStorage.setItem('uss_ann_x', String(a.t)); ann.hidden = true; }; }
    else if (sv >= 2) { ann.hidden = false; ann.className = 'announce warn'; ann.innerHTML = I('bolt', 18) + '<span>Saving credits: clips are capped at 30 s and chats update a bit slower.</span>'; }
    else ann.hidden = true;
    const st = me.status || {};
    if (st.warns?.length) showWarns(st.warns);
    if (st.resetPw) forcePw();
    if (first) { loadFeed(true); refreshLimit(); loadFriends(); }
  });
  function showWarns(w) {
    if (!$('#modal').hidden) return;
    sheet(`<h3 style="color:var(--c)">${I('flag', 20)} You got a warning</h3>${w.map(x => `<div class="card" style="padding:12px">${esc(x.text)}<small style="color:var(--mut)">from staff · ${ago(x.t)} ago</small></div>`).join('')}<button class="btn" id="ack">I understand</button>`, s => {
      $('#ack', s).onclick = async () => { await api('warns/ack', { method: 'POST' }).catch(() => {}); me.status.warns = []; closeSheet(); };
    });
  }
  function forcePw() {
    sheet(`<h3>Staff reset your password</h3><p style="margin:0;color:var(--mut)">Pick a new one to keep going.</p><input id="np" type="password" placeholder="New password"><button class="btn" id="npGo">Save</button>`, s => {
      $('#npGo', s).onclick = async () => { try { await api('password', { method: 'POST', json: { password: $('#np', s).value } }); me.status.resetPw = false; closeSheet(); toast('Password changed'); } catch (e) { toast(e.message, true); } };
    });
  }

  function showErr(sel, e) { console.error(e); const el = $(sel); if (el) el.innerHTML = `<div class="card" style="border-color:var(--bad)"><b style="color:var(--bad)">Something broke here — screenshot this:</b><code style="font-size:12px;white-space:pre-wrap;word-break:break-all">${esc((e && (e.stack || e.message)) || e).slice(0, 600)}</code><button class="btn ghost sm" onclick="location.reload()">Reload</button></div>`; }
  addEventListener('error', e => { try { toast('Error: ' + (e.message || 'unknown'), true); } catch {} });
  addEventListener('unhandledrejection', e => { try { const m = e.reason?.message || String(e.reason); if (!/abort|cancel|Failed to fetch/i.test(m)) toast('Error: ' + m, true); } catch {} });
  // ------------------------------------------------ tabs
  function go(t) {
    tab = t; $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $$('.screen').forEach(s => s.hidden = s.id !== 'scr-' + t);
    if (t === 'post') refreshLimit();
    if (t === 'chats') loadFriends();
    if (t === 'me') renderMe();
    if (t !== 'clips') stopPlaying();
    else setTimeout(() => { const c = $$('#feed .clip').find(x => { const r = x.getBoundingClientRect(); return r.top < innerHeight * .5 && r.bottom > innerHeight * .5; }); c?.__clip?.auto(); }, 400);
  }
  $$('.tabs button').forEach(b => b.onclick = () => go(b.dataset.tab));

  // ------------------------------------------------ clips feed (thumbnails first; video only when you tap)
  let feedMode = 'all', page = 0, more = false, loadingFeed = false;
  $$('.feed-tabs button').forEach(b => b.onclick = () => { $$('.feed-tabs button').forEach(x => x.classList.toggle('on', x === b)); feedMode = b.dataset.feed; loadFeed(true); });
  async function loadFeed(reset) {
    if (loadingFeed) return; loadingFeed = true;
    if (reset) { page = 0; $('#feed').innerHTML = '<div class="empty">Loading clips…</div>'; }
    try {
      const d = await api(`posts?page=${page}` + (feedMode === 'mine' ? '&mine=1' : feedMode === 'following' ? '&following=1' : ''));
      Object.assign(users, d.users);
      if (reset) $('#feed').innerHTML = '';
      $('.more-btn')?.remove();
      if (!d.posts.length && reset) $('#feed').innerHTML = `<div class="empty">${I('clips', 48)}${feedMode === 'mine' ? "You haven't posted yet." : feedMode === 'following' ? 'Nothing here yet — follow people to see their posts.' : 'No clips on this Wi-Fi yet. Be the first!'}<br><br><button class="btn" onclick="document.querySelector('[data-tab=post]').click()">Post a clip</button></div>`;
      d.posts.forEach(p => $('#feed').appendChild(p.kind === 'post' ? postCard(p) : clipCard(p)));
      more = d.more; page++;
      if (more) { const b = document.createElement('button'); b.className = 'btn ghost more-btn'; b.textContent = 'Load more'; b.onclick = () => loadFeed(); $('#feed').appendChild(b); }
    } catch (e) { if (reset) $('#feed').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    loadingFeed = false;
  }
  let playing = null, clipMuted = false;
  function stopPlaying() { if (playing) { playing.pause(); playing = null; } }
  function syncMuteBtns() { $$('.clip .mute').forEach(b => b.innerHTML = I(clipMuted ? 'micOff' : 'speaker', 28) + `<span>${clipMuted ? 'Sound off' : 'Sound'}</span>`); }
  // auto-play: whichever clip is mostly on screen plays; the rest pause
  const clipIO = new IntersectionObserver(es => es.forEach(e => {
    const c = e.target.__clip; if (!c) return;
    if (e.isIntersecting && e.intersectionRatio >= .6 && tab === 'clips' && !document.querySelector('.viewer,.profile')) { clearTimeout(e.target.__t); e.target.__t = setTimeout(c.auto, 350); }
    else { clearTimeout(e.target.__t); c.pause(); }
  }), { threshold: [0, .6, .9] });
  function clipCard(p, opts = {}) {
    const el = document.createElement('div'); el.className = 'clip'; el.dataset.id = p.id;
    el.innerHTML = `<img loading="lazy" src="${p.thumb}" alt="">
      <div class="badges">${p.pinned ? `<span class="chip">${I('pin', 12)}Pinned</span>` : ''}${p.featured ? `<span class="chip" style="color:#ffc928">${I('star', 12)}Featured</span>` : ''}${p.hidden ? `<span class="chip">${I('eyeOff', 12)}Hidden</span>` : ''}</div>
      <button class="playbig"><span>${I('play', 30)}</span></button>
      <div class="tl"><div class="tl-bar"><i></i><b></b></div><span class="tl-t">0:00 / ${Math.floor((p.duration || 0) / 60)}:${String(Math.floor(p.duration || 0) % 60).padStart(2, '0')}</span></div>
      <div class="side">
        <button class="like ${p.liked ? 'liked' : ''}">${I('heart', 30)}<span>${p.likes}</span></button>
        <button class="mute">${I(clipMuted ? 'micOff' : 'speaker', 28)}<span>${clipMuted ? 'Sound off' : 'Sound'}</span></button>
        <button class="sh">${I('share', 28)}<span>Share</span></button>
        <button class="dl">${I('save', 28)}<span>Save</span></button>
        <button class="cmt">${I('chat', 28)}<span>${p.comments || 0}</span></button>
        <button class="opt">${I('more', 28)}</button>
      </div>
      <div class="shade"><div class="who">${av(p.user)}${nameTag(p.user)}</div>${p.title ? `<div class="ttl">${esc(p.title)}</div>` : ''}<div class="meta">${p.game ? esc(p.game) + ' · ' : ''}${p.views} views · ${ago(p.created)}</div></div>`;
    let vid = null, blob = null, loading = null, seen = false;
    const getBlob = async () => blob || (blob = await USS.loadClip(p));
    const big = $('.playbig span', el), fill = $('.tl-bar i', el), knob = $('.tl-bar b', el), tt = $('.tl-t', el);
    const dur = () => (vid && isFinite(vid.duration) && vid.duration > 0 ? vid.duration : p.duration || 0);
    const fmtT = (x) => { x = Math.max(0, Math.floor(x || 0)); return Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); };
    const drawTL = () => { if (!vid) return; const d = dur(), f = d ? Math.min(1, vid.currentTime / d) : 0; fill.style.width = f * 100 + '%'; knob.style.left = f * 100 + '%'; tt.textContent = fmtT(vid.currentTime) + ' / ' + fmtT(d); };
    async function ensureVid() {
      if (vid) return vid; if (loading) return loading;
      return loading = (async () => {
        if (USS.S.saver >= 3 && !p.mine) throw new Error('Clips are paused to save credits until the month resets.');
        const sp = document.createElement('div'); sp.className = 'loading'; el.appendChild(sp);
        try {
          vid = document.createElement('video'); vid.playsInline = true; vid.loop = true; vid.preload = 'auto';
          let blockedNow = false; try { blockedNow = localStorage.getItem('uss_r2blocked') > Date.now(); } catch {}
          let streamed = false;
          const streamUrl = p.stream || (p.urls?.length === 1 && /^https:/.test(p.urls[0]) && !blockedNow ? p.urls[0] : '');
          if (streamUrl) { // stream: starts playing in about a second, seeking works
            streamed = await new Promise(res => {
              const done = (v) => { clearTimeout(t); vid.onloadeddata = vid.onerror = null; res(v); };
              const t = setTimeout(() => done(vid.readyState >= 1), 3000); // got at least the start? keep streaming
              vid.onloadeddata = () => done(true); vid.onerror = () => done(false);
              vid.src = streamUrl; vid.load();
            });
            if (streamed) vid.onerror = async () => { if (vid.__fixed) return; vid.__fixed = 1; const t0 = vid.currentTime; try { const b = await getBlob(); vid.src = URL.createObjectURL(b); vid.currentTime = t0; vid.play().catch(() => {}); } catch {} };
          }
          if (!streamed) { vid.removeAttribute('src'); const b = await getBlob(); vid.src = URL.createObjectURL(b); }
          el.insertBefore(vid, $('.badges', el));
          vid.onplay = () => { big.style.opacity = 0; el.classList.add('playing'); };
          vid.onpause = () => { big.style.opacity = 1; el.classList.remove('playing'); };
          vid.ontimeupdate = drawTL; vid.onloadedmetadata = drawTL;
          return vid;
        } finally { sp.remove(); loading = null; }
      })();
    }
    async function playIt() {
      try { await ensureVid(); } catch (e) { toast(e.message, true); return; }
      if (playing && playing !== vid) playing.pause();
      vid.muted = clipMuted;
      try { await vid.play(); } catch { vid.muted = clipMuted = true; syncMuteBtns(); await vid.play().catch(() => {}); } // browsers block sound until you tap once
      playing = vid; if (!seen && !p.mine) { seen = true; USS.viewed(p.id); }
      setTimeout(() => { let n = el.nextElementSibling; while (n && !n.__clip) n = n.nextElementSibling; n?.__clip.preload(); }, 1200); // get the next clip ready
    }
    el.__clip = { auto: () => { if (!vid || vid.paused) playIt(); }, pause: () => vid?.pause(), preload: () => { if (!vid && !loading) ensureVid().catch(() => {}); } };
    $('.playbig', el).onclick = () => { if (vid && !vid.paused) vid.pause(); else playIt(); };
    $('.mute', el).onclick = e => { e.stopPropagation(); clipMuted = !clipMuted; $$('.clip video').forEach(v => v.muted = clipMuted); syncMuteBtns(); };
    // timeline: tap or drag anywhere on the bar to jump there
    const bar = $('.tl-bar', el);
    const seekTo = (ev) => { if (!vid) return; const r = bar.getBoundingClientRect(), f = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)); vid.currentTime = f * dur(); drawTL(); };
    bar.addEventListener('pointerdown', async ev => { ev.stopPropagation(); if (!vid) await playIt(); bar.setPointerCapture(ev.pointerId); bar.dataset.drag = '1'; const was = !vid.paused; vid.pause(); seekTo(ev); bar.__resume = was; });
    bar.addEventListener('pointermove', ev => { if (bar.dataset.drag) seekTo(ev); });
    const endDrag = () => { if (!bar.dataset.drag) return; delete bar.dataset.drag; if (bar.__resume) vid.play().catch(() => {}); };
    bar.addEventListener('pointerup', endDrag); bar.addEventListener('pointercancel', endDrag);
    if (!opts.noAuto) clipIO.observe(el);
    $('.like', el).onclick = async () => {
      try { const r = await api(`posts/${p.id}/like`, { method: 'POST' }); p.liked = r.liked; $('.like', el).classList.toggle('liked', r.liked); $('.like span', el).textContent = r.likes; } catch (e) { toast(e.message, true); }
    };
    $('.dl', el).onclick = async () => { try { toast('Getting clip…'); const r = await USS.saveVideo(await getBlob(), (p.title || 'clip').replace(/[^\w-]+/g, '_')); if (r === 'downloaded') toast('Saved to downloads'); } catch (e) { toast(e.message, true); } };
    $('.who', el).onclick = () => { $$('.viewer').forEach(v => v.remove()); openProfile(p.user); };
    $('.sh', el).onclick = () => shareClip(p);
    $('.cmt', el).onclick = () => openComments(p, n => $('.cmt span', el).textContent = n);
    $('.opt', el).onclick = () => {
      const staff = me.perms || [];
      sheet(`<h3>${esc(p.title || 'Clip')}</h3>
        ${p.user !== me.u ? `<button class="opt" data-a="user">${I('user')}See @${esc(p.user)}</button><button class="opt bad" data-a="report">${I('flag')}Report clip</button>` : ''}
        ${p.mine || staff.includes('posts.delete') ? `<button class="opt bad" data-a="del">${I('trash')}Delete clip</button>` : ''}`, s => {
        $$('[data-a]', s).forEach(b => b.onclick = async () => {
          const a = b.dataset.a; closeSheet();
          if (a === 'user') showUser(p.user);
          if (a === 'report') { const why = await askText('Why are you reporting this?', 'Reason'); if (why !== null) { await api(`posts/${p.id}/report`, { method: 'POST', json: { reason: why } }).catch(e => toast(e.message, true)); toast('Reported. Staff will take a look.'); } }
          if (a === 'del' && await confirmIt('Delete this clip?', p.mine ? "Deleting doesn't give you the post back on your limit." : 'This removes it for everyone.', 'Delete', true)) {
            try { await api(`posts/${p.id}`, { method: 'DELETE' }); el.remove(); toast('Deleted'); } catch (e) { toast(e.message, true); }
          }
        });
      });
    };
    return el;
  }
  const ago2 = (t) => { const m = Math.floor((Date.now() - t) / 60000); return m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'; };
  async function showUser(u) { return openProfile(u); }
  async function openProfile(u) {
    let d; try { d = await api('user/' + encodeURIComponent(u)); } catch (e) { return toast(e.message, true); }
    users[u] = d.user; if (d.lastActive) pres[u] = Math.max(pres[u] || 0, d.lastActive);
    const p = d.user, mine = u === me.u, on = mine || isOn(u);
    const st = friends.friends.includes(u) ? 'friend' : friends.outgoing.includes(u) ? 'sent' : friends.incoming.includes(u) ? 'incoming' : 'none';
    const el = document.createElement('div'); el.className = 'profile';
    el.innerHTML = `<div class="p-top"><button class="icon-btn" data-x>${I('back')}</button><b style="flex:1">@${esc(u)}</b><button class="icon-btn" data-share title="Share profile">${I('share')}</button></div>
      <div class="p-head"><div class="p-av">${av(u)}</div><h2 style="margin:4px 0 0">${nameTag(u)}</h2>
        <div class="p-status ${on ? 'on' : ''}">${mine ? 'You' : on ? '<span class="on-dot"></span> Online now' : d.lastActive ? 'Active ' + ago2(Math.abs(d.lastActive)) + ' ago' : 'Offline'}</div>
        <div class="roles">${roleChips(p)}</div>
        <div class="p-stats"><button data-fl="followers"><b>${d.followers}</b><span>Followers</span></button><button data-fl="following"><b>${d.following}</b><span>Following</span></button><div><b>${d.likes}</b><span>Likes</span></div><div><b>${d.clips}</b><span>Posts</span></div></div>
        ${mine ? '' : `<button class="btn ${d.iFollow ? 'ghost' : ''}" data-follow style="min-width:150px">${d.iFollow ? 'Following' : d.followsMe ? 'Follow back' : 'Follow'}</button>`}
        ${p.bio ? `<p style="margin:0;max-width:340px">${esc(p.bio)}</p>` : ''}
        ${mine ? `<button class="btn ghost" data-edit>${I('edit', 16)}Edit profile</button>` : `<div class="row">${st === 'friend' ? `<button class="btn" data-a="msg">${I('chat', 16)}Message</button><button class="btn ghost" data-a="call">${I('phone', 16)}</button><button class="btn ghost" data-a="vcall">${I('video', 16)}</button>` : st === 'sent' ? '<button class="btn ghost" data-a="cancel">Requested · cancel</button>' : st === 'incoming' ? '<button class="btn" data-a="accept">Accept request</button>' : `<button class="btn" data-a="request">${I('addUser', 16)}Add friend</button>`}<button class="btn ghost" data-a="more">${I('more', 16)}</button></div>`}
      </div><div class="p-grid" id="pGrid"><div class="empty" style="grid-column:1/-1">Loading clips…</div></div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    $('[data-x]', el).onclick = close;
    $('[data-follow]', el) && ($('[data-follow]', el).onclick = async () => { try { const r = await api('follow/' + encodeURIComponent(u), { method: 'POST' }); close(); openProfile(u); toast(r.following ? `Following @${u}` : `Unfollowed @${u}`); } catch (e) { toast(e.message, true); } });
    $$('[data-fl]', el).forEach(b => b.onclick = async () => { try { const r = await api(`follow/${encodeURIComponent(u)}/${b.dataset.fl}`); Object.assign(users, r.users); sheet(`<h3>${b.dataset.fl === 'followers' ? 'Followers' : 'Following'}</h3>${r.list.length ? r.list.map(x => `<button class="pick" style="width:100%" data-u="${esc(x)}">${av(x)}${nameTag(x)}</button>`).join('') : '<div class="empty">Nobody yet.</div>'}`, s => $$('[data-u]', s).forEach(x => x.onclick = () => { closeSheet(); close(); openProfile(x.dataset.u); })); } catch (e) { toast(e.message, true); } });
    $('[data-share]', el).onclick = () => shareLink(location.origin + '/?user=' + encodeURIComponent(u), `@${u} on UnStevened Social`);
    $('[data-edit]', el) && ($('[data-edit]', el).onclick = () => { close(); go('me'); });
    $$('[data-a]', el).forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === 'msg') { close(); go('chats'); return openThread('u:' + u); }
      if (a === 'call' || a === 'vcall') return USSCall.start({ to: u, video: a === 'vcall' });
      if (a === 'more') return sheet(`<h3>@${esc(u)}</h3>${st === 'friend' ? `<button class="opt bad" data-m="remove">${I('heartBroken')}Unfriend</button>` : ''}<button class="opt bad" data-m="block">${I('lock')}Block</button>`, s2 => $$('[data-m]', s2).forEach(x => x.onclick = async () => { closeSheet(); if (!await confirmIt(x.dataset.m === 'block' ? `Block @${u}?` : `Unfriend @${u}?`, 'You can undo this later.', 'Yes', true)) return; await api('friend/' + x.dataset.m, { method: 'POST', json: { user: u } }).catch(e => toast(e.message, true)); close(); loadFriends(); }));
      try { await api('friend/' + a, { method: 'POST', json: { user: u } }); toast({ request: 'Friend request sent', accept: 'You are now friends', cancel: 'Request cancelled' }[a]); await loadFriends(); close(); openProfile(u); } catch (e) { toast(e.message, true); }
    });
    try {
      const c = await api('posts?user=' + encodeURIComponent(u)); Object.assign(users, c.users);
      $('#pGrid', el).innerHTML = c.posts.length ? c.posts.map(x => x.kind === 'post' ? `<button data-c="${x.id}" style="display:grid;place-items:center;padding:8px;background:var(--bg3)">${x.img ? `<img loading="lazy" src="${x.img}" onerror="this.onerror=null;this.src='${x.imgBackup}'" style="position:absolute;inset:0">` : `<small style="font-size:12px;overflow:hidden;max-height:100%">${esc((x.poll?.q || x.text || 'Poll').slice(0, 90))}</small>`}<span>${I(x.poll ? 'list' : 'chat', 11)}${x.likes}</span></button>` : `<button data-c="${x.id}"><img loading="lazy" src="${x.thumb}"><span>${I('play', 11)}${x.views}</span></button>`).join('') : `<div class="empty" style="grid-column:1/-1">${I('clips', 40)}No clips yet</div>`;
      $$('[data-c]', el).forEach(x => x.onclick = () => openClip(x.dataset.c, c.posts.find(y => y.id === x.dataset.c)));
    } catch {}
  }
  // ------------------------------------------------ open one clip (from a link, a chat or a profile)
  const clipCache = {};
  async function getClip(id) { if (clipCache[id]) return clipCache[id]; const d = await api('posts/' + id); users[d.post.user] = d.user; return (clipCache[id] = d.post); }
  async function openClip(id, post) {
    try { post = post || await getClip(id); } catch (e) { return toast(e.message, true); }
    const v = document.createElement('div'); v.className = 'viewer';
    stopPlaying(); v.innerHTML = `<button class="icon-btn x">${I('close')}</button>`; v.appendChild(post.kind === 'post' ? postCard(post) : clipCard(post, { noAuto: true })); if (post.kind === 'post') { v.lastChild.style.cssText = 'max-width:520px;width:100%;max-height:90dvh;overflow:auto'; } document.body.appendChild(v);
    $('.x', v).onclick = () => { $$('video', v).forEach(x => x.pause()); v.remove(); };
    v.onclick = e => { if (e.target === v) $('.x', v).click(); };
    $('.playbig', v).click();
  }
  // ------------------------------------------------ sharing
  async function shareLink(url, title) {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ title, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Link copied!'); } catch { prompt('Copy this link:', url); }
  }
  async function shareClip(p) {
    await loadFriends();
    const link = location.origin + '/?clip=' + p.id;
    const targets = [...friends.groups.map(g => ['g:' + g.id, esc(g.name), `<span class="av">${I('users', 16)}</span>`]), ...friends.friends.map(u => ['u:' + u, nameTag(u), av(u)])];
    sheet(`<h3>${I('share', 20)} Share clip</h3><div class="row"><button class="btn" style="flex:1" data-copy>${I('link', 16)}Copy link</button>${navigator.share ? `<button class="btn ghost" style="flex:1" data-sys>${I('share', 16)}Share…</button>` : ''}</div>
      <b style="font-size:13px">Send in a chat</b>${targets.length ? targets.map(([k, n, pic]) => `<button class="pick" style="width:100%" data-to="${esc(k)}">${pic}<span style="flex:1;text-align:left">${n}</span><span class="btn sm">Send</span></button>`).join('') : '<small style="color:var(--mut)">Add friends to send clips to them.</small>'}`, s => {
      $('[data-copy]', s).onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied!'); } catch { prompt('Copy this link:', link); } };
      $('[data-sys]', s) && ($('[data-sys]', s).onclick = () => navigator.share({ title: p.title || 'Clip', url: link }).catch(() => {}));
      $$('[data-to]', s).forEach(b => b.onclick = async () => { try { await api('thread/' + encodeURIComponent(b.dataset.to), { method: 'POST', json: { clip: p.id } }); b.querySelector('.btn').textContent = 'Sent'; b.disabled = true; } catch (e) { toast(e.message, true); } });
    });
  }

  // ------------------------------------------------ text / picture / poll posts
  let ptPic = null;
  $$('#postSeg button').forEach(b => b.onclick = () => { $$('#postSeg button').forEach(x => x.classList.toggle('on', x === b)); const isPost = b.dataset.pk === 'post'; $('#postBox').hidden = !isPost; $('#clipBox').hidden = isPost; $('#limitCard').hidden = isPost; $('#clipRule').hidden = isPost; $('#recRow').hidden = isPost; });
  $('#ptPic').insertAdjacentHTML('afterbegin', I('image', 16)); $('#ptPollBtn').insertAdjacentHTML('afterbegin', I('list', 16)); $('#ptImgX').innerHTML = I('close', 16);
  $('#ptPicIn').onchange = async () => {
    const f = $('#ptPicIn').files[0]; $('#ptPicIn').value = ''; if (!f) return;
    const img = new Image(); img.src = URL.createObjectURL(f); await img.decode().catch(() => {});
    const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
    let q = .85, blob; do { blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); q -= .1; } while (blob.size > 2.5 * 1048576 && q > .3);
    ptPic = blob; $('#ptImg').src = URL.createObjectURL(blob); $('#ptImgWrap').hidden = false;
  };
  $('#ptImgX').onclick = () => { ptPic = null; $('#ptImgWrap').hidden = true; };
  const addOpt = (v = '') => { if ($$('#ptOpts .pt-opt').length >= 8) return; $('#ptOpts').insertAdjacentHTML('beforeend', `<div class="pt-opt"><input maxlength="60" placeholder="Option ${$$('#ptOpts .pt-opt').length + 1}" value="${esc(v)}"><button class="icon-btn" title="Remove">${I('close', 14)}</button></div>`); const row = $('#ptOpts').lastElementChild; $('button', row).onclick = () => { if ($$('#ptOpts .pt-opt').length > 2) row.remove(); }; };
  $('#ptPollBtn').onclick = () => { const p = $('#ptPoll'); p.hidden = !p.hidden; if (!p.hidden && !$$('#ptOpts .pt-opt').length) { addOpt(); addOpt(); } };
  $('#ptAddOpt').onclick = () => addOpt();
  $('#ptGo').onclick = async () => {
    const text = $('#ptText').value.trim(), usePoll = !$('#ptPoll').hidden;
    const poll = usePoll ? { q: $('#ptQ').value.trim(), opts: $$('#ptOpts input').map(i => i.value.trim()).filter(Boolean), multi: $('#ptMulti').checked } : null;
    if (usePoll && poll.opts.length < 2) return toast('Add at least 2 poll options.', true);
    if (!text && !poll && !ptPic) return toast('Write something, add a picture, or add a poll.', true);
    const btn = $('#ptGo'); btn.disabled = true; btn.textContent = 'Posting…';
    try {
      let blocked = false; try { blocked = localStorage.getItem('uss_r2blocked') > Date.now(); } catch {}
      const r = await api('posts/text', { method: 'POST', json: { text, poll, img: ptPic ? { size: ptPic.size, type: ptPic.type } : null, noR2: blocked } });
      let post = r.post;
      if (ptPic) {
        let sent = false;
        if (r.putUrl) { try { const up = await fetch(r.putUrl, { method: 'PUT', body: ptPic, headers: { 'Content-Type': ptPic.type } }); sent = up.ok; } catch {} if (!sent) try { localStorage.setItem('uss_r2blocked', String(Date.now() + 864e5)); } catch {} }
        if (!sent) await api(`posts/${r.id}/img`, { method: 'PUT', body: ptPic, headers: { 'Content-Type': 'application/octet-stream' } });
        post = (await api(`posts/${r.id}/publish`, { method: 'POST' })).post;
      }
      $('#ptText').value = ''; ptPic = null; $('#ptImgWrap').hidden = true; $('#ptPoll').hidden = true; $('#ptOpts').innerHTML = ''; $('#ptQ').value = ''; $('#ptMulti').checked = false;
      toast('Posted!'); feedMode = 'all'; $$('.feed-tabs button').forEach(x => x.classList.toggle('on', x.dataset.feed === 'all')); go('clips'); loadFeed(true);
    } catch (e) { toast(e.message, true); }
    btn.disabled = false; btn.textContent = 'Post';
  };
  function pollHtml(p, picking) {
    const P = p.poll; if (!P) return '';
    const voted = P.mine.length > 0, showRes = voted && !picking, sel = picking || new Set();
    return `<div class="poll">${P.q ? `<b>${esc(P.q)}</b>` : ''}${P.opts.map((o, i) => { const pct = P.total ? Math.round(o.n / P.total * 100) : 0; return `<button class="opt ${P.mine.includes(i) && showRes ? 'picked' : ''} ${sel.has && sel.has(i) ? 'sel' : ''}" data-i="${i}">${showRes ? `<span class="fillbar" style="width:${pct}%"></span>` : `<span class="box ${P.multi ? '' : 'round'}">${sel.has && sel.has(i) ? I('check', 12) : ''}</span>`}<span>${esc(o.t)}</span>${showRes ? `<span class="pct">${pct}%</span>` : ''}</button>`; }).join('')}
      <small>${P.total} vote${P.total === 1 ? '' : 's'}${P.multi ? ' · pick as many as you want' : ''}${showRes ? ' · <a href="#" data-change>Change vote</a>' : ''}</small>${picking && P.multi ? `<button class="btn sm" data-vote style="align-self:flex-start">Vote</button>` : ''}</div>`;
  }
  function postCard(p) {
    const el = document.createElement('div'); el.className = 'pcard'; el.dataset.id = p.id;
    const draw = (picking) => {
      el.innerHTML = `<div class="p-h">${av(p.user)}<div style="flex:1"><div>${nameTag(p.user)}</div><small>${ago(p.created)}${p.pinned ? ' · pinned' : ''}</small></div><button class="icon-btn" data-more>${I('more')}</button></div>
        ${p.text ? `<div class="p-txt">${esc(p.text)}</div>` : ''}
        ${p.img ? `<div class="p-img"><img loading="lazy" src="${p.img}" alt=""></div>` : ''}
        ${pollHtml(p, picking)}
        <div class="p-act"><button data-like class="${p.liked ? 'liked' : ''}">${I('heart', 20)}<span>${p.likes}</span></button><button data-cmt>${I('chat', 20)}<span>${p.comments || 0}</span></button><button data-share>${I('share', 20)}Share</button></div>`;
      const img = $('.p-img img', el); if (img) { let tries = 0; img.onerror = () => { if (img.src.indexOf(p.imgBackup) >= 0 || !p.imgBackup) return; if (tries++ < 2) { const u = p.img; setTimeout(() => { img.src = ''; img.src = u; }, 800 * tries); } else img.src = p.imgBackup; }; img.onclick = () => { const l = document.createElement('div'); l.className = 'lightbox'; l.innerHTML = `<img src="${img.src}">`; l.onclick = () => l.remove(); document.body.appendChild(l); }; }
      $('.p-h .av', el).onclick = () => openProfile(p.user);
      $('[data-like]', el).onclick = async () => { try { const r = await api(`posts/${p.id}/like`, { method: 'POST' }); p.liked = r.liked; p.likes = r.likes; draw(picking); } catch (e) { toast(e.message, true); } };
      $('[data-cmt]', el).onclick = () => openComments(p, n => { p.comments = n; $('[data-cmt] span', el).textContent = n; });
      $('[data-share]', el).onclick = () => shareClip(p);
      $('[data-more]', el).onclick = () => sheet(`<h3>Post</h3>${p.user !== me.u ? `<button class="opt bad" data-a="report">${I('flag')}Report post</button>` : ''}${p.mine || (me.perms || []).includes('posts.delete') ? `<button class="opt bad" data-a="del">${I('trash')}Delete post</button>` : ''}`, s => $$('[data-a]', s).forEach(b => b.onclick = async () => {
        closeSheet();
        if (b.dataset.a === 'report') { const why = await askText('Why are you reporting this?', 'Reason'); if (why !== null) { await api(`posts/${p.id}/report`, { method: 'POST', json: { reason: why } }).catch(() => {}); toast('Reported.'); } }
        if (b.dataset.a === 'del' && await confirmIt('Delete this post?', 'This removes it for everyone.', 'Delete', true)) { try { await api(`posts/${p.id}`, { method: 'DELETE' }); el.remove(); } catch (e) { toast(e.message, true); } }
      }));
      if (p.poll) {
        const sel = picking || new Set(p.poll.mine);
        const send = async (choices) => { try { const r = await api(`posts/${p.id}/vote`, { method: 'POST', json: { choices } }); p.poll = r.poll; draw(null); } catch (e) { toast(e.message, true); } };
        $$('.poll .opt', el).forEach(b => b.onclick = () => {
          const i = +b.dataset.i; if (p.poll.mine.length && !picking) return; // results showing
          if (!p.poll.multi) return send([i]);
          const s2 = new Set(sel); s2.has(i) ? s2.delete(i) : s2.add(i); draw(s2);
        });
        $('[data-vote]', el) && ($('[data-vote]', el).onclick = () => send([...sel]));
        $('[data-change]', el) && ($('[data-change]', el).onclick = e => { e.preventDefault(); draw(new Set(p.poll.mine)); });
        if (!p.poll.mine.length && !picking && p.poll.multi) { $$('.poll .opt', el).forEach(b => b.onclick = () => { draw(new Set([+b.dataset.i])); }); }
      }
    };
    draw(null);
    return el;
  }
  async function openComments(p, onCount) {
    sheet(`<h3>${I('chat', 20)} Comments</h3><div id="cmList"><div class="empty">Loading…</div></div><form class="row" id="cmForm"><input id="cmIn" maxlength="500" placeholder="Add a comment" autocomplete="off" enterkeyhint="send"><button class="btn">${I('send', 16)}</button></form>`, async s => {
      const draw = (list, us) => { Object.assign(users, us || {}); $('#cmList', s).innerHTML = list.length ? list.map(c => `<div class="cm">${av(c.u)}<div class="cm-b"><div>${nameTag(c.u)} <small>${ago(c.t)}</small></div><div class="cm-t">${esc(c.text)}</div></div>${c.u === me.u || p.user === me.u || (me.perms || []).includes('posts.delete') ? `<button class="icon-btn" data-del="${c.id}" style="width:30px;height:30px">${I('trash', 14)}</button>` : ''}</div>`).join('') : '<div class="empty" style="padding:24px">No comments yet. Say something!</div>'; $$('[data-del]', s).forEach(b => b.onclick = async () => { try { const r = await api(`posts/${p.id}/comments/${b.dataset.del}`, { method: 'DELETE' }); onCount && onCount(r.count); load(); } catch (e) { toast(e.message, true); } }); };
      const load = async () => { try { const d = await api(`posts/${p.id}/comments`); draw(d.comments, d.users); } catch (e) { $('#cmList', s).innerHTML = `<div class="empty">${esc(e.message)}</div>`; } };
      $('#cmForm', s).onsubmit = async e => { e.preventDefault(); const t = $('#cmIn', s).value.trim(); if (!t) return; $('#cmIn', s).value = ''; try { const r = await api(`posts/${p.id}/comments`, { method: 'POST', json: { text: t } }); onCount && onCount(r.count); load(); } catch (er) { toast(er.message, true); $('#cmIn', s).value = t; } };
      load();
    });
  }

  // ------------------------------------------------ posting + limit countdown
  let limit = null, cdT = 0, pend = null;
  async function refreshLimit() { try { limit = await api('limit'); } catch {} drawLimit(); }
  const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  function drawLimit() {
    clearTimeout(cdT);
    if (!limit) return;
    const win = limit.windowMin; $('#ruleMax').textContent = limit.max; $('#ruleWin').textContent = (win >= 60 ? Math.floor(win / 60) + ' h ' : '') + (win % 60 ? win % 60 + ' min' : '');
    const bar = $('#limitBar'), C = 327;
    const locked = !limit.bypass && limit.left <= 0;
    if (limit.bypass) { $('#limitNum').innerHTML = I('crown', 34); $('#limitTitle').textContent = 'No limit for you'; $('#limitSub').textContent = 'Owner'; bar.style.strokeDashoffset = 0; }
    else if (locked) {
      const left = limit.nextAt - Date.now();
      if (left <= 0) return refreshLimit();
      const total = win * 60000;
      bar.style.strokeDashoffset = C * (left / total);
      $('#limitNum').innerHTML = I('lock', 30);
      $('#limitTitle').innerHTML = `<span class="countdown">${fmt(left)}</span>`;
      $('#limitSub').textContent = `until you can post again (you used all ${limit.max})`;
      cdT = setTimeout(drawLimit, 1000);
    } else {
      bar.style.strokeDashoffset = C * (1 - limit.left / limit.max);
      $('#limitNum').textContent = limit.left;
      $('#limitTitle').textContent = `${limit.left} of ${limit.max} posts left`;
      $('#limitSub').textContent = limit.used ? `Next one frees up in ${fmt(limit.nextAt ? limit.nextAt - Date.now() : 0)}` : `Resets ${win} min after each post`;
      if (limit.used) { const next = (limit.nextAt || 0); if (next) cdT = setTimeout(drawLimit, 1000); }
    }
    $('#drop').classList.toggle('locked', locked || USS.S.saver >= 3);
    $('#pendPost').disabled = locked;
  }
  const fileIn = $('#fileIn');
  fileIn.onchange = () => { if (fileIn.files[0]) setPending(fileIn.files[0]); fileIn.value = ''; };
  const drop = $('#drop');
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('video/')) setPending(f); };
  function setPending(blob, title = '', game = '', draftId = null) {
    if (pend) URL.revokeObjectURL(pend.url);
    pend = { blob, url: URL.createObjectURL(blob), draftId };
    $('#pendVid').src = pend.url; $('#pendTitle').value = title; $('#pendGame').value = game;
    $('#pending').hidden = false; $('#drop').hidden = true; $('#prog').hidden = true;
  }
  function clearPending() { if (pend) URL.revokeObjectURL(pend.url); pend = null; $('#pending').hidden = true; $('#drop').hidden = false; $('#pendVid').removeAttribute('src'); }
  $('#pendDrop').onclick = clearPending;
  $('#pendEdit').onclick = async () => {
    if (!pend || !window.US2ClipEditor) return;
    const r = await US2ClipEditor.open(pend.blob, { title: $('#pendTitle').value });
    if (r?.blob) setPending(r.blob, r.title ?? $('#pendTitle').value, $('#pendGame').value, pend.draftId);
  };
  $('#pendPost').onclick = async () => {
    if (!pend) return;
    const max = (me.perms || []).includes('posts.long') ? USS.S.hello.cfg.maxVideoSecLong : USS.S.hello.cfg.maxVideoSec;
    const info = await USS.videoInfo(pend.blob); URL.revokeObjectURL(info.url);
    const cap = USS.S.saver >= 2 && !me.owner ? Math.min(30, max) : max;
    if (info.duration > cap + 1) { toast(`Clips can be ${cap} seconds max. Tap Edit to trim it.`, true); return; }
    $('#pendPost').disabled = true; $('#prog').hidden = false;
    const bar = $('#prog div'), txt = $('#prog span');
    try {
      const r = await USS.uploadClip(pend.blob, { title: $('#pendTitle').value, game: $('#pendGame').value }, (p, label) => { bar.style.width = Math.round(p * 100) + '%'; txt.textContent = label + ' ' + Math.round(p * 100) + '%'; });
      if (pend.draftId) await Drafts.del(pend.draftId).catch(() => {});
      limit = r.limit; clearPending(); drawLimit(); toast('Posted!'); renderDrafts();
      feedMode = 'all'; $$('.feed-tabs button').forEach(x => x.classList.toggle('on', x.dataset.feed === 'all')); go('clips'); loadFeed(true);
    } catch (e) {
      toast(e.message, true); if (e.data?.limit) { limit = { ...limit, ...e.data.limit }; drawLimit(); }
      $('#prog').hidden = true;
    }
    $('#pendPost').disabled = false; drawLimit();
  };
  // ------------------------------------------------ record right here (screen or camera)
  if (!navigator.mediaDevices?.getDisplayMedia || matchMedia('(pointer: coarse)').matches) $('#recScreen').hidden = true;
  const recMime = () => ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  async function recordClip(kind) {
    if (!window.MediaRecorder) return toast("This browser can't record video.", true);
    const max = ((me.perms || []).includes('posts.long') ? USS.S.hello.cfg.maxVideoSecLong : USS.S.hello.cfg.maxVideoSec) || 60;
    let stream;
    try {
      if (kind === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, height: { ideal: 720 } }, audio: true });
        try { const mic = await navigator.mediaDevices.getUserMedia({ audio: true }); if (!stream.getAudioTracks().length) mic.getAudioTracks().forEach(t => stream.addTrack(t)); else { const ac = new AudioContext(), d = ac.createMediaStreamDestination(); ac.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(d); ac.createMediaStreamSource(mic).connect(d); stream = new MediaStream([...stream.getVideoTracks(), ...d.stream.getAudioTracks()]); stream._mic = mic; } } catch {}
      } else stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
    } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast("Couldn't start recording: " + e.message, true); else if (kind !== 'screen') toast('Camera access was blocked. Allow it in your browser settings.', true); return; }
    const ui = document.createElement('div'); ui.className = 'recorder';
    ui.innerHTML = `<video autoplay playsinline muted></video><div class="r-bar"><button class="btn ghost" data-x>Cancel</button><button class="${kind === 'screen' ? 'r-stop' : 'r-go'}" data-b><i></i></button><div class="r-time">${kind === 'screen' ? '<span class="r-dot"></span>0:00' : 'Tap to record'}</div>${kind === 'cam' ? `<button class="icon-btn" data-flip>${I('flip')}</button>` : ''}</div>`;
    document.body.appendChild(ui);
    const v = $('video', ui); v.srcObject = stream; if (kind === 'cam') v.style.transform = 'scaleX(-1)';
    let rec = null, chunks = [], t0 = 0, tick = 0, facing = 'user';
    const stopAll = () => { clearInterval(tick); stream.getTracks().forEach(t => t.stop()); stream._mic?.getTracks().forEach(t => t.stop()); ui.remove(); };
    const start = () => {
      const mime = recMime(); rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_000_000 });
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = () => { const blob = new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] }); stopAll(); if (blob.size > 1000) { setPending(blob); toast('Recorded! Edit it, save a draft, or post it.'); } };
      rec.start(1000); t0 = Date.now();
      const b = $('[data-b]', ui); b.className = 'r-stop'; $('[data-flip]', ui)?.remove();
      tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $('.r-time', ui).innerHTML = `<span class="r-dot"></span>${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} / ${Math.floor(max / 60)}:${String(max % 60).padStart(2, '0')}`; if (s >= max) rec.stop(); }, 250);
    };
    $('[data-x]', ui).onclick = () => { if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); } stopAll(); };
    $('[data-b]', ui).onclick = () => { if (!rec) start(); else if (rec.state !== 'inactive') rec.stop(); };
    $('[data-flip]', ui) && ($('[data-flip]', ui).onclick = async () => {
      facing = facing === 'user' ? 'environment' : 'user';
      try { const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: true }); stream.getTracks().forEach(t => t.stop()); stream = ns; v.srcObject = ns; v.style.transform = facing === 'user' ? 'scaleX(-1)' : ''; } catch {}
    });
    stream.getVideoTracks()[0].onended = () => { if (rec && rec.state !== 'inactive') rec.stop(); else if (!rec) stopAll(); };
    if (kind === 'screen') start();
  }
  $('#recScreen').onclick = () => recordClip('screen');
  $('#recCam').onclick = () => recordClip('cam');

  // ------------------------------------------------ drafts (kept on this device, never uploaded until you post)
  const Drafts = (() => {
    const db = () => new Promise((res, rej) => { const r = indexedDB.open('uss-drafts', 1); r.onupgradeneeded = () => r.result.createObjectStore('d', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('d', mode); const q = fn(t.objectStore('d')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
    return { all: () => tx('readonly', st => st.getAll()), put: (x) => tx('readwrite', st => st.put(x)), del: (id) => tx('readwrite', st => st.delete(id)) };
  })();
  async function renderDrafts() {
    let list = []; try { list = (await Drafts.all()).sort((a, b) => b.t - a.t); } catch {}
    $('#drafts').hidden = !list.length;
    $('#draftList').innerHTML = list.map(d => `<div class="draft" data-d="${d.id}">${d.thumb ? `<img src="${d.thumb}" alt="">` : ''}<span>${esc(d.title || 'Untitled')}<br><small style="opacity:.7">${ago(d.t)} ago</small></span><button data-del="${d.id}">${I('trash', 15)}</button></div>`).join('');
    $$('#draftList [data-d]').forEach(el => el.onclick = e => {
      if (e.target.closest('[data-del]')) return;
      const d = list.find(x => x.id === el.dataset.d); setPending(d.blob, d.title, d.game, d.id); $('#scr-post').scrollTop = 0;
    });
    $$('#draftList [data-del]').forEach(b => b.onclick = async () => { if (await confirmIt('Delete this draft?', "It's only on this device, so it'll be gone for good.", 'Delete', true)) { await Drafts.del(b.dataset.del); if (pend?.draftId === b.dataset.del) pend.draftId = null; renderDrafts(); } });
  }
  $('#pendDraft').onclick = async () => {
    if (!pend) return;
    const info = await USS.videoInfo(pend.blob); URL.revokeObjectURL(info.url);
    const id = pend.draftId || 'd' + Date.now().toString(36);
    try { await Drafts.put({ id, blob: pend.blob, title: $('#pendTitle').value, game: $('#pendGame').value, thumb: info.thumb, t: Date.now() }); pend.draftId = id; toast('Saved to drafts'); clearPending(); renderDrafts(); }
    catch (e) { toast('Could not save the draft (storage full?)', true); }
  };
  renderDrafts();

  // clips sent over from the UnStevened games site
  if (window.opener && location.hash === '#handoff') {
    addEventListener('message', e => {
      if (e.source !== window.opener || e.data?.type !== 'uss-clip' || !(e.data.blob instanceof Blob)) return;
      history.replaceState(null, '', location.pathname);
      const wait = () => me ? (go('post'), setPending(e.data.blob, e.data.title || '', e.data.game || ''), toast('Clip ready — hit Post')) : setTimeout(wait, 400);
      wait();
    });
    window.opener.postMessage({ type: 'uss-ready' }, '*');
  }

  // ------------------------------------------------ friends & chats
  let friends = { friends: [], incoming: [], outgoing: [], blocked: [], groups: [] }, inbox = {}, openKey = null, lastMsgT = 0, threadData = null;
  async function loadFriends() {
    try { const d = await api('friends'); friends = d; Object.assign(users, d.users); renderThreads(); } catch {}
  }
  function threadName(k) { if (k.startsWith('g:')) { const g = friends.groups.find(x => 'g:' + x.id === k); return g ? g.name : 'Group'; } return users[k.slice(2)]?.display || k.slice(2); }
  function renderThreads() { try { return renderThreads_(); } catch (e) { showErr('#threads', e); } }
  function renderThreads_() {
    const keys = new Set([...friends.friends.map(u => 'u:' + u), ...friends.groups.map(g => 'g:' + g.id), ...Object.keys(inbox).filter(k => k.startsWith('g:') && friends.groups.some(g => 'g:' + g.id === k))]);
    const list = [...keys].sort((a, b) => (inbox[b]?.last || 0) - (inbox[a]?.last || 0));
    const rb = $('#reqBar');
    rb.hidden = !friends.incoming.length;
    rb.innerHTML = `<b style="font-size:13px">Friend requests</b>` + friends.incoming.map(u => `<div class="thread" style="padding:6px 0">${av(u)}<div class="t-mid">${nameTag(u)}</div><button class="btn sm" data-acc="${esc(u)}">Accept</button><button class="btn ghost sm" data-dec="${esc(u)}">${I('close', 14)}</button></div>`).join('');
    $$('[data-acc]', rb).forEach(b => b.onclick = async () => { await api('friend/accept', { method: 'POST', json: { user: b.dataset.acc } }).catch(e => toast(e.message, true)); loadFriends(); });
    $$('[data-dec]', rb).forEach(b => b.onclick = async () => { await api('friend/decline', { method: 'POST', json: { user: b.dataset.dec } }).catch(() => {}); loadFriends(); });
    $('#threads').innerHTML = list.length ? list.map(k => {
      const ib = inbox[k] || {}, g = k.startsWith('g:') ? friends.groups.find(x => 'g:' + x.id === k) : null;
      const pic = g ? `<span class="gav">${av(g.members.find(x => x !== me.u))}${av(g.members.filter(x => x !== me.u)[1] || me.u)}</span>` : av(k.slice(2));
      return `<button class="thread ${ib.unread ? 'unread' : ''}" data-k="${esc(k)}">${pic}<div class="t-mid"><div class="t-name">${g ? esc(g.name) + ` <small style="color:var(--mut);font-weight:400">${g.members.length}/5</small>` : nameTag(k.slice(2))}</div><div class="t-prev">${esc(ib.preview || (g ? 'Group chat' : 'Say hi!'))}</div></div>${ib.last ? `<small style="color:var(--mut)">${ago(ib.last)}</small>` : ''}${ib.unread ? `<span class="badge">${ib.unread}</span>` : ''}</button>`;
    }).join('') : `<div class="empty">${I('users', 48)}No friends yet.<br>Add people on your Wi-Fi to chat and call.<br><br><button class="btn" id="emptyAdd">Find people</button></div>`;
    $$('#threads [data-k]').forEach(b => b.onclick = () => openThread(b.dataset.k));
    $('#emptyAdd') && ($('#emptyAdd').onclick = addFriends);
    const unread = Object.values(inbox).reduce((n, x) => n + (x.unread || 0), 0) + friends.incoming.length;
    $('#chatDot').hidden = !unread;
  }
  $('#addFriendBtn').onclick = addFriends;
  function addFriends() {
    sheet(`<h3>Find people on your Wi-Fi</h3><input id="pq" placeholder="Search usernames" autocapitalize="none"><div id="pl"><div class="empty">Loading…</div></div>`, async s => {
      let t; const load = async () => {
        try {
          const d = await api('people?q=' + encodeURIComponent($('#pq', s).value));
          $('#pl', s).innerHTML = d.people.length ? d.people.map(p => `<div class="pick">${av(p.u)}<div style="flex:1">@${esc(p.u)}</div>${p.status === 'friend' ? '<small>Friends</small>' : p.status === 'sent' ? '<small>Sent</small>' : `<button class="btn sm" data-u="${esc(p.u)}" data-a="${p.status === 'incoming' ? 'accept' : 'request'}">${p.status === 'incoming' ? 'Accept' : 'Add'}</button>`}</div>`).join('') : '<div class="empty">Nobody found.</div>';
          $$('[data-u]', s).forEach(b => b.onclick = async () => { try { await api('friend/' + b.dataset.a, { method: 'POST', json: { user: b.dataset.u } }); b.outerHTML = '<small>' + (b.dataset.a === 'accept' ? 'Friends' : 'Sent') + '</small>'; loadFriends(); } catch (e) { toast(e.message, true); } });
        } catch (e) { $('#pl', s).innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
      };
      $('#pq', s).oninput = () => { clearTimeout(t); t = setTimeout(load, 450); }; load();
    });
  }
  $('#newGroupBtn').onclick = () => {
    const GMAX = USS.S.hello?.cfg?.groupMax || 5;
    if (!friends.friends.length) return toast('Add some friends first.', true);
    sheet(`<h3>New group chat</h3><input id="gn" maxlength="40" placeholder="Group name"><small style="color:var(--mut)">Pick up to ${GMAX - 1} friends (${GMAX} people max, including you)</small>
      <div>${friends.friends.map(u => `<label class="pick"><input type="checkbox" value="${esc(u)}">${av(u)}${nameTag(u)}</label>`).join('')}</div><button class="btn" id="gGo">Create</button>`, s => {
      const boxes = $$('input[type=checkbox]', s);
      boxes.forEach(b => b.onchange = () => { const n = boxes.filter(x => x.checked).length; boxes.forEach(x => x.disabled = !x.checked && n >= GMAX - 1); });
      $('#gGo', s).onclick = async () => {
        const members = boxes.filter(x => x.checked).map(x => x.value);
        try { const r = await api('group/new', { method: 'POST', json: { name: $('#gn', s).value || 'Group chat', members } }); closeSheet(); await loadFriends(); openThread('g:' + r.group.id); } catch (e) { toast(e.message, true); }
      };
    });
  };

  // chat view
  async function openThread(k) {
    openKey = k; lastMsgT = 0; threadData = null;
    $('#chat').hidden = false; $('#msgs').innerHTML = '<div class="sys">Loading…</div>';
    const g = k.startsWith('g:');
    $('#chatWho').innerHTML = (g ? `<span class="gav" style="width:36px;height:36px">${''}</span>` : av(k.slice(2))) + `<div>${g ? esc(threadName(k)) : nameTag(k.slice(2))}<small>${g ? '' : '@' + esc(k.slice(2))}</small></div>`;
    if (g) $('#chatWho .gav').outerHTML = `<span class="av">${I('users', 18)}</span>`;
    await loadThread(true);
    USS.fast(120000);
    $('#msgIn').focus({ preventScroll: true });
  }
  async function loadThread(first) {
    const k = openKey; if (!k) return;
    try {
      const d = await api(`thread/${encodeURIComponent(k)}?after=${first ? 0 : lastMsgT}`);
      if (k !== openKey) return;
      Object.assign(users, d.users); if (first) { threadData = d; $('#msgs').innerHTML = ''; } else { threadData.msgs.push(...d.msgs); threadData.read = d.read; }
      if (d.group) { const gi = friends.groups.findIndex(x => x.id === d.group.id); if (gi >= 0) friends.groups[gi] = d.group; $('#chatWho small').textContent = d.group.members.length + '/5 · ' + d.group.members.map(u => '@' + u).join(' '); }
      d.msgs.forEach(addMsg); if (d.msgs.length) lastMsgT = d.msgs[d.msgs.length - 1].t;
      if (first && !d.msgs.length) $('#msgs').innerHTML = '<div class="sys">No messages yet — say hi!</div>';
      drawSeen();
      if (d.msgs.some(m => m.from !== me.u) || first) { api(`thread/${encodeURIComponent(k)}/read`, { method: 'POST' }).catch(() => {}); if (inbox[k]) { inbox[k].unread = 0; renderThreads(); } }
    } catch (e) { $('#msgs').innerHTML = `<div class="sys">${esc(e.message)}</div>`; }
  }
  let lastFrom = '';
  function addMsg(m) {
    const box = $('#msgs'); $('.sys', box)?.remove(); $('.seen', box)?.remove();
    const mine = m.from === me.u;
    if (openKey.startsWith('g:') && !mine && lastFrom !== m.from) box.insertAdjacentHTML('beforeend', `<div class="m-from">${nameTag(m.from)}</div>`);
    lastFrom = m.from;
    const el = document.createElement('div'); el.className = 'm' + (mine ? ' me' : '');
    el.innerHTML = (m.img ? `<img src="${m.img}" alt="">` : '') + (m.gif ? `<img src="${m.gif}" alt="GIF" loading="lazy">` : '') + (m.clip ? `<div class="m-clip" data-clip="${m.clip}"><img alt=""><div><b>Clip</b><br><small>Tap to watch</small></div></div>` : '') + esc(m.text) + `<div class="m-time">${new Date(m.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>`;
    const mc = $('.m-clip', el);
    if (mc) { mc.onclick = () => openClip(m.clip); getClip(m.clip).then(p => { $('img', mc).src = p.thumb; mc.querySelector('b').textContent = p.title || '@' + p.user + "'s clip"; mc.querySelector('small').textContent = '@' + p.user + ' · tap to watch'; }).catch(() => { mc.querySelector('small').textContent = 'Clip is gone'; }); }
    const img = $('img:not(.m-clip img)', el); if (img) img.onclick = () => { const l = document.createElement('div'); l.className = 'lightbox'; l.innerHTML = `<img src="${m.img || m.gif}">`; l.onclick = () => l.remove(); document.body.appendChild(l); };
    if (!mine) el.oncontextmenu = el.ondblclick = e => { e.preventDefault(); reportMsg(m); };
    box.appendChild(el); box.scrollTop = box.scrollHeight;
  }
  function drawSeen() {
    const d = threadData; if (!d?.msgs.length) return; const last = d.msgs[d.msgs.length - 1];
    if (last.from !== me.u) return;
    const seenBy = Object.entries(d.read || {}).filter(([u, t]) => u !== me.u && t >= last.t).map(([u]) => u);
    $('.seen')?.remove(); if (seenBy.length) $('#msgs').insertAdjacentHTML('beforeend', `<div class="seen">Seen${openKey.startsWith('g:') ? ' by ' + seenBy.map(esc).join(', ') : ''}</div>`);
  }
  async function reportMsg(m) {
    const why = await askText('Report this message?', 'Reason (optional)'); if (why === null) return;
    try { await api(`thread/${encodeURIComponent(openKey)}/report`, { method: 'POST', json: { id: m.id, reason: why } }); toast('Reported. Staff will take a look.'); } catch (e) { toast(e.message, true); }
  }
  $('#chatBack').onclick = () => { $('#chat').hidden = true; openKey = null; renderThreads(); };
  $('#compose').onsubmit = async e => {
    e.preventDefault(); const t = $('#msgIn').value; if (!t.trim()) return;
    $('#msgIn').value = ''; await send({ text: t });
  };
  async function send(body) {
    try { const r = await api(`thread/${encodeURIComponent(openKey)}`, { method: 'POST', json: body }); if (r.msg.t > lastMsgT) { if (!threadData.msgs.length) $('#msgs').innerHTML = ''; threadData.msgs.push(r.msg); addMsg(r.msg); lastMsgT = r.msg.t; } USS.fast(120000); }
    catch (er) { toast(er.message, true); if (body.text) $('#msgIn').value = body.text; }
  }
  $('#imgIn').onchange = async () => {
    const f = $('#imgIn').files[0]; $('#imgIn').value = ''; if (!f) return;
    if (f.type === 'image/gif') { // real moving GIFs (capped so they stay cheap)
      const cfg = USS.S.hello?.cfg || {}, max = (cfg.gifMaxKB || 2048) * 1024;
      if (cfg.gifs === false) return toast('GIFs are turned off right now.', true);
      if (f.size > max) return toast(`That GIF is ${(f.size / 1048576).toFixed(1)} MB. Max is ${(max / 1048576).toFixed(1)} MB.`, true);
      try { toast('Sending GIF…'); const r = await api('gif', { method: 'POST', body: f, headers: { 'Content-Type': 'image/gif' } }); return send({ gif: r.url, gifSize: r.size, text: '' }); }
      catch (e) { return toast(e.message, true); }
    }
    const img = new Image(); img.src = URL.createObjectURL(f); await img.decode().catch(() => {});
    const k = Math.min(1, 900 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
    let q = .72, data = c.toDataURL('image/jpeg', q); while (data.length > 280000 && q > .3) data = c.toDataURL('image/jpeg', q -= .12);
    send({ img: data, text: '' });
  };
  $('#chatCall').onclick = () => startCall(false);
  $('#chatVideo').onclick = () => startCall(true);
  function startCall(video) { if (!openKey) return; USSCall.start(openKey.startsWith('g:') ? { gid: openKey.slice(2), video } : { to: openKey.slice(2), video }); }
  $('#chatMore').onclick = () => {
    const k = openKey; const g = k.startsWith('g:') ? friends.groups.find(x => 'g:' + x.id === k) : null;
    if (!g) {
      const u = k.slice(2);
      return sheet(`<h3>${nameTag(u)}</h3><button class="opt" data-a="see">${I('user')}See profile</button><button class="opt bad" data-a="remove">${I('heartBroken')}Unfriend</button><button class="opt bad" data-a="block">${I('lock')}Block</button>`, s => {
        $$('[data-a]', s).forEach(b => b.onclick = async () => {
          closeSheet(); if (b.dataset.a === 'see') return showUser(u);
          if (!await confirmIt(b.dataset.a === 'block' ? `Block @${u}?` : `Unfriend @${u}?`, 'You can add them back later.', 'Yes', true)) return;
          await api('friend/' + b.dataset.a, { method: 'POST', json: { user: u } }).catch(e => toast(e.message, true)); $('#chatBack').click(); loadFriends();
        });
      });
    }
    const GMAX = USS.S.hello?.cfg?.groupMax || 5;
    const canAdd = friends.friends.filter(u => !g.members.includes(u));
    sheet(`<h3>${esc(g.name)} <small style="color:var(--mut)">${g.members.length}/${GMAX}</small></h3>
      ${g.members.map(u => `<div class="pick">${av(u)}<div style="flex:1">${nameTag(u)}${u === g.owner ? ' <small style="color:var(--mut)">· made the group</small>' : ''}</div>${g.owner === me.u && u !== me.u ? `<button class="btn ghost sm" data-kick="${esc(u)}">Remove</button>` : ''}</div>`).join('')}
      <button class="opt" data-a="rename">${I('edit')}Rename group</button>
      ${g.members.length < GMAX && canAdd.length ? `<button class="opt" data-a="add">${I('addUser')}Add a friend</button>` : `<small style="color:var(--mut);padding:0 12px">${g.members.length >= GMAX ? `Group is full (${GMAX} max)` : 'All your friends are in here'}</small>`}
      <button class="opt bad" data-a="leave">${I('logout')}Leave group</button>`, s => {
      $$('[data-kick]', s).forEach(b => b.onclick = async () => { closeSheet(); await api(`group/${g.id}/kick`, { method: 'POST', json: { user: b.dataset.kick } }).catch(e => toast(e.message, true)); await loadFriends(); loadThread(true); });
      $$('[data-a]', s).forEach(b => b.onclick = async () => {
        const a = b.dataset.a; closeSheet();
        if (a === 'rename') { const n = await askText('Rename group', 'Name', g.name); if (n) { await api(`group/${g.id}/rename`, { method: 'POST', json: { name: n } }).catch(e => toast(e.message, true)); await loadFriends(); openThread(k); } }
        if (a === 'add') sheet(`<h3>Add to ${esc(g.name)}</h3>${canAdd.map(u => `<button class="pick" style="width:100%" data-u="${esc(u)}">${av(u)}${nameTag(u)}</button>`).join('')}`, s2 => $$('[data-u]', s2).forEach(x => x.onclick = async () => { closeSheet(); try { await api(`group/${g.id}/add`, { method: 'POST', json: { user: x.dataset.u } }); await loadFriends(); loadThread(true); } catch (e) { toast(e.message, true); } }));
        if (a === 'leave' && await confirmIt('Leave this group?', "You'll stop getting its messages.", 'Leave', true)) { await api(`group/${g.id}/leave`, { method: 'POST' }).catch(() => {}); $('#chatBack').click(); loadFriends(); }
      });
    });
  };

  // ------------------------------------------------ sync results (one cheap request for everything)
  USS.onSync(d => {
    inbox = d.inbox || {};
    if (d.requests !== friends.incoming.length || Object.keys(inbox).some(k => k.startsWith('g:') && !friends.groups.some(g => 'g:' + g.id === k))) loadFriends(); else renderThreads();
    if (openKey && inbox[openKey]?.unread) loadThread(false);
    else if (openKey && threadData) { const last = threadData.msgs[threadData.msgs.length - 1]; if (last?.from === me.u) loadThread(false); }
    if (d.ring) USSCall.ring(d.ring);
    if (d.status?.warns?.length) showWarns(d.status.warns);
  });

  // ------------------------------------------------ me
  function renderMe() { try { return renderMe_(); } catch (e) { showErr('#meWrap', e); } }
  function renderMe_() {
    if (!me) return; users[me.u] = me;
    $('#meWrap').innerHTML = `
      <div class="card"><div class="prof"><label style="cursor:pointer;position:relative">${av(me.u, 'lg')}<input type="file" accept="image/*" id="avIn" hidden></label><div><h3>${nameTag(me.u)}</h3><small style="color:var(--mut)">@${esc(me.u)} · Wi-Fi ${esc(USS.S.network)}</small><div class="roles" style="margin-top:6px">${roleChips(me)}</div></div></div>
        <input id="dn" maxlength="30" placeholder="Display name" value="${esc(me.display)}"><textarea id="bio" rows="2" maxlength="160" placeholder="Bio">${esc(me.bio)}</textarea>
        <div class="row"><button class="btn" id="saveProf">Save profile</button>${me.avatar ? '<button class="btn ghost" id="rmAv">Remove photo</button>' : ''}</div></div>
      <button class="btn ghost" id="myProf">${I('user', 16)}View my profile</button>
      ${(me.perms || []).includes('roles.hide') ? `<div class="card"><label class="sw-row"><span>${I('eyeOff', 16)} Hide my role badge${me.owner ? ' (and crown)' : ''}</span><input type="checkbox" id="hideRoles" ${me.hideRoles ? 'checked' : ''}></label><small style="color:var(--mut)">Your powers still work — people just won't see the badge. Staff still show an ADMIN tag when they join a call.</small></div>` : ''}
      <div class="card"><h3>${I('bell', 18)} Notifications</h3>
        ${me.pushCount || localStorage.getItem('uss_push_on') ? `<div class="row"><span style="flex:1;color:var(--ok)">On for this device</span><button class="btn ghost sm" id="nTest">Test</button><button class="btn ghost sm" id="nOff">Turn off</button></div>` : `<button class="btn" id="nOn">${I('bell', 16)}Turn on notifications</button>${window.__ussNotifs?.isIOS && !window.__ussNotifs?.standalone ? '<small style="color:var(--mut)">iPhone/iPad: first tap Share → <b>Add to Home Screen</b>, then open the site from your home screen.</small>' : ''}`}
        ${[['msgs', 'Messages'], ['groups', 'Group chats'], ['calls', 'Calls'], ['requests', 'Friend requests'], ['likes', 'Likes on your clips'], ['comments', 'Comments on your posts'], ['follows', 'New followers'], ['online', 'Friends coming online / going offline'], ['sound', 'Sounds in the app']].map(([k, n]) => `<label class="sw-row"><span>${n}</span><input type="checkbox" data-pref="${k}" ${(me.prefs || {})[k] !== false ? 'checked' : ''}></label>`).join('')}
      </div>
      <div class="card"><h3>Your clips</h3><div class="stat-row"><div class="stat"><b id="stLeft">${limit ? (limit.bypass ? '∞' : limit.left) : '–'}</b><span>posts left</span></div><div class="stat"><b>${friends.friends.length}</b><span>friends</span></div><div class="stat"><b>${friends.groups.length}</b><span>groups</span></div></div></div>
      ${(me.perms || []).includes('panel') ? `<a class="btn" href="admin.html">${I('shield', 18)}${me.owner ? 'Owner panel' : 'Staff panel'}</a>` : ''}
      <div class="card"><h3>Password</h3>${me.owner ? '<small style="color:var(--mut)">The owner password stays the same.</small>' : '<input id="op" type="password" placeholder="Current password"><input id="np2" type="password" placeholder="New password"><button class="btn ghost" id="chPw">Change password</button>'}</div>
      <div class="row"><a class="btn ghost" style="flex:1" href="${GAMES}">${I('play', 16)}UnStevened games</a><button class="btn ghost" style="flex:1" id="logout">${I('logout', 16)}Sign out</button></div>
      <p class="fine" style="text-align:center">${USI.logo(22)}<br>UnStevened Social</p>`;
    $('#myProf').onclick = () => openProfile(me.u);
    $('#hideRoles') && ($('#hideRoles').onchange = async e => { try { const r = await api('profile', { method: 'POST', json: { hideRoles: e.target.checked } }); Object.assign(me, r.me); me.hideRoles = e.target.checked; users[me.u] = me; toast(e.target.checked ? 'Role badge hidden' : 'Role badge showing'); } catch (er) { toast(er.message, true); } });
    $('#nOn') && ($('#nOn').onclick = () => window.__ussNotifs.enableNotifs());
    $('#nOff') && ($('#nOff').onclick = () => window.__ussNotifs.disableNotifs());
    $('#nTest') && ($('#nTest').onclick = async () => { const r = await api('push/test', { method: 'POST' }).catch(e => ({ error: e.message })); toast(r.sent ? 'Sent! Check your notifications.' : r.error || 'No devices subscribed — turn notifications off and on again.', !r.sent); });
    $$('[data-pref]').forEach(c => c.onchange = async () => { try { const r = await api('prefs', { method: 'POST', json: { [c.dataset.pref]: c.checked } }); me.prefs = r.prefs; } catch (e) { toast(e.message, true); c.checked = !c.checked; } });
    $('#saveProf').onclick = async () => { try { const r = await api('profile', { method: 'POST', json: { display: $('#dn').value, bio: $('#bio').value } }); Object.assign(me, r.me); toast('Saved'); renderMe(); } catch (e) { toast(e.message, true); } };
    $('#rmAv') && ($('#rmAv').onclick = async () => { const r = await api('profile', { method: 'POST', json: { avatar: '' } }); Object.assign(me, r.me); renderMe(); });
    $('#avIn').onchange = async () => {
      const f = $('#avIn').files[0]; if (!f) return; const img = new Image(); img.src = URL.createObjectURL(f); await img.decode().catch(() => {});
      const c = document.createElement('canvas'); c.width = c.height = 160; const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 160, 160);
      try { const r = await api('profile', { method: 'POST', json: { avatar: c.toDataURL('image/jpeg', .75) } }); Object.assign(me, r.me); renderMe(); } catch (e) { toast(e.message, true); }
    };
    $('#chPw') && ($('#chPw').onclick = async () => { try { await api('password', { method: 'POST', json: { old: $('#op').value, password: $('#np2').value } }); toast('Password changed'); $('#op').value = $('#np2').value = ''; } catch (e) { toast(e.message, true); } });
    $('#logout').onclick = async () => { if (await confirmIt('Sign out?', 'Your post limit stays on this device.', 'Sign out')) { USSCall.hangup?.(); USS.logOut(); } };
  }

  // ------------------------------------------------ notifications, online/offline, links
  const prefs = () => ({ msgs: true, groups: true, calls: true, requests: true, likes: true, online: true, sound: true, ...(me?.prefs || {}) });
  let AC2; function ding(hi) { if (!prefs().sound) return; try { const a = AC2 ||= new (window.AudioContext || window.webkitAudioContext)(); const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(hi ? 880 : 660, t); o.frequency.exponentialRampToValueAtTime(hi ? 1320 : 990, t + .12); g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.0001, t + .3); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .3); } catch {} }
  let firstPres = true;
  USS.onPres(np => {
    const was = { ...pres }; Object.assign(pres, np);
    if (!firstPres && prefs().online) for (const [u, t] of Object.entries(np)) {
      const now = t > 0 && Date.now() - t < 90000, before = was[u] > 0 && Date.now() - was[u] < 90000;
      if (now && !before) { toast(`@${u} is online`); ding(true); }
    }
    firstPres = false; renderThreads();
  });
  // offline = no ping for 2+ minutes
  setInterval(() => { if (!prefs().online || document.hidden) return; for (const u of friends.friends) { const off = !(pres[u] > 0 && Date.now() - pres[u] < 90000); if (off && pres[u] && !pres['_off' + u]) { pres['_off' + u] = 1; toast(`@${u} went offline`); renderThreads(); } if (!off) delete pres['_off' + u]; } }, 30000);
  let lastInbox = null;
  USS.onSync(d => {
    if (lastInbox && d.inbox) for (const [k, x] of Object.entries(d.inbox)) {
      const old = lastInbox[k];
      if (x.unread && (!old || x.last > old.last) && x.from !== me.u && k !== openKey) {
        const grp = k.startsWith('g:');
        if (prefs()[grp ? 'groups' : 'msgs']) { toast((grp ? threadName(k) + ' · ' : '@' + x.from + ': ') + x.preview); ding(); }
      }
    }
    if (d.inbox) lastInbox = d.inbox;
  });
  // service worker for notifications that work when the site is closed
  const pushOk = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const swReady = 'serviceWorker' in navigator && location.protocol.startsWith('http') ? navigator.serviceWorker.register('/sw.js').catch(() => null) : Promise.resolve(null);
  navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.type === 'uss-open') handleUrl(new URL(e.data.url)); });
  const b64ToBytes = (b) => { const s2 = atob(b.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b.length + 3) % 4)); return Uint8Array.from(s2, c => c.charCodeAt(0)); };
  async function enableNotifs() {
    if (!pushOk) return toast(isIOS && !standalone ? 'On iPhone/iPad: tap Share → Add to Home Screen, open it from there, then turn notifications on.' : "This browser doesn't support notifications.", true);
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notifications are blocked. Allow them in your browser settings for this site.', true);
    try {
      const reg = await swReady || await navigator.serviceWorker.ready;
      const { key } = await api('push/key');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
      await api('push/subscribe', { method: 'POST', json: { sub: sub.toJSON() } });
      me.pushCount = Math.max(1, me.pushCount || 0); localStorage.setItem('uss_push_on', '1');
      toast('Notifications on!'); renderMe();
    } catch (e) { toast("Couldn't turn on notifications: " + e.message, true); }
  }
  async function disableNotifs() {
    try { const reg = await swReady; const sub = await reg?.pushManager.getSubscription(); if (sub) { await api('push/unsubscribe', { method: 'POST', json: { endpoint: sub.endpoint } }); await sub.unsubscribe(); } } catch {}
    localStorage.removeItem('uss_push_on'); me.pushCount = 0; toast('Notifications off on this device'); renderMe();
  }
  window.__ussNotifs = { enableNotifs, disableNotifs, pushOk, isIOS, standalone };
  // links: /?clip=…  /?user=…  /?chat=…  /?tab=…  /?ring=1
  let pendingUrl = new URL(location.href);
  function handleUrl(u) {
    const q = u.searchParams; if (!me) { pendingUrl = u; return; }
    if (q.get('clip')) { go('clips'); openClip(q.get('clip')); }
    else if (q.get('user')) openProfile(q.get('user').toLowerCase());
    else if (q.get('chat')) { go('chats'); loadFriends().then(() => openThread(q.get('chat'))); }
    else if (q.get('tab')) go(q.get('tab'));
    else if (q.get('ring')) USS.syncNow();
    if ([...q.keys()].some(k => ['clip', 'user', 'chat', 'tab', 'ring'].includes(k))) history.replaceState(null, '', location.pathname);
  }
  USS.onChange(S => { if (S.me && pendingUrl && USS.hasPass() || (S.me?.owner && pendingUrl)) { const u = pendingUrl; pendingUrl = null; setTimeout(() => handleUrl(u), 300); } });

  window.USSApp = { toast, sheet, closeSheet, confirmIt, users, av, nameTag, get me() { return me; } };
})();
