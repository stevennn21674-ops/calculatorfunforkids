// UnStevened Social — server. Network-only accounts, clips with hard post limits,
// DMs, group chats (max 5), mesh calls with visible admin join, roles & owner panel.
// Built to spend as few Netlify credits as possible (see notes marked CREDITS).
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { makeStore } from './store.mjs';
let ENV = {}; // Cloudflare bindings + secrets for this request
const subtle = globalThis.crypto.subtle;
const enc8 = (x) => typeof x === 'string' ? new TextEncoder().encode(x) : x;
const randInt = (n) => { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] % n; };


// ---------------------------------------------------------------- owner (same login as before)
const OWNER = 'stevennn', OWNER_SALT = 'us2-owner-v1';
const ownerHash = () => String(ENV.OWNER_HASH || '').trim().toLowerCase(); // set with "Set Owner Password.bat"
const PBKDF_IT = 10000;

// ---------------------------------------------------------------- Cloudflare R2 (free video storage, free to watch)
// Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET in Netlify. Without them, clips stay on Netlify.
const r2on = () => false; // on Cloudflare, files are served by the site itself (free)
const awsEnc = (v) => encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function presignS3({ method, host, path, region, ak, sk, expires = 900, time = new Date() }) {
  const t = time.toISOString().replace(/[:-]|\.\d{3}/g, ''), date = t.slice(0, 8), scope = `${date}/${region}/s3/aws4_request`;
  const q = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${ak}/${scope}`, 'X-Amz-Date': t, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host' };
  const qs = Object.keys(q).sort().map(k => `${awsEnc(k)}=${awsEnc(q[k])}`).join('&');
  const canon = [method, path, qs, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const sts = ['AWS4-HMAC-SHA256', t, scope, crypto.createHash('sha256').update(canon).digest('hex')].join('\n');
  const h = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
  const sig = crypto.createHmac('sha256', h(h(h(h('AWS4' + sk, date), region), 's3'), 'aws4_request')).update(sts).digest('hex');
  return `https://${host}${path}?${qs}&X-Amz-Signature=${sig}`;
}
const r2url = (method, key, expires = 900) => presignS3({
  method, host: `${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, path: `/${ENV.R2_BUCKET}/${key.split('/').map(awsEnc).join('/')}`,
  region: 'auto', ak: ENV.R2_ACCESS_KEY_ID, sk: ENV.R2_SECRET_ACCESS_KEY, expires
});
const r2del = (key) => fetch(r2url('DELETE', key), { method: 'DELETE' }).catch(() => {});

// ---------------------------------------------------------------- push notifications (Web Push, encrypted, no extra packages)
const DEF_PREFS = { msgs: true, groups: true, calls: true, requests: true, likes: true, comments: true, follows: true, online: true, sound: true };
let vapidMem = null;
const b64u = (x) => Buffer.from(x).toString('base64url');
async function vapid(s) {
  if (vapidMem) return vapidMem;
  let v = await s.get('meta/vapid2', { type: 'json' });
  if (!v) {
    const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { pub: b64u(await subtle.exportKey('raw', kp.publicKey)), jwk: await subtle.exportKey('jwk', kp.privateKey) };
    await s.setJSON('meta/vapid2', v);
  }
  return (vapidMem = v);
}
async function hkdf(salt, ikm, info, len) {
  const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc8(info) }, k, len * 8));
}
export async function encryptPush(payload, p256dh, authSecret) { // RFC 8291 aes128gcm
  const ua = Buffer.from(p256dh, 'base64url'), auth = Buffer.from(authSecret, 'base64url');
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
  const uaKey = await subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, kp.privateKey, 256));
  const ikm = await hkdf(auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32);
  const salt = crypto.randomBytes(16);
  const cek = await hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, Buffer.concat([Buffer.from(payload), Buffer.from([2])])));
  const head = Buffer.alloc(21); Buffer.from(salt).copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = 65;
  return Buffer.concat([head, Buffer.from(asPub), Buffer.from(ct)]);
}
async function sendPush(s, subs, data, urgent) {
  const v = await vapid(s); const dead = [];
  const key = await subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  await Promise.all((subs || []).map(async sub => {
    try {
      const aud = new URL(sub.endpoint).origin, j = (o) => b64u(JSON.stringify(o));
      const unsigned = j({ typ: 'JWT', alg: 'ES256' }) + '.' + j({ aud, exp: Math.floor(now() / 1000) + 12 * 3600, sub: 'https://github.com/unstevened' });
      const jwt = unsigned + '.' + b64u(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc8(unsigned)));
      const r = await fetch(sub.endpoint, { method: 'POST', headers: { Authorization: `vapid t=${jwt}, k=${v.pub}`, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: urgent ? '60' : '86400', Urgency: urgent ? 'high' : 'normal' }, body: await encryptPush(JSON.stringify(data), sub.keys.p256dh, sub.keys.auth) });
      if (r.status === 404 || r.status === 410) dead.push(sub.endpoint);
    } catch {}
  }));
  return dead;
}
const presMem = new Map();

// ---------------------------------------------------------------- secret code puzzle
// A new random code every time. The rule is hidden; only someone with the code password can see the answer + logic.
const CODE_SALT = 'uss-code-v1', CODE_HASH = 'f8fbd9d878943e0312aabc1280d057babe43aa4e6a4b7786562cb0a305ecc889';
const CODE_RULES = [
  ['Add each digit\'s position (1st +1, 2nd +2, 3rd +3, 4th +4), keep only the last digit', d => d.map((x, i) => (x + i + 1) % 10)],
  ['Flip the code backwards, then add 3 to every digit (keep the last digit)', d => d.slice().reverse().map(x => (x + 3) % 10)],
  ['Swap the first two digits with the last two, then do 9 minus each digit', d => [d[2], d[3], d[0], d[1]].map(x => 9 - x)],
  ['Each digit plus the digit to its right (the last one wraps to the first), keep the last digit', d => d.map((x, i) => (x + d[(i + 1) % 4]) % 10)],
  ['Times every digit by 3, keep only the last digit', d => d.map(x => (x * 3) % 10)],
  ['Sort the digits smallest to biggest, then add 1 to each (9 becomes 0)', d => d.slice().sort((a, b) => a - b).map(x => (x + 1) % 10)],
  ['Every odd digit goes up 1, every even digit goes down 1 (0 becomes 9)', d => d.map(x => x % 2 ? (x + 1) % 10 : (x + 9) % 10)],
  ['Move the last digit to the front, then add 5 to each (keep the last digit)', d => [d[3], d[0], d[1], d[2]].map(x => (x + 5) % 10)]
];
const rnd4 = () => Array.from(crypto.randomBytes(4), b => b % 10);
const hmacB = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
function keystream(key, iv, n) { const out = []; for (let i = 0; out.length * 32 < n; i++) out.push(hmacB(key, Buffer.concat([iv, Buffer.from([i >> 24 & 255, i >> 16 & 255, i >> 8 & 255, i & 255])]))); return Buffer.concat(out).subarray(0, n); }
async function sealCode(s, obj) {
  const key = (await secret(s)) + '|code', iv = crypto.randomBytes(12), pt = Buffer.from(JSON.stringify(obj));
  const ks = keystream(key, iv, pt.length), ct = Buffer.from(pt.map((x, i) => x ^ ks[i]));
  const mac = hmacB(key + '|mac', Buffer.concat([iv, ct])).subarray(0, 16);
  return Buffer.concat([iv, mac, ct]).toString('base64url');
}
async function openCode(s, tok) {
  try {
    const b = Buffer.from(String(tok), 'base64url'), key = (await secret(s)) + '|code', iv = b.subarray(0, 12), mac = b.subarray(12, 28), ct = b.subarray(28);
    if (!hmacB(key + '|mac', Buffer.concat([iv, ct])).subarray(0, 16).equals(mac)) return null;
    const ks = keystream(key, iv, ct.length); return JSON.parse(Buffer.from(ct.map((x, i) => x ^ ks[i])).toString());
  } catch { return null; }
}
const codeTries = new Map();

// ---------------------------------------------------------------- permissions
export const PERMS = {
  'panel': 'Open the admin panel', 'stats': 'See site stats',
  'users.view': 'See accounts & devices', 'users.warn': 'Warn people', 'users.mute': 'Mute in chats',
  'users.postban': 'Ban from posting clips', 'users.suspend': 'Suspend (temporary ban)', 'users.ban': 'Ban forever',
  'users.unban': 'Unban / unmute / lift bans', 'users.devban': 'Ban a device', 'users.rename': 'Change display names',
  'users.avatar': 'Remove profile pictures', 'users.resetpw': 'Force a password reset', 'users.delete': 'Delete accounts',
  'users.verify': 'Give or take the verified badge',
  'posts.long': 'Post longer clips (3 min, 2x size)', 'posts.delete': 'Delete any clip', 'posts.pin': 'Pin clips to the top',
  'posts.feature': 'Feature clips', 'posts.hide': 'Hide / unhide clips',
  'reports.view': 'See reports', 'reports.resolve': 'Close reports',
  'calls.view': 'See live calls', 'calls.join': 'Join any live call (everyone is told)', 'calls.troll': 'Soundboard & effects in calls',
  'calls.mute': 'Mute people in calls', 'calls.kick': 'Kick people from calls', 'calls.end': 'End any call',
  'groups.view': 'See all group chats (names & members)', 'groups.kick': 'Remove people from any group', 'groups.delete': 'Delete group chats',
  'msgs.delete': 'Delete reported messages',
  'chat.slowimmune': 'Skip slow mode', 'chat.filterimmune': 'Skip the word filter', 'chat.color': 'Colored name in chats',
  'roles.hide': 'Hide their own role badge', 'roles.assign': 'Give / remove roles (below their own)', 'roles.manage': 'Create & edit roles',
  'announce': 'Post site announcements', 'settings': 'Change site settings', 'filter': 'Edit the word filter',
  'audit': 'See the audit log', 'nets.view': 'See every network', 'nets.ban': 'Ban / unban whole networks'
};
const ALL = Object.keys(PERMS);
const DEFAULT_ROLES = {
  admin: { name: 'Admin', color: '#ff3d78', badge: 'shield', rank: 80, perms: ALL.filter(p => !['roles.manage', 'settings', 'nets.view', 'nets.ban', 'users.delete'].includes(p)) },
  mod: { name: 'Moderator', color: '#7c5cff', badge: 'hammer', rank: 60, perms: ['panel', 'stats', 'users.view', 'users.warn', 'users.mute', 'users.postban', 'users.suspend', 'users.unban', 'users.rename', 'users.avatar', 'posts.delete', 'posts.hide', 'reports.view', 'reports.resolve', 'calls.view', 'calls.join', 'calls.mute', 'calls.kick', 'groups.view', 'groups.kick', 'msgs.delete', 'chat.slowimmune', 'chat.color', 'audit'] },
  helper: { name: 'Helper', color: '#22c55e', badge: 'heart', rank: 40, perms: ['panel', 'users.view', 'users.warn', 'reports.view', 'chat.color'] },
  vip: { name: 'VIP', color: '#ffc928', badge: 'star', rank: 20, perms: ['posts.long', 'chat.slowimmune', 'chat.color'] }
};
const DEFAULT_CFG = {
  postMax: 4, postWindowMin: 170, maxVideoSec: 60, maxVideoSecLong: 180, maxVideoMB: 100, gifs: true, gifMaxKB: 2048,
  signups: true, maintenance: false, slowModeSec: 0, groupMax: 5, callMax: 6,
  wordFilter: [], announce: null, motd: '', postsOpen: true, dmOpen: true, callsOpen: true,
  // credit budget: the site slows itself down so it lasts the whole month
  r2MaxMB: 100, r2CleanGB: 9, textPostMax: 10, budget: 300, reserve: 60, cycleDay: 1, saverForce: -1, limitEpoch: 0,
  shutdown: false, shutdownMsg: '', codeEpoch: 0, codeOn: true, googleDomain: ''
};
// Netlify credit rates (2026 credit plans)
const RATE = { req: 2 / 10000, gbHour: 10, gb: 20 };

// ---------------------------------------------------------------- helpers
const PART_MAX = 3.5 * 1024 * 1024;
const store = () => makeStore(ENV);
const json = (d, status = 200, extra = {}) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });
const fail = (msg, status = 400, more = {}) => json({ error: msg, ...more }, status);
const now = () => Date.now();
// ---- Sign in with Google: checks Google's signed ID token (no passwords from Google ever reach us)
let gKeys = null, gKeysAt = 0;
async function verifyGoogle(tok, clientId, domain) {
  const bad = (m) => { const e = new Error(m || 'Google sign-in failed. Try again.'); e.google = true; throw e; };
  const [h, p, sg] = String(tok || '').split('.'); if (!sg) bad('Sign in with Google first.');
  let hd, pl; try { hd = JSON.parse(Buffer.from(h, 'base64url').toString()); pl = JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { bad(); }
  if (!gKeys || now() - gKeysAt > 3600000 || !gKeys.some(k => k.kid === hd.kid)) { const r = await fetch('https://www.googleapis.com/oauth2/v3/certs'); if (!r.ok) bad('Could not reach Google. Try again.'); gKeys = (await r.json()).keys || []; gKeysAt = now(); }
  const jwk = gKeys.find(k => k.kid === hd.kid); if (!jwk || hd.alg !== 'RS256') bad();
  const sub = globalThis.crypto.subtle;
  const key = await sub.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await sub.verify('RSASSA-PKCS1-v1_5', key, Buffer.from(sg, 'base64url'), new TextEncoder().encode(h + '.' + p)); if (!ok) bad();
  if (pl.aud !== clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(pl.iss) || pl.exp * 1000 < now() - 60000) bad();
  const email = String(pl.email || '').toLowerCase(); if (!email || pl.email_verified === false) bad('That Google account has no verified email.');
  if (domain && pl.hd !== domain && !email.endsWith('@' + domain)) bad(`Only @${domain} Google accounts can join.`);
  return { sub: String(pl.sub), email, name: String(pl.name || '').slice(0, 80) };
}
const rid = (n = 4) => now().toString(36) + crypto.randomBytes(n).toString('hex');
const clean = (u) => String(u || '').trim().toLowerCase();
async function hashPass(pw, salt) {
  const k = await subtle.importKey('raw', enc8(String(pw)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc8(String(salt)), iterations: PBKDF_IT }, k, 256);
  return Buffer.from(bits).toString('hex');
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const uniq = (a) => [...new Set(a)];
const without = (a, x) => (a || []).filter(v => v !== x);
function expand6(ip) {
  const [h, t = ''] = ip.split('::'); const a = h ? h.split(':') : [], b = t ? t.split(':') : [];
  const fill = ip.includes('::') ? Array(8 - a.length - b.length).fill('0') : [];
  return [...a, ...fill, ...b].map(x => x.padStart(4, '0').toLowerCase());
}
function networkOf(ip) {
  if (!ip) return null;
  ip = String(ip).trim().replace(/^::ffff:/i, '');
  return ip.includes(':') ? expand6(ip.split('%')[0]).slice(0, 4).join(':') + '::/64' : ip;
}

// CREDITS: settings, roles and bans live in ONE small blob, kept in memory for 20 s per warm function
let secretMem = null, metaMem = null, metaAt = 0;
async function secret(s) {
  if (secretMem) return secretMem;
  let v = await s.get('meta/secret');
  if (!v) { v = crypto.randomBytes(32).toString('hex'); await s.set('meta/secret', v); }
  return (secretMem = v);
}
async function getMeta(s, fresh) {
  if (!fresh && metaMem && now() - metaAt < 20000) return metaMem;
  const m = (await s.get('meta/state', { type: 'json' })) || {};
  if ((m.cfgV || 0) < 2 && m.cfg) { m.cfg.postMax = 4; m.cfgV = 2; } // new default: 4 clips per window
  metaMem = { cfgV: m.cfgV || 2, devTimeouts: m.devTimeouts || {}, fpTimeouts: m.fpTimeouts || {}, cfg: { ...DEFAULT_CFG, ...(m.cfg || {}) }, roles: m.roles || structuredClone(DEFAULT_ROLES), devBans: m.devBans || {}, netBans: m.netBans || {}, nets: m.nets || {} };
  metaAt = now();
  if (!meterCache || now() - meterCacheAt > 120000) { meterCache = ((await s.get('meter/' + cycleStart(metaMem.cfg).key, { type: 'json' })) || { calls: 0, reqs: 0, ms: 0, bytes: 0 }); meterCacheAt = now(); }
  return metaMem;
}
async function putMeta(s, m) {
  for (const k of ['devTimeouts', 'fpTimeouts']) for (const [x, t] of Object.entries(m[k] || {})) if (t < now()) delete m[k][x]; // drop expired timeouts
  metaMem = m; metaAt = now(); await s.setJSON('meta/state', m);
}
const spamMem = new Map(); // recent messages per person (fast path; strikes are saved on the account)
async function sign(s, p) { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', await secret(s)).update(b).digest('base64url'); }
async function readTok(s, req) {
  const a = req.headers.get('authorization') || ''; const t = a.startsWith('Bearer ') ? a.slice(7) : '';
  const [b, sig] = t.split('.'); if (!b || !sig) return null;
  const good = crypto.createHmac('sha256', await secret(s)).update(b).digest('base64url');
  if (good.length !== sig.length || good !== sig) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > now() ? p : null; } catch { return null; }
}
function filterText(text, cfg, immune) {
  let t = String(text || '');
  if (immune || !cfg.wordFilter?.length) return t;
  for (const w of cfg.wordFilter) { if (!w) continue; t = t.replace(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => '*'.repeat(m.length)); }
  return t;
}
const slowMem = new Map();

// ---------------------------------------------------------------- credit meter (estimate; flushed in batches so it costs nothing extra)
let meterMem = { calls: 0, reqs: 0, ms: 0, bytes: 0, at: now() }, meterCache = null, meterCacheAt = 0;
const DAILY_LIMIT = 100000; // Cloudflare free plan: requests per day
function cycleStart() { const d = new Date(); const st = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); return { st, end: st + 864e5, key: new Date(st).toISOString().slice(0, 10) }; }
async function flushMeter(s, cfg, force) {
  if (!force && meterMem.calls < 60 && now() - meterMem.at < 180000) return meterCache;
  const { key } = cycleStart(cfg); const k = 'meter/' + key;
  const m = (await s.get(k, { type: 'json' })) || { calls: 0, reqs: 0, ms: 0, bytes: 0 };
  m.calls += meterMem.calls; m.reqs += meterMem.reqs; m.ms += meterMem.ms; m.bytes += meterMem.bytes;
  meterMem = { calls: 0, reqs: 0, ms: 0, bytes: 0, at: now() };
  await s.setJSON(k, m); meterCache = m; meterCacheAt = now(); return m;
}
function creditsOf(m) {
  if (!m) return { total: 0, req: 0, compute: 0, bw: 0 };
  const req = (m.reqs + m.calls) * RATE.req, compute = m.ms / 3.6e6 * RATE.gbHour, bw = m.bytes / 1073741824 * RATE.gb;
  return { total: req + compute + bw, req, compute, bw };
}
// 0 normal · 1 slower syncing · 2 slower + smaller clips · 3 near today's free limit: new clips paused
function saverLevel(cfg) {
  if (cfg.saverForce >= 0) return cfg.saverForce;
  const m = meterCache; if (!m) return 0;
  const f = (m.calls + meterMem.calls) / DAILY_LIMIT; // page files are free and unlimited; only server calls count
  return f >= .97 ? 3 : f >= .85 ? 2 : f >= .7 ? 1 : 0;
}

export default async (req, context) => {
  ENV = context?.env || ENV;
  const t0 = now(); let res, bytesOut = 0;
  try { res = await handle(req, context); } finally {
    meterMem.calls++; meterMem.ms += now() - t0;
    const len = Number(res?.headers?.get('content-length')) || 0; bytesOut += len || 600;
    meterMem.bytes += bytesOut + (res?._extraBytes || 0); meterMem.reqs += res?._extraReqs || 0;
    try { const M = metaMem; if (M) await flushMeter(store(), M.cfg); } catch {}
  }
  return res;
};
async function handle(req, context) {
  const s = store();
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [route, a1, a2, a3, a4] = parts;
  const method = req.method;

  // ---------------- CREDITS: video parts & thumbnails are cached forever on Netlify's CDN,
  // so after the first view nobody's request ever reaches this function again.
  if (route === 'snd') { // soundboard sounds: cached on Netlify's CDN forever after the first play
    const raw = await s.get(`snd/${a1}`, { type: 'arrayBuffer' });
    const lib = (await s.get('meta/sounds', { type: 'json' })) || [];
    const it = lib.find(x => x.id === a1);
    if (!raw || !it || it.key !== a2) return new Response('gone', { status: 404 });
    return new Response(raw, { headers: { 'content-type': it.type || 'audio/mpeg', 'cache-control': 'public, max-age=31536000, immutable', 'netlify-cdn-cache-control': 'public, durable, max-age=31536000, immutable' } });
  }
  if (route === 'g') { // chat GIFs: cached on Netlify's CDN forever after the first view
    const raw = await s.get(`gif/${a1}/${a2}`, { type: 'arrayBuffer' });
    if (!raw || a3 !== (await s.get(`gifkey/${a1}/${a2}`))) return new Response('gone', { status: 404 });
    return new Response(raw, { headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=31536000, immutable', 'netlify-cdn-cache-control': 'public, durable, max-age=31536000, immutable' } });
  }
  if (route === 'vs') { // stream a clip with seeking: /api/vs/<net>/<id>/<key>  (on Cloudflare this is free)
    const meta = await s.get(`posts/${a1}/${a2}`, { type: 'json' });
    if (!meta || meta.key !== a3 || meta.kind === 'post' || !meta.ready) return new Response('gone', { status: 404 });
    const size = meta.size, type = (meta.mime || 'video/webm').split(';')[0];
    const head = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400' };
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
    if (!m) {
      let i = 0; const body = new ReadableStream({ async pull(c) { if (i >= meta.parts) return c.close(); const b = await s.get(`vid/${a1}/${a2}/${i++}`, { type: 'arrayBuffer' }); if (!b) return c.error(new Error('missing')); c.enqueue(new Uint8Array(b)); } });
      return new Response(body, { headers: { ...head, 'content-length': String(size) } });
    }
    const start = m[1] ? +m[1] : Math.max(0, size - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    if (start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    const part = Math.floor(start / PART_MAX), off = start - part * PART_MAX, len = Math.min(end - start + 1, PART_MAX - off);
    const body = await s.range(`vid/${a1}/${a2}/${part}`, off, len);
    if (!body) return new Response('missing', { status: 404 });
    return new Response(body, { status: 206, headers: { ...head, 'content-range': `bytes ${start}-${start + body.byteLength - 1}/${size}`, 'content-length': String(body.byteLength) } });
  }
  if (route === 'pi') { // post pictures: from Netlify storage, or proxied from Cloudflare when it's blocked
    const meta = await s.get(`posts/${a1}/${a2}`, { type: 'json' });
    if (!meta || meta.key !== a3 || !meta.img) return new Response('gone', { status: 404 });
    let body;
    if (meta.img.r2key) { if (!r2on()) return new Response('gone', { status: 404 }); const r = await fetch(r2url('GET', meta.img.r2key)); if (!r.ok) return new Response('upstream', { status: 502 }); body = await r.arrayBuffer(); }
    else body = await s.get(`pimg/${a1}/${a2}`, { type: 'arrayBuffer' });
    if (!body) return new Response('missing', { status: 404 });
    return new Response(body, { headers: { 'content-type': meta.img.type || 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable', 'netlify-cdn-cache-control': 'public, durable, max-age=31536000, immutable' } });
  }
  if (route === 'vp') { // backup for when a VPN/blocker blocks Cloudflare: /api/vp/<net>/<id>/<key>/<piece>
    const [net, id, key, n] = [a1, a2, a3, Number(a4) || 0];
    const meta = await s.get(`posts/${net}/${id}`, { type: 'json' });
    if (!meta || meta.key !== key || !meta.r2key || !r2on()) return new Response('gone', { status: 404 });
    const PIECE = 4 * 1048576, start = n * PIECE, end = Math.min(meta.size, start + PIECE) - 1;
    if (start >= meta.size) return new Response('range', { status: 416 });
    const r = await fetch(r2url('GET', meta.r2key), { headers: { Range: `bytes=${start}-${end}` } });
    if (!r.ok) return new Response('upstream ' + r.status, { status: 502 });
    const body = await r.arrayBuffer();
    return new Response(body, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', 'netlify-cdn-cache-control': 'public, durable, max-age=31536000, immutable' } });
  }
  if (route === 'v' || route === 't') {
    const [net, id, key, n] = [a1, a2, a3, a4];
    const meta = await s.get(`posts/${net}/${id}`, { type: 'json' });
    if (!meta || meta.key !== key) return new Response('gone', { status: 404 });
    const body = route === 't' ? (meta.thumb ? Buffer.from(meta.thumb.split(',')[1] || '', 'base64') : null)
      : await s.get(`vid/${net}/${id}/${Number(n)}`, { type: 'arrayBuffer' });
    if (!body) return new Response('missing', { status: 404 });
    const cache = 'public, max-age=31536000, immutable';
    return new Response(body, { headers: { 'content-type': route === 't' ? 'image/jpeg' : 'application/octet-stream', 'cache-control': cache, 'netlify-cdn-cache-control': 'public, durable, max-age=31536000, immutable' } });
  }

  const ipNet = networkOf(context.ip || req.headers.get('cf-connecting-ip'));
  if (!ipNet) return fail('Could not detect your network.');
  const net = sha((await secret(s)) + '|' + ipNet).slice(0, 20);
  const device = String(req.headers.get('x-device') || '').slice(0, 64);
  const fp = String(req.headers.get('x-fp') || '').slice(0, 64);
  const M = await getMeta(s);
  const cfg = M.cfg;
  const clipCapMB = () => r2on() ? cfg.r2MaxMB : cfg.maxVideoMB;

  // network & device bans (one cached blob — no extra reads)
  if (M.netBans[net]) return fail('This network is banned. ' + (M.netBans[net].reason || ''), 403, { banned: true, network: true });
  if (device && M.devBans[device]) return fail('This device is banned. ' + (M.devBans[device].reason || ''), 403, { banned: true, device: true });

  // who is calling
  const tok = await readTok(s, req);
  // spam timeout: locks this device (and a data-cleared copy of it) out of EVERYTHING until it ends
  const devTO = Math.max(M.devTimeouts[device] || 0, fp ? M.fpTimeouts[net + '|' + fp] || 0 : 0);
  const ownerTokEarly = tok?.u === OWNER && tok?.o === 1;
  if (devTO > now() && !ownerTokEarly && route !== 'hello') return fail('You are timed out for spamming.', 403, { timeout: devTO });
  const isOwnerTok = tok?.u === OWNER && tok?.o === 1;
  let me = tok && (tok.n === net || isOwnerTok) ? tok.u : null;
  const myNet = isOwnerTok ? (tok.n || net) : net;
  if (tok && !me && route !== 'hello') return fail('You are on a different network now. Sign in again on this network.', 401, { relogin: true });

  // lazily loaded records
  let meRec;
  const userKey = (u, n = myNet) => `users/${n}/${u}`;
  const loadMe = async () => (meRec !== undefined ? meRec : (meRec = me ? await s.get(userKey(me), { type: 'json' }) : null));
  const saveMe = () => s.setJSON(userKey(me), meRec);
  const isOwner = () => me === OWNER && meRec?.owner;
  const rankOf = (rec) => rec?.u === OWNER && rec?.owner ? 1000 : Math.max(0, ...(rec?.roles || []).map(r => M.roles[r]?.rank || 0));
  const permsOf = (rec) => rec?.u === OWNER && rec?.owner ? ALL.slice() : uniq((rec?.roles || []).flatMap(r => M.roles[r]?.perms || []));
  const can = (perm) => isOwner() || permsOf(meRec).includes(perm);
  const until = (o) => o && (o.until === 0 || o.until > now());
  const statusOf = (rec) => ({
    banned: until(rec?.ban) ? rec.ban : null, muted: until(rec?.mute) ? rec.mute : null, postban: until(rec?.postban) ? rec.postban : null,
    warns: (rec?.warns || []).filter(w => !w.ack), resetPw: !!rec?.resetPw
  });
  const bump = async (u, n = myNet) => { const k = `ver/${n}/${u}`; const v = Number(await s.get(k)) || 0; await s.set(k, String(v + 1)); };
  const audit = async (action, target, extra = '') => {
    const log = (await s.get('meta/audit', { type: 'json' })) || [];
    log.unshift({ t: now(), by: me, net: myNet.slice(0, 6), action, target, extra: String(extra).slice(0, 200) });
    await s.setJSON('meta/audit', log.slice(0, 600));
  };
  // ---- anti-spam: same message allowed every 8 s; 4 fast repeats or a flood = 5 s cooldown + warning; 3 strikes = 10-minute timeout
  async function spamCheck(kind, text) {
    if (isOwner()) return null;
    const k = myNet + '|' + me, st = spamMem.get(k) || { msgs: [], same: 0, lastText: '', lastSameT: 0, cool: 0 };
    spamMem.set(k, st); const t = now();
    const strike = async (why) => {
      st.cool = t + 5000;
      meRec.spamStrikes = [...(meRec.spamStrikes || []).filter(x => x > t - 180000), t];
      if (meRec.spamStrikes.length >= 3) {
        const until = t + 10 * 60000; meRec.timeout = until; meRec.spamStrikes = [];
        if (device) M.devTimeouts[device] = until; if (fp) M.fpTimeouts[myNet + '|' + fp] = until;
        await saveMe(); await putMeta(s, M); await audit('auto timeout (spam)', me, why);
        return fail('You were timed out for 10 minutes for spamming.', 403, { timeout: until });
      }
      await saveMe();
      return fail(`Slow down! Wait 5 seconds. If you keep spamming you will be timed out for 10 minutes (strike ${meRec.spamStrikes.length}/3).`, 429, { cooldown: 5, spam: true });
    };
    if (st.cool > t) return strike('kept going during cooldown');
    st.msgs = st.msgs.filter(x => x > t - 6000); st.msgs.push(t);
    if (kind === 'msg') {
      const norm = String(text || '').trim().toLowerCase();
      if (norm && norm === st.lastText && t - st.lastSameT < 8000) st.same++; else st.same = 1;
      st.lastText = norm; st.lastSameT = t;
      if (st.same >= 4) { st.same = 0; return strike('same message 4 times'); }
      if (st.msgs.length > 8) return strike('message flood');
    } else if (st.msgs.length > 12) return strike(kind + ' flood');
    return null;
  }
  const guard = async () => {
    if (!me) return fail('Sign in first.', 401);
    await loadMe();
    if (!meRec) return fail('Account not found. Sign in again.', 401, { relogin: true });
    const st = statusOf(meRec);
    if ((meRec.timeout || 0) > now() && !isOwner()) return fail('You are timed out for spamming.', 403, { timeout: meRec.timeout });
    if (st.banned && !isOwner()) return fail(st.banned.until === 0 ? 'You are banned.' : 'You are suspended.', 403, { banned: true, status: st });
    if (cfg.shutdown && !isOwner()) return fail(cfg.shutdownMsg || 'UnStevened Social is closed right now.', 503, { shutdown: true });
    if (cfg.maintenance && !can('settings')) return fail('UnStevened Social is under maintenance. Check back soon!', 503, { maintenance: true });
    return null;
  };

  // ---------------- post-limit bookkeeping (account + device + device fingerprint)
  const windowMs = () => cfg.postWindowMin * 60000;
  const recent = (arr) => (arr || []).filter(t => t > Math.max(now() - windowMs(), cfg.limitEpoch || 0));
  async function limitInfo() {
    await loadMe();
    const dev = device ? ((await s.get(`dev/${device}`, { type: 'json' })) || {}) : {};
    const fpr = fp ? ((await s.get(`fp/${myNet}/${fp}`, { type: 'json' })) || {}) : {};
    let times = uniq([...recent(meRec?.postTimes), ...recent(dev.postTimes)]);
    // a brand-new device id with a fingerprint that just hit its limit = someone cleared their data
    // (only when this device id first appeared AFTER that fingerprint used up its posts, so two
    //  people with the same phone model don't block each other)
    const fpt = recent(fpr.postTimes).sort((x, y) => x - y);
    if (fpt.length >= cfg.postMax && !(dev.postTimes || []).length && (!dev.seen || dev.seen >= fpt[cfg.postMax - 1])) times = uniq([...times, ...fpt]);
    times.sort((x, y) => x - y);
    const bonus = meRec?.extraPosts || 0;
    const max = cfg.postMax + bonus;
    const bypass = isOwner();
    const used = times.length;
    const left = bypass ? 99 : Math.max(0, max - used);
    const nextAt = left > 0 ? 0 : (times[used - max] || times[0]) + windowMs();
    return { used, max, left, bypass, nextAt, windowMin: cfg.postWindowMin, times, dev, fpr };
  }
  async function recordPost() {
    const t = now();
    meRec.postTimes = [...recent(meRec.postTimes), t]; await saveMe();
    if (device) { const d = (await s.get(`dev/${device}`, { type: 'json' })) || {}; d.postTimes = [...recent(d.postTimes), t]; d.seen = d.seen || t; await s.setJSON(`dev/${device}`, d); }
    if (fp) { const f = (await s.get(`fp/${myNet}/${fp}`, { type: 'json' })) || {}; f.postTimes = [...recent(f.postTimes), t]; await s.setJSON(`fp/${myNet}/${fp}`, f); }
  }
  async function touchDevice(u) {
    if (!device) return;
    const d = (await s.get(`dev/${device}`, { type: 'json' })) || {};
    d.seen = d.seen || now(); d.users = uniq([...(d.users || []), `${myNet}:${u}`]).slice(-20); d.fp = fp || d.fp;
    await s.setJSON(`dev/${device}`, d);
    return d;
  }
  const pub = (rec) => {
    if (!rec) return rec;
    const hidden = rec.hideRoles && permsOf(rec).includes('roles.hide');
    return {
      u: rec.u, display: rec.display || '', bio: rec.bio || '', avatar: rec.avatar || '', verified: !!rec.verified || (rec.u === OWNER && !!rec.owner),
      roles: hidden ? [] : rec.u === OWNER && rec.owner ? ['owner'] : (rec.roles || []),
      color: hidden ? '' : permsOf(rec).includes('chat.color') ? (M.roles[(rec.roles || [])[0]]?.color || '') : (rec.u === OWNER && rec.owner ? '#ffc928' : '')
    };
  };

  // presence (who's online): one small blob per network, each person updates it at most once a minute
  let presCache = null;
  const getPres = async () => presCache || (presCache = (await s.get(`pres/${myNet}`, { type: 'json' })) || {});
  async function touchPres(force) {
    const k = myNet + '|' + me; if (!force && now() - (presMem.get(k) || 0) < 50000) return;
    presMem.set(k, now()); const p = await getPres(); p[me] = now();
    for (const [u, t] of Object.entries(p)) if (now() - t > 7 * 864e5) delete p[u];
    await s.setJSON(`pres/${myNet}`, p);
  }
  // send a notification (only if they turned it on and aren't already in the app)
  async function notify(u, kind, data, opts = {}) {
    try {
      const k = userKey(u); const r = await s.get(k, { type: 'json' }); if (!r?.pushSubs?.length) return;
      if (!({ ...DEF_PREFS, ...(r.prefs || {}) })[kind]) return;
      const p = await getPres(); if (!opts.always && p[u] && now() - p[u] < 45000) return;
      let changed = false;
      if (opts.throttle) { r.pushAt = r.pushAt || {}; if (now() - (r.pushAt[opts.throttle] || 0) < (opts.every || 120000)) return; r.pushAt[opts.throttle] = now(); changed = true; }
      const dead = await sendPush(s, r.pushSubs, data, opts.urgent);
      if (dead.length) { r.pushSubs = r.pushSubs.filter(x => !dead.includes(x.endpoint)); changed = true; }
      if (changed) await s.setJSON(k, r);
    } catch (e) { console.error('notify', e); }
  }

  try {
    // ============================================================ public
    if (route === 'hello') {
      if (me) await loadMe();
      if (me && !meRec) me = null;
      const info = me ? await limitInfo() : null;
      const out = json({
        ok: true, network: myNet.slice(0, 6).toUpperCase(), wrongNetwork: !!tok && !me,
        timeout: isOwnerTok ? 0 : Math.max(devTO, meRec?.timeout || 0) > now() ? Math.max(devTO, meRec?.timeout || 0) : 0,
        me: me ? { ...pub(meRec), owner: isOwner(), perms: permsOf(meRec), status: statusOf(meRec), hideRoles: !!meRec.hideRoles, prefs: { ...DEF_PREFS, ...(meRec.prefs || {}) }, pushCount: (meRec.pushSubs || []).length } : null,
        limit: info && { used: info.used, max: info.max, left: info.left, bypass: info.bypass, nextAt: info.nextAt, windowMin: info.windowMin },
        cfg: { googleId: ENV.GOOGLE_CLIENT_ID || '', googleDomain: cfg.googleDomain || '', codeOn: cfg.codeOn !== false, r2: true, gifs: cfg.gifs, gifMaxKB: cfg.gifMaxKB, shutdown: cfg.shutdown, shutdownMsg: cfg.shutdownMsg, maxVideoSec: cfg.maxVideoSec, maxVideoSecLong: cfg.maxVideoSecLong, maxVideoMB: clipCapMB(), groupMax: Math.min(5, cfg.groupMax), maintenance: cfg.maintenance, signups: cfg.signups, postsOpen: cfg.postsOpen, dmOpen: cfg.dmOpen, callsOpen: cfg.callsOpen, motd: cfg.motd },
        announce: cfg.announce, saver: saverLevel(cfg), roles: Object.fromEntries(Object.entries(M.roles).map(([k, r]) => [k, { name: r.name, color: r.color, badge: r.badge, rank: r.rank }]))
      });
      if (url.searchParams.get('boot')) { out._extraReqs = 8; out._extraBytes = 60000; } // page + scripts (mostly browser-cached)
      return out;
    }

    // ============================================================ entry code (you must crack it to get in — no hints)
    if (route === 'code') {
      if (a1 === 'new') {
        const r = randInt(CODE_RULES.length), code = rnd4();
        return json({ token: await sealCode(s, { r, code, t: now() }), code: code.join('') });
      }
      const b = await req.json().catch(() => ({}));
      const c = await openCode(s, b.token); if (!c) return fail('That code expired. Here is a new one.', 410, { newCode: true });
      const answer = CODE_RULES[c.r][1](c.code).join('');
      const k = device || ipNet;
      if (a1 === 'check') {
        const tr = codeTries.get('g' + k) || { n: 0, at: now() };
        if (now() - tr.at > 600000) { tr.n = 0; tr.at = now(); }
        if (tr.n >= 25) return fail('Too many wrong answers. Wait a few minutes.', 429);
        const per = codeTries.get(b.token) || 0;
        if (per >= 5) return fail('Too many tries on this code. Here is a new one.', 429, { newCode: true });
        if (String(b.guess || '').replace(/\D/g, '') !== answer) { tr.n++; codeTries.set('g' + k, tr); codeTries.set(b.token, per + 1); return json({ correct: false, left: 4 - per }); }
        codeTries.delete(b.token);
        return json({ correct: true, pass: await sign(s, { pass: 1, d: device, iat: now(), exp: now() + 400 * 864e5 }) });
      }
      if (a1 === 'reveal') {
        const tr = codeTries.get('r' + k) || { n: 0, at: 0 };
        if (tr.n >= 5 && now() - tr.at < 10 * 60000) return fail('Too many wrong passwords. Try again in 10 minutes.', 429);
        if (await hashPass(String(b.password || ''), CODE_SALT) !== CODE_HASH) { codeTries.set('r' + k, { n: tr.n + 1, at: now() }); return fail('Wrong password.', 403); }
        codeTries.delete('r' + k);
        return json({ answer, logic: CODE_RULES[c.r][0] });
      }
    }
    // everything else needs the entry pass (the owner skips it)
    const passTok = req.headers.get('x-pass') || '';
    const passOk = isOwnerTok || cfg.codeOn === false || await (async () => { const [pb, ps] = passTok.split('.'); if (!pb || !ps) return false; const good = crypto.createHmac('sha256', await secret(s)).update(pb).digest('base64url'); if (good !== ps) return false; try { const p = JSON.parse(Buffer.from(pb, 'base64url').toString()); return p.pass === 1 && p.exp > now() && (!p.d || p.d === device) && (p.iat || 0) >= (cfg.codeEpoch || 0); } catch { return false; } })();
    if (!passOk && !(route === 'login' && method === 'POST')) return fail('Crack the code to get in.', 403, { needPass: true });

    if ((route === 'signup' || route === 'login') && method === 'POST') {
      const b = await req.json().catch(() => ({}));
      const u = clean(b.username), pw = String(b.password || '');
      const ownerLogin = route === 'login' && u === OWNER && !!ownerHash() && await hashPass(pw, OWNER_SALT) === ownerHash();
      if (!/^[a-z0-9_.]{3,20}$/.test(u)) return fail('Username must be 3–20 letters, numbers, _ or .');
      if (pw.length < 4 || pw.length > 100) return fail('Password must be at least 4 characters.');
      if (u === OWNER && !ownerLogin) return fail(ownerHash() ? (route === 'login' ? 'Wrong username or password.' : 'That username is reserved.') : 'The owner password is not set up yet — run "Set Owner Password.bat" and add OWNER_HASH in Cloudflare.');
      if (cfg.shutdown && !ownerLogin) return fail(cfg.shutdownMsg || 'UnStevened Social is closed right now.', 503, { shutdown: true });
      const key = userKey(u, net);
      let rec = await s.get(key, { type: 'json' });
      const GID = ENV.GOOGLE_CLIENT_ID; let gUser = null;
      if (GID && !ownerLogin && (route === 'signup' || b.google || (rec && !rec.google))) {
        try { gUser = await verifyGoogle(b.google, GID, cfg.googleDomain || ''); } catch (e) { return fail(e.message, 403, { needGoogle: true }); }
        const taken = await s.get(`gid/${net}/${gUser.sub}`);
        if (taken && taken !== u) return fail(`That Google account already has an account here: @${taken}`, 409, { needGoogle: true });
      }
      if (route === 'signup') {
        if (!cfg.signups) return fail('New accounts are closed right now.', 403);
        if (rec) return fail('That username is taken on this network.', 409);
        const dev = device ? ((await s.get(`dev/${device}`, { type: 'json' })) || {}) : {};
        if ((dev.users || []).filter(x => x.startsWith(net + ':')).length >= 6) return fail('Too many accounts on this device.', 429);
        const salt = crypto.randomBytes(16).toString('hex');
        rec = { u, salt, hash: await hashPass(pw, salt), created: now(), roles: [], postTimes: [], ...(gUser ? { google: gUser } : {}) };
        await s.setJSON(key, rec);
        M.nets[net] = { ...(M.nets[net] || { first: now() }), last: now(), users: (M.nets[net]?.users || 0) + 1 };
        await putMeta(s, M);
      } else if (ownerLogin) {
        rec = { ...(rec || { created: now(), roles: [], postTimes: [] }), u, salt: OWNER_SALT, hash: ownerHash(), owner: true };
        await s.setJSON(key, rec);
      } else if (!rec || rec.hash !== await hashPass(pw, rec.salt)) return fail('Wrong username or password (accounts only exist on the network they were made on).', 401);
      if (gUser && rec.google && rec.google.sub !== gUser.sub) return fail('This account is linked to a different Google account.', 403, { needGoogle: true });
      if (gUser) { rec.google = gUser; await s.set(`gid/${net}/${gUser.sub}`, u); }
      if (until(rec.ban) && !rec.owner) return fail(rec.ban.until === 0 ? 'This account is banned.' : 'This account is suspended until ' + new Date(rec.ban.until).toLocaleString() + '.', 403, { banned: true });
      rec.lastSeen = now(); rec.devices = uniq([...(rec.devices || []), device].filter(Boolean)).slice(-10);
      await s.setJSON(key, rec);
      await touchDevice(u);
      const token = await sign(s, { u, n: net, o: ownerLogin ? 1 : 0, exp: now() + 1000 * 60 * 60 * 24 * 180 });
      return json({ ok: true, token, user: u });
    }

    // everything below needs an account
    const g = await guard(); if (g) return g;



    // ============================================================ sync (CREDITS: 1 tiny read when nothing changed)
    if (route === 'sync') {
      const v = Number(await s.get(`ver/${myNet}/${me}`)) || 0;
      const views = (url.searchParams.get('views') || '').split(',').filter(x => /^[a-z0-9]{6,30}$/.test(x)).slice(0, 30);
      if (views.length) { // piggy-backed view counts (no separate request per view)
        const idx = (await s.get(`index/${myNet}`, { type: 'json' })) || [];
        let ch = false; for (const p of idx) if (views.includes(p.id)) { p.views = (p.views || 0) + 1; ch = true; if (!p.r2key) { meterMem.bytes += p.size || 0; meterMem.reqs += p.parts || 1; } }
        if (ch) await s.setJSON(`index/${myNet}`, idx);
      }
      const saver = saverLevel(cfg);
      await touchPres(!!url.searchParams.get('back'));
      let pres;
      if (url.searchParams.get('pres')) { const R = (await s.get(`rel/${myNet}/${me}`, { type: 'json' })) || {}; const P = await getPres(); pres = Object.fromEntries((R.friends || []).map(u => [u, P[u] || 0])); }
      if (Number(url.searchParams.get('v')) === v) return json({ same: true, v, saver, pres, codeOn: cfg.codeOn !== false });
      const inbox = (await s.get(`inbox/${myNet}/${me}`, { type: 'json' })) || {};
      const rel = (await s.get(`rel/${myNet}/${me}`, { type: 'json' })) || {};
      const ringId = await s.get(`ring/${myNet}/${me}`);
      let ring = null;
      if (ringId) {
        const c = await s.get(`calls/${myNet}/${ringId}`, { type: 'json' });
        if (c && c.state !== 'ended' && now() - c.created < 60000 && !c.members[me]) ring = { id: c.id, from: c.from, kind: c.kind, gid: c.gid, gname: c.gname, video: c.video };
        else await s.delete(`ring/${myNet}/${me}`);
      }
      return json({ v, saver, pres, codeOn: cfg.codeOn !== false, inbox, requests: (rel.incoming || []).length, ring, status: statusOf(meRec) });
    }

    // ============================================================ profile & account
    if (route === 'profile' && method === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (b.display !== undefined) meRec.display = filterText(String(b.display).slice(0, 30), cfg, can('chat.filterimmune'));
      if (b.bio !== undefined) meRec.bio = filterText(String(b.bio).slice(0, 160), cfg, can('chat.filterimmune'));
      if (b.hideRoles !== undefined && can('roles.hide')) meRec.hideRoles = !!b.hideRoles;
      if (typeof b.avatar === 'string' && (b.avatar === '' || (b.avatar.startsWith('data:image/') && b.avatar.length < 60000))) meRec.avatar = b.avatar;
      await saveMe();
      return json({ ok: true, me: pub(meRec) });
    }
    if (route === 'password' && method === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (isOwner()) return fail("The owner password can't be changed here.");
      if (!meRec.resetPw && meRec.hash !== await hashPass(b.old || '', meRec.salt)) return fail('Your current password is wrong.');
      if (String(b.password || '').length < 4) return fail('New password must be at least 4 characters.');
      meRec.salt = crypto.randomBytes(16).toString('hex'); meRec.hash = await hashPass(b.password, meRec.salt); meRec.resetPw = false;
      await saveMe(); return json({ ok: true });
    }
    if (route === 'bye' && method === 'POST') {
      presMem.delete(myNet + '|' + me); const p = await getPres(); p[me] = -now(); await s.setJSON(`pres/${myNet}`, p);
      return json({ ok: true });
    }
    if (route === 'prefs' && method === 'POST') {
      const b = await req.json().catch(() => ({}));
      meRec.prefs = Object.fromEntries(Object.keys(DEF_PREFS).map(k => [k, b[k] === undefined ? ({ ...DEF_PREFS, ...(meRec.prefs || {}) })[k] : !!b[k]]));
      await saveMe(); return json({ ok: true, prefs: meRec.prefs });
    }
    if (route === 'push') {
      if (a1 === 'key') return json({ key: (await vapid(s)).pub });
      const b = await req.json().catch(() => ({}));
      if (a1 === 'subscribe' && method === 'POST') {
        const sub = b.sub || {};
        if (!/^https:\/\//.test(sub.endpoint || '') || !sub.keys?.p256dh || !sub.keys?.auth) return fail('Bad subscription.');
        meRec.pushSubs = [...(meRec.pushSubs || []).filter(x => x.endpoint !== sub.endpoint), { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, t: now() }].slice(-5);
        await saveMe(); return json({ ok: true });
      }
      if (a1 === 'unsubscribe' && method === 'POST') { meRec.pushSubs = (meRec.pushSubs || []).filter(x => x.endpoint !== b.endpoint); await saveMe(); return json({ ok: true }); }
      if (a1 === 'test' && method === 'POST') { const dead = await sendPush(s, meRec.pushSubs, { title: 'UnStevened Social', body: 'Notifications are working!', tag: 'test', url: '/' }); return json({ ok: true, sent: (meRec.pushSubs || []).length - dead.length }); }
    }
    if (route === 'warns' && a1 === 'ack' && method === 'POST') {
      meRec.warns = (meRec.warns || []).map(w => ({ ...w, ack: true })); await saveMe(); return json({ ok: true });
    }
    if (route === 'user' && a1 && method === 'GET') {
      const r = await s.get(userKey(clean(a1)), { type: 'json' });
      if (!r) return fail('No such user on this network.', 404);
      const idx = (await s.get(`index/${myNet}`, { type: 'json' })) || [];
      const theirs = idx.filter(p => p.user === r.u && !p.hidden);
      const R = (await s.get(`rel/${myNet}/${r.u}`, { type: 'json' })) || {};
      const F = { followers: [], following: [], ...((await s.get(`fol/${myNet}/${r.u}`, { type: 'json' })) || {}) };
      return json({ user: pub(r), lastActive: (await getPres())[r.u] || 0, clips: theirs.length, likes: theirs.reduce((n, p) => n + (p.likes || []).length, 0), views: theirs.reduce((n, p) => n + (p.views || 0), 0), friends: (R.friends || []).length, followers: F.followers.length, following: F.following.length, iFollow: F.followers.includes(me), followsMe: F.following.includes(me), joined: r.created });
    }
    if (route === 'limit') { const i = await limitInfo(); return json({ used: i.used, max: i.max, left: i.left, bypass: i.bypass, nextAt: i.nextAt, windowMin: i.windowMin }); }

    // ============================================================ clips
    const vurl = (p, n) => `/api/v/${myNet}/${p.id}/${p.key}/${n}`;
    const imgUrl = (p) => !p.img ? '' : p.img.r2key ? r2url('GET', p.img.r2key, 604800) : `/api/pi/${myNet}/${p.id}/${p.key}`;
    const pollView = (p) => p.poll && {
      q: p.poll.q, multi: !!p.poll.multi, total: Object.keys(p.votes || {}).length,
      opts: p.poll.opts.map((t, i) => ({ t, n: Object.values(p.votes || {}).filter(v => v.includes(i)).length })), mine: (p.votes || {})[me] || []
    };
    const view = (p) => p.kind === 'post' ? ({
      kind: 'post', id: p.id, user: p.user, text: p.text || '', created: p.created, likes: (p.likes || []).length, liked: (p.likes || []).includes(me),
      mine: p.user === me, pinned: !!p.pinned, featured: !!p.featured, hidden: !!p.hidden, comments: p.comments || 0, views: p.views || 0,
      img: imgUrl(p), imgBackup: p.img ? `/api/pi/${myNet}/${p.id}/${p.key}` : '', poll: pollView(p)
    }) : ({
      kind: 'clip', comments: p.comments || 0,
      id: p.id, user: p.user, title: p.title, game: p.game || '', created: p.created, duration: p.duration || 0, mime: p.mime,
      parts: p.parts, size: p.size, views: p.views || 0, likes: (p.likes || []).length, liked: (p.likes || []).includes(me),
      mine: p.user === me, pinned: !!p.pinned, featured: !!p.featured, hidden: !!p.hidden,
      thumb: `/api/t/${myNet}/${p.id}/${p.key}`, stream: p.r2key ? '' : `/api/vs/${myNet}/${p.id}/${p.key}`, backup: p.r2key ? `/api/vp/${myNet}/${p.id}/${p.key}/` : '', urls: p.r2key ? [r2url('GET', p.r2key, 604800)] : Array.from({ length: p.parts }, (_, n) => vurl(p, n))
    });
    if (route === 'posts' && !a1 && method === 'GET') {
      const idx = (await s.get(`index/${myNet}`, { type: 'json' })) || [];
      const who = clean(url.searchParams.get('user') || '');
      const mine = url.searchParams.get('mine') === '1';
      const fol = url.searchParams.get('following') === '1' ? ((await s.get(`fol/${myNet}/${me}`, { type: 'json' })) || {}).following || [] : null;
      let list = idx.filter(p => mine ? p.user === me : who ? p.user === who : fol ? fol.includes(p.user) && !p.hidden : (!p.hidden || can('posts.hide')));
      list.sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0) || (y.featured ? 1 : 0) - (x.featured ? 1 : 0) || y.created - x.created);
      const page = Math.max(0, Number(url.searchParams.get('page')) || 0), per = 10;
      const users = {};
      const slice = list.slice(page * per, page * per + per);
      for (const u of uniq(slice.map(p => p.user))) users[u] = pub(await s.get(userKey(u), { type: 'json' }));
      const r = json({ posts: slice.map(view), users, more: list.length > (page + 1) * per });
      r._extraReqs = slice.length; r._extraBytes = slice.length * 22000; return r;
    }
    if (route === 'posts' && a1 === 'text' && method === 'POST') { // text / picture / poll posts
      if (!cfg.postsOpen && !can('settings')) return fail('Posting is turned off right now.', 403);
      const st = statusOf(meRec); if (st.postban || st.muted) return fail('You can\'t post right now.', 403);
      { const sp = await spamCheck('post'); if (sp) return sp; }
      const recentT = (meRec.textTimes || []).filter(t => t > now() - windowMs());
      if (!isOwner() && recentT.length >= cfg.textPostMax) return fail(`You can make ${cfg.textPostMax} posts every ${cfg.postWindowMin} minutes.`, 429);
      const b = await req.json().catch(() => ({}));
      const text = filterText(String(b.text || '').slice(0, 1000), cfg, can('chat.filterimmune'));
      let poll = null;
      if (b.poll) {
        const opts = (b.poll.opts || []).map(o => filterText(String(o || '').trim().slice(0, 60), cfg, false)).filter(Boolean).slice(0, 8);
        if (opts.length < 2) return fail('A poll needs at least 2 options.');
        poll = { q: filterText(String(b.poll.q || '').slice(0, 140), cfg, false), opts, multi: !!b.poll.multi };
      }
      const wantImg = b.img && Number(b.img.size) > 0;
      if (!text.trim() && !poll && !wantImg) return fail('Write something, add a picture, or add a poll.');
      if (wantImg && Number(b.img.size) > 3 * 1048576) return fail('Picture is too big (max 3 MB).');
      const id = rid(4);
      const meta = { id, kind: 'post', key: crypto.randomBytes(8).toString('hex'), user: me, text, poll, votes: {}, created: now(), likes: [], views: 0, comments: 0, ready: !wantImg };
      let putUrl = '';
      if (wantImg) {
        meta.img = { size: Number(b.img.size), type: /png|webp|gif/.test(b.img.type) ? b.img.type : 'image/jpeg' };
        if (r2on() && !b.noR2) { meta.img.r2key = `pics/${myNet}/${id}-${crypto.randomBytes(6).toString('hex')}.${meta.img.type.split('/')[1]}`; putUrl = r2url('PUT', meta.img.r2key, 1800); }
      }
      await s.setJSON(`posts/${myNet}/${id}`, meta);
      meRec.textTimes = [...recentT, now()]; await saveMe();
      if (meta.ready) { const idx = (await s.get(`index/${myNet}`, { type: 'json' })) || []; await s.setJSON(`index/${myNet}`, [meta, ...idx].slice(0, 500)); }
      return json({ ok: true, id, putUrl, needImg: wantImg && !putUrl, post: meta.ready ? view(meta) : null });
    }
    if (route === 'posts' && a1 === 'new' && method === 'POST') {
      if (!cfg.postsOpen && !can('settings')) return fail('Posting is turned off right now.', 403);
      const st = statusOf(meRec);
      if (st.postban) return fail('You are banned from posting' + (st.postban.until ? ' until ' + new Date(st.postban.until).toLocaleString() : '') + '.', 403);
      const lvl = saverLevel(cfg);
      if (lvl >= 3 && !isOwner()) return fail('The site ran low on its monthly credits, so new clips are paused until the month resets. Chats and calls still work!', 503, { saver: 3 });
      if (!device) return fail('This browser is blocking storage, so posting is disabled. Turn off private browsing.', 403);
      const info = await limitInfo();
      if (info.left <= 0) return fail('You hit your post limit.', 429, { limit: { left: 0, max: info.max, nextAt: info.nextAt } });
      const b = await req.json().catch(() => ({}));
      const maxSec = lvl >= 2 && !isOwner() ? Math.min(30, cfg.maxVideoSec) : can('posts.long') ? cfg.maxVideoSecLong : cfg.maxVideoSec;
      if (Number(b.duration) > maxSec + 2) return fail(`Clips can be up to ${maxSec} seconds. Trim it in the editor.`);
      const capMB = r2on() ? cfg.r2MaxMB : cfg.maxVideoMB * (can('posts.long') ? 2 : 1);
      if (!(b.size > 0) || b.size > capMB * 1048576) return fail(`Clip is too big (max ${capMB} MB). Trim it shorter in the editor.`);
      const id = rid(4);
      const meta = {
        id, key: crypto.randomBytes(8).toString('hex'), user: me, title: filterText(String(b.title || '').slice(0, 120), cfg, can('chat.filterimmune')),
        game: String(b.game || '').slice(0, 60), mime: String(b.mime || 'video/webm').slice(0, 60), size: Number(b.size), parts: Math.ceil(Number(b.size) / PART_MAX),
        duration: Number(b.duration) || 0, created: now(), likes: [], views: 0, ready: false,
        thumb: typeof b.thumb === 'string' && b.thumb.startsWith('data:image/jpeg') && b.thumb.length < 40000 ? b.thumb : ''
      };
      if (r2on()) { meta.r2key = `clips/${myNet}/${id}-${crypto.randomBytes(6).toString('hex')}.${/mp4/.test(meta.mime) ? 'mp4' : 'webm'}`; meta.parts = 1; }
      await s.setJSON(`posts/${myNet}/${id}`, meta);
      await recordPost(); // counts immediately — deleting a clip never gives the post back
      if (meta.r2key) return json({ ok: true, id, r2: true, putUrl: r2url('PUT', meta.r2key, 3600) });
      return json({ ok: true, id, partSize: PART_MAX, parts: meta.parts });
    }
    if (route === 'posts' && a1) {
      const mk = `posts/${myNet}/${a1}`;
      const meta = await s.get(mk, { type: 'json' });
      if (!meta) return fail('Clip not found.', 404);
      const syncIndex = async (fn) => { const idx = (await s.get(`index/${myNet}`, { type: 'json' })) || []; await s.setJSON(`index/${myNet}`, fn(idx)); };
      const strip = (m) => { const { thumb, ...rest } = m; return rest; };
      if (meta.kind === 'post' && a2 === 'img' && method === 'PUT') { // picture through the site (no Cloudflare, or Cloudflare blocked)
        if (meta.user !== me || meta.ready) return fail('Not allowed.', 403);
        const ab = await req.arrayBuffer(); if (ab.byteLength > 3 * 1048576) return fail('Picture is too big.');
        delete meta.img.r2key; meta.img.size = ab.byteLength; await s.set(`pimg/${myNet}/${a1}`, ab); await s.setJSON(mk, meta);
        return json({ ok: true });
      }
      if (meta.kind === 'post' && a2 === 'publish' && method === 'POST') {
        if (meta.user !== me) return fail('Not allowed.', 403);
        if (meta.img?.r2key) { const hr = await fetch(r2url('HEAD', meta.img.r2key), { method: 'HEAD' }); if (!hr.ok) return fail('The picture did not upload. Try again.', 400); }
        meta.ready = true; await s.setJSON(mk, meta);
        await syncIndex(idx => [meta, ...idx.filter(p => p.id !== a1)].slice(0, 500));
        return json({ ok: true, post: view(meta) });
      }
      if (meta.kind === 'post' && a2 === 'vote' && method === 'POST') {
        if (!meta.poll) return fail('No poll here.');
        const b = await req.json().catch(() => ({}));
        let ch = [...new Set((b.choices || []).map(Number).filter(i => i >= 0 && i < meta.poll.opts.length))];
        if (!meta.poll.multi) ch = ch.slice(0, 1);
        meta.votes = { ...(meta.votes || {}) }; if (ch.length) meta.votes[me] = ch; else delete meta.votes[me];
        await s.setJSON(mk, meta); await syncIndex(idx => idx.map(p => p.id === a1 ? { ...p, votes: meta.votes } : p));
        return json({ ok: true, poll: pollView(meta) });
      }
      if (a2 === 'comments') { // comments on posts and clips
        const ck = `cm/${myNet}/${a1}`; const list = (await s.get(ck, { type: 'json' })) || [];
        if (method === 'GET') { const users = {}; for (const u of uniq(list.map(c => c.u))) users[u] = pub(await s.get(userKey(u), { type: 'json' })); return json({ comments: list.slice(-200), users }); }
        if (method === 'POST') {
          if (statusOf(meRec).muted) return fail('You are muted.', 403);
          const b = await req.json().catch(() => ({}));
          const sp = await spamCheck('msg', b.text); if (sp) return sp;
          const text = filterText(String(b.text || '').trim().slice(0, 500), cfg, can('chat.filterimmune')); if (!text) return fail('Empty comment.');
          const c = { id: rid(3), u: me, text, t: now() }; list.push(c); await s.setJSON(ck, list.slice(-300));
          meta.comments = list.length; await s.setJSON(mk, meta); await syncIndex(idx => idx.map(p => p.id === a1 ? { ...p, comments: list.length } : p));
          if (meta.user !== me) await notify(meta.user, 'comments', { title: '@' + me + ' commented', body: text.slice(0, 90), tag: 'cm-' + a1, url: '/?clip=' + a1 }, { throttle: 'c' + a1, every: 300000 });
          return json({ ok: true, comment: c, count: list.length });
        }
        if (method === 'DELETE' && a3) {
          const c = list.find(x => x.id === a3); if (!c) return fail('Not found.', 404);
          if (c.u !== me && meta.user !== me && !can('posts.delete')) return fail('Not allowed.', 403);
          const left = list.filter(x => x.id !== a3); await s.setJSON(ck, left);
          meta.comments = left.length; await s.setJSON(mk, meta); await syncIndex(idx => idx.map(p => p.id === a1 ? { ...p, comments: left.length } : p));
          return json({ ok: true, count: left.length });
        }
      }
      if (!a2 && method === 'GET') { // one clip (for shared links / clips sent in chat)
        if (!meta.ready || (meta.hidden && !can('posts.hide') && meta.user !== me)) return fail('This clip is gone.', 404);
        return json({ post: view(meta), user: pub(await s.get(userKey(meta.user), { type: 'json' })) });
      }
      if (a2 === 'fallback' && method === 'POST') { // Cloudflare blocked on this network: upload through the site instead
        if (meta.user !== me || meta.ready) return fail('Not allowed.', 403);
        delete meta.r2key; meta.parts = Math.ceil(meta.size / PART_MAX); await s.setJSON(mk, meta);
        return json({ ok: true, partSize: PART_MAX, parts: meta.parts });
      }
      if (a2 === 'part' && method === 'PUT') {
        if (meta.user !== me) return fail('Not your clip.', 403);
        const i = Number(a3); if (!(i >= 0 && i < meta.parts)) return fail('Bad part.');
        const buf = await req.arrayBuffer(); if (buf.byteLength > PART_MAX + 1024) return fail('Part too big.');
        await s.set(`vid/${myNet}/${a1}/${i}`, buf); return json({ ok: true });
      }
      if (a2 === 'finish' && method === 'POST') {
        if (meta.user !== me) return fail('Not your clip.', 403);
        if (meta.r2key) { // make sure it really landed in the bucket, and isn't bigger than allowed
          const hr = await fetch(r2url('HEAD', meta.r2key), { method: 'HEAD' });
          if (!hr.ok) return fail('The upload did not finish. Try again.', 400);
          const len = Number(hr.headers.get('content-length')) || 0;
          if (len > clipCapMB() * 1048576 * 1.05) { await r2del(meta.r2key); return fail('Clip is too big.', 400); }
          meta.size = len;
          await r2Track(meta);
        }
        if (!meta.r2key) await r2Track(meta); // keep total storage under the free 10 GB
        meta.ready = true; await s.setJSON(mk, meta);
        await syncIndex(idx => [strip(meta), ...idx.filter(p => p.id !== a1)].slice(0, 500));
        const i = await limitInfo();
        return json({ ok: true, post: view(meta), limit: { used: i.used, max: i.max, left: i.left, bypass: i.bypass, nextAt: i.nextAt } });
      }
      if (a2 === 'like' && method === 'POST') {
        const sp = await spamCheck('like'); if (sp) return sp;
        meta.likes = meta.likes.includes(me) ? without(meta.likes, me) : [...meta.likes, me];
        await s.setJSON(mk, meta); await syncIndex(idx => idx.map(p => p.id === a1 ? { ...p, likes: meta.likes } : p));
        if (meta.likes.includes(me) && meta.user !== me) await notify(meta.user, 'likes', { title: '@' + me + ' liked your clip', body: meta.title || 'Your clip', tag: 'like-' + a1, url: '/?clip=' + a1 }, { throttle: 'l' + a1, every: 600000 });
        return json({ ok: true, likes: meta.likes.length, liked: meta.likes.includes(me) });
      }
      if (a2 === 'report' && method === 'POST') {
        const b = await req.json().catch(() => ({}));
        await addReport({ type: 'clip', target: a1, user: meta.user, reason: String(b.reason || '').slice(0, 200) });
        return json({ ok: true });
      }
      if (!a2 && method === 'DELETE') {
        if (meta.user !== me && !can('posts.delete')) return fail('You can only delete your own clips.', 403);
        if (meta.kind === 'post') { if (meta.img?.r2key) await r2del(meta.img.r2key); else if (meta.img) await s.delete(`pimg/${myNet}/${a1}`); }
        else if (meta.r2key) { await r2del(meta.r2key); await r2Untrack(meta.r2key); } else { for (let i = 0; i < meta.parts; i++) await s.delete(`vid/${myNet}/${a1}/${i}`); await r2Untrack(a1); }
        await s.delete(`cm/${myNet}/${a1}`); await s.delete(mk); await syncIndex(idx => idx.filter(p => p.id !== a1));
        if (meta.user !== me) await audit('delete clip', meta.user, meta.title);
        return json({ ok: true });
      }
    }
    // ---- R2 auto-cleanup: keep the bucket under r2CleanGB so it stays on Cloudflare's free tier
    async function r2Track(meta) {
      const L = (await s.get('r2/all', { type: 'json' })) || [];
      L.push({ key: meta.r2key || '', net: myNet, id: meta.id, size: meta.size, parts: meta.parts, t: now() });
      let total = L.reduce((n, x) => n + (x.size || 0), 0);
      const limit = (cfg.r2CleanGB || 9) * 1073741824;
      for (const old of L.slice().sort((a, b) => a.t - b.t)) {
        if (total <= limit) break;
        if (old.key === meta.r2key) continue;
        const pm = await s.get(`posts/${old.net}/${old.id}`, { type: 'json' });
        if (pm && (pm.pinned || pm.featured)) continue; // never auto-delete pinned/featured clips
        if (old.key) await r2del(old.key); else for (let i = 0; i < (old.parts || 0); i++) await s.delete(`vid/${old.net}/${old.id}/${i}`);
        total -= old.size || 0; L.splice(L.indexOf(old), 1);
        if (pm) { await s.delete(`posts/${old.net}/${old.id}`); const ix = (await s.get(`index/${old.net}`, { type: 'json' })) || []; await s.setJSON(`index/${old.net}`, ix.filter(p => p.id !== old.id)); }
      }
      await s.setJSON('r2/all', L);
    }
    async function r2Untrack(key) { const L = (await s.get('r2/all', { type: 'json' })) || []; await s.setJSON('r2/all', L.filter(x => (x.key || x.id) !== key && x.id !== key)); }
    async function addReport(r) {
      const k = `reports/${myNet}`; const list = (await s.get(k, { type: 'json' })) || [];
      list.unshift({ id: rid(3), t: now(), by: me, ...r, open: true }); await s.setJSON(k, list.slice(0, 300));
    }

    // ============================================================ friends
    const relKey = (u) => `rel/${myNet}/${u}`;
    const getRel = async (u) => ({ friends: [], incoming: [], outgoing: [], blocked: [], groups: [], ...((await s.get(relKey(u), { type: 'json' })) || {}) });
    if (route === 'people' && method === 'GET') {
      const mine = await getRel(me);
      const q = clean(url.searchParams.get('q') || '');
      const { blobs } = await s.list({ prefix: `users/${myNet}/` });
      const out = [];
      for (const b of blobs) {
        const u = b.key.split('/').pop();
        if (u === me || mine.blocked.includes(u) || (q && !u.includes(q))) continue;
        out.push({ u, status: mine.friends.includes(u) ? 'friend' : mine.outgoing.includes(u) ? 'sent' : mine.incoming.includes(u) ? 'incoming' : 'none' });
        if (out.length >= 60) break;
      }
      return json({ people: out });
    }
    // ============================================================ followers
    const getFol = async (u) => ({ followers: [], following: [], ...((await s.get(`fol/${myNet}/${u}`, { type: 'json' })) || {}) });
    if (route === 'follow' && a1) {
      const other = clean(a1);
      if (method === 'GET') { const F = await getFol(other); const users = {}; const list = a2 === 'following' ? F.following : F.followers; for (const u of list.slice(0, 200)) users[u] = pub(await s.get(userKey(u), { type: 'json' })); return json({ list, users }); }
      if (method === 'POST') {
        if (other === me) return fail("You can't follow yourself.");
        if (!(await s.get(userKey(other), { type: 'json' }))) return fail('No such user on this network.', 404);
        { const sp = await spamCheck('follow'); if (sp) return sp; }
        const A = await getFol(me), B = await getFol(other); const on = !A.following.includes(other);
        A.following = on ? uniq([...A.following, other]) : without(A.following, other);
        B.followers = on ? uniq([...B.followers, me]) : without(B.followers, me);
        await s.setJSON(`fol/${myNet}/${me}`, A); await s.setJSON(`fol/${myNet}/${other}`, B);
        if (on) await notify(other, 'follows', { title: '@' + me + ' followed you', body: 'Tap to see their profile', tag: 'fol-' + me, url: '/?user=' + me }, { throttle: 'f' + me, every: 3600000 });
        return json({ ok: true, following: on, followers: B.followers.length });
      }
    }
    if (route === 'friends' && method === 'GET') {
      const r = await getRel(me);
      const users = {}; for (const u of uniq([...r.friends, ...r.incoming])) users[u] = pub(await s.get(userKey(u), { type: 'json' }));
      const groups = [];
      for (const gid of r.groups) { const gr = await s.get(`grp/${myNet}/${gid}`, { type: 'json' }); if (gr && gr.members.includes(me)) groups.push({ id: gr.id, name: gr.name, members: gr.members, owner: gr.owner }); }
      return json({ ...r, users, groups });
    }
    if (route === 'friend' && method === 'POST') {
      { const sp = await spamCheck('friend'); if (sp) return sp; }
      const b = await req.json().catch(() => ({}));
      const other = clean(b.user);
      if (!other || other === me || !(await s.get(userKey(other), { type: 'json' }))) return fail('No one with that username on this network.', 404);
      const A = await getRel(me), B = await getRel(other);
      const act = a1;
      const unlink = () => { for (const k of ['incoming', 'outgoing', 'friends']) { A[k] = without(A[k], other); B[k] = without(B[k], me); } };
      if (act === 'request') {
        if (A.blocked.includes(other) || B.blocked.includes(me)) return fail("You can't add this person.", 403);
        if (A.incoming.includes(other)) { unlink(); A.friends.push(other); B.friends.push(me); }
        else if (!A.friends.includes(other)) { const fresh = !B.incoming.includes(me); A.outgoing = uniq([...A.outgoing, other]); B.incoming = uniq([...B.incoming, me]); if (fresh) await notify(other, 'requests', { title: 'New friend request', body: '@' + me + ' wants to be friends', tag: 'req-' + me, url: '/?tab=chats' }); }
      } else if (act === 'accept') { if (!A.incoming.includes(other)) return fail('No request from them.', 404); unlink(); A.friends.push(other); B.friends.push(me); }
      else if (['decline', 'cancel', 'remove'].includes(act)) unlink();
      else if (act === 'block') { unlink(); A.blocked = uniq([...A.blocked, other]); }
      else if (act === 'unblock') A.blocked = without(A.blocked, other);
      else return fail('Unknown action.');
      await s.setJSON(relKey(me), A); await s.setJSON(relKey(other), B); await bump(other);
      return json({ ok: true });
    }

    // ============================================================ soundboard library (your own uploaded sounds)
    if (route === 'sounds') {
      const lib = (await s.get('meta/sounds', { type: 'json' })) || [];
      const pub2 = (x) => ({ id: x.id, name: x.name, url: `/api/snd/${x.id}/${x.key}`, by: x.by, size: x.size });
      if (method === 'GET') return json({ sounds: lib.map(pub2) });
      if (!can('calls.troll')) return fail('You need the soundboard permission to change sounds.', 403);
      if (method === 'POST' && a1 === 'add') {
        const ab = await req.arrayBuffer(); const type = (req.headers.get('content-type') || '').split(';')[0];
        if (!/^audio\//.test(type)) return fail('That is not a sound file.');
        if (ab.byteLength > 600 * 1024) return fail('Sound is too big (max 600 KB — trim it to a few seconds).');
        if (lib.length >= 120) return fail('The soundboard is full (120 sounds). Delete some first.');
        const name = String(url.searchParams.get('name') || 'Sound').replace(/[<>]/g, '').slice(0, 24) || 'Sound';
        const it = { id: rid(3), key: crypto.randomBytes(6).toString('hex'), name, type, size: ab.byteLength, by: me, t: now() };
        await s.set(`snd/${it.id}`, ab); lib.push(it); await s.setJSON('meta/sounds', lib);
        return json({ ok: true, sound: pub2(it) });
      }
      if (method === 'DELETE' && a1) {
        const it = lib.find(x => x.id === a1); if (!it) return fail('Not found.', 404);
        if (it.by !== me && !isOwner()) return fail('Only the owner can delete other people\'s sounds.', 403);
        await s.delete(`snd/${a1}`); await s.setJSON('meta/sounds', lib.filter(x => x.id !== a1));
        return json({ ok: true });
      }
    }

    // ============================================================ GIF upload (for chats)
    if (route === 'gif' && method === 'POST') {
      if (!cfg.gifs && !can('settings')) return fail('GIFs are turned off right now.', 403);
      if (statusOf(meRec).muted) return fail('You are muted.', 403);
      const ab = await req.arrayBuffer(), buf = Buffer.from(ab);
      if (buf.length > cfg.gifMaxKB * 1024) return fail(`GIF is too big (max ${Math.round(cfg.gifMaxKB / 1024 * 10) / 10} MB).`);
      if (buf.subarray(0, 3).toString() !== 'GIF') return fail('That is not a GIF.');
      const id = rid(4), key = crypto.randomBytes(6).toString('hex');
      await s.set(`gif/${myNet}/${id}`, ab); await s.set(`gifkey/${myNet}/${id}`, key);
      return json({ ok: true, url: `/api/g/${myNet}/${id}/${key}`, size: buf.length });
    }

    // ============================================================ threads (DMs "u:name" and groups "g:id")
    async function openThread(key) {
      if (key.startsWith('u:')) {
        const other = clean(key.slice(2)); const A = await getRel(me);
        if (!A.friends.includes(other)) return { err: fail('You can only message friends.', 403) };
        return { blob: `dm/${myNet}/${[me, other].sort().join('__')}`, members: [me, other], name: other };
      }
      if (key.startsWith('g:')) {
        const gr = await s.get(`grp/${myNet}/${key.slice(2)}`, { type: 'json' });
        if (!gr || !gr.members.includes(me)) return { err: fail('You are not in that group.', 403) };
        return { blob: `gmsg/${myNet}/${gr.id}`, members: gr.members, name: gr.name, group: gr };
      }
      return { err: fail('Bad chat.', 400) };
    }
    async function pushInbox(members, key, preview, from) {
      for (const u of members) {
        const ik = `inbox/${myNet}/${u}`; const inbox = (await s.get(ik, { type: 'json' })) || {};
        const k = key.startsWith('u:') ? 'u:' + (u === me ? key.slice(2) : me) : key;
        inbox[k] = { last: now(), preview, from, unread: u === me ? 0 : (inbox[k]?.unread || 0) + 1 };
        await s.setJSON(ik, inbox); if (u !== me) await bump(u);
      }
    }
    if (route === 'thread' && a1) {
      const T = await openThread(a1); if (T.err) return T.err;
      const th = (await s.get(T.blob, { type: 'json' })) || { msgs: [], read: {} };
      if (method === 'GET' && !a2) {
        const after = Number(url.searchParams.get('after') || 0);
        const users = {}; if (!after) for (const u of T.members) users[u] = pub(await s.get(userKey(u), { type: 'json' }));
        return json({ msgs: th.msgs.filter(m => m.t > after), read: th.read || {}, users, group: T.group ? { id: T.group.id, name: T.group.name, members: T.group.members, owner: T.group.owner } : null });
      }
      if (method === 'POST' && a2 === 'read') {
        th.read = { ...th.read, [me]: now() }; await s.setJSON(T.blob, th);
        const ik = `inbox/${myNet}/${me}`; const inbox = (await s.get(ik, { type: 'json' })) || {};
        if (inbox[a1]) { inbox[a1].unread = 0; await s.setJSON(ik, inbox); }
        const last = th.msgs[th.msgs.length - 1]; // let the sender's next sync show "Seen"
        if (last && last.from !== me && T.members.includes(last.from)) await bump(last.from);
        return json({ ok: true });
      }
      if (method === 'POST' && a2 === 'report') {
        const b = await req.json().catch(() => ({}));
        const m = th.msgs.find(x => x.id === b.id); if (!m) return fail('Message not found.', 404);
        await addReport({ type: 'message', target: a1 + '#' + m.id, user: m.from, text: m.text?.slice(0, 300), img: m.img ? 1 : 0, reason: String(b.reason || '').slice(0, 200) });
        return json({ ok: true });
      }
      if (method === 'POST' && !a2) {
        if (!cfg.dmOpen && !can('settings')) return fail('Messaging is turned off right now.', 403);
        if (statusOf(meRec).muted) return fail('You are muted' + (meRec.mute.until ? ' until ' + new Date(meRec.mute.until).toLocaleTimeString() : '') + '.', 403);
        if (cfg.slowModeSec && !can('chat.slowimmune')) {
          const last = slowMem.get(myNet + me) || 0;
          if (now() - last < cfg.slowModeSec * 1000) return fail(`Slow mode: wait ${Math.ceil((cfg.slowModeSec * 1000 - (now() - last)) / 1000)}s.`, 429);
          slowMem.set(myNet + me, now());
        }
        const b = await req.json().catch(() => ({}));
        const sp = await spamCheck('msg', b.text || (b.img ? 'img' + String(b.img).length : '') || b.gif || b.clip); if (sp) return sp;
        const text = filterText(String(b.text || '').slice(0, 2000), cfg, can('chat.filterimmune'));
        const img = typeof b.img === 'string' && b.img.startsWith('data:image/') && b.img.length < 300000 ? b.img : '';
        const gif = typeof b.gif === 'string' && new RegExp('^/api/g/' + myNet + '/[a-z0-9]+/[a-f0-9]{12}$').test(b.gif) ? b.gif : '';
        const clip = /^[a-z0-9]{6,30}$/.test(b.clip || '') ? b.clip : '';
        if (!text.trim() && !img && !gif && !clip) return fail('Empty message.');
        const msg = { id: rid(3), from: me, text, img, gif, clip, t: now() };
        if (gif) meterMem.bytes += (Number(b.gifSize) || 1e6) * Math.max(1, T.members.length - 1); // everyone else loads it once
        th.msgs = [...th.msgs, msg].slice(-300); th.read = { ...th.read, [me]: msg.t };
        await s.setJSON(T.blob, th);
        const preview = text ? text.slice(0, 70) : gif ? 'GIF' : clip ? 'Sent a clip' : 'Photo';
        await pushInbox(T.members, a1, (T.group ? '@' + me + ': ' : '') + preview, me);
        for (const u of T.members) if (u !== me) await notify(u, T.group ? 'groups' : 'msgs', { title: T.group ? T.name : '@' + me, body: (T.group ? '@' + me + ': ' : '') + preview, tag: 'chat-' + a1, url: '/?chat=' + encodeURIComponent(T.group ? a1 : 'u:' + me) }, { throttle: 'm' + a1 });
        return json({ ok: true, msg });
      }
    }

    // ============================================================ groups (max 5 people — enforced here)
    const GMAX = Math.min(5, cfg.groupMax || 5);
    if (route === 'group') {
      if (a1 === 'new' && method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const A = await getRel(me);
        const members = uniq([me, ...(b.members || []).map(clean)]).filter(u => u === me || A.friends.includes(u));
        if (members.length < 2) return fail('Pick at least one friend.');
        if (members.length > GMAX) return fail(`Group chats can have at most ${GMAX} people.`);
        const gr = { id: rid(3), name: filterText(String(b.name || 'Group chat').slice(0, 40), cfg, can('chat.filterimmune')), owner: me, members, created: now() };
        await s.setJSON(`grp/${myNet}/${gr.id}`, gr);
        for (const u of members) { const R = await getRel(u); R.groups = uniq([...R.groups, gr.id]); await s.setJSON(relKey(u), R); }
        await pushInbox(members, 'g:' + gr.id, `@${me} made the group`, me);
        return json({ ok: true, group: gr });
      }
      const gk = `grp/${myNet}/${a1}`; const gr = await s.get(gk, { type: 'json' });
      if (!gr) return fail('Group not found.', 404);
      const b = await req.json().catch(() => ({}));
      const target = clean(b.user);
      const isMember = gr.members.includes(me);
      if (a2 === 'add' && isMember) {
        if (gr.members.length >= GMAX) return fail(`This group is full (max ${GMAX}).`);
        const A = await getRel(me); if (!A.friends.includes(target)) return fail('You can only add friends.');
        gr.members = uniq([...gr.members, target]);
        const R = await getRel(target); R.groups = uniq([...R.groups, gr.id]); await s.setJSON(relKey(target), R);
      } else if (a2 === 'leave' && isMember) {
        gr.members = without(gr.members, me);
        const R = await getRel(me); R.groups = without(R.groups, gr.id); await s.setJSON(relKey(me), R);
        if (gr.owner === me) gr.owner = gr.members[0] || '';
      } else if (a2 === 'kick' && (gr.owner === me || can('groups.kick'))) {
        gr.members = without(gr.members, target);
        const R = await getRel(target); R.groups = without(R.groups, gr.id); await s.setJSON(relKey(target), R);
        if (gr.owner !== me) await audit('kick from group', target, gr.name);
      } else if (a2 === 'rename' && isMember) {
        gr.name = filterText(String(b.name || '').slice(0, 40), cfg, can('chat.filterimmune')) || gr.name;
      } else return fail('Not allowed.', 403);
      if (!gr.members.length) { await s.delete(gk); await s.delete(`gmsg/${myNet}/${gr.id}`); return json({ ok: true, deleted: true }); }
      await s.setJSON(gk, gr);
      for (const u of gr.members) await bump(u);
      return json({ ok: true, group: gr });
    }

    // ============================================================ calls (mesh; signaling only — media goes device to device)
    if (route === 'call') {
      const ck = (id) => `calls/${myNet}/${id}`;
      const listActive = async (fn) => { const k = `activecalls/${myNet}`; const l = (await s.get(k, { type: 'json' })) || []; await s.setJSON(k, fn(l).slice(-50)); };
      if (a1 === 'new' && method === 'POST') {
        if (!cfg.callsOpen && !can('settings')) return fail('Calls are turned off right now.', 403);
        const b = await req.json().catch(() => ({}));
        // you both called each other at the same moment? just join their call
        if (!b.gid) {
          const theirs = await s.get(`ring/${myNet}/${me}`);
          if (theirs) { const tc = await s.get(`calls/${myNet}/${theirs}`, { type: 'json' }); if (tc && tc.state !== 'ended' && tc.from === clean(b.to) && now() - tc.created < 60000) return json({ ok: true, joinInstead: tc.id }); }
        }
        let invited, gid = '', gname = '';
        if (b.gid) {
          const gr = await s.get(`grp/${myNet}/${b.gid}`, { type: 'json' });
          if (!gr || !gr.members.includes(me)) return fail('You are not in that group.', 403);
          invited = without(gr.members, me); gid = gr.id; gname = gr.name;
        } else {
          const A = await getRel(me); const other = clean(b.to);
          if (!A.friends.includes(other)) return fail('You can only call friends.', 403);
          invited = [other];
        }
        const c = { id: rid(4), kind: gid ? 'group' : 'dm', gid, gname, from: me, video: !!b.video, created: now(), state: 'ringing', invited, members: { [me]: { at: now() } } };
        await s.setJSON(ck(c.id), c);
        await listActive(l => [...l, c.id]);
        for (const u of invited) { await s.set(`ring/${myNet}/${u}`, c.id); await bump(u); }
        for (const u of invited) await notify(u, 'calls', { title: (gname || '@' + me) + ' is calling', body: (c.video ? 'Video' : 'Voice') + ' call — tap to answer', tag: 'call-' + c.id, url: '/?ring=1', call: 1 }, { always: true, urgent: true });
        return json({ ok: true, call: c });
      }
      const c = await s.get(ck(a1), { type: 'json' });
      if (!c) return fail('Call not found.', 404);
      const sk = (u) => `sig/${myNet}/${c.id}/${u}`;
      const inCall = !!c.members[me];
      const canJoin = c.invited.includes(me) || c.from === me || can('calls.join');
      if (method === 'GET') {
        if (!inCall && !canJoin) return fail('Not your call.', 403);
        const sig = inCall ? ((await s.get(sk(me), { type: 'json' })) || []) : [];
        if (sig.length) await s.delete(sk(me));
        return json({ call: c, signals: sig });
      }
      const b = await req.json().catch(() => ({}));
      if (a2 === 'join') {
        if (!canJoin) return fail('You cannot join this call.', 403);
        if ((c.kicked || []).includes(me)) return fail('You were kicked from this call.', 403);
        if (c.state === 'ended') return fail('That call already ended.', 410);
        if (Object.keys(c.members).length >= cfg.callMax && !can('calls.join')) return fail('This call is full.');
        const admin = !c.invited.includes(me) && c.from !== me;
        c.members[me] = { at: now(), admin, perms: admin ? permsOf(meRec).filter(p => p.startsWith('calls.')) : [] };
        c.state = 'active';
        await s.setJSON(ck(c.id), c); await s.delete(`ring/${myNet}/${me}`);
        if (admin) await audit('joined call', Object.keys(c.members).join(', '));
        return json({ ok: true, call: c });
      }
      if (a2 === 'signal') {
        if (!inCall) return fail('Join first.', 403);
        const to = clean(b.to); if (!c.members[to]) return fail('They are not in the call.');
        const box = (await s.get(sk(to), { type: 'json' })) || [];
        box.push({ from: me, type: b.type, sdp: b.sdp, t: now() }); await s.setJSON(sk(to), box.slice(-20));
        return json({ ok: true });
      }
      if (a2 === 'kick') {
        const target = clean(b.user);
        if (!can('calls.kick')) return fail('Not allowed.', 403);
        const tr = await s.get(userKey(target), { type: 'json' });
        if (rankOf(tr) >= rankOf(meRec)) return fail('They have the same or a higher role than you.', 403);
        delete c.members[target]; c.kicked = uniq([...(c.kicked || []), target]);
        await s.setJSON(ck(c.id), c); await audit('kicked from call', target); return json({ ok: true, call: c });
      }
      if (a2 === 'leave' || a2 === 'decline') {
        delete c.members[me];
        if (a2 === 'decline') c.invited = without(c.invited, me);
        await s.delete(`ring/${myNet}/${me}`);
        const left = Object.keys(c.members).filter(u => !c.members[u].admin);
        if (!left.length || (c.kind === 'dm' && left.length < 2 && c.state === 'active') || (c.state === 'ringing' && !c.invited.length)) {
          c.state = 'ended'; c.ended = now(); await listActive(l => without(l, c.id));
          for (const u of c.invited) await s.delete(`ring/${myNet}/${u}`);
        }
        await s.setJSON(ck(c.id), c);
        return json({ ok: true });
      }
      if (a2 === 'end') {
        if (!(c.from === me || can('calls.end'))) return fail('Not allowed.', 403);
        c.state = 'ended'; c.ended = now(); await s.setJSON(ck(c.id), c); await listActive(l => without(l, c.id));
        for (const u of c.invited) await s.delete(`ring/${myNet}/${u}`);
        if (c.from !== me) await audit('ended call', Object.keys(c.members).join(', '));
        return json({ ok: true });
      }
    }

    // ============================================================ admin panel
    if (route === 'admin') {
      if (!can('panel')) return fail('Staff only.', 403);
      const tnet = isOwner() && /^[a-f0-9]{20}$/.test(url.searchParams.get('net') || '') ? url.searchParams.get('net') : myNet;
      const need = (p) => can(p) ? null : fail(`You need the "${PERMS[p]}" permission.`, 403);
      const myRank = rankOf(meRec);
      const body = method === 'POST' ? await req.json().catch(() => ({})) : {};

      if (a1 === 'me') return json({ owner: isOwner(), perms: permsOf(meRec), rank: myRank, allPerms: PERMS, net: myNet, viewing: tnet });
      // owner must type the owner password every time they open the panel
      if (a1 === 'unlock' && method === 'POST') {
        if (!isOwner()) return fail('Owner only.', 403);
        const k = 'p|' + (device || ipNet); const tr = codeTries.get(k) || { n: 0, at: 0 };
        if (tr.n >= 5 && now() - tr.at < 10 * 60000) return fail('Too many wrong passwords. Try again in 10 minutes.', 429);
        if (await hashPass(String(body.password || ''), OWNER_SALT) !== ownerHash()) { codeTries.set(k, { n: tr.n + 1, at: now() }); await audit('wrong owner panel password', me); return fail('Wrong password.', 403); }
        codeTries.delete(k);
        return json({ ok: true, panel: await sign(s, { panel: 1, u: me, d: device, exp: now() + 3 * 3600e3 }) });
      }
      if (isOwner()) {
        const pt = req.headers.get('x-panel') || ''; const [pb, ps] = pt.split('.');
        let good = false;
        if (pb && ps && crypto.createHmac('sha256', await secret(s)).update(pb).digest('base64url') === ps) { try { const q = JSON.parse(Buffer.from(pb, 'base64url').toString()); good = q.panel === 1 && q.u === me && q.exp > now() && (!q.d || q.d === device); } catch {} }
        if (!good) return fail('Enter the owner password to use the panel.', 401, { needPanel: true });
      }

      if (a1 === 'overview') {
        const x = need('stats'); if (x) return x;
        const { blobs: us } = await s.list({ prefix: `users/${tnet}/` });
        const idx = (await s.get(`index/${tnet}`, { type: 'json' })) || [];
        const calls = (await s.get(`activecalls/${tnet}`, { type: 'json' })) || [];
        const reports = ((await s.get(`reports/${tnet}`, { type: 'json' })) || []).filter(r => r.open);
        return json({
          users: us.length, posts: idx.length, storageMB: Math.round(idx.reduce((n, p) => n + (p.size || 0), 0) / 1048576 * 10) / 10,
          views: idx.reduce((n, p) => n + (p.views || 0), 0), liveCalls: calls.length, openReports: reports.length,
          r2: true, r2GB: Math.round(((await s.get('r2/all', { type: 'json' })) || []).reduce((n, x) => n + (x.size || 0), 0) / 1073741824 * 100) / 100,
          postsToday: idx.filter(p => p.created > now() - 864e5).length, networks: Object.keys(M.nets).length, saver: saverLevel(cfg), cfg: { ...cfg, googleOn: !!ENV.GOOGLE_CLIENT_ID }
        });
      }
      if (a1 === 'users' && method === 'GET') {
        const x = need('users.view'); if (x) return x;
        const q = clean(url.searchParams.get('q') || '');
        const { blobs } = await s.list({ prefix: `users/${tnet}/` });
        const out = [];
        for (const b of blobs) {
          const u = b.key.split('/').pop(); const rq = (url.searchParams.get('q') || '').trim().toLowerCase();
          const r = await s.get(b.key, { type: 'json' }); if (!r) continue;
          if (rq && !u.includes(q || rq) && !(r.google && (r.google.email.includes(rq) || r.google.name.toLowerCase().includes(rq)))) continue;
          out.push({ ...pub(r), created: r.created, lastSeen: r.lastSeen || 0, roleIds: r.roles || [], status: statusOf(r), devices: r.devices || [], timeout: (r.timeout || 0) > now() ? r.timeout : 0, posts24: recent(r.postTimes).length, extraPosts: r.extraPosts || 0, owner: r.owner && r.u === OWNER, google: r.google ? { email: r.google.email, name: r.google.name } : null });
          if (out.length >= 150) break;
        }
        return json({ users: out });
      }
      if (a1 === 'user' && a2 && method === 'POST') {
        const tu = clean(a2), act = a3; const tk = userKey(tu, tnet);
        const r = await s.get(tk, { type: 'json' }); if (!r) return fail('No such user.', 404);
        if (r.owner && r.u === OWNER) return fail("You can't do that to the owner.", 403);
        if (rankOf(r) >= myRank) return fail('They have the same or a higher role than you.', 403);
        const dur = Number(body.minutes) > 0 ? now() + Number(body.minutes) * 60000 : 0;
        const reason = String(body.reason || '').slice(0, 200);
        const P = { warn: 'users.warn', mute: 'users.mute', unmute: 'users.unban', postban: 'users.postban', unpostban: 'users.unban', suspend: 'users.suspend', ban: 'users.ban', unban: 'users.unban', devban: 'users.devban', undevban: 'users.unban', rename: 'users.rename', avatar: 'users.avatar', resetpw: 'users.resetpw', delete: 'users.delete', verify: 'users.verify', resetlimit: 'panel', extra: 'panel', untimeout: 'users.unban', roles: 'roles.assign', purge: 'posts.delete' };
        if (!P[act]) return fail('Unknown action.');
        const x = need(P[act]); if (x) return x;
        if ((act === 'resetlimit' || act === 'extra') && !isOwner()) return fail('Only the owner can change post limits.', 403);
        if (act === 'untimeout') {
          r.timeout = 0; r.spamStrikes = [];
          for (const d of r.devices || []) { delete M.devTimeouts[d]; const dv = await s.get(`dev/${d}`, { type: 'json' }); if (dv?.fp) delete M.fpTimeouts[tnet + '|' + dv.fp]; }
          await putMeta(s, M);
        }
        if (act === 'warn') r.warns = [...(r.warns || []), { text: reason || 'Please follow the rules.', by: me, t: now() }].slice(-20);
        if (act === 'mute') r.mute = { until: dur, by: me, reason };
        if (act === 'unmute') delete r.mute;
        if (act === 'postban') r.postban = { until: dur, by: me, reason };
        if (act === 'unpostban') delete r.postban;
        if (act === 'suspend') r.ban = { until: dur || now() + 864e5, by: me, reason };
        if (act === 'ban') r.ban = { until: 0, by: me, reason };
        if (act === 'unban') delete r.ban;
        if (act === 'devban' || act === 'undevban') {
          for (const d of r.devices || []) { if (act === 'devban') M.devBans[d] = { by: me, reason, t: now() }; else delete M.devBans[d]; }
          if (act === 'devban') r.ban = { until: 0, by: me, reason: reason || 'Device banned' };
          await putMeta(s, M);
        }
        if (act === 'rename') r.display = String(body.display || '').slice(0, 30);
        if (act === 'avatar') r.avatar = '';
        if (act === 'resetpw') r.resetPw = true;
        if (act === 'verify') r.verified = !r.verified;
        if (act === 'resetlimit') {
          r.postTimes = [];
          for (const d of r.devices || []) { const dv = await s.get(`dev/${d}`, { type: 'json' }); if (dv) { dv.postTimes = []; await s.setJSON(`dev/${d}`, dv); } if (dv?.fp) await s.delete(`fp/${tnet}/${dv.fp}`); }
        }
        if (act === 'extra') r.extraPosts = Math.max(0, Math.min(50, Number(body.amount) || 0));
        if (act === 'roles') {
          const want = uniq((body.roles || []).filter(k => M.roles[k]));
          const changed = [...want.filter(k => !(r.roles || []).includes(k)), ...(r.roles || []).filter(k => !want.includes(k))];
          if (!isOwner() && changed.some(k => (M.roles[k]?.rank || 0) >= myRank)) return fail('You can only give roles below your own.', 403);
          r.roles = want;
        }
        if (act === 'purge') {
          const idx = (await s.get(`index/${tnet}`, { type: 'json' })) || [];
          for (const p of idx.filter(p => p.user === tu)) { if (p.r2key) { await r2del(p.r2key); await r2Untrack(p.r2key); } else for (let i = 0; i < p.parts; i++) await s.delete(`vid/${tnet}/${p.id}/${i}`); await s.delete(`posts/${tnet}/${p.id}`); }
          await s.setJSON(`index/${tnet}`, idx.filter(p => p.user !== tu));
        }
        if (act === 'delete') {
          await s.delete(tk); await s.delete(`rel/${tnet}/${tu}`); await s.delete(`inbox/${tnet}/${tu}`);
          await audit('delete account', tu, reason); return json({ ok: true });
        }
        await s.setJSON(tk, r); await bump(tu, tnet);
        await audit(act, tu, reason || (act === 'roles' ? (r.roles || []).join(',') : body.minutes ? body.minutes + ' min' : ''));
        return json({ ok: true });
      }
      if (a1 === 'posts' && method === 'GET') {
        const x = need('posts.hide') && need('posts.delete'); if (x) return x;
        const idx = (await s.get(`index/${tnet}`, { type: 'json' })) || [];
        return json({ posts: idx.slice(0, 200).map(p => ({ id: p.id, user: p.user, title: p.title, created: p.created, views: p.views || 0, likes: (p.likes || []).length, pinned: !!p.pinned, featured: !!p.featured, hidden: !!p.hidden, size: p.size, thumb: `/api/t/${tnet}/${p.id}/${p.key}` })) });
      }
      if (a1 === 'post' && a2 && method === 'POST') {
        const act = a3; const P = { pin: 'posts.pin', feature: 'posts.feature', hide: 'posts.hide', delete: 'posts.delete' };
        const x = need(P[act] || 'posts.delete'); if (x) return x;
        const mk = `posts/${tnet}/${a2}`; const meta = await s.get(mk, { type: 'json' }); if (!meta) return fail('Not found.', 404);
        const idx = (await s.get(`index/${tnet}`, { type: 'json' })) || [];
        if (act === 'delete') {
          if (meta.r2key) { await r2del(meta.r2key); await r2Untrack(meta.r2key); } else for (let i = 0; i < meta.parts; i++) await s.delete(`vid/${tnet}/${a2}/${i}`);
          await s.delete(mk); await s.setJSON(`index/${tnet}`, idx.filter(p => p.id !== a2));
        } else {
          const k = act === 'pin' ? 'pinned' : act === 'feature' ? 'featured' : 'hidden'; meta[k] = !meta[k];
          await s.setJSON(mk, meta); await s.setJSON(`index/${tnet}`, idx.map(p => p.id === a2 ? { ...p, [k]: meta[k] } : p));
        }
        await audit(act + ' clip', meta.user, meta.title); return json({ ok: true });
      }
      if (a1 === 'reports') {
        const x = need('reports.view'); if (x) return x;
        const k = `reports/${tnet}`; const list = (await s.get(k, { type: 'json' })) || [];
        if (method === 'POST') {
          const y = need('reports.resolve'); if (y) return y;
          const r = list.find(r => r.id === body.id); if (r) { r.open = false; r.closedBy = me; }
          if (body.deleteMessage && r?.type === 'message' && can('msgs.delete')) {
            const [tkey, mid] = r.target.split('#');
            const blob = tkey.startsWith('g:') ? `gmsg/${tnet}/${tkey.slice(2)}` : null;
            const tries = blob ? [blob] : (await s.list({ prefix: `dm/${tnet}/` })).blobs.map(b => b.key).filter(k2 => k2.includes(r.user));
            for (const bk of tries) { const th = await s.get(bk, { type: 'json' }); if (th?.msgs?.some(m => m.id === mid)) { th.msgs = th.msgs.map(m => m.id === mid ? { ...m, text: '[removed by staff]', img: '' } : m); await s.setJSON(bk, th); } }
          }
          await s.setJSON(k, list); await audit('resolve report', r?.user || '', r?.type || ''); return json({ ok: true });
        }
        return json({ reports: list.slice(0, 150) });
      }
      if (a1 === 'calls') {
        const x = need('calls.view'); if (x) return x;
        const ids = (await s.get(`activecalls/${tnet}`, { type: 'json' })) || [];
        const out = [];
        for (const id of ids) { const c = await s.get(`calls/${tnet}/${id}`, { type: 'json' }); if (c && c.state !== 'ended' && now() - c.created < 6 * 3600e3) out.push({ id: c.id, kind: c.kind, gname: c.gname, from: c.from, video: c.video, created: c.created, members: Object.keys(c.members), state: c.state }); }
        return json({ calls: out });
      }
      if (a1 === 'groups') {
        const x = need('groups.view'); if (x) return x;
        if (method === 'POST' && body.action === 'delete') {
          const y = need('groups.delete'); if (y) return y;
          const gr = await s.get(`grp/${tnet}/${body.id}`, { type: 'json' });
          if (gr) { for (const u of gr.members) { const R = (await s.get(`rel/${tnet}/${u}`, { type: 'json' })) || {}; R.groups = without(R.groups, gr.id); await s.setJSON(`rel/${tnet}/${u}`, R); } await s.delete(`grp/${tnet}/${gr.id}`); await s.delete(`gmsg/${tnet}/${gr.id}`); await audit('delete group', gr.name); }
          return json({ ok: true });
        }
        const { blobs } = await s.list({ prefix: `grp/${tnet}/` });
        const out = []; for (const b of blobs.slice(0, 200)) { const gr = await s.get(b.key, { type: 'json' }); if (gr) out.push({ id: gr.id, name: gr.name, owner: gr.owner, members: gr.members, created: gr.created }); }
        return json({ groups: out });
      }
      if (a1 === 'roles') {
        if (method === 'POST') {
          const x = need('roles.manage'); if (x) return x;
          const roles = {};
          for (const [k, r] of Object.entries(body.roles || {})) {
            const id = clean(k).replace(/[^a-z0-9_]/g, '').slice(0, 20); if (!id || id === 'owner') continue;
            roles[id] = { name: String(r.name || id).slice(0, 24), color: /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#888888', badge: String(r.badge || 'star').slice(0, 12), rank: Math.max(1, Math.min(isOwner() ? 999 : myRank - 1, Number(r.rank) || 1)), perms: (r.perms || []).filter(p => PERMS[p] && (isOwner() || can(p))) };
          }
          M.roles = roles; await putMeta(s, M); await audit('edit roles', Object.keys(roles).join(','));
          return json({ ok: true, roles });
        }
        return json({ roles: M.roles, perms: PERMS });
      }
      if (a1 === 'settings') {
        if (method === 'POST') {
          const keys = { textPostMax: 'settings', codeOn: 'owner', codeEpoch: 'owner', googleDomain: 'owner', r2MaxMB: 'owner', r2CleanGB: 'owner', gifs: 'settings', gifMaxKB: 'settings', shutdown: 'owner', shutdownMsg: 'owner', budget: 'owner', reserve: 'owner', cycleDay: 'owner', saverForce: 'owner', postMax: 'owner', postWindowMin: 'owner', maxVideoSec: 'settings', maxVideoSecLong: 'settings', maxVideoMB: 'settings', signups: 'settings', maintenance: 'settings', slowModeSec: 'settings', groupMax: 'settings', callMax: 'settings', postsOpen: 'settings', dmOpen: 'settings', callsOpen: 'settings', motd: 'announce', announce: 'announce', wordFilter: 'filter' };
          for (const [k, v] of Object.entries(body)) {
            if (!keys[k]) continue; if (keys[k] === 'owner' && !isOwner()) return fail('Only the owner can change that.', 403);
            const x = keys[k] === 'owner' ? null : need(keys[k]); if (x) return x;
            if (k === 'wordFilter') M.cfg.wordFilter = (Array.isArray(v) ? v : String(v).split(/[\n,]/)).map(w => String(w).trim()).filter(Boolean).slice(0, 300);
            else if (k === 'announce') M.cfg.announce = v ? { text: String(v.text || v).slice(0, 300), by: me, t: now(), style: v.style || 'info' } : null;
            else if (k === 'motd') M.cfg.motd = String(v).slice(0, 200);
            else if (k === 'googleDomain') M.cfg.googleDomain = String(v || '').trim().toLowerCase().replace(/^@/, '').slice(0, 100);
            else if (k === 'codeEpoch') M.cfg.codeEpoch = now(); // everyone has to crack the code again
            else if (k === 'shutdownMsg') M.cfg.shutdownMsg = String(v).slice(0, 200);
            else if (typeof DEFAULT_CFG[k] === 'boolean') M.cfg[k] = !!v;
            else if (k === 'saverForce') M.cfg.saverForce = Math.max(-1, Math.min(3, Math.round(Number(v))));
            else M.cfg[k] = Math.max(0, Number(v) || 0);
          }
          M.cfg.groupMax = Math.max(2, Math.min(5, M.cfg.groupMax));
          M.cfg.postMax = Math.max(1, Math.min(50, M.cfg.postMax)); M.cfg.postWindowMin = Math.max(1, M.cfg.postWindowMin);
          await putMeta(s, M); await audit('change settings', Object.keys(body).join(','));
          return json({ ok: true, cfg: M.cfg });
        }
        return json({ cfg: M.cfg });
      }
      if (a1 === 'resetall' && method === 'POST') { // owner only: everyone's post limit starts over right now
        if (!isOwner()) return fail('Only the owner can reset post limits.', 403);
        M.cfg.limitEpoch = now(); await putMeta(s, M); await audit('reset everyone\'s post limits', '*'); return json({ ok: true });
      }
      if (a1 === 'budget') { // Cloudflare free plan: 100,000 server requests per day
        if (!isOwner()) return fail('Owner only.', 403);
        const m = await flushMeter(s, cfg, true); const L = (await s.get('r2/all', { type: 'json' })) || [];
        return json({ cloudflare: true, calls: m.calls, limit: DAILY_LIMIT, saver: saverLevel(cfg), saverForce: cfg.saverForce, storageGB: Math.round(L.reduce((n, x) => n + (x.size || 0), 0) / 1073741824 * 100) / 100, cleanGB: cfg.r2CleanGB, resetsAt: cycleStart().end });
      }
      if (a1 === 'export' && method === 'GET') { // OWNER ONLY: download accounts as a file
        if (!isOwner()) return fail('Only the owner can export accounts.', 403);
        const only = (url.searchParams.get('users') || '').split(',').map(clean).filter(Boolean);
        const { blobs } = await s.list({ prefix: `users/${tnet}/` }); const accounts = [];
        for (const b of blobs) {
          const u = b.key.split('/').pop(); if (u === OWNER || (only.length && !only.includes(u))) continue;
          const r = await s.get(b.key, { type: 'json' }); if (!r) continue;
          accounts.push({ alg: 'pbkdf2', u: r.u, display: r.display || '', bio: r.bio || '', avatar: r.avatar || '', verified: !!r.verified, roles: r.roles || [], created: r.created, salt: r.salt, hash: r.hash, prefs: r.prefs || null });
        }
        await audit('export accounts', only.join(',') || 'all', accounts.length + ' accounts');
        return json({ type: 'unstevened-social-accounts', version: 1, exportedAt: now(), from: tnet.slice(0, 6).toUpperCase(), accounts });
      }
      if (a1 === 'import' && method === 'POST') { // OWNER ONLY: bring accounts into this network
        if (!isOwner()) return fail('Only the owner can import accounts.', 403);
        if (body.type !== 'unstevened-social-accounts' || !Array.isArray(body.accounts)) return fail('That is not an UnStevened Social accounts file.');
        const res = { added: [], renamed: [], skipped: [] };
        for (const a of body.accounts.slice(0, 500)) {
          if (a.alg !== 'pbkdf2') { res.skipped.push(a.u + ' (old site — must make a new account)'); continue; }
          let u = clean(a.u); if (!/^[a-z0-9_.]{3,20}$/.test(u) || u === OWNER || !/^[a-f0-9]{32}$/.test(a.salt || '') || !/^[a-f0-9]{64}$/.test(a.hash || '')) { res.skipped.push(a.u); continue; }
          if (await s.get(userKey(u, tnet), { type: 'json' })) {
            if (body.mode !== 'rename') { res.skipped.push(u); continue; }
            let n = 2, nu; do { nu = (u.slice(0, 17) + '_' + n++); } while (await s.get(userKey(nu, tnet), { type: 'json' }) && n < 99); res.renamed.push(u + ' → ' + nu); u = nu;
          } else res.added.push(u);
          const avatar = typeof a.avatar === 'string' && (a.avatar === '' || (a.avatar.startsWith('data:image/') && a.avatar.length < 60000)) ? a.avatar : '';
          await s.setJSON(userKey(u, tnet), { u, salt: a.salt, hash: a.hash, display: String(a.display || '').slice(0, 30), bio: String(a.bio || '').slice(0, 160), avatar, verified: !!a.verified, roles: (a.roles || []).filter(r => M.roles[r]), created: a.created || now(), imported: now(), postTimes: [], prefs: a.prefs || undefined });
        }
        M.nets[tnet] = { ...(M.nets[tnet] || { first: now() }), last: now(), users: (M.nets[tnet]?.users || 0) + res.added.length + res.renamed.length }; await putMeta(s, M);
        await audit('import accounts', tnet.slice(0, 6), `${res.added.length + res.renamed.length} added`);
        return json({ ok: true, ...res });
      }
      if (a1 === 'audit') { const x = need('audit'); if (x) return x; return json({ log: (await s.get('meta/audit', { type: 'json' })) || [] }); }
      if (a1 === 'nets') {
        const x = need('nets.view'); if (x) return x;
        if (method === 'POST') {
          const y = need('nets.ban'); if (y) return y;
          if (body.ban) M.netBans[body.net] = { by: me, reason: String(body.reason || ''), t: now() }; else delete M.netBans[body.net];
          await putMeta(s, M); await audit(body.ban ? 'ban network' : 'unban network', body.net.slice(0, 6)); return json({ ok: true });
        }
        return json({ nets: Object.entries(M.nets).map(([id, n]) => ({ id, short: id.slice(0, 6).toUpperCase(), ...n, banned: !!M.netBans[id], mine: id === myNet })), devBans: Object.keys(M.devBans).length });
      }
      if (a1 === 'devbans') {
        const x = need('users.devban'); if (x) return x;
        if (method === 'POST') { delete M.devBans[body.device]; await putMeta(s, M); return json({ ok: true }); }
        return json({ devBans: Object.entries(M.devBans).map(([d, v]) => ({ device: d, ...v })) });
      }
      if (a1 === 'credits') return json({ cloudflare: true });
    }
    return fail('Unknown request.', 404);
  } catch (err) {
    console.error(err);
    return fail('Server error: ' + (err?.message || err), 500);
  }
}
