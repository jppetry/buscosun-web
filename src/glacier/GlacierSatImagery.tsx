/**
 * Dossier level "Satellit" — the glacier as a zoomable Sentinel-2 true-colour picture in 10 m (Jan, 2026-10-24).
 * The data layer and the viewer are the Brandradar's (`fire/detail/fireSatImagery.ts`, `fire/FireCogViewer.tsx`; same STAC search of the
 * last 30 days, same kill switches `?sat=0` / `?sat10=0`), the day strip is the one of the coast dossier (`sea/SeaSatImagery.tsx`) —
 * but only Sentinel-2 days are offered, because only they carry 10 m (Landsat measures 30 m). The viewer loads its tiles on demand
 * and counts the bytes in its status line. No Sentinel-2 day in the window ⇒ a named empty state with the Copernicus link.
 * The picture is a scene, not a measurement of the glacier: the cloud share is per scene, not at the glacier.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { CLOUD_OK_PCT, cloudLabel, copernicusBrowserUrl, fetchSatImagery, SAT_ATTRIBUTION, sat10Enabled, type SatImagery, type SatScene } from '../fire/detail/fireSatImagery';

const FireCogViewer = lazy(() => import('../fire/FireCogViewer'));

const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const fmtDayShort = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
/** The fire module's note about the missing fire window does not apply here. */
const isFireNote = (n: string) => n.startsWith('Brandzeitraum');

export default function GlacierSatImagery({ lat, lon, name, nowMs }: { lat: number; lon: number; name: string; nowMs: number }) {
  const [im, setIm] = useState<{ kind: 'loading' } | { kind: 'ok'; data: SatImagery }>({ kind: 'loading' });
  const [selDay, setSelDay] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIm({ kind: 'loading' }); setSelDay(null);
    void fetchSatImagery(lat, lon, null, null, null, nowMs).then((data) => { if (alive) setIm({ kind: 'ok', data }); });
    return () => { alive = false; };
    // nowMs deliberately not a dependency — a tick does not reload (same as the Brandradar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  const data = im.kind === 'ok' ? im.data : null;
  const s2 = useMemo<SatScene[]>(() => (data ? data.scenes.filter((s) => s.sat === 's2') : []), [data]);
  // Start picture: the newest Sentinel-2 day that is reasonably cloud-free, else the newest at all.
  const scene: SatScene | null = useMemo(() => {
    if (selDay) return s2.find((s) => s.dayIso === selDay) ?? null;
    const clear = [...s2].reverse().find((s) => s.cloudPct != null && s.cloudPct <= CLOUD_OK_PCT);
    return clear ?? s2.at(-1) ?? null;
  }, [s2, selDay]);

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
      </p>
      <div className="gl-sat-frame">
        <Suspense fallback={<p className="br-sat-wait br-muted">10-m-Ansicht wird geladen …</p>}>
          <FireCogViewer key={scene.dayIso} lat={lat} lon={lon} dayIso={scene.dayIso} fireStartIso={null}
            fallbackUrl={copernicusBrowserUrl(lat, lon, scene.dayIso)} onClose={() => { /* the picture stays: nothing to close here */ }} />
        </Suspense>
      </div>
      <div className="gl-sat-days" role="group" aria-label="Aufnahmetag wählen">
        {s2.map((s) => (
          <button key={s.dayIso} type="button" className={`gl-sat-day${s.dayIso === scene.dayIso ? ' is-on' : ''}`} aria-pressed={s.dayIso === scene.dayIso}
            title={`${fmtDay(s.dayIso)} · Sentinel-2 · ${cloudLabel(s.cloudPct)}`} onClick={() => setSelDay(s.dayIso)}>
            <span>{fmtDayShort(s.dayIso)}</span>
            <span className="gl-sat-day-cloud">{s.cloudPct != null ? `${Math.round(s.cloudPct)} %` : '– %'}</span>
          </button>
        ))}
      </div>
      {notes.length > 0 && <ul className="gl-sat-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <p className="gl-fine">
        Sentinel-2-Szene der letzten 30 Tage in Echtfarbe, 10 m je Bildpunkt; zoombar, Kacheln laden erst beim Ansehen. Der Wolkenanteil gilt je Szene, nicht am Gletscher.
        Die Zahlen unten (schneefrei, Schneegrenze) rechnet die Satellitenauswertung aus Sentinel-2-Bändern mit 20 m. {SAT_ATTRIBUTION}. {open}
      </p>
    </>
  );
}
