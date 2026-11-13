/**
 * Dossier level "Satellit" — the glacier as a zoomable Sentinel-2 true-colour picture in 10 m (Jan, 2026-10-24).
 * The data layer and the viewer are the Brandradar's (`fire/detail/fireSatImagery.ts`, `fire/FireCogViewer.tsx`; same STAC search of the
 * last 30 days, same kill switches `?sat=0` / `?sat10=0`), the day strip is the one of the coast dossier (`sea/SeaSatImagery.tsx`) —
 * but only Sentinel-2 days are offered, because only they carry 10 m (Landsat measures 30 m). The viewer loads its tiles on demand
 * and counts the bytes in its status line. No Sentinel-2 day in the window ⇒ a named empty state with the Copernicus link.
 * The picture is a scene, not a measurement of the glacier: the cloud share is per scene, not at the glacier.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { cloudLabel, copernicusBrowserUrl, fetchSatImagery, prefetchS2Day, S2_COG_ORIGIN, SAT_ATTRIBUTION, sat10Enabled, type SatImagery, type SatScene } from '../fire/detail/fireSatImagery';

/** Glacier view: true colour only (SWIR and the burnt-area comparison are fire tools). */
const GL_COG_MODES = ['tci'] as const;
const FireCogViewer = lazy(() => import('../fire/FireCogViewer'));

/** Opens the connection (DNS, TCP, TLS) to a host that is asked a moment later — a fresh hint each time, an idle socket closes after seconds. */
function preconnect(origin: string): void {
  if (typeof document === 'undefined') return;
  document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)?.remove();
  const l = document.createElement('link');
  l.rel = 'preconnect'; l.href = origin; l.crossOrigin = 'anonymous';
  document.head.appendChild(l);
}

const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const fmtDayShort = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
/** The fire module's note about the missing fire window does not apply here. */
const isFireNote = (n: string) => n.startsWith('Brandzeitraum');

/**
 * Start picture (Jan 2026-11-13): the scene in which the glacier reads best — few clouds AND little snow in the scene (a scene under
 * fresh snow is white all over, the glacier vanishes in it), complete rather than cut, and on a near tie the newer one.
 * Smaller is better. The weights are set, not measured; both shares are per granule, not at the glacier.
 */
const SNOW_WEIGHT = 0.6;
const NODATA_WEIGHT_GL = 0.5;
const AGE_WEIGHT_PER_DAY = 0.3;
const sceneScore = (s: SatScene, newestMs: number): number =>
  (s.cloudPct ?? 101) + SNOW_WEIGHT * (s.snowPct ?? 0) + NODATA_WEIGHT_GL * (s.nodataPct ?? 0) + AGE_WEIGHT_PER_DAY * ((newestMs - s.ms) / 86_400_000);
const pickS2Scene = (s2: readonly SatScene[]): SatScene | null => {
  if (s2.length === 0) return null;
  const newestMs = Math.max(...s2.map((s) => s.ms));
  return s2.reduce((a, b) => (sceneScore(b, newestMs) < sceneScore(a, newestMs) ? b : a));
};
const snowLabel = (s: SatScene): string | null => (s.snowPct != null ? `~${Math.round(s.snowPct)} % Schnee in der Szene` : null);

/**
 * Jan 2026-11-10 (as in the Brandradar dossier): warm start of the 10 m picture while the dossier level "Heute" is open — scene
 * search, the viewer chunk, then catalogue entry, header and the tiles of the start view (`warmCogView`). The component takes the
 * same promises from the caches, so opening "Satellit" finds the picture loaded or in flight. Never throws.
 */
export async function warmGlacierSat(lat: number, lon: number, nowMs: number): Promise<void> {
  if (!sat10Enabled()) return;
  try {
    const [data, viewer] = await Promise.all([fetchSatImagery(lat, lon, null, null, null, nowMs), import('../fire/FireCogViewer')]);
    const scene = pickS2Scene(data.scenes.filter((s) => s.sat === 's2'));
    if (!scene) return;
    preconnect(S2_COG_ORIGIN);
    // Size of `.gl-sat-frame`: full card width, 16:10 up to 560 px high; 4:5 below 768 px.
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const w = Math.max(280, Math.min(900, vw - 32));
    const h = vw < 768 ? Math.round(w * 1.25) : Math.min(560, Math.round(w / 1.6));
    await viewer.warmCogView(lat, lon, scene.dayIso, null, null, w, h);
  } catch { /* warm start is a bonus */ }
}

