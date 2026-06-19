/**
 * GFS-Punkt-Adapter — Langfrist-„Schwanz" (~10 → 14 Tage) für den Punktforecast,
 * ganz ohne Open-Meteo.
 *
 * MOSMIX endet bei ~10 Tagen, AROME bei 60 h. NOAA GFS (Public Domain, AWS-S3
 * über den `/_gfs`-Proxy) liefert einen deterministischen Lauf bis +384 h (16 d).
 * Wir nutzen die im 3D-Globus bereits vorhandene GRIB-Infrastruktur
 * (`resolveLatestGfsRun` · `fetchGfsGrid` · DRT-3-Decoder · `sampleGfs`) und
 * sampeln den Punkt aus dem 1°-Globalgitter.
 *
 * Bewusst beschränkt & ehrlich:
 *  - Nur der Schwanz jenseits ~9 Tagen (`fromH`); davor sind MOSMIX/AROME besser.
 *  - 6-stündige Stützstellen, stündlich interpoliert — Tag 10–14 ist Tendenz,
 *    keine Prognose (der per-Variable-Confidence-Decay wertet das ehrlich ab).
 *  - 1° grob, GFS-Temperatur ohne Höhenkorrektur (Gitterzelle mittelt Topografie);
 *    die Lapse-/Terrain-Korrektur im Blend greift nur über `sourceElevation`, das
 *    GFS hier nicht setzt — auf der synoptischen Tendenz-Skala vernachlässigbar.
 *  - Niederschlag: GFS-APCP ist akkumuliert; an den 6-h-Stufen ein sauberer
 *    6-h-Eimer → mm/h = Eimer ÷ 6.
 *  - Familie `global` (kein neues Gewicht nötig).
 */

import { fetchGfsGrid, sampleGfs, runValidMs, type GfsRun } from '../globe/gfs';
import type { PointHourSamples, PointSourceSample } from './types';

const MATCH = {
  t: ':TMP:2 m above ground:',
  u: ':UGRD:10 m above ground:',
  v: ':VGRD:10 m above ground:',
  apcp: ':APCP:surface:',
  tcc: ':TCDC:entire atmosphere',
};
const STEP_H = 6;            // 6-stündige Stützstellen im Schwanz
const GFS_MAX_FHOUR = 384;   // GFS-Horizont (16 Tage)

interface GfsNode { ms: number; t: number | null; u: number | null; v: number | null; pr: number | null; cl: number | null; }

/** Lineare Interpolation eines Knoten-Feldes auf den Zeitpunkt `ms`. */
function lerpAt(nodes: GfsNode[], ms: number, key: 't' | 'u' | 'v' | 'pr' | 'cl'): number | null {
  if (ms <= nodes[0].ms) return nodes[0][key];
  const last = nodes[nodes.length - 1];
  if (ms >= last.ms) return last[key];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    if (ms >= a.ms && ms <= b.ms) {
      const va = a[key], vb = b[key];
      if (va == null || vb == null) return va ?? vb;
      const f = (ms - a.ms) / (b.ms - a.ms || 1);
      return va + (vb - va) * f;
    }
  }
  return null;
}

/**
 * Liefert den GFS-Schwanz als index-ausgerichtete PointHourSamples (Index = unsere
 * Vorhersagestunde h). Indizes < `fromH` bleiben leer (sparse). `t0Ms` = Zeit der
 * Vorhersagestunde 0. Fehler → leeres Array (sauberer Fallback, nie blockierend).
 */
