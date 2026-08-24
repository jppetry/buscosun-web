/**
 * Zellbahnen (DWD KONRAD3D) — die EINE Layer-Definition für beide Karten.
 *
 * Herausgelöst aus `MapView.tsx` (RL1, `audit/regenradar-layer-angleich.md`):
 * Layer-IDs, Ausdünnungs-Schwellen, Severity-Farbe, die Canvas-Sprites für
 * Zeitmarken und Pfeilkopf, der Steckbrief und `installCellLayers()` — die
 * Wetterkarte und das Regenradar zeichnen damit byte-gleiche Layer-Specs.
 * Regel: 1:1 heißt importieren, nicht kopieren (`audit/waldbrand-wind.md`).
 *
 * Bewusst OHNE `text-field`: die Glyphen des Basemap-Stils kommen von einem
 * Fremd-CDN (`tiles.openfreemap.org/fonts/…`), auf das wir uns nicht verlassen.
 * Die `symbol`-Layer nutzen `icon-image` mit Sprites aus `map.addImage()`
 * (Muster `RouteMap.tsx:363`, `docs/zuglinien-radar-spec.md` §10.5, Jans
 * Entscheidung S-Z2-1 vom 2026-08-07).
 *
 * Wortwahl im Steckbrief ist **gate-blockierend** (D-19): „Zelle", „Hinweis auf
 * Hagel in der Zelle", „geschätzte Spitzenböe". NIE „Tornado", „Warnung",
 * „Gefahr", „Unwetter", „trifft".
 */

import maplibregl, { type ExpressionSpecification } from 'maplibre-gl';
import { KONRAD3D_ATTRIBUTION } from '../sources/dwdKonrad3d';
import { CELL_TIME_MARK_LEADS, type CellFeatureProperties } from './cellPolygons';
import './cellPopup.css';

export const CELLS_SOURCE_ID = 'storm-cells';
export const CELLS_CONE_LAYER_ID = 'storm-cells-cone';
export const CELLS_CONE_STEP_LAYER_ID = 'storm-cells-cone-step';
export const CELLS_HULL_LAYER_ID = 'storm-cells-hull';
export const CELLS_HULL_LINE_ID = 'storm-cells-hull-line';
export const CELLS_PATH_LAYER_ID = 'storm-cells-path';
export const CELLS_MARK_LAYER_ID = 'storm-cells-mark';
export const CELLS_ARROW_LAYER_ID = 'storm-cells-arrow';
export const CELLS_DOT_LAYER_ID = 'storm-cells-dot';
/** Alle Zell-Layer in Zeichenreihenfolge (unten → oben). */
export const CELLS_LAYER_IDS = [
  CELLS_CONE_LAYER_ID, CELLS_CONE_STEP_LAYER_ID, CELLS_HULL_LAYER_ID, CELLS_HULL_LINE_ID,
  CELLS_PATH_LAYER_ID, CELLS_MARK_LAYER_ID, CELLS_ARROW_LAYER_ID, CELLS_DOT_LAYER_ID,
] as const;
/** Sprite-IDs der Z2-Symbole (per `map.addImage` aus einem Canvas). */
export const CELLS_ARROW_IMAGE_ID = 'storm-cells-arrow-sprite';
export const cellsMarkImageId = (leadMin: number) => `storm-cells-mark-${leadMin}`;
/** Ausdünnung (Z2-5) — ausschließlich native Mittel, kein JS im Repaint.
 *  Ausgedünnt wird NUR Zusatzgeometrie; Umriss, Umrisslinie und Punkt sind
 *  ausgenommen (Funktionserhalt). Was entfällt, wird geloggt, nicht verschwiegen. */
export const CELLS_CONE_STEP_MINZOOM = 6;
export const CELLS_MARK_MINZOOM = 8;
export const CELLS_ARROW_MINZOOM = 5;
/** Trichterstufen erst ab dieser Severity — unterhalb bleibt die Z1-Hülle stehen.
 *  Schwelle an der gemessenen Verteilung gesetzt (Fixture: 0,77 / 0,19 / 0,17). */
export const CELLS_CONE_STEP_MIN_SEV = 0.5;
/** Prognosehorizont der Zellbahnen (min) — jenseits davon ist der Layer AUS,
 *  statt eine Zelle zu zeigen, die für die eingestellte Stunde nichts aussagt
 *  (D-14-Muster: lieber nichts als eine unbelegte Verlängerung). */
