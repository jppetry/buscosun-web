import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import firmsHandler from './netlify/edge-functions/firms.ts';

// Node-Globals ohne @types/node (D-06: keine neue Abhängigkeit, auch keine
// Typ-Abhängigkeit). Nur das, was hier wirklich benutzt wird.
declare const process: { cwd(): string; env: Record<string, string | undefined> };

// Upstream proxies for sources that block browser CORS. In production these
// need a real backend proxy or a CORS-friendly mirror — dev + preview front
// them so the client just sees same-origin URLs.
const upstreamProxy = {
  '/_dwd_opendata': {
    target: 'https://opendata.dwd.de',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/_dwd_opendata/, ''),
  },
  // Wind-Layer-Caching-Pfad (Phase T1). In Produktion / `netlify dev` fängt die
  // Edge Function `netlify/edge-functions/dwd-wind.ts` `/_dwd_wind/*` VOR dem
  // Framework-Server ab und liefert durable-gecacht aus. Dieser Vite-Eintrag ist
  // der Dev-Fallback (dünner Pass-Through ohne Cache), damit `vite dev`/`vite
  // preview` die Wind-Bytes über denselben Client-Pfad ausliefern — für die
  // lokale Client-/Output-Gleichheits-Verifikation ohne Netlify-CLI.
  '/_dwd_wind': {
    target: 'https://opendata.dwd.de',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/_dwd_wind/, ''),
  },
  // Generischer ICON-D2-GRIB-Caching-Pfad (Phase T2: Temp/Gust/Precip/Clouds).
  // In Produktion / `netlify dev` bedient die Edge Function `netlify/edge-
  // functions/dwd-grib.ts` `/_dwd_grib/*` durable-gecacht; dieser Vite-Eintrag
  // ist der Dev-Fallback (dünner Pass-Through ohne Cache), analog `/_dwd_wind`.
  '/_dwd_grib': {
    target: 'https://opendata.dwd.de',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/_dwd_grib/, ''),
  },
  // MeteoAlarm (EUMETNET) — amtliche Schweizer Warnungen von MeteoSchweiz
  // (Phase W2). Kein CORS am Ursprung (mit echtem Origin-Header gegengeprüft),
  // daher derselbe Pfad wie in `netlify.toml`: ein dünner Rewrite, KEIN
  // Durable-Cache — für Warnungen ausgeschlossen (`docs/API.md` §7).
  '/_meteoalarm': {
    target: 'https://feeds.meteoalarm.org',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/_meteoalarm/, ''),
  },
  // NOAA GFS (AWS Open Data, S3 — Range-fähig, Public Domain) für den 3D-Globus.
  '/_gfs': {
    target: 'https://noaa-gfs-bdp-pds.s3.amazonaws.com',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/_gfs/, ''),
  },
  // MeteoSchweiz OGD (ICON-CH1/CH2-EPS): der STAC-Katalog (data.geo.admin.ch)
  // erlaubt Browser-CORS, der pre-signed S3-Objektspeicher rgw.cscs.ch NICHT.
  // changeOrigin setzt Host=rgw.cscs.ch → die S3-v2-Signatur (Host+Pfad+Expires
  // in der Query) bleibt gültig; die Query wird 1:1 durchgereicht.
  '/_cscs': {
    target: 'https://rgw.cscs.ch',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/_cscs/, ''),
  },
  // Météo-France PNT (AROME-France): key-freie GRIB2-Pakete auf OVH-Cloud-S3,
  // ohne Browser-CORS → Proxy. Range-fähig (für selektives Nachladen einzelner
  // Nachrichten aus den großen 0,01°-Multi-Variablen-Dateien).
  '/_mf': {
    target: 'https://meteofrance-pnt.s3.rbx.io.cloud.ovh.net',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/_mf/, ''),
  },
  // ECMWF Open Data (IFS): GRIB2 + .index-Sidecars (Byte-Range je Feld), CC-BY-4.0,
  // kein Key. Browser-CORS blockiert → Proxy.
  '/_ecmwf': {
    target: 'https://data.ecmwf.int',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/_ecmwf/, ''),
  },
};

/**
 * Dev-/Preview-Gegenstück zur Edge Function `netlify/edge-functions/firms.ts`
 * (Phase F0, von Jan am 2026-08-14 als Dev-Pfad (a) freigegeben).
 *
 * Warum nicht wie `/_dwd_wind` und `/_dwd_grib` ein dünner Pass-Through:
 * Diese Route trägt ein Geheimnis. Ein Vite-`proxy`-Eintrag kann den MAP_KEY
 * nicht in den Pfad setzen, ohne ihn in die eingecheckte Konfiguration zu
 * schreiben — genau das, was §W.2.1 Auflage 1 ausschließt.
 *
 * Statt die Prüflogik ein zweites Mal zu schreiben (und sie auseinanderlaufen
 * zu lassen), ruft dieses Plugin **den echten Edge-Handler** auf. Dev und
 * Produktion können damit nicht divergieren: gleiche Whitelist, gleiche
 * DACH-Hülle, gleiche Fehlertexte, gleiche CSV-Kopfprüfung.
 *
 * Der Schlüssel wird per `loadEnv` aus `.env.local` gelesen (gitignoriert über
 * `*.local`) und in `process.env` gelegt, wo `readMapKey()` ihn findet.
 * ⚠️ Das ist der **Node**-Prozess des Dev-Servers, nicht der Browser: Vite
 * inlint aus `import.meta.env` ausschließlich `VITE_`-Variablen, und
 * `process.env.<X>` wird im Client nur für `NODE_ENV` ersetzt. Der Wert kann
 * also nicht ins Bundle geraten — `FIRMS_MAP_KEY` steht bewusst OHNE
 * `VITE_`-Präfix und wird nirgends an `define` übergeben.
 */
