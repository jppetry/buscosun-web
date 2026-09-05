/**
 * Brandradar · Sub-Routen (Phase RT1, pur).
 *
 * `/waldbrand/<view>` ist ein PRESET, kein eigener Zustand: der vollständige
 * Zustand bleibt im Fragment (`#wb=…`, `fireState.ts`). Die Sub-Route sagt, was
 * die Seite beim Öffnen ohne Hash vorbelegt — und umgekehrt, welcher Pfad zum
 * aktuellen Zustand passt (Reiter + Layer), damit die URL mitläuft.
 */

import type { FireLayerId } from './fireModel';

export type FireRouteView = 'gefahrenindex' | 'aktive-braende' | 'trockenheit';
// BD3 (2026-09-03): der Reiter „Layer" ist entfallen — die Steckbriefe stehen im Dock.
export type FireReadoutTab = 'fires' | 'anomalies';

export const FIRE_ROUTE_VIEWS: readonly FireRouteView[] = ['gefahrenindex', 'aktive-braende', 'trockenheit'];

export function isFireRouteView(s: string | undefined | null): s is FireRouteView {
  return !!s && (FIRE_ROUTE_VIEWS as readonly string[]).includes(s);
}

/** Preset der Sub-Route: welche Layer an sein sollen und welcher Reiter offen ist. */
export function applyFireView(view: FireRouteView, active: ReadonlySet<FireLayerId>): { layers: FireLayerId[]; readoutTab: FireReadoutTab } {
  const next = new Set<FireLayerId>(active);
  if (view === 'aktive-braende') {
    // Detektionen und Brandflächen sind seit 2026-09-05 IMMER an (FIRE_ALWAYS_ON),
    // taugen also nicht mehr als Kennzeichen dieser Sub-Route. Was sie ausmacht,
    // ist der Blick auf die Brände OHNE die Gefahrenfläche darunter — sonst wäre
    // sie von `/gefahrenindex` nicht zu unterscheiden und die URL spränge um.
    next.add('fireHotspots'); next.add('fireFootprints');
    next.delete('fireDanger');
    return { layers: [...next], readoutTab: 'fires' };
  }
  if (view === 'trockenheit') {
    // Gleiche Überlegung, und deckungsgleich mit dem, was `fireViewFromState`
    // schon immer prüfte: Trockenheit OHNE Gefahrenindex.
    next.add('fireSoilDryness');
    next.delete('fireDanger');
    return { layers: [...next], readoutTab: 'fires' };
  }
  next.add('fireDanger');
  return { layers: [...next], readoutTab: 'fires' };
}

/**
 * Zustand → passender Pfad-Slug (deterministisch).
 *
 * BD3: seit der Reiter „Layer" entfallen ist, zeigt das Readout IMMER eine Liste — der Reiter
 * kann den Slug also nicht mehr allein bestimmen (sonst hieße jeder Zustand „aktive-braende").
 * Entschieden wird deshalb an den LAYERN; nur der Anomalien-Reiter bleibt eine eigene Aussage.
 *
 * 2026-09-05: die immer aktiven Layer (`FIRE_ALWAYS_ON`) stehen in JEDEM Zustand und dürfen
 * deshalb nichts entscheiden — sonst hieße wieder jeder Zustand „aktive-braende". Es
 * entscheiden nur noch die schaltbaren Flächen: Gefahrenindex, sonst Trockenheit, sonst die
 * Brände als Rückfall.
 */
export function fireViewFromState(active: ReadonlySet<FireLayerId>, readoutTab: FireReadoutTab): FireRouteView {
  if (readoutTab === 'anomalies') return 'aktive-braende';
  if (active.has('fireDanger')) return 'gefahrenindex';
  if (active.has('fireSoilDryness')) return 'trockenheit';
  return 'aktive-braende';
}

export function verifyFireRouteView(): { checks: Array<{ name: string; ok: boolean }>; passed: number; failed: number } {
  const checks: Array<{ name: string; ok: boolean }> = [];
  const add = (name: string, ok: boolean) => checks.push({ name, ok });
  const base = new Set<FireLayerId>(['fireDanger', 'fireHotspots']);
  add('aktive-braende ⇒ Hotspots+Brandflächen, Reiter Brände', (() => { const r = applyFireView('aktive-braende', base); return r.layers.includes('fireFootprints') && r.readoutTab === 'fires'; })());
  add('aktive-braende blendet die Gefahrenfläche ab (sonst nicht unterscheidbar)',
    !applyFireView('aktive-braende', base).layers.includes('fireDanger'));
  add('trockenheit ⇒ Bodentrockenheit an', applyFireView('trockenheit', base).layers.includes('fireSoilDryness'));
  add('gefahrenindex ⇒ Gefahrenindex an', applyFireView('gefahrenindex', new Set()).layers.join() === 'fireDanger');
  add('Anomalien-Reiter ⇒ aktive-braende, unabhängig von den Layern',
    fireViewFromState(base, 'anomalies') === 'aktive-braende');
  add('immer aktive Layer entscheiden NICHT (Hotspots+Brandflächen allein ⇒ aktive-braende)',
    fireViewFromState(new Set<FireLayerId>(['fireHotspots', 'fireFootprints', 'fireAnomalies', 'fireBurnt']), 'fires') === 'aktive-braende');
  add('Gefahrenindex schlägt Trockenheit', fireViewFromState(base, 'fires') === 'gefahrenindex');
  add('nur Trockenheit ⇒ trockenheit', fireViewFromState(new Set<FireLayerId>(['fireSoilDryness']), 'fires') === 'trockenheit');
  add('nur Gefahrenindex ⇒ gefahrenindex', fireViewFromState(new Set<FireLayerId>(['fireDanger']), 'fires') === 'gefahrenindex');
  add('Preset ist idempotent', (() => { const r = applyFireView('aktive-braende', base); return applyFireView('aktive-braende', new Set(r.layers)).layers.length === r.layers.length; })());
  // Rundlauf: jede Sub-Route muss aus ihrem eigenen Preset wieder ihren Slug ergeben.
  for (const v of FIRE_ROUTE_VIEWS) {
    const r = applyFireView(v, new Set<FireLayerId>(['fireHotspots', 'fireFootprints', 'fireAnomalies', 'fireBurnt']));
    add(`Rundlauf ${v}`, fireViewFromState(new Set(r.layers), r.readoutTab) === v);
  }
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