export const CELLS_HORIZON_MIN = 60;
/** Abrufabstand (ms) — KONRAD3D erscheint alle 5 min, ~0,6 MB je Datei. */
export const CELLS_POLL_MS = 5 * 60_000;
/** Farbe nach severity_decimal (0…3): Sand → Amber → Terracotta → Bordeaux. */
export const CELLS_SEVERITY_COLOR: ExpressionSpecification = [
  'interpolate', ['linear'], ['coalesce', ['get', 'sev'], 0],
  0, '#c9a227',
  1, '#e08a2e',
  2, '#c9522e',
  3, '#8f2140',
];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;');
}

/**
 * Steckbrief einer KONRAD3D-Zelle (Klick auf den Schwerpunkt). Amtliche
 * Warnungen kommen aus dem Warn-Layer, nicht von hier — der Hinweis darauf
 * steht fest im Fuß des Steckbriefs.
 */
export function renderCellPopup(p: CellFeatureProperties): string {
  const row = (label: string, value: string | null | undefined) =>
    value == null ? '' : `<div class="sp-row"><span class="sp-l">${label}</span><span class="sp-v">${value}</span></div>`;
  const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v);
  // Z2-6: EINE Zuggeschwindigkeit — die aus der gezeichneten Spur abgeleitete,
  // auf 5er gerundete Zahl (`displaySpeedKmh`, als Property mitgeliefert).
  // `cell_speed` bleibt geparst und im Verifier, beschriftet aber nicht mehr:
  // sonst widersprächen sich Zahl und gezeichnete Geometrie (Diagnose §2.5).
  const zug = n(p.trackSpeedKmh) != null
    ? `~${p.trackSpeedKmh} km/h${p.compass ? ` nach ${p.compass}` : ''}`
    : null;
  const top = n(p.echoTopM) != null
    ? `${(Math.round((p.echoTopM as number) / 100) / 10).toFixed(1).replace('.', ',')} km`
    : null;
  const dbz = n(p.dbzMax) != null ? `${Math.round(p.dbzMax as number)} dBZ` : null;
  const area = n(p.areaKm2) != null ? `${Math.round(p.areaKm2 as number)} km²` : null;
  const blitz = n(p.lightningRate) != null && (p.lightningRate as number) > 0
    ? `${Math.round(p.lightningRate as number)} / 5 min` : null;
  // Begleiterscheinungen: bewusst als HINWEIS formuliert, nicht als Zusage.
  const hints: string[] = [];
  if (n(p.hailFlag) != null && (p.hailFlag as number) > 0) {
    hints.push((p.hailFlag as number) >= 2 ? 'Hinweis auf größeren Hagel in der Zelle' : 'Hinweis auf Hagel in der Zelle');
  }
  if (n(p.gustFlag) != null && (p.gustFlag as number) > 0) {
    hints.push(n(p.gustKmh) != null
      ? `Hinweis auf Böen — geschätzte Spitze ~${Math.round(p.gustKmh as number)} km/h`
      : 'Hinweis auf Böen in der Zelle');
  }
  if (n(p.heavyRainFlag) != null && (p.heavyRainFlag as number) > 0 && n(p.heavyRainMm) != null) {
    hints.push(`Hinweis auf Starkregen — ~${Math.round(p.heavyRainMm as number)} mm${
      n(p.heavyRainMinutes) != null ? ` in ~${Math.round(p.heavyRainMinutes as number)} min` : ''}`);
  }
  if (n(p.mesocyclones) != null && (p.mesocyclones as number) > 0) {
    hints.push('rotierende Struktur in der Zelle erkannt');
  }
  const hintBlock = hints.length
    ? `<div class="sp-row" style="display:block;line-height:1.35;">${hints.map((h) => `⚑ ${escapeHtml(h)}`).join('<br>')}</div>`
    : '';
  const stamp = n(p.refMs) != null
    ? `Messzeit ${new Date(p.refMs as number).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
    : '';
  return `
    <div class="sp">
      <div class="sp-name">${escapeHtml(p.headline ?? `Zelle ${p.id}`)}</div>
      <div class="sp-meta">DWD KONRAD3D · Umriss gemessen, Spur prognostiziert (bis +${p.leadMinutes ?? 60} Min)</div>
      ${row('Zuggeschwindigkeit', zug)}
      ${row('Radarintensität', dbz)}
      ${row('Obergrenze (Echotop)', top)}
      ${row('Fläche', area)}
      ${row('Blitzrate', blitz)}
      ${hintBlock}
      <div class="sp-stamp">${stamp}${stamp ? ' · ' : ''}kein amtliches Warnprodukt — maßgeblich sind die DWD-Warnungen</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Zellbahnen · Phase Z2 — Sprites für Pfeilkopf und Zeitmarken.
