/**
 * L0-B — Golden-Baseline der Layer-Matrix. Läuft IM BROWSER, nicht in Node.
 *
 * Einsatz (eine der drei Varianten):
 *   a) DevTools-Konsole auf der geöffneten 2D-Karte: Dateiinhalt einfügen, Enter.
 *   b) Chrome DevTools MCP: als `evaluate`-Ausdruck übergeben.
 *   c) Snippet in DevTools → Sources → Snippets ablegen und per Ctrl+Enter starten.
 *
 * Ergebnis: ein JSON-Objekt (auch in `window.__buscosunLayerMatrix` und, wenn
 * erlaubt, in der Zwischenablage), das die Layer-Reihenfolge und den
 * Sichtbarkeitszustand festhält. Nach dem Registry-Umbau (V-135) erneut laufen
 * lassen und mit `scripts/verify-layer-matrix.mjs` gegen die Baseline diffen.
 *
 * WARUM DAS NÖTIG IST: Der Registry-/Applier-Umbau berührt genau die Stelle, an
 * der schon einmal ein realer Nutzer-Bug entstanden ist („Regen über
 * Belgien/Slowenien", dokumentiert in den Kommentaren um MapView.tsx:1136-1148).
 * Ein Screenshot zeigt, DASS etwas anders aussieht; diese Matrix zeigt, WAS sich
 * verschoben hat — inklusive der drei Erhalt-Kontrakte:
 *   · Wind liegt über Grenzen und Beschriftungen (kein beforeId)
 *   · Stationen liegen über der Länder-Maske
 *   · Scalar/Rain liegen UNTER der Länder-Maske (Depth-Kontrakt)
 *
 * ZUGRIFF AUF DIE MAP-INSTANZ: Die App exportiert sie nicht global — das ist
 * richtig so. Dieses Skript versucht der Reihe nach:
 *   1. `window.__buscosunMap` (Dev-Hook, s. unten)
 *   2. Suche über die MapLibre-Canvas-Container im DOM (funktioniert, solange
 *      MapLibre seine übliche Struktur behält — best effort)
 *   3. Fallback: DOM-Zustand des Docks + aktueller #m=-Permalink. Damit lässt
 *      sich die Ansicht immer noch exakt reproduzieren, nur ohne Layer-Ordnung.
 *
 * DER DEV-HOOK (Variante 1) ist eine Zeile und liefert die vollständige Matrix:
 *
 *     // src/MapView.tsx, direkt nach `mapRef.current = map;`
 *     if (import.meta.env.DEV) (window as any).__buscosunMap = map;
 *
 * ⚠ Diese Zeile ist ein TEMPORÄRES Diagnosewerkzeug für Phase L0/L1/L2.
 *   Sie ist DEV-only, gehört NICHT in einen Commit und ist nach Gate L2 zu
 *   entfernen. Ob sie überhaupt eingebaut wird, entscheidet Jan — ohne sie
 *   greift Variante 2/3, dann ist die Baseline schwächer, aber vorhanden.
 */