export default function GlacierSatImagery({ lat, lon, name, nowMs }: { lat: number; lon: number; name: string; nowMs: number }) {
  const [im, setIm] = useState<{ kind: 'loading' } | { kind: 'ok'; data: SatImagery }>({ kind: 'loading' });
  const [selDay, setSelDay] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIm({ kind: 'loading' }); setSelDay(null);
    void fetchSatImagery(lat, lon, null, null, null, nowMs).then((data) => { if (alive) setIm({ kind: 'ok', data }); });
    // Cold start: the viewer chunk loads while the scene list is searched, not after it.
    if (sat10Enabled()) void import('../fire/FireCogViewer').catch(() => undefined);
    return () => { alive = false; };
    // nowMs deliberately not a dependency — a tick does not reload (same as the Brandradar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  const data = im.kind === 'ok' ? im.data : null;
  const s2 = useMemo<SatScene[]>(() => (data ? data.scenes.filter((s) => s.sat === 's2') : []), [data]);
  // Start picture: few clouds and little snow in the scene (`pickS2Scene`).
  const scene: SatScene | null = useMemo(() => {
    if (selDay) return s2.find((s) => s.dayIso === selDay) ?? null;
    return pickS2Scene(s2);
  }, [s2, selDay]);

  // The day is known: its image search and the connection to the image bucket start now, side by side with the viewer.
  const sceneDay = scene?.dayIso ?? null;
  useEffect(() => {
    if (!sceneDay || !sat10Enabled()) return;
    prefetchS2Day(lat, lon, sceneDay);
    preconnect(S2_COG_ORIGIN);
  }, [lat, lon, sceneDay]);

  if (im.kind === 'loading') return <p className="gl-fine" role="status">Aufnahmetage für {name} werden gesucht …</p>;
  const notes = (data?.notes ?? []).filter((n) => !isFireNote(n));
  const open = <a href={copernicusBrowserUrl(lat, lon, scene?.dayIso ?? new Date(nowMs).toISOString().slice(0, 10))} target="_blank" rel="noopener noreferrer">In 10 m im Copernicus Browser öffnen ↗</a>;
  if (!data || !scene || !sat10Enabled()) {
    return (
      <>
        <p className="gl-nodata"><strong>Kein 10-m-Bild.</strong> {!sat10Enabled() ? 'Die 10-m-Ansicht ist abgeschaltet.' : 'In den letzten 30 Tagen liegt keine Sentinel-2-Aufnahme vor.'} {open}</p>
        {notes.length > 0 && <ul className="gl-sat-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      </>
    );
  }

  return (
    <>
      <p className="gl-sat-label">
        <strong>{fmtDay(scene.dayIso)}</strong>
        <span>Sentinel-2, 10 m</span>
        <span>{cloudLabel(scene.cloudPct)}</span>
        {snowLabel(scene) && <span>{snowLabel(scene)}</span>}
      </p>
      <div className="gl-sat-frame">
        <Suspense fallback={<p className="br-sat-wait br-muted">10-m-Ansicht wird geladen …</p>}>
          <FireCogViewer key={scene.dayIso} lat={lat} lon={lon} dayIso={scene.dayIso} fireStartIso={null} modes={GL_COG_MODES} credit={`Copernicus Sentinel-2 · ${scene.dayIso.slice(0, 4)}`}
            fallbackUrl={copernicusBrowserUrl(lat, lon, scene.dayIso)} onClose={() => { /* the picture stays: nothing to close here */ }} />
        </Suspense>
      </div>
      <div className="gl-sat-days" role="group" aria-label="Aufnahmetag wählen">
        {s2.map((s) => (
          <button key={s.dayIso} type="button" className={`gl-sat-day${s.dayIso === scene.dayIso ? ' is-on' : ''}`} aria-pressed={s.dayIso === scene.dayIso}
            title={`${fmtDay(s.dayIso)} · Sentinel-2 · ${cloudLabel(s.cloudPct)}${snowLabel(s) ? ` · ${snowLabel(s)}` : ''}`} onClick={() => setSelDay(s.dayIso)}>
            <span>{fmtDayShort(s.dayIso)}</span>
            <span className="gl-sat-day-cloud">{s.cloudPct != null ? `${Math.round(s.cloudPct)} %` : '– %'}</span>
          </button>
        ))}
      </div>
      {notes.length > 0 && <ul className="gl-sat-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <p className="gl-fine">
        Sentinel-2-Szene der letzten 30 Tage in Echtfarbe, 10 m je Bildpunkt; zoombar, Kacheln laden erst beim Ansehen. Als Startbild wählt buscosun die Aufnahme mit wenig Wolken und wenig Schnee in der Szene; beide Anteile gelten je Szene, nicht am Gletscher.
        Die Zahlen unten (schneefrei, Schneegrenze) rechnet die Satellitenauswertung aus Sentinel-2-Bändern mit 20 m. {SAT_ATTRIBUTION}. {open}
      </p>
    </>
  );
}