//
// Programmatisch aus einem Canvas, kein externes Asset und KEINE Glyphenquelle.
// Beide tragen bewusst die OPTIK DER PROGNOSE (Z2-E1): der Pfeil ist eine
// hohle Kontur statt eines Vollkörpers, die Zeitmarke hat einen gestrichelten
// Rand. Nichts Prognostiziertes darf solider wirken als die gestrichelte Spur,
// an der es hängt.
// ---------------------------------------------------------------------------
const CELLS_SPRITE_INK = '#2C2A26';   // --ink-900
const CELLS_SPRITE_CREAM = '#FAF6EA'; // --cream-50

/** Hohler Chevron, Spitze nach Norden — `icon-rotate` dreht ihn auf die Peilung. */
export function makeCellArrowImage(): ImageData | null {
  if (typeof document === 'undefined') return null;
  const S = 44;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.translate(S / 2, S / 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const chevron = () => {
    ctx.beginPath();
    ctx.moveTo(-10, 6);
    ctx.lineTo(0, -9);
    ctx.lineTo(10, 6);
  };
  // Dunkle Fassung zuerst, damit die helle Kontur auf der hellen Trichterfläche
  // wie auf der dunklen Kartenbühne gleichermaßen liest.
  chevron(); ctx.lineWidth = 6; ctx.strokeStyle = CELLS_SPRITE_INK; ctx.stroke();
  chevron(); ctx.lineWidth = 3; ctx.strokeStyle = CELLS_SPRITE_CREAM; ctx.stroke();
  return ctx.getImageData(0, 0, S, S);
}

/** Zeitmarke „15"/„30"/„60" als Pille mit gestricheltem Rand (= prognostiziert). */
export function makeCellMarkImage(label: string): ImageData | null {
  if (typeof document === 'undefined') return null;
  const W = 52, H = 34;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const r = 12, pad = 3;
  const pill = () => {
    ctx.beginPath();
    ctx.roundRect(pad, pad, W - 2 * pad, H - 2 * pad, r);
  };
  pill();
  ctx.fillStyle = 'rgba(44,42,38,0.86)';
  ctx.fill();
  pill();
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = CELLS_SPRITE_CREAM;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '700 17px "League Spartan", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = CELLS_SPRITE_CREAM;
  ctx.fillText(label, W / 2, H / 2 + 1);
  return ctx.getImageData(0, 0, W, H);
}

/**
 * Legt Quelle, Sprites und die acht Zell-Layer an (alle `visibility: 'none'`,
 * Daten kommen aus dem Poll-Effekt der jeweiligen Karte). Idempotent — darf
 * nach jedem `style.load` erneut laufen. `beforeId` ordnet die Layer unter
 * einen bestehenden Layer ein (Wetterkarte: Grenzen); ohne = oben.
 *
 * Phase Z1 — EINE Quelle, gefilterte Layer. Die optische Trennung gemessen ↔
 * prognostiziert ist gate-blockierend (D-04): Umriss durchgezogen und kräftig,
 * Spur gestrichelt, Trichter nur angedeutet.
 */
export function installCellLayers(map: maplibregl.Map, beforeId?: string): void {
  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
  if (!map.getSource(CELLS_SOURCE_ID)) {
    map.addSource(CELLS_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      attribution: KONRAD3D_ATTRIBUTION,
    });
  }
  if (!map.getLayer(CELLS_CONE_LAYER_ID)) {
    map.addLayer({
      id: CELLS_CONE_LAYER_ID, type: 'fill', source: CELLS_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'cone'],
      layout: { visibility: 'none' },
      // Sehr zurückhaltend: der Trichter ist eine Unsicherheits-, keine
      // Ereignisfläche — er darf das Kartenbild nicht dominieren.
      paint: { 'fill-color': CELLS_SEVERITY_COLOR, 'fill-opacity': 0.1 },
    }, before);
  }
  // Z2: der Verlauf. Der Z1-Layer darüber bleibt UNVERÄNDERT und liefert die
  // Grundtönung — dadurch ist `coneRing()` weiterhin gezeichnet (benannter
  // Rückfall) und die Hülle deckt auch die Zwickel, die die Ellipsen
  // freilassen. Die Stufen legen den Verlauf darauf: vorn dicht, hinten
  // fast durchsichtig — genau die Aussage, die die eine Fläche verschluckt.
  if (!map.getLayer(CELLS_CONE_STEP_LAYER_ID)) {
    map.addLayer({
      id: CELLS_CONE_STEP_LAYER_ID, type: 'fill', source: CELLS_SOURCE_ID,
      minzoom: CELLS_CONE_STEP_MINZOOM,
      filter: ['all',
        ['==', ['get', 'kind'], 'cone-step'],
        ['>=', ['coalesce', ['get', 'sev'], 0], CELLS_CONE_STEP_MIN_SEV],
      ],
      layout: { visibility: 'none' },
      paint: {
        'fill-color': CELLS_SEVERITY_COLOR,
        'fill-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'leadMin'], 60],
          5, 0.2,
          30, 0.1,
          60, 0.04,
        ],
      },
    }, before);
  }
  if (!map.getLayer(CELLS_HULL_LAYER_ID)) {
    map.addLayer({
      id: CELLS_HULL_LAYER_ID, type: 'fill', source: CELLS_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'hull'],
      layout: { visibility: 'none' },
      paint: { 'fill-color': CELLS_SEVERITY_COLOR, 'fill-opacity': 0.22 },
    }, before);
  }
  if (!map.getLayer(CELLS_HULL_LINE_ID)) {
    map.addLayer({
      id: CELLS_HULL_LINE_ID, type: 'line', source: CELLS_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'hull'],
      layout: { visibility: 'none', 'line-join': 'round' },
      // DURCHGEZOGEN = gemessen (Referenzzeit der Datei).
      // Z2: die für den gewählten Ort relevante Zelle bekommt eine kräftigere
      // Linie — über eine `case`-Expression, NICHT über einen zweiten Layer.
      paint: {
        'line-color': CELLS_SEVERITY_COLOR,
        'line-width': ['case', ['==', ['get', 'affects'], 1], 2.8, 1.6],
        'line-opacity': 0.95,
      },
    }, before);
  }
  if (!map.getLayer(CELLS_PATH_LAYER_ID)) {
    map.addLayer({
      id: CELLS_PATH_LAYER_ID, type: 'line', source: CELLS_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'path'],
      layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      // GESTRICHELT = prognostiziert (+5 … +60 min).
      paint: {
        'line-color': CELLS_SEVERITY_COLOR,
        'line-width': ['case', ['==', ['get', 'affects'], 1], 3.2, 2],
        'line-opacity': 0.9,
        'line-dasharray': [2, 1.6],
      },
    }, before);
  }
  // Z2: Zeitmarken +15/+30/+60 auf der Spur. Ein fehlendes Sprite darf NICHT
  // still einen unsichtbaren Layer erzeugen (Z2-11) — deshalb erst
  // registrieren, dann `hasImage()` prüfen, sonst laut sein.
  for (const lead of CELL_TIME_MARK_LEADS) {
    const imgId = cellsMarkImageId(lead);
    if (!map.hasImage(imgId)) {
      const img = makeCellMarkImage(String(lead));
      if (img) map.addImage(imgId, img, { pixelRatio: 2 });
    }
  }
  const marksReady = CELL_TIME_MARK_LEADS.every((l) => map.hasImage(cellsMarkImageId(l)));
  if (!marksReady) {
    console.warn('[buscosun] Zellbahnen: Zeitmarken-Sprites fehlen — Layer wird nicht angelegt.');
  } else if (!map.getLayer(CELLS_MARK_LAYER_ID)) {
    map.addLayer({
      id: CELLS_MARK_LAYER_ID, type: 'symbol', source: CELLS_SOURCE_ID,
      minzoom: CELLS_MARK_MINZOOM,
      filter: ['==', ['get', 'kind'], 'mark'],
      layout: {
        visibility: 'none',
        'icon-image': ['concat', 'storm-cells-mark-', ['to-string', ['get', 'leadMin']]],
        // Die Pille sitzt ÜBER der Spur, nicht auf ihr: die +60-Marke und der
        // Pfeilkopf hängen beide an der letzten Stützstelle und lagen sonst
        // exakt aufeinander (auf dem Bildschirm gemessen: beide bei px
        // 523/372) — der Pfeil war damit unlesbar.
        'icon-anchor': 'bottom',
        'icon-offset': [0, -5],
        // `allow-overlap: false` wäre hier eine Falle: MapLibre platziert
        // die Basemap-Labels zuerst, unser Layer liegt oben und wird als
        // letzter platziert — am Bildschirm gemessen verschwanden dadurch
        // ALLE drei Marken (0 von 3 gerendert), ohne dass wir es hätten
        // loggen können. Ein stilles Weglassen ist schlimmer als eine
        // Überlagerung, deshalb sind die Marken platzierungsfest.
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        // Bei einer langsamen Zelle liegen +15/+30/+60 nur 4,5/9/18 km
        // auseinander. Überlagern sie sich, liegt die KLEINERE Vorlaufzeit
        // oben — die nähere Aussage ist die belastbarere.
        'symbol-sort-key': ['coalesce', ['get', 'leadMin'], 60],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 11, 0.95],
      },
      paint: { 'icon-opacity': 0.9 },
    }, before);
  }
  // Z2: Pfeilkopf am Spurende — die Zugrichtung ohne Klick.
  if (!map.hasImage(CELLS_ARROW_IMAGE_ID)) {
    const img = makeCellArrowImage();
    if (img) map.addImage(CELLS_ARROW_IMAGE_ID, img, { pixelRatio: 2 });
  }
  if (!map.hasImage(CELLS_ARROW_IMAGE_ID)) {
    console.warn('[buscosun] Zellbahnen: Pfeil-Sprite fehlt — Layer wird nicht angelegt.');
  } else if (!map.getLayer(CELLS_ARROW_LAYER_ID)) {
    map.addLayer({
      id: CELLS_ARROW_LAYER_ID, type: 'symbol', source: CELLS_SOURCE_ID,
      minzoom: CELLS_ARROW_MINZOOM,
      filter: ['==', ['get', 'kind'], 'arrow'],
      layout: {
        visibility: 'none',
        'icon-image': CELLS_ARROW_IMAGE_ID,
        'icon-rotate': ['coalesce', ['get', 'bearing'], 0],
        'icon-rotation-alignment': 'map',
        // Eine Marke je Zelle — sie IST die Aussage und darf nicht wegfallen.
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.55, 11, 1],
      },
      // Dieselbe Deckkraft wie die gestrichelte Spur (Z2-E1).
      paint: { 'icon-opacity': ['case', ['==', ['get', 'affects'], 1], 1, 0.9] },
    }, before);
  }
  if (!map.getLayer(CELLS_DOT_LAYER_ID)) {
    map.addLayer({
      id: CELLS_DOT_LAYER_ID, type: 'circle', source: CELLS_SOURCE_ID,
      filter: ['==', ['get', 'kind'], 'dot'],
      layout: { visibility: 'none' },
      paint: {
        'circle-color': CELLS_SEVERITY_COLOR,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 8, 5.5, 11, 7.5],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.4,
      },
    }, before);
  }
}

