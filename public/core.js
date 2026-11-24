/* UnStevened Social — core: device id, account, server calls, online check, cheap sync, uploads */
(() => {
  const ls = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} } };
  const TOKEN = 'uss_token', USER = 'uss_user', DEV = 'uss_device';
  // entry pass from cracking the code — kept only for this visit, so every new visit gets a new code
  // entry pass: crack the code once per device; stays until the owner makes everyone do it again
  const passGet = () => { try { return localStorage.getItem('uss_pass') || ''; } catch { return ''; } };
  const passSet = (v) => { try { v ? localStorage.setItem('uss_pass', v) : localStorage.removeItem('uss_pass'); } catch {} };

  // ---------------------------------------------------------------- device id (kept in 4 places so the post limit sticks)
  let deviceId = '';
  const cookieGet = () => (document.cookie.match(/(?:^|; )uss_d=([^;]+)/) || [])[1] || '';
  const cookieSet = (v) => { try { document.cookie = `uss_d=${v}; Max-Age=315360000; Path=/; SameSite=Lax; Secure`; } catch {} };
  function idb(op, v) {
    return new Promise((res) => {
      try {
        const r = indexedDB.open('uss', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('k');
        r.onsuccess = () => {
          const tx = r.result.transaction('k', op === 'get' ? 'readonly' : 'readwrite');
          const q = op === 'get' ? tx.objectStore('k').get('device') : tx.objectStore('k').put(v, 'device');
          q.onsuccess = () => res(q.result || ''); q.onerror = () => res('');
        };
        r.onerror = () => res('');
      } catch { res(''); }
    });
  }
  async function cacheGet() { try { const c = await caches.open('uss-id'); const r = await c.match('/__uss_device'); return r ? await r.text() : ''; } catch { return ''; } }
  async function cacheSet(v) { try { const c = await caches.open('uss-id'); await c.put('/__uss_device', new Response(v)); } catch {} }
  const ready = (async () => {
    const found = [ls.get(DEV), cookieGet(), await idb('get'), await cacheGet()].find(v => /^[a-z0-9]{16,64}$/.test(v));
    deviceId = found || (Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join(''));
    ls.set(DEV, deviceId); cookieSet(deviceId); idb('put', deviceId); cacheSet(deviceId);
  })();
  // light device fingerprint — only used to spot a "cleared my data to reset the limit" device
  const fp = (() => {
    let gpu = '';
    try { const g = document.createElement('canvas').getContext('webgl'); const d = g.getExtension('WEBGL_debug_renderer_info'); gpu = d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : ''; } catch {}
    const raw = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height + 'x' + devicePixelRatio, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.hardwareConcurrency, navigator.platform, gpu].join('|');
    let h1 = 0x811c9dc5, h2 = 0x1234567;
    for (let i = 0; i < raw.length; i++) { h1 = Math.imul(h1 ^ raw.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ raw.charCodeAt(i), 2246822519); }
    return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)).padStart(16, '0');
  })();

  // ---------------------------------------------------------------- server calls
  async function api(path, opts = {}) {
    await ready;
    const headers = { 'X-Device': deviceId, 'X-FP': fp, ...(opts.headers || {}) };
    const tok = ls.get(TOKEN); if (tok) headers.Authorization = 'Bearer ' + tok;
    const pass = passGet(); if (pass) headers['X-Pass'] = pass;
    let body = opts.body;
    if (opts.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json); }
    const res = await fetch('/api/' + path, { method: opts.method || 'GET', headers, body, cache: 'no-store', signal: opts.signal });
    const data = await res.json().catch(() => ({}));
    if (data.relogin) setSession(null, null);
    if (data.needPass) { passSet(''); if (S.hello?.cfg) S.hello.cfg.codeOn = true; emit(); }
    if (data.banned || data.maintenance || data.shutdown || data.timeout) { S.blocked = data; emit(); }
    if (!res.ok) { const e = new Error(data.error || ('HTTP ' + res.status)); e.data = data; e.status = res.status; throw e; }
    return data;
  }

  // ---------------------------------------------------------------- state
  const S = { online: null, server: null, hello: null, me: null, blocked: null, network: '', saver: 0 };
  let booted = false;
  const subs = new Set();
  const emit = () => subs.forEach(f => { try { f(S); } catch (e) { console.error(e); } });
  function setSession(token, user) { ls.set(TOKEN, token || ''); ls.set(USER, user || ''); if (!token) { S.me = null; ver = -1; } emit(); }

  // ---------------------------------------------------------------- online check (static file = free, no function call)
  const timed = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
  async function internet() {
    if (navigator.onLine === false) return false;
    for (let i = 0; i < 2; i++) {
      try { const r = await timed(fetch('/ping.txt?t=' + Date.now(), { cache: 'no-store' }), 5000); if (r.status < 500) return true; } catch {}
      await new Promise(r => setTimeout(r, 900));
    }
    return false;
  }
  async function hello() {
    try {
      const d = await timed(api('hello' + (booted ? '' : '?boot=1')), 8000); booted = true;
      S.server = true; S.hello = d; S.network = d.network; S.saver = d.saver || 0;
      if (d.me) { S.me = d.me; ls.set(USER, d.me.u); } else if (ls.get(TOKEN)) setSession(null, null);
      else S.me = null;
      if (d.timeout > Date.now()) S.blocked = { timeout: d.timeout };
      else if (d.cfg?.shutdown && !d.me?.owner) S.blocked = { shutdown: true, error: d.cfg.shutdownMsg || 'UnStevened Social is closed right now.' };
      else if (!d.me?.status?.banned) S.blocked = d.cfg?.maintenance && !(d.me?.perms || []).includes('settings') ? { maintenance: true, error: 'UnStevened Social is under maintenance. Check back soon!' } : null;
    } catch (e) { if (!e.data?.banned) S.server = false; }
    emit();
    return S;
  }
  async function check(force) {
    const was = S.online;
    S.online = await internet();
    if (S.online && (force || was !== true || S.server !== true)) await hello(); else emit();
    return S;
  }
  addEventListener('online', () => check(true));
  addEventListener('offline', () => { S.online = false; emit(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { check(); syncNow(); } });
  // CREDITS: no background "are we online" pinging — only when the browser says the connection changed

  // ---------------------------------------------------------------- sync: ONE tiny request that returns "nothing changed" most of the time
  let lastPres = 0, cameBack = true; const presSubs = new Set();
  // closing the site / leaving it = you show as offline right away
  const bye = () => { try { const tok = ls.get(TOKEN); if (!tok || !deviceId) return; fetch('/api/bye', { method: 'POST', keepalive: true, headers: { Authorization: 'Bearer ' + tok, 'X-Device': deviceId, 'X-FP': fp, 'X-Pass': passGet() } }); } catch {} };
  addEventListener('pagehide', bye);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cameBack = true; });
  let ver = -1, syncT = 0, lastInput = Date.now(), asleep = false, pendingViews = new Set(), fastUntil = 0;
  const syncSubs = new Set();
  ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev => addEventListener(ev, () => { lastInput = Date.now(); if (asleep) { asleep = false; syncNow(); } }, { passive: true, capture: true }));
  const SAVER_X = [1, 2, 4, 8];                   // the server slows everyone down if credits are running out
  function nextDelay() {
    const idle = Date.now() - lastInput, x = SAVER_X[S.saver] || 1;
    if (idle > 8 * 60e3) return 0;                // asleep until you touch the page
    if (Date.now() < fastUntil && idle < 90e3) return 5000 * x; // chat open and you're actually using it
    if (idle > 2 * 60e3) return 60000 * x;
    return 20000 * x;
  }
  async function syncNow() {
    clearTimeout(syncT); if (window.USS_NO_SYNC || S.blocked || (!passGet() && !S.me?.owner && S.hello?.cfg?.codeOn !== false)) return; // closed / banned = no requests at all
    if (S.me && S.online && S.server && !document.hidden) {
      try {
        const views = [...pendingViews].slice(0, 30); pendingViews.clear();
        const wantPres = Date.now() - lastPres > 30000; if (wantPres) lastPres = Date.now();
        const d = await api(`sync?v=${ver}` + (views.length ? '&views=' + views.join(',') : '') + (wantPres ? '&pres=1' : '') + (cameBack ? '&back=1' : '')); cameBack = false;
        if (d.pres) presSubs.forEach(f => { try { f(d.pres); } catch {} });
        if (d.saver !== undefined && d.saver !== S.saver) { S.saver = d.saver; emit(); }
        if (d.codeOn !== undefined && S.hello?.cfg && d.codeOn !== S.hello.cfg.codeOn) { S.hello.cfg.codeOn = d.codeOn; emit(); } // owner flipped the entry code
        if (!d.same) { ver = d.v; syncSubs.forEach(f => { try { f(d); } catch (e) { console.error(e); } }); }
      } catch {}
    }
    const n = nextDelay();
    if (n) syncT = setTimeout(syncNow, n); else asleep = true;
  }

  // ---------------------------------------------------------------- video: shrink before upload (smaller = fewer credits)
  const pickMime = () => ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  async function videoInfo(blob) {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto';
    const url = URL.createObjectURL(blob); v.src = url;
    await new Promise(r => { v.onloadedmetadata = r; v.onerror = r; });
    if (!isFinite(v.duration)) { await new Promise(r => { v.ontimeupdate = () => { v.ontimeupdate = null; r(); }; v.currentTime = 1e9; setTimeout(r, 3000); }); }
    const duration = isFinite(v.duration) ? v.duration : 0;
    // thumbnail from ~25% in
    let thumb = '';
    try {
      await new Promise(r => { v.onseeked = r; v.currentTime = Math.min(duration * .25, Math.max(0, duration - .1)); setTimeout(r, 2500); });
      const c = document.createElement('canvas'); const k = 360 / Math.max(v.videoWidth || 360, v.videoHeight || 640);
      c.width = Math.round((v.videoWidth || 360) * k); c.height = Math.round((v.videoHeight || 640) * k);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); thumb = c.toDataURL('image/jpeg', .62);
    } catch {}
    return { v, url, duration, w: v.videoWidth, h: v.videoHeight, thumb };
  }
  // CREDITS: every GB people watch costs 20 credits, so every clip is squeezed under the size cap (default 4 MB)
  const capBytes = () => (S.hello?.cfg?.maxVideoMB || 25) * 1048576 * ((S.me?.perms || []).includes('posts.long') ? 2 : 1);
  async function compress(blob, onProgress) {
    const info = await videoInfo(blob);
    const cap = capBytes();
    const r2 = !!S.hello?.cfg?.r2;                                   // Cloudflare storage = watching is free, so keep it sharp
    const maxSide = r2 ? 1920 : S.saver >= 2 ? 960 : 1280;
    const fit = info.duration ? (cap * 8 * 0.85) / info.duration - 64_000 : 700_000; // bitrate that fits the cap
    const vbr = Math.max(400_000, Math.min(r2 ? 6_000_000 : S.saver >= 2 ? 1_200_000 : 2_500_000, fit));
    const bitrate = info.duration ? (blob.size * 8) / info.duration : 0;
    const small = Math.max(info.w, info.h) <= maxSide && bitrate <= vbr * 1.3 && blob.size <= cap;
    if (!info.duration || small || !pickMime()) { URL.revokeObjectURL(info.url); if (blob.size > cap) throw new Error(`Clip is too big (max ${Math.round(cap / 1048576)} MB). Trim it shorter in the editor.`); return { blob, duration: info.duration, thumb: info.thumb }; }
    const k = Math.min(1, maxSide / Math.max(info.w, info.h));
    const c = document.createElement('canvas'); c.width = Math.round(info.w * k / 2) * 2; c.height = Math.round(info.h * k / 2) * 2;
    const x = c.getContext('2d');
    const stream = c.captureStream(30);
    const v = info.v; v.muted = false; v.currentTime = 0;
    try { const ac = new (window.AudioContext || window.webkitAudioContext)(); const src = ac.createMediaElementSource(v); const d = ac.createMediaStreamDestination(); src.connect(d); d.stream.getAudioTracks().forEach(t => stream.addTrack(t)); } catch {}
    const mime = pickMime();
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: vbr, audioBitsPerSecond: 128_000 });
    const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const done = new Promise(r => rec.onstop = r);
    await new Promise(r => { v.onseeked = r; setTimeout(r, 800); });
    rec.start(500); await v.play().catch(() => {});
    await new Promise(r => { const tick = () => { x.drawImage(v, 0, 0, c.width, c.height); onProgress && onProgress(v.currentTime / info.duration); if (v.ended || v.currentTime >= info.duration - .05) return r(); requestAnimationFrame(tick); }; tick(); });
    rec.stop(); await done; URL.revokeObjectURL(info.url);
    const out = new Blob(chunks, { type: mime.split(';')[0] });
    const best = out.size < blob.size ? out : blob;
    if (best.size > cap) throw new Error(`Clip is still ${(best.size / 1048576).toFixed(1)} MB after shrinking (max ${Math.round(cap / 1048576)} MB). Trim it shorter in the editor.`);
    return { blob: best, duration: info.duration, thumb: info.thumb };
  }
  async function uploadClip(blob, meta, onProgress) {
    onProgress && onProgress(0, 'Shrinking your clip…');
    const c = await compress(blob, p => onProgress && onProgress(p * .4, 'Shrinking your clip…'));
    const init = await api('posts/new', { method: 'POST', json: { ...meta, duration: c.duration, size: c.blob.size, mime: c.blob.type || 'video/webm', thumb: c.thumb } });
    let blocked = false; try { blocked = localStorage.getItem('uss_r2blocked') > Date.now(); } catch {}
    if (init.r2 && blocked) { const f = await api(`posts/${init.id}/fallback`, { method: 'POST' }); init.r2 = false; init.partSize = f.partSize; init.parts = f.parts; }
    if (init.r2) { // straight to Cloudflare R2 — doesn't touch Netlify's bandwidth at all
      for (let t = 0; ; t++) {
        try {
          await new Promise((res, rej) => {
            const x = new XMLHttpRequest(); x.open('PUT', init.putUrl); x.setRequestHeader('Content-Type', c.blob.type || 'video/webm');
            x.upload.onprogress = e => e.lengthComputable && onProgress && onProgress(.4 + .6 * e.loaded / e.total, 'Uploading…');
            x.onload = () => x.status < 300 ? res() : rej(new Error('Upload failed (' + x.status + ')')); x.onerror = () => rej(new Error('Upload failed — check your connection.'));
            x.send(c.blob);
          });
          break;
        } catch (e) {
          if (t >= 2) { // Cloudflare looks blocked here (VPN / web filter) — send it through the site instead
            try { localStorage.setItem('uss_r2blocked', String(Date.now() + 3600e3)); } catch {}
            const f = await api(`posts/${init.id}/fallback`, { method: 'POST' }); init.partSize = f.partSize; init.parts = f.parts; init.r2 = false; break;
          }
          await new Promise(r => setTimeout(r, 1500 * (t + 1)));
        }
      }
      if (init.r2) return api(`posts/${init.id}/finish`, { method: 'POST' });
    }
    for (let i = 0; i < init.parts; i++) {
      const part = c.blob.slice(i * init.partSize, (i + 1) * init.partSize);
      for (let t = 0; ; t++) {
        try { await api(`posts/${init.id}/part/${i}`, { method: 'PUT', body: part, headers: { 'Content-Type': 'application/octet-stream' } }); break; }
        catch (e) { if (t >= 2) throw e; await new Promise(r => setTimeout(r, 1500 * (t + 1))); }
      }
      onProgress && onProgress(.4 + .6 * (i + 1) / init.parts, 'Uploading…');
    }
    return api(`posts/${init.id}/finish`, { method: 'POST' });
  }
  // clip parts are cached on the phone/PC too, so re-watching costs nothing
  async function loadClip(post) {
    const key = '/__uss_clip/' + post.id;
    try { const c = await caches.open('uss-clips'); const hit = await c.match(key); if (hit) return await hit.blob(); } catch {}
    const bufs = [];
    let blocked = false; try { blocked = localStorage.getItem('uss_r2blocked') > Date.now(); } catch {}
    const viaBackup = async () => { // load through the site's own address, 4 MB at a time
      bufs.length = 0; const n = Math.max(1, Math.ceil((post.size || 1) / (4 * 1048576)));
      for (let i = 0; i < n; i++) { const r = await fetch(post.backup + i); if (!r.ok) throw new Error('Clip missing'); bufs.push(await r.arrayBuffer()); }
    };
    // Cloudflare first; if it hasn't even started answering after 2.5 s, race it against the backup (first one wins)
    const getAll = async (urls, sig, onHeaders) => { const out = []; for (const u of urls) { const r = await fetch(u, { signal: sig }); onHeaders && onHeaders(); if (!r.ok) throw new Error('HTTP ' + r.status); out.push(await r.arrayBuffer()); } return out; };
    if (!post.backup) {
      let last; for (let a = 0; a < 3; a++) { try { bufs.push(...await getAll(post.urls)); last = null; break; } catch (e) { last = e; bufs.length = 0; await new Promise(r => setTimeout(r, 600 * (a + 1))); } }
      if (last) throw new Error("Couldn't load this clip. Check your connection and try again.");
    } else {
      const n = Math.max(1, Math.ceil((post.size || 1) / (4 * 1048576)));
      const dCtl = new AbortController(), bCtl = new AbortController();
      let answered = false, backupGo;
      const direct = (async () => { for (let a = 0; a < 2; a++) { try { return await getAll(post.urls, dCtl.signal, () => { answered = true; }); } catch (e) { if (dCtl.signal.aborted) throw e; await new Promise(r => setTimeout(r, 400)); } } throw new Error('cloudflare failed'); })();
      const backup = new Promise((res, rej) => {
        backupGo = () => { if (backupGo.done) return; backupGo.done = true; getAll(Array.from({ length: n }, (_, i) => post.backup + i), bCtl.signal).then(res, rej); };
        const t = setTimeout(() => { if (!answered) backupGo(); }, blocked ? 0 : 2500);
        direct.catch(() => { clearTimeout(t); backupGo(); });
      });
      let win;
      try { win = await Promise.any([direct.then(x => ({ x, d: 1 })), backup.then(x => ({ x, d: 0 }))]); }
      catch { throw new Error("Couldn't load this clip. Check your connection and try again."); }
      (win.d ? bCtl : dCtl).abort();
      bufs.push(...win.x);
      try { if (win.d) localStorage.removeItem('uss_r2blocked'); else localStorage.setItem('uss_r2blocked', String(Date.now() + 3600e3)); } catch {}
    }
    const b = new Blob(bufs, { type: post.mime || 'video/webm' });
    try { const c = await caches.open('uss-clips'); await c.put(key, new Response(b)); const keys = await c.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - 40))) await c.delete(k); } catch {}
    return b;
  }
  async function saveVideo(blob, name = 'unstevened-clip') {
    const ext = /mp4/.test(blob.type) ? 'mp4' : 'webm';
    const file = new File([blob], `${name}.${ext}`, { type: blob.type || 'video/' + ext });
    if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) { try { await navigator.share({ files: [file] }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000); return 'downloaded';
  }

  window.USS = {
    S, api, check, hello, ready, hasPass: () => !!passGet() || S.hello?.cfg?.codeOn === false, setPass(v) { passSet(v); emit(); syncNow(); }, get device() { return deviceId; },
    onChange(f) { subs.add(f); f(S); return () => subs.delete(f); },
    onSync(f) { syncSubs.add(f); }, onPres(f) { presSubs.add(f); }, syncNow, fast(ms = 60000) { fastUntil = Date.now() + ms; syncNow(); }, viewed(id) { pendingViews.add(id); },
    async signUp(u, p, google) { const d = await api('signup', { method: 'POST', json: { username: u, password: p, google } }); setSession(d.token, d.user); await hello(); syncNow(); return d.user; },
    async logIn(u, p, google) { const d = await api('login', { method: 'POST', json: { username: u, password: p, google } }); setSession(d.token, d.user); await hello(); syncNow(); return d.user; },
    logOut() { setSession(null, null); hello(); },
    uploadClip, loadClip, saveVideo, videoInfo,
    OFFLINE: 'You are offline. Try turning on your Wi-Fi or connecting to one.'
  };
  ready.then(() => check(true)).then(() => syncNow());
})();
/* backup: if Netlify still injects a floating badge, remove it when it shows up */
(() => {
  const kill = (el) => { const t = (el.id || '') + ' ' + (el.className?.baseVal ?? el.className ?? '') + ' ' + (el.getAttribute?.('title') || '') + ' ' + (el.getAttribute?.('src') || el.getAttribute?.('href') || '');
    if (/netlify/i.test(t) && getComputedStyle(el).position === 'fixed') el.remove(); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && n.parentNode === document.body && kill(n)))).observe(document.documentElement, { childList: true, subtree: true });
})();
