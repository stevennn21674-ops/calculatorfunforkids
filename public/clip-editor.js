/* UnStevened 2 — clip editor.
   US2ClipEditor.open(blob, { title }) → Promise<{ blob, title } | null>
   Trim · format/crop · zoom/pan · filters · text · stickers · speed · volume · export */
(() => {
  const CSS = `
  .ce{position:fixed;inset:0;z-index:2147483200;background:#07070a;color:#eee;display:flex;flex-direction:column;font:500 14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;animation:ce-in .35s ease}
  @keyframes ce-in{from{opacity:0;transform:scale(.98)}}
  .ce *{box-sizing:border-box}
  .ce-top{display:flex;align-items:center;gap:10px;padding:max(10px,env(safe-area-inset-top)) 14px 10px;border-bottom:1px solid #222}
  .ce-top h2{margin:0;font:800 17px system-ui;flex:1;letter-spacing:.02em}
  .ce-btn{border:1px solid #333;background:#16161c;color:#eee;border-radius:10px;padding:8px 13px;font:700 13px system-ui;cursor:pointer;transition:transform .15s,background .15s}
  .ce-btn:hover{background:#22222a}.ce-btn:active{transform:scale(.96)}
  .ce-btn.pri{background:linear-gradient(135deg,#ff3d78,#8b5cf6);border-color:transparent;color:#fff}
  .ce-main{flex:1;min-height:0;display:flex;gap:0}
  .ce-stage{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;gap:10px;background:radial-gradient(circle at 50% 30%,#15151d,#07070a)}
  .ce-canvas{max-width:100%;max-height:calc(100% - 110px);background:#000;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.6);touch-action:none;cursor:grab}
  .ce-transport{display:flex;align-items:center;gap:10px;width:min(760px,100%)}
  .ce-play{width:40px;height:40px;border-radius:50%;border:0;background:#fff;color:#000;font-size:16px;cursor:pointer;flex-shrink:0}
  .ce-time{font:600 12px ui-monospace,monospace;color:#aaa;white-space:nowrap}
  .ce-timeline{position:relative;flex:1;height:44px;border-radius:9px;background:#15151b;overflow:hidden;cursor:pointer}
  .ce-thumbs{position:absolute;inset:0;display:flex;opacity:.55}
  .ce-thumbs img{flex:1;min-width:0;height:100%;object-fit:cover}
  .ce-range{position:absolute;top:0;bottom:0;border:2px solid #ffd400;border-radius:8px;background:rgba(255,212,0,.08);pointer-events:none}
  .ce-handle{position:absolute;top:0;bottom:0;width:14px;background:#ffd400;cursor:ew-resize;border-radius:6px;touch-action:none}
  .ce-head{position:absolute;top:-2px;bottom:-2px;width:3px;background:#fff;box-shadow:0 0 8px #fff;pointer-events:none}
  .ce-side{width:340px;flex-shrink:0;border-left:1px solid #222;display:flex;flex-direction:column;background:#0d0d12}
  .ce-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:10px;border-bottom:1px solid #222}
  .ce-tab{flex:1 0 auto;border:0;border-radius:9px;padding:8px 10px;background:transparent;color:#aaa;font:700 12.5px system-ui;cursor:pointer}
  .ce-tab.on{background:#22222c;color:#fff}
  .ce-panel{flex:1;overflow-y:auto;padding:14px}
  .ce-row{margin-bottom:14px}
  .ce-row label{display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:#bbb;margin-bottom:6px}
  .ce-row input[type=range]{width:100%;accent-color:#ff3d78}
  .ce-row input[type=text],.ce-row select{width:100%;background:#16161c;border:1px solid #333;color:#fff;border-radius:9px;padding:8px 10px;font:500 14px system-ui}
  .ce-chips{display:flex;flex-wrap:wrap;gap:6px}
  .ce-chip{border:1px solid #333;background:#16161c;color:#ddd;border-radius:999px;padding:6px 11px;font:600 12.5px system-ui;cursor:pointer}
  .ce-chip.on{border-color:#ff3d78;background:#ff3d7826;color:#fff}
  .ce-filter{width:74px;border:2px solid transparent;border-radius:10px;padding:0;background:none;color:#ccc;font:600 11px system-ui;cursor:pointer;text-align:center}
  .ce-filter canvas{width:100%;aspect-ratio:16/10;border-radius:8px;display:block;margin-bottom:3px}
  .ce-filter.on{border-color:#ff3d78}
  .ce-items{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
  .ce-item{display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #2a2a33;border-radius:10px;background:#14141a;cursor:pointer}
  .ce-item.on{border-color:#ffd400}
  .ce-item span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ce-item button{border:0;background:none;color:#888;font-size:17px;cursor:pointer}
  .ce-stickers{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
  .ce-stickers button{font-size:24px;border:1px solid #2a2a33;background:#14141a;border-radius:10px;padding:6px 0;cursor:pointer}
  .ce-note{font-size:12px;color:#888;margin:0 0 10px}
  .ce-export{position:absolute;inset:0;z-index:5;background:rgba(0,0,0,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
  .ce-bar{width:min(360px,80vw);height:8px;border-radius:9px;background:#222;overflow:hidden}
  .ce-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff3d78,#8b5cf6)}
  @media (max-width:820px){.ce-main{flex-direction:column}.ce-side{width:auto;height:46%;border-left:0;border-top:1px solid #222}.ce-canvas{max-height:calc(100% - 70px)}.ce-stage{padding:8px}}
  `;
  let styled = false;
  const FILTERS = {
    None: { b: 100, c: 100, s: 100, extra: '' },
    Vivid: { b: 105, c: 120, s: 150, extra: '' },
    Cinema: { b: 95, c: 125, s: 85, extra: 'sepia(15%)' },
    'B&W': { b: 100, c: 115, s: 0, extra: '' },
    Retro: { b: 105, c: 95, s: 80, extra: 'sepia(45%)' },
    Neon: { b: 110, c: 130, s: 180, extra: 'hue-rotate(25deg)' },
    Cold: { b: 100, c: 105, s: 90, extra: 'hue-rotate(190deg) saturate(60%)' },
    Dream: { b: 112, c: 90, s: 120, extra: 'blur(.4px)' }
  };
  const STICKERS = ['🔥', '💀', '😂', '😎', '👑', '⭐', '💥', '🎮', '🏆', '❤️', '👀', '😱', '🤯', '💯', '⚡', '🗿', '🐐', '✅'];
  const FONTS = { Impact: 'Impact, Haettenschweiler, sans-serif', Bold: '800 {s}px system-ui', Comic: '"Comic Sans MS", "Comic Neue", cursive', Mono: 'ui-monospace, monospace', Serif: 'Georgia, serif' };
  const fmt = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = (t % 60); return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
  const pickMime = () => ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';

  function open(blob, opts = {}) {
    if (!styled) { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); styled = true; }
    return new Promise(async (resolve) => {
      const srcUrl = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.src = srcUrl; video.playsInline = true; video.muted = false; video.preload = 'auto'; video.crossOrigin = 'anonymous';
      await new Promise((r) => { video.onloadedmetadata = r; video.onerror = r; });
      // webm from MediaRecorder often reports Infinity duration until we seek to the end
      if (!isFinite(video.duration)) {
        await new Promise(r => { video.ontimeupdate = () => { video.ontimeupdate = null; r(); }; video.currentTime = 1e9; });
        video.currentTime = 0;
      }
      const dur = isFinite(video.duration) ? video.duration : 10;
      const S = {
        start: 0, end: dur, format: 'original', zoom: 1, panX: 0, panY: 0,
        filter: 'None', b: 100, c: 100, s: 100, extra: '', speed: 1, volume: 1, muted: false,
        items: [], sel: -1, title: opts.title || ''
      };
      const root = document.createElement('div');
      root.className = 'ce';
      root.innerHTML = `
        <div class="ce-top"><button class="ce-btn" data-a="cancel">✕ Cancel</button><h2>Edit clip</h2><button class="ce-btn pri" data-a="export">Done ✓</button></div>
        <div class="ce-main">
          <div class="ce-stage">
            <canvas class="ce-canvas"></canvas>
            <div class="ce-transport">
              <button class="ce-play" data-a="play">▶</button>
              <div class="ce-timeline"><div class="ce-thumbs"></div><div class="ce-range"></div><div class="ce-handle" data-h="start"></div><div class="ce-handle" data-h="end"></div><div class="ce-head"></div></div>
              <span class="ce-time"></span>
            </div>
          </div>
          <div class="ce-side">
            <div class="ce-tabs">${['Trim', 'Format', 'Filters', 'Text', 'Stickers', 'Speed', 'Audio'].map((t, i) => `<button class="ce-tab ${i ? '' : 'on'}" data-tab="${t}">${t}</button>`).join('')}</div>
            <div class="ce-panel"></div>
          </div>
        </div>`;
      document.body.appendChild(root);
      const cv = root.querySelector('.ce-canvas');
      const ctx = cv.getContext('2d');
      const panel = root.querySelector('.ce-panel');
      const tl = root.querySelector('.ce-timeline');
      const head = root.querySelector('.ce-head');
      const rangeEl = root.querySelector('.ce-range');
      const timeEl = root.querySelector('.ce-time');
      const playBtn = root.querySelector('.ce-play');

      function outSize() {
        const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
        if (S.format === '9:16') return [720, 1280];
        if (S.format === '1:1') return [960, 960];
        if (S.format === '16:9') return [1280, 720];
        const k = Math.min(1, 1280 / Math.max(vw, vh));
        return [Math.round(vw * k / 2) * 2, Math.round(vh * k / 2) * 2];
      }
      function filterStr() { return `brightness(${S.b}%) contrast(${S.c}%) saturate(${S.s}%) ${S.extra}`.trim(); }
      function draw(c = ctx, W = cv.width, H = cv.height, t = video.currentTime) {
        const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
        c.save();
        c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        c.filter = filterStr();
        const cover = Math.max(W / vw, H / vh) * S.zoom;
        const dw = vw * cover, dh = vh * cover;
        const maxX = Math.max(0, (dw - W) / 2), maxY = Math.max(0, (dh - H) / 2);
        c.drawImage(video, (W - dw) / 2 + S.panX * maxX, (H - dh) / 2 + S.panY * maxY, dw, dh);
        c.filter = 'none';
        S.items.forEach((it, i) => {
          if (t < it.from || t > it.to) return;
          const size = it.size * H;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          if (it.kind === 'sticker') c.font = `${size}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
          else c.font = it.font === 'Bold' ? `800 ${size}px system-ui` : `${it.font === 'Impact' ? '' : '700 '}${size}px ${FONTS[it.font] || FONTS.Impact}`;
          const x = it.x * W, y = it.y * H;
          if (it.kind === 'text') {
            if (it.bg) {
              const m = c.measureText(it.text);
              c.fillStyle = 'rgba(0,0,0,.55)';
              c.fillRect(x - m.width / 2 - size * .3, y - size * .65, m.width + size * .6, size * 1.3);
            }
            if (it.stroke) { c.lineWidth = Math.max(2, size * .12); c.strokeStyle = '#000'; c.lineJoin = 'round'; c.strokeText(it.text, x, y); }
            c.fillStyle = it.color;
          }
          c.fillText(it.text, x, y);
          if (c === ctx && i === S.sel && video.paused) {
            const m = c.measureText(it.text);
            c.strokeStyle = '#ffd400'; c.lineWidth = 2; c.setLineDash([6, 4]);
            c.strokeRect(x - m.width / 2 - 8, y - size * .7, m.width + 16, size * 1.4); c.setLineDash([]);
          }
        });
        c.restore();
      }
      function resize() { const [w, h] = outSize(); cv.width = w; cv.height = h; draw(); }
      function updTimeline() {
        const pct = (x) => (x / dur * 100) + '%';
        rangeEl.style.left = pct(S.start); rangeEl.style.width = pct(S.end - S.start);
        root.querySelector('[data-h="start"]').style.left = `calc(${pct(S.start)} - 2px)`;
        root.querySelector('[data-h="end"]').style.left = `calc(${pct(S.end)} - 12px)`;
        head.style.left = pct(video.currentTime);
        timeEl.textContent = `${fmt(video.currentTime - S.start)} / ${fmt((S.end - S.start) / S.speed)}`;
      }
      let raf = 0;
      function loop() {
        if (video.currentTime >= S.end) { video.currentTime = S.start; }
        draw(); updTimeline();
        raf = requestAnimationFrame(loop);
      }
      function play() { if (video.currentTime < S.start || video.currentTime >= S.end - .05) video.currentTime = S.start; video.playbackRate = S.speed; video.volume = S.muted ? 0 : Math.min(1, S.volume); video.play(); playBtn.textContent = '❚❚'; }
      function pause() { video.pause(); playBtn.textContent = '▶'; draw(); updTimeline(); }
      video.addEventListener('seeked', () => { draw(); updTimeline(); });

      // filmstrip
      (async () => {
        const strip = root.querySelector('.ce-thumbs');
        const tv = document.createElement('video'); tv.src = srcUrl; tv.muted = true; tv.playsInline = true;
        await new Promise(r => { tv.onloadeddata = r; tv.onerror = r; });
        const tc = document.createElement('canvas'); tc.width = 120; tc.height = 68;
        for (let i = 0; i < 8; i++) {
          await new Promise(r => { tv.onseeked = r; tv.currentTime = Math.min(dur - .05, (i + .5) * dur / 8); setTimeout(r, 1500); });
          tc.getContext('2d').drawImage(tv, 0, 0, 120, 68);
          const im = new Image(); im.src = tc.toDataURL('image/jpeg', .6); strip.appendChild(im);
        }
      })();

      // timeline: click to seek, drag handles to trim
      function tlTime(e) { const r = tl.getBoundingClientRect(); return Math.max(0, Math.min(dur, (e.clientX - r.left) / r.width * dur)); }
      tl.addEventListener('pointerdown', (e) => {
        const h = e.target.dataset.h;
        tl.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const t = tlTime(ev);
          if (h === 'start') S.start = Math.min(t, S.end - .3);
          else if (h === 'end') S.end = Math.max(t, S.start + .3);
          video.currentTime = h === 'end' ? S.end - .02 : (h === 'start' ? S.start : Math.max(S.start, Math.min(S.end, t)));
          updTimeline(); if (S_tab === 'Trim') renderPanel();
        };
        move(e);
        const up = () => { tl.removeEventListener('pointermove', move); tl.removeEventListener('pointerup', up); };
        tl.addEventListener('pointermove', move); tl.addEventListener('pointerup', up);
      });

      // drag text/stickers on the preview; drag empty area to pan when zoomed
      cv.addEventListener('pointerdown', (e) => {
        const r = cv.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        let hit = -1;
        S.items.forEach((it, i) => { if (Math.abs(it.x - px) < .2 && Math.abs(it.y - py) < it.size * .9 + .03 && video.currentTime >= it.from && video.currentTime <= it.to) hit = i; });
        S.sel = hit; renderPanel(); draw();
        cv.setPointerCapture(e.pointerId);
        const sx = e.clientX, sy = e.clientY, ox = hit >= 0 ? S.items[hit].x : S.panX, oy = hit >= 0 ? S.items[hit].y : S.panY;
        const move = (ev) => {
          const dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
          if (hit >= 0) { S.items[hit].x = Math.max(0, Math.min(1, ox + dx)); S.items[hit].y = Math.max(0, Math.min(1, oy + dy)); }
          else if (S.zoom > 1 || S.format !== 'original') { S.panX = Math.max(-1, Math.min(1, ox - dx * 2)); S.panY = Math.max(-1, Math.min(1, oy - dy * 2)); }
          draw();
        };
        const up = () => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); };
        cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up);
      });

      // ---- side panels ----
      let S_tab = 'Trim';
      const slider = (key, label, min, max, step, unit = '', after) => `<div class="ce-row"><label>${label}<span data-v="${key}">${(+S[key]).toFixed(step < 1 ? 2 : 0)}${unit}</span></label><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${S[key]}" ${after || ''}></div>`;
      function renderPanel() {
        const t = S_tab;
        let h = '';
        if (t === 'Trim') h = `<p class="ce-note">Drag the yellow handles on the timeline, or use these.</p>
          ${slider('start', 'Start', 0, dur, .05, 's')}${slider('end', 'End', 0, dur, .05, 's')}
          <div class="ce-chips"><button class="ce-chip" data-a="startHere">Start here</button><button class="ce-chip" data-a="endHere">End here</button><button class="ce-chip" data-a="resetTrim">Reset</button></div>
          <div class="ce-row" style="margin-top:14px"><label>Title</label><input type="text" data-k="title" maxlength="120" placeholder="Name your clip" value="${(S.title || '').replace(/"/g, '&quot;')}"></div>`;
        if (t === 'Format') h = `<div class="ce-row"><label>Shape</label><div class="ce-chips">${[['original', 'Original'], ['9:16', '9:16 Shorts'], ['1:1', '1:1 Square'], ['16:9', '16:9 Wide']].map(([v, l]) => `<button class="ce-chip ${S.format === v ? 'on' : ''}" data-fmt="${v}">${l}</button>`).join('')}</div></div>
          ${slider('zoom', 'Zoom', 1, 3, .01, '×')}${slider('panX', 'Move left / right', -1, 1, .01)}${slider('panY', 'Move up / down', -1, 1, .01)}
          <p class="ce-note">Tip: drag the video to move it when zoomed.</p>`;
        if (t === 'Filters') h = `<div class="ce-chips" style="margin-bottom:14px">${Object.keys(FILTERS).map(f => `<button class="ce-filter ${S.filter === f ? 'on' : ''}" data-filter="${f}"><canvas width="96" height="60"></canvas>${f}</button>`).join('')}</div>
          ${slider('b', 'Brightness', 30, 180, 1, '%')}${slider('c', 'Contrast', 30, 180, 1, '%')}${slider('s', 'Saturation', 0, 250, 1, '%')}`;
        if (t === 'Text' || t === 'Stickers') {
          const kind = t === 'Text' ? 'text' : 'sticker';
          const list = S.items.map((it, i) => it.kind === kind ? `<div class="ce-item ${i === S.sel ? 'on' : ''}" data-i="${i}"><span>${it.text}</span><button data-del="${i}" aria-label="Delete">🗑</button></div>` : '').join('');
          h = t === 'Text' ? `<button class="ce-btn pri" data-a="addText" style="width:100%;margin-bottom:12px">＋ Add text</button>` : `<div class="ce-stickers" style="margin-bottom:12px">${STICKERS.map(s => `<button data-sticker="${s}">${s}</button>`).join('')}</div>`;
          h += `<div class="ce-items">${list}</div>`;
          const it = S.items[S.sel];
          if (it && it.kind === kind) {
            if (kind === 'text') h += `<div class="ce-row"><label>Text</label><input type="text" data-it="text" value="${it.text.replace(/"/g, '&quot;')}"></div>
              <div class="ce-row"><label>Font</label><div class="ce-chips">${Object.keys(FONTS).map(f => `<button class="ce-chip ${it.font === f ? 'on' : ''}" data-font="${f}">${f}</button>`).join('')}</div></div>
              <div class="ce-row"><label>Color</label><div class="ce-chips">${['#ffffff', '#ffd400', '#ff3d78', '#22d3ff', '#4ade80', '#000000'].map(c => `<button class="ce-chip ${it.color === c ? 'on' : ''}" data-color="${c}" style="background:${c};width:30px;height:30px;padding:0"></button>`).join('')}<input type="color" data-it="color" value="${it.color}"></div></div>
              <div class="ce-chips" style="margin-bottom:14px"><button class="ce-chip ${it.stroke ? 'on' : ''}" data-tog="stroke">Outline</button><button class="ce-chip ${it.bg ? 'on' : ''}" data-tog="bg">Background</button></div>`;
            h += `<div class="ce-row"><label>Size<span>${Math.round(it.size * 100)}</span></label><input type="range" data-it="size" min=".03" max=".35" step=".005" value="${it.size}"></div>
              <div class="ce-row"><label>Shows from<span>${fmt(it.from)}</span></label><input type="range" data-it="from" min="0" max="${dur}" step=".05" value="${it.from}"></div>
              <div class="ce-row"><label>Until<span>${fmt(it.to)}</span></label><input type="range" data-it="to" min="0" max="${dur}" step=".05" value="${it.to}"></div>
              <p class="ce-note">Drag it on the video to move it.</p>`;
          }
        }
        if (t === 'Speed') h = `<div class="ce-row"><label>Speed</label><div class="ce-chips">${[.25, .5, .75, 1, 1.25, 1.5, 2].map(v => `<button class="ce-chip ${S.speed === v ? 'on' : ''}" data-speed="${v}">${v}×</button>`).join('')}</div></div><p class="ce-note">Slow-mo is great for clutch moments.</p>`;
        if (t === 'Audio') h = `<div class="ce-chips" style="margin-bottom:14px"><button class="ce-chip ${S.muted ? 'on' : ''}" data-tog2="muted">${S.muted ? '🔇 Muted' : '🔊 Sound on'}</button></div>${slider('volume', 'Volume', 0, 1, .01)}`;
        panel.innerHTML = h;
        if (t === 'Filters') panel.querySelectorAll('.ce-filter canvas').forEach(c => {
          const f = FILTERS[c.parentElement.dataset.filter], x = c.getContext('2d');
          x.filter = `brightness(${f.b}%) contrast(${f.c}%) saturate(${f.s}%) ${f.extra}`; x.drawImage(cv, 0, 0, 96, 60);
        });
      }
      panel.addEventListener('input', (e) => {
        const k = e.target.dataset.k, ik = e.target.dataset.it;
        if (k) {
          S[k] = k === 'title' ? e.target.value : +e.target.value;
          if (k === 'start') S.start = Math.min(S.start, S.end - .3), video.currentTime = S.start;
          if (k === 'end') S.end = Math.max(S.end, S.start + .3), video.currentTime = S.end - .02;
          if (k === 'volume') video.volume = S.volume;
          if (['b', 'c', 's'].includes(k)) S.filter = 'Custom';
          const v = panel.querySelector(`[data-v="${k}"]`); if (v) v.textContent = (+S[k]).toFixed(e.target.step < 1 ? 2 : 0);
        }
        if (ik) { const it = S.items[S.sel]; if (it) it[ik] = ik === 'text' || ik === 'color' ? e.target.value : +e.target.value; if (ik === 'from' || ik === 'to') video.currentTime = it[ik]; }
        draw(); updTimeline();
      });
      panel.addEventListener('change', (e) => { if (e.target.dataset.it && e.target.dataset.it !== 'text') renderPanel(); });
      panel.addEventListener('click', (e) => {
        const d = e.target.closest('button')?.dataset; if (!d) return;
        if (d.fmt) { S.format = d.fmt; resize(); }
        if (d.filter) { const f = FILTERS[d.filter]; Object.assign(S, { filter: d.filter, b: f.b, c: f.c, s: f.s, extra: f.extra }); }
        if (d.speed) S.speed = +d.speed, video.playbackRate = S.speed;
        if (d.a === 'startHere') S.start = Math.min(video.currentTime, S.end - .3);
        if (d.a === 'endHere') S.end = Math.max(video.currentTime, S.start + .3);
        if (d.a === 'resetTrim') S.start = 0, S.end = dur;
        if (d.a === 'addText') { S.items.push({ kind: 'text', text: 'Your text', x: .5, y: .2, size: .09, color: '#ffffff', font: 'Impact', stroke: true, bg: false, from: S.start, to: S.end }); S.sel = S.items.length - 1; }
        if (d.sticker) { S.items.push({ kind: 'sticker', text: d.sticker, x: .5 + (Math.random() - .5) * .3, y: .5 + (Math.random() - .5) * .3, size: .14, from: S.start, to: S.end }); S.sel = S.items.length - 1; }
        if (d.i !== undefined && !d.del) S.sel = +d.i;
        if (d.del !== undefined) { S.items.splice(+d.del, 1); S.sel = -1; }
        if (d.font) S.items[S.sel].font = d.font;
        if (d.color) S.items[S.sel].color = d.color;
        if (d.tog) S.items[S.sel][d.tog] = !S.items[S.sel][d.tog];
        if (d.tog2) { S[d.tog2] = !S[d.tog2]; video.muted = S.muted; }
        renderPanel(); draw(); updTimeline();
      });
      panel.addEventListener('click', (e) => { const row = e.target.closest('.ce-item'); if (row && !e.target.dataset.del) { S.sel = +row.dataset.i; renderPanel(); draw(); } });
      root.querySelector('.ce-tabs').addEventListener('click', (e) => {
        const t = e.target.dataset.tab; if (!t) return;
        S_tab = t; root.querySelectorAll('.ce-tab').forEach(b => b.classList.toggle('on', b === e.target));
        if (t !== 'Text' && t !== 'Stickers') S.sel = -1;
        renderPanel(); draw();
      });

      function close(result) {
        cancelAnimationFrame(raf); video.pause();
        root.remove(); URL.revokeObjectURL(srcUrl);
        resolve(result);
      }

      // ---- export: replay the edit into a canvas + recorder ----
      async function exportClip() {
        pause();
        const untouched = S.start < .05 && S.end > dur - .05 && S.format === 'original' && S.zoom === 1 && S.filter === 'None' && !S.items.length && S.speed === 1 && !S.muted && S.volume === 1;
        if (untouched) return close({ blob, title: S.title });
        const mime = pickMime();
        if (!mime || !cv.captureStream) { alert('This browser can\'t export edited videos. Try Chrome, Edge or Safari 15+.'); return; }
        const ov = document.createElement('div');
        ov.className = 'ce-export';
        ov.innerHTML = '<b>Making your clip…</b><div class="ce-bar"><i></i></div><span class="ce-note">Keep this tab open</span>';
        root.appendChild(ov);
        const bar = ov.querySelector('i');
        const [W, H] = outSize();
        const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
        const octx = oc.getContext('2d');
        const vstream = oc.captureStream(30);
        let ac = null, dest = null;
        try {
          ac = new (window.AudioContext || window.webkitAudioContext)();
          const src = ac.createMediaElementSource(video);
          const g = ac.createGain(); g.gain.value = S.muted ? 0 : S.volume;
          dest = ac.createMediaStreamDestination();
          src.connect(g).connect(dest);
          dest.stream.getAudioTracks().forEach(tr => vstream.addTrack(tr));
        } catch {}
        const rec = new MediaRecorder(vstream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
        const chunks = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        const done = new Promise(r => { rec.onstop = r; });
        video.muted = false; video.playbackRate = S.speed; video.currentTime = S.start;
        await new Promise(r => { video.onseeked = () => { video.onseeked = null; r(); }; });
        cancelAnimationFrame(raf);
        rec.start(250);
        await video.play().catch(() => {});
        await new Promise(r => {
          const tick = () => {
            draw(octx, W, H, video.currentTime);
            bar.style.width = Math.min(100, (video.currentTime - S.start) / (S.end - S.start) * 100) + '%';
            if (video.currentTime >= S.end || video.ended) return r();
            requestAnimationFrame(tick);
          };
          tick();
        });
        video.pause(); rec.stop(); await done;
        try { ac && ac.close(); } catch {}
        const out = new Blob(chunks, { type: mime.split(';')[0] });
        close({ blob: out, title: S.title });
      }

      root.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (a === 'cancel') close(null);
        if (a === 'export') exportClip();
        if (a === 'play') video.paused ? play() : pause();
      });
      resize(); renderPanel(); updTimeline();
      video.currentTime = 0.001;
      raf = requestAnimationFrame(loop);
    });
  }
  window.US2ClipEditor = { open };
})();