export async function fetchGfsPointTail(
  lat: number, lng: number, fromH: number, toH: number, t0Ms: number, signal?: AbortSignal,
): Promise<PointHourSamples[]> {
  // Einen VOLLSTÄNDIG publizierten GFS-Lauf wählen: der jüngste Lauf hat seine
  // langen Schritte (f≳300) oft noch nicht hochgeladen (GFS publiziert f000→f384
  // über ~5 h). Daher Läufe mit zunehmendem Vorlauf (8/14/20/26 h) probieren und
  // den ersten nehmen, dessen LETZTER benötigter Schritt schon da ist.
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const runOfLag = (lagH: number): GfsRun => {
    const d = new Date(t0Ms - lagH * 3_600_000);
    const ch = Math.floor(d.getUTCHours() / 6) * 6;
    return { date: `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`, hour: pad2(ch) };
  };
  let run: GfsRun | null = null;
  let firstStep = 0, lastStep = 0;
  for (const lag of [8, 14, 20, 26]) {
    const cand = runOfLag(lag);
    const runBaseMs = Date.UTC(+cand.date.slice(0, 4), +cand.date.slice(4, 6) - 1, +cand.date.slice(6, 8), +cand.hour);
    const off = Math.round((t0Ms - runBaseMs) / 3_600_000);
    const fs = Math.max(0, Math.floor((off + fromH) / STEP_H) * STEP_H);
    const fe = Math.ceil((off + toH) / STEP_H) * STEP_H;
    if (fe > GFS_MAX_FHOUR || fe <= fs) continue;
    const probe = await fetchGfsGrid(cand, fe, MATCH.t, signal).catch(() => null);  // letzter Schritt da?
    if (probe) { run = cand; firstStep = fs; lastStep = fe; break; }
  }
  if (!run) return [];

  const nodes: GfsNode[] = [];
  for (let f = firstStep; f <= lastStep && f <= GFS_MAX_FHOUR; f += STEP_H) {
    const [gt, gu, gv, gp, gc] = await Promise.all([
      fetchGfsGrid(run, f, MATCH.t, signal).catch(() => null),
      fetchGfsGrid(run, f, MATCH.u, signal).catch(() => null),
      fetchGfsGrid(run, f, MATCH.v, signal).catch(() => null),
      fetchGfsGrid(run, f, MATCH.apcp, signal).catch(() => null),
      fetchGfsGrid(run, f, MATCH.tcc, signal).catch(() => null),
    ]);
    const s = (g: typeof gt) => (g ? sampleGfs(g, lng, lat) : NaN);
    const tK = s(gt), u = s(gu), v = s(gv), apcp = s(gp), tcc = s(gc);
    nodes.push({
      ms: runValidMs(run, f),
      t: Number.isFinite(tK) ? tK - 273.15 : null,
      u: Number.isFinite(u) ? u : null,
      v: Number.isFinite(v) ? v : null,
      pr: Number.isFinite(apcp) ? Math.max(0, apcp) / STEP_H : null,
      cl: Number.isFinite(tcc) ? Math.max(0, Math.min(100, tcc)) : null,
    });
  }
  if (nodes.filter((n) => n.t != null).length < 2) return [];

  const out: PointHourSamples[] = [];
  out.length = toH + 1;       // sparse: Indizes < fromH bleiben undefined
  const lastMs = nodes[nodes.length - 1].ms;
  for (let h = fromH; h <= toH; h++) {
    const ms = t0Ms + h * 3_600_000;
    if (ms > lastMs) break;
    const t = lerpAt(nodes, ms, 't');
    const cl = lerpAt(nodes, ms, 'cl');
    const sample: PointSourceSample = {
      source: 'gfs', family: 'global',
      temperature: t, sourceElevation: null,
      u: lerpAt(nodes, ms, 'u'), v: lerpAt(nodes, ms, 'v'),
      gust: null, relativeHumidity: null, snowLine: null,
      cloudLow: cl != null ? cl * 0.55 : null,
      cloudMid: cl != null ? cl * 0.30 : null,
      cloudHigh: cl != null ? cl * 0.15 : null,
      precipitation: lerpAt(nodes, ms, 'pr'),
      uvIndex: null, distanceMeters: 0,
    };
    out[h] = { timestamp: new Date(ms), samples: [sample] };
  }
  return out;
}
