// Stand-ins for Cloudflare's D1 database + R2 bucket so the site runs on your PC (preview) — data saved in a folder.
import fs from 'node:fs'; import path from 'node:path';
export function localEnv(dir) {
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  const dbFile = path.join(dir, 'db.json');
  const rows = new Map(Object.entries(fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile, 'utf8')) : {}));
  let t; const save = () => { clearTimeout(t); t = setTimeout(() => fs.writeFileSync(dbFile, JSON.stringify(Object.fromEntries(rows))), 200); };
  const DB = { prepare(sql) { let args = []; const q = { bind(...a) { args = a; return q; },
    async first() { if (/^SELECT v FROM kv WHERE k = \?/.test(sql)) return rows.has(args[0]) ? { v: rows.get(args[0]) } : null; return null; },
    async run() { if (/^INSERT INTO kv/.test(sql)) { rows.set(args[0], args[1]); save(); } else if (/^DELETE FROM kv/.test(sql)) { rows.delete(args[0]); save(); } return { success: true }; },
    async all() { if (/^SELECT k FROM kv WHERE k >= \?/.test(sql)) return { results: [...rows.keys()].filter(k => k >= args[0] && k < args[1]).sort().map(k => ({ k })) }; return { results: [] }; } }; return q; } };
  const fp = (k) => path.join(dir, 'files', encodeURIComponent(k));
  const obj = (b) => ({ size: b.length, async arrayBuffer() { return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); }, async text() { return b.toString(); } });
  const BUCKET = {
    async get(k, o = {}) { if (!fs.existsSync(fp(k))) return null; let b = fs.readFileSync(fp(k)); if (o.range) b = b.subarray(o.range.offset, o.range.offset + o.range.length); return obj(b); },
    async put(k, v) { fs.writeFileSync(fp(k), Buffer.from(typeof v === 'string' ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : v)); },
    async delete(k) { try { fs.unlinkSync(fp(k)); } catch {} },
    async head(k) { return fs.existsSync(fp(k)) ? { size: fs.statSync(fp(k)).size } : null; }
  };
  return { DB, BUCKET };
}
