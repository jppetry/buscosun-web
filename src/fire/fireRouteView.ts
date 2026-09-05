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
// BD3 (2026-09-03): der Reiter „Layer" ist entfallen — die Steckbriefe stehen im Dock.
export type FireReadoutTab = 'fires' | 'anomalies';
/** Historie-Fenster (BH3) als Teil des Presets; null = Live-Fenster wie bisher (SEO/GEO E7). */
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
    // Detektionen und Brandflächen sind seit 2026-09-05 IMMER an (FIRE_ALWAYS_ON),
    // taugen also nicht mehr als Kennzeichen dieser Sub-Route. Was sie ausmacht,
    // ist der Blick auf die Brände OHNE die Gefahrenfläche darunter — sonst wäre
    // sie von `/gefahrenindex` nicht zu unterscheiden und die URL spränge um.
    next.add('fireHotspots'); next.add('fireFootprints');
    next.delete('fireDanger');
    return { layers: [...next], readoutTab: 'fires', history: null };
  }
  if (view === 'trockenheit') {
    // Gleiche Überlegung, und deckungsgleich mit dem, was `fireViewFromState`
    // schon immer prüfte: Trockenheit OHNE Gefahrenindex.
    next.add('fireSoilDryness');
    next.delete('fireDanger');
    return { layers: [...next], readoutTab: 'fires', history: null };
  }
  // SEO/GEO 2026 (E7): Saison-Historie und Thermalanomalien hatten nur eine Hash-Form
  // (`#wb=bh=season`, `#wb=ta=1`) und damit keinen kanonischen Pfad.
  if (view === 'historie') {
    // Wie `aktive-braende` (Blick auf die Brände), aber im Historie-Fenster statt live.
    next.add('fireHotspots'); next.add('fireFootprints');
    next.delete('fireDanger');
    return { layers: [...next], readoutTab: 'fires', history: 'season' };
  }
  if (view === 'thermalanomalien') {
    // `fireAnomalies` ist immer an (FIRE_ALWAYS_ON) und kann die Sicht deshalb nicht
    // kennzeichnen — das tut allein der Reiter.
    next.add('fireAnomalies');
    return { layers: [...next], readoutTab: 'anomalies', history: null };
  }
  next.add('fireDanger');
  return { layers: [...next], readoutTab: 'fires', history: null };
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
 *
 * E7: Das Historie-Fenster steht über allem (es ist der einzige Zustand, den kein Layer trägt),
 * und der Anomalien-Reiter zeigt jetzt auf seinen eigenen Pfad statt auf `aktive-braende`.
 */
export function fireViewFromState(active: ReadonlySet<FireLayerId>, readoutTab: FireReadoutTab, history: FireHistoryPreset = null): FireRouteView {
  if (history) return 'historie';
  if (readoutTab === 'anomalies') return 'thermalanomalien';
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
  add('immer aktive Layer entscheiden NICHT (Hotspots+Brandflächen allein ⇒ aktive-braende)',
    fireViewFromState(new Set<FireLayerId>(['fireHotspots', 'fireFootprints', 'fireAnomalies', 'fireBurnt']), 'fires') === 'aktive-braende');
  add('Gefahrenindex schlägt Trockenheit', fireViewFromState(base, 'fires') === 'gefahrenindex');
  add('nur Trockenheit ⇒ trockenheit', fireViewFromState(new Set<FireLayerId>(['fireSoilDryness']), 'fires') === 'trockenheit');
  add('nur Gefahrenindex ⇒ gefahrenindex', fireViewFromState(new Set<FireLayerId>(['fireDanger']), 'fires') === 'gefahrenindex');
  // E7: die beiden neuen Sichten — Preset und Rückweg.
  add('historie ⇒ Reiter Brände + Saison-Fenster', (() => { const r = applyFireView('historie', base); return r.readoutTab === 'fires' && r.history === 'season' && r.layers.includes('fireFootprints'); })());
  add('thermalanomalien ⇒ Reiter Anomalien, kein Historie-Fenster', (() => { const r = applyFireView('thermalanomalien', base); return r.readoutTab === 'anomalies' && r.history === null; })());
  add('Anomalien-Reiter ⇒ thermalanomalien, unabhängig von den Layern',
    fireViewFromState(base, 'anomalies') === 'thermalanomalien');
  add('Historie-Fenster schlägt Reiter und Layer', fireViewFromState(base, 'fires', 'season') === 'historie' && fireViewFromState(base, 'anomalies', 'month') === 'historie');
  add('Preset ist idempotent', (() => { const r = applyFireView('aktive-braende', base); return applyFireView('aktive-braende', new Set(r.layers)).layers.length === r.layers.length; })());
  // Rundlauf: jede Sub-Route muss aus ihrem eigenen Preset wieder ihren Slug ergeben.
  for (const v of FIRE_ROUTE_VIEWS) {
    const r = applyFireView(v, new Set<FireLayerId>(['fireHotspots', 'fireFootprints', 'fireAnomalies', 'fireBurnt']));
    add(`Rundlauf ${v}`, fireViewFromState(new Set(r.layers), r.readoutTab, r.history) === v);
  }
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