function firmsDevProxy(): Plugin {
  return {
    name: 'buscosun:firms-dev',
    config(_config, { command, mode }) {
      // Nur Dev/Preview (`vite build` läuft mit command === 'build'): im Build
      // wird der Schlüssel nicht einmal gelesen.
      if (command !== 'serve') return;
      const key = loadEnv(mode, process.cwd(), '').FIRMS_MAP_KEY?.trim();
      if (key) process.env.FIRMS_MAP_KEY = key;
      // Beim Start SAGEN, woran man ist — nie den Wert, nur ob und wie lang.
      // Ohne diese Zeile ist ein fehlender Schlüssel auf localhost unsichtbar:
      // der Handler antwortet 503, die Seite fällt still auf GWIS zurück und
      // meldet „NASA FIRMS nicht erreichbar" — dieselbe Meldung wie bei einem
      // echten Ausfall der NASA. Zwei sehr verschiedene Ursachen, eine Anzeige.
      // eslint-disable-next-line no-console
      console.log(key
        ? `[firms] MAP_KEY aus .env.local geladen (${key.length} Zeichen) — /_firms/* ist scharf`
        : '[firms] KEIN FIRMS_MAP_KEY gefunden (.env.local) — /_firms/* antwortet 503, '
          + 'die Waldbrand-Ansicht fällt auf die keylose GWIS-Ebene zurück');
    },
    configureServer(server) {
      server.middlewares.use(firmsDevMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(firmsDevMiddleware);
    },
  };
}

/**
 * Minimale Strukturtypen statt @types/node (D-06). Die Parameter sind
 * `unknown`, weil Connects `IncomingMessage`/`ServerResponse` ohne installierte
 * Node-Typen zu leeren Interfaces auflösen — ein direkt annotierter Parameter
 * würde deshalb an TS' Weak-Type-Prüfung scheitern, nicht an einem echten
 * Typfehler. Die Einengung passiert hier, an einer Stelle, sichtbar.
 */
interface DevReq { url?: string; method?: string }
interface DevRes { statusCode: number; setHeader(n: string, v: string): void; end(chunk?: string): void }

async function firmsDevMiddleware(rawReq: unknown, rawRes: unknown, next: () => void): Promise<void> {
  const req = rawReq as DevReq;
  const res = rawRes as DevRes;
  const path = req.url ?? '';
  if (!path.startsWith('/_firms/')) { next(); return; }

  const response = await firmsHandler(
    new Request(`http://localhost${path}`, { method: req.method ?? 'GET' }),
  );

  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    // Cache-Header im Dev NICHT übernehmen: ein 5-Minuten-Browser-Cache macht
    // jede Iteration am Layer zur Rätselarbeit. In Produktion greifen sie.
    if (name.toLowerCase().startsWith('cache-control')) return;
    if (name.toLowerCase() === 'netlify-cdn-cache-control') return;
    res.setHeader(name, value);
  });
  res.setHeader('cache-control', 'no-store');
  res.end(await response.text());
}

export default defineConfig({
  plugins: [react(), firmsDevProxy()],
  // ESM-Worker (statt iife) — der bz2-Decompress-Worker nutzt einen dynamischen
  // import('bz2'), was Code-Splitting verlangt; iife unterstützt das nicht.
  worker: { format: 'es' },
  // bzip2-wasm (Emscripten) NICHT vor-bündeln: sonst landet nur das JS-Glue in
  // .vite/deps/, ohne die daneben liegende bzip2.wasm → `new URL('bzip2.wasm',
  // import.meta.url)` findet die Binärdatei nicht und der Loader hängt. Ausgeschlossen
  // lädt das Glue direkt aus node_modules, wo die .wasm adjazent liegt.
  optimizeDeps: { exclude: ['bzip2-wasm'] },
  build: {
    rollupOptions: {
      output: {
        // maplibre-gl (~500 KB) in einen eigenen, von allen Lazy-Karten-Seiten
        // geteilten Chunk auslagern → einmal laden + langfristig cachebar,
        // statt in mehrere Seiten-Chunks dupliziert zu werden.
        manualChunks: { maplibre: ['maplibre-gl'] },
      },
    },
  },
  // Same proxy map for dev AND `vite preview`, so a production-build cold-start
  // can be measured realistically (preview otherwise SPA-falls-back
  // /_dwd_opendata to index.html).
  server: { proxy: upstreamProxy },
  preview: { proxy: upstreamProxy },
});
