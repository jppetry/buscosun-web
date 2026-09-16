/**
 * rawFallback.mjs — V-FI-5 in the archive collector: jsDelivr answers `403` after seconds,
 * transiently, instead of 200 or 404.
 *
 * Measured on the PA2 test slot (2026-09-16 17:46 UTC, `audit/fusion-implementierung.md` §9.3.2):
 * 38 errors, ALL `HTTP 403` from jsDelivr — one t1 chunk (4 points), four t2 chunks (19 points),
 * two station bundles, five hmodel chunks. A slot cannot be collected again (the runs are pruned
 * after 9/24 h), so a 403 is lost data. Same cure as the browser reader (AP1, `fallbackStore` in
 * `src/point/client/store.ts`): raw.githubusercontent on 403, deadline, 5xx or network error —
 * with one difference: a PINNED base (`@<sha>`) falls back to raw AT THE SAME COMMIT, so a
 * manifest and its chunks (hmodel, both pinned) can never come from two different states.
 * No hedge: nobody waits for the collector.
 */
import { fallbackStore } from '../../../src/point/client/store.ts';

/** `https://cdn.jsdelivr.net/gh/<o>/<r>@<ref>` → `https://raw.githubusercontent.com/<o>/<r>/<ref>`; anything else → null. */
export function rawRefOf(base) {
  const m = /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^@/]+)\/([^@/]+)@([^/]+)$/.exec(String(base));
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : null;
}

/** The store with a same-ref raw fallback; `withBase` keeps the rule for every derived base. */
export function withRawSameRef(store) {
  const raw = rawRefOf(store.base);
  if (!raw || !store.withBase) return store;
  const f = fallbackStore(store, store.withBase(raw), { hedgeMs: 0 });
  return {
    get base() { return f.base; },
    get stats() { return f.stats; },
    bytes: f.bytes,
    json: f.json,
    withBase: (b) => withRawSameRef(store.withBase(b)),
  };
}
