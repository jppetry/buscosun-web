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
export type FireReadoutTab = 'layers' | 'fires' | 'anomalies';

export const FIRE_ROUTE_VIEWS: readonly FireRouteView[] = ['gefahrenindex', 'aktive-braende', 'trockenheit'];

export function isFireRouteView(s: string | undefined | null): s is FireRouteView {
  return !!s && (FIRE_ROUTE_VIEWS as readonly string[]).includes(s);
}

/** Preset der Sub-Route: welche Layer an sein sollen und welcher Reiter offen ist. */
export function applyFireView(view: FireRouteView, active: ReadonlySet<FireLayerId>): { layers: FireLayerId[]; readoutTab: FireReadoutTab } {
  const next = new Set<FireLayerId>(active);
  if (view === 'aktive-braende') {
    next.add('fireHotspots'); next.add('fireFootprints');
    return { layers: [...next], readoutTab: 'fires' };
  }
  if (view === 'trockenheit') {
    next.add('fireSoilDryness');
    return { layers: [...next], readoutTab: 'layers' };
  }
  next.add('fireDanger');
  return { layers: [...next], readoutTab: 'layers' };
}

/** Zustand → passender Pfad-Slug (deterministisch; Reiter schlägt Layer). */
export function fireViewFromState(active: ReadonlySet<FireLayerId>, readoutTab: FireReadoutTab): FireRouteView {
  if (readoutTab === 'fires' || readoutTab === 'anomalies') return 'aktive-braende';
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
  add('Reiter Brände/Anomalien ⇒ aktive-braende', fireViewFromState(base, 'fires') === 'aktive-braende' && fireViewFromState(base, 'anomalies') === 'aktive-braende');
  add('nur Trockenheit ⇒ trockenheit', fireViewFromState(new Set<FireLayerId>(['fireSoilDryness']), 'layers') === 'trockenheit');
  add('Default ⇒ gefahrenindex', fireViewFromState(base, 'layers') === 'gefahrenindex');
  add('Preset ist idempotent', (() => { const r = applyFireView('aktive-braende', base); return applyFireView('aktive-braende', new Set(r.layers)).layers.length === r.layers.length; })());
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
