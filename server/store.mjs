// UnStevened Social — storage on Cloudflare: small data in D1 (database), files in R2 (your bucket).
// Same get/set/setJSON/delete/list shape the server already uses.
const BIN = /^(vid|gif|snd|pimg)\//;          // these keys are files -> R2
const BIG = '\u0000r2';                        // marker: this JSON was too big for one database row, so it lives in R2
let ready = null;
export function makeStore(env) {
  const db = env.DB, bucket = env.BUCKET;
  if (!db || !bucket) throw new Error('Cloudflare setup is missing: add the D1 binding "DB" and the R2 binding "BUCKET" to the Pages project.');
  ready ||= db.prepare('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)').run();
  const r2key = (k) => 'kv/' + k;
  return {
    async get(k, o = {}) {
      await ready;
      if (o.type === 'arrayBuffer' || BIN.test(k)) { const obj = await bucket.get(r2key(k)); return obj ? (o.type === 'arrayBuffer' ? await obj.arrayBuffer() : await obj.text()) : null; }
      const row = await db.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first();
      if (!row) return null;
      let v = row.v;
      if (v === BIG) { const obj = await bucket.get(r2key(k)); if (!obj) return null; v = await obj.text(); }
      return o.type === 'json' ? JSON.parse(v) : v;
    },
    async set(k, v) {
      await ready;
      if (typeof v !== 'string' || BIN.test(k)) { await bucket.put(r2key(k), v); return; }
      if (v.length > 1500000) { await bucket.put(r2key(k), v); v = BIG; }
      await db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run();
    },
    setJSON(k, v) { return this.set(k, JSON.stringify(v)); },
    async delete(k) {
      await ready;
      if (BIN.test(k)) { await bucket.delete(r2key(k)); return; }
      const row = await db.prepare('SELECT v FROM kv WHERE k = ?').bind(k).first();
      if (row?.v === BIG) await bucket.delete(r2key(k));
      await db.prepare('DELETE FROM kv WHERE k = ?').bind(k).run();
    },
    async list({ prefix = '' } = {}) {
      await ready;
      const r = await db.prepare('SELECT k FROM kv WHERE k >= ? AND k < ? ORDER BY k LIMIT 10000').bind(prefix, prefix + '￿').all();
      return { blobs: (r.results || []).map(x => ({ key: x.k })) };
    },
    // part of a file (for video streaming)
    async range(k, offset, length) { const obj = await bucket.get(r2key(k), { range: { offset, length } }); return obj ? await obj.arrayBuffer() : null; }
  };
}
