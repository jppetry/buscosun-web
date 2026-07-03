import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Upstream proxies for sources that block browser CORS. In production these
// need a real backend proxy or a CORS-friendly mirror — dev + preview front
// them so the client just sees same-origin URLs.
const upstreamProxy = {
  '/_dwd_opendata': {
    target: 'https://opendata.dwd.de',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/_dwd_opendata/, ''),
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

export default defineConfig({
  plugins: [react()],
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
