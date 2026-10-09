/**
 * Phase ZO (`audit/zell-orte.md`): Ortsliste laden, Zelle wählen, Liste und Satz zum Ort rechnen — für Readout,
 * Schnellblick und die Haltestellen der Karte. Rechnen in `radar/cellPlaces.ts` (rein); hier nur Zustand und Laden.
 *
 * Die Ortsliste (`cellPlacesDach.json`, 3 217 Orte ab 5 000 Ew., ≈ 47 KB gz) ist ein gehashtes Asset des Builds und wird
 * erst geholt, wenn der Lauf Zellen trägt (E-ZO-5) — an zellfreien Tagen kein Byte.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Konrad3dRun } from '../radar/konrad3d';
import type { Country } from '../types';
import {
  parseCellPlaces, prepareCell, cellPlaceList, cellPlaceVerdict, cellChoiceOrder,
  type CellPlace, type CellPlaceList, type CellPlaceVerdict, type PreparedCell,
} from '../radar/cellPlaces';

let placesP: Promise<CellPlace[]> | null = null;
function loadCellPlaces(): Promise<CellPlace[]> {
  placesP ??= import('../radar/cellPlacesDach.json?url')
    .then((m) => fetch(m.default))
    .then((r) => { if (!r.ok) throw new Error(`Ortsliste: HTTP ${r.status}`); return r.json() as Promise<unknown>; })
    .then(parseCellPlaces)
    .catch((e: unknown) => { placesP = null; throw e; });
  return placesP;
}

export interface CellPlacesState {
  /** `off` = Schalter aus oder Zell-Layer aus (kein Lauf). */
  status: 'off' | 'loading' | 'ready' | 'error';
  run: Konrad3dRun | null;
  verdict: CellPlaceVerdict | null;
  /** Zellen in der Reihenfolge der Wahl (Zelle des Orts zuerst). */
  order: number[];
  selectedId: number | null;
  /** Die Zelle wurde ausdrücklich gewählt (Chip oder Klick auf der Karte) — sonst die voreingestellte. */
  picked: boolean;
  list: CellPlaceList | null;
  nowMs: number;
  reason: string | null;
  select: (id: number) => void;
}

export function useCellPlaces(
  run: Konrad3dRun | null,
  loc: { name: string; lat: number; lon: number; country: Country },
  enabled: boolean,
): CellPlacesState {
  const [places, setPlaces] = useState<CellPlace[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  // Die Uhr läuft weiter (vergangene Fenster fallen weg, „jetzt–…" wandert) — einmal je Minute reicht.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const active = enabled && run != null;
  useEffect(() => {
    if (!active) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [active, run]);
  const hasCells = active && (run?.cells.length ?? 0) > 0;
  useEffect(() => {
    if (!hasCells || places) return;
    let alive = true;
    loadCellPlaces().then((p) => { if (alive) { setPlaces(p); setErr(null); } })
      .catch((e: unknown) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [hasCells, places]);
  useEffect(() => { setPick(null); }, [loc.lat, loc.lon]);

  const prepared = useMemo(() => {
    const m = new Map<number, PreparedCell>();
    if (active && run) for (const c of run.cells) m.set(c.id, prepareCell(c));
    return m;
  }, [active, run]);
  const verdict = useMemo(
    () => (active && run ? cellPlaceVerdict(run, loc.lat, loc.lon, nowMs, prepared) : null),
    [active, run, loc.lat, loc.lon, nowMs, prepared],
  );
  const order = useMemo(() => (active && run ? cellChoiceOrder(run, verdict) : []), [active, run, verdict]);
  const selectedId = pick != null && order.includes(pick) ? pick : (order[0] ?? null);
  const list = useMemo(() => {
    const pc = selectedId != null ? prepared.get(selectedId) : undefined;
    if (!pc || !places) return null;
    const chosen: CellPlace = { name: loc.name, lat: loc.lat, lon: loc.lon, cc: loc.country, pop: null };
    return cellPlaceList(pc, places, { nowMs, chosen });
  }, [selectedId, prepared, places, loc.name, loc.lat, loc.lon, loc.country, nowMs]);

  if (!active || !run) {
    return { status: 'off', run: null, verdict: null, order: [], selectedId: null, picked: false, list: null, nowMs, reason: null, select: setPick };
  }
  const status = run.cells.length === 0 ? 'ready' : places ? 'ready' : err ? 'error' : 'loading';
  return { status, run, verdict, order, selectedId, picked: pick != null && order.includes(pick), list, nowMs, reason: err, select: setPick };
}