/** Sichtbarkeit aller acht Zell-Layer in einem Zug. */
export function setCellLayersVisible(map: maplibregl.Map, on: boolean): void {
  for (const id of CELLS_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
}

/**
 * Klick auf den Zell-Schwerpunkt öffnet den Steckbrief. Eigener Popup-Slot,
 * damit andere Popups derselben Karte nicht verdrängt werden. Gibt die
 * Abmelde-Funktion zurück.
 */
export function bindCellPopup(map: maplibregl.Map): () => void {
  let cellPopup: maplibregl.Popup | null = null;
  const click = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
    const f = e.features?.[0];
    if (!f) return;
    if (cellPopup) cellPopup.remove();
    cellPopup = new maplibregl.Popup({ offset: 10, closeButton: true, maxWidth: '280px' })
      .setLngLat(e.lngLat)
      .setHTML(renderCellPopup(f.properties as unknown as CellFeatureProperties))
      .addTo(map);
  };
  const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
  const leave = () => { map.getCanvas().style.cursor = ''; };
  map.on('click', CELLS_DOT_LAYER_ID, click);
  map.on('mouseenter', CELLS_DOT_LAYER_ID, enter);
  map.on('mouseleave', CELLS_DOT_LAYER_ID, leave);
  return () => {
    map.off('click', CELLS_DOT_LAYER_ID, click);
    map.off('mouseenter', CELLS_DOT_LAYER_ID, enter);
    map.off('mouseleave', CELLS_DOT_LAYER_ID, leave);
    cellPopup?.remove();
  };
}
