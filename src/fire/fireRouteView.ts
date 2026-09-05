/**
 * Brandradar · Sub-Routen (Phase RT1, pur).
 *
 * `/waldbrand/<view>` ist ein PRESET, kein eigener Zustand: der vollständige
 * Zustand bleibt im Fragment (`#wb=…`, `fireState.ts`). Die Sub-Route sagt, was
 * die Seite beim Öffnen ohne Hash vorbelegt — und umgekehrt, welcher Pfad zum
 * aktuellen Zustand passt (Reiter + Layer), damit die URL mitläuft.
 */

import type { FireLayerId } from './fireModel';

export type FireRouteView = 'gefahrenindex' | 'aktive-braende' | 'trockenheit' | 'historie' | 'thermalanomalien';
export type FireReadoutTab = 'layers' | 'fires' | 'anomalies';
/** Historie-Fenster (BH3) als Teil des Presets; null = Live-Fenster wie bisher. */
export type FireHistoryPreset = 'month' | 'season' | null;

export const FIRE_ROUTE_VIEWS: readonly FireRouteView[] = ['gefahrenindex', 'aktive-braende', 'trockenheit', 'historie', 'thermalanomalien'];

export function isFireRouteView(s: string | undefined | null): s is FireRouteView {
  return !!s && (FIRE_ROUTE_VIEWS as readonly string[]).includes(s);
}

/**
 * Preset der Sub-Route: welche Layer an sein sollen, welcher Reiter offen ist und ob das
 * Historie-Fenster (statt des Live-Fensters) gilt. `history` greift nur, wenn die Historie
 * überhaupt aktiv ist (Kill-Switch `?bh=0` prüft die Seite, nicht diese reine Funktion).
 */
export function applyFireView(view: FireRouteView, active: ReadonlySet<FireLayerId>): { layers: FireLayerId[]; readoutTab: FireReadoutTab; history: FireHistoryPreset } {
  const next = new Set<FireLayerId>(active);
  if (view === 'aktive-braende') {
    next.add('fireHotspots'); next.add('fireFootprints');
    return { layers: [...next], readoutTab: 'fires', history: null };
  }
  if (view === 'trockenheit') {
    next.add('fireSoilDryness');
    return { layers: [...next], readoutTab: 'layers', history: null };
  }
  // SEO/GEO 2026 (E7): die Saison-Historie und die Thermalanomalien hatten nur eine Hash-Form
  // (`#wb=bh=season`, `#wb=ta=1`) und damit keinen kanonischen Pfad.
  if (view === 'historie') {
    next.add('fireHotspots'); next.add('fireFootprints');
    return { layers: [...next], readoutTab: 'fires', history: 'season' };
  }
  if (view === 'thermalanomalien') {
    next.add('fireAnomalies');
    return { layers: [...next], readoutTab: 'anomalies', history: null };
  }
  next.add('fireDanger');
  return { layers: [...next], readoutTab: 'layers', history: null };
}

/** Zustand → passender Pfad-Slug (deterministisch; Historie schlägt Reiter, Reiter schlägt Layer). */
export function fireViewFromState(active: ReadonlySet<FireLayerId>, readoutTab: FireReadoutTab, history: FireHistoryPreset = null): FireRouteView {
  if (history) return 'historie';
  if (readoutTab === 'anomalies') return 'thermalanomalien';
  if (readoutTab === 'fires') return 'aktive-braende';
  if (active.has('fireSoilDryness') && !active.has('fireDanger')) return 'trockenheit';
  return 'gefahrenindex';
}

export function verifyFireRouteView(): { checks: Array<{ name: string; ok: boolean }>; passed: number; failed: number } {
  const checks: Array<{ name: string; ok: boolean }> = [];
  const add = (name: string, ok: boolean) => checks.push({ name, ok });
  const base = new Set<FireLayerId>(['fireDanger', 'fireHotspots']);
  add('aktive-braende ⇒ Hotspots+Brandflächen, Reiter Brände', (() => { const r = applyFireView('aktive-braende', base); return r.layers.includes('fireFootprints') && r.readoutTab === 'fires'; })());
  add('trockenheit ⇒ Bodentrockenheit an', applyFireView('trockenheit', base).layers.includes('fireSoilDryness'));
  add('gefahrenindex ⇒ Gefahrenindex an, Reiter Layer', applyFireView('gefahrenindex', new Set()).layers.join() === 'fireDanger');
  add('Reiter Brände ⇒ aktive-braende, Reiter Anomalien ⇒ thermalanomalien', fireViewFromState(base, 'fires') === 'aktive-braende' && fireViewFromState(base, 'anomalies') === 'thermalanomalien');
  add('nur Trockenheit ⇒ trockenheit', fireViewFromState(new Set<FireLayerId>(['fireSoilDryness']), 'layers') === 'trockenheit');
  add('Default ⇒ gefahrenindex', fireViewFromState(base, 'layers') === 'gefahrenindex');
  // E7: die beiden neuen Sichten — Preset und Rückweg.
  add('historie ⇒ Reiter Brände + Saison-Fenster', (() => { const r = applyFireView('historie', base); return r.readoutTab === 'fires' && r.history === 'season' && r.layers.includes('fireFootprints'); })());
  add('thermalanomalien ⇒ Standort-Layer + Reiter Anomalien', (() => { const r = applyFireView('thermalanomalien', base); return r.readoutTab === 'anomalies' && r.layers.includes('fireAnomalies') && r.history === null; })());
  add('Historie-Fenster schlägt den Reiter', fireViewFromState(base, 'fires', 'season') === 'historie' && fireViewFromState(base, 'anomalies', 'month') === 'historie');
  add('jede Sicht ist ihr eigener Rückweg', FIRE_ROUTE_VIEWS.every((v) => { const r = applyFireView(v, v === 'trockenheit' ? new Set<FireLayerId>() : base); return fireViewFromState(new Set(r.layers), r.readoutTab, r.history) === v; }));
  add('Preset ist idempotent', (() => { const r = applyFireView('aktive-braende', base); return applyFireView('aktive-braende', new Set(r.layers)).layers.length === r.layers.length; })());
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
