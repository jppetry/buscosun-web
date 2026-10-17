/**
 * Spot-Dossier — „Satellit · Küste im Zeitverlauf": the last 30 days of Sentinel-2/Landsat scenes around the spot,
 * one 30-m true-colour snapshot per chosen day (NASA GIBS/Worldview, 2× requested like the Brandradar) and the
 * Brandradar's zoomable 10-m viewer for Sentinel-2 days (lazy chunk, loads with the click).
 *
 * The data layer is the Brandradar's (`fire/detail/fireSatImagery.ts`): same STAC search, same snapshot API,
 * same kill switches (`?sat=0`, `?sat10=0`). No fire window here (`firstMs`/`lastMs` = null), so there are no
 * phases — the strip is simply the coast day by day, newest first chosen.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  CLOUD_OK_PCT, cloudLabel, copernicusBrowserUrl, fetchSatImagery, SAT_ATTRIBUTION, SAT_SOURCE_LABEL, sat10Enabled, satLabel,
  snapshotUrl, type SatImagery, type SatScene,
} from '../fire/detail/fireSatImagery';

const FireCogViewer = lazy(() => import('../fire/FireCogViewer'));

type SnapState = { kind: 'img'; url: string } | { kind: 'nodata' } | { kind: 'error' };
const _snaps = new Map<string, Promise<SnapState>>();
const SNAP_CACHE_MAX = 48;

/** Blob fetch instead of a bare `<img src>`: only so is the `Data-Present: false` header readable (named empty state). */
function loadSnapshot(url: string): Promise<SnapState> {
  const hit = _snaps.get(url);
  if (hit) return hit;
  const p = (async (): Promise<SnapState> => {
    try {
      const r = await fetch(url);
      if (!r.ok) return { kind: 'error' };
      if (r.headers.get('Data-Present') === 'false') return { kind: 'nodata' };
      return { kind: 'img', url: URL.createObjectURL(await r.blob()) };
    } catch {
      return { kind: 'error' };
    }
  })();
  p.then((s) => { if (s.kind === 'error') _snaps.delete(url); });
  if (_snaps.size >= SNAP_CACHE_MAX) {
    const [oldKey, oldP] = _snaps.entries().next().value as [string, Promise<SnapState>];
    _snaps.delete(oldKey);
    void oldP.then((s) => { if (s.kind === 'img') URL.revokeObjectURL(s.url); });
  }
  _snaps.set(url, p);
  return p;
}

const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const fmtDayShort = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
/** The fire module's note about the missing fire window does not apply here. */
const isFireNote = (n: string) => n.startsWith('Brandzeitraum');

