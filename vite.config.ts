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