(() => {
  'use strict';

  const LAYER_KEYS = [
    'wind', 'gust', 'nowcast', 'temp', 'clouds', 'sat',
    'lightning', 'lightningfc', 'stations', 'confidence',
    'snowline', 'flownowcast', 'poprob', 'thunder', 'snow', 'rotation',
  ];

  /** Layer-IDs aus MapView.tsx — die Namen im MapLibre-Style. */
  const KNOWN_LAYER_IDS = {
    'basemap-dim': 'Abdunklung',
    'country-mask-fill': 'Länder-Maske',
    'satellite-layer': 'Satellit',
    'lightning-layer': 'Blitze',
    'dach-stations-layer': 'Stationen',
    'precip-rain-layer': 'Niederschlag',
    'confidence-hatch': 'Vertrauens-Schleier',
    'snowline-casing': 'Schneegrenze (Casing)',
    'snowline-line': 'Schneegrenze',
    'flow-nowcast-layer': 'Flow-Nowcast',
    'pop-layer': 'Regen-Chance',
    'thunder-potential': 'Gewitterpotenzial',
    'lightning-forecast': 'Blitzprognose',
    'snow-amount': 'Schnee',
    'rotation-potential': 'Rotation',
  };

  function findMap() {
    if (window.__buscosunMap) return { map: window.__buscosunMap, how: 'dev-hook' };
    // best effort: MapLibre hängt an einem Container mit .maplibregl-map
    for (const el of document.querySelectorAll('.maplibregl-map')) {
      for (const k of Object.keys(el)) {
        const v = el[k];
        if (v && typeof v.getStyle === 'function' && typeof v.getLayer === 'function') {
          return { map: v, how: 'dom-scan' };
        }
      }
    }
    return { map: null, how: 'none' };
  }

  const { map, how } = findMap();

  const snap = {
    capturedAt: new Date().toISOString(),
    href: location.href,
    hash: location.hash,
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    access: how,
    layerKeys: LAYER_KEYS,
  };

  // --- Dock-Zustand: funktioniert immer, unabhängig vom Map-Zugriff ----------
  try {
    const dock = [...document.querySelectorAll('[class*="mdk-"] button, .mdk-dock button')]
      .map((b) => ({
        label: (b.textContent || '').trim().slice(0, 40),
        pressed: b.getAttribute('aria-pressed'),
        active: /active|is-on|selected/.test(b.className),
      }))
      .filter((b) => b.label);
    snap.dock = dock;
  } catch (e) {
    snap.dockError = String(e && e.message || e);
  }

  if (!map) {
    snap.warning =
      'Map-Instanz nicht gefunden. Die Matrix enthält nur Dock- und Permalink-Zustand. '
      + 'Für die vollständige Baseline den DEV-Hook einbauen (s. Kopfkommentar) — '
      + 'oder mit der reduzierten Baseline arbeiten und sich auf die Screenshots stützen.';
    console.warn(snap.warning);
  } else {
    try {
      const style = map.getStyle();
      const layers = (style.layers || []).map((l, i) => {
        let visibility = null;
        try { visibility = map.getLayoutProperty(l.id, 'visibility') ?? 'visible'; } catch { /* custom layer */ }
        return {
          index: i,
          id: l.id,
          type: l.type,
          source: l.source ?? null,
          visibility,
          known: KNOWN_LAYER_IDS[l.id] ?? null,
        };
      });
      snap.layerOrder = layers.map((l) => l.id);
      snap.layers = layers;
      snap.weatherLayers = layers.filter((l) => l.known);

      // --- Die drei Erhalt-Kontrakte explizit prüfen ------------------------
      const idx = (id) => snap.layerOrder.indexOf(id);
      const mask = idx('country-mask-fill');
      const contracts = [];
      const add = (name, ok, detail) => contracts.push({ name, ok, detail });

      const windIdx = layers.findIndex((l) => l.type === 'custom' && /wind/i.test(l.id));
      add(
        'Wind liegt über der Länder-Maske (bewusst, MapView.tsx:1073 ohne beforeId)',
        windIdx < 0 ? null : (mask < 0 || windIdx > mask),
        `wind@${windIdx} mask@${mask}`,
      );
      add(
        'Stationen liegen über der Länder-Maske',
        idx('dach-stations-layer') < 0 ? null : idx('dach-stations-layer') > mask,
        `stations@${idx('dach-stations-layer')} mask@${mask}`,
      );
      add(
        'Niederschlag liegt unter der Länder-Maske (Depth-Kontrakt, clippt auf DACH)',
        idx('precip-rain-layer') < 0 ? null : idx('precip-rain-layer') < mask,
        `precip@${idx('precip-rain-layer')} mask@${mask}`,
      );
      add(
        'Vertrauens-Schleier liegt über den Datenschichten',
        idx('confidence-hatch') < 0 ? null : idx('confidence-hatch') > idx('precip-rain-layer'),
        `veil@${idx('confidence-hatch')} precip@${idx('precip-rain-layer')}`,
      );
      snap.contracts = contracts;

      console.log('%cErhalt-Kontrakte', 'font-weight:bold');
      for (const c of contracts) {
        const mark = c.ok === null ? '·' : c.ok ? '✓' : '✗';
        console.log(`  ${mark} ${c.name}  (${c.detail})`);
      }
      console.table(snap.weatherLayers);
    } catch (e) {
      snap.mapError = String(e && e.message || e);
      console.error('Layer-Auslesen fehlgeschlagen:', e);
    }
  }

  window.__buscosunLayerMatrix = snap;
  const text = JSON.stringify(snap, null, 2);
  console.log(text);
  try {
    navigator.clipboard.writeText(text).then(
      () => console.log('%c→ JSON in der Zwischenablage. Speichern unter audit/l0/matrix-<id>.json',
        'color:#2a7'),
      () => console.log('→ Zwischenablage nicht erlaubt: JSON oben markieren und kopieren.'),
    );
  } catch {
    console.log('→ JSON oben markieren und kopieren.');
  }
  return snap;
})();
