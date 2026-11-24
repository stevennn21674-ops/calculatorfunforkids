/* UnStevened Social — calls: 1-on-1 and group (mesh, device-to-device over your Wi-Fi, no relay server).
   The server only passes the connection setup notes; voice/video never touches Netlify (= no credits). */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const I = USI.icon, api = USS.api;
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  let C = null; // current call state

  // ------------------------------------------------ permission popup (Safari needs a tap before mic/camera)
  function ensurePerms(video) {
    return new Promise((res, rej) => {
      const go = async () => {
        try { res(await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false })); }
        catch (e) {
          if (video) { try { return res(await navigator.mediaDevices.getUserMedia({ audio: true })); } catch {} }
          rej(new Error(e.name === 'NotAllowedError' ? 'Mic access was blocked. Allow it in your browser settings (Safari: aA → Website Settings).' : 'No microphone found.'));
        }
      };
      if (!navigator.mediaDevices?.getUserMedia) return rej(new Error('Calls need a secure (https) page.'));
      if (localStorage.getItem('uss_perm_ok')) return go();
      const d = document.createElement('div'); d.className = 'perm';
      d.innerHTML = `<div class="gate-box">${USI.logo(64)}<h3>Allow ${video ? 'camera & mic' : 'your mic'}</h3><p>Your browser will ask next. Calls go straight between devices on your Wi-Fi.</p><button class="btn" id="pOk">Continue</button><button class="btn ghost" id="pNo">Not now</button></div>`;
      document.body.appendChild(d);
      $('#pOk', d).onclick = () => { d.remove(); localStorage.setItem('uss_perm_ok', '1'); go(); };
      $('#pNo', d).onclick = () => { d.remove(); rej(new Error('cancelled')); };
    });
  }

  // ------------------------------------------------ sounds (all synthesized here — no audio files to download)
  // ------------------------------------------------ sound engine (everything synthesized here: no files, no credits)
  let AC, OUT;
  const ac = () => { if (!AC) { AC = new (window.AudioContext || window.webkitAudioContext)(); const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; OUT = AC.createGain(); OUT.gain.value = .55; OUT.connect(comp); comp.connect(AC.destination); } if (AC.state === 'suspended') AC.resume(); return AC; };
  const out = () => (ac(), OUT);
  function env(g, t, a, peak, d, end = .0001) { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(end, t + a + d); }
  function osc(type, f, t, dur, peak = .3, opts = {}) {
    const a = ac(), o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.slide || dur));
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.vib) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = opts.vib; lg.gain.value = opts.vibAmt || 8; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); }
    let node = o; if (opts.lp || opts.bp || opts.hp) { const fl = a.createBiquadFilter(); fl.type = opts.lp ? 'lowpass' : opts.bp ? 'bandpass' : 'highpass'; fl.frequency.value = opts.lp || opts.bp || opts.hp; fl.Q.value = opts.q || 1; o.connect(fl); node = fl; }
    node.connect(g); g.connect(opts.dest || out()); env(g, t, opts.att || .005, peak, dur); o.start(t); o.stop(t + dur + .05);
  }
  function noise(t, dur, peak = .3, opts = {}) {
    const a = ac(), len = Math.ceil(a.sampleRate * dur), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); src.buffer = b;
    f.type = opts.type || 'lowpass'; f.frequency.setValueAtTime(opts.f || 8000, t); if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur); f.Q.value = opts.q || .7;
    src.connect(f); f.connect(g); g.connect(out()); env(g, t, opts.att || .002, peak, dur); src.start(t); src.stop(t + dur + .05);
  }
  const T = () => ac().currentTime + .02;
  const SOUNDS = {
    airhorn: () => { const t = T(); [0, .32, .64].forEach((d, i) => [466, 470, 233, 699].forEach(f => osc('sawtooth', f, t + d, i === 2 ? 1.1 : .26, .09, { bp: 1400, q: .6, att: .01 }))); },
    boom: () => { const t = T(); osc('sine', 110, t, 1.6, .9, { to: 38, slide: .5 }); osc('triangle', 220, t, .5, .35, { to: 60, slide: .3 }); noise(t, .25, .35, { f: 900, to: 120 }); },
    sadtrombone: () => { const t = T(); [[311, .45], [294, .45], [277, .45], [262, 1.4]].reduce((d, [f, len]) => { osc('sawtooth', f, t + d, len, .18, { lp: 1100, att: .05, vib: len > 1 ? 5 : 0, vibAmt: 6 }); osc('sawtooth', f * 1.005, t + d, len, .1, { lp: 900, att: .05 }); return d + len * .95; }, 0); },
    rimshot: () => { const t = T(); noise(t, .12, .5, { type: 'bandpass', f: 1800 }); osc('triangle', 180, t, .12, .5, { to: 90 }); noise(t + .28, .1, .45, { type: 'bandpass', f: 2000 }); osc('triangle', 140, t + .28, .12, .45, { to: 70 }); noise(t + .6, 1.4, .3, { type: 'highpass', f: 6000 }); osc('sine', 60, t + .6, .6, .6, { to: 40 }); },
    scratch: () => { const t = T(); for (let i = 0; i < 3; i++) noise(t + i * .12, .11, .5, { type: 'bandpass', f: i % 2 ? 600 : 2500, to: i % 2 ? 2500 : 500, q: 4 }); },
    bruh: () => { const t = T(); [700, 1100].forEach(bp => osc('sawtooth', 120, t, .65, .3, { bp, q: 6, to: 95, slide: .6, att: .03 })); osc('sawtooth', 120, t, .65, .12, { lp: 400, to: 95 }); },
    fart: () => { const t = T(); osc('square', 95, t, .7, .25, { lp: 300, to: 60, vib: 23, vibAmt: 25 }); noise(t, .6, .15, { f: 400, to: 150 }); },
    explosion: () => { const t = T(); noise(t, 2.8, .9, { f: 3000, to: 60 }); osc('sine', 70, t, 1.8, .8, { to: 25 }); noise(t + .05, .4, .5, { type: 'highpass', f: 2500 }); },
    siren: () => { const t = T(); for (let i = 0; i < 6; i++) osc('square', i % 2 ? 960 : 770, t + i * .38, .36, .07, { lp: 2400 }); },
    nuke: () => { const t = T(); for (let i = 0; i < 6; i++) osc('square', 440, t + i * .5, .35, .08, { to: 880, lp: 2200 }); setTimeout(() => SOUNDS.explosion(), 3000); },
    boing: () => { const t = T(); osc('sine', 150, t, .9, .5, { to: 600, slide: .25, vib: 18, vibAmt: 60 }); },
    laser: () => { const t = T(); for (let i = 0; i < 3; i++) { osc('sawtooth', 2200, t + i * .14, .2, .12, { to: 180, lp: 3000 }); osc('square', 1100, t + i * .14, .2, .06, { to: 90 }); } },
    coin: () => { const t = T(); osc('square', 988, t, .09, .12); osc('square', 1319, t + .08, .45, .12); },
    victory: () => { const t = T(); [523, 659, 784, 1047, 784, 1047].forEach((f, i) => osc('square', f, t + i * .12, i === 5 ? .7 : .14, .1, { lp: 3500 })); [262, 330, 392].forEach(f => osc('triangle', f, t + .6, .9, .15)); },
    wrong: () => { const t = T(); osc('sawtooth', 150, t, .35, .25, { lp: 900 }); osc('sawtooth', 110, t + .4, .9, .25, { lp: 700 }); },
    correct: () => { const t = T(); osc('sine', 880, t, .5, .3); osc('sine', 1320, t + .12, .8, .25); },
    crickets: () => { const t = T(); for (let i = 0; i < 10; i++) { const d = t + Math.floor(i / 2) * .55 + (i % 2) * .08; osc('sine', 4300, d, .05, .06, { vib: 60, vibAmt: 300 }); } },
    whip: () => { const t = T(); noise(t, .05, .2, { type: 'highpass', f: 1500, to: 6000 }); noise(t + .12, .06, .9, { type: 'highpass', f: 3500 }); },
    drumroll: () => { const t = T(); for (let i = 0; i < 28; i++) noise(t + i * .055, .07, .2 + i * .01, { type: 'bandpass', f: 1600 }); noise(t + 1.6, 1.6, .4, { type: 'highpass', f: 5000 }); osc('sine', 70, t + 1.6, .5, .7, { to: 40 }); },
    glass: () => { const t = T(); noise(t, .5, .6, { type: 'highpass', f: 3000 }); for (let i = 0; i < 9; i++) osc('sine', 2500 + Math.random() * 3500, t + .05 + Math.random() * .6, .25, .1); },
    heartbeat: () => { const t = T(); for (let i = 0; i < 4; i++) { osc('sine', 60, t + i * .8, .18, .9, { to: 40 }); osc('sine', 55, t + i * .8 + .22, .2, .7, { to: 38 }); } },
    applause: () => { const t = T(); for (let i = 0; i < 140; i++) noise(t + Math.random() * 2.4, .025, .15 + Math.random() * .15, { type: 'bandpass', f: 1500 + Math.random() * 2500, q: 1.5 }); },
    spooky: () => { const t = T(); osc('sine', 330, t, 2.4, .25, { to: 660, slide: 1.2, vib: 6, vibAmt: 20, att: .3 }); osc('sine', 494, t + .4, 2, .12, { to: 247, vib: 5, vibAmt: 15, att: .3 }); },
    bonk: () => { const t = T(); osc('square', 380, t, .18, .3, { to: 120, lp: 1800 }); noise(t, .06, .5, { type: 'bandpass', f: 2500 }); osc('sine', 200, t, .3, .4, { to: 90 }); },
    dialup: () => { const t = T(); osc('sine', 1650, t, .4, .12); osc('sine', 1850, t + .4, .3, .12); osc('square', 2100, t + .75, .25, .05); noise(t + 1, 1.2, .2, { type: 'bandpass', f: 2200, q: 2 }); osc('sine', 980, t + 1.2, .8, .08, { vib: 30, vibAmt: 400 }); },
    jumpscare: () => {
      const a = ac(), t = T(), bp = a.createBiquadFilter(), rough = a.createGain(), env2 = a.createGain(), am = a.createOscillator(), amg = a.createGain();
      bp.type = 'bandpass'; bp.frequency.setValueAtTime(2200, t); bp.frequency.linearRampToValueAtTime(3000, t + .2); bp.Q.value = .45;
      am.type = 'square'; am.frequency.value = 72; amg.gain.value = .55; rough.gain.value = .45; am.connect(amg); amg.connect(rough.gain); // "roughness"
      bp.connect(rough); rough.connect(env2); env2.connect(OUT);
      env2.gain.setValueAtTime(.0001, t); env2.gain.exponentialRampToValueAtTime(1.6, t + .004); env2.gain.setValueAtTime(1.6, t + 1.0); env2.gain.exponentialRampToValueAtTime(.0001, t + 1.6);
      [740, 1047, 1480, 2093, 2960, 3520].forEach(f => { const o = a.createOscillator(); o.type = 'sawtooth'; o.detune.value = (Math.random() - .5) * 60; o.frequency.setValueAtTime(f * .85, t); o.frequency.linearRampToValueAtTime(f * 1.12, t + .12); o.frequency.linearRampToValueAtTime(f * .97, t + 1.5); o.connect(bp); o.start(t); o.stop(t + 1.65); });
      const len = a.sampleRate * 1.6, nb = a.createBuffer(1, len, a.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
      const ns = a.createBufferSource(); ns.buffer = nb; const ng = a.createGain(); ng.gain.value = .7; ns.connect(ng); ng.connect(bp); ns.start(t); am.start(t); am.stop(t + 1.65);
      osc('sine', 90, t, .7, 1, { to: 30 }); noise(t, .15, 1, { f: 4000, to: 300 });
    },
    ding: () => { const t = T(); [1568, 2093].forEach((f, i) => osc('sine', f, t + i * .02, 1.2, .2 - i * .08)); },
    slideup: () => { const t = T(); osc('sine', 300, t, .7, .35, { to: 2200, vib: 6, vibAmt: 15 }); },
    slidedown: () => { const t = T(); osc('sine', 2000, t, .9, .35, { to: 250, vib: 6, vibAmt: 15 }); },
    kazoo: () => { const t = T(); [392, 440, 392, 330, 392].forEach((f, i) => osc('sawtooth', f, t + i * .2, .22, .15, { bp: 1200, q: 3, vib: 9, vibAmt: 10, att: .02 })); },
    carhorn: () => { const t = T(); [0, .35].forEach(d => [392, 494].forEach(f => osc('square', f, t + d, d ? .6 : .25, .09, { lp: 2500 }))); },
    clownhorn: () => { const t = T(); [0, .22].forEach(d => { osc('sawtooth', 520, t + d, .18, .18, { to: 640, bp: 1500, q: 2 }); noise(t + d, .1, .15, { type: 'bandpass', f: 2500 }); }); },
    doorbell: () => { const t = T(); osc('sine', 659, t, 1.1, .3); osc('sine', 1318, t, .6, .08); osc('sine', 523, t + .55, 1.6, .3); osc('sine', 1046, t + .55, .8, .08); },
    phonering: () => { const t = T(); for (let i = 0; i < 2; i++) for (let k = 0; k < 20; k++) osc('sine', k % 2 ? 480 : 440, t + i * .9 + k * .03, .035, .18); },
    cash: () => { const t = T(); noise(t, .05, .4, { type: 'highpass', f: 4000 }); [2637, 3136].forEach((f, i) => osc('sine', f, t + .08 + i * .06, .7, .18)); osc('triangle', 200, t + .02, .08, .3, { to: 100 }); },
    evillaugh: () => { const t = T(); [0, .2, .4, .6, .85].forEach((d, i) => [600, 1000].forEach(bp => osc('sawtooth', 150 - i * 8, t + d, .16, .22, { bp, q: 5, att: .01 }))); },
    groan: () => { const t = T(); [500, 800].forEach(bp => osc('sawtooth', 95, t, 2, .25, { bp, q: 4, to: 70, att: .3, vib: 4, vibAmt: 6 })); },
    thunder: () => { const t = T(); noise(t, .2, .7, { type: 'highpass', f: 1500 }); noise(t + .05, 3, .8, { f: 400, to: 60 }); osc('sine', 45, t + .1, 2.5, .6); },
    tick: () => { const t = T(); for (let i = 0; i < 8; i++) noise(t + i * .5, .015, .6, { type: 'bandpass', f: i % 2 ? 2500 : 3200, q: 8 }); },
    gameover: () => { const t = T(); [494, 466, 440, 415].forEach((f, i) => osc('square', f, t + i * .35, .33, .12, { lp: 2000 })); osc('square', 392, t + 1.4, 1.1, .12, { lp: 1600, vib: 5, vibAmt: 8 }); },
    levelup: () => { const t = T(); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => osc('square', f, t + i * .07, .12, .1)); osc('triangle', 2093, t + .42, .6, .15); },
    boxingbell: () => { const t = T(); for (let i = 0; i < 3; i++) [1200, 1830, 2650].forEach((f, k) => osc('sine', f, t + i * .45, 1.4, .25 / (k + 1))); },
    pop: () => { const t = T(); osc('sine', 900, t, .08, .5, { to: 200 }); noise(t, .03, .4, { type: 'bandpass', f: 3000 }); },
    robot: () => { const t = T(); for (let i = 0; i < 8; i++) osc('square', 200 + Math.random() * 700, t + i * .09, .08, .1, { lp: 2400 }); },
    waterdrop: () => { const t = T(); osc('sine', 600, t, .15, .4, { to: 1600, slide: .06 }); osc('sine', 1400, t + .1, .2, .15, { to: 900 }); },
    zap: () => { const t = T(); noise(t, .4, .5, { type: 'bandpass', f: 4000, q: 2 }); osc('sawtooth', 60, t, .4, .3, { vib: 50, vibAmt: 40 }); },
    yeet: () => { const t = T(); osc('sawtooth', 250, t, .5, .25, { bp: 1500, q: 2, to: 1200, slide: .3 }); noise(t + .1, .4, .2, { type: 'bandpass', f: 1500, to: 6000 }); }
  };
  const SOUND_LIST = [['airhorn', 'Air horn'], ['boom', 'Boom'], ['sadtrombone', 'Sad trombone'], ['rimshot', 'Ba dum tss'], ['scratch', 'Record scratch'], ['bruh', 'Bruh'], ['fart', 'Fart'], ['explosion', 'Explosion'], ['siren', 'Siren'], ['nuke', 'Nuke alarm'], ['boing', 'Boing'], ['laser', 'Pew pew'], ['coin', 'Coin'], ['victory', 'Victory'], ['wrong', 'Wrong buzzer'], ['correct', 'Correct!'], ['crickets', 'Crickets'], ['whip', 'Whip'], ['drumroll', 'Drumroll'], ['glass', 'Glass break'], ['heartbeat', 'Heartbeat'], ['applause', 'Applause'], ['spooky', 'Spooky'], ['bonk', 'Bonk'], ['dialup', 'Dial-up'], ['ding', 'Ding'], ['jumpscare', 'Scream'], ['slideup', 'Slide whistle up'], ['slidedown', 'Slide whistle down'], ['kazoo', 'Kazoo'], ['carhorn', 'Car horn'], ['clownhorn', 'Clown horn'], ['doorbell', 'Doorbell'], ['phonering', 'Phone ring'], ['cash', 'Cha-ching'], ['evillaugh', 'Evil laugh'], ['groan', 'Zombie groan'], ['thunder', 'Thunder'], ['tick', 'Clock tick'], ['gameover', 'Game over'], ['levelup', 'Level up'], ['boxingbell', 'Boxing bell'], ['pop', 'Pop'], ['robot', 'Robot'], ['waterdrop', 'Water drop'], ['zap', 'Zap'], ['yeet', 'Yeet']];
  function tone(freqs, dur, type = 'sine', vol = .25, slide) { const t = T(); for (const f of [].concat(freqs)) osc(type, f, t, dur, vol, slide ? { to: slide } : {}); }
  let ringT = 0;
  function ringtone(on) { clearInterval(ringT); if (on) { const r = () => { tone([660, 880], .25, 'sine', .15); setTimeout(() => tone([660, 880], .25, 'sine', .15), 320); }; r(); ringT = setInterval(r, 2200); } }

  // ------------------------------------------------ troll effects (shown on everyone's screen)
  const callEl = () => $('#call'), gridEl = () => $('#call .grid');
  function overlay(html, ms, css = '') { const o = document.createElement('div'); o.style.cssText = 'position:fixed;inset:0;z-index:96;pointer-events:none;' + css; o.innerHTML = html; document.body.appendChild(o); setTimeout(() => o.remove(), ms); return o; }
  const anim = (el, frames, ms, opts = {}) => el?.animate(frames, { duration: ms, ...opts });
  const COLORS = ['#ff3d78', '#7c5cff', '#ffb03b', '#22c55e', '#5cc8ff', '#fff'];
  const EFFECTS = {
    shake: () => anim(callEl(), [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ transform: `translate(${(Math.random() - .5) * 24}px,${(Math.random() - .5) * 18}px) rotate(${(Math.random() - .5) * 3}deg)` })), 900),
    earthquake: () => { SOUNDS.explosion(); anim(callEl(), Array.from({ length: 40 }, (_, i) => ({ transform: `translate(${(Math.random() - .5) * 40 * (1 - i / 40)}px,${(Math.random() - .5) * 30 * (1 - i / 40)}px)` })), 3000); },
    flip: () => callEl().classList.toggle('flip'),
    mirror: () => { const g = gridEl(); g.style.transform = g.style.transform ? '' : 'scaleX(-1)'; },
    spin: () => anim(gridEl(), [{ transform: 'rotate(0)' }, { transform: 'rotate(720deg)' }], 1500, { easing: 'ease-in-out' }),
    blur: () => anim(gridEl(), [{ filter: 'blur(0)' }, { filter: 'blur(14px)' }, { filter: 'blur(14px)' }, { filter: 'blur(0)' }], 3500),
    invert: () => anim(callEl(), [{ filter: 'invert(0)' }, { filter: 'invert(1) hue-rotate(180deg)' }, { filter: 'invert(1) hue-rotate(180deg)' }, { filter: 'invert(0)' }], 3500),
    tiny: () => anim(gridEl(), [{ transform: 'scale(1)' }, { transform: 'scale(.2)' }, { transform: 'scale(.2)' }, { transform: 'scale(1)' }], 3000),
    zoom: () => anim(gridEl(), [{ transform: 'scale(1)' }, { transform: 'scale(2.6)' }, { transform: 'scale(2.6)' }, { transform: 'scale(1)' }], 3000),
    rainbow: () => anim(callEl(), Array.from({ length: 13 }, (_, i) => ({ filter: `hue-rotate(${i * 60}deg) saturate(3)` })), 4000),
    drunk: () => anim(gridEl(), Array.from({ length: 16 }, (_, i) => ({ transform: `skew(${Math.sin(i) * 12}deg,${Math.cos(i) * 6}deg) rotate(${Math.sin(i * 1.3) * 6}deg)` })), 5000),
    glitch: () => anim(gridEl(), Array.from({ length: 24 }, () => ({ transform: `translate(${(Math.random() - .5) * 30}px,0) skewX(${(Math.random() - .5) * 20}deg)`, filter: `hue-rotate(${Math.random() * 360}deg) contrast(${1 + Math.random() * 2})` })), 1600),
    disco: () => { const o = overlay('', 4500, 'mix-blend-mode:screen'); let i = 0; const t = setInterval(() => { o.style.background = `radial-gradient(circle at ${Math.random() * 100}% ${Math.random() * 100}%, ${COLORS[i++ % 5]}aa, transparent 60%)`; }, 400); setTimeout(() => clearInterval(t), 4500); },
    lightsout: () => overlay('<div style="position:absolute;inset:0;background:#000;display:grid;place-items:center;color:#333;font:700 20px system-ui">lights out</div>', 3500),
    flash: () => { SOUNDS.boom(); overlay('', 1200, 'background:#fff;animation:fadeout 1.2s forwards'); },
    freeze: () => { const vs = $$('#call video'); vs.forEach(v => v.pause()); const o = overlay('<div style="position:absolute;top:40%;width:100%;text-align:center;color:#fff;font:800 24px system-ui;text-shadow:0 2px 8px #000">Video frozen…</div>', 3000); setTimeout(() => vs.forEach(v => v.play().catch(() => {})), 3000); },
    disconnect: () => overlay(`<div style="position:absolute;inset:0;background:#000d;display:grid;place-items:center;color:#fff;font:600 18px system-ui;text-align:center"><div><div style="width:44px;height:44px;margin:0 auto 14px;border:4px solid #fff3;border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite"></div>Connection lost<br><small style="color:#aaa">Reconnecting…</small></div></div>`, 4000),
    crash: () => overlay(`<div style="position:absolute;inset:0;background:#1d3fbf;color:#fff;font:500 18px/1.5 system-ui;padding:12vh 10vw"><div style="font-size:90px;font-weight:300">:(</div>Your call ran into a problem and needs to restart.<br><br><small>Error: TOO_MUCH_SKILL_ISSUE<br>0% complete</small></div>`, 4500),
    battery: () => overlay(`<div style="position:absolute;top:30%;left:50%;transform:translateX(-50%);background:#222;color:#fff;border-radius:18px;padding:18px 22px;font:600 16px system-ui;text-align:center;box-shadow:0 20px 50px #000a;width:270px">Low Battery<br><small style="color:#aaa;font-weight:400">1% battery remaining</small></div>`, 3500),
    crack: () => { SOUNDS.glass(); overlay(`<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%"><g stroke="#fff" stroke-width=".35" fill="none" opacity=".9"><path d="M55 45 L20 10 M55 45 L90 5 M55 45 L98 60 M55 45 L70 98 M55 45 L5 70 M55 45 L35 98 M55 45 L2 35"/><path d="M40 30 L48 22 M70 30 L78 40 M75 70 L62 76 M30 60 L22 50 M45 70 L38 80"/><circle cx="55" cy="45" r="3"/></g></svg>`, 5000); },
    matrix: () => { const o = overlay('<canvas style="width:100%;height:100%"></canvas>', 5000, 'background:#000c'); const c = $('canvas', o), x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight; const cols = Array(Math.floor(c.width / 16)).fill(0); const t = setInterval(() => { x.fillStyle = '#0003'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#22c55e'; x.font = '16px monospace'; cols.forEach((y, i) => { x.fillText(String.fromCharCode(0x30A0 + Math.random() * 96), i * 16, y); cols[i] = y > c.height && Math.random() > .97 ? 0 : y + 16; }); }, 50); setTimeout(() => clearInterval(t), 5000); },
    confetti: () => { const o = overlay('', 4500); for (let i = 0; i < 90; i++) { const p = document.createElement('i'); p.style.cssText = `position:absolute;top:-20px;left:${Math.random() * 100}%;width:${6 + Math.random() * 6}px;height:${10 + Math.random() * 8}px;background:${COLORS[i % 6]};border-radius:2px`; o.appendChild(p); p.animate([{ transform: 'translateY(0) rotate(0)' }, { transform: `translate(${(Math.random() - .5) * 200}px,${innerHeight + 40}px) rotate(${Math.random() * 1080}deg)` }], { duration: 2000 + Math.random() * 2000, delay: Math.random() * 600, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' }); } },
    jumpscare: () => { SOUNDS.jumpscare(); overlay(`<svg viewBox="0 0 100 100" style="width:100%;height:100%;background:#000"><ellipse cx="50" cy="55" rx="34" ry="40" fill="#e8e3d9"/><ellipse cx="37" cy="45" rx="8" ry="11" fill="#000"/><ellipse cx="63" cy="45" rx="8" ry="11" fill="#000"/><circle cx="37" cy="46" r="2" fill="#f00"/><circle cx="63" cy="46" r="2" fill="#f00"/><path d="M33 72 Q50 95 67 72 Q50 82 33 72z" fill="#000"/></svg>`, 900); anim(callEl(), [{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], 400); },
    nuke: () => { SOUNDS.nuke(); const o = overlay('<div style="position:absolute;inset:0;display:grid;place-items:center;font:900 120px system-ui;color:#ff3d3d;text-shadow:0 0 30px #f00"></div>', 3600); const d = $('div', o); [3, 2, 1].forEach((n, i) => setTimeout(() => d.textContent = n, i * 1000)); setTimeout(() => { overlay('', 1500, 'background:#fff;transition:opacity 1.5s'); EFFECTS.earthquake(); }, 3000); },
    rain: (what = 'spark') => { const o = overlay('', 5000); for (let i = 0; i < 40; i++) { const e = document.createElement('i'); e.style.cssText = `position:absolute;top:-40px;left:${Math.random() * 100}%;color:${COLORS[i % 5]}`; e.innerHTML = I(what, 22 + Math.random() * 26); o.appendChild(e); e.animate([{ transform: 'translateY(0) rotate(0)' }, { transform: `translateY(${innerHeight + 60}px) rotate(540deg)` }], { duration: 1600 + Math.random() * 2000, delay: Math.random() * 1200, fill: 'forwards' }); } },
    police: () => { const o = overlay('', 4000); let i = 0; const t = setInterval(() => { o.style.background = i++ % 2 ? 'linear-gradient(90deg,#f003,transparent 50%)' : 'linear-gradient(270deg,#00f3,transparent 50%)'; }, 400); setTimeout(() => clearInterval(t), 4000); SOUNDS.siren(); },
    snow: () => { const o = overlay('', 6000); for (let i = 0; i < 70; i++) { const f = document.createElement('i'); const sz = 3 + Math.random() * 6; f.style.cssText = `position:absolute;top:-10px;left:${Math.random() * 100}%;width:${sz}px;height:${sz}px;border-radius:50%;background:#fff;opacity:${.5 + Math.random() * .5}`; o.appendChild(f); f.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${(Math.random() - .5) * 120}px,${innerHeight + 20}px)` }], { duration: 3000 + Math.random() * 3000, delay: Math.random() * 2000, fill: 'forwards' }); } },
    bubbles: () => { SOUNDS.pop(); const o = overlay('', 5000); for (let i = 0; i < 30; i++) { const b = document.createElement('i'); const sz = 20 + Math.random() * 50; b.style.cssText = `position:absolute;bottom:-60px;left:${Math.random() * 100}%;width:${sz}px;height:${sz}px;border-radius:50%;border:2px solid #fff8;background:radial-gradient(circle at 30% 30%,#fff6,#5cc8ff22)`; o.appendChild(b); b.animate([{ transform: 'translateY(0)' }, { transform: `translate(${(Math.random() - .5) * 100}px,-${innerHeight + 80}px)` }], { duration: 2500 + Math.random() * 2500, delay: Math.random() * 1500, fill: 'forwards' }); } },
    fire: () => overlay('<div style="position:absolute;left:0;right:0;bottom:0;height:45%;background:linear-gradient(transparent,#ff3d0066 40%,#ffb03bcc);filter:blur(8px);animation:pulse 0.6s infinite alternate"></div>', 4000),
    blackhole: () => anim(gridEl(), [{ transform: 'scale(1) rotate(0)', filter: 'blur(0)' }, { transform: 'scale(0) rotate(1080deg)', filter: 'blur(6px)', offset: .5 }, { transform: 'scale(0) rotate(1080deg)', offset: .7 }, { transform: 'scale(1) rotate(0)' }], 4000, { easing: 'ease-in-out' }),
    tornado: () => anim(gridEl(), Array.from({ length: 20 }, (_, i) => ({ transform: `rotate(${i * 90}deg) scale(${1 - Math.sin(i / 19 * Math.PI) * .6}) translateX(${Math.sin(i) * 40}px)` })), 3000),
    jelly: () => anim(gridEl(), [{ transform: 'scale(1,1)' }, { transform: 'scale(1.25,.75)' }, { transform: 'scale(.75,1.25)' }, { transform: 'scale(1.15,.85)' }, { transform: 'scale(.95,1.05)' }, { transform: 'scale(1,1)' }], 1000),
    gray: () => anim(callEl(), [{ filter: 'grayscale(0)' }, { filter: 'grayscale(1) contrast(1.3)' }, { filter: 'grayscale(1) contrast(1.3)' }, { filter: 'grayscale(0)' }], 5000),
    oldfilm: () => { anim(callEl(), Array.from({ length: 30 }, () => ({ filter: `sepia(1) contrast(1.2) brightness(${.8 + Math.random() * .3})` })), 5000); overlay('<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,#0000 0 3px,#0002 3px 4px)"></div>', 5000); },
    nightvision: () => { anim(callEl(), [{ filter: 'none' }, { filter: 'grayscale(1) brightness(1.4) contrast(1.4) sepia(1) hue-rotate(60deg) saturate(4)' }, { filter: 'grayscale(1) brightness(1.4) contrast(1.4) sepia(1) hue-rotate(60deg) saturate(4)' }, { filter: 'none' }], 5000); overlay('<div style="position:absolute;inset:0;background:radial-gradient(circle,transparent 50%,#000 90%)"></div>', 5000); },
    thermal: () => anim(callEl(), [{ filter: 'none' }, { filter: 'invert(1) hue-rotate(180deg) saturate(6) contrast(1.5)' }, { filter: 'invert(1) hue-rotate(180deg) saturate(6) contrast(1.5)' }, { filter: 'none' }], 4000),
    vhs: () => { overlay('<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,#fff1 0 1px,transparent 1px 3px)"></div><div style="position:absolute;top:14px;left:16px;color:#fff;font:700 22px monospace;text-shadow:2px 0 #f00,-2px 0 #0ff">PLAY &#9654;</div>', 5000); anim(gridEl(), Array.from({ length: 30 }, () => ({ transform: `translateX(${(Math.random() - .5) * 8}px)`, filter: 'saturate(1.6) contrast(1.1)' })), 5000); },
    virus: () => { SOUNDS.wrong(); const o = overlay('', 5000); for (let i = 0; i < 9; i++) setTimeout(() => { const w = document.createElement('div'); w.style.cssText = `position:absolute;left:${Math.random() * 60}%;top:${Math.random() * 70}%;width:240px;background:#eee;color:#111;border:1px solid #888;box-shadow:4px 4px 12px #0008;font:13px system-ui`; w.innerHTML = '<div style="background:#2b56d1;color:#fff;padding:4px 8px;font-weight:700">funny.exe</div><div style="padding:12px">funny.exe has stopped working.<br><br><span style="background:#ddd;border:1px solid #999;padding:2px 14px">OK</span></div>'; o.appendChild(w); SOUNDS.ding(); }, i * 350); },
    update: () => { const o = overlay('<div style="position:absolute;inset:0;background:#0b3a7a;color:#fff;display:grid;place-items:center;text-align:center;font:400 20px system-ui"><div><div style="width:46px;height:46px;margin:0 auto 18px;border:4px solid #fff3;border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite"></div>Working on updates <b>0%</b><br><small style="opacity:.7">Don\'t turn off your device.</small></div></div>', 5000); let p = 0; const t = setInterval(() => { const b = o.querySelector('b'); if (b) b.textContent = (p = Math.min(99, p + Math.floor(Math.random() * 3))) + '%'; }, 300); setTimeout(() => clearInterval(t), 5000); },
    fakeban: () => { SOUNDS.wrong(); overlay(`<div style="position:absolute;inset:0;background:#0b0b12f2;display:grid;place-items:center;text-align:center;color:#fff;font:600 18px system-ui"><div>${I('hammer', 60)}<h2 style="margin:8px 0">You have been banned</h2><small style="color:#aaa">Reason: being too good. (jk)</small></div></div>`, 3500); },
    bounce: () => { const o = overlay(`<div style="position:absolute;width:110px">${USI.logo(110)}</div>`, 7000); const el = o.firstChild; let x = 30, y = 30, dx = 4, dy = 3; const t = setInterval(() => { x += dx; y += dy; if (x < 0 || x > innerWidth - 110) dx *= -1; if (y < 0 || y > innerHeight - 110) dy *= -1; el.style.transform = `translate(${x}px,${y}px)`; }, 16); setTimeout(() => clearInterval(t), 7000); },
    ghost: () => { SOUNDS.spooky(); const o = overlay('<svg viewBox="0 0 60 70" style="position:absolute;width:160px;opacity:.85"><path d="M30 2C14 2 6 14 6 30v38l8-6 8 6 8-6 8 6 8-6 8 6V30C54 14 46 2 30 2z" fill="#fff"/><ellipse cx="22" cy="28" rx="4" ry="6" fill="#000"/><ellipse cx="38" cy="28" rx="4" ry="6" fill="#000"/><ellipse cx="30" cy="44" rx="5" ry="7" fill="#000"/></svg>', 5000); o.firstChild.animate([{ transform: `translate(-200px,${innerHeight * .3}px)` }, { transform: `translate(${innerWidth / 2 - 80}px,${innerHeight * .15}px) scale(1.4)`, offset: .5 }, { transform: `translate(${innerWidth + 200}px,${innerHeight * .35}px)` }], { duration: 5000, fill: 'forwards' }); },
    spiders: () => { const o = overlay('', 6000); for (let i = 0; i < 12; i++) { const sp = document.createElement('div'); sp.innerHTML = `<svg viewBox="0 0 40 40" width="${30 + Math.random() * 30}"><g stroke="#111" stroke-width="2"><path d="M20 20 L4 8 M20 20 L2 20 M20 20 L4 32 M20 20 L8 38 M20 20 L36 8 M20 20 L38 20 M20 20 L36 32 M20 20 L32 38"/></g><ellipse cx="20" cy="20" rx="7" ry="9" fill="#111"/><circle cx="17" cy="14" r="1.4" fill="#f00"/><circle cx="23" cy="14" r="1.4" fill="#f00"/></svg>`; sp.style.cssText = 'position:absolute'; o.appendChild(sp); sp.animate([{ transform: `translate(${Math.random() * innerWidth}px,${innerHeight + 40}px)` }, { transform: `translate(${Math.random() * innerWidth}px,${Math.random() * innerHeight * .6}px) rotate(${Math.random() * 90 - 45}deg)` }, { transform: `translate(${Math.random() * innerWidth}px,-60px)` }], { duration: 4000 + Math.random() * 2000, delay: Math.random() * 1000, fill: 'forwards' }); } },
    typing: (text) => { const o = overlay('<div style="position:absolute;bottom:22%;left:8%;right:8%;font:800 clamp(20px,5vw,40px) monospace;color:#22c55e;text-shadow:0 0 10px #22c55e"></div>', 6000); const d = o.firstChild; const m = text || 'I know what you did...'; let i = 0; const t = setInterval(() => { d.textContent = m.slice(0, ++i) + '_'; if (i % 2) osc('square', 1800, T(), .02, .05); if (i >= m.length) clearInterval(t); }, 90); },
    hearts: () => { const o = overlay('', 3500); for (let i = 0; i < 26; i++) { const h = document.createElement('i'); h.style.cssText = `position:absolute;left:50%;top:55%;color:${COLORS[i % 2 ? 0 : 5]}`; h.innerHTML = I('heart', 26 + Math.random() * 20); o.appendChild(h); const ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 260; h.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist}px) scale(1.2)`, opacity: 0 }], { duration: 1600 + Math.random() * 1200, fill: 'forwards', easing: 'cubic-bezier(.1,.7,.3,1)' }); } },
    msg: (text) => { const o = overlay(`<div style="position:absolute;top:35%;left:5%;right:5%;text-align:center;font:900 clamp(28px,7vw,64px) system-ui;color:#fff;text-shadow:0 4px 20px #ff3d78,0 0 2px #000"></div>`, 3500); $('div', o).textContent = text; anim($('div', o), [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1, offset: .15 }, { transform: 'scale(1)', offset: .25 }, { opacity: 1, offset: .85 }, { opacity: 0 }], 3500); }
  };
  const FX_LIST = [['shake', 'bolt', 'Shake'], ['earthquake', 'bolt', 'Earthquake'], ['flip', 'flip', 'Upside down'], ['mirror', 'flip', 'Mirror'], ['spin', 'spark', 'Spin'], ['blur', 'eyeOff', 'Blur'], ['invert', 'wand', 'Invert'], ['tiny', 'search', 'Shrink'], ['zoom', 'expand', 'Zoom'], ['rainbow', 'star', 'Rainbow'], ['drunk', 'heartBroken', 'Drunk'], ['glitch', 'wand', 'Glitch'], ['disco', 'star', 'Disco'], ['lightsout', 'eyeOff', 'Lights out'], ['flash', 'spark', 'Flashbang'], ['freeze', 'clock', 'Freeze'], ['disconnect', 'wifiOff', 'Fake disconnect'], ['crash', 'close', 'Fake crash'], ['battery', 'bolt', 'Low battery'], ['crack', 'hammer', 'Crack screen'], ['matrix', 'list', 'Matrix'], ['confetti', 'spark', 'Confetti'], ['nuke', 'bolt', 'Nuke'], ['police', 'shield', 'Police'], ['snow', 'spark', 'Snow'], ['bubbles', 'spark', 'Bubbles'], ['fire', 'bolt', 'On fire'], ['blackhole', 'spark', 'Black hole'], ['tornado', 'spark', 'Tornado'], ['jelly', 'heart', 'Jelly'], ['gray', 'eyeOff', 'Black & white'], ['oldfilm', 'video', 'Old film'], ['nightvision', 'eye', 'Night vision'], ['thermal', 'eye', 'Thermal'], ['vhs', 'play', 'VHS'], ['virus', 'close', 'Fake virus'], ['update', 'clock', 'Fake update'], ['fakeban', 'hammer', 'Fake ban'], ['bounce', 'star', 'Bouncing logo'], ['ghost', 'eye', 'Ghost'], ['spiders', 'bolt', 'Spiders'], ['typing', 'edit', 'Creepy typing'], ['hearts', 'heart', 'Hearts burst']];
  // ------------------------------------------------ voice effects (pitch shifter runs right in the browser)
  const PITCH_SRC = `class P extends AudioWorkletProcessor{constructor(o){super();this.r=o.processorOptions.ratio;this.N=2048;this.b=new Float32Array(this.N);this.w=0;this.p=0}
  process(i,o){const a=i[0]&&i[0][0],out=o[0][0];if(!a){return true}const N=this.N,h=N/2;for(let k=0;k<a.length;k++){this.b[this.w]=a[k];this.w=(this.w+1)%N;this.p=(this.p+this.r)%N;
  const p2=(this.p+h)%N,d1=((this.w-this.p)%N+N)%N,d2=((this.w-p2)%N+N)%N,w1=1-Math.abs(d1/h-1),w2=1-Math.abs(d2/h-1);out[k]=this.b[Math.floor(this.p)]*w1+this.b[Math.floor(p2)]*w2}
  for(let c=1;c<o[0].length;c++)o[0][c].set(out);return true}}registerProcessor('uss-pitch',P)`;
  let pitchReady = null;
  const loadPitch = () => pitchReady || (pitchReady = ac().audioWorklet.addModule(URL.createObjectURL(new Blob([PITCH_SRC], { type: 'application/javascript' }))));
  const VOICES = [['none', 'Normal'], ['chipmunk', 'Chipmunk'], ['deep', 'Deep'], ['robot', 'Robot'], ['echo', 'Echo / cave'], ['telephone', 'Telephone'], ['alien', 'Alien'], ['demon', 'Demon']];
  async function buildVoice(src, fx) { // returns the last node of the chain
    const a = ac(); let node = src;
    const pitch = async (r) => { await loadPitch(); const w = new AudioWorkletNode(a, 'uss-pitch', { processorOptions: { ratio: r } }); node.connect(w); node = w; };
    const ring = (f) => { const g = a.createGain(), o = a.createOscillator(); g.gain.value = 0; o.frequency.value = f; o.connect(g.gain); o.start(); node.connect(g); node = g; };
    if (fx === 'chipmunk') await pitch(1.7);
    if (fx === 'deep') await pitch(.68);
    if (fx === 'demon') { await pitch(.55); const d = a.createWaveShaper(); const c = new Float32Array(256).map((_, i) => Math.tanh((i / 128 - 1) * 4)); d.curve = c; node.connect(d); node = d; }
    if (fx === 'robot') ring(55);
    if (fx === 'alien') { await pitch(1.3); ring(30); }
    if (fx === 'telephone') { const hp = a.createBiquadFilter(), lp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500; lp.type = 'lowpass'; lp.frequency.value = 2800; node.connect(hp); hp.connect(lp); node = lp; }
    if (fx === 'echo') { const d = a.createDelay(1), fb = a.createGain(), mix = a.createGain(); d.delayTime.value = .28; fb.gain.value = .45; node.connect(mix); node.connect(d); d.connect(fb); fb.connect(d); d.connect(mix); node = mix; }
    return node;
  }
  let myVoice = 'none', voiceSrc = null;
  async function setMyVoice(fx) { // changes YOUR voice for everyone in the call
    if (!C) return; myVoice = fx;
    const raw = C.rawMic || C.stream.getAudioTracks()[0]; C.rawMic = raw;
    let track = raw;
    if (fx !== 'none') {
      try { voiceSrc?.disconnect(); } catch {}
      voiceSrc = ac().createMediaStreamSource(new MediaStream([raw]));
      const end = await buildVoice(voiceSrc, fx), dest = ac().createMediaStreamDestination(); end.connect(dest);
      track = dest.stream.getAudioTracks()[0]; track.enabled = C.mic;
    }
    C.sendMic = track;
    for (const P of Object.values(C.peers)) { const tx = P.pc.getTransceivers().find(x => x.receiver.track.kind === 'audio'); await tx?.sender.replaceTrack(track).catch(() => {}); }
    USSApp.toast(fx === 'none' ? 'Voice back to normal' : 'Voice: ' + VOICES.find(v => v[0] === fx)[1]);
  }
  const remoteFx = new Map();
  async function applyRemoteVoice(u, fx, ms) { // everyone hears @u with an effect for a bit
    const P = C?.peers[u]; if (!P || !P.stream.getAudioTracks().length) return;
    const au = document.querySelector(`audio.uss-remote[data-u="${CSS.escape(u)}"]`);
    remoteFx.get(u)?.(); const src = ac().createMediaStreamSource(new MediaStream(P.stream.getAudioTracks()));
    const end = await buildVoice(src, fx); end.connect(out()); if (au) au.muted = true;
    const stop = () => { try { src.disconnect(); end.disconnect(); } catch {} if (au) au.muted = false; remoteFx.delete(u); };
    remoteFx.set(u, stop); setTimeout(() => remoteFx.get(u) === stop && stop(), ms || 15000);
  }
  // ------------------------------------------------ shared drawing on everyone's screen
  let drawCv = null, drawOn = false, drawColor = '#ff3d78';
  function drawLayer() {
    if (drawCv && drawCv.isConnected) return drawCv;
    drawCv = document.createElement('canvas'); drawCv.className = 'uss-draw'; drawCv.width = innerWidth; drawCv.height = innerHeight; document.body.appendChild(drawCv);
    return drawCv;
  }
  function paintStroke(pts, color) {
    const cv = drawLayer(), x = cv.getContext('2d'); x.strokeStyle = color; x.lineWidth = 5; x.lineCap = x.lineJoin = 'round';
    x.beginPath(); pts.forEach(([px, py], i) => { const X = px * cv.width, Y = py * cv.height; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.stroke();
    clearTimeout(drawCv.__t); drawCv.__t = setTimeout(() => { if (!drawOn) drawCv?.remove(); }, 9000);
  }
  function toggleDraw(on) {
    drawOn = on; const cv = drawLayer(); cv.style.pointerEvents = on ? 'auto' : 'none'; cv.style.cursor = on ? 'crosshair' : '';
    if (!on) return; let pts = null;
    cv.onpointerdown = e => { if (!drawOn) return; pts = [[e.clientX / cv.width, e.clientY / cv.height]]; };
    cv.onpointermove = e => { if (!pts) return; pts.push([e.clientX / cv.width, e.clientY / cv.height]); paintStroke(pts.slice(-2), drawColor); if (pts.length > 12) { sendAll({ troll: { draw: { pts, color: drawColor } } }); pts = [pts[pts.length - 1]]; } };
    cv.onpointerup = () => { if (pts?.length > 1) sendAll({ troll: { draw: { pts, color: drawColor } } }); pts = null; };
  }
  // ------------------------------------------------ fake nickname (made-up names only — not real users)
  async function setNick(n) {
    n = String(n || '').trim().slice(0, 20);
    if (n) { try { await api('user/' + encodeURIComponent(n.toLowerCase())); return USSApp.toast("That's a real user's name — pick a made-up one.", true); } catch (e) { if (e.status !== 404) return USSApp.toast(e.message, true); } }
    C.nick = n; sendAll({ nick: n }); drawTile(C.me); USSApp.toast(n ? `You're "${n}" in this call` : 'Nickname removed');
  }
  // ------------------------------------------------ party tools
  function showWheel(names, pick) {
    const n = names.length, colors = ['#ff3d78', '#7c5cff', '#ffb03b', '#22c55e', '#5cc8ff', '#f472b6'];
    const slices = names.map((nm, i) => { const a0 = i / n * 2 * Math.PI, a1 = (i + 1) / n * 2 * Math.PI; return `<path d="M50 50 L${50 + 48 * Math.cos(a0)} ${50 + 48 * Math.sin(a0)} A48 48 0 0 1 ${50 + 48 * Math.cos(a1)} ${50 + 48 * Math.sin(a1)}Z" fill="${colors[i % 6]}"/><text x="${50 + 30 * Math.cos((a0 + a1) / 2)}" y="${50 + 30 * Math.sin((a0 + a1) / 2)}" fill="#fff" font-size="${n > 6 ? 4 : 5.5}" font-weight="800" text-anchor="middle" dominant-baseline="middle" transform="rotate(${((a0 + a1) / 2) * 180 / Math.PI} ${50 + 30 * Math.cos((a0 + a1) / 2)} ${50 + 30 * Math.sin((a0 + a1) / 2)})">${esc(nm.slice(0, 10))}</text>`; }).join('');
    const o = overlay(`<div style="position:absolute;inset:0;background:#000b;display:grid;place-items:center"><div style="position:relative;width:min(80vw,380px)"><svg viewBox="0 0 100 100" style="width:100%" class="wheel">${slices}<circle cx="50" cy="50" r="5" fill="#fff"/></svg><div style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);width:0;height:0;border:14px solid transparent;border-top:24px solid #fff"></div><div class="wres" style="text-align:center;color:#fff;font:900 26px system-ui;margin-top:14px;min-height:34px"></div></div></div>`, 7000);
    const target = 360 * 6 + (270 - ((pick + .5) / n) * 360);
    o.querySelector('.wheel').animate([{ transform: 'rotate(0)' }, { transform: `rotate(${target}deg)` }], { duration: 4200, easing: 'cubic-bezier(.15,.7,.2,1)', fill: 'forwards' });
    for (let i = 0; i < 18; i++) setTimeout(() => osc('square', 1400, T(), .02, .05), i * i * 13);
    setTimeout(() => { o.querySelector('.wres').textContent = '🎯 ' + names[pick]; SOUNDS.victory(); }, 4300);
  }
  function bigResult(text, sub) { const o = overlay(`<div style="position:absolute;inset:0;display:grid;place-items:center;background:#0008"><div style="text-align:center;color:#fff"><div style="font:900 clamp(60px,18vw,140px) system-ui;text-shadow:0 6px 30px #7c5cff">${esc(text)}</div><div style="font:700 18px system-ui;opacity:.85">${esc(sub || '')}</div></div></div>`, 3500); anim(o.firstChild.firstChild, [{ transform: 'scale(.2) rotate(-20deg)', opacity: 0 }, { transform: 'scale(1.1) rotate(4deg)', opacity: 1, offset: .25 }, { transform: 'scale(1)' }], 900); }
  let reactRound = null;
  function startReaction(id, delay, host) {
    reactRound = { id, times: {} };
    const o = overlay(`<div class="rg" style="position:absolute;inset:0;background:#b91c1c;display:grid;place-items:center;color:#fff;font:900 30px system-ui;text-align:center;pointer-events:auto;cursor:pointer">Wait for GREEN…</div>`, 12000);
    const box = o.firstChild; let goAt = 0;
    setTimeout(() => { goAt = performance.now(); box.style.background = '#16a34a'; box.textContent = 'TAP NOW!'; SOUNDS.ding(); }, delay);
    box.onclick = () => {
      if (!goAt) { box.textContent = 'Too early!'; return; }
      const ms = Math.round(performance.now() - goAt); box.onclick = null; box.style.background = '#1e1b4b'; box.innerHTML = `${ms} ms<br><small style="font-size:16px">waiting for others…</small>`;
      sendAll({ troll: { react: { id, u: C.nick || C.me, ms } } }); onReact({ id, u: C.nick || C.me, ms }, box);
    };
    reactRound.box = box;
  }
  function onReact(m, box) {
    if (!reactRound || reactRound.id !== m.id) return; reactRound.times[m.u] = m.ms;
    const b = box || reactRound.box; if (!b || !b.isConnected) return;
    const rows = Object.entries(reactRound.times).sort((a, c) => a[1] - c[1]).map(([u, t], i) => `${i === 0 ? '🏆 ' : ''}@${esc(u)} — ${t} ms`).join('<br>');
    b.innerHTML = `<div style="font-size:20px;line-height:1.6">${rows}</div>`;
  }
  function fakeCall(name) {
    SOUNDS.phonering(); const rt = setInterval(() => SOUNDS.phonering(), 2000);
    const o = overlay(`<div style="position:absolute;inset:0;background:linear-gradient(#1e293b,#020617);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:12vh 0 10vh;pointer-events:auto;font-family:system-ui"><div style="text-align:center"><div style="opacity:.7">Incoming call…</div><div style="font-size:36px;font-weight:700;margin-top:8px">${esc(name || 'Unknown')}</div></div><div style="display:flex;gap:70px"><button data-n style="width:72px;height:72px;border-radius:50%;background:#ef4444;color:#fff">${I('end', 30)}</button><button data-y style="width:72px;height:72px;border-radius:50%;background:#22c55e;color:#fff">${I('phone', 30)}</button></div></div>`, 15000);
    const done = (txt) => { clearInterval(rt); o.firstChild.innerHTML = `<div style="margin:auto;font:900 34px system-ui;text-align:center">${txt}</div>`; setTimeout(() => o.remove(), 1500); };
    o.querySelector('[data-n]').onclick = () => done('Declined… they knew 😏'); o.querySelector('[data-y]').onclick = () => { SOUNDS.airhorn(); done('GOTCHA!'); };
    setTimeout(() => clearInterval(rt), 15000);
  }
  function faceOverlay(u, src, ms = 12000) {
    const t = document.querySelector(`.tile[data-u="${CSS.escape(u)}"]`); if (!t) return;
    t.querySelector('.faceimg')?.remove();
    const im = document.createElement('img'); im.className = 'faceimg'; im.src = src; t.appendChild(im); setTimeout(() => im.remove(), ms);
  }
  // ------------------------------------------------ your own uploaded sounds
  let customSounds = []; const sndBuf = new Map();
  async function loadCustom() { try { customSounds = (await api('sounds')).sounds || []; } catch {} return customSounds; }
  async function playCustom(url) {
    if (!/^\/api\/snd\/[a-z0-9]+\/[a-f0-9]{12}$/.test(url || '')) return;
    try {
      let buf = sndBuf.get(url);
      if (!buf) {
        let res; try { const c = await caches.open('uss-snd'); res = await c.match(url); if (!res) { res = await fetch(url); if (res.ok) await c.put(url, res.clone()); } } catch { res = await fetch(url); }
        buf = await ac().decodeAudioData(await res.arrayBuffer()); sndBuf.set(url, buf);
      }
      const src = ac().createBufferSource(); src.buffer = buf; src.connect(out()); src.start();
    } catch (e) { console.warn('sound', e); }
  }
  // ------------------------------------------------ picture jumpscare (the picture goes device to device)
  const jsParts = new Map();
  function showJumpscare(src, snd, url) {
    if (snd === 'custom' && url) playCustom(url); else SOUNDS.jumpscare();
    const o = overlay(`<img src="${src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000">`, 1900, 'background:#000');
    const img = o.firstChild;
    img.animate([{ transform: 'scale(1.6)', filter: 'brightness(2) contrast(1.4)' }, { transform: 'scale(1)', filter: 'brightness(1) contrast(1.4)', offset: .12 }, { transform: 'scale(1.04) translate(-6px,4px)', offset: .2 }, { transform: 'scale(1.02) translate(5px,-4px)', offset: .3 }, { transform: 'scale(1.05) translate(-4px,-3px)', offset: .45 }, { transform: 'scale(1)' }], { duration: 1900 });
    if (navigator.vibrate) navigator.vibrate([400, 100, 400]);
  }
  function onJsChunk(m) {
    const p = jsParts.get(m.id) || { parts: [], n: m.n }; p.parts[m.i] = m.d; jsParts.set(m.id, p);
    if (p.parts.filter(Boolean).length === p.n) { jsParts.delete(m.id); if (m.face) faceOverlay(m.face, p.parts.join('')); else showJumpscare(p.parts.join(''), m.snd, m.url); }
  }
  async function pickFace(victim) { // stick a picture over someone's video for everyone
    const f = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => res(i.files[0]); i.click(); });
    if (!f) return;
    const img = new Image(); img.src = URL.createObjectURL(f); await img.decode().catch(() => {});
    const k = Math.min(1, 600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
    const data = c.toDataURL('image/jpeg', .8), id = Math.random().toString(36).slice(2), size = 15000, n = Math.ceil(data.length / size);
    for (let i = 0; i < n; i++) { sendAll({ troll: { js: { id, i, n, d: data.slice(i * size, (i + 1) * size), face: victim } } }); await new Promise(r => setTimeout(r, 15)); }
    faceOverlay(victim, data); USSApp.toast('Picture stuck on @' + victim);
  }
  async function pickJumpscare(target, snd, url) {
    const f = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => res(i.files[0]); i.click(); });
    if (!f) return;
    const img = new Image(); img.src = URL.createObjectURL(f); await img.decode().catch(() => {});
    const k = Math.min(1, 900 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
    const data = c.toDataURL('image/jpeg', .78), id = Math.random().toString(36).slice(2), size = 15000, n = Math.ceil(data.length / size);
    for (let i = 0; i < n; i++) { const msg = { troll: { js: { id, i, n, d: data.slice(i * size, (i + 1) * size), snd, url } } }; if (target === 'all') sendAll(msg); else sendTo(target, msg); await new Promise(r => setTimeout(r, 15)); }
    USSApp.toast('Jumpscare sent' + (target === 'all' ? ' to everyone' : ' to @' + target));
  }
  function applyTroll(cmd, from) {
    if (cmd.js) return onJsChunk(cmd.js);
    if (cmd.draw) return paintStroke(cmd.draw.pts, cmd.draw.color);
    if (cmd.drawClear) { drawCv?.remove(); drawCv = null; return; }
    if (cmd.voice) return applyRemoteVoice(cmd.voice.u, cmd.voice.fx, cmd.voice.ms);
    if (cmd.tts && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(String(cmd.tts.text || '').slice(0, 200)); u.pitch = cmd.tts.pitch ?? 1; u.rate = cmd.tts.rate ?? 1; u.volume = 1; speechSynthesis.speak(u); return; }
    if (cmd.wheel) return showWheel(cmd.wheel.names, cmd.wheel.pick);
    if (cmd.big) return bigResult(cmd.big.text, cmd.big.sub);
    if (cmd.reactStart) return startReaction(cmd.reactStart.id, cmd.reactStart.delay);
    if (cmd.react) return onReact(cmd.react);
    if (cmd.fakecall) return fakeCall(cmd.fakecall);
    if (cmd.wash) return anim(gridEl(), [{ transform: 'rotate(0)' }, { transform: 'rotate(3600deg)' }], 5000, { easing: 'ease-in-out' });
    if (cmd.csound) return playCustom(cmd.csound);
    if (cmd.sound && SOUNDS[cmd.sound]) SOUNDS[cmd.sound]();
    if (cmd.fx && EFFECTS[cmd.fx]) EFFECTS[cmd.fx](cmd.fx === 'msg' ? String(cmd.arg || '').slice(0, 80) : cmd.arg);
    if (cmd.mute && C) { setMic(false); banner(`An admin (@${from}) muted you`); }
    if (cmd.kick && C) { leave(); USSApp.toast(`An admin (@${from}) kicked you from the call`, true); }
    if (cmd.end && C) { leave(); USSApp.toast(`An admin (@${from}) ended the call`, true); }
  }

  // ------------------------------------------------ ringing
  let ringing = null, ringTimeout = 0;
  function ring(r) {
    if (C || (ringing && ringing.id === r.id)) return;
    ringing = r; ringtone(true); clearTimeout(ringTimeout); ringTimeout = setTimeout(dismissRing, 45000);
    const el = $('#ring'); el.hidden = false;
    el.innerHTML = `${USSApp.av(r.from)}<div class="r-mid"><b>${r.kind === 'group' ? esc(r.gname) : '@' + esc(r.from)}</b><br><small>${r.kind === 'group' ? '@' + esc(r.from) + ' started a group ' : 'Incoming '}${r.video ? 'video' : 'voice'} call</small></div>
      <button class="icon-btn no" id="rNo">${I('end')}</button><button class="icon-btn ok" id="rOk">${I(r.video ? 'video' : 'phone')}</button>`;
    $('#rNo').onclick = () => { api(`call/${r.id}/decline`, { method: 'POST', json: {} }).catch(() => {}); dismissRing(); };
    $('#rOk').onclick = () => { const id = r.id, v = r.video; dismissRing(); join(id, { video: v }); };
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') try { new Notification('UnStevened Social', { body: `@${r.from} is calling you` }); } catch {}
  }
  function dismissRing() { ringtone(false); $('#ring').hidden = true; ringing = null; }

  // ------------------------------------------------ call room
  async function start(opts) {
    if (C) return USSApp.toast('You are already in a call.', true);
    let stream; try { stream = await ensurePerms(opts.video); } catch (e) { if (e.message !== 'cancelled') USSApp.toast(e.message, true); return; }
    try {
      const r = await api('call/new', { method: 'POST', json: opts });
      if (r.joinInstead) { dismissRing(); const j = await api(`call/${r.joinInstead}/join`, { method: 'POST', json: {} }); enter(j.call, stream, true); } // you both called at once
      else enter(r.call, stream, false);
    }
    catch (e) { stream.getTracks().forEach(t => t.stop()); USSApp.toast(e.message, true); }
  }
  async function join(id, opts = {}) {
    if (C) return USSApp.toast('Hang up first.', true);
    let stream; try { stream = await ensurePerms(!!opts.video); } catch (e) { if (e.message !== 'cancelled') USSApp.toast(e.message, true); return; }
    try { const r = await api(`call/${id}/join`, { method: 'POST', json: {} }); enter(r.call, stream, true); }
    catch (e) { stream.getTracks().forEach(t => t.stop()); USSApp.toast(e.message, true); }
  }
  function enter(call, stream, offerToOthers) {
    const me = USSApp.me.u;
    C = { id: call.id, call, stream, peers: {}, me, mic: true, camTrack: stream.getVideoTracks()[0] || null, started: Date.now(), pollT: 0, lastChange: Date.now(), ringT: 0 };
    C.cam = !!C.camTrack;
    // nobody answered? stop ringing after 45 s
    C.ringT = setTimeout(() => { if (C && C.id === call.id && Object.keys(C.call.members).length < 2) { leave(); USSApp.toast('No answer'); } }, 45000);
    const mine = call.members[me] || {};
    C.admin = !!mine.admin; C.perms = new Set(USSApp.me.perms || []);
    renderShell(); keepAlive(true);
    if (offerToOthers) for (const u of Object.keys(call.members)) if (u !== me) connect(u, true);
    poll();
  }
  const outVideo = () => C.shareTrack || (C.cam ? C.camTrack : null);
  function newPeer(u, offerer) {
    const pc = new RTCPeerConnection(ICE);
    const P = { u, pc, stream: new MediaStream(), dc: null, state: 'new', cam: false };
    if (offerer) {
      pc.addTransceiver(C.stream.getAudioTracks()[0] || 'audio', { direction: 'sendrecv', streams: [C.stream] });
      P.vtx = pc.addTransceiver(outVideo() || 'video', { direction: 'sendrecv', streams: [C.stream] });
    }
    pc.ontrack = e => { if (!P.stream.getTracks().includes(e.track)) P.stream.addTrack(e.track); drawTile(u); };
    pc.onconnectionstatechange = () => { P.state = pc.connectionState; C.lastChange = Date.now(); drawTile(u); if (pc.connectionState === 'failed') { drop(u); } };
    pc.ondatachannel = e => wireDc(P, e.channel);
    C.peers[u] = P; return P;
  }
  function wireDc(P, dc) {
    P.dc = dc;
    dc.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m.bye) drop(P.u); if (m.troll) applyTroll(m.troll, P.u); if (m.talk !== undefined) P.muted = !m.talk; if (m.cam !== undefined) P.cam = !!m.cam; if (m.nick !== undefined) { P.nick = String(m.nick || '').slice(0, 20); drawTile(P.u); } if (m.screen !== undefined) { const was = P.screen; P.screen = !!m.screen; if (P.screen && !was) banner(`@${P.u} is sharing their screen`); } if (m.talk !== undefined || m.cam !== undefined || m.screen !== undefined) drawTile(P.u); };
    dc.onopen = () => { dc.send(JSON.stringify({ talk: C.mic, cam: !!outVideo(), screen: !!C.shareTrack, nick: C.nick || '' })); if (C.sendMic) { const tx = P.pc.getTransceivers().find(x => x.receiver.track.kind === 'audio'); tx?.sender.replaceTrack(C.sendMic).catch(() => {}); } };
  }
  const gather = (pc) => new Promise(r => { if (pc.iceGatheringState === 'complete') return r(); const t = setTimeout(r, 3000); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); r(); } }); });
  async function connect(u, offer) {
    const P = C.peers[u] || newPeer(u, offer);
    if (!offer) return P;
    wireDc(P, P.pc.createDataChannel('ctl'));
    await P.pc.setLocalDescription(await P.pc.createOffer()); await gather(P.pc);
    await api(`call/${C.id}/signal`, { method: 'POST', json: { to: u, type: 'offer', sdp: P.pc.localDescription.sdp } }).catch(() => {});
    drawTile(u);
  }
  async function onSignal(sig) {
    if (!C) return;
    if (sig.type === 'offer') {
      if (C.peers[sig.from]) { try { C.peers[sig.from].pc.close(); } catch {} delete C.peers[sig.from]; }
      const P = newPeer(sig.from, false);
      await P.pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
      for (const tx of P.pc.getTransceivers()) { // answer with our mic + (maybe later) camera in the same slots
        tx.direction = 'sendrecv';
        const kind = tx.receiver.track.kind;
        if (kind === 'audio') await tx.sender.replaceTrack(C.stream.getAudioTracks()[0] || null);
        if (kind === 'video') { P.vtx = tx; await tx.sender.replaceTrack(outVideo()); }
        tx.sender.setStreams?.(C.stream);
      }
      await P.pc.setLocalDescription(await P.pc.createAnswer()); await gather(P.pc);
      await api(`call/${C.id}/signal`, { method: 'POST', json: { to: sig.from, type: 'answer', sdp: P.pc.localDescription.sdp } }).catch(() => {});
    } else if (sig.type === 'answer') {
      const P = C.peers[sig.from]; if (P && P.pc.signalingState === 'have-local-offer') await P.pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
    }
  }
  // CREDITS: fast checks only while someone is connecting, then slow
  async function poll() {
    if (!C) return; clearTimeout(C.pollT);
    try {
      const d = await api(`call/${C.id}`);
      if (!C) return;
      C.call = d.call;
      for (const s of d.signals) await onSignal(s);
      if (d.call.state === 'ended') { leave(true); return USSApp.toast('Call ended'); }
      if (!d.call.members[C.me]) { leave(true); return USSApp.toast((d.call.kicked || []).includes(C.me) ? 'You were kicked from the call' : 'You left the call', true); }
      for (const u of Object.keys(C.peers)) if (!d.call.members[u]) drop(u);
      renderShell(true);
    } catch (e) { if (e.status === 404) { leave(true); return; } }
    if (!C) return;
    const connecting = Object.values(C.peers).some(p => p.state !== 'connected') || Object.keys(C.call.members).length - 1 > Object.keys(C.peers).length;
    const alone = Object.keys(C.call.members).length < 2;
    const x = [1, 1.5, 2, 3][USS.S.saver] || 1;
    const fresh = Date.now() - C.lastChange < 20000;
    C.pollT = setTimeout(poll, (connecting || alone || fresh ? 1500 : 15000) * x);
  }
  function drop(u) { document.querySelector(`audio.uss-remote[data-u="${CSS.escape(u)}"]`)?.remove(); const P = C?.peers[u]; if (!P) return; try { P.pc.close(); } catch {} delete C.peers[u]; C.lastChange = Date.now(); $(`.tile[data-u="${CSS.escape(u)}"]`)?.remove(); }
  function sendAll(m) { for (const P of Object.values(C?.peers || {})) if (P.dc?.readyState === 'open') P.dc.send(JSON.stringify(m)); }
  function sendTo(u, m) { const P = C?.peers[u]; if (P?.dc?.readyState === 'open') P.dc.send(JSON.stringify(m)); }
  // camera on/off any time, even in a voice call — swaps the track in without reconnecting
  async function setCam(on) {
    if (!C) return;
    if (on) {
      if (!C.camTrack || C.camTrack.readyState === 'ended') {
        try { C.camTrack = (await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } })).getVideoTracks()[0]; }
        catch { return USSApp.toast('Camera access was blocked. Allow it in your browser settings.', true); }
        C.stream.getVideoTracks().forEach(t => C.stream.removeTrack(t)); C.stream.addTrack(C.camTrack);
      }
      C.camTrack.enabled = true;
    } else if (C.camTrack) { C.camTrack.stop(); C.stream.removeTrack(C.camTrack); C.camTrack = null; }
    C.cam = on;
    for (const P of Object.values(C.peers)) await P.vtx?.sender.replaceTrack(outVideo()).catch(() => {});
    sendAll({ cam: !!outVideo(), screen: !!C.shareTrack });
    const mv = $('.tile.me video'); if (mv) { mv.srcObject = null; mv.srcObject = C.stream; mv.play().catch(() => {}); }
    renderShell(true); drawTile(C.me);
  }
  // ------------------------------------------------ screen share (device to device = 0 credits)
  async function toggleShare() {
    if (!C) return;
    if (C.shareTrack) return stopShare();
    if (!navigator.mediaDevices?.getDisplayMedia) {
      return USSApp.sheet(`<h3>${I('screen', 20)} Screen sharing</h3><p style="margin:0;color:var(--mut)">${/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? "Apple doesn't let any website share the screen on iPhone or iPad — Safari just doesn't have it. You can still <b>watch</b> other people's screen shares here (tap the fullscreen button on their video). To share, use a computer (Chrome, Edge, Firefox, or Safari on a Mac)." : "This browser can't share its screen. Try Chrome, Edge, Firefox or Safari on a computer."}</p><button class="btn" onclick="document.getElementById('modal').hidden=true">Got it</button>`);
    }
    const ok = localStorage.getItem('uss_share_ok') ? true : await new Promise(res => USSApp.sheet(`<h3>${I('screen', 20)} Share your screen</h3><p style="margin:0;color:var(--mut)">Your browser will ask what to share — a whole screen, a window, or one tab. ${/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? 'In Safari, click <b>Allow</b> when it asks.' : ''} Everyone in this call will see it. It goes straight to them over your Wi-Fi.</p><div class="row"><button class="btn ghost" style="flex:1" id="shNo">Cancel</button><button class="btn" style="flex:1" id="shGo">Continue</button></div>`, s => { $('#shNo', s).onclick = () => { USSApp.closeSheet(); res(false); }; $('#shGo', s).onclick = () => { USSApp.closeSheet(); localStorage.setItem('uss_share_ok', '1'); res(true); }; }));
    if (!ok) return;
    let ds;
    try { ds = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 }, height: { max: 1080 } }, audio: false }); }
    catch (e) { if (e.name === 'NotAllowedError') USSApp.toast('Screen sharing was cancelled or blocked. Allow screen recording for your browser in your computer\'s settings.', true); else USSApp.toast("Couldn't share screen: " + e.message, true); return; }
    if (!C) { ds.getTracks().forEach(t => t.stop()); return; }
    C.shareTrack = ds.getVideoTracks()[0]; try { C.shareTrack.contentHint = 'detail'; } catch {}
    C.shareTrack.onended = () => stopShare();
    for (const P of Object.values(C.peers)) await P.vtx?.sender.replaceTrack(C.shareTrack).catch(() => {});
    sendAll({ cam: true, screen: true }); C.shareStream = new MediaStream([C.shareTrack]);
    renderShell(true); drawTile(C.me); USSApp.toast('You are sharing your screen');
  }
  async function stopShare() {
    if (!C?.shareTrack) return;
    C.shareTrack.onended = null; C.shareTrack.stop(); C.shareTrack = null; C.shareStream = null;
    for (const P of Object.values(C.peers)) await P.vtx?.sender.replaceTrack(outVideo()).catch(() => {});
    sendAll({ cam: !!outVideo(), screen: false }); renderShell(true); drawTile(C.me);
  }
  function setMic(on) { C.mic = on; C.stream.getAudioTracks().forEach(t => t.enabled = on); if (C.sendMic) C.sendMic.enabled = on; if (C.rawMic) C.rawMic.enabled = on; sendAll({ talk: on }); renderShell(true); }
  function leave(silent) {
    if (!C) return; const c = C; C = null; clearTimeout(c.pollT); clearTimeout(c.ringT); c.camTrack?.stop(); c.shareTrack?.stop(); c.rawMic?.stop(); try { voiceSrc?.disconnect(); } catch {} voiceSrc = null; myVoice = 'none'; drawCv?.remove(); drawCv = null; drawOn = false; remoteFx.forEach(f => f());
    try { for (const P of Object.values(c.peers)) { if (P.dc?.readyState === 'open') P.dc.send('{"bye":1}'); P.pc.close(); } } catch {}
    c.stream.getTracks().forEach(t => t.stop());
    if (!silent) api(`call/${c.id}/leave`, { method: 'POST', json: {} }).catch(() => {});
    else api(`call/${c.id}/leave`, { method: 'POST', json: {} }).catch(() => {});
    $('#call').hidden = true; $('#call').innerHTML = ''; $('#call').className = 'call'; keepAlive(false);
    $$('audio.uss-remote').forEach(a => { a.srcObject = null; a.remove(); });
  }

  // ------------------------------------------------ call screen
  let bannerT;
  function banner(t) { const b = $('#callBanner'); if (!b) return; b.textContent = t; b.hidden = false; clearTimeout(bannerT); bannerT = setTimeout(() => b.hidden = true, 5000); }
  function renderShell(update) {
    const el = $('#call'); const c = C.call;
    const title = c.kind === 'group' ? esc(c.gname || 'Group call') : '@' + esc(Object.keys(c.members).concat(c.invited, [c.from]).find(u => u !== C.me) || '');
    const admins = Object.entries(c.members).filter(([u, m]) => m.admin && u !== C.me).map(([u]) => u);
    if (!update) {
      el.hidden = false;
      el.innerHTML = `<div class="c-top"><div><b>${title}</b><br><small id="cState"></small></div>${USI.logo(30)}</div>
        <div class="banner" id="adminBanner" hidden></div><div class="banner" id="callBanner" hidden></div>
        <div class="grid" id="cGrid"></div>
        <div class="c-bar"><button id="cMic">${I('mic')}</button><button id="cCam">${I('video')}</button><button id="cShare" title="Share screen">${I('screen')}</button>${C.perms.has('calls.troll') || USSApp.me.owner ? `<button class="troll" id="cTroll">${I('wand')}</button>` : ''}${C.perms.has('calls.end') || USSApp.me.owner ? `<button id="cEndAll" title="End call for everyone">${I('bolt')}</button>` : ''}<button class="end" id="cEnd">${I('end')}</button></div>`;
      $('#cMic').onclick = () => setMic(!C.mic);
      $('#cCam').onclick = () => setCam(!C.cam);
      $('#cShare').onclick = () => toggleShare();
      $('#cEnd').onclick = () => leave();
      $('#cEndAll') && ($('#cEndAll').onclick = async () => { if (!await USSApp.confirmIt('End this call for everyone?', 'Everyone gets disconnected.', 'End call', true)) return; sendAll({ troll: { end: 1 } }); await api(`call/${C.id}/end`, { method: 'POST', json: {} }).catch(() => {}); leave(true); });
      $('#cTroll') && ($('#cTroll').onclick = trollPad);
      drawTile(C.me);
    }
    $('#cMic').classList.toggle('off', !C.mic); $('#cMic').innerHTML = I(C.mic ? 'mic' : 'micOff');
    $('#cCam').classList.toggle('off', !C.cam); $('#cCam').innerHTML = I(C.cam ? 'video' : 'videoOff');
    $('#cShare').classList.toggle('troll', !!C.shareTrack); $('#cShare').title = C.shareTrack ? 'Stop sharing' : 'Share screen';
    const n = Object.keys(c.members).length;
    $('#cState').textContent = n < 2 ? (c.state === 'ringing' ? 'Ringing…' : 'Waiting for others…') : `${n} in call · ${fmtT(Date.now() - C.started)}`;
    const ab = $('#adminBanner'); ab.hidden = !admins.length; ab.textContent = admins.length ? `Staff in this call: ${admins.map(u => '@' + u).join(', ')}` : '';
    for (const u of Object.keys(c.members)) if (u !== C.me && !C.peers[u]) drawTile(u, true);
    $$('.tile').forEach(t => { if (!c.members[t.dataset.u]) t.remove(); });
  }
  const fmtT = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  setInterval(() => { if (C && $('#cState') && Object.keys(C.call.members).length > 1) $('#cState').textContent = `${Object.keys(C.call.members).length} in call · ${fmtT(Date.now() - C.started)}`; }, 1000);
  function drawTile(u, pendingOnly) {
    if (!C || !$('#cGrid')) return;
    let t = $(`.tile[data-u="${CSS.escape(u)}"]`);
    const isMe = u === C.me, m = C.call.members[u] || {}, P = C.peers[u];
    if (!t) {
      t = document.createElement('div'); t.className = 'tile' + (isMe ? ' me' : ''); t.dataset.u = u;
      t.innerHTML = `${USSApp.av(u)}<video autoplay playsinline muted></video><div class="lbl"></div>`;
      $('#cGrid').appendChild(t);
      const canMod = !isMe && (C.perms.has('calls.mute') || C.perms.has('calls.kick') || C.perms.has('calls.troll') || USSApp.me.owner);
      if (canMod) { const b = document.createElement('button'); b.className = 'icon-btn tmenu'; b.innerHTML = I('more'); b.onclick = () => personMenu(u); t.appendChild(b); }
    }
    const v = $('video', t);
    const stream = isMe ? (C.shareStream || C.stream) : P?.stream;
    t.classList.toggle('screen', isMe ? !!C.shareTrack : !!P?.screen);
    // someone else is sharing? their screen takes over the whole call view (best on iPad / phones)
    const sharer = Object.values(C.peers).find(x => x.screen && x.cam);
    $('#call')?.classList.toggle('spot', !!sharer);
    $$('.tile', $('#cGrid')).forEach(x => x.classList.toggle('spotlit', !!sharer && x.dataset.u === sharer.u));
    if (stream && v.srcObject !== stream) {
      v.srcObject = stream; v.play().catch(() => {});
      if (!isMe) {
        watchTalk(t, stream);
        let au = document.querySelector(`audio.uss-remote[data-u="${CSS.escape(u)}"]`);
        if (!au) { au = document.createElement('audio'); au.className = 'uss-remote'; au.dataset.u = u; au.autoplay = true; au.setAttribute('playsinline', ''); document.body.appendChild(au); }
        au.srcObject = stream; au.play().catch(() => {});
      }
    }
    const hasVid = isMe ? !!(C.shareTrack || (C.cam && C.camTrack)) : !!(P?.cam && P.stream.getVideoTracks().length);
    v.style.opacity = hasVid ? 1 : 0;
    $('.av', t).style.opacity = hasVid && !t.classList.contains('vhide') ? 0 : 1;
    if (!isMe) {
      let tb = $('.tbtns', t);
      if (!tb) {
        tb = document.createElement('div'); tb.className = 'tbtns';
        tb.innerHTML = `<button data-fs title="Fullscreen">${I('expand', 16)}</button><button data-hide title="Hide their video">${I('eyeOff', 16)}</button>`;
        t.appendChild(tb);
        $('[data-fs]', tb).onclick = () => { // iPad: element fullscreen · iPhone: the video's own fullscreen player
          if (document.fullscreenElement || document.webkitFullscreenElement) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
          const req = t.requestFullscreen || t.webkitRequestFullscreen;
          if (req) { const r = req.call(t); if (r?.catch) r.catch(() => v.webkitEnterFullscreen?.()); } else v.webkitEnterFullscreen?.();
        };
        $('[data-hide]', tb).onclick = () => { t.classList.toggle('vhide'); const off = t.classList.contains('vhide'); P?.stream.getVideoTracks().forEach(x => x.enabled = !off); $('[data-hide]', tb).innerHTML = I(off ? 'eye' : 'eyeOff', 16); drawTile(u); };
      }
      tb.hidden = !hasVid;
    }
    const muted = isMe ? !C.mic : P?.muted;
    $('.lbl', t).className = 'lbl' + (m.admin ? ' admin' : '');
    $('.lbl', t).innerHTML = `${muted ? I('micOff', 12) : ''}${m.admin ? I('shield', 12) + 'ADMIN ' : ''}${(isMe ? C.shareTrack : P?.screen) ? I('screen', 12) : ''}${isMe ? (C.nick ? esc(C.nick) + ' (you)' : 'You') : P?.nick ? esc(P.nick) : '@' + esc(u)}${!isMe && (!P || P.state !== 'connected') ? ' · connecting…' : ''}`;
  }
  function watchTalk(tile, stream) {
    if (!stream.getAudioTracks().length) { stream.addEventListener('addtrack', () => watchTalk(tile, stream), { once: true }); return; }
    try {
      const a = ac(), src = a.createMediaStreamSource(stream), an = a.createAnalyser(); an.fftSize = 256; src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => { if (!tile.isConnected) return; an.getByteFrequencyData(buf); tile.classList.toggle('talk', buf.reduce((x, y) => x + y, 0) / buf.length > 18); setTimeout(tick, 200); };
      tick();
    } catch {}
  }
  function personMenu(u) {
    const p = C.perms, own = USSApp.me.owner;
    USSApp.sheet(`<h3>@${esc(u)}</h3>
      ${p.has('calls.mute') || own ? `<button class="opt" data-a="mute">${I('micOff')}Mute them</button>` : ''}
      ${p.has('calls.troll') || own ? `<button class="opt" data-a="shake">${I('bolt')}Shake their screen</button><button class="opt" data-a="flip">${I('flip')}Flip their screen</button><button class="opt" data-a="bonk">${I('hammer')}Bonk sound (only them)</button>` : ''}
      ${p.has('calls.kick') || own ? `<button class="opt bad" data-a="kick">${I('door')}Kick from call</button>` : ''}`, s => {
      $$('[data-a]', s).forEach(b => b.onclick = async () => {
        const a = b.dataset.a; USSApp.closeSheet();
        if (a === 'mute') sendTo(u, { troll: { mute: 1 } });
        if (a === 'shake' || a === 'flip') sendTo(u, { troll: { fx: a } });
        if (a === 'bonk') sendTo(u, { troll: { sound: 'bonk' } });
        if (a === 'kick') { try { await api(`call/${C.id}/kick`, { method: 'POST', json: { user: u } }); sendTo(u, { troll: { kick: 1 } }); drop(u); } catch (e) { USSApp.toast(e.message, true); } }
      });
    });
  }
  let trollTarget = 'all';
  let jsSound = 'scream';
  async function trollPad() {
    await loadCustom();
    const others = Object.keys(C.call.members).filter(u => u !== C.me);
    const rain = [['heart', 'Hearts'], ['star', 'Stars'], ['crown', 'Crowns'], ['spark', 'Sparks'], ['bolt', 'Bolts'], ['heartBroken', 'Sad'], ['bell', 'Bells'], ['clips', 'Clips']];
    USSApp.sheet(`<h3>${I('wand', 20)} Troll the call</h3>
      <div class="row" style="flex-wrap:wrap"><b style="font-size:13px">Target:</b>${[['all', 'Everyone'], ...others.map(u => [u, '@' + u])].map(([k, n]) => `<button class="btn sm ${trollTarget === k ? '' : 'ghost'}" data-t="${esc(k)}">${esc(n)}</button>`).join('')}</div>
      <div class="card" style="padding:12px;gap:8px"><b style="font-size:13px">${I('mic', 16)} Your voice</b>
        <div class="troll-pad">${VOICES.map(([k, n]) => `<button data-myv="${k}" style="${myVoice === k ? 'outline:2px solid var(--b)' : ''}">${I('mic', 18)}${n}</button>`).join('')}</div></div>
      <div class="card" style="padding:12px;gap:8px"><b style="font-size:13px">${I('speaker', 16)} Mess with ${trollTarget === 'all' ? 'someone' : '@' + esc(trollTarget)}'s voice <small style="color:var(--mut);font-weight:400">(15 s, everyone hears it)</small></b>
        ${trollTarget === 'all' ? '<small style="color:var(--mut)">Pick a person as the target above first.</small>' : `<div class="troll-pad">${VOICES.slice(1).map(([k, n]) => `<button data-thv="${k}">${I('speaker', 18)}${n}</button>`).join('')}</div>`}</div>
      <div class="card" style="padding:12px;gap:8px"><b style="font-size:13px">${I('mega', 16)} Make every device talk</b>
        <div class="row"><input id="ttsT" maxlength="200" placeholder="Type what they'll hear…" style="flex:1"><select id="ttsV" style="width:110px"><option value="1,1">Normal</option><option value="2,1.2">Squeaky</option><option value="0.1,0.8">Deep</option><option value="1,1.9">Fast</option><option value="1,0.5">Slow</option></select><button class="btn" id="ttsGo">${I('send', 16)}</button></div></div>
      <div class="card" style="padding:12px;gap:8px"><b style="font-size:13px">${I('star', 16)} Party tools</b>
        <div class="troll-pad">
          <button data-party="wheel">${I('spark', 18)}Spin the wheel</button><button data-party="dice">${I('star', 18)}Roll dice</button><button data-party="coin">${I('crown', 18)}Coin flip</button>
          <button data-party="react">${I('bolt', 18)}Reaction race</button><button data-party="draw">${I('edit', 18)}${drawOn ? 'Stop drawing' : 'Draw on screens'}</button><button data-party="clear">${I('trash', 18)}Clear drawing</button>
          <button data-party="nick">${I('user', 18)}${C.nick ? 'Nickname: ' + esc(C.nick) : 'Fake nickname'}</button><button data-party="fakecall">${I('phone', 18)}Fake incoming call</button><button data-party="chaos">${I('bolt', 18)}Chaos mode</button>
          <button data-party="wash">${I('flip', 18)}Washing machine</button>${trollTarget !== 'all' ? `<button data-party="face">${I('image', 18)}Picture over face</button>` : ''}
        </div>${drawOn ? `<div class="row" style="flex-wrap:wrap">${['#ff3d78', '#22c55e', '#5cc8ff', '#ffb03b', '#fff', '#000'].map(c => `<button data-dc="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};border:2px solid ${drawColor === c ? '#fff' : '#555'}"></button>`).join('')}</div>` : ''}</div>
      <div class="card" style="padding:12px;gap:8px;border-color:#ff3d7866"><b style="font-size:13px">${I('eye', 16)} Jumpscare</b>
        <div class="row"><select id="jsSnd" style="flex:1"><option value="scream">Built-in scream</option>${customSounds.map(x => `<option value="${x.url}" ${jsSound === x.url ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <button class="btn danger" id="jsGo">${I('image', 16)}Pick picture &amp; scare</button></div></div>
      <b style="font-size:13px">Your sounds <small style="color:var(--mut);font-weight:400">(${customSounds.length}) — upload any sound file</small></b>
      <div class="troll-pad">${customSounds.map(x => `<button data-c="${x.url}" style="position:relative">${I('speaker', 18)}${esc(x.name)}${x.by === C.me || USSApp.me.owner ? `<span data-del="${x.id}" style="position:absolute;top:2px;right:4px;opacity:.6">${I('close', 12)}</span>` : ''}</button>`).join('')}<button id="addSnd" style="border:1px dashed #fff4">${I('plus', 18)}Add sound</button></div>
      <b style="font-size:13px">Soundboard</b><div class="troll-pad">${SOUND_LIST.map(([k, n]) => `<button data-s="${k}">${I('speaker', 18)}${n}</button>`).join('')}</div>
      <b style="font-size:13px">Screen effects</b><div class="troll-pad">${FX_LIST.map(([k, ic, n]) => `<button data-f="${k}">${I(ic, 18)}${n}</button>`).join('')}</div>
      <b style="font-size:13px">Make it rain</b><div class="troll-pad">${rain.map(([k, n]) => `<button data-r="${k}">${I(k, 18)}${n}</button>`).join('')}</div>
      <div class="row"><input id="tMsg" maxlength="80" placeholder="Flash a giant message on screen"><button class="btn" id="tSend">${I('mega', 18)}</button></div>
      ${C.perms.has('calls.mute') || USSApp.me.owner ? `<button class="btn ghost" id="tMuteAll">${I('micOff', 18)}Mute ${trollTarget === 'all' ? 'everyone' : '@' + esc(trollTarget)}</button>` : ''}`, s => {
      if (trollTarget !== 'all' && !others.includes(trollTarget)) trollTarget = 'all';
      const fire = (cmd) => { if (trollTarget === 'all') { sendAll({ troll: cmd }); applyTroll(cmd, C.me); } else { sendTo(trollTarget, { troll: cmd }); USSApp.toast('Sent to @' + trollTarget); } };
      $$('[data-t]', s).forEach(b => b.onclick = () => { trollTarget = b.dataset.t; trollPad(); });
      $$('[data-s]', s).forEach(b => b.onclick = () => fire({ sound: b.dataset.s }));
      $('#jsSnd', s).onchange = e => jsSound = e.target.value;
      $$('[data-myv]', s).forEach(b => b.onclick = async () => { await setMyVoice(b.dataset.myv); trollPad(); });
      $$('[data-thv]', s).forEach(b => b.onclick = () => { const cmd = { voice: { u: trollTarget, fx: b.dataset.thv, ms: 15000 } }; sendAll({ troll: cmd }); applyTroll(cmd, C.me); USSApp.toast(`@${trollTarget} sounds different for 15 s 😈`); });
      $('#ttsGo', s).onclick = () => { const t = $('#ttsT', s).value.trim(); if (!t) return; const [pitch, rate] = $('#ttsV', s).value.split(',').map(Number); fire({ tts: { text: t, pitch, rate } }); $('#ttsT', s).value = ''; };
      $$('[data-dc]', s).forEach(b => b.onclick = () => { drawColor = b.dataset.dc; trollPad(); });
      $$('[data-party]', s).forEach(b => b.onclick = async () => {
        const k = b.dataset.party, people = Object.keys(C.call.members);
        const names = people.map(u => u === C.me ? (C.nick || C.me) : (C.peers[u]?.nick || u));
        if (k === 'wheel') { const cmd = { wheel: { names, pick: Math.floor(Math.random() * names.length) } }; sendAll({ troll: cmd }); applyTroll(cmd); USSApp.closeSheet(); }
        if (k === 'dice') { const a = 1 + Math.floor(Math.random() * 6), b2 = 1 + Math.floor(Math.random() * 6); const cmd = { big: { text: `${a} + ${b2}`, sub: `= ${a + b2} · rolled by ${C.nick || C.me}` } }; sendAll({ troll: cmd }); applyTroll(cmd); SOUNDS.drumroll(); }
        if (k === 'coin') { const cmd = { big: { text: Math.random() < .5 ? 'HEADS' : 'TAILS', sub: 'flipped by ' + (C.nick || C.me) } }; sendAll({ troll: cmd }); applyTroll(cmd); SOUNDS.coin(); }
        if (k === 'react') { const cmd = { reactStart: { id: Math.random().toString(36).slice(2), delay: 1500 + Math.random() * 3500 } }; sendAll({ troll: cmd }); applyTroll(cmd); USSApp.closeSheet(); }
        if (k === 'draw') { toggleDraw(!drawOn); if (drawOn) USSApp.closeSheet(); else trollPad(); }
        if (k === 'clear') { sendAll({ troll: { drawClear: 1 } }); applyTroll({ drawClear: 1 }); }
        if (k === 'nick') { const n = prompt('Fake nickname for this call (made-up names only, leave empty to remove):', C.nick || ''); if (n !== null) { await setNick(n); trollPad(); } }
        if (k === 'fakecall') { const n = prompt('Who is "calling"?', 'Mom'); if (n) fire({ fakecall: n.slice(0, 30) }); }
        if (k === 'chaos') { USSApp.closeSheet(); const fx = FX_LIST.map(x => x[0]).filter(x => !['nuke', 'crash', 'update', 'lightsout', 'disconnect', 'fakeban', 'virus'].includes(x)), sn = SOUND_LIST.map(x => x[0]).filter(x => !['nuke', 'jumpscare', 'dialup'].includes(x)); for (let i = 0; i < 12; i++) setTimeout(() => { fire(Math.random() < .5 ? { fx: fx[Math.floor(Math.random() * fx.length)] } : { sound: sn[Math.floor(Math.random() * sn.length)] }); }, i * 650); }
        if (k === 'wash') fire({ wash: 1 });
        if (k === 'face') pickFace(trollTarget);
      });
      $('#jsGo', s).onclick = () => { const v = $('#jsSnd', s).value; pickJumpscare(trollTarget, v === 'scream' ? 'scream' : 'custom', v === 'scream' ? '' : v); };
      $$('[data-c]', s).forEach(b => b.onclick = e => { if (e.target.closest('[data-del]')) return; fire({ csound: b.dataset.c }); });
      $$('[data-del]', s).forEach(x => x.onclick = async e => { e.stopPropagation(); if (!confirm('Delete this sound?')) return; try { await api('sounds/' + x.dataset.del, { method: 'DELETE' }); trollPad(); } catch (er) { USSApp.toast(er.message, true); } });
      $('#addSnd', s).onclick = async () => {
        const f = await new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'audio/*'; i.onchange = () => res(i.files[0]); i.click(); });
        if (!f) return; if (f.size > 600 * 1024) return USSApp.toast('That sound is too big (max 600 KB). Trim it to a few seconds.', true);
        const name = (prompt('Name for this sound?', f.name.replace(/\.[^.]+$/, '').slice(0, 24)) || '').trim(); if (!name) return;
        try { await api('sounds/add?name=' + encodeURIComponent(name), { method: 'POST', body: f, headers: { 'Content-Type': f.type || 'audio/mpeg' } }); USSApp.toast('Added!'); trollPad(); } catch (er) { USSApp.toast(er.message, true); }
      };
      $$('[data-f]', s).forEach(b => b.onclick = () => fire({ fx: b.dataset.f }));
      $$('[data-r]', s).forEach(b => b.onclick = () => fire({ fx: 'rain', arg: b.dataset.r }));
      $('#tSend', s).onclick = () => { const t = $('#tMsg', s).value.trim(); if (t) { fire({ fx: 'msg', arg: t }); $('#tMsg', s).value = ''; } };
      $('#tMuteAll', s) && ($('#tMuteAll', s).onclick = () => { if (trollTarget === 'all') sendAll({ troll: { mute: 1 } }); else sendTo(trollTarget, { troll: { mute: 1 } }); USSApp.toast('Muted'); });
    });
  }
  // ------------------------------------------------ stay in the call when you switch tabs / apps
  let wake = null;
  async function keepAlive(on) {
    try { if (on && navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => wake = null); } if (!on && wake) { wake.release(); wake = null; } } catch {}
    try { if ('mediaSession' in navigator) { navigator.mediaSession.metadata = on ? new MediaMetadata({ title: 'UnStevened Social call', artist: 'In a call', artwork: [{ src: '/icons/app-512.png', sizes: '512x512', type: 'image/png' }] }) : null; navigator.mediaSession.playbackState = on ? 'playing' : 'none'; } } catch {}
  }
  document.addEventListener('visibilitychange', async () => {
    if (!C || document.hidden) return;
    keepAlive(true); $$('audio.uss-remote, #call video').forEach(m => m.play().catch(() => {}));
    // phones pause the camera/mic in the background — grab them again and swap them back in
    const mic = C.stream.getAudioTracks()[0];
    if (!mic || mic.readyState === 'ended') {
      try { const nt = (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })).getAudioTracks()[0]; nt.enabled = C.mic; if (mic) C.stream.removeTrack(mic); C.stream.addTrack(nt);
        for (const P of Object.values(C.peers)) { const tx = P.pc.getTransceivers().find(x => x.receiver.track.kind === 'audio'); await tx?.sender.replaceTrack(nt).catch(() => {}); } } catch {}
    }
    if (C.cam && (!C.camTrack || C.camTrack.readyState === 'ended' || C.camTrack.muted)) { C.camTrack = null; await setCam(true); }
  });
  addEventListener('pagehide', (e) => { if (e.persisted) return; if (C) { const c = C; try { navigator.sendBeacon && fetch(`/api/call/${c.id}/leave`, { method: 'POST', keepalive: true, headers: { Authorization: 'Bearer ' + localStorage.getItem('uss_token'), 'X-Device': USS.device, 'Content-Type': 'application/json' }, body: '{}' }); } catch {} } });

  // admin panel "Join call" lands here with ?joincall=<id>
  const jc = new URLSearchParams(location.search).get('joincall');
  if (jc) {
    history.replaceState(null, '', location.pathname);
    const wait = () => (USSApp?.me ? showJoin() : setTimeout(wait, 400));
    const showJoin = () => USSApp.sheet(`<h3>${I('shield', 20)} Join this call?</h3><p style="margin:0;color:var(--mut)">Everyone in the call will see an ADMIN tag on you.</p><button class="btn" id="jGo">${I('phone', 18)}Join call</button>`, s => $('#jGo', s).onclick = () => { USSApp.closeSheet(); join(jc, { video: false }); });
    setTimeout(wait, 300);
  }

  window.USSCall = { start, join, ring, hangup: () => leave(), get active() { return !!C; } };
})();
