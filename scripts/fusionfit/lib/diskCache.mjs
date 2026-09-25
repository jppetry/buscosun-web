/**
 * diskCache.mjs — a `CacheBackend` (src/point/client/cache.ts) on disk, for the Node side of phase FL.
 *
 * The browser keeps Terrarium tiles, WorldCover ranges and finished per-point results in IndexedDB; the feature-table
 * builder (`features.mjs`) needs the same loaders (`loadTerrainAtPoint`, `loadLandCoverAtPoint`) without a browser, and
 * it must not fetch the same tile twice across 405 points or across reruns. One file per key under `<dir>/<aa>/<sha1>`:
 * `.bin` holds the bytes, `.json` the key and `storedAt`. Writes are atomic (temp file + rename), a torn or corrupt entry
 * reads as a miss, never as an error — the loaders count misses, they do not tolerate throws.
 *
 * `sweep(beforeMs)` removes entries stored before the stamp; `{ keep: true }` (the default) makes it a no-op, because
 * tiles and per-point results of a fixed WorldCover/Terrarium mirror never go stale (the key carries the mirror SHA).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sha1 = (s) => createHash('sha1').update(s).digest('hex');

export function diskBackend(dir, opts = {}) {
  const keep = opts.keep !== false;
  mkdirSync(dir, { recursive: true });
  const stats = { hits: 0, misses: 0, puts: 0, errors: 0 };
  const pathsOf = (key) => {
    const h = sha1(key);
    const sub = join(dir, h.slice(0, 2));
    return { sub, bin: join(sub, `${h}.bin`), meta: join(sub, `${h}.json`) };
  };
  return {
    kind: 'disk',
    dir,
    stats,
    async get(key) {
      const p = pathsOf(key);
      try {
        if (!existsSync(p.bin) || !existsSync(p.meta)) { stats.misses += 1; return null; }
        const meta = JSON.parse(readFileSync(p.meta, 'utf8'));
        if (meta.key !== key || !Number.isFinite(meta.storedAt)) { stats.misses += 1; return null; }
        const bytes = new Uint8Array(readFileSync(p.bin));
        if (Number.isFinite(meta.bytes) && meta.bytes !== bytes.length) { stats.misses += 1; return null; }
        stats.hits += 1;
        return { bytes, storedAt: meta.storedAt };
      } catch { stats.errors += 1; stats.misses += 1; return null; }
    },
    async put(key, entry) {
      const p = pathsOf(key);
      try {
        mkdirSync(p.sub, { recursive: true });
        const tmpB = `${p.bin}.${process.pid}.tmp`, tmpM = `${p.meta}.${process.pid}.tmp`;
        writeFileSync(tmpB, entry.bytes);
        writeFileSync(tmpM, JSON.stringify({ key, storedAt: entry.storedAt, bytes: entry.bytes.length }));
        renameSync(tmpB, p.bin);
        renameSync(tmpM, p.meta);
        stats.puts += 1;
      } catch { stats.errors += 1; }
    },
    async sweep(beforeMs) {
      if (keep) return 0;
      let n = 0;
      try {
        for (const sub of readdirSync(dir)) {
          const d = join(dir, sub);
          if (!statSync(d).isDirectory()) continue;
          for (const f of readdirSync(d)) {
            if (!f.endsWith('.json')) continue;
            let old = true;
            try { old = JSON.parse(readFileSync(join(d, f), 'utf8')).storedAt < beforeMs; } catch { old = true; }
            if (old) { rmSync(join(d, f), { force: true }); rmSync(join(d, f.replace(/\.json$/, '.bin')), { force: true }); n += 1; }
          }
        }
      } catch { stats.errors += 1; }
      return n;
    },
  };
}
