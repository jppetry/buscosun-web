/**
 * E-DB-20 (audit/dashboard.md §11): `MapView` (+ MapLibre and the map layers) is its own lazy chunk, loaded through
 * this ONE promise.
 *
 *  - Map views and `/warnungen`: the route loader (`router.tsx`) awaits it in parallel with the route chunk, so the map
 *    arrives exactly as before (same HydrateFallback, no blank frame).
 *  - Dashboard (`?ansicht=dashboard`): nothing of it on the critical path; `WetterkarteRoute` fetches it in the
 *    background once the dashboard has its forecast, and mounts the map only on the first switch.
 *
 * Lives in the start chunk (the router imports it) — no imports besides the dynamic one.
 */
type MapViewModule = typeof import('../MapView');

let mod: MapViewModule | null = null;
let pending: Promise<MapViewModule> | null = null;

export function loadMapView(): Promise<MapViewModule> {
  pending ??= import('../MapView').then(
    (m) => (mod = m),
    (err: unknown) => { pending = null; throw err; }, // a failed chunk load may be retried by the next caller
  );
  return pending;
}

/** The module once loaded, else `null` — lets the route render `MapView` without a Suspense round trip. */
export const loadedMapView = (): MapViewModule | null => mod;
