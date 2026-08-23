/**
 * TA5 — Kartenlayer `fireAnomalies`: eine Raute je Standort persistenter Wärmequellen.
 *
 * Symbol-Layer mit vier gezeichneten Sprites (Muster `spread/spreadLayer.ts`): Klasse A
 * Graphit (benannte Anlage), B Grau (unbenannte Dauerquelle), C nur Umriss (Tagessignal —
 * keine Wärme), und `dev` Terracotta-Ring, wenn ein Eintrag des Fensters am Standort vom
 * Anlagenmuster abweicht (bleibt Brand). Die Raute ist bewusst KEIN Kreis: Kreise sind in
 * dieser Ansicht Detektionen.
 *
 * Pur bis auf die Canvas-Sprites (`document`); ohne DOM liefern sie `null`, und der Layer
 * wird nicht angelegt — derselbe Vertrag wie beim Ausbreitungspfeil.
 */
import type { FireRecord } from '../footprint/fireRegistry';
import type { ThermalSitesIndex, SiteClass } from './thermalSites';

export const ANOMALY_SOURCE_ID = 'fire-anomalies';
export const ANOMALY_LAYER_ID = 'fire-anomalies-points';
export const ANOMALY_SEL_LAYER_ID = 'fire-anomalies-sel';
export const ANOMALY_IMAGE_ID = 'fire-site-diamond-';
export const ANOMALY_VARIANTS = ['A', 'B', 'C', 'dev'] as const;
export type AnomalyVariant = (typeof ANOMALY_VARIANTS)[number];
export const ANOMALY_IMAGE_IDS: readonly string[] = ANOMALY_VARIANTS.map((v) => `${ANOMALY_IMAGE_ID}${v}`);

export const ANOMALY_ATTRIBUTION =
  'Standorte: NASA FIRMS (Archiv 2020–2026, eigene Ableitung) · © EEA Industrial Reporting CC-BY 4.0 · MaStR (BNetzA) DL-DE/BY-2.0 · BFE OPEN BY';

const INK = '#2C2A26';
const GREY = '#9A9186';
const TERRA = '#C2542B';
const CREAM = '#FAF6EA';

/** Raute 36×36 (DPR 2 ⇒ 18 px auf der Karte). */
export function makeSiteDiamondImage(variant: AnomalyVariant): ImageData | null {
  if (typeof document === 'undefined') return null;
  const S = 36;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.translate(S / 2, S / 2);
  ctx.rotate(Math.PI / 4);
  const h = 10;
  ctx.lineJoin = 'miter';
  // Helle Fassung, damit die Raute auf dunklen und hellen Grundkarten steht.
  ctx.fillStyle = CREAM;
  ctx.fillRect(-h - 3, -h - 3, 2 * h + 6, 2 * h + 6);
  if (variant === 'dev') {
    ctx.fillStyle = TERRA;
    ctx.fillRect(-h, -h, 2 * h, 2 * h);
    ctx.fillStyle = CREAM;
    ctx.fillRect(-h + 4, -h + 4, 2 * h - 8, 2 * h - 8);
    ctx.fillStyle = INK;
    ctx.fillRect(-h + 6, -h + 6, 2 * h - 12, 2 * h - 12);
  } else if (variant === 'C') {
    ctx.strokeStyle = GREY;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(-h + 1, -h + 1, 2 * h - 2, 2 * h - 2);
  } else {
    ctx.fillStyle = variant === 'A' ? INK : GREY;
    ctx.fillRect(-h, -h, 2 * h, 2 * h);
  }
  return ctx.getImageData(0, 0, S, S);
}

export interface AnomalyFeatureProps extends Record<string, unknown> {
  id: string;
  cls: SiteClass;
  /** Sprite-Variante: Klasse, oder `dev`, wenn ein Eintrag des Fensters abweicht. */
  variant: AnomalyVariant;
  /** `'site'` / `'site-deviating'` / `''` — Zustand im Fenster. */
  live: 'site' | 'site-deviating' | '';
  name: string;
  /** Eintrag des Fensters, falls vorhanden — die Auswahl springt auf ihn. */
  recordId: string;
}

/** Eine Punkt-Feature je Standort; der Zustand im Fenster kommt aus der Registry. */
export function anomaliesToGeoJSON(idx: ThermalSitesIndex | null, records: readonly FireRecord[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (!idx) return { type: 'FeatureCollection', features };
  const live = new Map<string, FireRecord>();
  for (const r of records) {
    if (!r.anomaly) continue;
    const cur = live.get(r.anomaly.siteId);
    if (!cur || (r.anomaly.kind === 'site-deviating' && cur.anomaly?.kind !== 'site-deviating') || (r.hotspots ?? 0) > (cur.hotspots ?? 0)) live.set(r.anomaly.siteId, r);
  }
  for (const s of idx.sites) {
    const rec = live.get(s.id) ?? null;
    const props: AnomalyFeatureProps = {
      id: s.id, cls: s.cls,
      variant: rec?.anomaly?.kind === 'site-deviating' ? 'dev' : s.cls,
      live: rec?.anomaly?.kind ?? '',
      name: s.facility?.name ?? s.place ?? s.id,
      recordId: rec?.id ?? '',
    };
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: props });
  }
  return { type: 'FeatureCollection', features };
}

export interface AnomalyLayerCheck { name: string; ok: boolean; detail?: string }

export function verifyAnomalyLayer(): { checks: AnomalyLayerCheck[]; passed: number; total: number } {
  const checks: AnomalyLayerCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  add('vier Sprite-Kennungen mit gemeinsamem Präfix', ANOMALY_IMAGE_IDS.length === 4 && ANOMALY_IMAGE_IDS.every((i) => i.startsWith(ANOMALY_IMAGE_ID)));
  add('ohne DOM liefern die Sprites null (Layer wird dann nicht angelegt)', typeof document === 'undefined' ? makeSiteDiamondImage('A') === null : true);
  add('Attribution nennt FIRMS, EEA, MaStR, BFE', /FIRMS/.test(ANOMALY_ATTRIBUTION) && /EEA/.test(ANOMALY_ATTRIBUTION) && /MaStR/.test(ANOMALY_ATTRIBUTION) && /BFE/.test(ANOMALY_ATTRIBUTION));
  add('ohne Liste: leere FeatureCollection', anomaliesToGeoJSON(null, []).features.length === 0);
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