export default function SeaSatImagery({ lat, lon, name, nowMs }: { lat: number; lon: number; name: string; nowMs: number }) {
  const [im, setIm] = useState<{ kind: 'loading' } | { kind: 'ok'; data: SatImagery }>({ kind: 'loading' });
  const [selDay, setSelDay] = useState<string | null>(null);
  const [snap, setSnap] = useState<SnapState | { kind: 'loading' } | null>(null);
  const [cog10, setCog10] = useState(false);

  useEffect(() => {
    let alive = true;
    setIm({ kind: 'loading' }); setSelDay(null); setSnap(null); setCog10(false);
    void fetchSatImagery(lat, lon, null, null, null, nowMs).then((data) => { if (alive) setIm({ kind: 'ok', data }); });
    return () => { alive = false; };
    // nowMs deliberately not a dependency — a tick does not reload (same as the Brandradar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  const data = im.kind === 'ok' ? im.data : null;
  // Start image: the newest scene that is reasonably cloud-free, else the newest at all.
  const scene: SatScene | null = useMemo(() => {
    if (!data) return null;
    if (selDay) return data.scenes.find((s) => s.dayIso === selDay) ?? null;
    const clear = [...data.scenes].reverse().find((s) => s.cloudPct != null && s.cloudPct <= CLOUD_OK_PCT);
    return clear ?? data.scenes.at(-1) ?? null;
  }, [data, selDay]);

  useEffect(() => {
    if (!data || !scene) { setSnap(null); return; }
    let alive = true;
    setSnap({ kind: 'loading' });
    void loadSnapshot(snapshotUrl(data.bbox, scene.dayIso, scene.sat)).then((s) => { if (alive) setSnap(s); });
    return () => { alive = false; };
  }, [data, scene]);

  // The 10-m view exists only for Sentinel-2 days; it is opened by hand here (the coast has no "scar" to inspect).
  useEffect(() => { if (scene?.sat !== 's2') setCog10(false); }, [scene]);

  if (im.kind === 'loading') return <p className="sw-note">Aufnahmetage für {name} werden gesucht …</p>;
  if (!data || !scene) {
    return (
      <>
        <ul className="sw-sat-notes">{data?.notes.filter((n) => !isFireNote(n)).map((n, i) => <li key={i}>{n}</li>)}</ul>
        <p className="sw-note">{SAT_SOURCE_LABEL}. {SAT_ATTRIBUTION}.</p>
      </>
    );
  }
  const notes = data.notes.filter((n) => !isFireNote(n));

  return (
    <>
      <p className="sw-sat-label">
        <strong>{fmtDay(scene.dayIso)}</strong>
        <span>{cog10 ? 'Sentinel-2, 10 m' : `${satLabel(scene.sat)}, 30 m`}</span>
        <span>{cloudLabel(scene.cloudPct)}</span>
      </p>
      <div className="sw-sat-frame">
        {cog10 && (
          <Suspense fallback={<p className="br-sat-wait br-muted">10-m-Ansicht wird geladen …</p>}>
            <FireCogViewer key={scene.dayIso} lat={lat} lon={lon} dayIso={scene.dayIso} fireStartIso={null}
              fallbackUrl={copernicusBrowserUrl(lat, lon, scene.dayIso)} onClose={() => setCog10(false)} />
          </Suspense>
        )}
        {!cog10 && snap?.kind === 'img' && <img src={snap.url} alt={`Satellitenbild der Küste bei ${name} vom ${fmtDay(scene.dayIso)} (${satLabel(scene.sat)}, Echtfarbe, 30 m)`} />}
        {!cog10 && snap?.kind === 'img' && <span className="sw-sat-pin" aria-hidden="true" />}
        {!cog10 && snap?.kind === 'loading' && <p className="br-sat-wait br-muted">Bild wird geladen …</p>}
        {!cog10 && snap?.kind === 'nodata' && <p className="br-sat-wait br-muted">Für den {fmtDay(scene.dayIso)} liegt noch kein Bild auf dem Bilddienst — frische Aufnahmen brauchen 2–3 Tage Verarbeitung. Anderen Tag wählen.</p>}
        {!cog10 && snap?.kind === 'error' && <p className="br-sat-wait br-muted">Der Bilddienst ist gerade nicht erreichbar — später erneut öffnen.</p>}
      </div>
      {!cog10 && scene.sat === 's2' && sat10Enabled() && (
        <p className="sw-sat-open"><button type="button" className="sw-link" onClick={() => setCog10(true)}>In 10 m ansehen — lädt je nach Zoom ~1–10 MB</button></p>
      )}

      <div className="sw-sat-days" role="group" aria-label="Aufnahmetag wählen">
        {data.scenes.map((s) => (
          <button key={s.dayIso} type="button" className={`sw-sat-day${s.dayIso === scene.dayIso ? ' is-on' : ''}`} aria-pressed={s.dayIso === scene.dayIso}
            title={`${fmtDay(s.dayIso)} · ${satLabel(s.sat)} · ${cloudLabel(s.cloudPct)}`} onClick={() => setSelDay(s.dayIso)}>
            <span>{fmtDayShort(s.dayIso)}</span>
            <span className="sw-sat-day-cloud">{s.cloudPct != null ? `${Math.round(s.cloudPct)} %` : '– %'}</span>
          </button>
        ))}
      </div>
      {notes.length > 0 && <ul className="sw-sat-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <p className="sw-note">
        {SAT_SOURCE_LABEL}, letzte 30 Tage. Der Wolkenanteil gilt je Szene, nicht am Spot; der Punkt markiert den Spot.
        {scene.sat === 'landsat' && sat10Enabled() && ' Die 10-m-Ansicht gibt es nur an Sentinel-2-Tagen (Landsat misst 30 m).'}
        {' '}{SAT_ATTRIBUTION}.{' '}
        <a href={copernicusBrowserUrl(lat, lon, scene.dayIso)} target="_blank" rel="noopener">In 10 m im Copernicus Browser öffnen</a>
      </p>
    </>
  );
}
